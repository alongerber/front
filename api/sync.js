/* ============================================================
   api/sync.js — הסנכרון, בגרסת Vercel
   הכתובת: /api/sync
   ההיגיון עצמו יושב ב-lib/sync.js ומשותף עם גרסת Netlify.

   בניגוד לנטליפיי, ב-Vercel אין אחסון שמגיע מעצמו — צריך להוסיף
   Vercel Blob לפרויקט, וזה נותן BLOB_READ_WRITE_TOKEN.

   שתי הגדרות ב-Project → Settings → Environment Variables:
     SYNC_TOKEN            — הסוד שרק המכשירים שלך יודעים
     BLOB_READ_WRITE_TOKEN — נוצר לבד כשמחברים Vercel Blob
   אחרי ההוספה צריך Redeploy.

   אם אתה על נטליפיי — הקובץ הזה פשוט לא בשימוש.
   ============================================================ */

import { runSync, CORS } from '../lib/sync.js';

const NAME = 'front-sync/state.json';

async function makeStore() {
  const { put, list } = await import('@vercel/blob');
  return {
    async get() {
      const { blobs } = await list({ prefix: NAME, limit: 1 });
      if (!blobs.length) return null;
      const r = await fetch(blobs[0].url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    },
    async set(doc) {
      await put(NAME, JSON.stringify(doc), {
        access: 'public',              // ה-URL אקראי ולא ניתן לנחש; הכתיבה מוגנת בטוקן
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true
      });
    }
  };
}

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();

  let store;
  try {
    store = await makeStore();
  } catch (e) {
    return res.status(503).send(JSON.stringify({
      error: 'האחסון לא זמין',
      hint: 'Vercel Blob לא נטען: ' + (e && e.message) +
        '. צריך להוסיף Vercel Blob לפרויקט ולהתקין @vercel/blob.'
    }));
  }

  const { status, body } = await runSync({
    method: req.method,
    body: req.body,
    token: req.headers['x-sync-token'],
    secret: process.env.SYNC_TOKEN,
    store
  });

  if (body === null) return res.status(status).end();
  return res.status(status).send(JSON.stringify(body));
}
