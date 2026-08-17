/* ============================================================
   timer.js — מנוע הזמן
   טיימר אחד פעיל · החלפה בלחיצה · מצב המתנה · זיהוי חזרה לטאב
   שלושה מספרים: זמן מהתחלה עד מסירה · זמן עבודה נטו · זמן זמין
   ============================================================ */

import { S, update, uid, getItem } from './store.js';
import { MIN, HOUR, DAY, startOfDay, endOfDay, toast } from './util.js';
import * as P from './presence.js';

/* סוגי זמן. focus=true נספר כזמן עבודה נטו ונכנס לתמחור.
   meet ו-fix נפרדים מ-work כי הם המספרים שבאמת מפתיעים בסוף החודש:
   כמה זמן הלך על שיחות, וכמה על סבבי תיקונים אחרי שהסרטון "נגמר". */
export const KINDS = {
  work:  { name: 'עבודה',   icon: '⏱', color: '#ffd400', focus: true },
  meet:  { name: 'פגישה',   icon: '💬', color: '#3ddc84', focus: true },
  fix:   { name: 'תיקונים', icon: '🔁', color: '#ff9f43', focus: true },
  learn: { name: 'למידה',   icon: '📚', color: '#b98cff', focus: true },
  wait:  { name: 'המתנה',   icon: '⏳', color: '#5aa9ff', focus: false },
  off:   { name: 'לא עבדתי', icon: '☕', color: 'rgba(255,255,255,.2)', focus: false }
};

/** הסוגים שמוצעים בכפתור החלפה — בלי המתנה והפסקה שיש להם כפתור משלהם */
export const SWITCHABLE = ['work', 'meet', 'fix', 'learn'];

const now = () => Date.now();
const listeners = new Set();
export function onTick(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }

/* ================= רשומות ================= */

function pushEntry(itemId, start, end, kind, note) {
  if (end - start < 5000) return null;           // פחות מ-5 שניות — לא מעניין
  const e = { id: uid('t'), itemId: itemId || null, start, end, kind: kind || 'work', note: note || '' };
  update(s => { s.timeEntries.push(e); });
  return e;
}
export const addEntry = pushEntry;

export function patchEntry(id, patch) {
  update(s => {
    const e = s.timeEntries.find(x => x.id === id);
    if (e) Object.assign(e, patch);
  });
}
export function removeEntry(id) {
  update(s => { s.timeEntries = s.timeEntries.filter(x => x.id !== id); });
}

/* ================= טיימר ================= */

export const activeTimer = () => S().timer;

/** סוגר את הטיימר הפעיל ורושם אותו. מחזיר את הרשומה. */
export function stopTimer(at = now(), silent = false) {
  const t = S().timer;
  if (!t) return null;
  const e = pushEntry(t.itemId, t.startedAt, Math.max(at, t.startedAt), t.kind, t.note);
  update(s => { s.timer = null; });
  if (!silent) emit();
  return e;
}

/** הלב של העמוד: לחיצה אחת מעבירה את הטיימר. אין "עצור" ו"התחל" נפרדים. */
export function startTimer(itemId, kind = 'work') {
  const t = S().timer;
  if (t && t.itemId === itemId && t.kind === kind) { emit(); return; }
  if (t) stopTimer(now(), true);
  // פריט שמתחילים לעבוד עליו יוצא ממצב המתנה
  endWaiting(itemId, true);
  update(s => { s.timer = { itemId, startedAt: now(), kind, note: '' }; s.paused = null; s.lastSeenAt = now(); });
  const it = getItem(itemId);
  if (it) touchRelated(it);
  emit();
}

export function switchTimer(itemId, kind) {
  const t = S().timer;
  startTimer(itemId, kind || (t ? t.kind : 'work'));
}

/** למידה בלי פריט קונקרטי, או קטע "בין הדברים" */
export function startFree(kind = 'learn', itemId = null) {
  const t = S().timer;
  if (t) stopTimer(now(), true);
  update(s => { s.timer = { itemId, startedAt: now(), kind, note: '' }; s.paused = null; });
  emit();
}

/* ================= השהיה =================
   הבדל מ"עצור": עצור שוכח. השהיה זוכרת בדיוק על מה עבדת,
   כדי שחזרה תהיה לחיצה אחת ולא חיפוש מחדש ברשימה. */

/** משהה את הטיימר הרץ. הזמן נרשם, ומה שרץ נשמר לחזרה בלחיצה. */
export function pauseTimer() {
  const t = S().timer;
  if (!t) return null;
  stopTimer(now(), true);
  update(s => { s.paused = { itemId: t.itemId, kind: t.kind, at: now() }; });
  emit();
  return t;
}

/** חוזר בדיוק למה שהושהה. */
export function resumePaused() {
  const p = S().paused;
  if (!p) return false;
  update(s => { s.paused = null; });
  if (p.itemId) startTimer(p.itemId, p.kind); else startFree(p.kind);
  return true;
}

export const pausedInfo = () => S().paused;
export function clearPaused() { update(s => { s.paused = null; }); emit(); }

/* ================= תיקונים בדיעבד =================
   מי שמחליף נושא כל כמה דקות ישכח להחליף טיימר. במקום לקוות שיזכור,
   אפשר לתקן אחרי — להזיז את ההתחלה אחורה, או להעביר את הדקות האחרונות. */

/** מזיז את תחילת הטיימר הרץ אחורה. לא חוצה את הרשומה שלפניו. */
export function backdateStart(ms) {
  const t = S().timer;
  if (!t || ms <= 0) return 0;
  const prevEnd = S().timeEntries.reduce((a, e) => e.end <= t.startedAt && e.end > a ? e.end : a, 0);
  const floor = Math.max(prevEnd, startOfDay());
  const target = Math.max(floor, t.startedAt - ms);
  const moved = t.startedAt - target;
  if (moved < 1000) return 0;
  update(s => { s.timer.startedAt = target; }, { label: 'תיקון זמן התחלה' });
  emit();
  return moved;
}

/** כמה אפשר להזיז אחורה בלי לדרוס משהו — כדי שהתפריט לא יציע מה שלא ייתכן */
export function backdateRoom() {
  const t = S().timer;
  if (!t) return 0;
  const prevEnd = S().timeEntries.reduce((a, e) => e.end <= t.startedAt && e.end > a ? e.end : a, 0);
  return Math.max(0, t.startedAt - Math.max(prevEnd, startOfDay()));
}

/**
 * מעביר את X הדקות האחרונות לפריט אחר.
 * עובד גם על הטיימר הרץ וגם על רשומות שכבר נסגרו, כי "שכחתי להחליף"
 * מתגלה בדרך כלל אחרי שכבר עברת הלאה.
 */
export function reassignRecent(ms, itemId, kind = 'work') {
  const from = now() - ms;
  let moved = 0;
  update(s => {
    const t = s.timer;
    // חלק מהטיימר הרץ
    if (t && t.startedAt < now()) {
      const cut = Math.max(t.startedAt, from);
      if (now() - cut > 5000) {
        if (cut > t.startedAt) {
          s.timeEntries.push({ id: uid('t'), itemId: t.itemId, start: t.startedAt, end: cut, kind: t.kind, note: t.note || '' });
        }
        moved += now() - cut;
        s.timer = { itemId, startedAt: cut, kind, note: '' };
      }
    }
    // רשומות סגורות שנופלות בתוך החלון
    s.timeEntries.forEach(e => {
      if (e.end <= from) return;
      if (e.itemId === itemId && e.kind === kind) return;
      if (e.start >= from) { moved += e.end - e.start; e.itemId = itemId; e.kind = kind; return; }
      // רשומה שנחתכת באמצע — מפצלים
      const tail = e.end - from;
      if (tail < 5000) return;
      s.timeEntries.push({ id: uid('t'), itemId, start: from, end: e.end, kind, note: e.note || '' });
      e.end = from;
      moved += tail;
    });
  }, { label: 'העברת זמן לפריט אחר' });
  emit();
  return moved;
}

/** מחליף את סוג הזמן של הטיימר הרץ בלי לאבד את הרצף */
export function setKind(kind) {
  const t = S().timer;
  if (!t || t.kind === kind) return;
  update(s => { s.timer.kind = kind; }, { label: 'שינוי סוג זמן' });
  emit();
}

/** הערה על הקטע שרץ עכשיו — נכנסת לרשומה כשהיא נסגרת */
export function setNote(note) {
  if (!S().timer) return;
  update(s => { s.timer.note = note; });
  emit();
}

/** הפריטים שנגעת בהם לאחרונה — לחזרה מהירה */
export function recentItems(n = 6) {
  const seen = new Map();
  S().timeEntries.slice().sort((a, b) => b.end - a.end).forEach(e => {
    if (!e.itemId || seen.has(e.itemId)) return;
    const it = getItem(e.itemId);
    if (it && !it.archived) seen.set(e.itemId, { item: it, at: e.end, kind: e.kind });
  });
  return Array.from(seen.values()).slice(0, n);
}

function touchRelated(item) {
  if (item.type === 'knowledge') {
    update(s => {
      const k = s.items.find(x => x.id === item.id);
      if (k) { k.lastTouched = now(); if (k.status === 'new') k.status = 'doing'; }
    });
  }
}

export function elapsed() {
  const t = S().timer;
  return t ? now() - t.startedAt : 0;
}

/* ================= המתנה ================= */

/** מסמן פריט כ"ממתין" — הטיימר עוצר, זמן הקיר ממשיך לרוץ ברקע. */
export function startWaiting(itemId, note = '') {
  const t = S().timer;
  if (t && t.itemId === itemId) stopTimer(now(), true);
  update(s => {
    if (!s.waiting.some(w => w.itemId === itemId))
      s.waiting.push({ itemId, since: now(), note });
  });
  emit();
}

export function endWaiting(itemId, silent = false) {
  const w = S().waiting.find(x => x.itemId === itemId);
  if (!w) return;
  pushEntry(itemId, w.since, now(), 'wait', w.note);
  update(s => { s.waiting = s.waiting.filter(x => x.itemId !== itemId); });
  if (!silent) emit();
}

export const isWaiting = itemId => S().waiting.some(w => w.itemId === itemId);

/* ================= חישובי זמן ================= */

export function entriesBetween(from, to) {
  return S().timeEntries.filter(e => e.end > from && e.start < to);
}

function overlap(e, from, to) {
  return Math.max(0, Math.min(e.end, to) - Math.max(e.start, from));
}

/** חיתוך קטע לגבולות, ואז גריעת הזמן שבו לא היית ליד המחשב */
function activePart(start, end, from, to) {
  const a = Math.max(start, from), b = Math.min(end, to);
  if (b <= a) return 0;
  return P.hasData(a) ? P.activeMsIn(a, b) : b - a;
}

/**
 * זמן עבודה נטו — כמה באמת עבד (עבודה + למידה).
 * כשזיהוי הנוכחות פעיל, זמן שבו לא היית ליד המחשב נגרע לבד —
 * גם אם הטיימר המשיך לרוץ, וגם אם היית בוגאס ולא בלשונית הזאת.
 */
export function focusMs(itemId = null, from = 0, to = Infinity) {
  const hi = to === Infinity ? now() : to;
  let ms = S().timeEntries.reduce((a, e) => {
    if (itemId && e.itemId !== itemId) return a;
    if (!KINDS[e.kind]?.focus) return a;
    return a + activePart(e.start, e.end, from, hi);
  }, 0);
  const t = S().timer;
  if (t && KINDS[t.kind]?.focus && (!itemId || t.itemId === itemId))
    ms += activePart(t.startedAt, now(), from, hi);
  return ms;
}

/** זמן עבודה נטו בלי גריעת נוכחות — כדי להראות את ההפרש */
export function grossFocusMs(itemId = null, from = 0, to = Infinity) {
  let ms = S().timeEntries.reduce((a, e) => {
    if (itemId && e.itemId !== itemId) return a;
    if (!KINDS[e.kind]?.focus) return a;
    return a + overlap(e, from, to);
  }, 0);
  const t = S().timer;
  if (t && KINDS[t.kind]?.focus && (!itemId || t.itemId === itemId))
    ms += overlap({ start: t.startedAt, end: now() }, from, to);
  return ms;
}

/** זמן המתנה */
export function waitMs(itemId = null, from = 0, to = Infinity) {
  let ms = S().timeEntries.reduce((a, e) => {
    if (itemId && e.itemId !== itemId) return a;
    if (e.kind !== 'wait') return a;
    return a + overlap(e, from, to);
  }, 0);
  S().waiting.forEach(w => {
    if (itemId && w.itemId !== itemId) return;
    ms += overlap({ start: w.since, end: now() }, from, to);
  });
  return ms;
}

/** זמן מהתחלה עד מסירה — כמה זמן הפרויקט פתוח */
export function wallMs(itemId) {
  const it = getItem(itemId);
  if (!it) return 0;
  if (it.type === 'client') return (it.deliveredAt || now()) - it.createdAt;
  const es = S().timeEntries.filter(e => e.itemId === itemId);
  if (!es.length) return 0;
  const first = Math.min(...es.map(e => e.start));
  const last = Math.max(...es.map(e => e.end));
  return last - first;
}

/** זמן זמין — סה"כ שעות עבודה ביום, וכמה נשאר */
export function availableToday() {
  const st = S().settings;
  const total = (st.workHoursPerDay || 6) * HOUR;
  const used = focusMs(null, startOfDay(), endOfDay());
  const endHour = (st.dayStartHour || 9) + (st.workHoursPerDay || 6);
  const dayEnd = startOfDay() + endHour * HOUR;
  return { total, used, left: Math.max(0, total - used), dayEnd, remainingClock: Math.max(0, dayEnd - now()) };
}

/** פירוק שעות היום לפי פריט */
export function todayByItem() {
  const from = startOfDay(), to = endOfDay();
  const map = new Map();
  const add = (itemId, kind, ms) => {
    if (ms <= 0) return;
    const key = itemId || ('__' + kind);
    const cur = map.get(key) || { itemId, kind, ms: 0 };
    cur.ms += ms; if (itemId) cur.kind = kind;
    map.set(key, cur);
  };
  S().timeEntries.forEach(e => { if (KINDS[e.kind]?.focus) add(e.itemId, e.kind, activePart(e.start, e.end, from, to)); });
  const t = S().timer;
  if (t && KINDS[t.kind]?.focus) add(t.itemId, t.kind, activePart(t.startedAt, now(), from, to));
  return Array.from(map.values()).sort((a, b) => b.ms - a.ms);
}

/**
 * כמה זמן נטו הצטבר היום על פריט אחד — כולל הקטע שרץ עכשיו.
 * זה המספר שמוצג בסרגל ובחלון הצף, ולכן מעבר לפרויקט אחר וחזרה
 * לא מאפס כלום: הוא ממשיך מאיפה שהוא היה.
 */
export function itemTodayMs(itemId, kind = null) {
  const from = startOfDay(), to = endOfDay();
  let ms = 0;
  S().timeEntries.forEach(e => {
    if ((e.itemId || null) !== (itemId || null)) return;
    if (kind ? e.kind !== kind : !KINDS[e.kind]?.focus) return;
    ms += activePart(e.start, e.end, from, to);
  });
  const t = S().timer;
  if (t && (t.itemId || null) === (itemId || null) && (kind ? t.kind === kind : KINDS[t.kind]?.focus))
    ms += activePart(t.startedAt, now(), from, to);
  return ms;
}

/** מה שהטיימר הנוכחי צובר היום — הפריט אם יש, אחרת הסוג החופשי */
export function currentTodayMs() {
  const t = S().timer;
  if (!t) return 0;
  return t.itemId ? itemTodayMs(t.itemId) : itemTodayMs(null, t.kind);
}

/** ממוצע זמן עבודה נטו לסרטון שנמסר */
export function avgFocusPerDelivery(productLineId = null) {
  const done = S().items.filter(i => i.type === 'client' && i.deliveredAt &&
    (!productLineId || i.productLineId === productLineId));
  if (!done.length) return null;
  const tot = done.reduce((a, c) => a + focusMs(c.id), 0);
  return { avgMs: tot / done.length, count: done.length };
}

/* ================= זיהוי המתנה אוטומטי =================
   הבעיה שהמערכת נבנתה בשבילה: נותנים משימה לקלוד, עוברים לטאב אחר,
   והטיימר ממשיך לספור את זמן ההמתנה כזמן עבודה נטו. אז התמחור יוצא שגוי.

   מה שאפשר לדעת בוודאות: אם הטאב פתוח מולך ולא נגעת בכלום כמה דקות —
   אתה לא עובד כאן. במקרה הזה הטיימר עובר להמתנה לבד, ואומר את זה.
   ברגע שתיגע במשהו הוא חוזר לעבודה לבד. אין מה ללחוץ.

   מה שאי אפשר לדעת: אם הטאב מוסתר, אולי אתה עובד בהיגספילד ואולי
   אתה מחכה לקלוד. את זה עדיין שואלים — אבל בפס עליון, לא בחלון חוסם. */

let lastActivity = Date.now();
let autoWaitTimer = null;

export const idleFor = () => Date.now() - lastActivity;

function autoWaitMs() {
  const m = S().settings.autoWaitMinutes;
  return m > 0 ? m * MIN : 0;         // 0 = מכובה
}

/** מפצל את הטיימר הרץ: עד רגע המגע האחרון זו עבודה, ומשם זו המתנה */
function toAutoWait(at) {
  const t = S().timer;
  if (!t || !KINDS[t.kind]?.focus) return;
  const e = pushEntry(t.itemId, t.startedAt, Math.max(at, t.startedAt + 1000), t.kind, t.note);
  update(s => {
    s.timer = {
      itemId: t.itemId, startedAt: at, kind: 'wait', note: 'המתנה שזוהתה לבד',
      autoFrom: t.kind, autoSplitEntryId: e ? e.id : null
    };
  });
  emit();
  window.dispatchEvent(new CustomEvent('front:auto-wait', {
    detail: { itemId: t.itemId, since: at, was: t.kind }
  }));
}

/* אחרי חזרה אוטומטית — זוכרים מה בדיוק נחתך, כדי שעדיין אפשר יהיה לומר
   "זו הייתה עבודה". בלי זה הכפתור בלתי לחיץ: עצם הלחיצה מחזירה לעבודה
   לפני שהיא נרשמת. */
let lastAuto = null;             // {waitEntryId, splitEntryId, itemId, kind, at}
const CLAIM_WINDOW = 10 * MIN;

/** חזרה למגע — סוגרים את ההמתנה וממשיכים בעבודה מאותו רגע */
function autoResume() {
  const t = S().timer;
  if (!t || !t.autoFrom) return;
  const w = pushEntry(t.itemId, t.startedAt, now(), 'wait', 'המתנה שזוהתה לבד');
  const back = t.autoFrom;
  lastAuto = {
    waitEntryId: w ? w.id : null, splitEntryId: t.autoSplitEntryId,
    itemId: t.itemId, kind: back, at: now()
  };
  update(s => { s.timer = { itemId: t.itemId, startedAt: now(), kind: back, note: '' }; });
  emit();
  window.dispatchEvent(new CustomEvent('front:auto-resume', { detail: { itemId: t.itemId, kind: back } }));
}

export const canClaimAutoWait = () =>
  inAutoWait() || !!(lastAuto && now() - lastAuto.at < CLAIM_WINDOW);

/** "לא, זו הייתה עבודה" — מוחק את קטע ההמתנה ומאחה את הזמן בחזרה */
export function claimAutoWait() {
  const t = S().timer;

  // עדיין בהמתנה — פשוט מבטלים את הפיצול
  if (t && t.autoFrom) {
    const eid = t.autoSplitEntryId;
    let start = t.startedAt;
    const back = t.autoFrom;
    update(s => {
      if (eid) {
        const e = s.timeEntries.find(x => x.id === eid);
        if (e) { start = e.start; s.timeEntries = s.timeEntries.filter(x => x.id !== eid); }
      }
      s.timer = { itemId: t.itemId, startedAt: start, kind: back, note: '' };
    }, { label: 'ביטול זיהוי המתנה' });
    lastAuto = null;
    emit();
    return true;
  }

  // כבר חזרנו לעבודה — מאחים אחורה
  if (!lastAuto || now() - lastAuto.at > CLAIM_WINDOW) return false;
  const L = lastAuto;
  lastAuto = null;
  update(s => {
    const w = s.timeEntries.find(x => x.id === L.waitEntryId);
    const sp = L.splitEntryId ? s.timeEntries.find(x => x.id === L.splitEntryId) : null;
    const cur = s.timer;
    const sameRun = cur && cur.itemId === L.itemId && cur.kind === L.kind;

    if (w && sp && sameRun) {
      // הכל שייך לאותה רצועת עבודה: מוחקים את שתי הרשומות ומותחים את הטיימר אחורה
      s.timeEntries = s.timeEntries.filter(x => x.id !== w.id && x.id !== sp.id);
      cur.startedAt = sp.start;
    } else if (w) {
      // אי אפשר לאחות — לפחות נסמן שההמתנה הייתה עבודה
      w.kind = L.kind;
      w.note = 'סווג ידנית כעבודה';
    }
  }, { label: 'ביטול זיהוי המתנה' });
  emit();
  return true;
}

export const inAutoWait = () => !!(S().timer && S().timer.autoFrom);

function markActive(e) {
  lastActivity = Date.now();
  // לחיצה על הכפתור שמבטל את ההמתנה לא אמורה קודם לחדש את העבודה
  if (e && e.target && e.target.closest && e.target.closest('[data-keep-wait]')) return;
  if (inAutoWait()) autoResume();
}

function initAutoWait() {
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, markActive, { passive: true, capture: true }));

  // תזוזת עכבר בלבד לא נחשבת מגע אמיתי, אבל תזוזה גדולה כן
  let lastX = 0, lastY = 0;
  window.addEventListener('mousemove', e => {
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 60) {
      lastX = e.clientX; lastY = e.clientY; markActive();
    }
  }, { passive: true });

  clearInterval(autoWaitTimer);
  autoWaitTimer = setInterval(() => {
    const ms = autoWaitMs();
    if (!ms) return;
    if (document.visibilityState !== 'visible') return;   // טאב מוסתר — לא יודעים, שואלים אחר כך
    const t = S().timer;
    if (!t || !KINDS[t.kind]?.focus) return;
    if (idleFor() < ms) return;
    toAutoWait(lastActivity);
  }, 15000);
}

/* ================= זיהוי חזרה לטאב ================= */

let heartbeat = null;

export function initPresence(askFn) {
  const st = () => S().settings;

  const beat = () => update(s => { s.lastSeenAt = now(); }, { silent: true });

  const check = () => {
    const s = S();
    const gap = now() - (s.lastSeenAt || now());
    const askMs = (st().idleAskMinutes || 3) * MIN;
    const longMs = (st().longAbsenceHours || 2) * HOUR;

    if (gap < askMs) { beat(); return; }

    // כבר בהמתנה שזוהתה לבד — הפרק הזה נספר, אין מה לשאול
    if (inAutoWait()) { beat(); return; }

    const from = s.lastSeenAt, to = now();
    const t = s.timer;

    // היעדרות ארוכה — עוצרים לבד בנקודה האחרונה שראינו אותו
    if (t && gap > longMs) {
      stopTimer(from, true);
      toast('היעדרות ארוכה — הטיימר נעצר לבד בשעה ' + new Date(from).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
    }
    update(s2 => { s2.pendingAbsence = { from, to, hadTimer: t ? { itemId: t.itemId, kind: t.kind } : null }; s2.lastSeenAt = now(); });
    askFn && askFn({ from, to, hadTimer: t ? { itemId: t.itemId, kind: t.kind } : null });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastActivity = now();      // מתחילים לספור מחדש, שלא יקפוץ להמתנה ברגע החזרה
      check();
    } else beat();
  });
  window.addEventListener('focus', check);
  window.addEventListener('blur', beat);
  window.addEventListener('beforeunload', beat);

  clearInterval(heartbeat);
  heartbeat = setInterval(() => { if (document.visibilityState === 'visible') beat(); }, 20000);
  beat();
  initAutoWait();
}

/**
 * מסווג את פרק ההיעדרות בלחיצה אחת.
 * choice: {kind:'off'} | {itemId, kind:'work'} | {kind:'learn', itemId?}
 */
export function resolveAbsence(choice) {
  const p = S().pendingAbsence;
  if (!p) return;
  const t = S().timer;

  // אם הטיימר עדיין רץ — הוא כיסה את הפרק. נחתוך אותו בנקודת ההיעדרות.
  if (t && t.startedAt < p.from) {
    pushEntry(t.itemId, t.startedAt, p.from, t.kind, t.note);
    update(s => { s.timer = null; });
  }

  if (choice.kind !== 'off')
    pushEntry(choice.itemId || null, p.from, p.to, choice.kind || 'work', 'סווג בחזרה לטאב');
  else
    pushEntry(null, p.from, p.to, 'off', 'לא עבדתי');

  update(s => { s.pendingAbsence = null; });

  // ממשיכים מהנקודה הזו: אם בחר פריט — הטיימר ממשיך עליו
  if (choice.resume !== false && choice.kind !== 'off') {
    const target = choice.itemId || (p.hadTimer && p.hadTimer.itemId);
    if (target || choice.kind === 'learn')
      update(s => { s.timer = { itemId: target || null, startedAt: now(), kind: choice.kind || 'work', note: '' }; });
  }
  emit();
}

export function dismissAbsence() {
  update(s => { s.pendingAbsence = null; });
  emit();
}

/* ================= ציר היום ================= */

/** כל הקטעים של יום נתון, כולל הטיימר הרץ */
export function daySegments(dayTs = Date.now()) {
  const from = startOfDay(dayTs), to = endOfDay(dayTs);
  const segs = S().timeEntries
    .filter(e => e.end > from && e.start < to)
    .map(e => ({ ...e, live: false }))
    .sort((a, b) => a.start - b.start);
  const t = S().timer;
  if (t && t.startedAt < to && now() > from)
    segs.push({ id: '__live', itemId: t.itemId, start: t.startedAt, end: now(), kind: t.kind, live: true });
  S().waiting.forEach(w => {
    if (w.since < to) segs.push({ id: '__w_' + w.itemId, itemId: w.itemId, start: w.since, end: now(), kind: 'wait', live: true });
  });
  return segs.sort((a, b) => a.start - b.start);
}

export { HOUR, MIN, DAY };
