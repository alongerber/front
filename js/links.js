/* ============================================================
   links.js — קישורים דו-כיווניים בין פריטים
   ------------------------------------------------------------
   כותבים @דני בפתק, ובכרטיס של דני מופיע "3 פתקים מזכירים אותך".
   זה מה שגוגל Keep לא יודע לעשות, ואצלנו זה טבעי — הכל כבר יושב
   באותו מודל נתונים.

   הקישור נשמר כמזהה במערך item.links, לא כטקסט. שינוי שם של לקוח
   לא שובר כלום, ומחיקה מנקה את עצמה.
   ============================================================ */

import { S, update, getItem, typeMeta } from './store.js';

/* ---------- קריאה ---------- */

/** הפריטים שהפריט הזה מקשר אליהם */
export function linksOf(id) {
  const it = getItem(id);
  if (!it || !Array.isArray(it.links)) return [];
  return it.links.map(getItem).filter(Boolean);
}

/** מי מקשר לפריט הזה — הכיוון ההפוך, שנבנה לבד */
export function backlinksOf(id) {
  return S().items.filter(i => !i.archived && Array.isArray(i.links) && i.links.includes(id));
}

export const linkCount = id => linksOf(id).length + backlinksOf(id).length;

/* ---------- כתיבה ---------- */

export function addLink(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return false;
  const from = getItem(fromId), to = getItem(toId);
  if (!from || !to) return false;
  if (Array.isArray(from.links) && from.links.includes(toId)) return false;
  update(s => {
    const it = s.items.find(x => x.id === fromId);
    if (!it) return;
    if (!Array.isArray(it.links)) it.links = [];
    it.links.push(toId);
    it.updatedAt = Date.now();
  }, { label: `קישור ל"${to.title}"` });
  return true;
}

export function removeLink(fromId, toId) {
  update(s => {
    const it = s.items.find(x => x.id === fromId);
    if (it && Array.isArray(it.links)) it.links = it.links.filter(x => x !== toId);
  }, { label: 'הסרת קישור' });
}

/** נקרא כשמוחקים פריט — שלא יישארו קישורים לשום מקום */
export function cleanupLinksTo(id) {
  update(s => {
    s.items.forEach(i => {
      if (Array.isArray(i.links) && i.links.includes(id)) i.links = i.links.filter(x => x !== id);
    });
  }, { silent: true });
}

/* ---------- חיפוש מועמדים ל-@ ---------- */

const NIQQUD = /[֑-ׇ]/g;
const norm = s => String(s || '').replace(NIQQUD, '').replace(/["'`׳״]/g, '').toLowerCase().trim();

/** מועמדים לאזכור, ממוינים לפי רלוונטיות */
export function candidates(query = '', { exclude = null, limit = 8 } = {}) {
  const q = norm(query);
  const now = Date.now();
  const HOUR = 3600000;

  return S().items
    .filter(i => !i.archived && i.id !== exclude && (i.type !== 'note' || i.title))
    .map(i => {
      const t = norm(i.title);
      const b = norm(i.business || '');
      let score = -1;
      if (!q) score = 0;
      else if (t.startsWith(q)) score = 100;
      else if (t.includes(q)) score = 60;
      else if (b.includes(q)) score = 40;
      if (score < 0) return null;
      // לקוחות ותחומים קופצים ראשונים, ואחריהם מה שנגעת בו לאחרונה
      if (i.type === 'client') score += 12;
      if (i.type === 'bucket') score += 8;
      score += Math.max(0, 10 - (now - (i.updatedAt || 0)) / (24 * HOUR));
      return { item: i, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.item);
}

export const iconOf = it => typeMeta(it.type).icon;
