const asyncHandler = require("express-async-handler");

const OPEN_METEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Proxy to Open-Meteo Geocoding API for city autocomplete
 * @route   GET /api/geocode/search
 * @query   q (required), count (optional, default 10)
 * @access  Public
 */
const searchCities = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.json({ success: true, data: [] });
  }

  const count = Math.min(parseInt(req.query.count, 10) || 10, 20);
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("name", q);
  url.searchParams.set("count", count);
  url.searchParams.set("language", "en");

  const fetchRes = await fetch(url.toString());
  const json = await fetchRes.json();

  if (!fetchRes.ok) {
    const err = new Error(json?.reason || "Geocoding request failed");
    err.statusCode = fetchRes.status;
    throw err;
  }

  const results = (json.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    countryCode: r.country_code,
    admin1: r.admin1 || "",
    latitude: r.latitude,
    longitude: r.longitude,
    displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
  }));

  res.json({
    success: true,
    data: results,
  });
});

module.exports = { searchCities };
