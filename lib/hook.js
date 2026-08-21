/* ============================================================
   hook.js — מה שמגיע מבחוץ
   ------------------------------------------------------------
   שני מקורות, ולכל אחד נתיב משלו:
     /api/hook/pay   — תשלום מספק הסליקה
     /api/hook/call  — סוף שיחה מ-ElevenLabs

   למה שני נתיבים ולא אחד: שכבת האימות שונה לגמרי. לערבב אותן
   בקובץ אחד זה להזמין את היום שבו תיקון באחת ישבור את השנייה.

   ------------------------------------------------------------
   הקו שמפריד בין "לזרוק" ל"לשמור":

     חתימה נכשלה → 401, ולא נכתב כלום. נקודת קצה שכותבת לכל
     בקשה לא מאומתת היא דלת פתוחה לזבל.

     חתימה עברה אבל לא הבנו את התוכן → נכתב כ"לא הבנתי" עם
     הטקסט הגולמי, ומוחזר 200. הספק לא ינסה שוב, ואתה תראה
     בתיבה שמשהו הגיע. שיחה שאבדה בשקט גרועה משורה בתיבה.

   ------------------------------------------------------------
   ספק הסליקה עוד לא נסגר, ולכן זה בנוי כרשימת מתאמים: כל
   מתאם יודע לאמת ולפרש ספק אחד, והוספת ספק היא מתאם נוסף
   ולא שכתוב. הנתיב מקבל ?provider=… מפורש ולא מנחש מהכותרות —
   ניחוש הוא בדיוק הדבר שיישבר כשספק ישנה פורמט.
   ============================================================ */

import crypto from 'node:crypto';

export const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Front-Signature, ElevenLabs-Signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_AGE_MS = 30 * 60 * 1000;     // חותמת ישנה מזה — נדחית
const MAX_BODY = 512 * 1024;

/* ============================================================
   עזרי אימות
   ============================================================ */

/** השוואה בזמן קבוע. אורך שונה → false, בלי לזרוק. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || !x.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export const hmac = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

/* ============================================================
   מתאמי סליקה
   ------------------------------------------------------------
   verify(raw, headers, env) → {ok} | {ok:false, why}
   parse(raw, headers)       → {fields, title, dedupeKey} | null
   ============================================================ */

const num = v => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** חבילה או סרטון בודד — לפי הסכום, ואם יש שדה מפורש הוא מנצח */
const productOf = (explicit, amount) => {
  const e = String(explicit || '').toLowerCase();
  if (/bundle|package|monthly|חבילה|חודשי/.test(e)) return 'bundle';
  if (/single|one|בודד|סטוץ/.test(e)) return 'single';
  return amount >= 2500 ? 'bundle' : 'single';
};

/* גוף שיכול להגיע כ-JSON או כטופס, ועם מפתחות מקוננים בסוגריים.
   data[payerEmail] ו-{data:{payerEmail}} הם אותו שדה — מיישרים
   הכל למפה שטוחה לפי הסגמנט האחרון, ואז לקוד לא אכפת. */
export function flatBody(raw, headers = {}) {
  const ct = String(headers['content-type'] || '').toLowerCase();
  let src = null;
  if (ct.includes('json') || /^\s*[{[]/.test(String(raw || ''))) {
    try { src = JSON.parse(raw); } catch { src = null; }
  }
  if (!src) {
    src = {};
    try { new URLSearchParams(String(raw || '')).forEach((v, k) => { if (src[k] == null) src[k] = v; }); }
    catch { /* גוף שאינו טופס ואינו JSON — נשאר ריק */ }
  }
  return flatten(src);
}

function flatten(o, out = {}) {
  Object.entries(o || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) { flatten(v, out); return; }
    const key = /\[([^\]]+)\]\s*$/.test(k) ? k.match(/\[([^\]]+)\]\s*$/)[1] : k;
    if (out[key] == null || out[key] === '') out[key] = v;
  });
  return out;
}

export const PAY_ADAPTERS = {
  /* ------------------------------------------------------------
     generic — HMAC-SHA256 על הגוף הגולמי, בסוד משותף.
     זה מה שרוב ספקי הסליקה הישראליים יודעים לעשות, וזה גם
     המסלול לבדיקה מקומית.
     ------------------------------------------------------------ */
  generic: {
    name: 'סליקה',
    verify(raw, headers, env) {
      const secret = env.HOOK_SECRET;
      if (!secret) return { ok: false, why: 'HOOK_SECRET לא מוגדר' };
      const sig = headers['x-front-signature'] || '';
      if (!sig) return { ok: false, why: 'אין חתימה' };
      return safeEqual(sig, hmac(secret, raw)) ? { ok: true } : { ok: false, why: 'חתימה לא תואמת' };
    },
    parse(raw) {
      let j;
      try { j = JSON.parse(raw); } catch { return null; }
      const amount = num(j.amount ?? j.sum ?? j.total);
      const ref = String(j.ref || j.transactionId || j.transaction_id || j.id || '');
      if (!ref) return null;
      return {
        dedupeKey: 'pay:' + ref,
        title: `${j.name || j.fullName || 'תשלום'} — ${amount ? amount.toLocaleString('he-IL') + ' ₪' : ''}`.trim(),
        fields: {
          name: j.name || j.fullName || '',
          business: j.business || j.company || '',
          phone: j.phone || j.mobile || '',
          email: j.email || '',
          amount,
          product: productOf(j.product || j.plan, amount),
          ref,
          verified: true
        }
      };
    }
  },

  /* ------------------------------------------------------------
     grow — ספק הסליקה שנבחר.
     ------------------------------------------------------------
     שלוש הנחות, כי אין לי גישה לתיעוד מכאן. כולן נכשלות לצד
     הבטוח — כלומר 401 ולא כתיבה:

     1. הגוף מגיע כטופס עם מפתחות בסוגריים, או כ-JSON. שניהם
        מטופלים; מה שלא אף אחד מהם ייכנס כ"לא הבנתי".
     2. האימות הוא מפתח משותף. Grow יכול להעביר אותו בשלוש
        דרכים — בכתובת ה-callback, בכותרת, או בתוך הגוף —
        וכולן נבדקות מול GROW_WEBHOOK_KEY. אם הוגדר גם
        GROW_SECRET ומגיעה חתימה, היא מנצחת.
     3. בלי אף אחד מהשניים בסביבה — הנתיב מסרב. נקודת קצה
        שכותבת לכל בקשה היא דלת פתוחה.

     ומה שחייב לצאת מכאן שלם, כי שלב ה-Conversions API בנוי
     עליו: payerEmail, payerPhone, והמזהה של העסקה.
     ------------------------------------------------------------ */
  grow: {
    name: 'Grow',
    verify(raw, headers, env, query = {}) {
      const h = headers || {};

      const secret = env.GROW_SECRET;
      const sig = h['x-grow-signature'] || h['x-front-signature'] || '';
      if (secret && sig)
        return safeEqual(sig, hmac(secret, raw)) ? { ok: true } : { ok: false, why: 'חתימה לא תואמת' };

      const want = env.GROW_WEBHOOK_KEY;
      if (want) {
        const f = flatBody(raw, h);
        const got = String(query.key || query.token || h['x-webhook-key'] || f.webhookKey || f.webhook_key || '');
        return safeEqual(got, want)
          ? { ok: true }
          : { ok: false, why: got ? 'מפתח לא תואם' : 'לא הגיע מפתח — לא בכתובת, לא בכותרת ולא בגוף' };
      }

      return { ok: false, why: 'לא הוגדר GROW_WEBHOOK_KEY ולא GROW_SECRET' };
    },

    parse(raw, headers) {
      const f = flatBody(raw, headers || {});
      /* המזהה חייב להיות יציב בין ניסיונות חוזרים של הספק, והוא
         גם מה שדף האפיון יחפש לפיו. */
      const ref = String(f.transactionId || f.asmachta || f.transactionToken || f.processId || '').trim();
      if (!ref) return null;

      const amount = num(f.sum ?? f.paymentSum ?? f.total ?? f.firstPaymentSum ?? f.amount);
      const name = String(
        f.payerName || f.fullName || f.customerName ||
        [f.firstName, f.lastName].filter(Boolean).join(' ') || ''
      ).trim();

      /* סטטוס: רק הצלחה מפורשת נחשבת מאומתת. שדה חסר נחשב
         הצלחה, כי ה-callback נשלח על עסקה שעברה — אבל אם הגיע
         סטטוס ואיננו מזוהה, הרשומה נכנסת מסומנת ולא מאושרת. */
      const st = String(f.statusCode ?? f.status ?? '').trim();
      const okStatus = !st || /^(1|success|approved|ok|completed|paid)$/i.test(st);

      const payments = num(f.paymentsNum || f.allPaymentNum);
      const recurring = payments > 1 ||
        /recurring|subscription|standing|הוראת\s*קבע/i.test(String(f.transactionTypeId || f.paymentType || ''));

      const notes = [];
      if (!okStatus) notes.push('סטטוס מהספק: ' + st + ' — ודא שהכסף התקבל לפני אישור.');
      if (recurring) notes.push('חיוב חוזר. ודא שלא נפתחת הפקה כפולה לחודש הזה.');

      return {
        dedupeKey: 'pay:' + ref,
        title: `${name || 'תשלום'} — ${amount ? amount.toLocaleString('he-IL') + ' ₪' : ''}`.trim(),
        note: notes.join(' '),
        fields: {
          name,
          business: String(f.businessName || f.company || '').trim(),
          phone: String(f.payerPhone || f.phone || f.mobile || '').trim(),
          email: String(f.payerEmail || f.email || '').trim(),
          amount,
          currency: String(f.currency || 'ILS'),
          product: productOf(f.cField1 || f.productName || f.itemName || f.description, amount),
          ref,
          recurring,
          verified: okStatus,
          /* מה ש-Conversions API יצטרך: זמן האירוע והמזהה שמונע
             ספירה כפולה מול הפיקסל. */
          paidAt: Date.parse(f.paymentDate || f.date || '') || 0,
          eventId: 'grow:' + ref
        }
      };
    }
  },

  /* ------------------------------------------------------------
     paypal — IPN. האימות הוא החזרת ההודעה לפייפאל ושאלה אם היא
     אמיתית. פחות אלגנטי מחתימה, אבל זה מה שיש, וזה לא דורש
     תעודות ולא ספרייה.
     ------------------------------------------------------------ */
  paypal: {
    name: 'PayPal',
    async verify(raw, headers, env) {
      const url = env.PAYPAL_IPN_URL ||
        (env.PAYPAL_SANDBOX ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'
          : 'https://ipnpb.paypal.com/cgi-bin/webscr');
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Front-IPN/1.0' },
          body: 'cmd=_notify-validate&' + raw
        });
        const txt = (await r.text()).trim();
        if (txt === 'VERIFIED') return { ok: true };
        return { ok: false, why: 'פייפאל החזיר ' + (txt || 'תשובה ריקה') };
      } catch (e) {
        return { ok: false, why: 'לא הצלחתי לאמת מול פייפאל: ' + (e && e.message) };
      }
    },
    parse(raw) {
      const q = new URLSearchParams(raw);
      const status = q.get('payment_status') || '';
      const ref = q.get('txn_id') || '';
      if (!ref) return null;
      const amount = num(q.get('mc_gross'));
      const name = [q.get('first_name'), q.get('last_name')].filter(Boolean).join(' ');
      return {
        dedupeKey: 'pay:' + ref,
        title: `${name || 'PayPal'} — ${amount ? amount.toLocaleString('he-IL') + ' ₪' : ''}`.trim(),
        // תשלום שלא הושלם נכנס לתיבה ומסומן, לא נזרק ולא מאושר
        note: status && status !== 'Completed' ? 'סטטוס בפייפאל: ' + status : '',
        fields: {
          name,
          business: q.get('payer_business_name') || '',
          phone: q.get('contact_phone') || '',
          email: q.get('payer_email') || '',
          amount,
          currency: q.get('mc_currency') || '',
          product: productOf(q.get('item_name'), amount),
          ref,
          verified: status === 'Completed'
        }
      };
    }
  }
};

/* ============================================================
   1. תשלום
   ============================================================ */

export async function handlePayment({ raw, headers = {}, query = {}, env = {}, store }) {
  if (raw && raw.length > MAX_BODY) return { status: 413, body: { error: 'גוף גדול מדי' } };

  /* הספק נקבע במפורש: פרמטר בכתובת, ואם אין — משתנה סביבה.
     PAY_PROVIDER קיים כדי שכתובת callback שנשמרה בלי הפרמטר
     לא תפיל תשלום אמיתי. ניחוש מהכותרות עדיין לא קורה כאן. */
  const key = String(query.provider || env.PAY_PROVIDER || 'generic').toLowerCase();
  const adapter = PAY_ADAPTERS[key];
  if (!adapter) {
    return { status: 400, body: { error: 'ספק לא מוכר: ' + key, hint: 'provider אפשריים: ' + Object.keys(PAY_ADAPTERS).join(', ') } };
  }

  const v = await adapter.verify(raw, lower(headers), env, query);
  if (!v.ok) return { status: 401, body: { error: 'אימות נכשל', hint: v.why } };

  const parsed = adapter.parse(raw, lower(headers));
  const rec = parsed
    ? Object.assign({ kind: 'payment', source: adapter.name }, parsed)
    : {
      kind: 'unknown', source: adapter.name,
      title: 'תשלום שלא הצלחתי לפענח',
      note: 'החתימה תקינה — התוכן לא בפורמט שאני מכיר. הפרטים למטה.',
      dedupeKey: 'pay:raw:' + hmac('front', raw).slice(0, 24),
      fields: {}
    };

  return append(store, rec, raw);
}

/* ============================================================
   2. סוף שיחה
   ============================================================ */

/**
 * חתימת ElevenLabs: כותרת בצורה t=<שניות>,v0=<hex>,
 * וה-HMAC מחושב על `${t}.${גוף גולמי}`.
 * הגוף חייב להיות בדיוק כפי שהתקבל — JSON.parse ואז stringify
 * מזיז רווח אחד והחתימה כבר לא תואמת.
 */
export function verifyElevenLabs(raw, headers, env) {
  const secret = env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return { ok: false, why: 'ELEVENLABS_WEBHOOK_SECRET לא מוגדר' };

  const h = lower(headers);
  const head = h['elevenlabs-signature'] || h['x-elevenlabs-signature'] || '';
  if (!head) return { ok: false, why: 'אין כותרת חתימה' };

  const parts = Object.fromEntries(String(head).split(',').map(p => {
    const i = p.indexOf('=');
    return i < 0 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
  const t = parts.t, sig = parts.v0;
  if (!t || !sig) return { ok: false, why: 'כותרת החתימה לא בפורמט t=…,v0=…' };

  const ageMs = Math.abs(Date.now() - Number(t) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > MAX_AGE_MS)
    return { ok: false, why: 'חותמת הזמן ישנה או לא תקינה — הקלטה של בקשה לא תעבוד שוב' };

  return safeEqual(sig, hmac(secret, `${t}.${raw}`))
    ? { ok: true }
    : { ok: false, why: 'חתימה לא תואמת' };
}

/** מוציא טלפון מתוך משתנים דינמיים, מטא-דאטה, או שדות שחולצו */
const digForPhone = d =>
  d.phone || d.caller_phone || d.customer_phone ||
  (d.metadata && (d.metadata.phone_number || d.metadata.caller_id)) || '';

export function handleCall({ raw, headers = {}, env = {}, store }) {
  if (raw && raw.length > MAX_BODY) return { status: 413, body: { error: 'גוף גדול מדי' } };

  const v = verifyElevenLabs(raw, headers, env);
  if (!v.ok) return { status: 401, body: { error: 'אימות נכשל', hint: v.why } };

  let j = null;
  try { j = JSON.parse(raw); } catch { j = null; }
  const d = (j && (j.data || j)) || {};

  const agentId = d.agent_id || (d.conversation_initiation_client_data || {}).agent_id || '';
  const convId = d.conversation_id || d.conversationId || '';

  /* המזהה קובע מה נוצר, מול משתני סביבה. לא לפי תוכן השיחה:
     מי ששולח את הבקשה לא צריך יכולת לבחור מה ייווצר אצלך. */
  const kind =
    agentId && agentId === env.BRIEF_AGENT_ID ? 'call-brief'
      : agentId && agentId === env.SALES_AGENT_ID ? 'call-sales'
        : 'unknown';

  const dyn = (d.conversation_initiation_client_data || {}).dynamic_variables || {};
  const extracted = (d.analysis && d.analysis.data_collection_results) || {};
  const val = k => {
    const e = extracted[k];
    return (e && (e.value ?? e.result)) ?? dyn[k] ?? d[k] ?? '';
  };

  const transcript = Array.isArray(d.transcript)
    ? d.transcript
      .filter(t => t && (t.message || t.text))
      .map(t => `${t.role === 'agent' ? 'מיטל' : 'לקוח'}: ${t.message || t.text}`)
      .join('\n')
    : String(d.transcript || '');

  const secs = Number(d.metadata && d.metadata.call_duration_secs) || 0;
  const name = String(val('client_name') || val('name') || '').trim();

  const rec = {
    kind,
    source: 'ElevenLabs',
    dedupeKey: convId ? 'call:' + convId : 'call:' + hmac('front', raw).slice(0, 24),
    title: kind === 'unknown'
      ? 'שיחה מסוכנת שאני לא מכיר'
      : (kind === 'call-brief' ? 'שיחת אפיון' : 'שיחת מכירה') + (name ? ' · ' + name : ''),
    note: kind === 'unknown'
      ? `agent_id ${agentId || '(חסר)'} לא מוגדר במשתני הסביבה. השיחה נשמרה — אפשר לשייך ידנית.`
      : '',
    fields: {
      name,
      business: String(val('business') || val('company') || '').trim(),
      phone: String(digForPhone({ ...d, ...dyn, ...flat(extracted) }) || '').trim(),
      email: String(val('email') || '').trim(),
      ref: String(dyn.order_id || val('order_id') || '').trim(),
      summary: String((d.analysis && d.analysis.transcript_summary) || '').trim(),
      durationMin: secs ? Math.max(1, Math.round(secs / 60)) : 0,
      agentId,
      transcript
    }
  };

  return append(store, rec, raw);
}

const flat = o => Object.fromEntries(
  Object.entries(o || {}).map(([k, v2]) => [k, v2 && typeof v2 === 'object' ? (v2.value ?? v2.result ?? '') : v2]));

const lower = h => Object.fromEntries(
  Object.entries(h || {}).map(([k, v]) => [String(k).toLowerCase(), Array.isArray(v) ? v[0] : v]));

/* ============================================================
   3. כתיבה לתיבה
   ------------------------------------------------------------
   הרשומה נכנסת למסמך המצב שהסנכרון כבר מנהל, והדפדפן מושך
   אותה בסנכרון הבא. אין כאן ניסיון להיות חכם: קוראים, מוסיפים,
   כותבים. מצב תקין הוא עשרות קילובייטים.
   ============================================================ */

const rid = () => 'in_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function append(store, rec, raw) {
  if (!store) return { status: 503, body: { error: 'האחסון לא זמין' } };

  let doc;
  try { doc = (await store.get()) || {}; }
  catch (e) { return { status: 503, body: { error: 'לא הצלחתי לקרוא את המצב', hint: e && e.message } }; }

  const inbox = Array.isArray(doc.inbox) ? doc.inbox : [];

  // ניסיון חוזר של הספק לא יוצר רשומה שנייה
  const exists = rec.dedupeKey && inbox.find(r => r && r.dedupeKey === rec.dedupeKey);
  if (exists) return { status: 200, body: { ok: true, duplicate: true, id: exists.id } };

  const at = Date.now();
  const trimmed = String(raw || '');
  const record = Object.assign({
    id: rid(),
    at,
    updatedAt: at,
    status: 'pending',
    note: '',
    fields: {},
    resultId: null
  }, rec, {
    raw: trimmed.length > 8000 ? trimmed.slice(0, 8000) + '\n…(קוצר)' : trimmed
  });

  doc.inbox = [record, ...inbox].slice(0, 500);
  doc.rev = (doc.rev || 0) + 1;
  doc.updatedAt = at;

  try { await store.set(doc); }
  catch (e) { return { status: 503, body: { error: 'לא הצלחתי לכתוב', hint: e && e.message } }; }

  return { status: 200, body: { ok: true, id: record.id, kind: record.kind } };
}
