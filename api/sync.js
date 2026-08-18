/* ============================================================
   api/sync.js — הסנכרון, בגרסת Vercel
   הכתובת: /api/sync
   ההיגיון עצמו יושב ב-lib/sync.js ומשותף עם גרסת Netlify,
   והאחסון המוצפן ב-lib/vercel-blob.js ומשותף עם ה-webhooks.

   שתי הגדרות ב-Project → Settings → Environment Variables:
     SYNC_TOKEN            — הסוד שרק המכשירים שלך יודעים
     BLOB_READ_WRITE_TOKEN — נוצר לבד כשמחברים Vercel Blob לפרויקט
   ============================================================ */

import { runSync, CORS } from '../lib/sync.js';
import { makeStore, seal, open } from '../lib/vercel-blob.js';

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.SYNC_TOKEN;

  /* בלי הסוד אין ממה לגזור מפתח, ואין מה לאמת. עונים לפני שנוגעים
     באחסון, כדי שההסבר יהיה על מה שחסר באמת. */
  if (!secret) {
    const { status, body } = await runSync({ method: req.method, body: req.body, token: null, secret: '', store: null });
    return res.status(status).send(JSON.stringify(body));
  }

  let store;
  try {
    store = await makeStore(secret);
  } catch (e) {
    return res.status(503).send(JSON.stringify({
      error: 'האחסון לא זמין',
      hint: 'Vercel Blob לא נטען: ' + (e && e.message) +
        '. ב-Vercel: Storage → Create Database → Blob → לחבר לפרויקט. ' +
        'זה יוצר את BLOB_READ_WRITE_TOKEN לבד. אחרי זה צריך Redeploy.'
    }));
  }

  const { status, body } = await runSync({
    method: req.method,
    body: req.body,
    token: req.headers['x-sync-token'],
    secret,
    store
  });

  if (body === null) return res.status(status).end();
  return res.status(status).send(JSON.stringify(body));
}

// נחוץ לבדיקות
export const _internals = { seal, open };
