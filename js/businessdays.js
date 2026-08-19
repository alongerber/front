/* ============================================================
   businessdays.js — ימי עסקים, בגרסת הדפדפן
   ------------------------------------------------------------
   הלוח עצמו יושב ב-lib/hebcal.js ומשותף עם השרת. כאן רק
   החיבור להגדרות: אילו ימים סימנת ידנית כלא-נספרים.

   למה משותף: דף התודה מבטיח ללקוח "עד יום שלישי, 24.11",
   והשעון בצינור מציג את אותו תאריך. שני חישובים נפרדים של
   אותו דבר הם הדרך הבטוחה להבטיח תאריך אחד ולעבוד לפי אחר.

   ולמה בכלל בלי טבלת חגים: הדפדפן כבר מכיר את הלוח העברי.
   Intl עם ca-hebrew מחזיר תאריך עברי לכל תאריך לועזי, אופליין,
   והחגים הם תאריכים קבועים בלוח הזה — לא טבלה שמתיישנת בכל שנה.

   ומעל הכל: כפתור "היום הזה לא נספר". לוח מושלם הוא בעיה שאי
   אפשר לסגור — חול המועד, ערב חג, יום שהילד חולה. המספר על
   המסך צריך להיות נכון ולא אלגנטי.
   ============================================================ */

import { S, update } from './store.js';
import * as C from '../lib/hebcal.js';

export const HOLIDAYS = C.HOLIDAYS;
export const hebrew = C.hebrew;
export const holidayName = C.holidayName;
export const dayKey = C.dayKey;

/* ---------- ימים שסומנו ידנית ---------- */

export const offDays = () => S().settings.nonWorkDays || [];
export const isMarkedOff = ts => offDays().includes(C.dayKey(ts));

/* ---------- ימי עסקים ---------- */

export const isBusinessDay = ts => C.isBusinessDay(ts, offDays());
export const whyOff = ts => C.whyOff(ts, offDays());
export const addBusinessDays = (from, n) => C.addBusinessDays(from, n, offDays());
export const businessDaysBetween = (from, to) => C.businessDaysBetween(from, to, offDays());
export const upcomingHolidays = (months = 12) => C.upcomingHolidays(Date.now(), months);

/* ---------- סימון ידני ---------- */

/** מסמן יום כלא-נספר. מחזיר true אם השתנה משהו. */
export function markOff(ts) {
  const k = C.dayKey(ts);
  if (offDays().includes(k)) return false;
  update(s => {
    s.settings.nonWorkDays = (s.settings.nonWorkDays || []).concat(k).sort();
  }, { label: 'סימון יום שלא נספר' });
  return true;
}

export function unmarkOff(key) {
  update(s => {
    s.settings.nonWorkDays = (s.settings.nonWorkDays || []).filter(x => x !== key);
  }, { label: 'ביטול סימון יום' });
}
