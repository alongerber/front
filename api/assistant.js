/* ============================================================
   api/assistant.js — העוזר, בגרסת Vercel
   הכתובת: /api/assistant
   ההיגיון עצמו יושב ב-lib/assistant.js ומשותף עם גרסת Netlify.

   המפתח: Vercel → Project → Settings → Environment Variables →
   ANTHROPIC_API_KEY. אחרי ההוספה צריך Redeploy.
   ============================================================ */

import { runAssistant, CORS } from '../lib/assistant.js';

export default async function handler(req, res) {
  // Vercel כבר מפענח JSON כשה-content-type מתאים; אם לא, runAssistant יפענח.
  const { status, body } = await runAssistant({ method: req.method, body: req.body });

  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);

  if (body === null) return res.status(status).end();
  return res.status(status).send(JSON.stringify(body));
}
