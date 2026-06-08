// Called daily by Vercel cron — reviews questions due for Claude fact-check
const SB_URL = process.env.SUPABASE_URL || 'https://mukasqppyafjdhujoapl.supabase.co';
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 20;

function sbHeaders() {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  if (!SB_KEY || !ANTHROPIC_KEY) return res.status(503).json({ error: 'Not configured' });

  try {
    // Fetch questions due for review (review_due_at in the past)
    const now = new Date().toISOString();
    const url = `${SB_URL}/rest/v1/questions?active=eq.true&pending=eq.false&flagged=eq.false&review_due_at=lt.${encodeURIComponent(now)}&select=id,question,answer,explanation,type,location,game_mode&limit=${BATCH_SIZE}`;
    const r = await fetch(url, { headers: sbHeaders() });
    const questions = await r.json();

    if (!Array.isArray(questions) || !questions.length) {
      return res.status(200).json({ reviewed: 0, message: 'No questions due for review' });
    }

    // Send to Claude for fact-checking
    const prompt = `You are a fact-checker for a trivia game. Review each question below and determine if it is still accurate and up to date. For each question respond with one of:
- VALID: still accurate, no changes needed
- UPDATE: still usable but needs a correction — provide updated question/answer/explanation
- RETIRE: factually wrong, outdated, or the subject no longer exists — should be removed

Questions to review:
${questions.map((q, i) => `${i + 1}. [ID:${q.id}] Q: ${q.question} | A: ${q.answer} | Explanation: ${q.explanation}`).join('\n')}

Respond ONLY with raw JSON:
{"results":[{"id":"<uuid>","status":"VALID|UPDATE|RETIRE","question":"updated q or null","answer":"updated answer or null","explanation":"updated explanation or null"}]}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Claude returned no JSON', raw });

    const { results } = JSON.parse(jsonMatch[0]);
    const sixMonths = new Date(Date.now() + 183 * 24 * 60 * 60 * 1000).toISOString();
    const now2 = new Date().toISOString();

    let updated = 0, retired = 0, valid = 0;

    await Promise.all(results.map(async result => {
      if (result.status === 'RETIRE') {
        // Mark inactive for admin review rather than hard delete
        await fetch(`${SB_URL}/rest/v1/questions?id=eq.${result.id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ active: false, flagged: true, last_reviewed_at: now2 }),
        });
        retired++;
      } else if (result.status === 'UPDATE') {
        const patch = { last_reviewed_at: now2, review_due_at: sixMonths };
        if (result.question) patch.question = result.question;
        if (result.answer) patch.answer = result.answer;
        if (result.explanation) patch.explanation = result.explanation;
        await fetch(`${SB_URL}/rest/v1/questions?id=eq.${result.id}`, {
          method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch),
        });
        updated++;
      } else {
        // VALID — reset the review clock
        await fetch(`${SB_URL}/rest/v1/questions?id=eq.${result.id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ last_reviewed_at: now2, review_due_at: sixMonths }),
        });
        valid++;
      }
    }));

    return res.status(200).json({ reviewed: results.length, valid, updated, retired });
  } catch (err) {
    console.error('review error', err);
    return res.status(500).json({ error: err.message });
  }
}
