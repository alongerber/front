/* ============================================================
   assistant.js — העוזר, בגרסת Netlify (Functions v2)
   הכתובת: /.netlify/functions/assistant
   ההיגיון עצמו יושב ב-lib/assistant.js ומשותף עם גרסת Vercel.

   המפתח: Netlify → Site configuration → Environment variables →
   ANTHROPIC_API_KEY. אחרי ההוספה צריך Deploy מחדש.
   ============================================================ */

import { runAssistant, CORS } from '../../lib/assistant.js';

export default async (req) => {
  let raw = null;
  if (req.method === 'POST') {
    try { raw = await req.text(); } catch { raw = null; }
  }

  const { status, body } = await runAssistant({ method: req.method, body: raw });

  // 204 חייב גוף ריק (null) — מחרוזת ריקה זורקת שגיאה ב-Node
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: CORS });
};
