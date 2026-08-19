/* ============================================================
   api/order.js — מה שדף התודה ודף האפיון צריכים לדעת
   הכתובת: /api/order

   GET  /api/order?ref=TX-001
        מחזיר את מה שבטוח להציג: שם פרטי, מה נקנה, ותאריך
        האספקה. שום דבר אחר.

   POST /api/order/claim   { phone }
        המסלול של ביט: אין מזהה עסקה, אז המבקר משאיר טלפון
        והרשומה נכנסת לתיבה מסומנת "לא אומת".

   ------------------------------------------------------------
   שני כללים שקובעים את כל העיצוב:

   1. פרמטר בכתובת הוא קלט של המבקר, לא של הספק. מי שיקליד
      ?ref=משהו יקבל 404, ומי שיקליד ?name=דני לא ישפיע על
      כלום — כי השם לא מגיע מהכתובת אלא מהעסקה השמורה.

   2. הדף הזה קורא בלבד. הכותב היחיד הוא ה-webhook, ובמסלול
      ביט — כתיבה לתיבה בלבד, שממתינה לאישור שלך.

   ------------------------------------------------------------
   שני מסלולים, בכוונה: דף הנחיתה מפנה /api/* ל-Vercel כ-proxy,
   ואז זה same-origin ואין CORS בכלל. אם ה-proxy לא נתפס,
   הכותרות כאן מאפשרות קריאה ישירה מהדומיין של דף הנחיתה.
   הצורך היחיד שחוצה דומיינים הוא GET פשוט בלי כותרות מותאמות,
   אז אין preflight ואין מה שיישבר בשקט.
   ============================================================ */

import { makeStore } from '../lib/vercel-blob.js';
import { addBusinessDays } from '../lib/hebcal.js';

/* מקורות מותרים לקריאה ישירה. כוכבית הייתה עובדת גם היא —
   אבל רשימה מפורשת עולה כלום ואומרת למי הדף הזה מיועד. */
const ORIGINS = [
  'https://frontvid.netlify.app',
  'https://www.frontvid.netlify.app'
];

function cors(req) {
  const origin = req.headers.origin || '';
  const allow = ORIGINS.includes(origin) ? origin
    : (process.env.LANDING_ORIGIN || ORIGINS[0]);
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

/* שם פרטי בלבד. "דני, קלטנו" ולא "דני כהן, קלטנו" — וגם
   לא חושף שם מלא למי שניחש מזהה עסקה. */
const firstName = full => String(full || '').trim().split(/\s+/)[0] || '';

const PRODUCTS = {
  single: { name: 'הסטוץ', line: 'סרטון אחד' },
  bundle: { name: 'לא נעלמים בבוקר', line: 'ארבעה סרטונים בחודש, אחד בשבוע' }
};

/** ימי האספקה מקו המוצר שבמסמך, ואם אין — שבעה */
const deliveryDays = doc => {
  const lines = (doc && doc.productLines) || [];
  const p = lines[0] && lines[0].pricing;
  return (p && p.deliveryDays) || 7;
};

/* ============================================================
   GET — מה נקנה
   ============================================================ */

function lookup(doc, ref) {
  const inbox = (doc && doc.inbox) || [];
  const rec = inbox.find(r => r && r.dedupeKey === 'pay:' + ref);
  if (!rec) return null;

  const f = rec.fields || {};
  const product = PRODUCTS[f.product] || PRODUCTS.single;
  /* התאריך מחושב מאותו מודול שהמערכת משתמשת בו, כדי שהלקוח
     והמערכת יראו את אותו יום. ימים שסומנו ידנית לא ידועים כאן
     — הם יושבים בהגדרות המכשיר — אז פער אפשרי הוא יום אחד,
     ורק אם סימנת יום אחרי התשלום. */
  const due = addBusinessDays(rec.at || Date.now(), deliveryDays(doc));

  return {
    ok: true,
    name: firstName(f.name),
    product: f.product === 'bundle' ? 'bundle' : 'single',
    productName: product.name,
    productLine: product.line,
    amount: Number(f.amount) || 0,
    verified: !!f.verified,
    dueAt: due,
    dueText: new Date(due).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }),
    deliveryDays: deliveryDays(doc)
  };
}

/* ============================================================
   POST — המסלול של ביט
   ============================================================ */

const MOBILE = /^0?5\d{8}$/;

const normPhone = v => {
  const d = String(v || '').replace(/\D/g, '');
  return d.replace(/^972/, '0');
};

const rid = () => 'in_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function claim(store, body) {
  let j = {};
  try { j = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {}); } catch { j = {}; }

  const phone = normPhone(j.phone);
  if (!MOBILE.test(phone))
    return { status: 400, body: { error: 'מספר לא תקין', hint: 'מספר נייד ישראלי, למשל 0501234567' } };

  const doc = (await store.get()) || {};
  const inbox = Array.isArray(doc.inbox) ? doc.inbox : [];

  /* מי שמרענן את הדף לא יוצר רשומה שנייה. המפתח הוא הטלפון
     והיום — תשלום נוסף מחר כן ראוי לרשומה נוספת. */
  const key = 'bit:' + phone + ':' + new Date().toISOString().slice(0, 10);
  const found = inbox.find(r => r && r.dedupeKey === key);
  if (found) return { status: 200, body: { ok: true, duplicate: true } };

  const at = Date.now();
  const product = j.product === 'bundle' ? 'bundle' : 'single';
  inbox.unshift({
    id: rid(), at, updatedAt: at,
    kind: 'payment', source: 'ביט',
    status: 'pending',
    dedupeKey: key,
    title: 'תשלום בביט · ' + phone,
    note: 'ביט לא שולח אישור אוטומטי. ודא שהכסף התקבל לפני שאתה מאשר.',
    fields: {
      name: String(j.name || '').slice(0, 60),
      phone,
      product,
      amount: 0,
      verified: false
    },
    raw: '',
    resultId: null
  });

  doc.inbox = inbox.slice(0, 500);
  doc.rev = (doc.rev || 0) + 1;
  doc.updatedAt = at;
  await store.set(doc);

  return { status: 200, body: { ok: true, dueDays: deliveryDays(doc) } };
}

/* ============================================================ */

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(cors(req))) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.SYNC_TOKEN;
  if (!secret) return res.status(501).send(JSON.stringify({
    error: 'SYNC_TOKEN לא מוגדר',
    hint: 'הנתונים יושבים באחסון המוצפן של הסנכרון, ובלי הסוד אין ממה לגזור מפתח.'
  }));

  let store;
  try { store = await makeStore(secret); }
  catch (e) { return res.status(503).send(JSON.stringify({ error: 'האחסון לא זמין', hint: e && e.message })); }

  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST') {
    try {
      const out = await claim(store, req.body);
      return res.status(out.status).send(JSON.stringify(out.body));
    } catch (e) {
      return res.status(503).send(JSON.stringify({ error: 'לא הצלחתי לשמור', hint: e && e.message }));
    }
  }

  if (req.method !== 'GET') return res.status(405).send(JSON.stringify({ error: 'רק GET או POST' }));

  const ref = (url.searchParams.get('ref') || '').trim();
  if (!ref || ref.length > 120) return res.status(400).send(JSON.stringify({ error: 'חסר ref' }));

  let doc;
  try { doc = await store.get(); }
  catch (e) { return res.status(503).send(JSON.stringify({ error: 'לא הצלחתי לקרוא', hint: e && e.message })); }

  const found = lookup(doc, ref);
  /* לא נמצא זה לא שגיאה אלא מרוץ: הדפדפן הגיע לפני שה-webhook
     נחת. הדף יודע להציג אישור מלא בלי השם ולנסות שוב. */
  if (!found) return res.status(404).send(JSON.stringify({ ok: false, pending: true }));

  return res.status(200).send(JSON.stringify(found));
}

// נחוץ לבדיקות
export const _internals = { lookup, claim, firstName, normPhone };
