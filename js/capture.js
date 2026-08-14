/* ============================================================
   capture.js — הקלט החופשי
   שדה אחד, טקסט חופשי, המערכת מסווגת לבד.
   חוקים פשוטים קודם; אם העוזר מחובר — הוא מדייק ברקע.
   ============================================================ */

import { S, addItem, patchItem, getItem, lineOf, moveToStage } from './store.js';
import { DAY } from './util.js';
import { callAssistant } from './api.js';

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.(netlify\.app|com|co\.il|io|ai|org|net)(\/[^\s]*)?)/i;

const KW = {
  decision: ['האם', 'או ש', 'להחליט', 'החלטה', 'דילמה', 'כדאי לי', 'שווה', 'מה עדיף', 'לבחור בין', 'ללבטים'],
  knowledge: ['לצפות', 'לראות', 'לקרוא', 'מאמר', 'סרטון על', 'ללמוד', 'קורס', 'טוטוריאל', 'להבין איך',
    'יצא', 'השיקו', 'כלי חדש', 'גיליתי', 'שמעתי על', 'פודקאסט', 'וובינר', 'להכיר'],
  idea: ['רעיון', 'אולי כדאי', 'מה אם', 'חשבתי ש', 'יהיה מגניב', 'רעיון לסרטון'],
  routine: ['כל יום', 'כל שבוע', 'כל חודש', 'פעם בשבוע', 'פעם בחודש', 'פעמיים בשבוע', 'כל בוקר', 'כל ערב'],
  task: ['לתקן', 'לשלוח', 'להעלות', 'לעדכן', 'לבנות', 'להוסיף', 'לכתוב', 'להתקשר', 'לסדר', 'לבדוק את',
    'לערוך', 'לצלם', 'להכין', 'לשנות', 'למחוק', 'להזמין']
};

const PAID = ['שילם', 'שילמה', 'העביר', 'העבירה', 'קיבלתי תשלום', 'הכסף נכנס'];
const URGENT = ['דחוף', 'בהול', 'להיום', 'עכשיו', 'מיד'];

// משפטי חדשות: "קלוד התחיל לערוך סרטונים" — לא משימה, אלא משהו לבדוק
const DECLARATIVE = ['התחיל', 'התחילה', 'התחילו', 'יצא ', 'יצאה', 'השיקו', 'שחררו', 'הוסיפו',
  'גיליתי', 'שמעתי', 'ראיתי ש', 'קראתי', 'מסתבר', 'עכשיו אפשר', 'אפשר עכשיו', 'נראה ש',
  'כבר יודע', 'עובד עכשיו', 'תומך ב'];

// משפט שמתחיל בפועל בשם הפועל ("לתקן…", "לשלוח…") הוא כמעט תמיד משימה
const INFINITIVE = /^ל[א-ת]{2,}/;

const has = (t, list) => list.some(k => t.includes(k));

/* ---------- זיהוי לקוח קיים ---------- */
function findClient(text) {
  const clients = S().items.filter(i => i.type === 'client' && !i.archived);
  const t = text.toLowerCase();
  let best = null;
  clients.forEach(c => {
    const names = [c.title, c.business].filter(Boolean);
    names.forEach(n => {
      const nn = String(n).toLowerCase().trim();
      if (nn.length >= 2 && t.includes(nn) && (!best || nn.length > best.len))
        best = { client: c, len: nn.length };
    });
  });
  return best ? best.client : null;
}

/* ---------- זיהוי שלב מוזכר ---------- */
function findStage(text, client) {
  const line = lineOf(client.productLineId);
  const t = text.toLowerCase();
  let hit = null;
  line.stages.forEach(s => {
    if (t.includes(s.name.toLowerCase())) hit = s;
  });
  return hit;
}

/* ============================================================
   הסיווג — מחזיר תיאור פעולה, בלי לבצע
   ============================================================ */
export function classify(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const t = text.toLowerCase();

  const urlMatch = text.match(URL_RE);
  const isPureUrl = urlMatch && text.replace(urlMatch[0], '').trim().length < 12;

  // 1. לינק לבד → פריט ידע
  if (isPureUrl) {
    return {
      type: 'knowledge',
      label: 'נשמר כפריט ידע',
      data: { title: titleFromUrl(urlMatch[0]), url: normalizeUrl(urlMatch[0]), note: '', estMinutes: 15 }
    };
  }

  // 2. עדכון ללקוח קיים
  const client = findClient(text);
  if (client) {
    if (has(t, PAID)) {
      return {
        type: 'client-update', label: `${client.title} סומן כשילם`, clientId: client.id,
        action: 'paid', data: {}
      };
    }
    const stage = findStage(text, client);
    if (stage) {
      return {
        type: 'client-update', label: `${client.title} הועבר ל"${stage.name}"`, clientId: client.id,
        action: 'stage', stageId: stage.id, data: {}
      };
    }
    // אחרת — משימה שמשויכת ללקוח
    return {
      type: 'task', label: `נוצרה משימה ל${client.title}`,
      data: { title: text, clientId: client.id, priority: has(t, URGENT) ? 'high' : 'normal' }
    };
  }

  // 3. שגרה
  if (has(t, KW.routine)) {
    const freq = t.includes('כל יום') || t.includes('כל בוקר') || t.includes('כל ערב') ? 'daily'
      : t.includes('כל חודש') || t.includes('פעם בחודש') ? 'monthly'
      : t.includes('פעמיים בשבוע') ? 'custom' : 'weekly';
    const d = { title: text, freq };
    if (freq === 'custom') d.customDays = 3;
    return { type: 'routine', label: 'נוצרה שגרה', data: d };
  }

  // 4. החלטה — דילמה פתוחה
  const looksLikeQuestion = text.includes('?') || t.startsWith('האם');
  if (has(t, KW.decision) && (looksLikeQuestion || t.includes(' או '))) {
    return { type: 'decision', label: 'נוצרה החלטה פתוחה', data: { title: text, status: 'open' } };
  }

  const startsWithVerb = INFINITIVE.test(text.trim().split(/\s+/)[0] || '');

  // 5. ידע — כולל משפטי חדשות שהם לא הוראת פעולה
  if (has(t, KW.knowledge) || urlMatch || (!startsWithVerb && has(t, DECLARATIVE))) {
    return {
      type: 'knowledge', label: 'נשמר כפריט ידע',
      data: {
        title: urlMatch ? text.replace(urlMatch[0], '').trim() || titleFromUrl(urlMatch[0]) : text,
        url: urlMatch ? normalizeUrl(urlMatch[0]) : '',
        note: has(t, DECLARATIVE) ? 'לבדוק' : '',
        estMinutes: 20, urgent: has(t, URGENT)
      }
    };
  }

  // 6. רעיון
  if (has(t, KW.idea)) return { type: 'idea', label: 'נשמר כרעיון', data: { title: text } };

  // 7. ברירת מחדל — משימה
  return {
    type: 'task', label: 'נוצרה משימה',
    data: {
      title: text,
      priority: has(t, URGENT) ? 'high' : 'normal',
      dueDate: has(t, URGENT) ? Date.now() + DAY : null
    }
  };
}

function normalizeUrl(u) { return /^https?:\/\//i.test(u) ? u : 'https://' + u; }

function titleFromUrl(u) {
  try {
    const h = new URL(normalizeUrl(u));
    const last = h.pathname.split('/').filter(Boolean).pop();
    const nice = last ? decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/\.\w{2,5}$/, '') : '';
    return (nice ? nice + ' — ' : '') + h.hostname.replace(/^www\./, '');
  } catch { return u; }
}

/* ============================================================
   ביצוע הסיווג
   ============================================================ */
export function commit(result) {
  if (!result) return null;

  if (result.type === 'client-update') {
    const c = getItem(result.clientId);
    if (!c) return null;
    if (result.action === 'paid') {
      const line = lineOf(c.productLineId);
      const payStage = line.stages.find(s => s.name.includes('תשלום'));
      patchItem(c.id, { paidAt: Date.now(), amount: c.amount || line.pricing?.unit || 0 });
      if (payStage) moveToStage(c.id, payStage.id);
    } else if (result.action === 'stage') {
      moveToStage(c.id, result.stageId);
      const line = lineOf(c.productLineId);
      const st = line.stages.find(s => s.id === result.stageId);
      if (st && st.name.includes('מסירה')) patchItem(c.id, { deliveredAt: Date.now() });
    }
    return c;
  }

  return addItem(Object.assign({ type: result.type }, result.data));
}

/** שינוי סוג בלחיצה אחת — בלי לפתוח טופס */
export function retype(item, newType) {
  const patch = { type: newType };
  if (newType === 'knowledge') { patch.status = 'new'; patch.lastTouched = Date.now(); patch.estMinutes = item.estMinutes || 20; }
  if (newType === 'decision') patch.status = 'open';
  if (newType === 'routine') { patch.freq = 'weekly'; patch.nextDue = Date.now(); patch.missCount = 0; }
  if (newType === 'task') patch.done = false;
  if (newType === 'client') {
    const line = S().productLines[0];
    patch.productLineId = line.id;
    patch.stageId = line.stages[0].id;
    patch.stageSince = Date.now();
    patch.checklist = line.stages.map(s => ({ id: 'c_' + Math.random().toString(36).slice(2, 7), text: s.name, done: false }));
    patch.manualProgress = 0;
  }
  return patchItem(item.id, patch);
}

/* ============================================================
   דיוק בעזרת העוזר (אופציונלי, ברקע)
   ============================================================ */
let classifyFails = 0;

export async function classifyWithAssistant(text, fallback) {
  if (classifyFails >= 2) return fallback;   // אין פונקציה? מפסיקים לנסות
  try {
    const r = await callAssistant({
      mode: 'classify',
      text,
      types: S().itemTypes.map(t => ({ id: t.id, name: t.name })),
      clients: S().items.filter(i => i.type === 'client' && !i.archived)
        .map(c => ({ id: c.id, name: c.title, business: c.business || '' }))
    });
    if (!r.ok) { classifyFails++; return fallback; }
    classifyFails = 0;
    const j = await r.json();
    if (!j || !j.type) return fallback;
    const known = S().itemTypes.some(t => t.id === j.type);
    if (!known) return fallback;
    return {
      type: j.type,
      label: j.label || fallback.label,
      data: Object.assign({}, fallback.data, { title: j.title || fallback.data?.title })
    };
  } catch { classifyFails++; return fallback; }
}
