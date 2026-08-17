/* ============================================================
   sync.js — הסנכרון בצד הדפדפן
   ------------------------------------------------------------
   התשובה ל"למה מה שקלטתי בטלפון לא במחשב": עד עכשיו הנתונים
   מעולם לא עלו לשום מקום. עכשיו יש מקום אחד בענן, וכל מכשיר
   דוחף אליו את המצב שלו וקורא ממנו את של האחרים.

   מקומי-קודם (local-first): הכל עובד בלי רשת בדיוק כמו קודם.
   הסנכרון הוא שכבה מעל, ואם הוא נכשל שום דבר לא נעצר.

   מתי זה קורה:
     · בפתיחת המערכת
     · בכל חזרה ללשונית
     · 8 שניות אחרי השינוי האחרון (כדי לא לדחוף בכל הקלדה)
     · כל 5 דקות
     · בלחיצה על "סנכרן עכשיו"
   ============================================================ */

import { S, update, syncSnapshot, applySyncDoc } from './store.js';

const TOKEN_KEY = 'front.syncToken';
const CANDIDATES = ['/api/sync', '/.netlify/functions/sync'];
const DEBOUNCE = 8000;
const PERIOD = 5 * 60000;

let resolved = null;
let timer = null;
let periodic = null;
let inFlight = null;
let listeners = new Set();

/* ---------- מצב שמוצג למשתמש ---------- */

let status = { state: 'idle', at: 0, msg: '', report: null };

export const getStatus = () => status;
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(next) {
  status = Object.assign({}, status, next);
  listeners.forEach(f => { try { f(status); } catch (e) { console.error(e); } });
}

/* ---------- הטוקן ---------- */

/* הטוקן יושב ב-localStorage ולא בקוד ולא במצב המסונכרן — אחרת הוא
   היה נוסע בגיבויים ובין מכשירים בלי כוונה. */
export const token = () => localStorage.getItem(TOKEN_KEY) || '';
export function setToken(v) {
  const t = String(v || '').trim();
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  setStatus({ state: 'idle', msg: '' });
}
export const enabled = () => !!S().settings.syncEnabled && !!token();

/** מייצר טוקן חדש להדבקה במשתני הסביבה. 32 בתים אקראיים. */
export function suggestToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- הרשת ---------- */

async function post(payload) {
  const list = resolved ? [resolved] : CANDIDATES;
  let last = null;
  for (const url of list) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token() },
        body: JSON.stringify(payload)
      });
    } catch (e) { last = e; continue; }
    // 404/405 = הנתיב לא קיים אצל הספק הזה, ננסה את השני
    if ((r.status === 404 || r.status === 405) && !resolved) { last = new Error('לא נמצא'); continue; }
    resolved = url;
    return r;
  }
  resolved = null;
  throw last || new Error('אין חיבור');
}

/* ---------- הסנכרון עצמו ---------- */

/**
 * דוחף את המצב המלא וממזג את מה שחוזר.
 * מצב מלא ולא "רק מה שהשתנה": הוא עשרות קילובייטים, וזה מבטל
 * את כל משפחת הבאגים של סמנים — כל סנכרון מאשר מחדש את הכל,
 * ובקשה שנפלה נרפאת לבד בסנכרון הבא.
 */
export async function syncNow({ quiet = false } = {}) {
  if (!enabled()) return { skipped: 'מכובה' };
  if (inFlight) return inFlight;

  const run = (async () => {
    if (!quiet) setStatus({ state: 'busy', msg: 'מסנכרן…' });
    try {
      const snap = syncSnapshot();
      const r = await post(snap);
      const body = await r.json().catch(() => ({}));

      if (!r.ok) {
        const msg = body.hint ? body.error + ' — ' + body.hint : (body.error || 'שגיאה ' + r.status);
        setStatus({ state: 'error', at: Date.now(), msg });
        return { error: msg, status: r.status };
      }

      const report = applySyncDoc(body.doc) || { added: 0, updated: 0, removed: 0 };
      update(s => { s.settings.syncLastAt = Date.now(); }, { silent: true });
      const changed = report.added + report.updated + report.removed;
      setStatus({
        state: 'ok', at: Date.now(), report,
        msg: changed ? `${report.added} חדשים · ${report.updated} עודכנו · ${report.removed} נמחקו` : 'מעודכן'
      });
      if (changed) window.dispatchEvent(new CustomEvent('front:synced', { detail: report }));
      return report;
    } catch (e) {
      setStatus({ state: 'error', at: Date.now(), msg: e.message || 'הסנכרון נכשל' });
      return { error: e.message };
    } finally {
      inFlight = null;
    }
  })();

  inFlight = run;
  return run;
}

/**
 * בדיקת חיבור. מריצה קריאה *וגם* כתיבה בפועל.
 * בדיקה שרק קוראת יכולה לומר "מחובר" בזמן שהכתיבה שבורה —
 * וזה כשל שמתגלה רק אחרי שכבר סמכת עליה.
 */
export async function test() {
  if (!token()) return { ok: false, msg: 'לא הוגדר טוקן' };
  try {
    const r = await post({ mode: 'probe' });
    const body = await r.json().catch(() => ({}));
    if (r.status === 501) return { ok: false, msg: body.hint || 'SYNC_TOKEN לא מוגדר בשרת' };
    if (r.status === 401) return { ok: false, msg: 'הטוקן כאן לא תואם את זה שבשרת' };
    if (r.status === 503) return { ok: false, msg: body.error + ' — ' + (body.hint || '') };
    if (!r.ok) return { ok: false, msg: body.error || 'שגיאה ' + r.status };
    if (!body.canWrite) return { ok: false, msg: 'קריאה עובדת אבל כתיבה לא נבדקה — עדכן את השרת' };
    const n = ((body.doc || {}).items || []).length;
    return {
      ok: true,
      msg: n ? `מחובר, קריאה וכתיבה עובדות. בענן יש ${n} פריטים.`
             : 'מחובר, קריאה וכתיבה עובדות. הענן עוד ריק — הסנכרון הראשון ימלא אותו.'
    };
  } catch (e) {
    return { ok: false, msg: 'אין חיבור לנקודת הקצה: ' + e.message };
  }
}

/* ---------- מתי ---------- */

/** קורא לסנכרון אחרי שהשקט חוזר, כדי לא לדחוף בכל הקלדה */
export function nudge() {
  if (!enabled()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow({ quiet: true }), DEBOUNCE);
}

export function start() {
  if (!enabled()) return;

  syncNow({ quiet: true });

  clearInterval(periodic);
  periodic = setInterval(() => { if (!document.hidden) syncNow({ quiet: true }); }, PERIOD);

  // חזרה ללשונית היא הרגע הכי סביר שמכשיר אחר כתב משהו
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow({ quiet: true });
  });

  /* אין ניסיון דחיפה ביציאה. sendBeacon לא יכול לשלוח כותרת, וזה היה
     מחייב טוקן בכתובת — כלומר טוקן שנכתב ליומני השרת. במקום זה
     ההשהיה של 8 שניות והסנכרון בפתיחה מכסים את המקרה. */
}

export function stop() {
  clearTimeout(timer);
  clearInterval(periodic);
  timer = periodic = null;
}
