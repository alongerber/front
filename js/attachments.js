/* ============================================================
   attachments.js — קבצים ותמונות
   ה-localStorage מחזיק בערך 5MB וכל התוכן שלו הוא טקסט. תמונה אחת
   מהטלפון גדולה מזה. לכן הקבצים עצמם יושבים ב-IndexedDB (מאות MB),
   ורק המטא-דאטה (שם, סוג, גודל) נשמר עם הפתק ב-localStorage.
   ============================================================ */

const DB_NAME = 'front.files';
const STORE = 'blobs';
const META = 'meta';        // דברים קטנים שלא נכנסים ל-localStorage, כמו מצביע לתיקיית הגיבוי
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn, storeName = STORE) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('הפעולה בוטלה'));
  }));
}

/* ---------- API ---------- */

export const putBlob = (id, blob) => tx('readwrite', s => s.put(blob, id));
export const getBlob = id => tx('readonly', s => s.get(id));
export const delBlob = id => tx('readwrite', s => s.delete(id));
export const allKeys = () => tx('readonly', s => s.getAllKeys());

/* מפתח/ערך קטן — משמש למצביע לתיקיית הגיבוי, שאי אפשר לשמור ב-localStorage */
export const putMeta = (k, v) => tx('readwrite', s => s.put(v, k), META);
export const getMeta = k => tx('readonly', s => s.get(k), META);
export const delMeta = k => tx('readwrite', s => s.delete(k), META);

/** כמה מקום תופסים הקבצים, וכמה נשאר */
export async function usage() {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e) return { used: e.usage || 0, quota: e.quota || 0 };
  } catch { /* לא נתמך */ }
  return { used: 0, quota: 0 };
}

/* ---------- כתובות תצוגה ---------- */

const urlCache = new Map();

/** מחזיר כתובת להצגה. שומר במטמון כדי לא ליצור URL חדש בכל רינדור. */
export async function blobUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getBlob(id);
  if (!b) return null;
  const url = URL.createObjectURL(b);
  urlCache.set(id, url);
  return url;
}

export function releaseUrl(id) {
  const u = urlCache.get(id);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
}

/* ---------- כיווץ תמונות ---------- */

const MAX_EDGE = 1600;      // מספיק לצפייה, חוסך פי כמה במקום
const JPEG_Q = 0.82;

/** מכווץ תמונה לפני שמירה. קבצים אחרים עוברים כמו שהם. */
export async function prepareFile(file) {
  const isImage = /^image\//.test(file.type) && !/svg/.test(file.type);
  if (!isImage) return { blob: file, width: 0, height: 0 };

  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 400 * 1024) {
      const r = { blob: file, width: bmp.width, height: bmp.height };
      bmp.close();
      return r;
    }
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', JPEG_Q));
    return { blob: blob || file, width: w, height: h };
  } catch {
    return { blob: file, width: 0, height: 0 };   // כיווץ נכשל — שומרים מקורי
  }
}

/* ---------- ייצוא וייבוא ---------- */

const toBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

function fromBase64(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'application/octet-stream' });
}

/** אוסף את כל הקבצים לאובייקט אחד, לצירוף לגיבוי */
export async function exportAll(ids) {
  const keys = ids || await allKeys();
  const out = {};
  for (const k of keys) {
    const b = await getBlob(k);
    if (!b) continue;
    out[k] = { mime: b.type, data: await toBase64(b) };
  }
  return out;
}

/** משחזר קבצים מגיבוי */
export async function importAll(map) {
  if (!map) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(map)) {
    if (!v || !v.data) continue;
    await putBlob(k, fromBase64(v.data, v.mime));
    n++;
  }
  return n;
}

/** מוחק קבצים שאף פתק כבר לא מפנה אליהם */
export async function pruneOrphans(liveIds) {
  const live = new Set(liveIds);
  const keys = await allKeys();
  let removed = 0;
  for (const k of keys) {
    if (!live.has(k)) { await delBlob(k); releaseUrl(k); removed++; }
  }
  return removed;
}

export const fmtSize = n =>
  n > 1048576 ? (n / 1048576).toFixed(1) + ' MB'
    : n > 1024 ? Math.round(n / 1024) + ' KB'
      : n + ' B';
