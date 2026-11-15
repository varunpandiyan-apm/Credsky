# SKYCRED – Live Weather

A city-based weather application: search for any city and see its current weather conditions and key measurements at a glance.

## Features

- **City search** — type any city name and hit Search (or press Enter).
- **Popular city shortcuts** — one-click chips for Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, New York and London.
- **Location details** — city, region/country and local time.
- **Current conditions** — temperature (°C), condition text and feels-like temperature.
- **Weather insight card** — a short contextual label + guidance message (e.g. "Warm & Sunny — pleasant warmth, light layers work"). Condition text takes priority over temperature, so hazy/smoky conditions are reported as haze rather than mislabelled as sunny.
- **Key metrics** — humidity, wind speed (kph) and UV index (with exposure band).
- **JSON inspector** — Formatted / Raw JSON tabs with a Copy action (useful for debugging).
- **Clear states** — loading, city-not-found, API errors, network failures and empty input are all handled, with stale results never overwriting a newer search.

## Architecture

- `index.html`, `styles.css`, `app.js` — static frontend (no build step, no framework).
- `api/weather.js` — a Vercel serverless function that proxies [WeatherAPI.com](https://www.weatherapi.com/)'s `current.json` endpoint.

### API key protection

The WeatherAPI key is **never shipped to the browser**. It is stored as the
`WEATHERAPI_KEY` environment variable on the Vercel project and read only inside
the serverless function. Successful lookups are edge-cached for 5 minutes to
conserve the API plan.

## Running locally

```bash
npm i -g vercel    # once
vercel dev         # serve locally; add WEATHERAPI_KEY to .env first
```

## Deployment

Deployed on Vercel. To point the project at a new key:

```bash
vercel env add WEATHERAPI_KEY production
vercel deploy --prod
```
