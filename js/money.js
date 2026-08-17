/* ============================================================
   money.js — ההיגיון של הכסף
   ------------------------------------------------------------
   ארבעה חישובים שהופכים מדידה להחלטה:
     1. כמה זמן ייקח הסרטון הבא, עם טווח ולא מספר אחד
     2. מה המחיר שאתה צריך לגבות, כמספר אחד
     3. כמה עולה ליד בכל ערוץ, ומה אחוז ההמרה שלו
     4. הכנסה חוזרת — מי בלקוח קבוע וכמה זה MRR
   ============================================================ */

import { S, lineOf, monthlySubsILS } from './store.js';
import { HOUR, DAY, MIN } from './util.js';
import { focusMs } from './timer.js';
import { itemMs as sampleMs, itemCount as sampleCount, sampleWeightMs } from './sampling.js';
import { hoursPerVideo } from './brain.js';

const now = () => Date.now();

/* ============================================================
   1. כמה ייקח הסרטון הבא
   ============================================================ */

/** השעות שהושקעו בלקוח, מהמקור האמין ביותר שיש עליו */
export function clientHours(c) {
  const n = sampleCount(c.id);
  if (n >= 3) return { hours: sampleMs(c.id) / HOUR, source: 'samples', n };
  const f = focusMs(c.id);
  if (f > 10 * MIN) return { hours: f / HOUR, source: 'timer', n: 0 };
  return null;
}

/**
 * תחזית לסרטון הבא, מבוססת על מה שנמסר בפועל.
 * מחזיר טווח ולא מספר יחיד: p50 זה המקרה הרגיל, p80 זה מה שקורה
 * כשמשהו מסתבך. הבטחה ללקוח צריכה להישען על p80, לא על הממוצע.
 */
export function forecast(productLineId = null) {
  const s = S();
  const done = s.items.filter(i => i.type === 'client' && i.deliveredAt &&
    (!productLineId || i.productLineId === productLineId));

  const measured = done.map(c => clientHours(c)).filter(Boolean).map(x => x.hours).sort((a, b) => a - b);
  if (measured.length < 2) return null;

  const q = p => {
    const i = (measured.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? measured[lo] : measured[lo] + (measured[hi] - measured[lo]) * (i - lo);
  };

  // זמן מהתחלה עד מסירה — כמה ימים עברו מפתיחה ועד מסירה. זה מה שמבטיחים ללקוח.
  const days = done.map(c => (c.deliveredAt - c.createdAt) / DAY).sort((a, b) => a - b);
  const qd = p => {
    const i = (days.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? days[lo] : days[lo] + (days[hi] - days[lo]) * (i - lo);
  };

  return {
    n: measured.length,
    p50: Math.round(q(0.5) * 10) / 10,
    p80: Math.round(q(0.8) * 10) / 10,
    min: Math.round(measured[0] * 10) / 10,
    max: Math.round(measured[measured.length - 1] * 10) / 10,
    days50: Math.round(qd(0.5)),
    days80: Math.round(qd(0.8))
  };
}

/* ============================================================
   2. המחיר שאתה צריך
   ============================================================ */

/**
 * המחיר שמכסה את התעריף שקבעת לעצמך, בהינתן כמה זמן זה באמת לוקח.
 * מעוגל כלפי מעלה לעשרות, כי 1,537 ₪ זה לא מחיר שאומרים בטלפון.
 */
export function requiredPrice(productLineId = null) {
  const s = S();
  const line = lineOf(productLineId || s.productLines[0].id);
  const h = hoursPerVideo(line.id);
  const rate = s.settings.hourlyTarget || 250;
  const avgPerMonth = deliveredPerMonthAvg();
  const perMonth = Math.max(1, avgPerMonth || 4);

  // מעט מסירות = המנויים מתחלקים על מעט ראשים והמחיר "הנדרש" קופץ.
  // זה נכון מתמטית, אבל צריך לומר את זה במפורש ולא להציג כעובדה.
  const deliveredCount = s.items.filter(i => i.type === 'client' && i.deliveredAt &&
    i.deliveredAt > now() - 90 * DAY).length;

  const subsPerVideo = monthlySubsILS() / perMonth;
  const leadCost = avgLeadCost();
  const need = h.hours * rate + subsPerVideo + leadCost;
  const rounded = Math.ceil(need / 10) * 10;
  const current = line.pricing?.unit || 0;

  return {
    need: rounded, raw: need, current, gap: rounded - current,
    hours: h.hours, hoursSource: h.source, rate, subsPerVideo, leadCost, perMonth,
    lowData: deliveredCount < 3, deliveredCount,
    // מה השעה שלך שווה בפועל במחיר הנוכחי
    actualRate: h.hours ? (current - subsPerVideo - leadCost) / h.hours : 0
  };
}

/** ממוצע מסירות לחודש לפי שלושת החודשים האחרונים, ולא רק החודש הנוכחי */
export function deliveredPerMonthAvg() {
  const s = S();
  const done = s.items.filter(i => i.type === 'client' && i.deliveredAt &&
    i.deliveredAt > now() - 90 * DAY);
  if (!done.length) return 0;
  const span = Math.max(1, (now() - Math.min(...done.map(c => c.deliveredAt))) / (30 * DAY));
  return Math.round(done.length / span * 10) / 10;
}

/* ============================================================
   3. מקור הליד
   ============================================================ */

export const SOURCES = [
  { id: 'ad', name: 'מודעה ממומנת', color: '#5aa9ff' },
  { id: 'organic', name: 'אורגני', color: '#3ddc84' },
  { id: 'referral', name: 'הפניה', color: '#ffd400' },
  { id: 'repeat', name: 'לקוח חוזר', color: '#b98cff' },
  { id: 'other', name: 'אחר', color: '#94a3b8' }
];

export const sourceMeta = id => SOURCES.find(x => x.id === id) || SOURCES[SOURCES.length - 1];

/**
 * פילוח לפי ערוץ: כמה לידים, כמה נסגרו, כמה כסף, וכמה עלה כל ליד.
 * עלות הפרסום נלקחת מתנועות הכסף שסומנו כפרסום ומשויכות לערוץ.
 */
export function bySource({ days = 90 } = {}) {
  const s = S();
  const from = now() - days * DAY;
  const clients = s.items.filter(i => i.type === 'client' && !i.archived && i.createdAt >= from);

  const spendBy = {};
  s.ledger.forEach(l => {
    if (l.amount >= 0 || l.date < from) return;
    const src = l.source || (/מודע|קמפיין|meta|facebook|ads/i.test(l.title) ? 'ad' : null);
    if (!src) return;
    spendBy[src] = (spendBy[src] || 0) + Math.abs(l.amount);
  });

  const map = new Map();
  clients.forEach(c => {
    const src = c.source || 'other';
    const cur = map.get(src) || { source: src, leads: 0, won: 0, revenue: 0, spend: 0 };
    cur.leads++;
    if (c.paidAt || c.deliveredAt) { cur.won++; cur.revenue += c.amount || 0; }
    map.set(src, cur);
  });

  Object.entries(spendBy).forEach(([src, amt]) => {
    const cur = map.get(src) || { source: src, leads: 0, won: 0, revenue: 0, spend: 0 };
    cur.spend = amt;
    map.set(src, cur);
  });

  return Array.from(map.values()).map(x => ({
    ...x,
    meta: sourceMeta(x.source),
    convRate: x.leads ? x.won / x.leads : 0,
    costPerLead: x.leads && x.spend ? x.spend / x.leads : 0,
    costPerWin: x.won && x.spend ? x.spend / x.won : 0,
    roi: x.spend ? (x.revenue - x.spend) / x.spend : null
  })).sort((a, b) => b.leads - a.leads);
}

/** עלות ממוצעת לליד בפועל, ואם אין נתונים — מה שהוגדר ידנית */
export function avgLeadCost() {
  const rows = bySource({ days: 90 });
  const spend = rows.reduce((a, x) => a + x.spend, 0);
  const leads = rows.reduce((a, x) => a + x.leads, 0);
  if (spend > 0 && leads > 0) return Math.round(spend / leads);
  return S().settings.avgLeadCost ?? 120;
}

/* ============================================================
   שער דולר
   ============================================================ */

/** מושך שער יומי דרך פונקציית השרת. הדפדפן לבדו חסום ב-CORS. */
export async function refreshUsdRate({ force = false } = {}) {
  const s = S();
  if (!force) {
    if (!s.settings.usdRateAuto) return null;
    if (s.settings.usdRateAt && now() - s.settings.usdRateAt < 20 * HOUR) return null;
  }
  try {
    const { callAssistant } = await import('./api.js');
    const r = await callAssistant({ mode: 'usd' });
    if (!r || !r.ok) return null;
    const j = await r.json();
    if (!j || typeof j.rate !== 'number') return null;
    const { update } = await import('./store.js');
    const prev = s.settings.usdRate;
    update(st => { st.settings.usdRate = j.rate; st.settings.usdRateAt = j.at || now(); });
    return { rate: j.rate, prev, changed: Math.abs(j.rate - prev) > 0.005 };
  } catch { return null; }
}

/* ============================================================
   4. הכנסה חוזרת
   ============================================================ */

/**
 * לקוח בלקוח קבוע משלם כל חודש. במערכת הוא לקוח עם retainer:true
 * וסכום חודשי, ותאריך חידוש הבא.
 */
export function retainers() {
  return S().items.filter(i => i.type === 'client' && i.retainer && !i.archived && !i.retainerEndedAt);
}

export function mrr() {
  const list = retainers();
  const total = list.reduce((a, c) => a + (c.monthlyAmount || c.amount || 0), 0);
  return { total, count: list.length, list };
}

/** מי צריך חידוש בקרוב, ומי כבר עבר */
export function renewalsDue({ withinDays = 7 } = {}) {
  const limit = now() + withinDays * DAY;
  return retainers()
    .filter(c => c.nextRenewalAt && c.nextRenewalAt <= limit)
    .sort((a, b) => a.nextRenewalAt - b.nextRenewalAt);
}

/** מזיז את תאריך החידוש חודש קדימה ורושם את התשלום */
export function nextRenewalDate(from = now()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}
