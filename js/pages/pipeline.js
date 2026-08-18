/* ============================================================
   pipeline.js — התמונה המלאה: מה אתה מוכר, שלבים, ומי איפה
   עמודות עם גרירה בין שלבים
   ============================================================ */

import { S, update, uid, addItem, patchItem, getItem, lineOf, stageOf, moveToStage, checklistFromLine, removeItem } from '../store.js';
import { el, nis, ago, dur, dmy, dateInput, toast, modal, closeModal, input, select, field, textarea, confirmBox, MIN, DAY } from '../util.js';
import * as T from '../timer.js';
import { progressOf, scoreProduction } from '../brain.js';
import { refresh, openItem } from '../app.js';
import { hintBadge } from '../help.js';
import * as D from '../delivery.js';
import * as P from '../production.js';

export default { render };

function render(root, params) {
  const s = S();
  const lineId = params.line || s.settings.lastLine || s.productLines[0].id;
  const line = lineOf(lineId);

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'צינור'),
    el('div', { class: 'desc' }, 'מי איפה, וכמה זמן הוא כבר שם'),
    el('div', { class: 'right' },
      ...s.productLines.map(p => el('button', {
        class: 'btn btn-sm ' + (p.id === line.id ? 'btn-y' : ''),
        onclick: () => { update(st => { st.settings.lastLine = p.id; }); location.hash = '#/pipeline?line=' + p.id; refresh(); }
      }, p.name)),
      el('button', { class: 'btn btn-sm', 'data-tip': 'pipe.editor', onclick: lineEditor }, '⚙ שלבים'),
      el('button', { class: 'btn btn-sm btn-y', onclick: () => clientForm(null, line.id) }, '+ לקוח')
    )
  ));

  /* בצינור יושבות הפקות, לא לקוחות. לקוח בחבילה מופיע פעם
     אחת לכל סרטון, כי זו העבודה שצריך לעשות. */
  const prods = s.items.filter(i => i.type === 'production' && !i.archived && i.productLineId === line.id);
  const active = prods.filter(c => !c.deliveredAt);

  /* שווי פתוח לפי לקוחות ולא לפי הפקות — אחרת חבילה של ארבעה
     סרטונים נספרת ארבע פעמים והמספר משקר כלפי מעלה. */
  const openClients = new Map();
  active.forEach(pr => {
    const c = P.clientOf(pr);
    if (c && !openClients.has(c.id)) openClients.set(c.id, c);
  });
  const openValue = [...openClients.values()]
    .reduce((a, c) => a + (Number(c.retainer ? (c.monthlyAmount || c.amount) : c.amount) || 0), 0);

  root.append(el('div', { class: 'grid g4', style: { marginBottom: '14px' } },
    stat('בצינור', String(active.length), ''),
    stat('שווי פתוח', nis(openValue), 'y', 'pipe.value'),
    stat('תקועים', String(active.filter(c => scoreProduction(c).stuck).length), active.some(c => scoreProduction(c).stuck) ? 'r' : '', 'pipe.stuck'),
    stat('נמסרו', String(prods.filter(c => c.deliveredAt).length), 'g')
  ));

  const pipe = el('div', { class: 'pipe' });
  line.stages.forEach(stage => {
    const inStage = prods.filter(c => c.stageId === stage.id && !c.deliveredAt);
    const col = el('div', {
      class: 'col',
      ondragover: e => { e.preventDefault(); col.classList.add('over'); },
      ondragleave: () => col.classList.remove('over'),
      ondrop: e => {
        e.preventDefault(); col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        const c = getItem(id);
        if (!c || c.stageId === stage.id) return;
        moveToStage(id, stage.id);
        const r = D.onStageChange(id, stage);
        toast(`${P.label(c)} → ${stage.name}` + (r.followups.length ? ` · ${r.followups.length} משימות מעקב נוצרו` : ''), 'ok');
        refresh();
      }
    });

    col.append(el('div', { class: 'col-h' },
      el('span', { class: 'dot', style: { background: stage.priority >= 8 ? '#ffd400' : 'rgba(255,255,255,.25)' } }),
      el('span', { class: 'nm' }, stage.name),
      el('span', { class: 'ct' }, String(inStage.length))
    ));

    inStage
      .sort((a, b) => (a.stageSince || 0) - (b.stageSince || 0))
      .forEach(c => col.append(prodCard(c, stage, line)));

    if (!inStage.length) col.append(el('div', { class: 'small muted', style: { textAlign: 'center', padding: '10px 0' } }, '—'));
    pipe.append(col);
  });
  root.append(pipe);

  // נמסרו
  const done = prods.filter(c => c.deliveredAt).sort((a, b) => b.deliveredAt - a.deliveredAt);
  if (done.length) {
    const card = el('div', { class: 'card', style: { marginTop: '16px' } });
    card.append(el('div', { class: 'card-h' }, el('h3', {}, 'נמסרו'), el('span', { class: 'sub' }, done.length + ' פריטים')));
    const tb = el('table', { class: 'tb' },
      el('tr', {}, el('th', {}, 'הפקה'), el('th', {}, 'עסק'), el('th', {}, 'סכום'), el('th', {}, 'זמן עבודה נטו'), el('th', {}, 'זמן מהתחלה עד מסירה'), el('th', {}, 'נמסר'), el('th', {}))
    );
    done.slice(0, 25).forEach(c => {
      const cl = P.clientOf(c);
      tb.append(el('tr', {},
        el('td', { style: { cursor: 'pointer', fontWeight: '600' }, onclick: () => openItem(c.id) }, P.label(c)),
        el('td', { class: 'muted' }, (cl && cl.business) || '—'),
        el('td', { class: 'num' }, nis(cl ? cl.amount : 0)),
        el('td', { class: 'num' }, dur(T.focusMs(c.id), true)),
        el('td', { class: 'num muted' }, dur(T.wallMs(c.id), true)),
        el('td', { class: 'muted small' }, dmy(c.deliveredAt)),
        el('td', {}, el('button', { class: 'btn btn-xs', onclick: () => openItem(c.id) }, 'פתח'))
      ));
    });
    card.append(tb);
    root.append(card);
  }
}

function stat(lbl, val, cls, tip) {
  return el('div', { class: 'stat ' + cls },
    el('div', { class: 'lbl', style: { display: 'flex', alignItems: 'center' } }, lbl, tip ? hintBadge(tip) : null),
    el('div', { class: 'val' }, val));
}

function prodCard(c, stage, line) {
  const r = scoreProduction(c);
  const p = progressOf(c);
  const running = T.activeTimer() && T.activeTimer().itemId === c.id;
  const waiting = T.isWaiting(c.id);

  const card = el('div', {
    class: 'ccard' + (r.stuck ? ' stuck' : ''), draggable: true,
    ondragstart: e => { e.dataTransfer.setData('text/plain', c.id); card.classList.add('dragging'); },
    ondragend: () => card.classList.remove('dragging')
  });

  const cl = P.clientOf(c);
  card.append(el('div', { class: 'cn', style: { cursor: 'pointer' }, onclick: () => openItem(c.id) }, P.label(c)));
  if (cl && cl.business) card.append(el('div', { class: 'cb' }, cl.business));

  if (p.total) card.append(el('div', { class: 'bar', style: { marginTop: '7px' } }, el('i', { style: { width: (p.value * 100) + '%' } })));

  const meta = el('div', { class: 'cm' });
  meta.append(el('span', { class: 'pill ' + (r.stuck ? 'pill-r' : '') }, ago(c.stageSince || c.createdAt)));
  if (cl && cl.amount) meta.append(el('span', { class: 'pill pill-y' }, nis(cl.retainer ? (cl.monthlyAmount || cl.amount) : cl.amount)));
  if (c.dueDate) {
    const left = c.dueDate - Date.now();
    meta.append(el('span', { class: 'pill ' + (left < 0 ? 'pill-r' : left < 2 * DAY ? 'pill-y' : '') },
      left < 0 ? 'איחור' : dmy(c.dueDate)));
  }
  if (waiting) meta.append(el('span', { class: 'pill pill-b' }, 'ממתין'));
  card.append(meta);

  const acts = el('div', { style: { display: 'flex', gap: '5px', marginTop: '8px' } },
    el('button', {
      class: 'btn btn-xs ' + (running ? 'btn-y' : ''), style: { flex: 1 },
      onclick: () => { T.startTimer(c.id); refresh(); }
        , 'aria-label': running ? 'הטיימר רץ' : 'התחל טיימר'
}, running ? '● רץ' : '▶'),
    el('button', {
      class: 'btn btn-xs', 'data-tip': 'pipe.next',
      onclick: () => {
        const i = line.stages.findIndex(s => s.id === c.stageId);
        const next = line.stages[i + 1];
        if (!next) { toast('שלב אחרון'); return; }
        moveToStage(c.id, next.id);
        const r = D.onStageChange(c.id, next);
        if (r.followups.length) toast(`נמסר · ${r.followups.length} משימות מעקב נוצרו`, 'ok');
        refresh();
      }
      , 'aria-label': 'העבר לשלב הבא'
    }, '←')
  );
  card.append(acts);
  return card;
}

/* ================= טופס לקוח ================= */

export function clientForm(existing, lineId) {
  const s = S();
  const line = lineOf(lineId || (existing && existing.productLineId));
  const c = existing || {};

  const fTitle = input({ value: c.title || '', placeholder: 'דני' });
  const fBiz = input({ value: c.business || '', placeholder: 'מוסך דני' });
  const fLine = select(s.productLines.map(p => ({ value: p.id, label: p.name })), c.productLineId || line.id);
  const fStage = select(line.stages.map(st => ({ value: st.id, label: st.name })), c.stageId || line.stages[0].id);
  fLine.addEventListener('change', () => {
    const l = lineOf(fLine.value);
    fStage.innerHTML = '';
    l.stages.forEach(st => fStage.append(el('option', { value: st.id }, st.name)));
  });
  const fAmount = input({ type: 'number', value: c.amount ?? (line.pricing?.unit || 1290) });
  const fDue = input({ type: 'date', value: c.dueDate ? dateInput(c.dueDate) : dateInput(Date.now() + (line.pricing?.deliveryDays || 7) * DAY) });
  const fPhone = input({ value: c.phone || '', placeholder: '050…' });
  const fMedia = input({ type: 'number', value: c.mediaCost ?? 0 });
  const fNote = textarea({ placeholder: 'מה הוא רוצה, מה סיכמתם' }, c.note || '');
  fNote.value = c.note || '';

  /* שלב ותאריך יעד שייכים להפקה ולא ללקוח. בלקוח חדש הם קובעים
     את ההפקה הראשונה; בעריכת לקוח קיים הם לא מוצגים כאן, כי
     ללקוח עשויות להיות כמה הפקות ואי אפשר לדעת על איזו דיברת. */
  const body = el('div', {},
    el('div', { class: 'row' }, field('שם', fTitle), field('עסק', fBiz)),
    existing
      ? field('סוג העבודה', fLine)
      : el('div', { class: 'row' }, field('סוג העבודה', fLine), field('שלב', fStage)),
    existing
      ? field('סכום ₪', fAmount)
      : el('div', { class: 'row' }, field('סכום ₪', fAmount), field('תאריך יעד לסרטון הראשון', fDue)),
    el('div', { class: 'row' }, field('טלפון', fPhone), field('עלות מדיה ₪', fMedia, 'נזקף ללקוח הזה')),
    field('הערה', fNote)
  );

  modal({
    title: existing ? 'עריכת לקוח' : 'לקוח חדש',
    body,
    actions: [
      existing ? {
        label: 'מחק', cls: 'btn-danger',
        onClick: () => { confirmBox(`למחוק את ${existing.title}? גם רשומות הזמן שלו יימחקו.`, () => { removeItem(existing.id); refresh(); }); return false; }
      } : null,
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const data = {
            title: fTitle.value.trim() || 'ללא שם',
            business: fBiz.value.trim(),
            productLineId: fLine.value,
            amount: Number(fAmount.value) || 0,
            phone: fPhone.value.trim(),
            mediaCost: Number(fMedia.value) || 0,
            note: fNote.value
          };
          if (existing) {
            patchItem(existing.id, data);
            if (existing.title !== data.title) P.renameProductions(existing.id, data.title);
            toast('נשמר', 'ok');
          } else {
            const c2 = addItem(Object.assign({ type: 'client' }, data));
            // לקוח בלי הפקה לא מופיע בשום מקום שבו עובדים
            P.addProduction(c2.id, {
              stageId: fStage.value,
              dueDate: fDue.value ? new Date(fDue.value).getTime() : null
            });
            toast('נוצר לקוח והפקה ראשונה', 'ok');
          }
          refresh();
        }
      }
    ].filter(Boolean)
  });
}

/* ================= עורך מה אתה מוכר ושלבים ================= */

export function lineEditor() {
  const box = el('div', {});
  const draw = () => {
    box.innerHTML = '';
    S().productLines.forEach(line => {
      const card = el('div', { class: 'card', style: { marginBottom: '12px' } });
      const nameInp = input({ value: line.name, style: { fontWeight: '700' } });
      nameInp.addEventListener('change', () => { update(s => { s.productLines.find(p => p.id === line.id).name = nameInp.value; }); refresh(); });

      const color = el('input', {
        type: 'color', value: line.color || '#ffd400',
        style: { width: '38px', height: '34px', border: 0, background: 'transparent', cursor: 'pointer' },
        onchange: e => update(s => { s.productLines.find(p => p.id === line.id).color = e.target.value; })
      });

      card.append(el('div', { class: 'card-h' }, nameInp, color,
        el('div', { class: 'right' },
          S().productLines.length > 1 ? el('button', {
            class: 'btn btn-xs btn-danger',
            onclick: () => confirmBox(`למחוק את קו המוצר "${line.name}"? הלקוחות שבו יעברו לקו הראשון.`, () => {
              update(s => {
                const other = s.productLines.find(p => p.id !== line.id);
                s.items.filter(i => i.productLineId === line.id).forEach(i => {
                  i.productLineId = other.id; i.stageId = other.stages[0].id;
                });
                s.productLines = s.productLines.filter(p => p.id !== line.id);
              });
              draw(); refresh();
            })
          }, 'מחק קו') : null
        )));

      // תמחור
      const p = line.pricing || {};
      const pu = input({ type: 'number', value: p.unit ?? 1290 });
      const pb = input({ type: 'number', value: p.bundle ?? 4200 });
      const pq = input({ type: 'number', value: p.bundleQty ?? 4 });
      const pd = input({ type: 'number', value: p.deliveryDays ?? 7 });
      const pe = input({ type: 'number', step: '0.5', value: line.estHours ?? 4 });
      [pu, pb, pq, pd, pe].forEach((inp, i) => inp.addEventListener('change', () => {
        update(s => {
          const l = s.productLines.find(x => x.id === line.id);
          l.pricing = l.pricing || {};
          if (i === 0) l.pricing.unit = Number(pu.value);
          if (i === 1) l.pricing.bundle = Number(pb.value);
          if (i === 2) l.pricing.bundleQty = Number(pq.value);
          if (i === 3) l.pricing.deliveryDays = Number(pd.value);
          if (i === 4) l.estHours = Number(pe.value);
        });
      }));
      card.append(el('div', { class: 'row' },
        field('מחיר יחיד ₪', pu), field('חבילה ₪', pb), field('כמות בחבילה', pq),
        field('ימי אספקה', pd), field('שעות משוערות', pe)));

      // שלבים
      card.append(el('div', { class: 'small muted', style: { margin: '4px 0 8px' } },
        'שלבים — גרור לסדר מחדש. העמודה האחרונה אומרת למערכת מה השלב מסמן: ' +
        'מעבר לשלב שסומן "שולם" רושם את התשלום, ו"נמסר" פותח את משימות המעקב.'));

      const list = el('div', {});
      line.stages.forEach((st, idx) => {
        const row = el('div', {
          draggable: true,
          style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '5px', borderRadius: '8px', background: '#0f0f0e', marginBottom: '5px', cursor: 'grab' },
          ondragstart: e => e.dataTransfer.setData('text/plain', String(idx)),
          ondragover: e => e.preventDefault(),
          ondrop: e => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (Number.isNaN(from) || from === idx) return;
            update(s => {
              const l = s.productLines.find(x => x.id === line.id);
              const [m] = l.stages.splice(from, 1);
              l.stages.splice(idx, 0, m);
            });
            draw(); refresh();
          }
        });
        row.append(el('span', { class: 'muted', style: { cursor: 'grab' } }, '⠿'));
        const nm = input({ value: st.name, style: { flex: '2' } });
        nm.addEventListener('change', () => update(s => {
          s.productLines.find(x => x.id === line.id).stages.find(y => y.id === st.id).name = nm.value;
        }));
        const pr = input({ type: 'number', min: 1, max: 10, value: st.priority ?? 5, style: { width: '62px', flex: '0 0 62px' }, 'data-tip': 'pipe.priority', 'aria-label': 'עדיפות' });
        pr.addEventListener('change', () => update(s => {
          s.productLines.find(x => x.id === line.id).stages.find(y => y.id === st.id).priority = Number(pr.value);
        }));
        const sla = input({ type: 'number', value: st.sla ?? 1440, style: { width: '82px', flex: '0 0 82px' }, 'data-tip': 'pipe.sla', 'aria-label': 'כמה דקות עד שנחשב תקוע' });
        sla.addEventListener('change', () => update(s => {
          s.productLines.find(x => x.id === line.id).stages.find(y => y.id === st.id).sla = Number(sla.value);
        }));
        /* מה השלב אומר למערכת. קודם זה נוחש משם השלב, ואז שינוי
           שם היה מפסיק לרשום תשלום בלי להגיד מילה. */
        const mk = select([
          { value: '', label: '—' },
          { value: 'paid', label: 'שולם' },
          { value: 'delivered', label: 'נמסר' }
        ], st.mark || '');
        mk.style.width = '92px'; mk.style.flex = '0 0 92px';
        mk.setAttribute('aria-label', 'מה השלב מסמן');
        mk.setAttribute('data-tip', 'pipe.mark');
        mk.addEventListener('change', () => {
          update(s2 => {
            const l = s2.productLines.find(x => x.id === line.id);
            // סימון הוא ייחודי בקו — שני שלבי "נמסר" הם מסירה כפולה
            if (mk.value) l.stages.forEach(y => { if (y.mark === mk.value) y.mark = null; });
            l.stages.find(y => y.id === st.id).mark = mk.value || null;
          });
          draw(); refresh();
        });
        row.append(nm, pr, sla, mk, el('button', {
          class: 'btn btn-xs btn-danger',
          onclick: () => {
            if (line.stages.length <= 1) { toast('צריך לפחות שלב אחד', 'err'); return; }
            update(s => {
              const l = s.productLines.find(x => x.id === line.id);
              l.stages = l.stages.filter(y => y.id !== st.id);
              s.items.filter(i => i.productLineId === line.id && i.stageId === st.id)
                .forEach(i => { i.stageId = l.stages[0].id; i.stageSince = Date.now(); });
            });
            draw(); refresh();
          }
        }, '×'));
        list.append(row);
      });
      card.append(list);
      card.append(el('button', {
        class: 'btn btn-xs', style: { marginTop: '6px' },
        onclick: () => {
          update(s => {
            s.productLines.find(x => x.id === line.id).stages.push({ id: uid('st'), name: 'שלב חדש', priority: 5, sla: 1440 });
          });
          draw(); refresh();
        }
      }, '+ שלב'));
      box.append(card);
    });

    box.append(el('button', {
      class: 'btn btn-y',
      onclick: () => {
        update(s => {
          s.productLines.push({
            id: uid('pl'), name: 'סוג העבודה חדש', color: '#5aa9ff',
            stages: [
              { id: uid('st'), name: 'ליד', priority: 10, sla: 120 },
              { id: uid('st'), name: 'שיחה', priority: 9, sla: 1440 },
              { id: uid('st'), name: 'תשלום', priority: 8, sla: 2880 },
              { id: uid('st'), name: 'עבודה', priority: 6, sla: 4320 },
              { id: uid('st'), name: 'מסירה', priority: 9, sla: 240 }
            ],
            pricing: { unit: 0, bundle: 0, bundleQty: 1, deliveryDays: 7 }, estHours: 3
          });
        });
        draw(); refresh();
      }
    }, '+ סוג העבודה (למשל: סוכנת קולית)'));
  };
  draw();
  modal({ title: 'מה אתה מוכר ושלבים', body: box, wide: true, actions: [{ label: 'סגור', cls: 'btn-y' }] });
}
