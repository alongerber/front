/* ============================================================
   autobackup.js — גיבוי אוטומטי לתיקייה אמיתית
   הגיבוי הידני תלוי בזה שתזכור ללחוץ, וזה הנתון היחיד שאין ממנו העתק.
   כאן בוחרים תיקייה פעם אחת, והמערכת כותבת לשם לבד.

   עובד בכרום ובאדג' (File System Access API). בספארי ובפיירפוקס
   אין את ה-API הזה — שם פשוט לא מציגים את האפשרות.
   ============================================================ */

import { S, update, exportJSON, liveAttachmentIds } from './store.js';
import { DAY } from './util.js';
import * as A from './attachments.js';

const HANDLE_KEY = 'backupDir';
const KEEP = 30;                     // כמה קבצים יומיים לשמור בתיקייה

export const supported = () => typeof window.showDirectoryPicker === 'function';

let cached = undefined;              // undefined = לא נבדק, null = אין

async function handle() {
  if (cached !== undefined) return cached;
  try { cached = (await A.getMeta(HANDLE_KEY)) || null; }
  catch { cached = null; }
  return cached;
}

/** 'granted' | 'prompt' | 'none' — האם מותר לנו לכתוב לתיקייה */
export async function status() {
  const h = await handle();
  if (!h) return 'none';
  try { return await h.queryPermission({ mode: 'readwrite' }); }
  catch { return 'none'; }
}

export async function folderName() {
  const h = await handle();
  return h ? h.name : null;
}

/** בחירת תיקייה. חייב לרוץ מתוך לחיצה של המשתמש. */
export async function chooseFolder() {
  if (!supported()) throw new Error('הדפדפן הזה לא תומך בבחירת תיקייה. השתמש בכרום או אדג\'.');
  const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'front-backup' });
  const perm = await h.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('לא ניתנה הרשאת כתיבה');
  await A.putMeta(HANDLE_KEY, h);
  cached = h;
  return h.name;
}

/** מבקש מחדש הרשאה לתיקייה שכבר נבחרה. גם זה חייב לחיצה. */
export async function reconnect() {
  const h = await handle();
  if (!h) return false;
  const perm = await h.requestPermission({ mode: 'readwrite' });
  return perm === 'granted';
}

export async function forget() {
  await A.delMeta(HANDLE_KEY);
  cached = null;
}

const fileName = (d = new Date()) =>
  `front-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;

/** כותב גיבוי עכשיו. מחזיר את שם הקובץ. */
export async function backupNow({ withFiles = null } = {}) {
  const h = await handle();
  if (!h) throw new Error('לא נבחרה תיקייה');
  if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted')
    throw new Error('אין הרשאת כתיבה לתיקייה. לחץ "חבר מחדש".');

  const inclFiles = withFiles === null ? !!S().settings.autoBackupFiles : withFiles;
  const obj = JSON.parse(exportJSON());
  if (inclFiles) {
    const ids = liveAttachmentIds();
    if (ids.length) obj._files = await A.exportAll(ids);
  }

  const name = fileName();
  const fh = await h.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(obj));
  await w.close();

  update(s => { s.settings.lastBackupAt = Date.now(); s.settings.lastAutoBackupAt = Date.now(); });
  prune(h).catch(() => { });
  return name;
}

/** מוחק גיבויים ישנים, שלא תתמלא התיקייה */
async function prune(h) {
  const names = [];
  for await (const [name, entry] of h.entries()) {
    if (entry.kind === 'file' && /^front-\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name);
  }
  names.sort();
  for (const n of names.slice(0, Math.max(0, names.length - KEEP))) {
    try { await h.removeEntry(n); } catch { /* לא נורא */ }
  }
}

/** נקרא באתחול. מגבה אם עבר מספיק זמן, בשקט. */
export async function maybeBackup() {
  const st = S().settings;
  if (!st.autoBackupDir) return null;
  if (await status() !== 'granted') return null;

  const last = st.lastAutoBackupAt || 0;
  const every = Math.max(1, st.autoBackupDays || 3) * DAY;
  // גם אם עבר פחות מהמרווח — אם עוד לא גובה היום בכלל, שווה לכתוב
  if (Date.now() - last < Math.min(every, DAY)) return null;

  try { return await backupNow(); }
  catch (e) { console.warn('גיבוי אוטומטי נכשל', e); return null; }
}
