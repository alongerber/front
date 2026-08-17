/* ============================================================
   sync.js — הסנכרון, בגרסת Netlify (Functions v2)
   הכתובת: /.netlify/functions/sync
   ההיגיון עצמו יושב ב-lib/sync.js ומשותף עם גרסת Vercel.

   האחסון: Netlify Blobs. אין מה להקים ואין מה לתחזק — הוא זמין
   לכל אתר בנטליפיי, ומצב בגודל עשרות קילובייטים נכנס בחינם.

   שתי הגדרות באתר → Site configuration → Environment variables:
     SYNC_TOKEN — סוד שרק המכשירים שלך יודעים. בלעדיו הפונקציה
                  מסרבת לעבוד. תייצר מחרוזת אקראית ארוכה.
   אחרי ההוספה צריך Deploy מחדש.
   ============================================================ */

import { runSync, CORS } from '../../lib/sync.js';

const STORE = 'front-sync';
const KEY = 'state';

async function makeStore() {
  // ייבוא דינמי: אם החבילה חסרה, נחזיר שגיאה מובנת ולא קריסה
  const { getStore } = await import('@netlify/blobs');
  const s = getStore(STORE);
  return {
    async get() { return await s.get(KEY, { type: 'json' }); },
    async set(doc) { await s.setJSON(KEY, doc); }
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  let raw = null;
  if (req.method === 'POST') {
    try { raw = await req.text(); } catch { raw = null; }
  }

  let store;
  try {
    store = await makeStore();
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'האחסון לא זמין',
      hint: 'Netlify Blobs לא נטען: ' + (e && e.message) +
        '. ודא ש-@netlify/blobs מותקן ושהאתר פורסם מחדש.'
    }), { status: 503, headers: CORS });
  }

  const { status, body } = await runSync({
    method: req.method,
    body: raw,
    token: req.headers.get('x-sync-token'),
    secret: process.env.SYNC_TOKEN,
    store
  });

  return new Response(body === null ? null : JSON.stringify(body), { status, headers: CORS });
};
