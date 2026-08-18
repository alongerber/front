/* ============================================================
   api/hook/pay.js — תשלום נכנס
   הכתובת: /api/hook/pay?provider=generic  (או ?provider=paypal)

   משתני סביבה:
     SYNC_TOKEN   — נדרש. ממנו נגזר מפתח ההצפנה של האחסון.
     HOOK_SECRET  — לספק generic: הסוד שממנו מחושבת החתימה.

   ההיגיון ב-lib/hook.js. כאן רק קריאת הגוף הגולמי והחיבור
   לאחסון.
   ============================================================ */

import { handlePayment, CORS } from '../../lib/hook.js';
import { makeStore } from '../../lib/vercel-blob.js';
import { readRaw } from '../../lib/rawbody.js';

// חובה: Vercel מפענח JSON לבד, וזה שובר כל חתימה שמחושבת
// על הגוף הגולמי — רווח אחד שזז והחתימה כבר לא תואמת.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'רק POST' }));

  const secret = process.env.SYNC_TOKEN;
  if (!secret) return res.status(501).send(JSON.stringify({
    error: 'SYNC_TOKEN לא מוגדר',
    hint: 'בלעדיו אין לאן לכתוב — התיבה יושבת באותו אחסון מוצפן של הסנכרון.'
  }));

  let raw;
  try { raw = await readRaw(req); }
  catch (e) { return res.status(400).send(JSON.stringify({ error: 'לא הצלחתי לקרוא את הגוף', hint: e && e.message })); }

  let store;
  try { store = await makeStore(secret); }
  catch (e) { return res.status(503).send(JSON.stringify({ error: 'האחסון לא זמין', hint: e && e.message })); }

  const url = new URL(req.url, 'http://x');
  const { status, body } = await handlePayment({
    raw, headers: req.headers,
    query: Object.fromEntries(url.searchParams),
    env: process.env, store
  });
  return res.status(status).send(JSON.stringify(body));
}
