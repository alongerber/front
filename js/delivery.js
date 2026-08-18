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
import { clientOf } from './production.js';

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
      'ובעוד חודש הוא כבר שכח.',
    // ללקוח שכבר בחבילה זו משימה שגויה, לא משימה מיותרת
    skipIfRetainer: true
  }
];

/** המשימות שכבר נוצרו להפקה הזאת — כדי לא ליצור אותן פעמיים */
export const followupsOf = productionId =>
  S().items.filter(i => i.type === 'task' && i.followup && i.followup.productionId === productionId);

/** כל משימות המעקב של לקוח, על פני כל הפקותיו */
export const followupsOfClient = clientId =>
  S().items.filter(i => i.type === 'task' && i.followup && i.clientId === clientId);

/**
 * יוצר את משימות המעקב להפקה. אידמפוטנטי: יום שכבר קיים מדולג,
 * כי מסירה חוזרת אחרי סבב תיקונים לא אמורה להכפיל את הרשימה.
 * מחזיר את מה שנוצר בפועל.
 */
export function scheduleFollowups(productionId, from = now()) {
  const p = getItem(productionId);
  if (!p || p.type !== 'production') return [];
  const c = clientOf(p);
  if (!c) return [];

  const existing = new Set(followupsOf(productionId).map(t => t.followup.day));
  const made = [];

  FOLLOWUPS.forEach(f => {
    if (existing.has(f.day)) return;
    if (f.skipIfRetainer && c.retainer) return;
    made.push(addItem({
      type: 'task',
      title: f.title(c),
      note: f.note,
      clientId: c.id,
      productionId,
      snoozeUntil: from + f.day * DAY,
      followup: { productionId, clientId: c.id, day: f.day }
    }));
  });

  return made;
}

/* ============================================================
   2. הנקודה היחידה שקובעת "שולם" ו"נמסר"
   ============================================================ */

/* איזה שלב אומר "שולם" ואיזה אומר "נמסר" — לפי סימון מפורש
   על השלב, לא לפי השם. שינוי שם שלב כבר לא משתיק את רישום
   התשלום, וזה היה באג שמחכה לרגע הכי גרוע. */
export const isPayStage = st => !!st && st.mark === 'paid';
export const isDeliverStage = st => !!st && st.mark === 'delivered';

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
export function markDelivered(productionId, at = now()) {
  const p = getItem(productionId);
  if (!p || p.type !== 'production') return { delivered: false, followups: [] };

  const first = !p.deliveredAt;
  if (first) patchItem(productionId, { deliveredAt: at });

  return { delivered: first, followups: scheduleFollowups(productionId, p.deliveredAt || at) };
}

/**
 * מה שקורה כשלקוח עובר שלב. כל המסכים קוראים לזה, כדי ששלושת
 * מסכי המעבר יתנהגו בדיוק אותו דבר.
 * מחזיר {paid, delivered, followups} — כדי שהמסך יוכל להגיד מה קרה.
 */
export function onStageChange(productionId, stage) {
  const p = getItem(productionId);
  if (!p) return { paid: false, delivered: false, followups: [] };
  const paid = isPayStage(stage) && p.clientId ? markPaid(p.clientId) : false;
  const d = isDeliverStage(stage) ? markDelivered(productionId) : { delivered: false, followups: [] };
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

export function setAsset(productionId, url) {
  const v = String(url || '').trim();
  patchItem(productionId, { deliveredAsset: v || null }, 'עדכון הקישור לסרטון');
  return v;
}
