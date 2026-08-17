/* ============================================================
   api/sync.js — הסנכרון, בגרסת Vercel
   הכתובת: /api/sync
   ההיגיון עצמו יושב ב-lib/sync.js ומשותף עם גרסת Netlify.

   שתי הגדרות ב-Project → Settings → Environment Variables:
     SYNC_TOKEN            — הסוד שרק המכשירים שלך יודעים
     BLOB_READ_WRITE_TOKEN — נוצר לבד כשמחברים Vercel Blob לפרויקט

   ------------------------------------------------------------
   למה יש כאן הצפנה ובגרסת נטליפיי אין:
   Netlify Blobs הוא אחסון פרטי. ב-Vercel Blob הקובץ יושב בכתובת
   שאי אפשר לנחש — אבל היא ציבורית. זה לא מספיק בשביל כל הנתונים
   של העסק, ולכן מה שנכתב שם מוצפן (AES-256-GCM) במפתח שנגזר
   מ-SYNC_TOKEN. הטוקן יושב רק במשתני הסביבה, אז מי שמצא את
   הכתובת מקבל רעש.

   מחיר: אם תחליף את SYNC_TOKEN, מה שכבר נשמר לא ייקרא. זה לא
   אובדן — כל מכשיר מחזיק את המצב המלא מקומית ודוחף אותו מחדש.
   ============================================================ */

import crypto from 'node:crypto';
import { runSync, CORS } from '../lib/sync.js';

const NAME = 'front-sync/state.bin';
const ALG = 'aes-256-gcm';

const keyFrom = secret =>
  crypto.createHash('sha256').update('front-sync:' + secret).digest();

function seal(obj, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALG, keyFrom(secret), iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  // iv | tag | ciphertext
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

function open(buf, secret) {
  const b = Buffer.from(buf);
  if (b.length < 29) return null;
  const d = crypto.createDecipheriv(ALG, keyFrom(secret), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  const json = Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  return JSON.parse(json);
}

async function makeStore(secret) {
  const { put, list } = await import('@vercel/blob');
  return {
    async get() {
      const { blobs } = await list({ prefix: NAME, limit: 1 });
      if (!blobs.length) return null;
      const r = await fetch(blobs[0].url, { cache: 'no-store' });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      try {
        return open(buf, secret);
      } catch {
        /* טוקן שהוחלף, או קובץ פגום. מתייחסים לזה כ"ריק" ולא
           קורסים — הסנכרון הבא יכתוב מצב שלם מחדש מהמכשיר. */
        return null;
      }
    },
    async set(doc) {
      await put(NAME, seal(doc, secret), {
        access: 'public',              // הכתובת אקראית, והתוכן מוצפן
        contentType: 'application/octet-stream',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0
      });
    }
  };
}

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
