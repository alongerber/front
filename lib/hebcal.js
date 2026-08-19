/* ============================================================
   hebcal.js — הלוח העברי וימי העסקים, בלי ייבוא
   ------------------------------------------------------------
   הועבר לכאן מ-js/businessdays.js ברגע שגם השרת נזקק לו:
   דף התודה מציג "עד יום שלישי, 24.11", והמערכת מציגה את אותו
   תאריך בשעון ההפקה. שני חישובים נפרדים של אותו דבר הם הדרך
   הבטוחה ביותר להבטיח ללקוח תאריך אחד ולעבוד לפי אחר.

   בלי ייבוא בכוונה — רץ גם בדפדפן וגם בפונקציית שרת.
   הימים שסומנו ידנית מגיעים כפרמטר, כי הם יושבים בהגדרות של
   המכשיר ולא בכל סביבה.
   ============================================================ */

const DAY = 86400000;

const HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric'
});

/** {day, month, year} עברי. חצות היום, כדי לא לרקוד על גבולות. */
export function hebrew(ts) {
  const d = new Date(ts);
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const p = HEB.formatToParts(noon).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { day: Number(p.day), month: p.month, year: Number(p.year) };
}

/* שמונה חגים כתאריכים קבועים בלוח העברי. בישראל יום אחד לכל
   חג (חוץ מראש השנה), ושמיני עצרת ושמחת תורה הם אותו יום. */
export const HOLIDAYS = [
  { m: 'Tishri', d: 1, name: 'ראש השנה' },
  { m: 'Tishri', d: 2, name: 'ראש השנה ב\'' },
  { m: 'Tishri', d: 10, name: 'יום כיפור' },
  { m: 'Tishri', d: 15, name: 'סוכות' },
  { m: 'Tishri', d: 22, name: 'שמחת תורה' },
  { m: 'Nisan', d: 15, name: 'פסח' },
  { m: 'Nisan', d: 21, name: 'שביעי של פסח' },
  { m: 'Sivan', d: 6, name: 'שבועות' }
];

/**
 * יום העצמאות — ה' באייר, אבל הוא זז:
 * שישי או שבת → מוקדם ליום חמישי. שני → נדחה לשלישי.
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
  return hit ? hit.name : independenceDay(ts);
}

/** מפתח יציב ליום, בלי אזורי זמן: YYYY-MM-DD מקומי */
export const dayKey = ts => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
};

/** לא שישי, לא שבת, לא חג, ולא ברשימת הימים שסומנו ידנית */
export function isBusinessDay(ts, offDays = []) {
  const wd = new Date(ts).getDay();
  if (wd === 5 || wd === 6) return false;
  if (holidayName(ts)) return false;
  return !offDays.includes(dayKey(ts));
}

/** למה היום הזה לא נספר — לתצוגה */
export function whyOff(ts, offDays = []) {
  const wd = new Date(ts).getDay();
  if (wd === 5) return 'שישי';
  if (wd === 6) return 'שבת';
  const h = holidayName(ts);
  if (h) return h;
  return offDays.includes(dayKey(ts)) ? 'סומן ידנית' : null;
}

const midnight = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * מוסיף n ימי עסקים. יום ההתחלה לא נספר — "7 ימי עסקים מהיום"
 * הוא היום העסקי השביעי אחרי היום.
 */
export function addBusinessDays(from, n, offDays = []) {
  let cur = midnight(from);
  let left = Math.max(0, Math.round(n));
  let guard = 0;
  while (left > 0 && guard++ < 400) {
    cur += DAY;
    if (isBusinessDay(cur, offDays)) left--;
  }
  // סוף היום, כדי ש"היעד הוא היום" לא ייחשב באיחור בבוקר
  return cur + 18 * 3600000;
}

/** כמה ימי עסקים מלאים עברו. לא כולל את יום ההתחלה. */
export function businessDaysBetween(from, to, offDays = []) {
  let cur = midnight(from), end = midnight(to), n = 0, guard = 0;
  while (cur < end && guard++ < 2000) {
    cur += DAY;
    if (isBusinessDay(cur, offDays)) n++;
  }
  return n;
}

/** החגים בטווח — כדי שאפשר יהיה לראות מה המערכת חושבת */
export function upcomingHolidays(fromTs, months = 12) {
  const out = [];
  const start = midnight(fromTs);
  for (let i = 0; i < months * 31; i++) {
    const ts = start + i * DAY;
    const name = holidayName(ts);
    if (name) out.push({ ts, name, weekday: new Date(ts).getDay() });
  }
  return out;
}
