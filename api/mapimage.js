export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { lat, lng, zoom = '18' } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  // Satellite view with ALL text labels hidden — players can't read the business name
  const styles = [
    'feature:all|element:labels|visibility:off',
    'feature:road|element:geometry|color:0x333333',
  ].map(s => `&style=${encodeURIComponent(s)}`).join('');

  const mapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=640x360` +
    `&scale=2` +
    `&maptype=satellite` +
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
