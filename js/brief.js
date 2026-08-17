/* ============================================================
   brief.js — מהתכתבות לסדר
   ------------------------------------------------------------
   הרגע שזה נבנה בשבילו: סיימת שיחת מכירה, יש לך שרשור וואטסאפ
   באורך מסך וחצי, ובתוכו מפוזרים המחיר שסוכם, שלוש דרישות,
   רפרנס אחד ותאריך שהבטחת. עד היום זה נשאר בוואטסאפ, ובעוד
   שבועיים חיפשת שם "מה בעצם אמרנו".

   שני עקרונות שקובעים איך זה בנוי:

   1. הטקסט הגולמי נשמר תמיד, גם אם הסידור נכשל. הוא המקור,
      והסידור הוא רק שכבה מעליו.
   2. כל שורה מסודרת נושאת ציטוט מהמקור. סיכום שאי אפשר לאמת
      גרוע מאין סיכום — כי אתה מתחיל לסמוך עליו.

   בלי מפתח API: הפירוק לדוברים, המחירים, התאריכים והקישורים
   עדיין נחלצים כאן בדפדפן. רק ההבנה חסרה, וזה נאמר במפורש.
   ============================================================ */

import { S, update, uid, patchItem, addItem } from './store.js';
import { callAssistant } from './api.js';

/* ============================================================
   1. פירוק וואטסאפ
   ------------------------------------------------------------
   ייצוא וואטסאפ נראה כך, בשלוש וריאציות שראיתי:
     [17.8.2026, 9:41:02] אלון: טקסט
     17.8.2026, 9:41 - אלון: טקסט
     ‎[17/08/2026, 9:41] אלון: טקסט
   הסימנים הבלתי נראים (LRM/RTL) שוואטסאפ מוסיף מפילים כל ניסיון
   תמים להתאים, ולכן מנקים אותם קודם.
   ============================================================ */

const INVISIBLE = /[‎‏‪-‮⁦-⁩]/g;

const LINE_RE = new RegExp(
  '^\\[?' +
  '(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})' +      // תאריך
  ',?\\s+' +
  '(\\d{1,2}:\\d{2}(?::\\d{2})?)' +           // שעה
  '\\s*(?:AM|PM|am|pm)?' +
  '\\]?\\s*[-–]?\\s*' +
  '([^:]{1,40}?):\\s*' +                      // דובר
  '([\\s\\S]*)$'                              // הטקסט
);

/** מפרק ייצוא וואטסאפ להודעות. מחזיר null אם זה לא נראה כמו ייצוא. */
export function parseWhatsApp(raw) {
  const lines = String(raw || '').replace(INVISIBLE, '').split(/\r?\n/);
  const msgs = [];
  let cur = null;

  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (m) {
      if (cur) msgs.push(cur);
      cur = { date: m[1], time: m[2], who: m[3].trim(), text: m[4].trim() };
    } else if (cur && line.trim()) {
      cur.text += '\n' + line.trim();          // הודעה רב-שורתית
    }
  }
  if (cur) msgs.push(cur);

  // פחות משתי הודעות — כנראה סתם טקסט, לא ייצוא
  if (msgs.length < 2) return null;
  const who = [...new Set(msgs.map(m => m.who))];
  return { msgs, speakers: who };
}

/** טקסט נקי לשליחה: בלי חותמות זמן, עם דובר לפני כל שורה */
export function flatten(raw) {
  const wa = parseWhatsApp(raw);
  if (!wa) return String(raw || '').trim();
  return wa.msgs
    .filter(m => !/^(הודעה זו נמחקה|<המדיה לא נכללה>|צורף\b)/.test(m.text))
    .map(m => `${m.who}: ${m.text}`)
    .join('\n');
}

/* ============================================================
   2. חילוץ מקומי — עובד תמיד, גם בלי מפתח ובלי רשת
   ============================================================ */

const MONEY_RE = /(?:₪|ש"ח|שח|שקל(?:ים)?)\s*([\d,]+(?:\.\d+)?)|([\d,]{3,})\s*(?:₪|ש"ח|שח|שקלים)/g;
const DATE_RE = /\b(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b/g;
const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** מה שאפשר לדעת בוודאות בלי מודל: מספרים, תאריכים, קישורים, דוברים. */
export function localFacts(raw) {
  const text = String(raw || '').replace(INVISIBLE, '');
  const wa = parseWhatsApp(text);

  const money = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const n = Number((m[1] || m[2] || '').replace(/,/g, ''));
    if (n >= 50 && n <= 500000 && !money.includes(n)) money.push(n);
  }

  const dates = [...new Set([...text.matchAll(DATE_RE)].map(m => m[1]))].slice(0, 8);
  const links = [...new Set([...text.matchAll(URL_RE)].map(m => m[0]))].slice(0, 12);

  return {
    money, dates, links,
    speakers: wa ? wa.speakers : [],
    messages: wa ? wa.msgs.length : 0,
    chars: text.length,
    isWhatsApp: !!wa
  };
}

/* ============================================================
   3. אחסון — מקורות ובריף על הלקוח
   ============================================================ */

export const sourcesOf = it => (it && it.briefSources) || [];
export const briefOf = it => (it && it.brief) || null;

/** מוסיף ערימת טקסט ללקוח. הטקסט נשמר כמות שהוא. */
export function addSource(itemId, raw, label = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  const facts = localFacts(text);
  const src = {
    id: uid('src'),
    at: Date.now(),
    label: label || (facts.isWhatsApp ? 'וואטסאפ · ' + facts.messages + ' הודעות' : 'טקסט'),
    text,
    facts
  };
  update(s => {
    const it = s.items.find(i => i.id === itemId);
    if (!it) return;
    it.briefSources = (it.briefSources || []).concat(src);
    it.updatedAt = Date.now();
  }, { label: 'הוספת התכתבות' });
  return src;
}

export function removeSource(itemId, srcId) {
  update(s => {
    const it = s.items.find(i => i.id === itemId);
    if (!it) return;
    it.briefSources = (it.briefSources || []).filter(x => x.id !== srcId);
    it.updatedAt = Date.now();
  }, { label: 'מחיקת התכתבות' });
}

/* ============================================================
   4. הסידור
   ============================================================ */

/** שולח את כל המקורות של הלקוח לסידור. מחזיר {ok, brief} או {error}. */
export async function organize(itemId) {
  const it = S().items.find(i => i.id === itemId);
  if (!it) return { error: 'הלקוח לא נמצא' };

  const sources = sourcesOf(it);
  if (!sources.length) return { error: 'אין מה לסדר — לא הדבקת עדיין כלום' };

  const text = sources
    .map(s2 => (sources.length > 1 ? `--- ${s2.label} ---\n` : '') + flatten(s2.text))
    .join('\n\n');

  let r;
  try {
    r = await callAssistant({
      mode: 'brief',
      text,
      me: S().settings.ownerName || 'אלון'
    });
  } catch (e) {
    return { error: 'אין חיבור לשרת: ' + e.message };
  }

  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { error: body.hint ? body.error + ' — ' + body.hint : (body.error || 'שגיאה ' + r.status) };

  const brief = Object.assign({}, body.brief, { at: Date.now(), sourceCount: sources.length });
  update(s => {
    const x = s.items.find(i => i.id === itemId);
    if (x) { x.brief = brief; x.updatedAt = Date.now(); }
  }, { label: 'סידור התכתבות' });

  return { ok: true, brief };
}

export function clearBrief(itemId) {
  update(s => {
    const it = s.items.find(i => i.id === itemId);
    if (it) { delete it.brief; it.updatedAt = Date.now(); }
  }, { label: 'מחיקת הסידור' });
}

/* ============================================================
   5. מהסידור אל המערכת
   ------------------------------------------------------------
   בריף שנשאר טקסט הוא עוד מסמך. הערך הוא בלחיצה שמכניסה שורה
   ממנו למקום שבו היא באמת פועלת.
   ============================================================ */

/** משימה מהבריף → משימה אמיתית, מקושרת ללקוח */
export function taskFromBrief(itemId, text, urgent) {
  const c = S().items.find(i => i.id === itemId);
  return addItem({
    type: 'task',
    title: text,
    clientId: itemId,
    note: c ? 'מהשיחה עם ' + c.title : '',
    urgent: !!urgent
  });
}

/** שאלה פתוחה → משימה "לשאול את X" */
export function askFromBrief(itemId, question) {
  const c = S().items.find(i => i.id === itemId);
  return addItem({
    type: 'task',
    title: 'לשאול את ' + (c ? c.title : 'הלקוח') + ': ' + question,
    clientId: itemId,
    urgent: true
  });
}

/** מחיר שסוכם → שדה הסכום של הלקוח */
export function applyPrice(itemId, value) {
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  if (!n) return false;
  patchItem(itemId, { amount: n }, 'עדכון מחיר מהשיחה');
  return n;
}

/** תאריך שסוכם → תאריך יעד */
export function applyDate(itemId, value) {
  const ts = parseHebDate(value);
  if (!ts) return false;
  patchItem(itemId, { dueDate: ts }, 'עדכון תאריך יעד מהשיחה');
  return ts;
}

/** 17.8 / 17.8.26 / 17/08/2026 → חותמת. מחזיר null אם לא ניתן לפענוח. */
export function parseHebDate(v) {
  const m = String(v || '').match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y = m[3] ? +m[3] : new Date().getFullYear();
  if (y < 100) y += 2000;
  const ts = new Date(y, mo - 1, d, 12, 0, 0).getTime();
  return isNaN(ts) ? null : ts;
}
