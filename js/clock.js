/* ============================================================
   clock.js — שעון ההפקה
   ------------------------------------------------------------
   דף הנחיתה מבטיח "7 ימי עסקים". עד עכשיו המספר הזה ישב
   בקו המוצר ולא חישב כלום, ואת ההבטחה החזקת בראש.

   שני דברים שהופכים את זה למספר שאפשר לסמוך עליו:

   1. ימי עסקים ולא ימים. שישי, שבת וחג לא נספרים —
      ראה businessdays.js.

   2. השעון נעצר כשממתינים ללקוח. עיכוב מצדו לא נספר לרעתך,
      וזה החלק שהכי קל לשכוח: בלעדיו כל לקוח שלוקח לו שלושה
      ימים לאשר תסריט הופך אותך למי שאיחר.

   העיצוב: dueDate נשאר תאריך אמיתי ושמור, ולא חישוב שרץ
   מחדש כל פעם. כשהשעון חוזר מהמתנה התאריך נדחף קדימה בדיוק
   במספר ימי העסקים שחלפו. ככה מה שאתה רואה על המסך הוא מה
   שכתוב בנתונים, ואפשר גם לערוך אותו ביד.
   ============================================================ */

import { S, getItem, patchItem, lineOf } from './store.js';
import * as BD from './businessdays.js';

const now = () => Date.now();

/** כמה ימי עסקים ההבטחה, לפי קו המוצר */
export const promisedDays = production => {
  const line = lineOf(production && production.productLineId);
  return (line.pricing && line.pricing.deliveryDays) || 7;
};

/* ============================================================
   הפעלה, עצירה, המשך
   ============================================================ */

/**
 * מפעיל את השעון על הפקה. נקרא כשהתשלום נרשם.
 * לא מפעיל מחדש שעון שכבר רץ — התאריך הראשון הוא ההבטחה.
 */
export function startClock(productionId, at = now()) {
  const p = getItem(productionId);
  if (!p || p.type !== 'production' || p.clockStartedAt) return null;
  const days = promisedDays(p);
  const due = BD.addBusinessDays(at, days);
  patchItem(productionId, {
    clockStartedAt: at,
    clockPausedAt: null,
    clockPausedDays: 0,
    dueDate: due
  }, 'הפעלת שעון ההפקה');
  return due;
}

/** עוצר את השעון — ממתינים ללקוח */
export function pauseClock(productionId, at = now()) {
  const p = getItem(productionId);
  if (!p || !p.clockStartedAt || p.clockPausedAt || p.deliveredAt) return false;
  patchItem(productionId, { clockPausedAt: at });
  return true;
}

/**
 * ממשיך — ודוחף את תאריך היעד קדימה בכל ימי העסקים שעברו
 * בהמתנה. זו כל הנקודה: ההמתנה לא נספרת לרעתך.
 * מחזיר כמה ימים נדחף.
 */
export function resumeClock(productionId, at = now()) {
  const p = getItem(productionId);
  if (!p || !p.clockPausedAt) return 0;
  const moved = BD.businessDaysBetween(p.clockPausedAt, at);
  patchItem(productionId, {
    clockPausedAt: null,
    clockPausedDays: (p.clockPausedDays || 0) + moved,
    dueDate: moved && p.dueDate ? BD.addBusinessDays(p.dueDate, moved) : p.dueDate
  }, moved ? 'המשך שעון ההפקה' : undefined);
  return moved;
}

/* ============================================================
   מצב השעון
   ============================================================ */

/**
 * {state, left, over, paused, due, pausedDays} או null אם אין שעון.
 *   state: 'running' | 'paused' | 'late' | 'done'
 *   left:  ימי עסקים שנשארו (שלילי = איחור)
 */
export function clockState(production) {
  const p = production;
  if (!p || !p.clockStartedAt || !p.dueDate) return null;

  const paused = !!p.clockPausedAt;
  const pausedDays = p.clockPausedDays || 0;

  if (p.deliveredAt) {
    return {
      state: 'done', paused: false, due: p.dueDate, pausedDays,
      left: BD.businessDaysBetween(p.deliveredAt, p.dueDate),
      over: p.deliveredAt > p.dueDate,
      used: BD.businessDaysBetween(p.clockStartedAt, p.deliveredAt) - pausedDays
    };
  }

  // בהמתנה — הזמן קפוא מרגע העצירה
  const ref = paused ? p.clockPausedAt : now();
  const late = ref > p.dueDate;
  const left = late ? -BD.businessDaysBetween(p.dueDate, ref) : BD.businessDaysBetween(ref, p.dueDate);

  return {
    state: paused ? 'paused' : late ? 'late' : 'running',
    paused, due: p.dueDate, pausedDays, left, over: late,
    used: BD.businessDaysBetween(p.clockStartedAt, ref) - pausedDays
  };
}

/** טקסט קצר לתגית */
export function label(production) {
  const c = clockState(production);
  if (!c) return null;
  if (c.state === 'done') return c.over ? 'נמסר באיחור' : 'נמסר בזמן';
  if (c.state === 'late') return `איחור ${Math.abs(c.left)} ימי עסקים`;
  const d = c.left === 0 ? 'היום' : c.left === 1 ? 'יום עסקים אחד' : `${c.left} ימי עסקים`;
  return c.paused ? `⏸ ${d} (השעון עצור)` : d;
}

/** צבע התגית — אדום כשאיחרת, צהוב כשנשארו יומיים או פחות */
export function tone(production) {
  const c = clockState(production);
  if (!c || c.state === 'done') return '';
  if (c.state === 'late') return 'r';
  if (c.paused) return 'b';
  return c.left <= 2 ? 'y' : '';
}

/* ============================================================
   כל השעונים הפתוחים
   ============================================================ */

export const openClocks = () => S().items
  .filter(i => i.type === 'production' && !i.archived && !i.deliveredAt && i.clockStartedAt)
  .map(p => ({ production: p, ...clockState(p) }))
  .filter(x => x.state);

/**
 * "היום הזה לא נספר" — מסמן את היום, ודוחף כל שעון פתוח
 * ביום עסקים אחד. תאריכי היעד שמורים כתאריכים, אז סימון
 * רטרואקטיבי לא זז מעצמו — וזו בדיוק הכוונה: אתה רואה מה זז.
 * מחזיר כמה שעונים הוזזו, או -1 אם היום כבר סומן.
 */
export function markTodayOff(ts = now()) {
  if (!BD.markOff(ts)) return -1;
  const open = openClocks();
  open.forEach(x => {
    if (x.production.dueDate)
      patchItem(x.production.id, { dueDate: BD.addBusinessDays(x.production.dueDate, 1) });
  });
  return open.length;
}
