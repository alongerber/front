/* ============================================================
   sync.js — ליבת הסנכרון, משותפת ל-Netlify ול-Vercel
   ------------------------------------------------------------
   המקום היחיד שבו הנתונים יושבים מחוץ לדפדפן.

   למה סנכרון מצב מלא ולא "רק מה שהשתנה":
   כל המצב של אלון הוא עשרות קילובייטים. שליחה מלאה בכל סנכרון
   מייקרת כמעט כלום, ובתמורה נעלמת כל משפחת הבאגים של סמנים —
   אין "מאיפה המשכתי", אין מה לאבד אם בקשה נפלה, וכל סנכרון
   מאשר מחדש את הכל. שני מכשירים שדוחפים באותו רגע מתמזגים
   במקום לדרוס.

   פתרון התנגשויות: לכל רשומה בנפרד, מי שעודכן אחרון מנצח.
   מחיקות: מצבות (tombstones) — {id: מתי נמחק}. מחיקה מנצחת רק
   אם היא מאוחרת מהעדכון האחרון של הרשומה, כדי שעריכה אחרי
   מחיקה במכשיר אחר לא תיעלם.

   אימות: SYNC_TOKEN במשתני הסביבה. בלעדיו הפונקציה מסרבת
   לעבוד — נקודת קצה פתוחה שכותבת נתונים היא לא ברירת מחדל.
   ============================================================ */

export const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/** האוספים שמסונכרנים. כל אחד מערך של רשומות עם id. */
export const COLLECTIONS = [
  'items', 'timeEntries', 'samples', 'noteTags', 'savedViews',
  'reviews', 'subscriptions', 'ledger', 'links', 'productLines'
];

const DAY = 86400000;
const TOMB_TTL = 90 * DAY;          // מצבה נשמרת שלושה חודשים ואז מתנקה
const MAX_BYTES = 8 * 1024 * 1024;  // בלם: מצב תקין הוא עשרות קילובייטים

const stampOf = r =>
  r.updatedAt || r.deliveredAt || r.createdAt || r.at || r.start || 0;

const emptyDoc = () => ({
  rev: 0,
  updatedAt: 0,
  settings: {},
  deleted: {},
  ...Object.fromEntries(COLLECTIONS.map(k => [k, []]))
});

/* ---------- מיזוג ---------- */

/** ממזג צד אחד לתוך הצד השני. לא משנה את הקלט. מחזיר מסמך חדש. */
export function mergeDoc(base, incoming, now) {
  const out = Object.assign(emptyDoc(), base);

  // מצבות: איחוד, והמאוחרת מנצחת
  out.deleted = Object.assign({}, base.deleted || {});
  for (const [id, ts] of Object.entries(incoming.deleted || {})) {
    if (!out.deleted[id] || ts > out.deleted[id]) out.deleted[id] = ts;
  }

  COLLECTIONS.forEach(key => {
    const mine = Array.isArray(base[key]) ? base[key] : [];
    const theirs = Array.isArray(incoming[key]) ? incoming[key] : [];
    const byId = new Map();
    mine.forEach(r => r && r.id && byId.set(r.id, r));
    theirs.forEach(r => {
      if (!r || !r.id) return;
      const cur = byId.get(r.id);
      if (!cur || stampOf(r) > stampOf(cur)) byId.set(r.id, r);
    });
    // רשומה שיש עליה מצבה מאוחרת מהעדכון שלה — יוצאת
    out[key] = Array.from(byId.values())
      .filter(r => !(out.deleted[r.id] > stampOf(r)));
  });

  // הגדרות משותפות: אובייקט שטוח, מי שנשלח אחרון מנצח לפי חותמת
  const inSet = incoming.settings || {};
  const inAt = incoming.settingsAt || 0;
  out.settings = Object.assign({}, base.settings || {});
  if (inAt >= (base.settingsAt || 0)) {
    out.settings = Object.assign(out.settings, inSet);
    out.settingsAt = inAt;
  } else {
    out.settingsAt = base.settingsAt || 0;
  }

  // ניקוי מצבות ישנות, כדי שהמסמך לא יתפח לנצח
  for (const [id, ts] of Object.entries(out.deleted)) {
    if (now - ts > TOMB_TTL) delete out.deleted[id];
  }

  out.rev = (base.rev || 0) + 1;
  out.updatedAt = now;
  return out;
}

/* ---------- הבקשה ---------- */

/**
 * @param store {{ get(): Promise<object|null>, set(doc): Promise<void> }}
 * ההיגיון לא יודע איפה הנתונים יושבים — כל ספק מזרים מחסן משלו.
 */
export async function runSync({ method, body, token, store, secret }) {
  if (method === 'OPTIONS') return { status: 204, body: null };
  if (method !== 'POST') return { status: 405, body: { error: 'רק POST' } };

  if (!secret) {
    return {
      status: 501,
      body: {
        error: 'הסנכרון לא מוגדר',
        hint: 'צריך להגדיר SYNC_TOKEN במשתני הסביבה של האתר ואז לפרסם מחדש. ' +
          'בלי זה נקודת הקצה מסרבת לעבוד, כדי שלא תישאר פתוחה לכולם.'
      }
    };
  }
  if (!token || !safeEqual(token, secret)) {
    return { status: 401, body: { error: 'טוקן הסנכרון לא תואם' } };
  }

  let payload = body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return { status: 400, body: { error: 'JSON לא תקין' } }; }
  }
  if (!payload || typeof payload !== 'object') return { status: 400, body: { error: 'גוף חסר' } };

  const now = Date.now();

  /* כשל אחסון חייב לחזור כהודעה שאפשר לפעול לפיה. בלי זה הוא
     מתפוצץ כ-500 אטום, והמשתמש רואה "שגיאה" בלי לדעת מה לתקן. */
  const read = async () => {
    try { return (await store.get()) || emptyDoc(); }
    catch (e) { throw new StoreError('קריאה מהאחסון נכשלה', e); }
  };
  const write = async doc => {
    try { await store.set(doc); }
    catch (e) { throw new StoreError('כתיבה לאחסון נכשלה', e); }
  };

  try {
    /* pull בלבד — לקרוא בלי לכתוב, למכשיר שרק נפתח */
    if (payload.mode === 'pull') {
      return { status: 200, body: { ok: true, doc: await read() } };
    }

    /* probe — בדיקת חיבור אמיתית: קריאה *וגם* כתיבה.
       בדיקה שקוראת בלבד יכולה לומר "מחובר" בזמן שהכתיבה שבורה,
       וזה בדיוק הכשל שמתגלה רק אחרי שסומכים עליה. */
    if (payload.mode === 'probe') {
      const doc = await read();
      await write(Object.assign({}, doc, { probedAt: now }));
      return { status: 200, body: { ok: true, canRead: true, canWrite: true, doc } };
    }

    const incoming = payload.state;
    if (!incoming || typeof incoming !== 'object')
      return { status: 400, body: { error: 'חסר state' } };

    const size = JSON.stringify(incoming).length;
    if (size > MAX_BYTES)
      return { status: 413, body: { error: 'המצב גדול מדי לסנכרון (' + Math.round(size / 1024) + 'KB)' } };

    const base = await read();
    const merged = mergeDoc(base, {
      ...incoming,
      deleted: payload.deleted || {},
      settingsAt: payload.settingsAt || 0
    }, now);

    await write(merged);
    return { status: 200, body: { ok: true, doc: merged } };
  } catch (e) {
    if (e instanceof StoreError) {
      return {
        status: 503,
        body: {
          error: e.message,
          hint: 'ב-Vercel: החיבור החדש ל-Blob עובד דרך OIDC ולא תמיד יוצר ' +
            'BLOB_READ_WRITE_TOKEN. אם הכתיבה נכשלת — Storage → ה-Store → ' +
            'תפריט החיבור → ליצור BLOB_READ_WRITE_TOKEN ולפרסם מחדש. ' +
            'הפירוט: ' + (e.cause && e.cause.message || 'לא ידוע')
        }
      };
    }
    throw e;
  }
}

class StoreError extends Error {
  constructor(msg, cause) { super(msg); this.name = 'StoreError'; this.cause = cause; }
}

/* השוואה שלא מדליפה כמה תווים התאימו */
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
