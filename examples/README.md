# Location Autocomplete Example

Copy `location-autocomplete.js` into your frontend project.

## Backend API

- **GET /api/geocode/search?q=tbilisi&count=10** – City search (proxies Open-Meteo)
- **GET /api/masters?location=Tbilisi&specialty=...&search=...** – Filter masters by location

## Frontend Usage

### Vanilla JS

```html
<input id="location" type="text" placeholder="City or country" />
<script type="module">
  import { attachLocationAutocomplete } from "./location-autocomplete.js";

  const input = document.getElementById("location");
  attachLocationAutocomplete(input, (value) => {
    console.log("Selected:", value);
    // Fetch masters: GET /api/masters?location=${encodeURIComponent(value)}
  });
</script>
```

### React

Use the `useLocationAutocomplete` hook shown in the comments inside `location-autocomplete.js`, or call `searchCities(query, { apiBase })` inside your own `useEffect`/`useCallback`.

### Masters Search Request

When the user selects a city or submits the form:

```js
const location = "Tbilisi, Georgia"; // from autocomplete or input
const res = await fetch(
  `${API_BASE}/api/masters?location=${encodeURIComponent(location)}`
);
const { data } = await res.json();
```

## Master Profile: Setting Location

When a master updates their profile, they should set `location` to the `value` from the autocomplete (e.g. "Tbilisi, Georgia") so filtering works correctly.
