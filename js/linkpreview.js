/* ============================================================
   linkpreview.js — כרטיסיות לקישורים
   ------------------------------------------------------------
   מדביקים לינק, ובעוד חודש עדיין יודעים על מה מדובר.

   שלוש שכבות:
     1. מטא-דאטה (OG / oEmbed) — חינם, בלי קלוד
     2. משפט סיכום בעברית — עולה גרושים, ניתן לכיבוי
     3. הכל נשמר מקומית, כולל התמונה הממוזערת, אז הכרטיסייה
        ממשיכה להיראות אותו דבר גם אם הדף יימחק מהאינטרנט

   הבקשה עוברת דרך פונקציית השרת שכבר קיימת — הדפדפן לבדו
   לא יכול למשוך דף אחר בגלל CORS.
   ============================================================ */

import { S, update, patchItem, getItem } from './store.js';
import { DAY } from './util.js';
import { callAssistant } from './api.js';
import * as A from './attachments.js';

const now = () => Date.now();
const inFlight = new Map();

export const hasPreview = it => !!(it && it.preview && it.preview.fetchedAt);

/** האם כדאי למשוך תצוגה מקדימה לפריט הזה */
export function needsPreview(it) {
  if (!it || !it.url) return false;
  if (!S().settings.linkPreview) return false;
  if (!it.preview) return true;
  if (it.preview.failed && now() - it.preview.fetchedAt < 3 * DAY) return false;  // לא מנסים שוב מיד
  return !it.preview.fetchedAt;
}

/**
 * מושך תצוגה מקדימה ושומר על הפריט. בטוח לקרוא פעמיים —
 * בקשה שכבר רצה על אותו פריט מוחזרת כמו שהיא.
 */
export function fetchPreview(itemId, { summarize = null, force = false } = {}) {
  if (inFlight.has(itemId)) return inFlight.get(itemId);

  const it = getItem(itemId);
  if (!it || !it.url) return Promise.resolve(null);
  if (!force && !needsPreview(it)) return Promise.resolve(it.preview || null);

  const wantSummary = summarize === null
    ? !!(S().settings.linkSummary && S().settings.assistantEnabled)
    : summarize;

  const p = (async () => {
    try {
      const r = await callAssistant({ mode: 'link', url: it.url, summarize: wantSummary });
      if (!r || !r.ok) throw new Error('הפונקציה לא זמינה');
      const j = await r.json();
      if (!j || j.error) throw new Error(j && j.error || 'שגיאה');

      const preview = {
        title: j.title || '', desc: j.desc || '', summary: j.summary || '',
        site: j.site || j.host || '', author: j.author || '', kind: j.kind || 'page',
        host: j.host || '', imageId: null, fetchedAt: now(), failed: false
      };

      // התמונה יורדת פעם אחת ל-IndexedDB, כדי שהכרטיסייה תשרוד גם בלי רשת
      if (j.image) {
        const id = await cacheImage(itemId, j.image);
        if (id) preview.imageId = id;
        else preview.imageUrl = j.image;             // לא הצלחנו לשמור — לפחות נציג מרחוק
      }

      patchItem(itemId, { preview });
      return preview;
    } catch (e) {
      const preview = { failed: true, reason: String(e.message || e), fetchedAt: now() };
      patchItem(itemId, { preview });
      return preview;
    } finally {
      inFlight.delete(itemId);
    }
  })();

  inFlight.set(itemId, p);
  return p;
}

/** מוריד את התמונה הממוזערת ושומר אותה מקומית */
async function cacheImage(itemId, url) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!/^image\//.test(blob.type) || blob.size > 3 * 1024 * 1024) return null;
    const { blob: small } = await A.prepareFile(new File([blob], 'thumb', { type: blob.type }));
    const id = 'prev_' + itemId;
    await A.putBlob(id, small);
    A.releaseUrl(id);
    return id;
  } catch { return null; }
}

/** מוחק את התמונה השמורה — נקרא כשמוחקים פריט או מרעננים */
export async function dropPreviewImage(itemId) {
  const id = 'prev_' + itemId;
  try { await A.delBlob(id); A.releaseUrl(id); } catch { /* לא היה */ }
}

/** רץ ברקע על פריטים חדשים עם לינק. לא חוסם כלום. */
export function backfill({ limit = 3 } = {}) {
  if (!S().settings.linkPreview) return;
  const todo = S().items
    .filter(i => !i.archived && i.url && needsPreview(i))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
  todo.forEach(i => fetchPreview(i.id).catch(() => { }));
  return todo.length;
}

/** מה להציג ככותרת: מה שהמשתמש כתב מנצח, אחרת מה שהדף אמר */
export function displayTitle(it) {
  if (it.title && it.title.trim()) return it.title;
  if (it.preview && it.preview.title) return it.preview.title;
  return it.url || '';
}

/** משפט אחד שיסביר בעוד חודש על מה מדובר */
export function blurb(it) {
  const p = it.preview;
  if (!p || p.failed) return '';
  return p.summary || p.desc || '';
}
