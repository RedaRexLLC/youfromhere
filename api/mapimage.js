export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { intersection } = req.query;
  let { lat, lng, zoom = '17' } = req.query;
  let geocoded = false;

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  // If an intersection string is provided, geocode it for accurate coordinates
  if (intersection) {
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(intersection)}&key=${key}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      const loc = geoData.results?.[0]?.geometry?.location;
      if (loc) {
        lat = loc.lat;
        lng = loc.lng;
        geocoded = true;
      }
    } catch (_) {
      // Fall through to use Claude's lat/lng
    }
    // If geocoding failed, zoom out to show more context so the intersection is likely in frame
    if (!geocoded) zoom = Math.max(14, parseInt(zoom) - 2);
  }

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  // Hybrid view (satellite + road overlays) with business/POI labels hidden
  // Street names and roads remain visible for orientation; business names hidden so players must guess
  const styles = [
    'feature:poi|element:labels|visibility:off',
    'feature:poi.business|element:labels|visibility:off',
    'feature:transit|element:labels.text|visibility:off',
  ].map(s => `&style=${encodeURIComponent(s)}`).join('');

  const mapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=640x360` +
    `&scale=2` +
    `&maptype=hybrid` +
    `&key=${key}` +
    styles;

  try {
    const r = await fetch(mapUrl);
    if (!r.ok) return res.status(r.status).json({ error: 'Maps API error' });
    const buf = await r.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
