/* ============================================================
   search.js — חיפוש חכם על כל המערכת
   לא רק פתקים: לקוחות, משימות, ידע, החלטות, רעיונות, שגרות,
   קישורים, ואפילו שמות של קבצים מצורפים.

   תומך במסננים בתוך שורת החיפוש:
     נושא:שיווק     רק פתקים עם התגית הזאת
     סוג:פתק        רק סוג מסוים
     יש:תמונה       פתקים עם תמונה / קובץ / תזכורת
     נעוץ           רק נעוצים
     יעד:היום       דדליין או תזכורת היום / השבוע
   ============================================================ */

import { S, typeMeta, noteTag, lineOf, stageOf } from './store.js';
import { DAY, startOfDay } from './util.js';

/* ---------- נרמול עברית ---------- */

const NIQQUD = /[֑-ׇ]/g;

export function norm(s) {
  return String(s || '')
    .replace(NIQQUD, '')
    .replace(/["'`׳״]/g, '')
    .toLowerCase()
    .trim();
}

const tokens = s => norm(s).split(/[\s,.\-–—:;/\\()[\]{}!?]+/).filter(Boolean);

/* ---------- מילון המסננים ---------- */

const FILTERS = {
  'נושא': 'tag', 'תגית': 'tag', 'tag': 'tag',
  'סוג': 'type', 'type': 'type',
  'יש': 'has', 'has': 'has',
  'יעד': 'due', 'due': 'due'
};

const HAS = {
  'תמונה': 'image', 'image': 'image',
  'קובץ': 'file', 'file': 'file',
  'תזכורת': 'reminder', 'reminder': 'reminder',
  'לינק': 'url', 'קישור': 'url', 'url': 'url'
};

/** מפרק שאילתה למילים חופשיות + מסננים */
export function parseQuery(raw) {
  const out = { text: [], tag: [], type: [], has: [], due: null, pinned: false, archived: false };
  String(raw || '').split(/\s+/).filter(Boolean).forEach(part => {
    if (/^נעוץ$|^pinned$/i.test(part)) { out.pinned = true; return; }
    if (/^ארכיון$|^archived$/i.test(part)) { out.archived = true; return; }
    const m = part.match(/^([^:]+):(.+)$/);
    if (m && FILTERS[m[1].toLowerCase()]) {
      const key = FILTERS[m[1].toLowerCase()];
      const val = norm(m[2]);
      if (key === 'due') out.due = val;
      else if (key === 'has') out.has.push(HAS[val] || val);
      else out[key].push(val);
      return;
    }
    out.text.push(...tokens(part));
  });
  return out;
}

/* ---------- טקסט לחיפוש מכל פריט ---------- */

function haystack(item) {
  const s = S();
  const bits = [item.title, item.note, item.body, item.business, item.resolution];

  (item.tags || []).forEach(t => bits.push(t));
  (item.noteTags || []).forEach(id => { const t = noteTag(id); if (t) bits.push(t.name); });
  (item.checklist || []).forEach(c => bits.push(c.text));
  (item.attachments || []).forEach(a => bits.push(a.name));
  if (item.url) bits.push(item.url);
  if (item.type === 'client') {
    bits.push(lineOf(item.productLineId)?.name, item.phone, item.business);
  }
  if (item.type === 'production') {
    // הפקה נמצאת גם בחיפוש שם הלקוח — אף אחד לא מחפש "סרטון 2"
    const cl = item.clientId ? S().items.find(x => x.id === item.clientId) : null;
    bits.push(lineOf(item.productLineId)?.name, stageOf(item)?.name);
    if (cl) bits.push(cl.title, cl.business, cl.phone);
  }
  /* הבנק: הפרומפט הוא טקסט לחיפוש כמו כל טקסט אחר — לפעמים
     זוכרים מילה מתוכו ולא את שם הקובץ */
  if (item.type === 'shot') bits.push(item.prompt);
  if (item.type === 'template') bits.push(item.domain, item.angles, item.analogies, item.avoid, item.failed);
  bits.push(typeMeta(item.type).name);
  return norm(bits.filter(Boolean).join(' '));
}

/* ---------- התאמה וניקוד ---------- */

function matchScore(item, q) {
  const title = norm(item.title);
  const hay = haystack(item);

  let score = 0;
  for (const t of q.text) {
    if (!t) continue;
    if (title === t) score += 60;
    else if (title.startsWith(t)) score += 34;
    else if (title.includes(t)) score += 24;
    else if (hay.includes(t)) score += 10;
    else return -1;                      // מילה שלא נמצאה בכלל — הפריט לא מתאים
  }

  // בלי טקסט חופשי, המסננים לבדם מספיקים
  if (!q.text.length) score += 5;

  // טריות: פריט שנגעת בו לאחרונה עולה קצת
  const age = (Date.now() - (item.updatedAt || item.createdAt || 0)) / DAY;
  score += Math.max(0, 8 - age * 0.25);

  if (item.pinned) score += 12;
  if (item.archived) score -= 25;
  return score;
}

function passFilters(item, q) {
  if (q.pinned && !item.pinned) return false;
  if (!q.archived && item.archived && !q.text.length) return false;

  if (q.type.length) {
    const meta = typeMeta(item.type);
    const ok = q.type.some(t => norm(meta.name) === t || norm(meta.id) === t || norm(meta.name).startsWith(t));
    if (!ok) return false;
  }

  if (q.tag.length) {
    const names = (item.noteTags || []).map(id => norm(noteTag(id)?.name || ''));
    const free = (item.tags || []).map(norm);
    const all = names.concat(free);
    if (!q.tag.every(t => all.some(n => n.includes(t)))) return false;
  }

  for (const h of q.has) {
    const att = item.attachments || [];
    if (h === 'image' && !att.some(a => a.kind === 'image')) return false;
    if (h === 'file' && !att.some(a => a.kind !== 'image')) return false;
    if (h === 'reminder' && !item.reminderAt) return false;
    if (h === 'url' && !item.url) return false;
  }

  if (q.due) {
    const when = item.reminderAt || item.dueDate;
    if (!when) return false;
    const today = startOfDay();
    if (/היום|today/.test(q.due) && !(when >= today && when < today + DAY)) return false;
    if (/שבוע|week/.test(q.due) && !(when >= today && when < today + 7 * DAY)) return false;
    if (/עבר|late|overdue/.test(q.due) && when >= Date.now()) return false;
  }

  return true;
}

/* ---------- ה-API ---------- */

/** מחזיר [{item, score}] ממוין, על פני כל סוגי הפריטים */
export function search(raw, { limit = 40, types = null } = {}) {
  const q = parseQuery(raw);
  if (!q.text.length && !q.tag.length && !q.type.length && !q.has.length && !q.due && !q.pinned) return [];

  const out = [];
  S().items.forEach(item => {
    if (types && !types.includes(item.type)) return;
    if (!passFilters(item, q)) return;
    const score = matchScore(item, q);
    if (score < 0) return;
    out.push({ item, score });
  });

  // קישורים מעמוד הכלים — גם הם צריכים להימצא
  if (!q.type.length && !q.tag.length && !q.has.length && q.text.length) {
    S().links.forEach(l => {
      const hay = norm([l.title, l.desc, l.url].join(' '));
      if (q.text.every(t => hay.includes(t)))
        out.push({ item: { id: l.id, type: '__link', title: l.title, note: l.desc, url: l.url }, score: 15 });
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** חיפוש בתוך הפנקס בלבד — משמש את עמוד הפנקס */
export function searchNotes(raw) {
  const q = parseQuery(raw);
  const active = !!(q.text.length || q.tag.length || q.has.length || q.due || q.pinned);
  if (!active) return null;                       // אין חיפוש — מחזירים null, לא רשימה ריקה
  return S().items
    .filter(i => i.type === 'note' && passFilters(i, q))
    .map(i => ({ item: i, score: matchScore(i, q) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

/** הצעות השלמה לשורת החיפוש */
export function suggestions() {
  const s = S();
  const out = [
    { text: 'נעוץ', desc: 'רק פתקים נעוצים' },
    { text: 'יש:תמונה', desc: 'פתקים עם תמונה' },
    { text: 'יש:קובץ', desc: 'פתקים עם מסמך' },
    { text: 'יש:תזכורת', desc: 'כל מה שיש עליו תזכורת' },
    { text: 'יעד:היום', desc: 'תזכורות ודדליינים להיום' },
    { text: 'יעד:עבר', desc: 'מה שכבר עבר' }
  ];
  s.noteTags.slice(0, 6).forEach(t => out.push({ text: 'נושא:' + t.name, desc: 'רק ' + t.name }));
  return out;
}
