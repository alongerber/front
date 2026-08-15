/* ============================================================
   presence.js — האם אתה ליד המחשב בכלל
   ------------------------------------------------------------
   Idle Detection API: בניגוד ל-Page Visibility, שרואה רק את הלשונית
   שלנו, זה רואה הקלדה ותזוזת עכבר בכל מקום במערכת — גם בוגאס, גם
   בפוטושופ — ויודע אם המסך ננעל.

   זה החצי שהיה חסר. הטיימר אומר *על מה* אתה עובד; זה אומר *האם*.
   שעות נטו על דני = הזמן שהטיימר היה על דני, פחות הרגעים שלא היית.

   קיים בכרום ובאדג' בלבד, ודורש אישור חד-פעמי. בלעדיו המערכת נופלת
   חזרה למה שהיה, ואומרת את זה.
   ============================================================ */

import { S, update } from './store.js';
import { MIN, HOUR, DAY } from './util.js';

const now = () => Date.now();
const THRESHOLD = 60000;          // המינימום שה-API מאפשר
const KEEP_DAYS = 45;

let detector = null;
let ctrl = null;
const listeners = new Set();

export const supported = () => 'IdleDetector' in window;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = st => listeners.forEach(f => { try { f(st); } catch (e) { console.error(e); } });

/* ---------- הרשאה ---------- */

export async function permission() {
  if (!supported()) return 'unsupported';
  try {
    const p = await navigator.permissions.query({ name: 'idle-detection' });
    return p.state;                                   // 'granted' | 'prompt' | 'denied'
  } catch { return 'prompt'; }
}

/** חייב לרוץ מתוך לחיצה של המשתמש */
export async function requestPermission() {
  if (!supported()) return 'unsupported';
  const p = await IdleDetector.requestPermission();
  if (p === 'granted') { update(s => { s.settings.presenceEnabled = true; }); await start(); }
  return p;
}

/* ---------- יומן הנוכחות ----------
   שומרים רק נקודות מעבר, לא כל שנייה. [{t, active}] */

function log() { return S().presenceLog || []; }

function push(active) {
  const l = log();
  const last = l[l.length - 1];
  if (last && last.active === active) return;         // אין שינוי
  update(s => {
    if (!Array.isArray(s.presenceLog)) s.presenceLog = [];
    s.presenceLog.push({ t: now(), active });
    // גיזום — מחזיקים חודש וחצי אחורה
    const cut = now() - KEEP_DAYS * DAY;
    const keep = s.presenceLog.filter(x => x.t >= cut);
    // משאירים נקודה אחת לפני החיתוך, שנדע באיזה מצב היינו
    const before = s.presenceLog.filter(x => x.t < cut).pop();
    s.presenceLog = before ? [{ t: cut, active: before.active }, ...keep] : keep;
  }, { silent: true });
  emit(active);
}

/* ---------- ההפעלה ---------- */

export const running = () => !!detector;
export let lastState = { user: 'active', screen: 'unlocked' };

export async function start() {
  if (!supported()) return false;
  if (!S().settings.presenceEnabled) return false;
  if (await permission() !== 'granted') return false;
  if (detector) return true;

  try {
    ctrl = new AbortController();
    detector = new IdleDetector();
    detector.addEventListener('change', () => {
      lastState = { user: detector.userState, screen: detector.screenState };
      push(isActiveNow());
    });
    await detector.start({ threshold: THRESHOLD, signal: ctrl.signal });
    lastState = { user: detector.userState, screen: detector.screenState };
    push(isActiveNow());
    return true;
  } catch (e) {
    console.warn('זיהוי נוכחות לא הופעל', e);
    detector = null;
    return false;
  }
}

export function stop() {
  try { ctrl && ctrl.abort(); } catch { /* כבר נסגר */ }
  detector = null; ctrl = null;
}

export const isActiveNow = () =>
  lastState.user === 'active' && lastState.screen !== 'locked';

/* ---------- חישוב ---------- */

/**
 * כמה מתוך הקטע [from,to] היית באמת ליד המחשב.
 * בלי יומן — מחזיר את כל הקטע, כלומר לא גורע כלום.
 */
export function activeMsIn(from, to) {
  const l = log();
  if (!l.length || to <= from) return Math.max(0, to - from);

  // חיפוש בינארי לנקודה הראשונה שאחרי from — היומן ממוין לפי זמן,
  // וזה נקרא בלולאה על כל רשומת זמן, אז סריקה מלאה מתחילה להיות יקרה
  let lo = 0, hi = l.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (l[m].t <= from) lo = m + 1; else hi = m; }

  let state = lo > 0 ? l[lo - 1].active : true;   // המצב שבו היינו כשהקטע התחיל
  let cursor = from, ms = 0;

  for (let i = lo; i < l.length && l[i].t < to; i++) {
    if (state) ms += l[i].t - cursor;
    cursor = l[i].t; state = l[i].active;
  }
  if (state) ms += to - cursor;
  return Math.max(0, ms);
}

/** כמה זמן נגרע מקטע — מה שלא היית */
export const awayMsIn = (from, to) => Math.max(0, (to - from) - activeMsIn(from, to));

/** האם יש בכלל נתוני נוכחות לתקופה הזאת */
export function hasData(from = 0) {
  const l = log();
  return l.length > 0 && l[0].t <= Math.max(from, now() - HOUR);
}

/** כמה זמן היית ליד המחשב היום */
export function activeToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return activeMsIn(d.getTime(), now());
}

/* ---------- מצב לתצוגה ---------- */

export async function status() {
  if (!supported()) return { level: 'unsupported', text: 'הדפדפן הזה לא תומך. בכרום או באדג\' המערכת תדע לבד מתי לא היית ליד המחשב.' };
  const p = await permission();
  if (!S().settings.presenceEnabled) return { level: 'off', text: 'כבוי. בלי זה, זמן שבו קמת מהמחשב עדיין נספר כעבודה.' };
  if (p === 'denied') return { level: 'denied', text: 'חסמת את ההרשאה. אייקון המנעול בשורת הכתובת → זיהוי חוסר פעילות → אפשר.' };
  if (p !== 'granted') return { level: 'prompt', text: 'צריך אישור חד-פעמי כדי שהמערכת תדע מתי אינך ליד המחשב.' };
  if (!detector) return { level: 'prompt', text: 'ההרשאה קיימת אבל הזיהוי לא רץ. רענן את הדף.' };
  const away = awayMsIn(now() - 8 * HOUR, now());
  return {
    level: 'on',
    text: away > MIN
      ? `פעיל. ב-8 השעות האחרונות נגרעו ${Math.round(away / MIN)} דקות שלא היית ליד המחשב.`
      : 'פעיל. עוקב אחרי נוכחות בכל המערכת, לא רק בלשונית הזאת.'
  };
}
