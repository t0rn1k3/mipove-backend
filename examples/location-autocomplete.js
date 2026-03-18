/**
 * Location autocomplete helper for master search.
 * Copy this file into your frontend project.
 *
 * Option A: Use our backend proxy (recommended - same origin, no CORS)
 *   API_BASE = "http://localhost:5000"
 *
 * Option B: Call Open-Meteo directly (no backend needed for autocomplete)
 *   useOpenMeteoDirect = true
 */

const DEFAULT_API_BASE = "http://localhost:5000";
const OPEN_METEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Search cities (Open-Meteo Geocoding API)
 * @param {string} query - User input (city name)
 * @param {{ apiBase?: string, count?: number, useOpenMeteoDirect?: boolean }} [opts]
 * @returns {Promise<Array<{ displayName: string, name: string, country: string, countryCode: string, value: string }>>}
 */
export async function searchCities(query, opts = {}) {
  const { apiBase = DEFAULT_API_BASE, count = 10, useOpenMeteoDirect = false } = opts;
  const q = String(query || "").trim();
  if (!q) return [];

  if (useOpenMeteoDirect) {
    const url = `${OPEN_METEO_URL}?name=${encodeURIComponent(q)}&count=${count}`;
    const res = await fetch(url);
    const json = await res.json();
    const results = json.results || [];
    return results.map((r) => ({
      displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      name: r.name,
      country: r.country,
      countryCode: r.country_code || "",
      value: [r.name, r.country].filter(Boolean).join(", "),
    }));
  }

  const url = `${apiBase}/api/geocode/search?q=${encodeURIComponent(q)}&count=${count}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Search failed");
  const data = json.data || [];
  return data.map((r) => ({
    displayName: r.displayName || [r.name, r.country].filter(Boolean).join(", "),
    name: r.name,
    country: r.country,
    countryCode: r.countryCode || "",
    value: [r.name, r.country].filter(Boolean).join(", "),
  }));
}

/**
 * Debounce helper
 */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Vanilla JS: attach autocomplete to an input
 * @param {HTMLInputElement} inputEl
 * @param {((value: string) => void)} onSelect - Called when user selects a city (value = "City, Country")
 * @param {{ apiBase?: string, debounceMs?: number }} [opts]
 */
export function attachLocationAutocomplete(inputEl, onSelect, opts = {}) {
  const { apiBase = DEFAULT_API_BASE, debounceMs = 300 } = opts;
  let dropdown = null;
  let abortController = null;

  const hideDropdown = () => {
    if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    dropdown = null;
  };

  const showSuggestions = (items) => {
    hideDropdown();
    if (!items.length) return;

    dropdown = document.createElement("ul");
    dropdown.className = "location-autocomplete-dropdown";
    dropdown.style.cssText =
      "position:absolute;top:100%;left:0;right:0;margin:0;padding:0;list-style:none;background:#fff;border:1px solid #ccc;border-radius:4px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 6px rgba(0,0,0,0.1);";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item.displayName;
      li.style.cssText = "padding:8px 12px;cursor:pointer;font-size:14px;";
      li.addEventListener("mouseenter", () => (li.style.background = "#f0f0f0"));
      li.addEventListener("mouseleave", () => (li.style.background = ""));
      li.addEventListener("click", () => {
        inputEl.value = item.value;
        hideDropdown();
        onSelect?.(item.value);
      });
      dropdown.appendChild(li);
    });

    const rect = inputEl.getBoundingClientRect();
    const parent = inputEl.offsetParent || document.body;
    dropdown.style.position = "absolute";
    dropdown.style.top = `${inputEl.offsetTop + inputEl.offsetHeight}px`;
    dropdown.style.left = `${inputEl.offsetLeft}px`;
    dropdown.style.minWidth = `${inputEl.offsetWidth}px`;

    parent.appendChild(dropdown);
  };

  const handleInput = debounce(async () => {
    const q = inputEl.value.trim();
    if (!q || q.length < 2) {
      hideDropdown();
      return;
    }
    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
      const items = await searchCities(q, { apiBase });
      showSuggestions(items);
    } catch (err) {
      hideDropdown();
    }
  }, debounceMs);

  inputEl.addEventListener("input", handleInput);
  inputEl.addEventListener("blur", () => setTimeout(hideDropdown, 150));
  inputEl.addEventListener("focus", () => {
    const q = inputEl.value.trim();
    if (q.length >= 2) handleInput();
  });

  return () => {
    hideDropdown();
    inputEl.removeEventListener("input", handleInput);
    inputEl.removeEventListener("blur", hideDropdown);
  };
}

/**
 * React hook example (copy into your React project)
 *
 * import { useState, useCallback } from "react";
 *
 * export function useLocationAutocomplete(apiBase = "http://localhost:5000") {
 *   const [query, setQuery] = useState("");
 *   const [suggestions, setSuggestions] = useState([]);
 *   const [loading, setLoading] = useState(false);
 *
 *   const search = useCallback(
 *     debounce(async (q) => {
 *       if (!q || q.length < 2) return setSuggestions([]);
 *       setLoading(true);
 *       try {
 *         const data = await searchCities(q, { apiBase });
 *         setSuggestions(data);
 *       } finally {
 *         setLoading(false);
 *       }
 *     }, 300),
 *     [apiBase]
 *   );
 *
 *   const onInputChange = (e) => {
 *     const v = e.target.value;
 *     setQuery(v);
 *     search(v);
 *   };
 *
 *   const onSelect = (item) => {
 *     setQuery(item.value);
 *     setSuggestions([]);
 *   };
 *
 *   return { query, setQuery, suggestions, loading, onInputChange, onSelect };
 * }
 *
 * // Usage in JSX:
 * // const { query, setQuery, suggestions, loading, onInputChange, onSelect } = useLocationAutocomplete();
 * // <input value={query} onChange={onInputChange} />
 * // {suggestions.map(s => <div key={s.value} onClick={() => onSelect(s)}>{s.displayName}</div>)}
 * // When submitting search: GET /api/masters?location=${query}
 */
