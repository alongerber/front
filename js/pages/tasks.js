/* ============================================================
   tasks.js — משימות, החלטות ורעיונות
   ============================================================ */

import { S, addItem, patchItem, getItem, removeItem, typeMeta } from '../store.js';
import { el, ago, dmy, dateInput, toast, modal, input, select, textarea, field, confirmBox, DAY } from '../util.js';
import * as T from '../timer.js';
import { scoreTask } from '../brain.js';
import { refresh, openItem } from '../app.js';
import { decideModal } from './home.js';
import { hintBadge, labelWithHint } from '../help.js';
import * as D from '../delivery.js';

export default { render };

let showDone = false;
let showScheduled = false;

function render(root, params) {
  const s = S();
  const f = params.f || 'task';

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, f === 'decision' ? 'החלטות' : f === 'idea' ? 'רעיונות' : 'משימות'),
    el('div', { class: 'desc' },
      f === 'decision' ? 'דילמות פתוחות. החלטה שנשארת פתוחה עולה יותר מהחלטה לא מושלמת.'
        : f === 'idea' ? 'מה שקפץ לראש. בלי דדליין, בלי לחץ.'
          : 'ממוינות לבד לפי דחיפות — לא לפי סדר ההוספה.',
      hintBadge(f === 'decision' ? 'task.decision' : f === 'idea' ? 'task.idea' : 'task.why')),
    el('div', { class: 'right' },
      ...[['task', 'משימות'], ['decision', 'החלטות'], ['idea', 'רעיונות']].map(([k, l]) =>
        el('button', { class: 'btn btn-sm ' + (f === k ? 'btn-y' : ''), onclick: () => { location.hash = '#/tasks?f=' + k; } }, l)),
      el('button', { class: 'btn btn-sm btn-y', onclick: () => form(null, f) }, '+ חדש')
    )
  ));

  if (f === 'task') renderTasks(root);
  if (f === 'decision') renderDecisions(root);
  if (f === 'idea') renderIdeas(root);
}

/* ---------- משימות ---------- */
function renderTasks(root) {
  const s = S();
  const all = s.items.filter(i => i.type === 'task' && !i.archived);
  const open = all.filter(t => !t.done && !D.isScheduled(t))
    .map(t => ({ t, ...scoreTask(t) })).sort((a, b) => b.score - a.score);
  const later = D.scheduled();
  const done = all.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'פתוחות', hintBadge('task.why')),
    el('span', { class: 'sub' }, open.length ? `${open.length} · הדחוף למעלה` : '')));
  if (!open.length) card.append(el('div', { class: 'empty' },
    later.length
      ? `אין מה לעשות עכשיו. ${later.length} ${later.length === 1 ? 'משימה ממתינה' : 'משימות ממתינות'} לתאריך שלהן — למטה.`
      : 'אין משימות פתוחות. כתוב משהו בשורת הקלט למעלה — המערכת תסווג לבד.'));

  open.forEach(({ t, why }) => {
    const client = t.clientId ? getItem(t.clientId) : null;
    const running = T.activeTimer() && T.activeTimer().itemId === t.id;
    const late = t.dueDate && t.dueDate < Date.now();
    // הקישור לסרטון יושב על ההפקה, לא על הלקוח
    const prod = t.productionId ? getItem(t.productionId) : null;
    const asset = prod && prod.deliveredAsset;
    card.append(el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.05)' } },
      el('input', {
        type: 'checkbox', style: { width: '17px', height: '17px', accentColor: '#ffd400', cursor: 'pointer' },
        onchange: () => { patchItem(t.id, { done: true, doneAt: Date.now() }); if (running) T.stopTimer(); toast('בוצע', 'ok'); refresh(); }
      }),
      el('div', { style: { flex: 1, minWidth: 0, cursor: 'pointer' }, onclick: () => form(t, 'task') },
        el('div', { style: { fontWeight: '600' } }, t.title),
        el('div', { class: 'small muted' }, why + (client ? ` · ${client.title}` : ''))
      ),
      /* משימת מעקב אחרי מסירה — הסרטון עצמו במרחק לחיצה,
         אחרת "מה קרה עם הסרטון?" מתחיל בחיפוש בדרייב */
      t.followup && asset ? el('a', {
        class: 'btn btn-xs', href: asset, target: '_blank', rel: 'noopener',
        title: 'הסרטון שנמסר', onclick: e => e.stopPropagation()
      }, '↗ הסרטון') : null,
      t.followup && prod && !asset ? el('button', {
        class: 'btn btn-xs', title: 'אין קישור לסרטון שנמסר',
        onclick: () => openItem(prod.id)
      }, '+ קישור') : null,
      t.priority === 'high' ? el('span', { class: 'pill pill-r', 'data-tip': 'task.priority' }, 'דחוף') : null,
      t.dueDate ? el('span', { class: 'pill ' + (late ? 'pill-r' : '') }, dmy(t.dueDate)) : null,
      T.focusMs(t.id) ? el('span', { class: 'pill' }, Math.round(T.focusMs(t.id) / 60000) + ' דק\'') : null,
      el('button', { class: 'btn btn-xs ' + (running ? 'btn-y' : ''), 'aria-label': running ? 'הטיימר רץ' : 'התחל טיימר', onclick: () => { T.startTimer(t.id); refresh(); } }, running ? '● רץ' : '▶')
    ));
  });
  root.append(card);

  /* ---- מתוזמנות ----
     מנגנון שמסתיר דברים בלי דרך לראות אותם הוא בור. */
  if (later.length) {
    const c3 = el('div', { class: 'card', style: { marginTop: '14px' } });
    c3.append(el('div', { class: 'card-h' },
      el('h3', {}, 'מתוזמנות'),
      el('span', { class: 'sub' },
        `${later.length} · יופיעו לבד. הקרובה ${dmy(later[0].snoozeUntil)}`),
      el('div', { class: 'right' }, el('button', {
        class: 'btn btn-xs', onclick: () => { showScheduled = !showScheduled; refresh(); }
      }, showScheduled ? 'הסתר' : 'הצג'))));
    if (showScheduled) later.forEach(t => {
      const client = t.clientId ? getItem(t.clientId) : null;
      c3.append(el('div', { style: { display: 'flex', gap: '9px', padding: '8px 0', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.05)' } },
        el('span', { class: 'pill' }, dmy(t.snoozeUntil)),
        el('div', { style: { flex: 1, minWidth: 0, cursor: 'pointer' }, onclick: () => form(t, 'task') },
          el('div', {}, t.title),
          client ? el('div', { class: 'small muted' }, client.title) : null),
        el('button', {
          class: 'btn btn-xs', title: 'להביא את זה להיום',
          onclick: () => { D.release(t.id); toast('הועברה לפתוחות', 'ok'); refresh(); }
        }, 'הצג עכשיו'),
        el('button', {
          class: 'btn btn-xs btn-danger', 'aria-label': 'מחק משימה',
          onclick: () => confirmBox('למחוק את "' + t.title + '"?', () => { removeItem(t.id); refresh(); })
        }, '🗑')
      ));
    });
    root.append(c3);
  }

  if (done.length) {
    const c2 = el('div', { class: 'card', style: { marginTop: '14px' } });
    c2.append(el('div', { class: 'card-h' },
      el('h3', {}, 'בוצעו'),
      el('span', { class: 'sub' }, done.length + ''),
      el('div', { class: 'right' }, el('button', { class: 'btn btn-xs', onclick: () => { showDone = !showDone; refresh(); } }, showDone ? 'הסתר' : 'הצג'))));
    if (showDone) done.slice(0, 40).forEach(t => c2.append(el('div', { style: { display: 'flex', gap: '9px', padding: '5px 0', alignItems: 'center' } },
      el('span', { class: 'muted', style: { flex: 1, textDecoration: 'line-through' } }, t.title),
      el('span', { class: 'small muted' }, t.doneAt ? dmy(t.doneAt) : ''),
      el('button', { class: 'btn btn-xs', onclick: () => { patchItem(t.id, { done: false, doneAt: null }); refresh(); } }, '↩')
    )));
    root.append(c2);
  }
}

/* ---------- החלטות ---------- */
function renderDecisions(root) {
  const s = S();
  const open = s.items.filter(i => i.type === 'decision' && !i.archived && i.status === 'open')
    .sort((a, b) => a.createdAt - b.createdAt);
  const closed = s.items.filter(i => i.type === 'decision' && i.status === 'resolved')
    .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'פתוחות', hintBadge('task.decision')),
    el('span', { class: 'sub' }, 'ככל שיושב יותר, כך זה יקר יותר')));
  if (!open.length) card.append(el('div', { class: 'empty' }, 'אין החלטות פתוחות'));

  open.forEach(d => {
    const old = Date.now() - d.createdAt > (s.settings.decisionStaleDays || 7) * DAY;
    card.append(el('div', { style: { padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,.05)' } },
      el('div', { style: { display: 'flex', gap: '9px', alignItems: 'flex-start' } },
        el('div', { style: { flex: 1, cursor: 'pointer' }, onclick: () => form(d, 'decision') },
          el('div', { style: { fontWeight: '600' } }, d.title),
          d.note ? el('div', { class: 'small muted', style: { marginTop: '3px' } }, d.note) : null,
          el('div', { class: 'small muted', style: { marginTop: '3px' } }, 'פתוחה ' + ago(d.createdAt))
        ),
        old ? el('span', { class: 'pill pill-y' }, 'יושב יותר מדי') : null,
        el('button', { class: 'btn btn-xs btn-y', onclick: () => decideModal(d) }, 'להכריע')
      )));
  });
  root.append(card);

  if (closed.length) {
    const c2 = el('div', { class: 'card', style: { marginTop: '14px' } });
    c2.append(el('div', { class: 'card-h' }, el('h3', {}, 'הוכרעו'), el('span', { class: 'sub' }, closed.length + '')));
    closed.slice(0, 20).forEach(d => c2.append(el('div', { style: { padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.05)' } },
      el('div', { style: { fontWeight: '600', fontSize: '13.5px' } }, d.title),
      el('div', { class: 'small muted' }, (d.resolution || 'ללא פירוט') + ' · ' + (d.resolvedAt ? dmy(d.resolvedAt) : '')),
      el('button', { class: 'btn btn-xs', style: { marginTop: '4px' }, onclick: () => { patchItem(d.id, { status: 'open' }); refresh(); } }, 'פתח מחדש')
    )));
    root.append(c2);
  }
}

/* ---------- רעיונות ---------- */
function renderIdeas(root) {
  const s = S();
  const ideas = s.items.filter(i => i.type === 'idea' && !i.archived).sort((a, b) => b.createdAt - a.createdAt);
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'רעיונות', hintBadge('task.idea')),
    el('span', { class: 'sub' }, ideas.length ? `${ideas.length} · בלי דדליין` : '')));
  if (!ideas.length) card.append(el('div', { class: 'empty' }, 'אין רעיונות שמורים'));
  ideas.forEach(i => card.append(el('div', { style: { display: 'flex', gap: '9px', padding: '8px 0', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.05)' } },
    el('div', { style: { flex: 1, cursor: 'pointer' }, onclick: () => form(i, 'idea') },
      el('div', {}, i.title),
      el('div', { class: 'small muted' }, ago(i.createdAt))),
    el('button', {
      class: 'btn btn-xs', title: 'הפוך למשימה',
      onclick: () => { patchItem(i.id, { type: 'task', done: false }); toast('הפך למשימה', 'ok'); refresh(); }
    }, '→ משימה'),
    el('button', { class: 'btn btn-xs', onclick: () => { patchItem(i.id, { archived: true }); refresh(); } }, '🗄')
  )));
  root.append(card);
}

/* ---------- טופס ---------- */
export function form(existing, type) {
  const s = S();
  const t = existing || {};
  const kind = existing ? existing.type : type;
  const fT = input({ value: t.title || '' });
  const fN = textarea({ placeholder: 'פרטים' });
  fN.value = t.note || '';
  const clients = [{ value: '', label: '— בלי לקוח —' },
  ...s.items.filter(i => i.type === 'client' && !i.archived).map(c => ({ value: c.id, label: c.title }))];
  const fC = select(clients, t.clientId || '');
  const fD = input({ type: 'date', value: t.dueDate ? dateInput(t.dueDate) : '' });
  const fP = select([{ value: 'normal', label: 'רגיל' }, { value: 'high', label: 'דחוף' }], t.priority || 'normal');

  const body = el('div', {},
    field('כותרת', fT),
    field(kind === 'decision' ? labelWithHint('הדילמה', 'task.decision') : 'פרטים', fN,
      kind === 'decision' ? 'מה האפשרויות, ומה מטריד בכל אחת' : null));
  if (kind === 'task') body.append(el('div', { class: 'row' },
    field(labelWithHint('לקוח', 'task.client'), fC),
    field('יעד', fD),
    field(labelWithHint('עדיפות', 'task.priority'), fP)));

  modal({
    title: (existing ? 'עריכה — ' : 'חדש — ') + typeMeta(kind).name,
    body,
    actions: [
      existing ? { label: 'מחק', cls: 'btn-danger', onClick: () => { confirmBox('למחוק?', () => { removeItem(existing.id); refresh(); }); return false; } } : null,
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const data = { title: fT.value.trim() || 'ללא כותרת', note: fN.value };
          if (kind === 'task') {
            data.clientId = fC.value || null;
            data.dueDate = fD.value ? new Date(fD.value).getTime() : null;
            data.priority = fP.value;
          }
          if (existing) patchItem(existing.id, data);
          else addItem(Object.assign({ type: kind }, data, kind === 'decision' ? { status: 'open' } : {}));
          toast('נשמר', 'ok'); refresh();
        }
      }
    ].filter(Boolean)
  });
}
