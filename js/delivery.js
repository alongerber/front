/* ============================================================
   delivery.js — מה שקורה אחרי שהסרטון יצא
   ------------------------------------------------------------
   הבעיה שזה נבנה בשבילה קרתה פעמיים: לקוח קיבל סרטון מצוין,
   היה מרוצה, והוריד אותו מהעמוד תוך שבועיים. אף אחד לא שאל
   אותו כלום בינתיים.

   הסיבה נעוצה במערכת עצמה: ברגע ש-deliveredAt נקבע, הלקוח
   נעלם מכל רשימה — הצינור מסנן אותו, עמוד הבית מסנן אותו,
   מנוע הכללים מדלג עליו. המערכת מתייחסת למסירה כאל סוף,
   והעסק מתייחס אליה כאל התחלה.

   שני דברים כאן:

   1. מסירה יוצרת שלוש משימות שמופיעות ביום 3, 14 ו-30.
      הן קיימות מהרגע הראשון אבל לא נראות עד שהיום מגיע —
      אחרת הרשימה מתמלאת בדברים שאי אפשר לעשות היום.

   2. נקודה אחת שקובעת "שולם" ו"נמסר". קודם זה היה מפוזר
      בחמישה מקומות, כל אחד עם אותה בדיקת מחרוזת בשם השלב.
      עכשיו מי שרוצה לסמן מסירה קורא לפונקציה אחת, וגם
      המשימות נוצרות — לא משנה מאיזה מסך הגיע.
   ============================================================ */

import { S, getItem, patchItem, addItem, lineOf } from './store.js';

const DAY = 86400000;
const now = () => Date.now();

/* ============================================================
   1. שלוש המשימות
   ------------------------------------------------------------
   הניסוח הוא מה שאתה תקרא בעוד שבועיים ותצטרך להבין ממנו
   בשנייה מה לעשות. לכן שם הלקוח בכותרת, והפעולה בהתחלה.
   ============================================================ */

export const FOLLOWUPS = [
  {
    day: 3,
    title: c => `לשאול את ${c.title} — העלה את הסרטון? איך הולך?`,
    note: 'שלושה ימים אחרי המסירה. אם הוא עוד לא העלה, זה הרגע להבין למה — ' +
      'זו הנקודה שבה סרטון מת בלי שאף אחד שם לב.'
  },
  {
    day: 14,
    title: c => `לבדוק עם ${c.title} — מה קרה עם הסרטון?`,
    note: 'שבועיים. יש כבר מספרים: צפיות, פניות, מכירות. ' +
      'זו השיחה שמייצרת המלצה, וגם מגלה מוקדם אם משהו לא עבד.'
  },
  {
    day: 30,
    title: c => `להציע ל${c.title} את החבילה החודשית`,
    note: 'חודש. הוא כבר יודע אם זה עבד לו. אם כן — עכשיו זה קל, ' +
      'ובעוד חודש הוא כבר שכח.'
  }
];

/** המשימות שכבר נוצרו ללקוח הזה — כדי לא ליצור אותן פעמיים */
export const followupsOf = clientId =>
  S().items.filter(i => i.type === 'task' && i.followup && i.followup.clientId === clientId);

/**
 * יוצר את שלוש המשימות. אידמפוטנטי: יום שכבר קיים מדולג,
 * כי מסירה חוזרת אחרי סבב תיקונים לא אמורה להכפיל את הרשימה.
 * מחזיר את מה שנוצר בפועל.
 */
export function scheduleFollowups(clientId, from = now()) {
  const c = getItem(clientId);
  if (!c || c.type !== 'client') return [];

  const existing = new Set(followupsOf(clientId).map(t => t.followup.day));
  const made = [];

  FOLLOWUPS.forEach(f => {
    if (existing.has(f.day)) return;
    made.push(addItem({
      type: 'task',
      title: f.title(c),
      note: f.note,
      clientId,
      snoozeUntil: from + f.day * DAY,
      followup: { clientId, day: f.day }
    }));
  });

  return made;
}

/* ============================================================
   2. הנקודה היחידה שקובעת "שולם" ו"נמסר"
   ============================================================ */

/* איזה שלב אומר "שולם" ואיזה אומר "נמסר".
   כרגע לפי השם, כמו שהיה — אבל במקום אחד ולא בחמישה. */
export const isPayStage = st => !!st && st.name.includes('תשלום');
export const isDeliverStage = st => !!st && st.name.includes('מסירה');

/**
 * מסמן תשלום. לא דורס תשלום קיים — התאריך הראשון הוא הנכון,
 * והוא זה שההכנסה החודשית נשענת עליו.
 */
export function markPaid(clientId, at = now()) {
  const c = getItem(clientId);
  if (!c || c.paidAt) return false;
  const line = lineOf(c.productLineId);
  patchItem(clientId, {
    paidAt: at,
    amount: c.amount || line.pricing?.unit || 0
  });
  return true;
}

/**
 * מסמן מסירה — ויוצר את שלוש משימות המעקב.
 * מחזיר {delivered, followups} כדי שהממשק יוכל לומר מה קרה.
 */
export function markDelivered(clientId, at = now()) {
  const c = getItem(clientId);
  if (!c) return { delivered: false, followups: [] };

  const first = !c.deliveredAt;
  if (first) patchItem(clientId, { deliveredAt: at });

  return { delivered: first, followups: scheduleFollowups(clientId, c.deliveredAt || at) };
}

/**
 * מה שקורה כשלקוח עובר שלב. כל המסכים קוראים לזה, כדי ששלושת
 * מסכי המעבר יתנהגו בדיוק אותו דבר.
 * מחזיר {paid, delivered, followups} — כדי שהמסך יוכל להגיד מה קרה.
 */
export function onStageChange(clientId, stage) {
  const paid = isPayStage(stage) ? markPaid(clientId) : false;
  const d = isDeliverStage(stage) ? markDelivered(clientId) : { delivered: false, followups: [] };
  return { paid, delivered: d.delivered, followups: d.followups };
}

/* ============================================================
   3. משימות מתוזמנות
   ------------------------------------------------------------
   snoozeUntil היה קיים במערכת מזמן, הוריד 1000 נקודות דירוג,
   ואף שורה לא כתבה אליו. עכשיו הוא מנגנון: משימה עם תאריך
   עתידי פשוט לא ברשימה עד שהיום מגיע.

   היא כן נמצאת בחיפוש ובעמוד המשימות תחת "מתוזמנות", כי
   מנגנון שמסתיר דברים בלי דרך לראות אותם הוא בור.
   ============================================================ */

export const isScheduled = t => !!(t && t.snoozeUntil && t.snoozeUntil > now());

/** כל מה שממתין לתאריך, מהקרוב לרחוק */
export function scheduled() {
  return S().items
    .filter(i => i.type === 'task' && !i.done && !i.archived && isScheduled(i))
    .sort((a, b) => a.snoozeUntil - b.snoozeUntil);
}

/** "אני רוצה את זה עכשיו" — מבטל את ההמתנה */
export function release(taskId) {
  patchItem(taskId, { snoozeUntil: null }, 'הצגת משימה מתוזמנת');
}

/* ============================================================
   4. הקובץ שנמסר
   ------------------------------------------------------------
   בלי זה, "מה קרה עם הסרטון?" ביום 14 מחייב אותך לחפש בדרייב
   לפני שאתה יכול לכתוב הודעה — וזה בדיוק החיכוך שגורם לדחות.
   ============================================================ */

export function setAsset(clientId, url) {
  const v = String(url || '').trim();
  patchItem(clientId, { deliveredAsset: v || null }, 'עדכון הקישור לסרטון');
  return v;
}
