/* ============================================================
   vercel-blob.js — האחסון המוצפן, במקום אחד
   ------------------------------------------------------------
   היה בתוך api/sync.js. עבר לכאן ברגע שגם ה-webhooks נזקקו לו:
   שתי מימושים של אותה הצפנה הם הדרך הבטוחה ביותר לגלות בעוד
   חודש שאחד מהם כותב משהו שהשני לא יודע לקרוא.

   למה בכלל הצפנה: Netlify Blobs הוא אחסון פרטי. ב-Vercel Blob
   הקובץ יושב בכתובת שאי אפשר לנחש — אבל היא ציבורית. זה לא
   מספיק בשביל כל הנתונים של העסק, ולכן מה שנכתב מוצפן
   ב-AES-256-GCM במפתח שנגזר מ-SYNC_TOKEN.

   מחיר: החלפת SYNC_TOKEN הופכת את מה שנשמר לבלתי קריא. זה לא
   אובדן — כל מכשיר מחזיק את המצב המלא מקומית ודוחף מחדש.
   ============================================================ */

import crypto from 'node:crypto';

export const BLOB_NAME = 'front-sync/state.bin';
const ALG = 'aes-256-gcm';

const keyFrom = secret =>
  crypto.createHash('sha256').update('front-sync:' + secret).digest();

export function seal(obj, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALG, keyFrom(secret), iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  // iv | tag | ciphertext
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function open(buf, secret) {
  const b = Buffer.from(buf);
  if (b.length < 29) return null;
  const d = crypto.createDecipheriv(ALG, keyFrom(secret), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  const json = Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  return JSON.parse(json);
}

/** {get, set} מעל Vercel Blob, מוצפן */
export async function makeStore(secret) {
  const { put, list } = await import('@vercel/blob');
  return {
    async get() {
      const { blobs } = await list({ prefix: BLOB_NAME, limit: 1 });
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
      await put(BLOB_NAME, seal(doc, secret), {
        access: 'public',              // הכתובת אקראית, והתוכן מוצפן
        contentType: 'application/octet-stream',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0
      });
    }
  };
}
