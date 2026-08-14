/* ============================================================
   home.js — מסך הפתיחה. תמונת מצב, לא לוח קנבן.
   רשימה אחת של מה שדורש פעולה, ממוינת לפי דחיפות.
   ============================================================ */

import { S, update, patchItem, getItem, monthMoney, lineOf, stageOf, moveToStage } from '../store.js';
import { el, dur, hms, nis, ago, hhmm, toast, modal, closeModal, num, MIN, HOUR, DAY, startOfDay } from '../util.js';
import * as T from '../timer.js';
import { actionQueue, fillerSuggestions, topKnowledge, completeRoutine, currentPlan, buildDayPlan, savePlan, progressOf, estimateMinutes, deliveredThisMonth } from '../brain.js';
import { runRules } from '../rules.js';
import { refresh, openItem, openSwitcher, go } from '../app.js';

export default { render, tick };

function tick() {
  const n = document.getElementById('home-live');
  if (n) {
    const t = T.activeTimer();
    n.textContent = t ? hms(T.elapsed()) : '—';
  }
}

function render(root) {
  const s = S();
  const st = s.settings;

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, greet()),
    el('div', { class: 'desc' }, new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })),
    el('div', { class: 'right' },
      modeToggle(st.homeMode)
    )
  ));

  root.append(statusRow());
  root.append(alertsBox());

  const grid = el('div', { class: 'grid g-2-1', style: { marginTop: '14px' } });
  const left = el('div', {});
  const right = el('div', {});

  if (st.homeMode === 'day') left.append(dayPlanCard());
  else left.append(nowCard());

  right.append(todayCard());
  right.append(monthCard());
  right.append(learnCard());

  grid.append(left, right);
  root.append(grid);
}

function greet() {
  const h = new Date().getHours();
  const n = S().settings.ownerName || 'אלון';
  if (h < 6) return 'עוד ער, ' + n + '?';
  if (h < 12) return 'בוקר טוב, ' + n;
  if (h < 17) return 'צהריים טובים, ' + n;
  if (h < 22) return 'ערב טוב, ' + n;
  return 'לילה טוב, ' + n;
}

function modeToggle(mode) {
  const set = m => { update(s => { s.settings.homeMode = m; }); refresh(); };
  return el('div', { style: { display: 'flex', gap: '0', background: '#131312', border: '1px solid rgba(255,255,255,.14)', borderRadius: '10px', padding: '3px' } },
    el('button', { class: 'btn btn-xs ' + (mode === 'list' ? 'btn-y' : 'btn-ghost'), style: { border: 0 }, onclick: () => set('list') }, 'רשימה לפי דחיפות'),
    el('button', { class: 'btn btn-xs ' + (mode === 'day' ? 'btn-y' : 'btn-ghost'), style: { border: 0 }, onclick: () => set('day') }, 'יום מוצע')
  );
}

/* ================= שורת מצב ================= */

function statusRow() {
  const t = T.activeTimer();
  const waiting = S().waiting;
  const card = el('div', { class: 'card', style: { padding: '13px 16px' } });
  const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '13px', flexWrap: 'wrap' } });

  if (t) {
    const it = t.itemId ? getItem(t.itemId) : null;
    row.append(
      el('span', { class: 'dot', style: { background: T.KINDS[t.kind].color } }),
      el('div', { style: { minWidth: 0 } },
        el('div', { style: { fontWeight: '700' } }, it ? it.title : (t.kind === 'learn' ? 'למידה' : 'עבודה כללית')),
        el('div', { class: 'small muted' }, `רץ מ-${hhmm(t.startedAt)} · ${T.KINDS[t.kind].name}`)
      ),
      el('div', { id: 'home-live', class: 'tabular', style: { fontSize: '26px', fontWeight: '900', color: T.KINDS[t.kind].color, marginInlineStart: '4px' } }, hms(T.elapsed()))
    );
  } else {
    row.append(
      el('span', { class: 'dot', style: { background: 'rgba(255,255,255,.2)' } }),
      el('div', {},
        el('div', { style: { fontWeight: '700' } }, 'אין טיימר פעיל'),
        el('div', { class: 'small muted' }, 'כל דקה שלא נמדדת היא דקה שאי אפשר לתמחר')
      )
    );
  }

  const actions = el('div', { style: { marginInlineStart: 'auto', display: 'flex', gap: '7px', flexWrap: 'wrap' } },
    el('button', { class: 'btn btn-sm btn-y', onclick: openSwitcher }, t ? 'החלף (Ctrl+J)' : 'התחל טיימר'),
    t && t.itemId ? el('button', { class: 'btn btn-sm', onclick: () => { T.startWaiting(t.itemId); toast('בהמתנה'); refresh(); } }, 'ממתין') : null,
    t ? el('button', { class: 'btn btn-sm', onclick: () => { T.stopTimer(); refresh(); } }, 'עצור') : null
  );
  row.append(actions);
  card.append(row);

  if (waiting.length) {
    const w = el('div', { style: { display: 'flex', gap: '7px', marginTop: '11px', flexWrap: 'wrap', alignItems: 'center' } },
      el('span', { class: 'small muted' }, 'בהמתנה:'));
    waiting.forEach(x => {
      const it = getItem(x.itemId);
      if (!it) return;
      w.append(el('button', {
        class: 'pill pill-b', style: { cursor: 'pointer', border: 0 },
        onclick: () => { T.startTimer(x.itemId); refresh(); }
      }, `${it.title} · ${dur(Date.now() - x.since)}`));
    });
    card.append(w);
  }
  return card;
}

/* ================= התראות ================= */

function alertsBox() {
  const alerts = runRules().slice(0, 4);
  const box = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '14px' } });
  alerts.forEach(a => {
    box.append(el('div', { class: 'alert ' + (a.level || '') },
      el('div', { style: { flex: 1 } }, a.text),
      a.action && a.action.type === 'goto'
        ? el('button', { class: 'btn btn-xs', onclick: () => go(a.action.href) }, 'לעמוד')
        : a.action && a.action.type === 'backup'
          ? el('button', { class: 'btn btn-xs btn-y', onclick: () => { import('../store.js').then(m => { m.downloadBackup(); toast('גובה', 'ok'); refresh(); }); } }, 'גבה עכשיו')
          : null,
      el('button', {
        class: 'a-x', title: 'הסתר להיום',
        onclick: () => { update(s => { s.dismissedAlerts[a.id] = Date.now(); }); refresh(); }
      }, '×')
    ));
  });
  return box;
}

/* ================= מה עכשיו ================= */

function nowCard() {
  const q = actionQueue(7);
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h2', {}, 'מה עכשיו'),
    el('span', { class: 'sub' }, 'ממוין לפי דחיפות — לידים לפני הפקות'),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-xs', onclick: () => go('#/pipeline') }, 'כל הצינור'))
  ));

  const list = el('div', { class: 'actionlist' });
  if (!q.length) {
    list.append(el('div', { class: 'empty' }, 'אין שום דבר דחוף. זה בסדר — למטה יש הצעות.'));
  }
  q.forEach((e, i) => list.append(actionRow(e, i + 1)));

  card.append(list);

  // תמיד יש מה לעשות
  const fillers = fillerSuggestions();
  if (fillers.length && q.length < 5) {
    card.append(el('div', { class: 'hr' }));
    card.append(el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'ואם נגמרו הדחיפויות —'));
    const fl = el('div', { class: 'actionlist' });
    fillers.forEach(f => fl.append(actionRow(f, '·')));
    fl.append(el('div', { class: 'act' },
      el('span', { class: 'act-rank' }, '✎'),
      el('div', { class: 'act-main' },
        el('div', { class: 'act-title' }, 'תוכן אורגני או קידום העסק'),
        el('div', { class: 'act-why' }, 'יום בלי לידים הוא יום לבנות את הצינור של החודש הבא')),
      el('button', { class: 'btn btn-xs btn-y', onclick: () => { T.startFree('work'); toast('טיימר עבודה רץ'); refresh(); } }, 'התחל')
    ));
    card.append(fl);
  }
  return card;
}

function actionRow(e, rank) {
  const it = e.item;
  const running = T.activeTimer() && T.activeTimer().itemId === it.id;
  const hot = e.score >= 900;

  const row = el('div', { class: 'act' + (hot ? ' hot' : '') + (running ? ' now' : '') });
  row.append(el('span', { class: 'act-rank' }, String(rank)));

  const main = el('div', { class: 'act-main', style: { cursor: 'pointer' }, onclick: () => openItem(it.id) },
    el('div', { class: 'act-title' }, it.title + (it.business ? ` · ${it.business}` : '')),
    el('div', { class: 'act-why' }, e.why)
  );
  row.append(main);

  const meta = el('div', { class: 'act-meta' });

  if (e.kind === 'client') {
    const p = progressOf(it);
    if (p.total) meta.append(el('span', { class: 'pill' }, Math.round(p.value * 100) + '%'));
    if (it.amount) meta.append(el('span', { class: 'pill pill-y' }, nis(it.amount)));
    meta.append(el('button', {
      class: 'btn btn-xs ' + (running ? 'btn-y' : ''),
      onclick: () => { T.startTimer(it.id); refresh(); }
    }, running ? '● רץ' : 'התחל'));
    meta.append(el('button', {
      class: 'btn btn-xs', title: 'לשלב הבא',
      onclick: () => { nextStage(it); }
    }, '←'));
  } else if (e.kind === 'task') {
    meta.append(el('button', {
      class: 'btn btn-xs ' + (running ? 'btn-y' : ''),
      onclick: () => { T.startTimer(it.id); refresh(); }
    }, running ? '● רץ' : 'התחל'));
    meta.append(el('button', {
      class: 'btn btn-xs', title: 'בוצע',
      onclick: () => { patchItem(it.id, { done: true, doneAt: Date.now() }); if (running) T.stopTimer(); toast('בוצע', 'ok'); refresh(); }
    }, '✓'));
  } else if (e.kind === 'routine') {
    meta.append(el('button', {
      class: 'btn btn-xs btn-y',
      onclick: () => { completeRoutine(it.id); toast('סומן כבוצע', 'ok'); refresh(); }
    }, '✓ בוצע'));
    meta.append(el('button', {
      class: 'btn btn-xs', title: 'דחה ליום',
      onclick: () => { patchItem(it.id, { nextDue: Date.now() + DAY }); refresh(); }
    }, 'מחר'));
  } else if (e.kind === 'decision') {
    meta.append(el('button', { class: 'btn btn-xs btn-y', onclick: () => decideModal(it) }, 'להכריע'));
  } else if (e.kind === 'knowledge') {
    meta.append(el('span', { class: 'pill' }, (it.estMinutes || 20) + ' דק\''));
    meta.append(el('button', { class: 'btn btn-xs btn-y', onclick: () => { T.startTimer(it.id, 'learn'); refresh(); } }, '▶ ללמוד'));
  } else {
    meta.append(el('button', { class: 'btn btn-xs', onclick: () => openItem(it.id) }, 'פתח'));
  }

  row.append(meta);
  return row;
}

function nextStage(c) {
  const line = lineOf(c.productLineId);
  const i = line.stages.findIndex(s => s.id === c.stageId);
  const next = line.stages[i + 1];
  if (!next) { toast('זה השלב האחרון'); return; }
  moveToStage(c.id, next.id);
  if (next.name.includes('תשלום') && !c.paidAt) patchItem(c.id, { paidAt: Date.now(), amount: c.amount || line.pricing?.unit });
  if (next.name.includes('מסירה')) patchItem(c.id, { deliveredAt: Date.now() });
  toast(`${c.title} → ${next.name}`, 'ok');
  refresh();
}

export function decideModal(d) {
  const ta = el('textarea', { class: 'inp', placeholder: 'מה החלטת ולמה', rows: 3 }, d.resolution || '');
  modal({
    title: d.title,
    body: el('div', {},
      d.note ? el('div', { class: 'muted small', style: { marginBottom: '10px' } }, d.note) : null,
      el('div', { class: 'small muted', style: { marginBottom: '10px' } }, `פתוחה ${ago(d.createdAt)}`),
      ta
    ),
    actions: [
      { label: 'עוד לא', onClick: () => { patchItem(d.id, { touchedAt: Date.now() }); } },
      { label: 'הכרעתי', cls: 'btn-y', onClick: () => { patchItem(d.id, { status: 'resolved', resolution: ta.value, resolvedAt: Date.now() }); toast('נסגר', 'ok'); refresh(); } }
    ]
  });
}

/* ================= יום מוצע ================= */

function dayPlanCard() {
  const plan = currentPlan();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h2', {}, 'יום מוצע'),
    el('span', { class: 'sub' }, 'הצעה, לא צו — גרור לשנות סדר'),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-xs', onclick: () => { buildDayPlan(); toast('נבנה מחדש'); refresh(); } }, 'בנה מחדש'))
  ));

  if (!plan.blocks.length) {
    card.append(el('div', { class: 'empty' }, 'אין מה לתכנן — הוסף לקוח או משימה'));
    return card;
  }

  const list = el('div', { class: 'actionlist' });
  plan.blocks.forEach((b, idx) => {
    const it = getItem(b.id);
    const running = T.activeTimer() && T.activeTimer().itemId === b.id;
    const row = el('div', {
      class: 'act' + (running ? ' now' : ''), draggable: true,
      ondragstart: e => { e.dataTransfer.setData('text/plain', String(idx)); row.classList.add('dragging'); },
      ondragend: () => row.classList.remove('dragging'),
      ondragover: e => e.preventDefault(),
      ondrop: e => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isNaN(from) || from === idx) return;
        const bl = plan.blocks.slice();
        const [m] = bl.splice(from, 1);
        bl.splice(idx, 0, m);
        // חישוב שעות מחדש לפי הסדר החדש
        let cur = plan.blocks[0].start;
        bl.forEach(x => { x.start = cur; cur += x.minutes * MIN; });
        savePlan(bl); refresh();
      }
    });

    row.append(el('div', { style: { textAlign: 'center', minWidth: '52px' } },
      el('div', { class: 'tabular', style: { fontWeight: '700', fontSize: '13px' } }, hhmm(b.start)),
      el('div', { class: 'small muted' }, b.minutes + ' דק\'')
    ));
    row.append(el('div', { class: 'act-main', style: { cursor: it ? 'pointer' : 'default' }, onclick: () => it && openItem(it.id) },
      el('div', { class: 'act-title' }, b.title),
      el('div', { class: 'act-why' }, b.why || '')
    ));

    const meta = el('div', { class: 'act-meta' });
    meta.append(el('button', {
      class: 'btn btn-xs ' + (running ? 'btn-y' : ''),
      onclick: () => {
        if (it) T.startTimer(it.id, it.type === 'knowledge' ? 'learn' : 'work');
        else T.startFree('work');
        refresh();
      }
    }, running ? '● רץ' : 'התחל'));
    meta.append(el('button', {
      class: 'btn btn-xs', title: 'הסר מהיום',
      onclick: () => { savePlan(plan.blocks.filter((_, i) => i !== idx)); refresh(); }
    }, '×'));
    row.append(meta);
    list.append(row);
  });

  const last = plan.blocks[plan.blocks.length - 1];
  card.append(list);
  card.append(el('div', { class: 'small muted', style: { marginTop: '11px' } },
    `סיום מוערך: ${hhmm(last.start + last.minutes * MIN)} · סה"כ ${dur(plan.blocks.reduce((a, b) => a + b.minutes, 0) * MIN)}`));
  return card;
}

/* ================= התקדמות היום ================= */

function todayCard() {
  const av = T.availableToday();
  const rows = T.todayByItem();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'התקדמות היום'),
    el('div', { class: 'right' }, el('button', { class: 'btn btn-xs', onclick: () => go('#/time') }, 'ציר היום'))
  ));

  card.append(el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
    el('div', { class: 'tabular', style: { fontSize: '30px', fontWeight: '900', color: '#ffd400' } },
      av.used ? dur(av.used, true) : '0 שע\''),
    el('div', { class: 'small muted' }, `מתוך ${dur(av.total, true)} זמן זמין`)
  ));
  card.append(el('div', { class: 'bar', style: { marginTop: '8px' } },
    el('i', { style: { width: Math.min(100, av.used / av.total * 100) + '%' } })));

  const list = el('div', { style: { marginTop: '12px' } });
  if (!rows.length) list.append(el('div', { class: 'small muted' }, 'עוד לא נרשם זמן היום'));
  rows.slice(0, 6).forEach(r => {
    const it = r.itemId ? getItem(r.itemId) : null;
    list.append(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0', fontSize: '13px' } },
      el('span', { class: 'dot', style: { background: T.KINDS[r.kind]?.color || '#888' } }),
      el('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        it ? it.title : (r.kind === 'learn' ? 'למידה כללית' : 'עבודה כללית')),
      el('span', { class: 'tabular muted' }, dur(r.ms))
    ));
  });
  card.append(list);

  const waitToday = T.waitMs(null, startOfDay(), Date.now());
  if (waitToday > MIN)
    card.append(el('div', { class: 'small muted', style: { marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(255,255,255,.08)' } },
      `ועוד ${dur(waitToday)} של המתנה — זמן קיר, לא זמן קשב`));
  return card;
}

/* ================= החודש ================= */

function monthCard() {
  const m = monthMoney();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'החודש'),
    el('div', { class: 'right' }, el('button', { class: 'btn btn-xs', onclick: () => go('#/money') }, 'לכסף'))
  ));
  const g = el('div', { class: 'grid g2' },
    miniStat('הכנסות', nis(m.income), '#3ddc84'),
    miniStat('הוצאות', nis(m.expenses), '#ff5a4d'),
    miniStat('נטו', nis(m.profit), m.profit >= 0 ? '#ffd400' : '#ff5a4d'),
    miniStat('נמסרו', String(m.delivered), '#ffffff')
  );
  card.append(g);
  return card;
}

function miniStat(lbl, val, color) {
  return el('div', {},
    el('div', { class: 'small muted' }, lbl),
    el('div', { class: 'tabular', style: { fontSize: '19px', fontWeight: '800', color } }, val)
  );
}

/* ================= מה כדאי ללמוד ================= */

function learnCard() {
  const k = topKnowledge();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'מה כדאי ללמוד עכשיו'),
    el('div', { class: 'right' }, el('button', { class: 'btn btn-xs', onclick: () => go('#/knowledge') }, 'הכל'))
  ));
  if (!k) {
    card.append(el('div', { class: 'small muted' }, 'אין פריטי ידע פתוחים. הדבק לינק בשורת הקלט למעלה והוא ייכנס לכאן.'));
    return card;
  }
  card.append(el('div', { style: { fontWeight: '700', fontSize: '15px' } }, k.item.title));
  card.append(el('div', { class: 'small muted', style: { marginTop: '4px', lineHeight: '1.5' } }, 'נבחר כי ' + k.why + '.'));
  const row = el('div', { style: { display: 'flex', gap: '7px', marginTop: '11px', alignItems: 'center', flexWrap: 'wrap' } },
    el('span', { class: 'pill' }, (k.item.estMinutes || 20) + ' דק\''),
    k.item.url ? el('a', { class: 'btn btn-xs', href: k.item.url, target: '_blank', rel: 'noopener' }, 'פתח לינק') : null,
    el('button', { class: 'btn btn-xs btn-y', onclick: () => { T.startTimer(k.item.id, 'learn'); if (k.item.url) window.open(k.item.url, '_blank', 'noopener'); refresh(); } }, '▶ מתחיל'),
    el('button', { class: 'btn btn-xs', onclick: () => { patchItem(k.item.id, { status: 'done', lastTouched: Date.now() }); toast('סומן כנצפה', 'ok'); refresh(); } }, 'ראיתי')
  );
  card.append(row);
  return card;
}
