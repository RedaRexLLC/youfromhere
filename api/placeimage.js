export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { name, location } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(503).json({ error: 'Maps not configured' });

  try {
    // 1. Find the place via Text Search
    const query = location ? `${name} ${location}` : name;
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const placeId = searchData.results?.[0]?.place_id;
    if (!placeId) return res.status(404).json({ error: 'Place not found' });

    // 2. Get place photos
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,name&key=${key}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const photos = detailsData.result?.photos;
    if (!photos?.length) return res.status(404).json({ error: 'No photos found' });

    // Pick a random photo from the first 5 for variety
    const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 5))];
    const photoRef = photo.photo_reference;

    // 3. Proxy the photo image (keeps API key server-side)
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${key}`;
    const photoRes = await fetch(photoUrl);
    if (!photoRes.ok) return res.status(404).json({ error: 'Photo fetch failed' });

    const buf = await photoRes.arrayBuffer();
    res.setHeader('Content-Type', photoRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('placeimage error:', err);
    res.status(500).json({ error: err.message });
  }
}
