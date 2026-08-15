/* ============================================================
   timecheck.js — בדיקת שפיות לרשומות הזמן
   רשומות זמן נשחקות: טיימר שנשאר פתוח בלילה, שתי רשומות שחופפות,
   קטע ארוך בלי פריט. אחרי חודשיים הממוצעים משקרים, והתמחור אחריהם.
   כאן מוצאים את הבעיות ומתקנים בלחיצה — בלי למחוק כלום בלי לשאול.
   ============================================================ */

import { S, update, getItem } from './store.js';
import { MIN, HOUR, DAY, dur, hhmm, dmy, startOfDay } from './util.js';
import { KINDS } from './timer.js';

const now = () => Date.now();
const dayEndTs = ts => {
  const st = S().settings;
  return startOfDay(ts) + ((st.dayStartHour || 9) + (st.workHoursPerDay || 6) + 2) * HOUR;
};

/**
 * מחזיר [{id, kind, level, title, detail, entryIds, apply()}]
 * level: 'bad' — כמעט בוודאות טעות · 'warn' — שווה מבט
 */
export function findIssues({ days = 30 } = {}) {
  const s = S();
  const from = now() - days * DAY;
  const list = s.timeEntries.filter(e => e.end > from).sort((a, b) => a.start - b.start);
  const out = [];
  const seen = new Set();     // רשומה נכנסת לכל היותר לבעיה אחת, שלא נתקן פעמיים

  const push = (o) => {
    if (o.entryIds.some(id => seen.has(id))) return;
    o.entryIds.forEach(id => seen.add(id));
    out.push(o);
  };

  /* 1. רשומה שנגמרת בעתיד */
  list.forEach(e => {
    if (e.end > now() + MIN) push({
      id: 'future_' + e.id, kind: 'future', level: 'bad',
      title: 'רשומה שנגמרת בעתיד',
      detail: `${label(e)} · מסתיימת ב-${hhmm(e.end)}, שזה אחרי עכשיו`,
      entryIds: [e.id],
      fixLabel: 'קצר לעכשיו',
      apply: () => update(st => {
        const x = st.timeEntries.find(y => y.id === e.id);
        if (x) x.end = now();
      }, { label: 'תיקון רשומת זמן' })
    });
  });

  /* 2. קטע זעיר — רעש */
  list.forEach(e => {
    if (e.end - e.start < 30000) push({
      id: 'tiny_' + e.id, kind: 'tiny', level: 'warn',
      title: 'קטע של פחות מחצי דקה',
      detail: `${label(e)} · ${dmy(e.start)} ${hhmm(e.start)}`,
      entryIds: [e.id],
      fixLabel: 'מחק',
      apply: () => update(st => { st.timeEntries = st.timeEntries.filter(y => y.id !== e.id); },
        { label: 'מחיקת רשומת זמן' })
    });
  });

  /* 3. רשומה שרצה כל הלילה */
  list.forEach(e => {
    const len = e.end - e.start;
    const cutoff = dayEndTs(e.start);
    if (len > 8 * HOUR || (e.end > cutoff + HOUR && len > 3 * HOUR)) {
      push({
        id: 'night_' + e.id, kind: 'night', level: 'bad',
        title: 'טיימר שנשאר פתוח',
        detail: `${label(e)} · ${dmy(e.start)} מ-${hhmm(e.start)} עד ${hhmm(e.end)} — ${dur(len)} ברצף`,
        entryIds: [e.id],
        fixLabel: 'קצר לסוף היום',
        apply: () => update(st => {
          const x = st.timeEntries.find(y => y.id === e.id);
          if (x) x.end = Math.max(x.start + 30 * MIN, Math.min(x.end, cutoff));
        }, { label: 'קיצור רשומת זמן' })
      });
    }
  });

  /* 4. חפיפה בין שתי רשומות */
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.start >= a.end) break;
      const ov = Math.min(a.end, b.end) - b.start;
      if (ov > MIN) {
        push({
          id: 'ov_' + a.id + '_' + b.id, kind: 'overlap', level: 'bad',
          title: 'שתי רשומות חופפות',
          detail: `${label(a)} ו-${label(b)} חופפות ב-${dur(ov)} · ${dmy(a.start)}`,
          entryIds: [a.id, b.id],
          fixLabel: 'קצר את הראשונה',
          apply: () => update(st => {
            const x = st.timeEntries.find(y => y.id === a.id);
            if (x) x.end = Math.max(x.start + 60000, b.start);
          }, { label: 'תיקון חפיפה' })
        });
        break;
      }
    }
  }

  /* 5. קטע עבודה ארוך בלי פריט */
  list.forEach(e => {
    if (!e.itemId && KINDS[e.kind]?.focus && e.end - e.start > 25 * MIN) push({
      id: 'noitem_' + e.id, kind: 'noitem', level: 'warn',
      title: 'זמן עבודה בלי פריט',
      detail: `${dur(e.end - e.start)} · ${dmy(e.start)} ${hhmm(e.start)} — לא משויך לאף לקוח או משימה`,
      entryIds: [e.id],
      fixLabel: 'סמן "לא עבדתי"',
      needsChoice: true,
      apply: () => update(st => {
        const x = st.timeEntries.find(y => y.id === e.id);
        if (x) x.kind = 'off';
      }, { label: 'סיווג זמן' })
    });
  });

  /* 6. רשומה שמצביעה על פריט שנמחק */
  list.forEach(e => {
    if (e.itemId && !getItem(e.itemId)) push({
      id: 'orphan_' + e.id, kind: 'orphan', level: 'warn',
      title: 'רשומה של פריט שכבר לא קיים',
      detail: `${dur(e.end - e.start)} · ${dmy(e.start)} ${hhmm(e.start)}`,
      entryIds: [e.id],
      fixLabel: 'מחק',
      apply: () => update(st => { st.timeEntries = st.timeEntries.filter(y => y.id !== e.id); },
        { label: 'מחיקת רשומה יתומה' })
    });
  });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}

function label(e) {
  const it = e.itemId ? getItem(e.itemId) : null;
  const kind = KINDS[e.kind]?.name || e.kind;
  return it ? `${it.title} (${kind})` : kind;
}

/** מחיל את כל התיקונים הבטוחים בבת אחת. מחזיר כמה תוקנו. */
export function fixAll(issues) {
  const safe = issues.filter(i => !i.needsChoice);
  safe.forEach(i => { try { i.apply(); } catch (e) { console.error(e); } });
  return safe.length;
}

/** כמה זמן קשב מזויף יש כאן — כדי להגיד לו למה זה משנה */
export function inflatedMs(issues) {
  const s = S();
  let ms = 0;
  issues.forEach(i => {
    if (i.kind === 'night') {
      const e = s.timeEntries.find(x => x.id === i.entryIds[0]);
      if (e && KINDS[e.kind]?.focus) ms += Math.max(0, e.end - dayEndTs(e.start));
    }
    if (i.kind === 'overlap') {
      const [a, b] = i.entryIds.map(id => s.timeEntries.find(x => x.id === id));
      if (a && b) ms += Math.max(0, Math.min(a.end, b.end) - b.start);
    }
    if (i.kind === 'noitem' || i.kind === 'orphan') {
      const e = s.timeEntries.find(x => x.id === i.entryIds[0]);
      if (e && KINDS[e.kind]?.focus) ms += e.end - e.start;
    }
  });
  return ms;
}
