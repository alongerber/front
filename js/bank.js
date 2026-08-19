/* ============================================================
   bank.js — בנק השוטים ותבניות התסריט
   ------------------------------------------------------------
   לא אחסון קבצים — אינדקס. הקבצים יושבים בדרייב ונשארים שם;
   כאן יושב מה שאי אפשר לחפש בדרייב: באיזה תגיות זה נכנס, איזה
   פרומפט יצר את זה, ובאיזה סרטון זה כבר עבד.

   שלוש החלטות שקובעות את המודול:

   1. הפרומפט הוא השדה החשוב. שוט אפשר לייצר שוב; פרומפט
      שאבד צריך להמציא מחדש. תקרה של 2,000 תווים, כי המצב כולו
      יושב ב-localStorage אחד וארבעה פרומפטים ארוכים שווים
      חמישים שוטים.

   2. שם הקובץ נשמר בנפרד מהלינק. לינקים לדרייב נשברים —
      תיקייה שהוזזה, קובץ ששונה שמו. שם שנשמר הוא מה שמאפשר
      למצוא את הקובץ גם כשהלינק כבר לא עובד.

   3. "השתמשתי בזה" מתחבר לטיימר. אם רץ טיימר על הפקה, השימוש
      נרשם עליה — ומונה השימושים נגזר מהרשימה הזאת, לא נשמר
      בנפרד. מונה שנשמר לחוד מתחיל לשקר ביום שמוחקים שימוש.
   ============================================================ */

import { S, addItem, patchItem, getItem, uid } from './store.js';
import * as T from './timer.js';
import * as P from './production.js';
import { addLink } from './links.js';
import { canonical, tagKey, tagPool } from './tagfield.js';

const now = () => Date.now();

export const PROMPT_MAX = 2000;

/* חמישה סוגים, כפי שביקשת. יותר מזה והמסנן מפסיק לעזור. */
export const SHOT_TYPES = {
  char:  { name: 'דמות',  icon: '🧍', color: '#5aa9ff' },
  place: { name: 'מקום',  icon: '🏙', color: '#3ddc84' },
  thing: { name: 'חפץ',   icon: '📦', color: '#ff9f43' },
  move:  { name: 'מעבר',  icon: '✂',  color: '#b98cff' },
  voice: { name: 'קול',   icon: '🔊', color: '#e879f9' }
};

export const shotMeta = k => SHOT_TYPES[k] || SHOT_TYPES.char;

export const trimPrompt = s => String(s || '').slice(0, PROMPT_MAX);

/* ============================================================
   1. שליפה
   ============================================================ */

export const shots = () => S().items.filter(i => i.type === 'shot' && !i.archived);
export const templates = () => S().items.filter(i => i.type === 'template' && !i.archived);
export const allOf = kind => (kind === 'template' ? templates() : shots());

export const usesOf = id => { const it = getItem(id); return (it && it.uses) || []; };
export const useCount = id => usesOf(id).length;
export const lastUsedAt = id => usesOf(id).reduce((a, u) => Math.max(a, u.at || 0), 0);

/** מתי נגעת בזה לאחרונה — שימוש או יצירה. זה סדר הרשימה. */
export const freshness = it => Math.max(lastUsedAt(it.id), it.updatedAt || 0, it.createdAt || 0);

/** התגיות שבשימוש בבנק עצמו, לשורת המסננים */
export const bankTags = () => tagPool({ types: ['shot', 'template'] });

/* ============================================================
   2. כתיבה
   ============================================================ */

const cleanTags = list => {
  const pool = tagPool();
  const out = [];
  (list || []).forEach(t => {
    const n = canonical(t, pool);
    if (n && !out.some(x => tagKey(x) === tagKey(n))) out.push(n);
  });
  return out;
};

export function addShot(data = {}) {
  const tags = cleanTags(data.tags);
  return addItem({
    type: 'shot',
    title: String(data.title || '').trim() || tags[0] || 'שוט',
    url: String(data.url || '').trim(),
    shotType: SHOT_TYPES[data.shotType] ? data.shotType : 'char',
    prompt: trimPrompt(data.prompt),
    note: data.note || '',
    tags,
    uses: []
  });
}

export function addTemplate(data = {}) {
  const domain = String(data.domain || '').trim();
  return addItem({
    type: 'template',
    title: String(data.title || '').trim() || domain || 'תבנית',
    domain,
    angles: data.angles || '',
    analogies: data.analogies || '',
    avoid: data.avoid || '',
    failed: data.failed || '',
    note: data.note || '',
    tags: cleanTags(data.tags),
    uses: []
  });
}

/** שמירת עריכה. מה שלא הועבר לא נגוע. */
export function save(id, data = {}) {
  const it = getItem(id);
  if (!it) return null;
  const patch = {};
  ['title', 'url', 'note', 'domain', 'angles', 'analogies', 'avoid', 'failed'].forEach(k => {
    if (k in data) patch[k] = typeof data[k] === 'string' ? data[k].trim() : data[k];
  });
  if ('shotType' in data) patch.shotType = SHOT_TYPES[data.shotType] ? data.shotType : it.shotType;
  if ('prompt' in data) patch.prompt = trimPrompt(data.prompt);
  if ('tags' in data) patch.tags = cleanTags(data.tags);
  if (!patch.title) patch.title = it.title;
  return patchItem(id, patch, 'עריכת ' + (it.type === 'template' ? 'תבנית' : 'שוט'));
}

/* ============================================================
   3. "השתמשתי בזה"
   ------------------------------------------------------------
   כפתור אחד. אם רץ טיימר — הוא יודע על מה, ואין מה לשאול.
   ============================================================ */

/** על מה הטיימר רץ עכשיו, מתורגם להפקה */
export function currentTarget() {
  const t = T.activeTimer();
  const it = t && t.itemId ? getItem(t.itemId) : null;
  if (!it) return null;
  if (it.type === 'production') return it;
  if (it.type === 'client') {
    /* טיימר על הלקוח — השימוש שייך להפקה שפתוחה עכשיו.
       אם כולן נמסרו, לאחרונה שבהן. */
    const list = P.productionsOf(it.id);
    return list.find(p => !p.deliveredAt) || list[list.length - 1] || it;
  }
  return it;
}

/**
 * רושם שימוש. מחזיר {ok, target} — target הוא null כשאין
 * טיימר, וזה בסדר גמור: השימוש נספר גם בלי שיוך.
 */
export function markUsed(id, at = now()) {
  const it = getItem(id);
  if (!it) return { ok: false };
  const target = currentTarget();
  const use = { id: uid('use'), at, itemId: target ? target.id : null };
  patchItem(id, { uses: (it.uses || []).concat(use) }, 'שימוש ב"' + (it.title || '') + '"');
  /* קישור דו-כיווני: בכרטיס ההפקה יופיע מה השתמשת בו. */
  if (target) addLink(id, target.id);
  return { ok: true, target };
}

/** ביטול השימוש האחרון — לחיצה בטעות היא לחיצה אחת מדי */
export function undoLastUse(id) {
  const list = usesOf(id);
  if (!list.length) return false;
  patchItem(id, { uses: list.slice(0, -1) }, 'ביטול שימוש');
  return true;
}

/* ============================================================
   4. חיפוש וסינון
   ============================================================ */

const NIQQUD = /[֑-ׇ]/g;
const norm = s => String(s || '').replace(NIQQUD, '').replace(/["'`׳״]/g, '').toLowerCase();

const hay = it => norm([
  it.title, it.note, it.prompt, it.domain,
  it.angles, it.analogies, it.avoid, it.failed,
  (it.tags || []).join(' '),
  it.type === 'shot' ? shotMeta(it.shotType).name : ''
].filter(Boolean).join(' '));

/**
 * הרשימה שהעמוד מציג. טקסט חופשי, סוג, ותגית — כל אחד לחוד
 * או ביחד. ממוין לפי מתי נגעת בזה לאחרונה, כך ששוט חדש נמצא
 * למעלה ביום שהוספת אותו, ושוט שחוזר שוב ושוב נשאר למעלה לבד.
 */
export function query(kind, { text = '', type = '', tag = '' } = {}) {
  const words = norm(text).split(/\s+/).filter(Boolean);
  return allOf(kind)
    .filter(it => {
      if (type && it.shotType !== type) return false;
      if (tag && !(it.tags || []).some(t => tagKey(t) === tagKey(tag))) return false;
      if (!words.length) return true;
      const h = hay(it);
      return words.every(w => h.includes(w));
    })
    .sort((a, b) => freshness(b) - freshness(a));
}

/* ============================================================
   5. הוספה מהירה
   ============================================================ */

/**
 * ניחוש שם מלינק. דרייב מחזיר /file/d/ID/view — אין שם בכתובת,
 * ואז מחזירים ריק ולא "view". שם ריק עדיף על שם שקרי.
 */
export function guessName(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  let u;
  try { u = new URL(raw); } catch { return ''; }
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const last = parts[parts.length - 1] || '';
  if (!last || /^(view|edit|preview|open|d|file|folder|drive|u|\d+)$/i.test(last)) return '';
  if (last.length > 60 && !/\s/.test(last)) return '';        // מזהה, לא שם
  return last.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_+-]+/g, ' ').trim();
}

/** הוספה מהירה: לינק ותגיות, בלי טופס */
export function quickAddShot({ url = '', tags = [], shotType = 'char' } = {}) {
  const clean = cleanTags(tags);
  const name = guessName(url);
  if (!url.trim() && !clean.length) return { error: 'צריך לינק או לפחות תגית אחת' };
  return { ok: true, item: addShot({ url, tags: clean, shotType, title: name || clean[0] || 'שוט' }) };
}

export function quickAddTemplate({ domain = '', tags = [] } = {}) {
  if (!String(domain).trim()) return { error: 'צריך תחום' };
  return { ok: true, item: addTemplate({ domain, tags }) };
}
