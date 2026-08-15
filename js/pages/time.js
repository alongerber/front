/* ============================================================
   time.js — החלק הכי חשוב
   שלושה מספרים נפרדים · ציר יום עם גרירת קצוות · דוחות
   ============================================================ */

import { S, update, getItem, monthMoney, lineOf } from '../store.js';
import { el, dur, hms, hhmm, nis, num, dmy, dayName, toast, modal, closeModal, input, select, field, clamp, drag, startOfDay, endOfDay, MIN, HOUR, DAY } from '../util.js';
import * as T from '../timer.js';
import { refresh, openItem, openSwitcher } from '../app.js';
import { hintBadge } from '../help.js';
import { findIssues, fixAll, inflatedMs } from '../timecheck.js';
import * as SM from '../sampling.js';
import { picker as samplePicker } from '../sampleui.js';

export default { render, tick };

let viewDay = startOfDay();

function tick() {
  const n = document.getElementById('time-live');
  if (n) { const t = T.activeTimer(); n.textContent = t ? hms(T.elapsed()) : '—'; }
}

function render(root) {
  const s = S();
  if (viewDay > startOfDay()) viewDay = startOfDay();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'זמן'),
    el('div', { class: 'desc' }, 'התמחור מתבסס על זמן קשב — לא על זמן קיר'),
    el('div', { class: 'right' },
      cleanupButton(),
      el('button', { class: 'btn btn-sm', onclick: () => addEntryModal() }, '+ רשומה ידנית'),
      el('button', { class: 'btn btn-sm btn-y', 'data-tip': 'time.switch', onclick: openSwitcher }, 'החלף טיימר')
    )
  ));

  root.append(threeNumbers());
  root.append(samplingCard());
  root.append(timelineCard());
  root.append(el('div', { class: 'grid g2', style: { marginTop: '14px' } }, weekCard(), avgCard()));
  root.append(perItemCard());
}

/* ================= ניקוי רשומות ================= */

function cleanupButton() {
  const issues = findIssues();
  const bad = issues.filter(i => i.level === 'bad').length;
  return el('button', {
    class: 'btn btn-sm ' + (bad ? 'btn-danger' : ''),
    'data-tip': 'time.cleanup',
    onclick: cleanupModal
  }, issues.length ? `🧹 ${issues.length} לתיקון` : '🧹 בדוק רשומות');
}

function cleanupModal() {
  const box = el('div', {});

  const draw = () => {
    box.innerHTML = '';
    const issues = findIssues();

    if (!issues.length) {
      box.append(el('div', { class: 'alert good' }, 'הכל נראה תקין. אין רשומות חשודות ב-30 הימים האחרונים.'));
      return;
    }

    const inflated = inflatedMs(issues);
    box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '12px' } },
      'רשומות זמן נשחקות, והתמחור שלך נשען עליהן. ' +
      (inflated > 5 * MIN
        ? `כרגע נראה שיש כאן עד ${dur(inflated)} של זמן קשב שלא באמת עבדת. `
        : '') +
      'עברתי על 30 הימים האחרונים ומצאתי את אלה:'));

    issues.forEach(i => {
      box.append(el('div', { class: 'alert ' + (i.level === 'bad' ? 'bad' : 'warn'), style: { marginBottom: '7px' } },
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: '600' } }, i.title),
          el('div', { class: 'small muted' }, i.detail)),
        el('button', {
          class: 'btn btn-xs',
          onclick: () => { i.apply(); toast('תוקן', 'ok'); draw(); refresh(); }
        }, i.fixLabel),
        i.kind === 'noitem' ? el('button', {
          class: 'btn btn-xs',
          onclick: () => { closeModal(); assignEntry(i.entryIds[0]); }
        }, 'שייך לפריט') : null
      ));
    });

    const safe = issues.filter(x => !x.needsChoice).length;
    box.append(el('div', { class: 'hr' }));
    box.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' } },
      safe ? el('button', {
        class: 'btn btn-y',
        onclick: () => {
          const n = fixAll(findIssues());
          toast(`תוקנו ${n} רשומות`, 'ok');
          draw(); refresh();
        }
      }, `תקן הכל (${safe})`) : null,
      el('span', { class: 'small muted' },
        'כל תיקון ניתן לביטול ב-Ctrl+Z. מה שדורש החלטה שלך לא ייגע.')
    ));
  };

  draw();
  modal({ title: 'בדיקת רשומות זמן', body: box, wide: true, actions: [{ label: 'סגור', cls: 'btn-y' }] });
}

/** שיוך רשומה יתומה לפריט */
function assignEntry(entryId) {
  const e = S().timeEntries.find(x => x.id === entryId);
  if (!e) return;
  const cands = S().items.filter(i => !i.archived && (i.type === 'client' || i.type === 'task' || i.type === 'knowledge'));
  const sel = select(
    [{ value: '', label: '— בחר —' }, ...cands.map(c => ({ value: c.id, label: c.title }))],
    '', {});
  modal({
    title: 'למי לשייך את הזמן?',
    body: el('div', {},
      el('div', { class: 'muted small', style: { marginBottom: '11px' } },
        `${dur(e.end - e.start)} · ${dmy(e.start)} ${hhmm(e.start)}–${hhmm(e.end)}`),
      field('פריט', sel)),
    actions: [{ label: 'ביטול' }, {
      label: 'שייך', cls: 'btn-y', onClick: () => {
        if (!sel.value) { toast('בחר פריט', 'err'); return; }
        update(st => {
          const x = st.timeEntries.find(y => y.id === entryId);
          if (x) x.itemId = sel.value;
        }, { label: 'שיוך רשומת זמן' });
        toast('שויך', 'ok'); refresh();
      }
    }]
  });
}

/* ================= שלושת המספרים ================= */

function threeNumbers() {
  const av = T.availableToday();
  const from = startOfDay(viewDay), to = endOfDay(viewDay);
  const focus = T.focusMs(null, from, to);
  const wait = T.waitMs(null, from, to);
  const t = T.activeTimer();

  const box = el('div', { class: 'grid g4' });

  const lbl = (text, tip) => el('div', { class: 'lbl', style: { display: 'flex', alignItems: 'center' } },
    text, hintBadge(tip));

  box.append(el('div', { class: 'stat y' },
    lbl('זמן קשב היום', 'time.focus'),
    el('div', { class: 'val' }, focus ? dur(focus, true) : '0 שע\''),
    el('div', { class: 'sub' }, 'כמה באמת ישבת על זה — רק זה נחשב לתמחור')
  ));
  box.append(el('div', { class: 'stat' },
    lbl('המתנה', 'time.wait'),
    el('div', { class: 'val', style: { color: '#5aa9ff' } }, wait ? dur(wait, true) : '0 שע\''),
    el('div', { class: 'sub' }, 'קלוד רץ ואתה בטאב אחר — לא נחשב כעבודה')
  ));
  box.append(el('div', { class: 'stat' },
    lbl('נשאר לך היום', 'time.available'),
    el('div', { class: 'val' }, dur(av.left, true)),
    el('div', { class: 'sub' }, `מתוך ${dur(av.total, true)} שקבעת בהגדרות`)
  ));
  box.append(el('div', { class: 'stat' },
    el('div', { class: 'lbl' }, t ? 'רץ עכשיו' : 'שום דבר לא רץ'),
    el('div', { class: 'val', id: 'time-live' }, t ? hms(T.elapsed()) : '—'),
    el('div', { class: 'sub' }, t ? (t.itemId ? (getItem(t.itemId)?.title || '') : T.KINDS[t.kind].name) : 'לחץ "החלף טיימר"')
  ));
  return box;
}

/* ================= דגימות ================= */

function samplingCard() {
  const c = SM.cfg();
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  const conf = SM.confidence();

  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'מדידה בדגימות', hintBadge('time.samples')),
    el('span', { class: 'sub' }, 'המערכת שואלת, אתה לוחץ כפתור. זה המספר שהתמחור נשען עליו.'),
    el('div', { class: 'right' },
      SM.openSample()
        ? el('button', { class: 'btn btn-sm btn-y', onclick: () => samplePicker() }, 'יש שאלה פתוחה — ענה')
        : null,
      el('button', {
        class: 'btn btn-sm', onclick: () => { location.hash = '#/settings'; }
      }, '⚙ תדירות')
    )
  ));

  if (!c.enabled) {
    card.append(el('div', { class: 'alert warn' },
      'הדגימות כבויות. בלעדיהן המדידה מסתמכת רק על הטיימר, שצריך לזכור להחליף.'));
    return card;
  }

  const w = Math.round(SM.sampleWeightMs() / MIN);
  const today = SM.stats({ from: startOfDay(viewDay), to: endOfDay(viewDay) });
  const week = SM.stats({ from: startOfDay() - 7 * DAY });

  card.append(el('div', { class: 'grid g3', style: { marginBottom: '13px' } },
    el('div', { class: 'stat' },
      el('div', { class: 'lbl' }, 'כל דגימה שווה'),
      el('div', { class: 'val' }, w + ' דק\''),
      el('div', { class: 'sub' }, `${c.perDay} ביום · ${c.fromHour}:00–${c.toHour}:00`)),
    el('div', { class: 'stat' },
      el('div', { class: 'lbl' }, 'נענו היום'),
      el('div', { class: 'val' }, String(today.counted)),
      el('div', { class: 'sub' }, today.offCount ? `${today.offCount} מהן "לא עבודה"` : 'הכל עבודה')),
    el('div', { class: 'stat ' + (conf.level === 'high' ? 'g' : conf.level === 'low' ? '' : 'y') },
      el('div', { class: 'lbl' }, 'אמינות'),
      el('div', { class: 'val' }, conf.n),
      el('div', { class: 'sub' }, conf.text))
  ));

  if (!week.byItem.length) {
    card.append(el('div', { class: 'empty' },
      'עוד לא נאספו דגימות. השאלה הראשונה תקפוץ בשעות שהגדרת — גם מעל תוכנות אחרות, ' +
      'אם אישרת התראות.'));
    return card;
  }

  card.append(el('div', { class: 'section', style: { marginTop: '0' } },
    el('span', { class: 'bar' }), el('h2', {}, 'שבוע אחרון, לפי דגימות'), el('span', { class: 'line' })));

  const total = week.byItem.reduce((a, x) => a + x.count, 0) + week.offCount;
  const rowFor = (label, count, ms, color) => {
    const share = total ? count / total : 0;
    return el('div', { style: { marginBottom: '9px' } },
      el('div', { style: { display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '3px' } },
        el('span', { style: { fontWeight: '600' } }, label),
        el('span', { class: 'muted small', style: { marginInlineStart: 'auto' } },
          `${dur(ms, true)} · ${count} דגימות · ${Math.round(share * 100)}%`)),
      el('div', { class: 'bar' }, el('i', { style: { width: (share * 100) + '%', background: color } })));
  };

  week.byItem.slice(0, 8).forEach(x => {
    const it = x.itemId ? getItem(x.itemId) : null;
    card.append(rowFor(it ? it.title : (x.kind === 'learn' ? 'למידה' : 'עבודה על העסק'),
      x.count, x.ms, it ? '#a3e635' : '#b98cff'));
  });
  if (week.offCount) card.append(rowFor('לא עבודה', week.offCount, week.offMs, 'rgba(255,255,255,.22)'));

  if (week.guessRate > 0.25) card.append(el('div', { class: 'alert warn', style: { marginTop: '11px' } },
    `${Math.round(week.guessRate * 100)}% מהדגימות לא נענו והמערכת ניחשה לפי הקודמת. ` +
    'המספרים עדיין שמישים, אבל פחות מדויקים.'));

  return card;
}

/* ================= ציר היום ================= */

function timelineCard() {
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  const isToday = viewDay === startOfDay();

  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'ציר היום', hintBadge('time.timeline')),
    el('span', { class: 'sub' }, 'גרור את הקצוות לתקן. כאן נסגרים הפערים.'),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-xs', onclick: () => { viewDay -= DAY; refresh(); } }, '→ אתמול'),
      el('span', { class: 'small', style: { padding: '0 6px' } }, isToday ? 'היום' : `${dayName(viewDay)} ${dmy(viewDay)}`),
      el('button', { class: 'btn btn-xs', disabled: isToday, onclick: () => { viewDay = Math.min(startOfDay(), viewDay + DAY); refresh(); } }, 'מחר ←')
    )
  ));

  const segs = T.daySegments(viewDay);
  if (!segs.length) {
    card.append(el('div', { class: 'empty' }, 'לא נרשם כלום ביום הזה. אפשר להוסיף רשומה ידנית.'));
    return card;
  }

  const s = S().settings;
  let minH = Math.min(s.dayStartHour || 9, ...segs.map(x => new Date(Math.max(x.start, startOfDay(viewDay))).getHours()));
  let maxH = Math.max((s.dayStartHour || 9) + (s.workHoursPerDay || 6),
    ...segs.map(x => new Date(Math.min(x.end, endOfDay(viewDay))).getHours() + 1));
  minH = clamp(Math.floor(minH), 0, 23); maxH = clamp(Math.ceil(maxH), minH + 2, 24);
  const span = (maxH - minH) * HOUR;
  const dayFrom = startOfDay(viewDay) + minH * HOUR;

  // הכל — שעות, קווי רשת וקטעים — יושב באותו .tl-inner כדי שהאחוזים יתלכדו
  const wrap = el('div', { class: 'timeline' });
  const inner = el('div', { class: 'tl-inner' });
  const hours = el('div', { class: 'tl-hours' });
  for (let h = minH; h <= maxH; h++) {
    const p = (h - minH) / (maxH - minH) * 100;
    hours.append(el('div', { class: 'tl-hour', style: { right: p + '%' } }, String(h).padStart(2, '0')));
    inner.append(el('div', { class: 'tl-grid', style: { right: p + '%' } }));
  }
  inner.append(hours);

  const focusSegs = segs.filter(x => x.kind !== 'wait');
  const waitSegs = segs.filter(x => x.kind === 'wait');

  inner.append(track(focusSegs, dayFrom, span));
  if (waitSegs.length) {
    inner.append(el('div', { class: 'tl-label' }, 'המתנה — זמן קיר, לא זמן קשב'));
    inner.append(track(waitSegs, dayFrom, span));
  }

  if (viewDay === startOfDay()) {
    const p = clamp((Date.now() - dayFrom) / span, 0, 1) * 100;
    inner.append(el('div', { class: 'tl-now', style: { right: p + '%' } }));
  }

  wrap.append(inner);
  card.append(wrap);
  card.append(el('div', { style: { display: 'flex', gap: '13px', marginTop: '10px', flexWrap: 'wrap' } },
    ...Object.entries(T.KINDS).map(([k, v]) => el('span', { class: 'small muted', style: { display: 'flex', gap: '5px', alignItems: 'center' } },
      el('span', { class: 'dot', style: { background: v.color } }), v.name))
  ));

  // פערים לא מסווגים
  const gaps = findGaps(focusSegs, dayFrom, span);
  if (gaps.length) {
    const g = el('div', { style: { marginTop: '12px' } });
    g.append(el('div', { class: 'small muted', style: { marginBottom: '6px', display: 'flex', alignItems: 'center' } },
      'פערים שלא סווגו — לחיצה אחת סוגרת אותם:', hintBadge('time.gap')));
    const row = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    gaps.slice(0, 6).forEach(gp => row.append(el('button', {
      class: 'btn btn-xs',
      onclick: () => addEntryModal({ start: gp.start, end: gp.end })
    }, `${hhmm(gp.start)}–${hhmm(gp.end)} · ${dur(gp.end - gp.start)}`)));
    g.append(row);
    card.append(g);
  }
  return card;
}

function track(segs, dayFrom, span) {
  const tr = el('div', { class: 'tl-track' });
  segs.forEach(seg => {
    const left = clamp((seg.start - dayFrom) / span, 0, 1);
    const right = clamp((seg.end - dayFrom) / span, 0, 1);
    const w = Math.max(right - left, 0.004);
    const it = seg.itemId ? getItem(seg.itemId) : null;
    const node = el('div', {
      class: 'tl-seg ' + seg.kind,
      style: { right: (left * 100) + '%', width: (w * 100) + '%', opacity: seg.live ? '.85' : '1' },
      title: `${it ? it.title : T.KINDS[seg.kind].name} · ${hhmm(seg.start)}–${hhmm(seg.end)} · ${dur(seg.end - seg.start)}`,
      onclick: () => { if (!seg.live) editEntryModal(seg); }
    },
      el('div', { class: 's1' }, it ? it.title : T.KINDS[seg.kind].name),
      el('div', { class: 's2' }, dur(seg.end - seg.start))
    );

    if (!seg.live) {
      const pxPerMs = () => (tr.getBoundingClientRect().width || 800) / span;
      const mk = side => {
        const h = el('div', { class: 'tl-handle ' + side });
        let orig = null;
        drag(h, {
          onMove: dx => {
            if (!orig) orig = { start: seg.start, end: seg.end };
            const dms = -dx / pxPerMs();           // RTL: שמאלה = קדימה בזמן
            if (side === 'l') {
              const ns = clamp(orig.start + dms, dayFrom, seg.end - 60000);
              node.style.right = ((ns - dayFrom) / span * 100) + '%';
              node.style.width = ((seg.end - ns) / span * 100) + '%';
              node._new = { start: Math.round(ns) };
            } else {
              const ne = clamp(orig.end + dms, seg.start + 60000, dayFrom + span);
              node.style.width = ((ne - seg.start) / span * 100) + '%';
              node._new = { end: Math.round(ne) };
            }
          },
          onEnd: () => {
            if (node._new) { T.patchEntry(seg.id, node._new); toast('הרשומה תוקנה', 'ok'); refresh(); }
          }
        });
        return h;
      };
      node.append(mk('l'), mk('r'));
    }
    tr.append(node);
  });
  return tr;
}

function findGaps(segs, dayFrom, span) {
  const s = S().settings;
  const start = Math.max(dayFrom, startOfDay(viewDay) + (s.dayStartHour || 9) * HOUR);
  const end = Math.min(dayFrom + span, viewDay === startOfDay() ? Date.now() : endOfDay(viewDay));
  const sorted = segs.slice().sort((a, b) => a.start - b.start);
  const gaps = [];
  let cur = start;
  sorted.forEach(x => {
    if (x.start - cur > 12 * MIN) gaps.push({ start: cur, end: x.start });
    cur = Math.max(cur, x.end);
  });
  if (end - cur > 12 * MIN) gaps.push({ start: cur, end });
  return gaps;
}

/* ================= דוחות ================= */

function weekCard() {
  const from = startOfDay() - 6 * DAY, to = Date.now();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' }, el('h3', {}, 'לאן הלכו השעות השבוע')));

  const map = new Map();
  S().timeEntries.forEach(e => {
    if (e.end <= from || !T.KINDS[e.kind]?.focus) return;
    const ms = Math.min(e.end, to) - Math.max(e.start, from);
    if (ms <= 0) return;
    const it = e.itemId ? getItem(e.itemId) : null;
    const key = it ? it.id : '__' + e.kind;
    const cur = map.get(key) || { name: it ? it.title : T.KINDS[e.kind].name, ms: 0, kind: e.kind, id: it?.id };
    cur.ms += ms; map.set(key, cur);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.ms - a.ms);
  const total = rows.reduce((a, r) => a + r.ms, 0);

  if (!total) { card.append(el('div', { class: 'empty' }, 'עוד לא נרשמו שעות השבוע')); return card; }

  card.append(el('div', { class: 'tabular', style: { fontSize: '22px', fontWeight: '900', marginBottom: '10px' } },
    dur(total, true), el('span', { class: 'small muted', style: { fontWeight: '400', marginInlineStart: '7px' } }, 'זמן קשב ב-7 ימים')));

  rows.slice(0, 8).forEach(r => {
    card.append(el('div', { style: { marginBottom: '8px', cursor: r.id ? 'pointer' : 'default' }, onclick: () => r.id && openItem(r.id) },
      el('div', { style: { display: 'flex', gap: '8px', fontSize: '13px' } },
        el('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
        el('span', { class: 'tabular muted' }, dur(r.ms, true))
      ),
      el('div', { class: 'bar', style: { marginTop: '3px' } },
        el('i', { style: { width: (r.ms / total * 100) + '%', background: T.KINDS[r.kind]?.color || '#ffd400' } }))
    ));
  });

  const wait = T.waitMs(null, from, to);
  card.append(el('div', { class: 'small muted', style: { marginTop: '10px' } },
    `בנוסף: ${dur(wait)} המתנה. אם זה גדול — כדאי לתכנן מה עושים בזמן שקלוד רץ.`));
  return card;
}

function avgCard() {
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' }, el('h3', {}, 'כמה לוקח סרטון, וכמה זה שווה')));

  const s = S();
  // רק קווים שבאמת נמדד עליהם זמן — אחרת נציג "₪0 לשעה" שנראה כמו כישלון
  const lines = s.productLines.map(l => ({ line: l, avg: T.avgFocusPerDelivery(l.id) }))
    .filter(x => x.avg && x.avg.avgMs > 0);

  if (!lines.length) {
    card.append(el('div', { class: 'empty' }, 'עוד לא נמסר כלום. אחרי הסרטון הראשון שתמסור — כאן יופיע הממוצע האמיתי.'));
    return card;
  }

  lines.forEach(({ line, avg }) => {
    const price = line.pricing?.unit || 0;
    const perHour = avg.avgMs ? price / (avg.avgMs / HOUR) : 0;
    card.append(el('div', { style: { marginBottom: '13px' } },
      el('div', { style: { fontWeight: '700' } }, line.name),
      el('div', { class: 'grid g3', style: { marginTop: '7px' } },
        mini('ממוצע זמן קשב', dur(avg.avgMs, true)),
        mini('לפי ' + avg.count + ' מסירות', ''),
        mini('₪ לשעת עבודה', nis(perHour), perHour >= (s.settings.hourlyTarget || 250) ? '#3ddc84' : '#ff5a4d')
      )
    ));
  });

  // רווח לשעה בפועל החודש
  const m = monthMoney();
  const focusMonth = T.focusMs(null, new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), Date.now());
  const real = focusMonth ? m.profit / (focusMonth / HOUR) : 0;
  card.append(el('div', { class: 'hr' }));
  card.append(el('div', {},
    el('div', { class: 'small muted' }, 'רווח לשעת עבודה בפועל החודש'),
    el('div', { class: 'tabular', style: { fontSize: '24px', fontWeight: '900', color: real >= (s.settings.hourlyTarget || 250) ? '#3ddc84' : '#ffd400' } },
      focusMonth ? nis(real) : '—'),
    el('div', { class: 'small muted' },
      focusMonth ? `נטו ${nis(m.profit)} חלקי ${dur(focusMonth, true)} שנרשמו` : 'צריך שעות רשומות והכנסה כדי לחשב')
  ));
  return card;
}

function mini(lbl, val, color) {
  return el('div', {},
    el('div', { class: 'small muted' }, lbl),
    val ? el('div', { class: 'tabular', style: { fontSize: '17px', fontWeight: '800', color: color || '' } }, val) : null
  );
}

/* ================= פירוט לפי פריט ================= */

function perItemCard() {
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'שלושת המספרים לכל לקוח')));

  const clients = S().items.filter(i => i.type === 'client' && !i.archived)
    .map(c => ({ c, focus: T.focusMs(c.id), wall: T.wallMs(c.id), wait: T.waitMs(c.id), sm: SM.itemMs(c.id) }))
    .filter(x => x.focus > 0 || x.wait > 0 || x.sm > 0)
    .sort((a, b) => (b.sm || b.focus) - (a.sm || a.focus));

  if (!clients.length) { card.append(el('div', { class: 'empty' }, 'עוד לא נרשם זמן על לקוחות')); return card; }

  const rate = S().settings.hourlyTarget || 250;
  const th = (t, tip) => el('th', {}, el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, t, hintBadge(tip)));
  const tb = el('table', { class: 'tb' },
    el('tr', {}, el('th', {}, 'לקוח'),
      th('לפי דגימות', 'time.samples'), th('לפי הטיימר', 'time.focus'),
      th('זמן קיר', 'time.wall'), th('המתנה', 'time.wait'),
      el('th', {}, 'סכום'), th('₪/שעה', 'money.realHourly'), el('th', {}))
  );
  clients.forEach(({ c, focus, wall, wait }) => {
    const smMs = SM.itemMs(c.id), smN = SM.itemCount(c.id);
    const best = smN >= 3 ? smMs : focus;         // דגימות מנצחות כשיש מספיק מהן
    const perHour = best ? (c.amount || 0) / (best / HOUR) : 0;
    tb.append(el('tr', {},
      el('td', { style: { fontWeight: '600', cursor: 'pointer' }, onclick: () => openItem(c.id) }, c.title),
      el('td', {
        class: 'num', style: { color: smN ? '#a3e635' : '' },
        'data-tip': smN ? `${smN} דגימות × ${Math.round(SM.sampleWeightMs() / MIN)} דקות` : 'עוד אין דגימות על הלקוח הזה'
      }, smN ? dur(smMs, true) : '—'),
      el('td', { class: 'num', style: { color: '#ffd400' } }, dur(focus, true)),
      el('td', { class: 'num muted' }, dur(wall, true)),
      el('td', { class: 'num', style: { color: '#5aa9ff' } }, wait ? dur(wait, true) : '—'),
      el('td', { class: 'num' }, c.amount ? nis(c.amount) : '—'),
      el('td', { class: 'num', style: { color: perHour ? (perHour >= rate ? '#3ddc84' : '#ff5a4d') : '' } }, perHour ? nis(perHour) : '—'),
      el('td', {}, el('button', { class: 'btn btn-xs', onclick: () => { T.startTimer(c.id); refresh(); } }, '▶'))
    ));
  });
  card.append(tb);
  return card;
}

/* ================= רשומות ידניות ================= */

export function addEntryModal(pre = {}) {
  const s = S();
  const items = [
    { value: '', label: '— בלי פריט —' },
    ...s.items.filter(i => !i.archived && ['client', 'task', 'knowledge'].includes(i.type))
      .map(i => ({ value: i.id, label: (i.type === 'client' ? '👤 ' : i.type === 'knowledge' ? '📚 ' : '✓ ') + i.title }))
  ];
  const start = pre.start || (Date.now() - HOUR);
  const end = pre.end || Date.now();

  const fItem = select(items, pre.itemId || '');
  const fKind = select(Object.entries(T.KINDS).map(([k, v]) => ({ value: k, label: v.name })), pre.kind || 'work');
  const fFrom = input({ type: 'time', value: tv(start) });
  const fTo = input({ type: 'time', value: tv(end) });
  const fDate = input({ type: 'date', value: new Date(viewDay).toISOString().slice(0, 10) });

  modal({
    title: 'רשומת זמן',
    body: el('div', {},
      field('פריט', fItem),
      el('div', { class: 'row' }, field('סוג', fKind), field('תאריך', fDate)),
      el('div', { class: 'row' }, field('משעה', fFrom), field('עד שעה', fTo))
    ),
    actions: [{ label: 'ביטול' }, {
      label: 'שמור', cls: 'btn-y', onClick: () => {
        const base = new Date(fDate.value + 'T00:00:00').getTime();
        const st = base + tm(fFrom.value), en = base + tm(fTo.value);
        if (en <= st) { toast('שעת הסיום חייבת להיות אחרי ההתחלה', 'err'); return; }
        T.addEntry(fItem.value || null, st, en, fKind.value, 'ידני');
        toast('נרשם', 'ok'); refresh();
      }
    }]
  });
}

function editEntryModal(seg) {
  const s = S();
  const items = [
    { value: '', label: '— בלי פריט —' },
    ...s.items.filter(i => !i.archived).map(i => ({ value: i.id, label: i.title }))
  ];
  const fItem = select(items, seg.itemId || '');
  const fKind = select(Object.entries(T.KINDS).map(([k, v]) => ({ value: k, label: v.name })), seg.kind);
  const fFrom = input({ type: 'time', value: tv(seg.start) });
  const fTo = input({ type: 'time', value: tv(seg.end) });

  modal({
    title: 'עריכת רשומה',
    body: el('div', {},
      el('div', { class: 'small muted', style: { marginBottom: '10px' } },
        `${hhmm(seg.start)}–${hhmm(seg.end)} · ${dur(seg.end - seg.start)}`),
      field('פריט', fItem),
      el('div', { class: 'row' }, field('סוג', fKind), el('div')),
      el('div', { class: 'row' }, field('משעה', fFrom), field('עד שעה', fTo))
    ),
    actions: [
      { label: 'מחק', cls: 'btn-danger', onClick: () => { T.removeEntry(seg.id); toast('נמחק'); refresh(); } },
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const base = startOfDay(seg.start);
          const st = base + tm(fFrom.value), en = base + tm(fTo.value);
          if (en <= st) { toast('סיום חייב להיות אחרי התחלה', 'err'); return; }
          T.patchEntry(seg.id, { itemId: fItem.value || null, kind: fKind.value, start: st, end: en });
          toast('עודכן', 'ok'); refresh();
        }
      }
    ]
  });
}

const tv = ts => new Date(ts).toTimeString().slice(0, 5);
const tm = v => { const [h, m] = String(v || '0:00').split(':').map(Number); return (h * 60 + m) * MIN; };
