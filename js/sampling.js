/* ============================================================
   sampling.js — מדידת זמן בדגימות
   ------------------------------------------------------------
   הבעיה: אתה עובר בין לשוניות שלוש פעמים בדקה, ורוב העבודה קורית
   בכלל מחוץ לדפדפן. דף אינטרנט לא יכול לדעת אם אתה בוגאס או בפייסבוק,
   וטיימר שצריך לזכור להחליף — לא מוחלף.

   הפתרון: לא לעקוב, לשאול. המערכת מקפיצה שאלה אחת בזמנים אקראיים,
   "מה אתה עושה עכשיו?", ואתה לוחץ כפתור אחד. כל דגימה מייצגת פרק זמן
   קבוע, אז ספירת הדגימות היא מדידה של השעות.

   12 דגימות ביום על חלון של 10 שעות → כל דגימה שווה 50 דקות.
   דני קיבל 4 דגימות → דני לקח בערך 3.3 שעות. אחרי שבוע זה מתייצב.

   דגימה מוקפצת כהתראת מערכת הפעלה, כך שהיא מגיעה גם מעל וגאס.
   כפתורי התשובה יושבים בתוך ההתראה עצמה (דורש Service Worker).
   ============================================================ */

import { S, update, uid, getItem, stageOf } from './store.js';
import { MIN, HOUR, DAY, startOfDay } from './util.js';

const now = () => Date.now();

/* ---------- הגדרות ותזמון ---------- */

export function cfg() {
  const c = S().settings.sampling || {};
  return {
    enabled: c.enabled !== false,
    perDay: Math.max(1, Math.min(48, c.perDay || 12)),
    fromHour: c.fromHour ?? 9,
    toHour: c.toHour ?? 19,
    days: Array.isArray(c.days) && c.days.length ? c.days : [0, 1, 2, 3, 4],   // 0 = ראשון
    onMiss: c.onMiss || 'assume',        // 'assume' | 'drop' | 'endOfDay'
    notify: c.notify !== false
  };
}

/** כמה זמן "שווה" דגימה אחת */
export function sampleWeightMs() {
  const c = cfg();
  const windowH = Math.max(1, c.toHour - c.fromHour);
  return windowH * HOUR / c.perDay;
}

/** דגימה נדחית בתוך משבצת, לא אקראית לגמרי — כך אין צביר ואין חורים */
function planDay(dayTs) {
  const c = cfg();
  const base = startOfDay(dayTs);
  const from = base + c.fromHour * HOUR;
  const slot = (c.toHour - c.fromHour) * HOUR / c.perDay;
  const times = [];
  for (let i = 0; i < c.perDay; i++) {
    // 10%-90% בתוך המשבצת, שלא ייפול בדיוק על הגבול
    times.push(Math.round(from + i * slot + slot * (0.1 + Math.random() * 0.8)));
  }
  return times;
}

function ensurePlan() {
  const c = cfg();
  const today = startOfDay();
  const s = S();
  const plan = s.samplePlan;
  if (plan && plan.date === today) return plan;

  const dow = new Date().getDay();
  const times = c.days.includes(dow) ? planDay(today) : [];
  const next = { date: today, times, fired: [] };
  update(st => { st.samplePlan = next; }, { silent: true });
  return next;
}

/* ---------- מחזור החיים של דגימה ---------- */

const listeners = new Set();
export function onSample(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = (ev, data) => listeners.forEach(f => { try { f(ev, data); } catch (e) { console.error(e); } });

/** הדגימה הפתוחה שממתינה לתשובה, אם יש */
export function openSample() {
  return S().samples.find(x => !x.answeredAt && !x.closedAt) || null;
}

/** המועמדים שמוצגים בשאלה — מה שסביר שאתה עובד עליו עכשיו */
export function candidates(limit = 6) {
  const s = S();
  const active = s.items.filter(i => i.type === 'client' && !i.archived && !i.deliveredAt);

  // ניקוד: מה שנגעת בו לאחרונה, ומה שיושב בשלב שדורש עבודה
  const score = c => {
    const st = stageOf(c);
    const recency = Math.max(0, 40 - (now() - (c.updatedAt || 0)) / HOUR);
    const doing = /יצירה|אפיון|תיקונים|הקמת/.test(st?.name || '') ? 30 : 0;
    const lastSample = s.samples.filter(x => x.itemId === c.id).slice(-1)[0];
    const wasLast = lastSample && now() - lastSample.at < 3 * HOUR ? 25 : 0;
    return recency + doing + wasLast;
  };

  const clients = active.sort((a, b) => score(b) - score(a)).slice(0, limit - 1);
  const tasks = s.items.filter(i => i.type === 'task' && !i.archived && !i.done)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 2);
  return { clients, tasks };
}

/** יוצר דגימה ומקפיץ אותה */
function fire(dueAt) {
  // דגימה קודמת שלא נענתה — סוגרים אותה לפי המדיניות
  closeStale();

  const sm = { id: uid('sm'), at: dueAt, firedAt: now(), answeredAt: null, itemId: null, kind: null, source: null };
  update(s => { s.samples.push(sm); if (s.samplePlan) s.samplePlan.fired.push(dueAt); });
  emit('fire', sm);
  return sm;
}

/** תשובה לדגימה. kind: 'work' | 'learn' | 'off' */
export function answer(id, { itemId = null, kind = 'work', source = 'answer' } = {}) {
  update(s => {
    const sm = s.samples.find(x => x.id === id);
    if (!sm || sm.answeredAt) return;
    sm.answeredAt = now(); sm.itemId = itemId; sm.kind = kind; sm.source = source;
  }, { label: 'תשובה לדגימת זמן' });
  emit('answer', S().samples.find(x => x.id === id));
}

/** דגימה שלא נענתה בזמן סביר */
function closeStale() {
  const c = cfg();
  const cutoff = now() - Math.min(25 * MIN, sampleWeightMs() * 0.6);
  const stale = S().samples.filter(x => !x.answeredAt && !x.closedAt && x.firedAt < cutoff);
  if (!stale.length) return;

  stale.forEach(sm => {
    if (c.onMiss === 'assume') {
      const prev = lastAnswered(sm.at);
      if (prev) {
        update(s => {
          const x = s.samples.find(y => y.id === sm.id);
          if (x) { x.itemId = prev.itemId; x.kind = prev.kind; x.source = 'assumed'; x.answeredAt = now(); }
        }, { silent: true });
        return;
      }
    }
    update(s => {
      const x = s.samples.find(y => y.id === sm.id);
      if (x) { x.closedAt = now(); x.source = 'missed'; }
    }, { silent: true });
  });
  emit('stale', stale);
}

function lastAnswered(before = Infinity) {
  const list = S().samples.filter(x => x.answeredAt && x.at < before && x.source !== 'missed');
  return list.length ? list[list.length - 1] : null;
}

/* ---------- הלולאה ---------- */

let loop = null;

export function start() {
  clearInterval(loop);
  loop = setInterval(tick, 30000);
  setTimeout(tick, 3000);
}

function tick() {
  const c = cfg();
  if (!c.enabled) return;
  const plan = ensurePlan();
  const fired = new Set(plan.fired || []);
  const due = (plan.times || []).filter(t => t <= now() && !fired.has(t));
  if (!due.length) { closeStale(); return; }

  // אם פספסנו כמה בבת אחת (המחשב היה כבוי) — מקפיצים רק את האחרונה,
  // והשאר נסגרות בשקט. לא מציפים אותו בשבע שאלות.
  const skipped = due.slice(0, -1);
  if (skipped.length) update(s => { if (s.samplePlan) s.samplePlan.fired.push(...skipped); }, { silent: true });
  fire(due[due.length - 1]);
}

/** מקפיץ שאלה עכשיו — לבדיקה, או כשרוצים לרשום נקודה ידנית */
export function askNow() {
  closeStale();
  return fire(now());
}

/* ---------- סטטיסטיקה ---------- */

/**
 * כמה שעות הלכו לאן, לפי דגימות.
 * מחזיר {weightMs, counted, byItem:[{itemId,count,ms}], offCount, offMs, guessRate}
 */
export function stats({ from = 0, to = Infinity, itemId = null } = {}) {
  const w = sampleWeightMs();
  const list = S().samples.filter(x => x.answeredAt && x.at >= from && x.at <= to && x.source !== 'missed');
  const byItem = new Map();
  let offCount = 0, guesses = 0;

  list.forEach(x => {
    if (x.source === 'assumed') guesses++;
    if (x.kind === 'off') { offCount++; return; }
    const key = x.itemId || ('__' + x.kind);
    const cur = byItem.get(key) || { itemId: x.itemId, kind: x.kind, count: 0 };
    cur.count++;
    byItem.set(key, cur);
  });

  const arr = Array.from(byItem.values())
    .map(x => ({ ...x, ms: x.count * w }))
    .sort((a, b) => b.count - a.count);

  const out = {
    weightMs: w, counted: list.length, byItem: arr,
    offCount, offMs: offCount * w,
    guessRate: list.length ? guesses / list.length : 0
  };
  if (itemId) {
    const hit = arr.find(x => x.itemId === itemId);
    out.itemMs = hit ? hit.ms : 0;
    out.itemCount = hit ? hit.count : 0;
  }
  return out;
}

/** כמה זמן נטו הושקע בפריט אחד, לפי דגימות */
export function itemMs(id) {
  const w = sampleWeightMs();
  return S().samples.filter(x => x.itemId === id && x.answeredAt && x.source !== 'missed').length * w;
}

export function itemCount(id) {
  return S().samples.filter(x => x.itemId === id && x.answeredAt && x.source !== 'missed').length;
}

/**
 * ממוצע שעות נטו לסרטון שנמסר, לפי דגימות.
 * מחזיר null כשאין מספיק נתונים כדי לומר משהו אמין.
 */
export function avgPerDelivery(productLineId = null) {
  const done = S().items.filter(i => i.type === 'client' && i.deliveredAt &&
    (!productLineId || i.productLineId === productLineId));
  if (!done.length) return null;
  const counts = done.map(c => itemCount(c.id));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < 5) return null;                     // פחות מזה זה ניחוש, לא מדידה
  const w = sampleWeightMs();
  return {
    avgMs: total * w / done.length,
    count: done.length, samples: total,
    // ככל שיש יותר דגימות, השגיאה קטנה. ~1/√n
    errorPct: Math.round(100 / Math.sqrt(total))
  };
}

/** האם כבר אפשר לסמוך על המספרים */
export function confidence() {
  const n = S().samples.filter(x => x.answeredAt && x.source === 'answer').length;
  if (n < 15) return { level: 'low', n, text: `${n} דגימות — עוד מוקדם. תן לזה כמה ימים.` };
  if (n < 60) return { level: 'mid', n, text: `${n} דגימות — המספרים מתחילים להתייצב.` };
  return { level: 'high', n, text: `${n} דגימות — המספרים אמינים.` };
}

/** דגימות של יום מסוים, לציר היום */
export function daySamples(dayTs = Date.now()) {
  const from = startOfDay(dayTs), to = from + DAY;
  return S().samples.filter(x => x.at >= from && x.at < to).sort((a, b) => a.at - b.at);
}
