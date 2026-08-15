/* ============================================================
   app.js — שלד האפליקציה: ניווט, סרגל הטיימר, הקלט החופשי
   ============================================================ */

import { S, subscribe, update, getItem, backupOverdue, downloadBackup, undo, undoDepth, lastUndoLabel } from './store.js';
import { $, el, toast, hms, dur, modal, closeModal, hhmm, ago, MIN } from './util.js';
import * as T from './timer.js';
import { classify, commit, retype, classifyWithAssistant } from './capture.js';
import { navCounts } from './rules.js';
import { initHelp } from './help.js';
import { rollRoutines } from './brain.js';
import { initPalette, openPalette } from './palette.js';
import * as sampleUI from './sampleui.js';
import * as P from './presence.js';
import * as FW from './floatwin.js';
import * as notify from './notify.js';

import home from './pages/home.js';
import pipeline from './pages/pipeline.js';
import time from './pages/time.js';
import money from './pages/money.js';
import knowledge from './pages/knowledge.js';
import routines from './pages/routines.js';
import tasks from './pages/tasks.js';
import notes from './pages/notes.js';
import tools from './pages/tools.js';
import assistant from './pages/assistant.js';
import settings from './pages/settings.js';

/* ================= עמודים ================= */

const PAGES = {
  '':          { title: 'בית',     icon: '◆',  color: '#ffd400', mod: home },
  'pipeline':  { title: 'צינור',   icon: '▤',  color: '#5aa9ff', mod: pipeline, badge: 'pipeline' },
  'time':      { title: 'זמן',     icon: '◷',  color: '#b98cff', mod: time },
  'money':     { title: 'כסף',     icon: '₪',  color: '#3ddc84', mod: money, badge: 'money' },
  'knowledge': { title: 'ידע',     icon: '❐',  color: '#ff9f43', mod: knowledge, badge: 'knowledge' },
  'routines':  { title: 'שגרה',    icon: '↻',  color: '#2dd4bf', mod: routines, badge: 'routines' },
  'tasks':     { title: 'משימות',  icon: '✓',  color: '#ff6b9d', mod: tasks, badge: 'tasks' },
  'notes':     { title: 'פנקס',    icon: '🗒', color: '#a3e635', mod: notes, badge: 'notes' },
  'tools':     { title: 'כלים',    icon: '⚙',  color: '#94a3b8', mod: tools },
  'assistant': { title: 'עוזר',    icon: '✦',  color: '#e879f9', mod: assistant },
  'settings':  { title: 'הגדרות',  icon: '⚙︎', color: '#94a3b8', mod: settings }
};
// #/decisions → עמוד המשימות עם הפילטר הנכון
const ALIAS = { 'decisions': 'tasks?f=decision', 'ideas': 'tasks?f=idea' };

let current = null;

function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  let [path, qs] = h.split('?');
  if (ALIAS[path]) { const a = ALIAS[path].split('?'); path = a[0]; qs = a[1]; }
  if (!(path in PAGES)) path = '';
  const params = {};
  new URLSearchParams(qs || '').forEach((v, k) => params[k] = v);
  return { path, params };
}

function renderPage() {
  const { path, params } = parseHash();
  const page = PAGES[path];
  const view = $('#view');
  view.innerHTML = '';
  current = { path, params, page };
  try {
    page.mod.render(view, params);
  } catch (e) {
    console.error(e);
    view.append(el('div', { class: 'card' },
      el('h2', {}, 'משהו נשבר בעמוד הזה'),
      el('div', { class: 'muted small', style: { marginTop: '8px' } }, String(e && e.message || e)),
      el('div', { style: { marginTop: '12px' } },
        el('button', { class: 'btn', onclick: () => location.reload() }, 'רענון'))
    ));
  }
  document.body.dataset.mod = path;      // צובע את העמוד לפי המודול
  baseTitle = (path ? PAGES[path].title + ' · ' : '') + 'פרונט';
  tabTitle();
  buildNav();
  window.scrollTo(0, 0);
  $('#nav').classList.remove('open');
}

export function refresh() {
  if (!current) return;
  const view = $('#view');
  const y = window.scrollY;
  view.innerHTML = '';
  try { current.page.mod.render(view, current.params); } catch (e) { console.error(e); }
  window.scrollTo(0, y);
  buildNav();
}

export const go = href => { location.hash = href.replace(/^#/, ''); };

/* ================= ניווט ================= */

function buildNav() {
  const box = $('#navlinks');
  const counts = navCounts();
  const { path } = parseHash();
  box.innerHTML = '';
  Object.entries(PAGES).forEach(([key, p]) => {
    const n = counts[p.badge] || 0;
    box.append(el('button', {
      class: 'nav-link' + (key === path ? ' active' : ''),
      'data-tip': 'nav.' + key,
      onclick: () => go('#/' + key)
    },
      el('span', { class: 'nd', style: { background: p.color } }),
      el('span', { class: 'ni' }, p.icon),
      el('span', {}, p.title),
      p.badge && n ? el('span', { class: 'badge' }, String(n)) : null
    ));
  });

  syncUndoBtn();

  const hint = $('#backup-hint');
  const last = S().settings.lastBackupAt;
  hint.textContent = backupOverdue()
    ? '⚠︎ הגיע הזמן לגבות'
    : last ? 'גובה לפני ' + ago(last) : 'עוד לא גיבית';
  hint.style.color = backupOverdue() ? '#ffd400' : '';
}

/* ================= סרגל הטיימר ================= */

function renderTimerBar() {
  const bar = $('#timerbar');
  const t = T.activeTimer();
  const waiting = S().waiting;
  bar.innerHTML = '';

  if (!t && !waiting.length) {
    bar.className = 'timerbar idle';
    bar.append(
      el('span', { class: 'tb-dot' }),
      el('span', { class: 'muted small' }, 'שום טיימר לא רץ'),
      el('div', { class: 'tb-actions' },
        el('button', { class: 'btn btn-xs', onclick: openSwitcher }, 'התחל טיימר'),
        el('button', { class: 'btn btn-xs', onclick: () => { T.startFree('learn'); toast('טיימר למידה רץ'); } }, '📚 למידה'),
        el('button', {
          class: 'btn btn-xs', 'data-tip': 'time.break',
          onclick: () => { T.startFree('off'); toast('בהפסקה'); }
        }, '☕ הפסקה')
      )
    );
    return;
  }

  if (t) {
    const it = t.itemId ? getItem(t.itemId) : null;
    const auto = !!t.autoFrom;
    bar.className = 'timerbar ' + (t.kind === 'off' ? 'off' : t.kind === 'wait' ? 'waiting' : 'running');
    bar.append(
      el('span', { class: 'tb-dot' }),
      el('span', { class: 'tb-title' },
        t.kind === 'off' ? 'הפסקה — לא נספר'
          : it ? it.title
            : (t.kind === 'learn' ? 'למידה חופשית' : 'עבודה כללית')),
      el('span', { class: 'tb-time', id: 'tb-clock' }, hms(T.elapsed())),
      el('span', {
        class: 'tb-kind',
        'data-tip': auto ? 'הטיימר עבר להמתנה לבד כי לא היה מגע. יחזור לעבודה ברגע שתיגע במשהו.' : null
      }, auto ? 'המתנה · אוטומטי' : (T.KINDS[t.kind]?.name || t.kind))
    );
    const actions = el('div', { class: 'tb-actions' },
      auto || T.canClaimAutoWait() ? el('button', {
        class: 'btn btn-xs btn-y', 'data-keep-wait': true,
        'data-tip': 'מחזיר את זמן ההמתנה לזמן קשב, כאילו לא זוהתה המתנה',
        onclick: () => {
          if (T.claimAutoWait()) { toast('הוחזר לעבודה', 'ok'); refresh(); }
          else toast('חלון הזמן לתיקון עבר', 'err');
        }
      }, 'זו הייתה עבודה') : null,
      el('button', { class: 'btn btn-xs', onclick: openSwitcher }, 'החלף'),
      t.itemId && !auto ? el('button', {
        class: 'btn btn-xs',
        onclick: () => { T.startWaiting(t.itemId); toast('הפריט בהמתנה — זמן הקיר ממשיך לרוץ'); }
      }, 'ממתין') : null,
      t.kind !== 'off' ? el('button', {
        class: 'btn btn-xs', 'data-tip': 'time.break',
        onclick: () => { T.startFree('off'); toast('בהפסקה — לא נספר בתמחור'); }
      }, '☕ הפסקה') : null,
      el('button', { class: 'btn btn-xs', onclick: () => { T.stopTimer(); toast('נעצר ונרשם'); } }, 'עצור')
    );
    bar.append(actions);
  } else {
    bar.className = 'timerbar waiting';
    const w = waiting[0];
    const it = getItem(w.itemId);
    bar.append(
      el('span', { class: 'tb-dot' }),
      el('span', { class: 'tb-title' }, (it ? it.title : 'פריט') + ' — בהמתנה'),
      el('span', { class: 'tb-time', id: 'tb-clock' }, hms(Date.now() - w.since)),
      el('span', { class: 'tb-kind' }, 'זמן קיר')
    );
    bar.append(el('div', { class: 'tb-actions' },
      waiting.length > 1 ? el('span', { class: 'pill pill-b' }, `+${waiting.length - 1} בהמתנה`) : null,
      el('button', { class: 'btn btn-xs btn-y', onclick: () => { T.startTimer(w.itemId); } }, 'חזרתי לזה'),
      el('button', { class: 'btn btn-xs', onclick: openSwitcher }, 'משהו אחר')
    ));
  }

  if (waiting.length && t) {
    bar.querySelector('.tb-actions').prepend(
      el('span', { class: 'pill pill-b', style: { marginInlineEnd: '6px' } }, `${waiting.length} בהמתנה`)
    );
  }
}

function tickClock() {
  const c = $('#tb-clock');
  if (c) {
    const t = T.activeTimer();
    if (t) c.textContent = hms(T.elapsed());
    else if (S().waiting[0]) c.textContent = hms(Date.now() - S().waiting[0].since);
  }
  const clock = $('#clock');
  if (clock) clock.textContent = hhmm(Date.now());
  if (current && current.page.mod.tick) { try { current.page.mod.tick(); } catch (e) { } }
  tabTitle();
}

/* ---------- הטיימר בכותרת הטאב ----------
   הרגע שבו שוכחים לעצור הוא הרגע שבו אתה בטאב אחר. שם הטאב הוא המקום
   היחיד שממשיך להיות גלוי גם אז. */
let baseTitle = 'פרונט';

function tabTitle() {
  const t = T.activeTimer();
  const w = S().waiting[0];
  let prefix = '';
  if (t && t.kind === 'off') {
    prefix = `☕ הפסקה — `;
  } else if (t) {
    const it = t.itemId ? getItem(t.itemId) : null;
    prefix = `⏱ ${hms(T.elapsed()).replace(/^00:/, '')} · ${it ? shortT(it.title) : T.KINDS[t.kind]?.name || 'עבודה'} — `;
  } else if (w) {
    const it = getItem(w.itemId);
    prefix = `⏸ ${it ? shortT(it.title) : 'ממתין'} — `;
  }
  const next = prefix + baseTitle;
  if (document.title !== next) document.title = next;
}

const shortT = s => (s || '').length > 18 ? s.slice(0, 17) + '…' : (s || '');

/* ---------- מחליף מהיר: לחיצה אחת ומחליפים ---------- */
export function openSwitcher() {
  const s = S();
  const cands = [
    ...s.items.filter(i => i.type === 'client' && !i.archived && !i.deliveredAt),
    ...s.items.filter(i => i.type === 'bucket' && !i.archived),
    ...s.items.filter(i => i.type === 'task' && !i.archived && !i.done).slice(0, 8),
    ...s.items.filter(i => i.type === 'knowledge' && !i.archived && i.status !== 'done').slice(0, 5)
  ];
  const box = el('div', {});
  const list = el('div', { class: 'actionlist', style: { maxHeight: '46vh', overflowY: 'auto' } });

  const draw = filter => {
    list.innerHTML = '';
    const f = filter.trim().toLowerCase();
    const shown = cands.filter(c => !f || (c.title + ' ' + (c.business || '')).toLowerCase().includes(f));
    if (!shown.length) list.append(el('div', { class: 'empty' }, 'אין התאמה'));
    shown.slice(0, 30).forEach(c => {
      list.append(el('div', {
        class: 'act', style: { cursor: 'pointer' },
        onclick: () => {
          T.startTimer(c.id, c.type === 'knowledge' ? 'learn' : 'work');
          closeModal(); toast('הטיימר עבר ל' + c.title, 'ok');
        }
      },
        el('span', { class: 'act-rank' },
          c.type === 'client' ? '👤' : c.type === 'knowledge' ? '📚' : c.type === 'bucket' ? '◈' : '✓'),
        el('div', { class: 'act-main' },
          el('div', { class: 'act-title' }, c.title),
          el('div', { class: 'act-why' },
            c.business || c.note || T.KINDS[c.type === 'knowledge' ? 'learn' : 'work'].name)
        ),
        T.isWaiting(c.id) ? el('span', { class: 'pill pill-b' }, 'בהמתנה') : null
      ));
    });
  };

  const search = el('input', {
    class: 'inp', placeholder: 'חיפוש…', style: { marginBottom: '10px' },
    oninput: e => draw(e.target.value)
  });
  box.append(search, list, el('div', { class: 'hr' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => { T.startFree('learn'); closeModal(); } }, '📚 למידה כללית'),
      el('button', {
        class: 'btn', 'data-tip': 'לא עבודה — פייסבוק, קפה, חיים. נרשם, ולא נספר בתמחור.',
        onclick: () => { T.startFree('off'); closeModal(); toast('בהפסקה'); }
      }, '☕ הפסקה'),
      el('button', { class: 'btn', onclick: () => { T.stopTimer(); closeModal(); } }, '■ עצור הכל')
    ));
  draw('');
  modal({ title: 'על מה אתה עובד?', body: box });
}

/* ================= פס הודעות עליון =================
   כל מה שדורש תשובה קצרה יושב כאן, לא בחלון חוסם. אתה באמצע משהו. */

function banner(cls, build) {
  const box = $('#capture-feedback');
  box.innerHTML = '';
  const row = el('div', { class: 'cf ' + cls });
  build(row, () => { if (box.firstChild === row) box.innerHTML = ''; });
  row.append(el('button', { class: 'cf-x', onclick: () => box.innerHTML = '' }, '×'));
  box.append(row);
  return row;
}

/* ---------- החזרה לטאב: פס במקום חלון ---------- */

function askAbsence(p) {
  const gap = p.to - p.from;
  const s = S();
  const hadItem = p.hadTimer && p.hadTimer.itemId ? getItem(p.hadTimer.itemId) : null;

  banner(gap > 30 * MIN ? 'cf-warn' : '', (row, close) => {
    row.append(el('span', { style: { fontWeight: '600' } },
      `היית ${dur(gap)} בחוץ — ${hhmm(p.from)} עד ${hhmm(p.to)}.`));
    row.append(el('span', { class: 'muted small' }, 'על מה?'));

    const pick = (label, choice, cls) => row.append(el('button', {
      class: 'btn btn-xs ' + (cls || ''),
      onclick: () => { T.resolveAbsence(choice); close(); refresh(); }
    }, label));

    if (hadItem) pick(hadItem.title.slice(0, 18), { itemId: hadItem.id, kind: 'work' }, 'btn-y');
    pick('המתנה', { itemId: hadItem ? hadItem.id : null, kind: 'wait', resume: false });
    pick('למידה', { kind: 'learn' });
    pick('לא עבדתי', { kind: 'off', resume: false });

    row.append(el('button', {
      class: 'btn btn-xs', 'data-tip': 'פותח רשימה מלאה של לקוחות ומשימות',
      onclick: () => { close(); absenceModal(p); }
    }, 'משהו אחר…'));
  });
}

/** הרשימה המלאה — רק כשהפס לא הספיק */
function absenceModal(p) {
  const s = S();
  const box = el('div', {});
  box.append(el('div', { class: 'muted', style: { marginBottom: '14px' } },
    `בין ${hhmm(p.from)} ל-${hhmm(p.to)}. לחיצה אחת מסווגת את כל הפרק.`));

  const grid = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } });
  const opt = (label, sub, onclick, cls) => grid.append(el('button', {
    class: 'btn ' + (cls || ''), style: { textAlign: 'right', padding: '11px 14px' }, onclick
  },
    el('div', { style: { fontWeight: '600' } }, label),
    sub ? el('div', { class: 'small muted' }, sub) : null
  ));

  const others = [
    ...s.items.filter(i => i.type === 'client' && !i.archived && !i.deliveredAt),
    ...s.items.filter(i => i.type === 'task' && !i.archived && !i.done).slice(0, 6)
  ].slice(0, 10);

  others.forEach(i => opt(i.title, i.business || 'עבודה',
    () => { T.resolveAbsence({ itemId: i.id, kind: 'work' }); closeModal(); refresh(); }));
  opt('למידה', 'קראתי, צפיתי, התעדכנתי', () => { T.resolveAbsence({ kind: 'learn' }); closeModal(); refresh(); });
  opt('לא עבדתי', 'הפרק הזה לא נרשם כזמן קשב', () => { T.resolveAbsence({ kind: 'off', resume: false }); closeModal(); refresh(); });

  box.append(grid);
  modal({
    title: `היית ${dur(p.to - p.from)} בחוץ. על מה?`, body: box,
    actions: [{ label: 'אחר כך', onClick: () => T.dismissAbsence() }]
  });
}

/* ---------- זיהוי המתנה אוטומטי ---------- */

function initAutoWaitUI() {
  window.addEventListener('front:auto-wait', e => {
    const it = e.detail.itemId ? getItem(e.detail.itemId) : null;
    const mins = Math.round((Date.now() - e.detail.since) / MIN);
    banner('cf-wait', (row, close) => {
      row.append(el('span', { style: { fontWeight: '600' } }, '⏸ עברתי להמתנה'));
      row.append(el('span', { class: 'small muted' },
        `${mins} דקות בלי מגע${it ? ' · ' + it.title : ''}. הזמן הזה לא נספר כזמן קשב. ` +
        'ברגע שתיגע במשהו זה יחזור לעבודה לבד.'));
      row.append(el('button', {
        class: 'btn btn-xs', 'data-keep-wait': true,
        'data-tip': 'מחזיר את הזמן הזה לזמן קשב, כאילו לא זוהתה המתנה',
        onclick: () => {
          if (T.claimAutoWait()) { close(); toast('הוחזר לעבודה', 'ok'); refresh(); }
          else toast('חלון הזמן לתיקון עבר', 'err');
        }
      }, 'זו הייתה עבודה'));
    });
    renderTimerBar();
  });

  window.addEventListener('front:auto-resume', () => {
    const box = $('#capture-feedback');
    if (box.querySelector('.cf-wait')) box.innerHTML = '';
    renderTimerBar();
    refresh();
  });
}

/* ================= הקלט החופשי ================= */

function showFeedback(result, item) {
  const box = $('#capture-feedback');
  box.innerHTML = '';
  if (!result) return;

  const row = el('div', { class: 'cf' });
  row.append(el('span', { style: { color: '#ffd400', fontWeight: '600' } }, '✓ ' + result.label));

  if (item && result.type !== 'client-update') {
    row.append(el('span', { class: 'muted small' }, '·'));
    row.append(el('span', { class: 'small muted', style: { maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.title));

    const types = S().itemTypes.filter(t => t.id !== result.type && t.id !== 'client');
    const sel = el('select', { class: 'inp', style: { width: 'auto', padding: '3px 8px', fontSize: '12px' } },
      el('option', { value: '' }, 'שנה סוג…'),
      ...types.map(t => el('option', { value: t.id }, t.icon + ' ' + t.name))
    );
    sel.addEventListener('change', e => {
      if (!e.target.value) return;
      retype(item, e.target.value);
      toast('הסוג שונה', 'ok');
      box.innerHTML = '';
      refresh();
    });
    row.append(sel);
    row.append(el('button', { class: 'btn btn-xs', onclick: () => { openItem(item.id); } }, 'פתח'));
    if (item.preview && item.preview.title && !item.preview.failed)
      row.append(el('span', { class: 'small', style: { color: 'var(--accent)' } },
        '✦ ' + item.preview.title.slice(0, 40)));
  }

  row.append(el('button', { class: 'cf-x', onclick: () => box.innerHTML = '' }, '×'));
  box.append(row);
  clearTimeout(showFeedback._t);
  showFeedback._t = setTimeout(() => { if (box.firstChild === row) box.innerHTML = ''; }, 14000);
}

async function doCapture() {
  const inp = $('#capture');
  const text = inp.value.trim();
  if (!text) return;
  const guess = classify(text);
  const item = commit(guess);
  inp.value = '';
  showFeedback(guess, item);
  refresh();

  // לינק? מושכים תצוגה מקדימה ברקע ומרעננים כשהיא מגיעה
  if (item && item.url) {
    import('./linkpreview.js')
      .then(LP => LP.fetchPreview(item.id))
      .then(p => { if (p && !p.failed) { showFeedback(guess, getItem(item.id)); refresh(); } })
      .catch(() => { });
  }

  // דיוק ברקע דרך העוזר — רק אם מופעל, ורק אם זה לא עדכון ללקוח
  if (S().settings.assistantEnabled && S().settings.assistantClassify &&
      guess.type !== 'client-update' && guess.type !== 'note' && item) {
    const better = await classifyWithAssistant(text, guess);
    if (better && better.type !== guess.type) {
      retype(item, better.type);
      showFeedback({ type: better.type, label: better.label + ' (העוזר דייק)' }, getItem(item.id));
      refresh();
    }
  }
}

/* ================= ביטול פעולה ================= */

const inField = t => !!(t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]'));

/** כפתור הביטול מתעדכן בכל שינוי מצב, לא רק ברינדור עמוד */
function syncUndoBtn() {
  const u = $('#nav-undo');
  if (!u) return;
  const label = lastUndoLabel();
  u.hidden = !label;
  if (label) u.textContent = '↶ בטל: ' + (label.length > 22 ? label.slice(0, 21) + '…' : label);
}

export function doUndo() {
  const label = undo();
  if (!label) { toast('אין מה לבטל', 'err'); return; }
  closeModal();
  toast('בוטל: ' + label, 'ok');
  refresh();
  renderTimerBar();
}

/** נפתח מכל מקום — כרטיס הפריט. פתק נפתח בעורך הפנקס. */
export function openItem(id) {
  const it = getItem(id);
  if (it && it.type === 'note') { import('./pages/notes.js').then(m => m.openNote(id)); return; }
  import('./pages/item.js').then(m => m.openItem(id));
}

/* ================= אתחול ================= */

function init() {
  // ניווט
  window.addEventListener('hashchange', renderPage);
  $('#menu-toggle').addEventListener('click', () => $('#nav').classList.toggle('open'));
  $('#nav-undo').setAttribute('data-tip', 'gen.undo');
  $('#nav-undo').addEventListener('click', doUndo);
  $('#nav-export').addEventListener('click', () => {
    const n = downloadBackup();
    toast('ירד הקובץ ' + n, 'ok');
    buildNav();
  });

  // קלט חופשי
  $('#capture').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doCapture(); }
  });
  $('#capture-go').addEventListener('click', doCapture);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); $('#capture').focus(); $('#capture').select();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
      e.preventDefault(); openSwitcher();
    }
    // ביטול פעולה — רק כשלא עומדים בתוך שדה טקסט, שם Ctrl+Z שייך לדפדפן
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !inField(e.target)) {
      e.preventDefault(); doUndo();
    }
  });

  // מצב
  subscribe(() => { renderTimerBar(); syncUndoBtn(); });
  T.onTick(() => { renderTimerBar(); refresh(); });

  // נוכחות והתראות
  initHelp();
  $('#capture').setAttribute('data-tip', 'gen.capture');
  $('#nav-export').setAttribute('data-tip', 'gen.export');

  // חלון צף מעל שאר התוכנות
  const fbtn = $('#float-open');
  if (FW.supported()) {
    fbtn.hidden = false;
    fbtn.setAttribute('data-tip', 'time.floatWin');
    fbtn.addEventListener('click', async () => {
      try {
        if (FW.isOpen()) { FW.close(); toast('החלון הצף נסגר'); }
        else { await FW.open(); toast('החלון הצף פתוח — הוא צף מעל כל תוכנה', 'ok'); }
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  // זיהוי נוכחות — מתחיל לבד אם כבר אושר פעם
  P.start().then(ok => { if (ok) P.onChange(() => { renderTimerBar(); }); });

  $('#search-open').setAttribute('data-tip', 'notes.globalSearch');
  $('#search-open').addEventListener('click', () => openPalette());
  initPalette();

  initAutoWaitUI();
  T.initPresence(askAbsence);
  sampleUI.init(() => { renderTimerBar(); refresh(); });
  rollRoutines();
  notify.start();

  // שער דולר יומי — משפיע ישירות על עלות המנויים
  import('./money.js').then(MO => MO.refreshUsdRate()).then(r => {
    if (r && r.changed) { toast(`שער הדולר עודכן ל-${r.rate}`, 'ok'); refresh(); }
  }).catch(() => { });

  // שעון
  setInterval(tickClock, 1000);

  renderTimerBar();
  renderPage();
  tickClock();

  // תצוגות מקדימות לקישורים שעוד אין להם — ברקע, בלי לחסום
  setTimeout(() => import('./linkpreview.js').then(LP => LP.backfill({ limit: 3 })).catch(() => { }), 4000);

  // גיבוי אוטומטי לתיקייה, ואם אין — תזכורת
  import('./autobackup.js').then(async AB => {
    const name = await AB.maybeBackup();
    if (name) { toast('גיבוי אוטומטי נכתב · ' + name, 'ok'); buildNav(); return; }
    if (backupOverdue()) {
      const st = await AB.status();
      setTimeout(() => toast(st === 'prompt'
        ? 'הגיבוי האוטומטי מנותק — כנס להגדרות ולחץ "חבר מחדש"'
        : 'לא גיבית כבר כמה ימים — כדאי לייצא JSON', 'err'), 2500);
    }
  }).catch(() => {
    if (backupOverdue()) setTimeout(() => toast('לא גיבית כבר כמה ימים — כדאי לייצא JSON', 'err'), 2500);
  });

  window.addEventListener('front:storage-full', () =>
    toast('האחסון בדפדפן מלא. ייצא גיבוי ומחק פריטים ישנים.', 'err'));

  // המערכת פתוחה בטאב נוסף ומשהו השתנה שם
  window.addEventListener('front:external-change', e => {
    refresh();
    renderTimerBar();
    toast(e.detail && e.detail.hadPending
      ? 'עדכנת בטאב אחר — משכתי את השינוי לכאן. השינוי האחרון בטאב הזה בוטל.'
      : 'עודכן מטאב אחר של המערכת', e.detail && e.detail.hadPending ? 'err' : 'ok');
  });

  // אם יש היעדרות פתוחה מהפעם הקודמת
  const p = S().pendingAbsence;
  if (p && Date.now() - p.to < 12 * 3600000) setTimeout(() => askAbsence(p), 800);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.FRONT = { S, go, refresh, openItem, openSwitcher };
