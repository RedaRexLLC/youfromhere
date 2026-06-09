// Room management for multiplayer
const SB_URL = process.env.SUPABASE_URL || 'https://mukasqppyafjdhujoapl.supabase.co';
const SB_KEY = process.env.SUPABASE_SECRET_KEY;

function sbHeaders() {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res) {
  if (!SB_KEY) return res.status(503).json({ error: 'Not configured' });

  // GET — fetch room state by code
  if (req.method === 'GET') {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code required' });
    const r = await fetch(`${SB_URL}/rest/v1/game_rooms?code=eq.${code.toUpperCase()}&limit=1`, { headers: sbHeaders() });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: 'Room not found' });
    const room = rows[0];
    // Check expiry
    if (new Date(room.expires_at) < new Date()) return res.status(410).json({ error: 'Room expired' });
    return res.status(200).json(room);
  }

  // POST — create a new room
  if (req.method === 'POST') {
    const { host_name, game_mode, location, location_label, categories } = req.body;
    if (!host_name) return res.status(400).json({ error: 'host_name required' });

    // Generate unique code
    let code, attempts = 0;
    while (attempts < 10) {
      code = makeCode();
      const check = await fetch(`${SB_URL}/rest/v1/game_rooms?code=eq.${code}&limit=1`, { headers: sbHeaders() });
      const existing = await check.json();
      if (!existing.length) break;
      attempts++;
    }

    const hostId = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6 hours

    const state = {
      phase: 'lobby',
      players: [{ id: hostId, name: host_name, score: 0, isHost: true, connected: true }],
      current_player_index: 0,
      game_mode: game_mode || 'local',
      location: location || '',
      location_label: location_label || '',
      categories: categories || [],
      board: null, // populated when game starts
      current_question: null,
      current_category: null,
      current_points: null,
      answered: false,
      last_answer: null,
    };

    const r = await fetch(`${SB_URL}/rest/v1/game_rooms`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ code, host_id: hostId, state, expires_at }),
    });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return res.status(500).json({ error: 'Failed to create room' });
    return res.status(200).json({ ...rows[0], player_id: hostId });
  }

  // PATCH — update room state (any player can call this)
  if (req.method === 'PATCH') {
    const { code, state, player_id } = req.body;
    if (!code || !state) return res.status(400).json({ error: 'code and state required' });

    // Fetch current room first to validate
    const check = await fetch(`${SB_URL}/rest/v1/game_rooms?code=eq.${code.toUpperCase()}&limit=1`, { headers: sbHeaders() });
    const rows = await check.json();
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: 'Room not found' });
    if (new Date(rows[0].expires_at) < new Date()) return res.status(410).json({ error: 'Room expired' });

    const r = await fetch(`${SB_URL}/rest/v1/game_rooms?code=eq.${code.toUpperCase()}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ state, updated_at: new Date().toISOString() }),
    });
    const updated = await r.json();
    return res.status(200).json(Array.isArray(updated) ? updated[0] : updated);
  }

  // DELETE — close room
  if (req.method === 'DELETE') {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code required' });
    await fetch(`${SB_URL}/rest/v1/game_rooms?code=eq.${code.toUpperCase()}`, { method: 'DELETE', headers: sbHeaders() });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
