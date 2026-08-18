/* ============================================================
   businessdays.js — ימי עסקים בישראל
   ------------------------------------------------------------
   "אספקה תוך 7 ימי עסקים" זו הבטחה שמופיעה בדף הנחיתה, ועד
   עכשיו לא היה במערכת שום דבר שיודע לספור אותה.

   למה בלי טבלה ובלי ספרייה:
   הדפדפן כבר מכיר את הלוח העברי. Intl עם ca-hebrew מחזיר את
   התאריך העברי לכל תאריך לועזי, אופליין, בלי תלויות. והחגים
   הם תאריכים קבועים בלוח העברי — רשימה של תשעה, לא טבלה
   שמתיישנת בכל שנה.

   ומעל הכל: כפתור "היום הזה לא נספר". לוח מושלם הוא בעיה
   שאי אפשר לסגור — חול המועד, ערב חג, יום שהילד חולה. המספר
   על המסך צריך להיות נכון, לא אלגנטי, ולכן יש דרך ידנית
   לתקן אותו והיא חלק מהתכנון ולא הודאה בכישלון.
   ============================================================ */

import { S, update } from './store.js';

const DAY = 86400000;

/* ============================================================
   1. הלוח העברי
   ============================================================ */

const HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric'
});

/** {day, month, year} עברי לתאריך לועזי. חצות היום, כדי לא לרקוד על גבולות. */
export function hebrew(ts) {
  const d = new Date(ts);
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const parts = HEB.formatToParts(noon).reduce((a, p) => (a[p.type] = p.value, a), {});
  return { day: Number(parts.day), month: parts.month, year: Number(parts.year) };
}

/* תשעת החגים, כתאריכים עבריים. בישראל — יום אחד לכל חג
   (חוץ מראש השנה), ושמיני עצרת ושמחת תורה הם אותו יום. */
export const HOLIDAYS = [
  { m: 'Tishri', d: 1,  name: 'ראש השנה' },
  { m: 'Tishri', d: 2,  name: 'ראש השנה ב\'' },
  { m: 'Tishri', d: 10, name: 'יום כיפור' },
  { m: 'Tishri', d: 15, name: 'סוכות' },
  { m: 'Tishri', d: 22, name: 'שמחת תורה' },
  { m: 'Nisan',  d: 15, name: 'פסח' },
  { m: 'Nisan',  d: 21, name: 'שביעי של פסח' },
  { m: 'Sivan',  d: 6,  name: 'שבועות' }
];

/**
 * יום העצמאות — ה' באייר, אבל הוא זז.
 * נופל בשישי או בשבת → מוקדם ליום חמישי שלפניו.
 * נופל בשני → נדחה ליום שלישי.
 * הכלל קיים כדי שיום הזיכרון לא ייפתח במוצאי שבת.
 */
function independenceDay(ts) {
  const h = hebrew(ts);
  if (h.month !== 'Iyar' || h.day < 2 || h.day > 6) return null;
  const wd = new Date(ts).getDay();                 // 0=ראשון … 6=שבת
  if (h.day === 5 && wd !== 5 && wd !== 6 && wd !== 1) return 'יום העצמאות';
  if (h.day === 3 && wd === 4) return 'יום העצמאות';   // ה' בשבת → ג' בחמישי
  if (h.day === 4 && wd === 4) return 'יום העצמאות';   // ה' בשישי → ד' בחמישי
  if (h.day === 6 && wd === 2) return 'יום העצמאות';   // ה' בשני → ו' בשלישי
  return null;
}

/** שם החג אם זה חג, אחרת null */
export function holidayName(ts) {
  const h = hebrew(ts);
  const hit = HOLIDAYS.find(x => x.m === h.month && x.d === h.day);
  if (hit) return hit.name;
  return independenceDay(ts);
}

/* ============================================================
   2. ימים שסומנו ידנית
   ============================================================ */

/** מפתח יציב ליום, בלי אזורי זמן: YYYY-MM-DD מקומי */
export const dayKey = ts => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
};

export const offDays = () => S().settings.nonWorkDays || [];

export const isMarkedOff = ts => offDays().includes(dayKey(ts));

/* ============================================================
   3. ימי עסקים
   ============================================================ */

/** האם זה יום עבודה: לא שישי, לא שבת, לא חג, ולא סומן ידנית */
export function isBusinessDay(ts) {
  const wd = new Date(ts).getDay();
  if (wd === 5 || wd === 6) return false;
  if (holidayName(ts)) return false;
  if (isMarkedOff(ts)) return false;
  return true;
}

/** למה היום הזה לא נספר — לתצוגה */
export function whyOff(ts) {
  const wd = new Date(ts).getDay();
  if (wd === 5) return 'שישי';
  if (wd === 6) return 'שבת';
  const h = holidayName(ts);
  if (h) return h;
  if (isMarkedOff(ts)) return 'סומן ידנית';
  return null;
}

/** חצות של אותו יום — הבסיס לכל ספירה */
const midnight = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * מוסיף n ימי עסקים. היום שבו מתחילים לא נספר —
 * "7 ימי עסקים מהיום" הוא היום העסקי השביעי אחרי היום.
 */
export function addBusinessDays(from, n) {
  let cur = midnight(from);
  let left = Math.max(0, Math.round(n));
  let guard = 0;
  while (left > 0 && guard++ < 400) {
    cur += DAY;
    if (isBusinessDay(cur)) left--;
  }
  // סוף היום, כדי ש"היעד הוא היום" לא ייחשב באיחור בבוקר
  return cur + 18 * 3600000;
}

/** כמה ימי עסקים מלאים עברו בין שני זמנים. לא כולל את יום ההתחלה. */
export function businessDaysBetween(from, to) {
  let cur = midnight(from), end = midnight(to), n = 0, guard = 0;
  while (cur < end && guard++ < 2000) {
    cur += DAY;
    if (isBusinessDay(cur)) n++;
  }
  return n;
}

/* ============================================================
   4. סימון ידני
   ============================================================ */

/** מסמן יום כלא-נספר. מחזיר true אם השתנה משהו. */
export function markOff(ts) {
  const k = dayKey(ts);
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

/* ============================================================
   5. תצוגה
   ============================================================ */

/** החגים בשנה הקרובה — כדי שתוכל לראות מה המערכת חושבת */
export function upcomingHolidays(months = 12) {
  const out = [];
  const start = midnight(Date.now());
  for (let i = 0; i < months * 31; i++) {
    const ts = start + i * DAY;
    const name = holidayName(ts);
    if (name) out.push({ ts, name, weekday: new Date(ts).getDay() });
  }
  return out;
}
