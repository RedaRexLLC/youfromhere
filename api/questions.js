export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://mukasqppyafjdhujoapl.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const { saveQuestions, fetchQuestions, ...anthropicBody } = req.body;

  // FETCH questions from database
  if (fetchQuestions) {
    const { location, difficulty, limit = 10 } = req.body;
    const url = `${SUPABASE_URL}/rest/v1/questions?location=eq.${encodeURIComponent(location)}&difficulty=eq.${difficulty}&order=times_used.asc&limit=${limit}`;
    const r = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const data = await r.json();
    return res.status(200).json({ questions: data });
  }

  // SAVE questions to database
  if (saveQuestions) {
    const { questions, location, game_mode } = req.body;
    const rows = questions.map(q => ({
      location,
      game_mode,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      type: q.type,
      question: q.question,
      options: q.options || null,
      answer: q.answer,
      explanation: q.explanation || '',
      surprising: q.surprising || false
    }));
    await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(rows)
    });
    return res.status(200).json({ saved: rows.length });
  }

  // GENERATE questions via Claude
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_KEY,
      },
      body: JSON.stringify(anthropicBody),
    });
    const data = await response.json();
    res.status(re
