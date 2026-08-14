/* ============================================================
   brain.js — ההיגיון של המערכת
   דחיפות · ציון רלוונטיות לידע · שגרות · יום מוצע
   ============================================================ */

import { S, lineOf, stageOf, stageIndex, getItem, patchItem, update } from './store.js';
import { MIN, HOUR, DAY, startOfDay, ago, dur } from './util.js';
import { focusMs, activeTimer, isWaiting, availableToday, avgFocusPerDelivery } from './timer.js';

const now = () => Date.now();

/* ============================================================
   1. דחיפות — רשימה אחת שמערבבת לידים והפקות
   ליד שממתין 20 דקות דחוף יותר מסרטון שממתין 3 ימים,
   כי משקל השלב גובר על יחס ההמתנה.
   ============================================================ */

export function scoreClient(c) {
  const line = lineOf(c.productLineId);
  const st = stageOf(c);
  const waitedMin = (now() - (c.stageSince || c.createdAt)) / MIN;
  const sla = st.sla || 24 * 60;
  const ratio = waitedMin / sla;

  let score = (st.priority || 5) * 100;
  score += Math.min(ratio, 4) * 45;

  const why = [];
  if (st.priority >= 8) why.push(`${st.name} — לא מחכה`);
  else why.push(`${st.name} · ${ago(c.stageSince || c.createdAt)} בשלב`);

  if (ratio >= 1) { why.push('עבר את הזמן הסביר'); }

  if (c.dueDate) {
    const left = c.dueDate - now();
    if (left < 0) { score += 220; why.push('עבר את תאריך היעד'); }
    else if (left < 2 * DAY) { score += 140; why.push(`יעד בעוד ${dur(left)}`); }
    else if (left < 5 * DAY) score += 50;
  }
  if (isWaiting(c.id)) score -= 260, why.push('בהמתנה');
  if (c.snoozeUntil && c.snoozeUntil > now()) score -= 1000;

  return { score, why: why.join(' · '), stuck: ratio >= 1, line, stage: st };
}

export function scoreTask(t) {
  let score = 380;
  const why = [];
  if (t.clientId) {
    const c = getItem(t.clientId);
    if (c) { const cs = scoreClient(c); score = Math.max(score, cs.score - 40); why.push('ל' + c.title); }
  }
  if (t.dueDate) {
    const left = t.dueDate - now();
    if (left < 0) { score += 260; why.push('באיחור'); }
    else if (left < DAY) { score += 170; why.push('להיום'); }
    else if (left < 3 * DAY) { score += 60; why.push('בקרוב'); }
  }
  if (t.priority === 'high') { score += 150; why.push('סימנת כדחוף'); }
  const age = now() - t.createdAt;
  score += Math.min(age / DAY, 10) * 8;
  if (!why.length) why.push(`נפתחה לפני ${ago(t.createdAt)}`);
  if (t.snoozeUntil && t.snoozeUntil > now()) score -= 1000;
  return { score, why: why.join(' · ') };
}

/** הרשימה המרכזית של הבית — ממוינת לפי דחיפות, מערבבת סוגים */
export function actionQueue(limit = 7) {
  const s = S();
  const out = [];

  s.items.filter(i => i.type === 'client' && !i.archived && !i.deliveredAt).forEach(c => {
    const r = scoreClient(c);
    out.push({ item: c, score: r.score, why: r.why, stuck: r.stuck, kind: 'client' });
  });

  s.items.filter(i => i.type === 'task' && !i.archived && !i.done).forEach(t => {
    const r = scoreTask(t);
    out.push({ item: t, score: r.score, why: r.why, kind: 'task' });
  });

  dueRoutines().forEach(r => {
    out.push({
      item: r, kind: 'routine',
      score: 300 + (r.overdueDays > 0 ? Math.min(r.overdueDays, 6) * 22 : 0) - (r.missCount >= 2 ? 200 : 0),
      why: r.missCount >= 2 ? 'שגרה שפוספסה פעמיים — בלי לחץ' : `שגרה · ${r.freqLabel}`
    });
  });

  s.items.filter(i => i.type === 'decision' && !i.archived && i.status === 'open').forEach(d => {
    const age = (now() - d.createdAt) / DAY;
    const stale = age > (s.settings.decisionStaleDays || 7);
    out.push({
      item: d, kind: 'decision',
      score: 250 + Math.min(age, 20) * 6 + (stale ? 60 : 0),
      why: stale ? `החלטה פתוחה ${ago(d.createdAt)} — הגיע הזמן להכריע` : 'החלטה פתוחה'
    });
  });

  out.sort((a, b) => b.score - a.score);
  return limit ? out.slice(0, limit) : out;
}

/** תמיד יש מה לעשות — גם ביום ריק */
export function fillerSuggestions() {
  const s = S();
  const out = [];
  const k = topKnowledge();
  if (k) out.push({ kind: 'knowledge', item: k.item, why: k.why, score: 200 });
  s.items.filter(i => i.type === 'idea' && !i.archived).slice(0, 2).forEach(i =>
    out.push({ kind: 'idea', item: i, why: 'רעיון שרשמת — אולי היום', score: 120 }));
  return out;
}

/* ============================================================
   2. ידע — ציון רלוונטיות
   ============================================================ */

export function knowledgeScore(k) {
  const s = S();
  const reasons = [];
  let score = 0;

  // כמה זמן יושב בלי מגע
  const idleDays = (now() - (k.lastTouched || k.createdAt)) / DAY;
  score += Math.min(idleDays, 45) * 2.2;
  if (idleDays >= 7) reasons.push(`יושב ${Math.round(idleDays)} יום`);

  // קשר לפריט פעיל עכשיו — הכי חשוב
  const t = activeTimer();
  const activeItem = t && t.itemId ? getItem(t.itemId) : null;
  let linked = null;
  if (activeItem) {
    if (k.relatedItemId === activeItem.id) linked = activeItem;
    else if (k.tags?.length && shareTag(k, activeItem)) linked = activeItem;
    else if (activeItem.productLineId && k.productLineId === activeItem.productLineId) linked = activeItem;
  }
  if (linked) { score += 130; reasons.unshift(`קשור ל${linked.title} שאתה עובד עליו עכשיו`); }
  else if (k.relatedItemId) {
    const rel = getItem(k.relatedItemId);
    if (rel && !rel.archived && !rel.done && !rel.deliveredAt) { score += 35; reasons.push(`קשור ל${rel.title}`); }
  }

  // הזמן המשוער מול הזמן הפנוי
  const av = availableToday();
  const est = (k.estMinutes || 20) * MIN;
  const leftClock = av.remainingClock;
  if (est <= leftClock && est <= 45 * MIN) { score += 30; reasons.push(`${k.estMinutes} דק' — נכנס בקלות`); }
  else if (est > leftClock) { score -= 40; reasons.push('ארוך מהזמן שנשאר היום'); }

  if (k.urgent) { score += 70; reasons.push('סימנת כדחוף'); }
  if (k.status === 'doing') score += 25;
  if (k.status === 'done' || k.status === 'irrelevant') score = -1000;
  if (k.archived) score = -1000;

  return { score, why: reasons.slice(0, 2).join(', ') || 'ממתין לך' };
}

function shareTag(a, b) {
  const ta = (a.tags || []).map(x => x.toLowerCase());
  const tb = [...(b.tags || []), b.title, b.business || ''].join(' ').toLowerCase();
  return ta.some(x => x && tb.includes(x));
}

export function rankedKnowledge() {
  return S().items
    .filter(i => i.type === 'knowledge' && !i.archived)
    .map(k => ({ item: k, ...knowledgeScore(k) }))
    .filter(x => x.score > -500)
    .sort((a, b) => b.score - a.score);
}

export function topKnowledge() {
  return rankedKnowledge()[0] || null;
}

/* ============================================================
   3. שגרות
   ============================================================ */

export const FREQ = {
  daily:     { label: 'יומי',   days: 1 },
  weekly:    { label: 'שבועי',  days: 7 },
  monthly:   { label: 'חודשי',  days: 30 },
  quarterly: { label: 'רבעוני', days: 91 },
  yearly:    { label: 'שנתי',   days: 365 },
  custom:    { label: 'מותאם',  days: 3 }
};

export const freqDays = r => r.freq === 'custom' ? (r.customDays || 3) : (FREQ[r.freq]?.days || 7);
export const freqLabel = r => r.freq === 'custom' ? `כל ${r.customDays || 3} ימים` : (FREQ[r.freq]?.label || r.freq);

export function routineDue(r) {
  const period = freqDays(r) * DAY;
  const base = r.lastDone || r.createdAt;
  const due = r.nextDue || (base + (r.lastDone ? period : 0));
  return { due, overdue: now() - due, overdueDays: Math.floor((now() - due) / DAY) };
}

export function dueRoutines() {
  return S().items
    .filter(i => i.type === 'routine' && !i.archived)
    .map(r => { const d = routineDue(r); return Object.assign({}, r, d, { freqLabel: freqLabel(r) }); })
    .filter(r => r.overdue >= 0)
    .sort((a, b) => a.due - b.due);
}

export function completeRoutine(id) {
  const r = getItem(id);
  if (!r) return;
  const period = freqDays(r) * DAY;
  patchItem(id, { lastDone: now(), missCount: 0, nextDue: now() + period });
}

/** מפספס פעמיים = לא צועק יותר. נקרא פעם ביום בעליית האפליקציה. */
export function rollRoutines() {
  const s = S();
  s.items.filter(i => i.type === 'routine' && !i.archived).forEach(r => {
    const period = freqDays(r) * DAY;
    const { due } = routineDue(r);
    const missed = Math.floor((now() - due) / period);
    if (missed >= 1) {
      update(st => {
        const x = st.items.find(i => i.id === r.id);
        if (!x) return;
        x.missCount = Math.min((x.missCount || 0) + missed, 9);
        x.nextDue = due + missed * period;      // לא נערם אינסוף — מתיישר קדימה
      });
    }
  });
}

/* ============================================================
   4. יום מוצע — בלוקי זמן שהוא מאשר או גורר לשנות
   ============================================================ */

export function estimateMinutes(entry) {
  const it = entry.item;
  if (entry.kind === 'client') {
    const line = lineOf(it.productLineId);
    const st = stageOf(it);
    const avg = avgFocusPerDelivery(line.id);
    const total = avg ? avg.avgMs / HOUR : (line.estHours || 4);
    const stages = line.stages.length || 1;
    const weight = st.name.includes('יצירה') ? 0.45 : st.name.includes('אפיון') ? 0.15 : 0.1;
    return Math.max(15, Math.round(total * weight * 60 / 5) * 5);
  }
  if (entry.kind === 'knowledge') return it.estMinutes || 20;
  if (entry.kind === 'routine') return it.estMinutes || 20;
  if (entry.kind === 'decision') return 15;
  return it.estMinutes || 30;
}

export function buildDayPlan() {
  const s = S();
  const st = s.settings;
  const dayStart = startOfDay() + (st.dayStartHour || 9) * HOUR;
  let cursor = Math.max(now(), dayStart);
  const dayEnd = dayStart + (st.workHoursPerDay || 6) * HOUR;

  const queue = actionQueue(12);
  const blocks = [];
  let insertedKnowledge = false;

  for (const e of queue) {
    if (cursor >= dayEnd) break;
    let mins = estimateMinutes(e);
    mins = Math.min(mins, Math.round((dayEnd - cursor) / MIN));
    if (mins < 10) break;
    blocks.push({ id: e.item.id, kind: e.kind, title: e.item.title, why: e.why, start: cursor, minutes: mins });
    cursor += mins * MIN;

    // אחרי כשעתיים של עבודה — משבצים פריט ידע אחד
    if (!insertedKnowledge && cursor - dayStart > 2 * HOUR) {
      const k = topKnowledge();
      if (k && cursor < dayEnd) {
        const km = Math.min(k.item.estMinutes || 20, Math.round((dayEnd - cursor) / MIN));
        if (km >= 10) {
          blocks.push({ id: k.item.id, kind: 'knowledge', title: k.item.title, why: k.why, start: cursor, minutes: km });
          cursor += km * MIN;
          insertedKnowledge = true;
        }
      }
    }
  }

  // עדיין נשאר זמן? תמיד יש מה לעשות.
  if (cursor < dayEnd - 20 * MIN) {
    fillerSuggestions().forEach(f => {
      if (cursor >= dayEnd - 10 * MIN) return;
      const m = Math.min(estimateMinutes(f), Math.round((dayEnd - cursor) / MIN));
      blocks.push({ id: f.item.id, kind: f.kind, title: f.item.title, why: f.why, start: cursor, minutes: m });
      cursor += m * MIN;
    });
  }
  if (cursor < dayEnd - 25 * MIN) {
    blocks.push({
      id: '__marketing', kind: 'free', title: 'שיווק וקידום העסק',
      why: 'אין דחיפויות — הזמן הזה שווה יותר מלרענן מיילים',
      start: cursor, minutes: Math.round((dayEnd - cursor) / MIN)
    });
  }

  const plan = { date: startOfDay(), blocks };
  update(s2 => { s2.dayPlan = plan; });
  return plan;
}

export function currentPlan() {
  const p = S().dayPlan;
  if (!p || p.date !== startOfDay()) return buildDayPlan();
  return p;
}

export function savePlan(blocks) {
  update(s => { s.dayPlan = { date: startOfDay(), blocks }; });
}

/* ============================================================
   5. התקדמות בתוך משימה — צ'קליסט מול מחוון ידני, המאוחר קובע
   ============================================================ */

export function progressOf(item) {
  const list = item.checklist || [];
  const done = list.filter(c => c.done).length;
  const auto = list.length ? done / list.length : 0;
  const manual = (item.manualProgress || 0) / 100;
  return { auto, manual, value: Math.max(auto, manual), done, total: list.length };
}

/* ============================================================
   6. כסף — חישובי עלות ורווח
   ============================================================ */

export function unitEconomics(over = {}) {
  const s = S();
  const line = lineOf(over.productLineId || s.productLines[0].id);
  const subsILS = s.subscriptions.reduce((a, x) =>
    a + (x.currency === 'USD' ? x.cost * (s.settings.usdRate || 3.65) : x.cost), 0);

  const price = over.price ?? (line.pricing?.unit || 1290);
  const perMonth = over.perMonth ?? Math.max(1, deliveredThisMonth() || 4);
  const leadCost = over.leadCost ?? (s.settings.avgLeadCost ?? 120);
  const hours = over.hours ?? measuredHoursPerVideo(line.id);
  const rate = over.rate ?? (s.settings.hourlyTarget || 250);

  const subsPerVideo = subsILS / perMonth;
  const timeCost = hours * rate;
  const costPerVideo = subsPerVideo + leadCost + timeCost;
  const profitPerVideo = price - costPerVideo;
  const cashPerVideo = price - subsPerVideo - leadCost;      // בלי לתמחר את הזמן שלו

  const monthlyIncome = price * perMonth;
  const monthlyExpense = subsILS + leadCost * perMonth;
  const monthlyNet = monthlyIncome - monthlyExpense;
  const monthlyHours = hours * perMonth;
  const realHourly = monthlyHours ? monthlyNet / monthlyHours : 0;
  const hoursPerDay = monthlyHours / 22;

  return {
    line, subsILS, price, perMonth, leadCost, hours, rate,
    subsPerVideo, timeCost, costPerVideo, profitPerVideo, cashPerVideo,
    monthlyIncome, monthlyExpense, monthlyNet, monthlyHours, realHourly, hoursPerDay
  };
}

export function deliveredThisMonth() {
  const mk = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  return S().items.filter(i => i.type === 'client' && i.deliveredAt &&
    (new Date(i.deliveredAt).getFullYear() + '-' + String(new Date(i.deliveredAt).getMonth() + 1).padStart(2, '0')) === mk).length;
}

export function measuredHoursPerVideo(lineId) {
  const a = avgFocusPerDelivery(lineId);
  if (a && a.avgMs > 10 * MIN) return Math.round(a.avgMs / HOUR * 10) / 10;
  return lineOf(lineId).estHours || 4;
}
