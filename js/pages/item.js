/* ============================================================
   item.js — כרטיס פריט: התקדמות, זמנים, פעולות
   שני מחוונים — צ'קליסט ומחוון ידני — והמאוחר מביניהם קובע
   ============================================================ */

import { S, update, uid, patchItem, getItem, removeItem, lineOf, stageOf, moveToStage, typeMeta, checklistFromLine } from '../store.js';
import { el, dur, ago, nis, hhmm, dmy, dateInput, toast, modal, closeModal, input, select, textarea, field, confirmBox, MIN, HOUR } from '../util.js';
import * as T from '../timer.js';
import { progressOf } from '../brain.js';
import { refresh } from '../app.js';
import { hintBadge } from '../help.js';
import * as MO from '../money.js';

export function openItem(id) {
  const it = getItem(id);
  if (!it) { toast('הפריט לא נמצא', 'err'); return; }
  const body = el('div', {});
  const draw = () => {
    const item = getItem(id);
    if (!item) { closeModal(); return; }
    body.innerHTML = '';
    body.append(header(item));
    if (item.type === 'client') body.append(clientBlock(item, draw));
    body.append(progressBlock(item, draw));
    body.append(timeBlock(item));
    body.append(actions(item, draw));
  };
  draw();
  modal({ title: it.title, body, wide: true });
}

function header(it) {
  const meta = typeMeta(it.type);
  const box = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '13px' } },
    el('span', { class: 'pill', style: { background: meta.color + '22', color: meta.color } }, meta.icon + ' ' + meta.name)
  );
  if (it.type === 'client') {
    const line = lineOf(it.productLineId), st = stageOf(it);
    box.append(el('span', { class: 'pill' }, line.name));
    box.append(el('span', { class: 'pill pill-y' }, st.name));
    box.append(el('span', { class: 'pill' }, ago(it.stageSince || it.createdAt) + ' בשלב'));
    if (it.amount) box.append(el('span', { class: 'pill' }, nis(it.amount)));
    if (it.dueDate) box.append(el('span', { class: 'pill ' + (it.dueDate < Date.now() ? 'pill-r' : '') }, 'יעד ' + dmy(it.dueDate)));
  }
  box.append(el('span', { class: 'pill' }, 'נוצר ' + ago(it.createdAt)));
  if (T.isWaiting(it.id)) box.append(el('span', { class: 'pill pill-b' }, 'בהמתנה'));

  const wrap = el('div', {});
  wrap.append(box);
  if (it.note) wrap.append(el('div', { class: 'muted small', style: { marginBottom: '12px', whiteSpace: 'pre-wrap' } }, it.note));
  if (it.url) wrap.append(el('div', { style: { marginBottom: '12px' } },
    el('a', { class: 'btn btn-sm', href: it.url, target: '_blank', rel: 'noopener' }, '↗ ' + it.url.slice(0, 60))));
  return wrap;
}

/* ---------- לקוח: מעבר שלבים ---------- */
function clientBlock(c, draw) {
  const line = lineOf(c.productLineId);
  const box = el('div', { style: { marginBottom: '15px' } });
  box.append(el('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'שלב'));
  const row = el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } });
  line.stages.forEach(st => {
    row.append(el('button', {
      class: 'btn btn-xs ' + (st.id === c.stageId ? 'btn-y' : ''),
      onclick: () => {
        moveToStage(c.id, st.id);
        if (st.name.includes('תשלום') && !c.paidAt) patchItem(c.id, { paidAt: Date.now(), amount: c.amount || line.pricing?.unit });
        if (st.name.includes('מסירה')) patchItem(c.id, { deliveredAt: Date.now() });
        draw(); refresh();
      }
    }, st.name));
  });
  box.append(row);
  if (c.phone) box.append(el('div', { style: { marginTop: '9px' } },
    el('a', { class: 'btn btn-sm', href: 'tel:' + c.phone }, '☎ ' + c.phone),
    el('a', { class: 'btn btn-sm', style: { marginInlineStart: '5px' }, href: 'https://wa.me/972' + c.phone.replace(/\D/g, '').replace(/^0/, ''), target: '_blank', rel: 'noopener' }, 'WhatsApp')
  ));

  /* מאיפה הגיע — בלי זה אי אפשר לדעת אם הקמפיין משתלם */
  box.append(el('div', { class: 'hr' }));
  const srcRow = el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } });
  MO.SOURCES.forEach(sc => {
    const on = (c.source || 'other') === sc.id;
    srcRow.append(el('button', {
      class: 'tag-pill sm' + (on ? ' on' : ''),
      style: on ? { background: sc.color, color: '#000', borderColor: sc.color } : { borderColor: sc.color + '66' },
      onclick: () => { patchItem(c.id, { source: sc.id }, 'שינוי מקור ליד'); draw(); refresh(); }
    }, sc.name));
  });
  box.append(el('div', { class: 'small muted', style: { marginBottom: '6px', display: 'flex', alignItems: 'center' } },
    'מאיפה הגיע', hintBadge('money.source')));
  box.append(srcRow);

  /* ריטיינר */
  box.append(el('div', { class: 'hr' }));
  const retCb = el('input', {
    type: 'checkbox', checked: !!c.retainer,
    style: { width: '16px', height: '16px', accentColor: '#ffd400', cursor: 'pointer' },
    onchange: e => {
      patchItem(c.id, {
        retainer: e.target.checked,
        monthlyAmount: c.monthlyAmount || c.amount || lineOf(c.productLineId).pricing?.bundle || 0,
        nextRenewalAt: c.nextRenewalAt || MO.nextRenewalDate()
      }, 'שינוי ריטיינר');
      draw(); refresh();
    }
  });
  box.append(el('label', { class: 'chk', 'data-tip': 'money.retainer' }, retCb,
    el('span', {}, 'משלם כל חודש (ריטיינר)')));

  if (c.retainer) {
    const amt = input({ type: 'number', min: 0, value: c.monthlyAmount || c.amount || 0 });
    amt.addEventListener('change', () => {
      patchItem(c.id, { monthlyAmount: Number(amt.value) || 0 }, 'שינוי סכום חודשי');
      refresh();
    });
    const dt = input({ type: 'date', value: dateInput(c.nextRenewalAt || Date.now()) });
    dt.addEventListener('change', () => {
      const ts = new Date(dt.value + 'T09:00').getTime();
      if (ts) { patchItem(c.id, { nextRenewalAt: ts }, 'שינוי תאריך חידוש'); refresh(); }
    });
    box.append(el('div', { class: 'row', style: { marginTop: '9px' } },
      field('סכום לחודש', amt), field('חידוש הבא', dt)));
  }

  return box;
}

/* ---------- התקדמות ---------- */
function progressBlock(it, draw) {
  if (!['client', 'task'].includes(it.type)) return el('div');
  const p = progressOf(it);
  const box = el('div', { style: { marginBottom: '15px' } });

  box.append(el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '7px' } },
    el('span', { style: { fontWeight: '700' } }, 'התקדמות'),
    el('span', { class: 'tabular', style: { marginInlineStart: 'auto', fontWeight: '900', fontSize: '19px', color: '#ffd400' } },
      Math.round(p.value * 100) + '%'),
    el('span', { class: 'small muted' }, p.total ? `צ'קליסט ${Math.round(p.auto * 100)}% · ידני ${Math.round(p.manual * 100)}%` : '')
  ));
  box.append(el('div', { class: 'bar' }, el('i', { style: { width: (p.value * 100) + '%' } })));

  // מחוון ידני
  const slider = el('input', {
    type: 'range', min: 0, max: 100, step: 5, value: it.manualProgress || 0,
    style: { marginTop: '11px' },
    oninput: e => { lbl.textContent = e.target.value + '%'; },
    onchange: e => { patchItem(it.id, { manualProgress: Number(e.target.value) }); draw(); refresh(); }
  });
  const lbl = el('span', { class: 'tabular small muted' }, (it.manualProgress || 0) + '%');
  box.append(el('div', { class: 'sl-h', style: { marginTop: '10px' } },
    el('span', { class: 'small muted' }, 'איפה אני? (מחוון ידני)'), el('span', { class: 'vv' }, lbl)));
  box.append(slider);

  // צ'קליסט
  if (it.type === 'client') {
    const list = el('div', { style: { marginTop: '11px' } });
    (it.checklist || []).forEach(c => {
      list.append(el('label', { class: 'chk' + (c.done ? ' done' : '') },
        el('input', {
          type: 'checkbox', checked: c.done || false,
          onchange: e => {
            update(s => {
              const x = s.items.find(i => i.id === it.id);
              const cc = x.checklist.find(y => y.id === c.id);
              if (cc) cc.done = e.target.checked;
            });
            draw(); refresh();
          }
        }),
        el('span', { style: { flex: 1 } }, c.text),
        el('button', {
          class: 'btn btn-xs', style: { padding: '0 6px' },
          onclick: e => {
            e.preventDefault();
            update(s => {
              const x = s.items.find(i => i.id === it.id);
              x.checklist = x.checklist.filter(y => y.id !== c.id);
            });
            draw();
          }
        }, '×')
      ));
    });
    const add = input({ placeholder: 'תת-שלב חדש + Enter', style: { marginTop: '7px' } });
    add.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !add.value.trim()) return;
      update(s => {
        const x = s.items.find(i => i.id === it.id);
        x.checklist = x.checklist || [];
        x.checklist.push({ id: uid('c'), text: add.value.trim(), done: false });
      });
      draw();
    });
    list.append(add);
    if (!(it.checklist || []).length)
      list.append(el('button', {
        class: 'btn btn-xs', style: { marginTop: '6px' },
        onclick: () => {
          const line = lineOf(it.productLineId);
          patchItem(it.id, { checklist: checklistFromLine(line, it.stageId) });
          draw();
        }
      }, 'צור צ\'קליסט משלבי קו המוצר'));
    box.append(list);
  }
  return box;
}

/* ---------- זמנים ---------- */
function timeBlock(it) {
  const focus = T.focusMs(it.id), wall = T.wallMs(it.id), wait = T.waitMs(it.id);
  const rate = S().settings.hourlyTarget || 250;
  const box = el('div', { style: { marginBottom: '15px' } });

  box.append(el('div', { class: 'grid g4' },
    numBox('זמן קשב', dur(focus, true), '#ffd400'),
    numBox('זמן קיר', dur(wall, true), 'rgba(255,255,255,.6)'),
    numBox('המתנה', wait ? dur(wait, true) : '—', '#5aa9ff'),
    numBox('עלות הזמן', nis(focus / HOUR * rate), '#ff5a4d')
  ));

  const entries = S().timeEntries.filter(e => e.itemId === it.id).sort((a, b) => b.start - a.start).slice(0, 8);
  if (entries.length) {
    const list = el('div', { style: { marginTop: '11px' } });
    entries.forEach(e => list.append(el('div', { style: { display: 'flex', gap: '8px', fontSize: '12.5px', padding: '3px 0' } },
      el('span', { class: 'dot', style: { background: T.KINDS[e.kind]?.color, marginTop: '6px' } }),
      el('span', { class: 'muted' }, dmy(e.start)),
      el('span', { class: 'muted tabular' }, `${hhmm(e.start)}–${hhmm(e.end)}`),
      el('span', { style: { flex: 1 } }),
      el('span', { class: 'tabular' }, dur(e.end - e.start)),
      el('button', {
        class: 'btn btn-xs', style: { padding: '0 6px' },
        onclick: () => { T.removeEntry(e.id); toast('נמחק'); refresh(); closeModal(); }
      }, '×')
    )));
    box.append(list);
  }
  return box;
}

function numBox(lbl, val, color) {
  return el('div', {},
    el('div', { class: 'small muted' }, lbl),
    el('div', { class: 'tabular', style: { fontSize: '17px', fontWeight: '800', color } }, val));
}

/* ---------- פעולות ---------- */
function actions(it, draw) {
  const running = T.activeTimer() && T.activeTimer().itemId === it.id;
  const row = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '13px', borderTop: '1px solid rgba(255,255,255,.08)' } });

  row.append(el('button', {
    class: 'btn ' + (running ? 'btn-y' : ''),
    onclick: () => { T.startTimer(it.id, it.type === 'knowledge' ? 'learn' : 'work'); draw(); refresh(); }
  }, running ? '● הטיימר רץ' : '▶ התחל טיימר'));

  if (!T.isWaiting(it.id))
    row.append(el('button', { class: 'btn', onclick: () => { T.startWaiting(it.id); toast('בהמתנה'); draw(); refresh(); } }, '⏸ ממתין'));
  else
    row.append(el('button', { class: 'btn', onclick: () => { T.endWaiting(it.id); toast('ההמתנה נסגרה'); draw(); refresh(); } }, 'סיים המתנה'));

  row.append(el('button', { class: 'btn', onclick: () => edit(it) }, '✎ ערוך'));

  if (it.type === 'task' && !it.done)
    row.append(el('button', { class: 'btn', onclick: () => { patchItem(it.id, { done: true, doneAt: Date.now() }); closeModal(); refresh(); } }, '✓ בוצע'));

  row.append(el('span', { style: { flex: 1 } }));
  row.append(el('button', {
    class: 'btn', onclick: () => { patchItem(it.id, { archived: !it.archived }, (it.archived ? 'החזרה מהארכיון: ' : 'העברה לארכיון: ') + it.title); toast(it.archived ? 'הוחזר' : 'לארכיון'); closeModal(); refresh(); }
  }, it.archived ? '↩ החזר' : '🗄 ארכיון'));
  row.append(el('button', {
    class: 'btn btn-danger',
    onclick: () => confirmBox('למחוק לגמרי? גם רשומות הזמן יימחקו.', () => { removeItem(it.id); closeModal(); refresh(); })
  }, 'מחק'));
  return row;
}

function edit(it) {
  closeModal();
  setTimeout(() => {
    if (it.type === 'client') import('./pipeline.js').then(m => m.clientForm(it));
    else if (it.type === 'knowledge') import('./knowledge.js').then(m => m.form(it));
    else if (it.type === 'routine') import('./routines.js').then(m => m.form(it));
    else import('./tasks.js').then(m => m.form(it, it.type));
  }, 120);
}

export default { openItem };
