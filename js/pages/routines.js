/* ============================================================
   routines.js — משימות חוזרות
   משימה שפוספסה פעמיים לא צועקת יותר, ולא נערמת אינסוף
   ============================================================ */

import { S, addItem, patchItem, removeItem } from '../store.js';
import { el, ago, dmy, toast, modal, input, select, textarea, field, confirmBox, DAY } from '../util.js';
import { FREQ, freqLabel, routineDue, completeRoutine, freqDays } from '../brain.js';
import { refresh } from '../app.js';
import { hintBadge } from '../help.js';

export default { render };

function render(root) {
  const s = S();
  const list = s.items.filter(i => i.type === 'routine' && !i.archived)
    .map(r => Object.assign({}, r, routineDue(r)))
    .sort((a, b) => a.due - b.due);

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'שגרה'),
    el('div', { class: 'desc' }, 'מה שחוזר, כדי שלא תצטרך לזכור'),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-sm btn-y', onclick: () => form() }, '+ שגרה'))
  ));

  const due = list.filter(r => r.overdue >= 0 && r.missCount < 2);
  const quiet = list.filter(r => r.overdue >= 0 && r.missCount >= 2);
  const later = list.filter(r => r.overdue < 0);

  root.append(section('להיום', due, 'אין מה לעשות עכשיו — הכל בזמן'));
  if (quiet.length) root.append(section('פוספסו יותר מפעם — בלי לחץ', quiet, '', true, 'routine.miss'));
  root.append(section('בהמשך', later, 'אין שגרות עתידיות'));

  const arch = s.items.filter(i => i.type === 'routine' && i.archived);
  if (arch.length) {
    const c = el('div', { class: 'card', style: { marginTop: '14px' } });
    c.append(el('div', { class: 'card-h' }, el('h3', {}, 'ארכיון'), el('span', { class: 'sub' }, arch.length + ' שגרות')));
    arch.forEach(r => c.append(el('div', { style: { display: 'flex', gap: '8px', padding: '5px 0', alignItems: 'center' } },
      el('span', { class: 'muted', style: { flex: 1 } }, r.title),
      el('button', { class: 'btn btn-xs', onclick: () => { patchItem(r.id, { archived: false, nextDue: Date.now() }); refresh(); } }, 'החזר')
    )));
    root.append(c);
  }
}

function section(title, rows, emptyText, quiet, tip) {
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, title, tip ? hintBadge(tip) : null),
    el('span', { class: 'sub' }, rows.length + '')));
  if (!rows.length) { card.append(el('div', { class: 'empty' }, emptyText)); return card; }

  rows.forEach(r => {
    const late = r.overdueDays;
    const row = el('div', {
      style: {
        display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 0',
        borderBottom: '1px solid rgba(255,255,255,.05)', opacity: quiet ? '.55' : '1'
      }
    });
    row.append(el('button', {
      class: 'btn btn-xs ' + (quiet ? '' : 'btn-y'),
      onclick: () => { completeRoutine(r.id); toast('בוצע', 'ok'); refresh(); }
    }, '✓'));
    row.append(el('div', { style: { flex: 1, minWidth: 0, cursor: 'pointer' }, onclick: () => form(r) },
      el('div', { style: { fontWeight: '600' } }, r.title),
      el('div', { class: 'small muted' },
        freqLabel(r) + (r.lastDone ? ` · בוצע לפני ${ago(r.lastDone)}` : ' · עוד לא בוצע') +
        (r.note ? ' · ' + r.note : ''))
    ));
    if (r.overdue >= 0)
      row.append(el('span', { class: 'pill ' + (quiet ? '' : late >= 1 ? 'pill-r' : 'pill-y') },
        late >= 1 ? `באיחור ${late} י'` : 'להיום'));
    else
      row.append(el('span', { class: 'pill' }, dmy(r.due)));

    if (r.missCount >= 2) row.append(el('span', { class: 'pill' }, `פוספסה ${r.missCount}×`));

    row.append(el('button', {
      class: 'btn btn-xs', title: 'דחה ביום',
      onclick: () => { patchItem(r.id, { nextDue: Date.now() + DAY }); refresh(); }
    }, 'מחר'));
    row.append(el('button', {
      class: 'btn btn-xs', title: 'לארכיון',
      onclick: () => { patchItem(r.id, { archived: true }); toast('לארכיון'); refresh(); }
    }, '🗄'));
    card.append(row);
  });
  return card;
}

export function form(existing) {
  const r = existing || {};
  const fT = input({ value: r.title || '', placeholder: 'למשל: בדיקת קמפיין' });
  const fN = textarea({ placeholder: 'מה בדיוק עושים' });
  fN.value = r.note || '';
  const fF = select(Object.entries(FREQ).map(([k, v]) => ({ value: k, label: v.label })), r.freq || 'weekly');
  const fC = input({ type: 'number', value: r.customDays || 3, min: 1 });
  const customWrap = field('כל כמה ימים', fC);
  customWrap.style.display = (r.freq === 'custom') ? '' : 'none';
  fF.addEventListener('change', () => { customWrap.style.display = fF.value === 'custom' ? '' : 'none'; });

  modal({
    title: existing ? 'עריכת שגרה' : 'שגרה חדשה',
    body: el('div', {},
      field('שם', fT),
      field('הערה', fN),
      el('div', { class: 'row' }, field(el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'תדירות', hintBadge('routine.freq')), fF), customWrap)
    ),
    actions: [
      existing ? { label: 'מחק', cls: 'btn-danger', onClick: () => { confirmBox('למחוק את השגרה?', () => { removeItem(existing.id); refresh(); }); return false; } } : null,
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const data = {
            title: fT.value.trim() || 'שגרה', note: fN.value,
            freq: fF.value, customDays: Number(fC.value) || 3
          };
          if (existing) {
            patchItem(existing.id, data);
          } else {
            addItem(Object.assign({ type: 'routine', nextDue: Date.now() }, data));
          }
          toast('נשמר', 'ok'); refresh();
        }
      }
    ].filter(Boolean)
  });
}
