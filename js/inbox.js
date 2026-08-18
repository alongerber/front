/* ============================================================
   inbox.js — תיבת הנכנס
   ------------------------------------------------------------
   עד עכשיו כל מה שנכנס למערכת נכנס דרך היד שלך. ברגע שדברים
   נוצרים אוטומטית — תשלום שנקלט, שיחה שהסתיימה — הם נכנסים
   ישר לצינור, ותשלום כפול או שיוך שגוי הופכים את הצינור למקום
   שאתה כבר לא סומך עליו.

   לכן יש אזור המתנה. כל מה שמגיע מבחוץ נוחת כאן, ואתה מאשר
   בלחיצה. ההפרש בין "המערכת עשתה משהו" ל"המערכת מציעה ואני
   מאשר" הוא ההפרש בין מערכת שסומכים עליה לבין אחת שבודקים
   אחריה כל בוקר.

   שלושה כללים:

   1. שום דבר לא נזרק. רשומה שלא הצלחנו לפענח נשמרת עם הטקסט
      הגולמי ומסומנת "לא הבנתי" — שגיאה שאתה לא רואה היא לקוח
      שאבד.
   2. מפתח ייחוד. ספק סליקה שמנסה שוב, או שיחה שנשלחה
      פעמיים, לא יוצרים שתי רשומות.
   3. אישור הוא הפעולה היחידה שכותבת. עד שלא לחצת — הצינור
      לא יודע שקרה משהו.
   ============================================================ */

import { S, update, uid, getItem, patchItem, addItem, lineOf } from './store.js';
import * as P from './production.js';
import * as D from './delivery.js';

const now = () => Date.now();

/* סוגי רשומות. הטקסט הוא מה שתראה בכותרת השורה. */
export const KINDS = {
  payment:     { name: 'תשלום',        icon: '₪',  color: '#3ddc84' },
  'call-sales': { name: 'שיחת מכירה',  icon: '☎',  color: '#5aa9ff' },
  'call-brief': { name: 'שיחת אפיון',  icon: '🎤', color: '#b98cff' },
  unknown:     { name: 'לא הבנתי',     icon: '?',  color: '#ff9f43' }
};

export const kindMeta = k => KINDS[k] || KINDS.unknown;

/* ============================================================
   1. שליפה
   ============================================================ */

export const all = () => S().inbox || [];
export const pending = () => all().filter(r => r.status === 'pending').sort((a, b) => b.at - a.at);
export const handled = () => all().filter(r => r.status !== 'pending').sort((a, b) => b.at - a.at);
export const count = () => pending().length;
export const get = id => all().find(r => r.id === id);

/* ============================================================
   2. קליטה
   ============================================================ */

/**
 * מוסיף רשומה. אידמפוטנטי לפי dedupeKey — ספק סליקה שמנסה
 * שוב אחרי timeout לא אמור ליצור לקוח שני.
 * מחזיר את הרשומה (הקיימת או החדשה) ו-created.
 */
export function add(rec) {
  const key = rec.dedupeKey || null;
  if (key) {
    const found = all().find(r => r.dedupeKey === key);
    if (found) return { record: found, created: false };
  }

  const record = Object.assign({
    id: uid('in'),
    at: now(),
    kind: 'unknown',
    source: '',
    status: 'pending',
    title: '',
    note: '',
    fields: {},
    raw: '',
    dedupeKey: key,
    resultId: null
  }, rec);

  // הגולמי נשמר, אבל לא בלי גבול — המצב כולו יושב ב-JSON אחד
  if (record.raw && record.raw.length > 8000) record.raw = record.raw.slice(0, 8000) + '\n…(קוצר)';

  update(s => {
    if (!Array.isArray(s.inbox)) s.inbox = [];
    s.inbox.unshift(record);
  }, { label: 'קליטה לתיבת הנכנס' });

  return { record, created: true };
}

export function reject(id, why = '') {
  update(s => {
    const r = (s.inbox || []).find(x => x.id === id);
    if (r) { r.status = 'rejected'; r.handledAt = now(); r.note = why || r.note; }
  }, { label: 'דחיית רשומה' });
}

export function remove(id) {
  update(s => { s.inbox = (s.inbox || []).filter(x => x.id !== id); }, { label: 'מחיקת רשומה מהנכנס' });
}

/** מחזיר רשומה שנדחתה או אושרה בטעות למצב ממתין */
export function reopen(id) {
  update(s => {
    const r = (s.inbox || []).find(x => x.id === id);
    if (r) { r.status = 'pending'; r.handledAt = null; }
  }, { label: 'החזרה לנכנס' });
}

/* ============================================================
   3. זיהוי לקוח
   ------------------------------------------------------------
   רק לפי מה שאי אפשר לטעות בו: מזהה חיצוני שהשרת הנפיק,
   טלפון, או מייל. לא לפי שם — "דני" הוא לא מזהה.
   ============================================================ */

/** 050-123-4567, +972501234567 ו-501234567 הם אותו מספר */
export const normPhone = v => {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  return d.replace(/^972/, '').replace(/^0/, '').slice(-9);
};

export function findClient(fields = {}) {
  const items = S().items.filter(i => i.type === 'client' && !i.archived);
  if (fields.ref) {
    const byRef = items.find(c => c.extRef && c.extRef === fields.ref);
    if (byRef) return byRef;
  }
  const ph = normPhone(fields.phone);
  if (ph) {
    const byPhone = items.find(c => normPhone(c.phone) === ph);
    if (byPhone) return byPhone;
  }
  if (fields.email) {
    const em = String(fields.email).trim().toLowerCase();
    const byMail = items.find(c => (c.email || '').trim().toLowerCase() === em);
    if (byMail) return byMail;
  }
  return null;
}

/* ============================================================
   4. אישור
   ============================================================ */

/**
 * מאשר רשומה — וזו הפעולה היחידה שכותבת למערכת.
 * מחזיר {ok, itemId, message} או {error}.
 */
export function accept(id, opts = {}) {
  const rec = get(id);
  if (!rec) return { error: 'הרשומה לא נמצאה' };
  if (rec.status !== 'pending') return { error: 'כבר טופלה' };

  let out;
  if (rec.kind === 'payment') out = applyPayment(rec, opts);
  else if (rec.kind === 'call-brief') out = applyBrief(rec, opts);
  else if (rec.kind === 'call-sales') out = applyLead(rec, opts);
  else return { error: 'אין לי מה לעשות עם רשומה מסוג "' + kindMeta(rec.kind).name + '". אפשר למחוק אותה.' };

  if (out.error) return out;

  update(s => {
    const r = (s.inbox || []).find(x => x.id === id);
    if (r) { r.status = 'accepted'; r.handledAt = now(); r.resultId = out.itemId; }
  }, { label: 'אישור רשומה' });

  return out;
}

/* --- תשלום → לקוח + הפקה + שעון --- */
function applyPayment(rec, opts) {
  const f = rec.fields || {};
  const line = lineOf(opts.productLineId);
  const bundle = f.product === 'bundle';

  let c = opts.clientId ? getItem(opts.clientId) : findClient(f);

  if (c) {
    /* לקוח קיים — משלימים מה שחסר ולא דורסים מה שיש.
       מה שהוא הקליד בדף הסליקה פחות מדויק ממה שאתה כבר יודע. */
    const patch = {};
    if (!c.phone && f.phone) patch.phone = f.phone;
    if (!c.email && f.email) patch.email = f.email;
    if (!c.business && f.business) patch.business = f.business;
    if (!c.extRef && f.ref) patch.extRef = f.ref;
    if (Object.keys(patch).length) patchItem(c.id, patch);
  } else {
    c = addItem({
      type: 'client',
      title: f.name || 'לקוח חדש',
      business: f.business || '',
      phone: f.phone || '',
      email: f.email || '',
      extRef: f.ref || '',
      source: f.source || 'ad',
      productLineId: line.id,
      amount: Number(f.amount) || (bundle ? line.pricing?.bundle : line.pricing?.unit) || 0,
      note: 'נפתח מתשלום שנקלט ב' + (rec.source || 'סליקה')
    });
  }

  if (bundle && !c.retainer) {
    patchItem(c.id, {
      retainer: true,
      monthlyAmount: Number(f.amount) || line.pricing?.bundle || 0,
      retainerStartedAt: rec.at || now(),
      retainerEndedAt: null
    }, 'לקוח קבוע מתשלום שנקלט');
  }

  const prod = P.addProduction(c.id);
  if (!prod) return { error: 'לא הצלחתי לפתוח הפקה' };

  /* מעבר לשלב שסומן "שולם" — משם רץ הכל: התשלום נרשם,
     ההכנסה נספרת, ושעון שבעת ימי העסקים מתחיל. */
  const pay = line.stages.find(D.isPayStage);
  if (pay) {
    update(s => {
      const p = s.items.find(i => i.id === prod.id);
      if (p) { p.stageId = pay.id; p.stageSince = now(); }
    });
    D.onStageChange(prod.id, pay);
  }

  return {
    ok: true, itemId: prod.id, clientId: c.id,
    message: `${c.title} — נפתחה הפקה והשעון התחיל`
  };
}

/* --- שיחת אפיון → מקור בריף על הלקוח --- */
function applyBrief(rec, opts) {
  const f = rec.fields || {};
  const c = opts.clientId ? getItem(opts.clientId) : findClient(f);
  if (!c) return { error: 'לא הצלחתי לשייך את השיחה ללקוח. בחר לקוח מהרשימה.' };

  const text = f.transcript || rec.raw || '';
  if (!text.trim()) return { error: 'אין בשיחה טקסט לשמור' };

  update(s => {
    const it = s.items.find(i => i.id === c.id);
    if (!it) return;
    it.briefSources = (it.briefSources || []).concat({
      id: uid('src'),
      at: rec.at || now(),
      label: 'שיחת אפיון' + (f.durationMin ? ` · ${f.durationMin} דק'` : ''),
      text,
      facts: { isWhatsApp: false, messages: 0, chars: text.length, money: [], dates: [], links: [], speakers: [] }
    });
    it.updatedAt = now();
  }, { label: 'הוספת שיחת אפיון' });

  return { ok: true, itemId: c.id, clientId: c.id, message: `השיחה נוספה ל${c.title} — אפשר "תעשה סדר"` };
}

/* --- שיחת מכירה → ליד --- */
function applyLead(rec, opts) {
  const f = rec.fields || {};
  const existing = opts.clientId ? getItem(opts.clientId) : findClient(f);
  if (existing) {
    return { ok: true, itemId: existing.id, clientId: existing.id, message: existing.title + ' כבר קיים — לא נפתח לקוח נוסף' };
  }

  const line = lineOf(opts.productLineId);
  const c = addItem({
    type: 'client',
    title: f.name || 'ליד חדש',
    business: f.business || '',
    phone: f.phone || '',
    email: f.email || '',
    source: f.source || 'ad',
    productLineId: line.id,
    note: f.summary || 'הגיע משיחה עם סוכנת המכירות'
  });

  const prod = P.addProduction(c.id);
  const text = f.transcript || rec.raw || '';
  if (text.trim()) {
    update(s => {
      const it = s.items.find(i => i.id === c.id);
      if (!it) return;
      it.briefSources = [{
        id: uid('src'), at: rec.at || now(), label: 'שיחת מכירה', text,
        facts: { isWhatsApp: false, messages: 0, chars: text.length, money: [], dates: [], links: [], speakers: [] }
      }];
    });
  }
  return { ok: true, itemId: prod ? prod.id : c.id, clientId: c.id, message: c.title + ' נפתח כליד' };
}
