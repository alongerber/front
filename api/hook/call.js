/* ============================================================
   api/hook/call.js — סוף שיחה מ-ElevenLabs
   הכתובת: /api/hook/call

   משתני סביבה:
     SYNC_TOKEN                  — נדרש, כמו בכל כתיבה לאחסון
     ELEVENLABS_WEBHOOK_SECRET   — הסוד שממנו מחושבת החתימה
     BRIEF_AGENT_ID              — סוכנת האפיון
     SALES_AGENT_ID              — סוכנת המכירות

   כל agent_id אחר נכנס לתיבה כ"לא הבנתי" ולא נזרק. הסוכנות
   ישתנו, ושיחה שאבדה בשקט גרועה משורה בתיבה.
   ============================================================ */

import { handleCall, CORS } from '../../lib/hook.js';
import { makeStore } from '../../lib/vercel-blob.js';
import { readRaw } from '../../lib/rawbody.js';

// הגוף הגולמי הוא מה שהחתימה מחושבת עליו. ראה api/hook/pay.js.
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

  const { status, body } = await handleCall({ raw, headers: req.headers, env: process.env, store });
  return res.status(status).send(JSON.stringify(body));
}
