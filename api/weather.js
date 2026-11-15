// Vercel serverless function that proxies WeatherAPI.com so the API key stays
// on the server and is never shipped to the browser. Configure the key as the
// WEATHERAPI_KEY environment variable on the Vercel project.

const WEATHER_API_BASE = 'https://api.weatherapi.com/v1/current.json';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Method not allowed.' } });
  }

  const city = String((req.query && req.query.city) || '').trim();
  if (!city) {
    // 1003 mirrors WeatherAPI's "no query supplied" error code.
    return res.status(400).json({ error: { code: 1003, message: 'Please provide a city to search for.' } });
  }

  const apiKey = process.env.WEATHERAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'Weather service is not configured (missing API key).' } });
  }

  const url = `${WEATHER_API_BASE}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(city)}&aqi=no`;

  try {
    const upstream = await fetch(url);
    const body = await upstream.json();

    if (!upstream.ok) {
      // Forward the provider's error shape (e.g. code 1006 = no matching location).
      return res.status(upstream.status).json(body);
    }

    // Cache successful lookups at the edge for 5 minutes to conserve the API plan.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({ error: { message: 'Failed to reach the weather provider.' } });
  }
};
