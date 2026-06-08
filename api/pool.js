const SB_URL = process.env.SUPABASE_URL || 'https://mukasqppyafjdhujoapl.supabase.co';
const SB_KEY = process.env.SUPABASE_SECRET_KEY;

function sbHeaders() {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  if (!SB_KEY) return res.status(503).json({ error: 'Supabase not configured' });

  // GET — fetch question pool for a location + game_mode + category
  if (req.method === 'GET') {
    const { location, game_mode, category } = req.query;
    if (!location || !game_mode || !category) return res.status(400).json({ error: 'location, game_mode, category required' });

    try {
      const params = new URLSearchParams({
        location: `eq.${location}`,
        game_mode: `eq.${game_mode}`,
        category: `eq.${category}`,
        active: 'eq.true',
        pending: 'eq.false',
        select: '*',
        order: 'play_count.asc,created_at.desc',
        limit: '120',
      });
      // exclude flagged
      const url = `${SB_URL}/rest/v1/questions?${params}&flagged=eq.false`;
      const r = await fetch(url, { headers: sbHeaders() });
      const data = await r.json();
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — save newly generated questions to the pool
  if (req.method === 'POST') {
    const { questions } = req.body;
    if (!Array.isArray(questions) || !questions.length) return res.status(400).json({ error: 'questions array required' });

    const sixMonths = new Date(Date.now() + 183 * 24 * 60 * 60 * 1000).toISOString();

    const rows = questions.map(q => ({
      location: q.location,
      game_mode: q.game_mode,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      type: q.type,
      question: q.question,
      options: q.options ? JSON.stringify(q.options) : null,
      answer: q.answer,
      explanation: q.explanation || '',
      surprising: !!q.surprising,
      pending: false,
      flagged: false,
      active: true,
      source: 'claude',
      play_count: 0,
      review_due_at: sixMonths,
      // mapview fields
      lat: q.lat || null,
      lng: q.lng || null,
      zoom: q.zoom || null,
      intersection: q.intersection || null,
      mapview_hint: q.mapviewHint || null,
      // photo fields
      place_name: q.placeName || null,
      wiki_title: q.wikiTitle || null,
    }));

    try {
      const r = await fetch(`${SB_URL}/rest/v1/questions`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: 'Insert failed', detail: txt });
      }
      return res.status(200).json({ saved: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — increment play_count for a list of question ids
  if (req.method === 'PATCH') {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
    try {
      await Promise.all(ids.map(id =>
        fetch(`${SB_URL}/rest/v1/rpc/increment_play_count`, {
          method: 'POST',
          headers: sbHeaders(),
          body: JSON.stringify({ row_id: id }),
        })
      ));
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
