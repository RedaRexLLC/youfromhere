export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { lat, lng, zoom = '18' } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

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
