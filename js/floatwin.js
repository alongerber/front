/* ============================================================
   floatwin.js — החלון הצף
   ------------------------------------------------------------
   Document Picture-in-Picture: חלון קטן שצף מעל כל התוכנות, גם
   מעל וגאס במסך מלא. בתוכו הטיימר הנוכחי וכפתורי החלפה.

   זה פותר את "אני לא אזכור לעדכן" בדרך הנכונה — לא בכך שתזכור,
   אלא בכך שזה מול העיניים ועולה לחיצה אחת בלי לעזוב את התוכנה.

   כרום ואדג' 116+. במקום אחר הכפתור לא מוצג.
   ============================================================ */

import { S, subscribe, getItem } from './store.js';
import { hms, dur, HOUR } from './util.js';
import * as T from './timer.js';
import * as P from './presence.js';

export const supported = () => 'documentPictureInPicture' in window;

let win = null;
let tickTimer = null;
let unsub = null;

export const isOpen = () => !!(win && !win.closed);

/** חייב לרוץ מתוך לחיצה של המשתמש */
export async function open() {
  if (!supported()) throw new Error('הדפדפן הזה לא תומך בחלון צף. נסה כרום או אדג\'.');
  if (isOpen()) { win.focus(); return win; }

  win = await documentPictureInPicture.requestWindow({ width: 330, height: 340 });
  win.document.documentElement.lang = 'he';
  win.document.documentElement.dir = 'rtl';
  win.document.head.append(styleTag(win.document));
  win.document.body.className = 'fw';

  render();
  clearInterval(tickTimer);
  tickTimer = setInterval(tickOnly, 1000);
  unsub = subscribe(render);
  T.onTick(render);

  win.addEventListener('pagehide', close);

  // 1-9 מחליף פרויקט בלי לגעת בעכבר, 0 = הפסקה
  win.addEventListener('keydown', ev => {
    if (ev.key === '0') { T.startFree('off'); render(); return; }
    // רווח משהה וממשיך — הקיצור שהכי הרבה פעמים ביום
    if (ev.key === ' ' || ev.key === 'p') {
      ev.preventDefault();
      if (T.activeTimer()) T.pauseTimer(); else T.resumePaused();
      render(); return;
    }
    const n = parseInt(ev.key, 10);
    if (!n || n < 1 || n > 9) return;
    const btns = win.document.querySelectorAll('.fw-btn');
    if (btns[n - 1]) btns[n - 1].click();
  });

  return win;
}

export function close() {
  clearInterval(tickTimer); tickTimer = null;
  if (unsub) { unsub(); unsub = null; }
  if (win && !win.closed) { try { win.close(); } catch { /* כבר נסגר */ } }
  win = null;
}

export function toggle() { return isOpen() ? (close(), false) : (open(), true); }

/* ---------- תוכן ---------- */

function e(doc, tag, attrs = {}, ...kids) {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') n.addEventListener('click', v);
    else if (k === 'style') Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  kids.filter(x => x != null).forEach(c => n.append(c.nodeType ? c : doc.createTextNode(String(c))));
  return n;
}

function tickOnly() {
  if (!isOpen()) { close(); return; }
  const c = win.document.getElementById('fw-clock');
  const t = T.activeTimer();
  if (c && t) c.textContent = hms(T.KINDS[t.kind]?.focus ? T.currentTodayMs() : T.elapsed());
  const r = win.document.getElementById('fw-run');
  if (r && t) r.textContent = 'ברצף ' + dur(T.elapsed(), true);
}

function render() {
  if (!isOpen()) return;
  const doc = win.document;
  const t = T.activeTimer();
  const it = t && t.itemId ? getItem(t.itemId) : null;
  const auto = !!(t && t.autoFrom);
  const away = P.running() && !P.isActiveNow();

  doc.body.innerHTML = '';

  /* השורה העליונה — מה רץ עכשיו.
     השעון מראה את הסך שנצבר היום על הפריט, לא את הרצף הנוכחי,
     כדי שמעבר ליעקב וחזרה ליוסי לא ייראו כאיפוס. */
  const paused = T.pausedInfo();
  const pIt = !t && paused && paused.itemId ? getItem(paused.itemId) : null;
  const state = !t ? (paused ? 'pause' : 'idle') : t.kind === 'off' ? 'off' : (t.kind === 'wait' || away) ? 'wait' : 'run';
  const focus = !!(t && T.KINDS[t.kind]?.focus);
  const bigMs = t ? (focus ? T.currentTodayMs() : T.elapsed())
    : paused ? (paused.itemId ? T.itemTodayMs(paused.itemId) : T.itemTodayMs(null, paused.kind)) : 0;
  const run = T.elapsed();

  doc.body.append(e(doc, 'div', { class: 'fw-now ' + state },
    e(doc, 'span', { class: 'fw-dot' }),
    e(doc, 'div', { class: 'fw-main' },
      e(doc, 'div', { class: 'fw-title' },
        !t ? (pIt ? pIt.title : paused ? (T.KINDS[paused.kind]?.name || 'עבודה') : 'שום דבר לא רץ')
          : t.kind === 'off' ? 'הפסקה'
            : (it ? it.title : (T.KINDS[t.kind]?.name || 'עבודה'))),
      e(doc, 'div', { class: 'fw-sub' },
        !t ? (paused ? 'מושהה · הזמן נשמר' : 'לחץ על לקוח או תחום למטה')
          : t.kind === 'off' ? 'לא נספר כזמן עבודה'
            : away ? 'לא ליד המחשב — לא נספר'
              : auto ? 'המתנה שזוהתה לבד'
                : focus && run > 30000 && bigMs - run > 30000
                  ? e(doc, 'span', { id: 'fw-run' }, 'ברצף ' + dur(run, true))
                  : (T.KINDS[t.kind]?.name || ''))),
    e(doc, 'div', { class: 'fw-clock', id: 'fw-clock' }, (t || paused) ? hms(bigMs) : '—')
  ));

  /* כפתורי החלפה — לקוחות פעילים, ואחריהם דליי העסק */
  const s = S();
  const clients = s.items
    .filter(i => i.type === 'client' && !i.archived && !i.deliveredAt)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 6);
  const bucketList = s.items.filter(i => i.type === 'bucket' && !i.archived);

  const grid = e(doc, 'div', { class: 'fw-grid' });
  const cell = (item, cls, key) => {
    const on = t && t.itemId === item.id && t.kind !== 'wait';
    const todayMs = T.focusMs(item.id, startOfToday(), Date.now());
    grid.append(e(doc, 'button', {
      class: 'fw-btn ' + (cls || '') + (on ? ' on' : ''),
      title: (item.business || item.note || item.title) + (key ? ` · מקש ${key}` : ''),
      onclick: () => { T.startTimer(item.id); render(); }
    },
      key ? e(doc, 'span', { class: 'fw-key' }, key) : null,
      e(doc, 'span', { class: 'fw-btn-t' }, item.title),
      e(doc, 'span', { class: 'fw-btn-n' }, todayMs > 30000 ? dur(todayMs, true) : '—')
    ));
  };
  let idx = 0;
  const num = () => ++idx <= 9 ? String(idx) : '';
  clients.forEach(c => cell(c, '', num()));
  bucketList.forEach(bk => cell(bk, 'biz', num()));
  grid.append(e(doc, 'button', {
    class: 'fw-btn learn' + (t && !t.itemId && t.kind === 'learn' ? ' on' : ''),
    onclick: () => { T.startFree('learn'); render(); }
  }, e(doc, 'span', { class: 'fw-btn-t' }, '📚 למידה')));
  doc.body.append(grid);

  /* סיכום היום — למי שמחליף בין ארבעה דברים כל כמה דקות,
     זה המספר שהוא בעצם רוצה לראות */
  const today = T.todayByItem();
  const totalToday = today.reduce((a, x) => a + x.ms, 0);
  if (totalToday > 60000) {
    const top = today.slice(0, 3).map(x => {
      const it2 = x.itemId ? getItem(x.itemId) : null;
      return (it2 ? shortName(it2.title) : (T.KINDS[x.kind]?.name || '')) + ' ' + dur(x.ms, true);
    }).join(' · ');
    doc.body.append(e(doc, 'div', { class: 'fw-today' },
      e(doc, 'span', { class: 'fw-today-t' }, 'היום ' + dur(totalToday, true)),
      e(doc, 'span', { class: 'fw-today-s' }, top)));
  }

  /* סוג הזמן — לחיצה אחת מסמנת שהחצי שעה הזו הייתה פגישה או סבב תיקונים,
     בלי לעצור כלום. אלה המספרים שמפתיעים בסוף החודש. */
  if (focus) {
    const kr = e(doc, 'div', { class: 'fw-kinds' });
    T.SWITCHABLE.forEach(k => {
      const K = T.KINDS[k];
      kr.append(e(doc, 'button', {
        class: 'fw-kind' + (t.kind === k ? ' on' : ''),
        title: 'סמן כ' + K.name,
        onclick: () => { T.setKind(k); render(); }
      }, K.icon + ' ' + K.name));
    });
    doc.body.append(kr);
  }

  /* שורת פעולות — "הפסקה" קודם, כי זו הלחיצה שסוגרת את החור */
  const onBreak = t && t.kind === 'off';
  doc.body.append(e(doc, 'div', { class: 'fw-row' },
    e(doc, 'button', {
      class: 'fw-mini pause' + (onBreak ? ' on' : ''),
      title: 'לא עבודה — פייסבוק, קפה, חיים. נרשם ולא נספר בתמחור.',
      onclick: () => { T.startFree('off'); render(); }
    }, onBreak ? '☕ בהפסקה' : '☕ הפסקה'),
    t
      ? e(doc, 'button', {
        class: 'fw-mini', title: 'עוצר בלי לשכוח — חזרה תמשיך מאותו מספר',
        onclick: () => { T.pauseTimer(); render(); }
      }, '⏸ השהה')
      : e(doc, 'button', {
        class: 'fw-mini' + (paused ? ' go' : ''),
        title: paused ? 'חזרה למה שהושהה' : 'אין מה להמשיך',
        onclick: () => { if (T.resumePaused()) render(); }
      }, '▶ המשך'),
    e(doc, 'button', {
      class: 'fw-mini', title: 'עוצר ורושם. להשהיה יש כפתור נפרד.',
      onclick: () => { T.stopTimer(); T.clearPaused(); render(); }
    }, '■ עצור'),
    t ? e(doc, 'button', {
      class: 'fw-mini del', title: 'טעיתי — אל תרשום את הזמן הזה בכלל',
      onclick: () => { T.discardTimer(); render(); }
    }, '🗑') : null,
    e(doc, 'button', {
      class: 'fw-mini', onclick: () => { window.focus(); }
    }, '↗')
  ));
}

const shortName = s2 => (s2 || '').length > 10 ? s2.slice(0, 9) + '…' : (s2 || '');

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

/* ---------- עיצוב ---------- */

function styleTag(doc) {
  const st = doc.createElement('style');
  st.textContent = `
    *{box-sizing:border-box;margin:0}
    body.fw{
      background:#0a0a09;color:rgba(255,255,255,.96);
      font-family:'Heebo',system-ui,-apple-system,'Segoe UI',sans-serif;
      font-size:13px;padding:9px;display:flex;flex-direction:column;gap:7px;
      user-select:none;
    }
    .fw-now{
      display:flex;align-items:center;gap:8px;background:#131312;
      border:1px solid rgba(255,255,255,.10);border-radius:11px;padding:8px 10px;
    }
    .fw-now.run{background:linear-gradient(90deg,rgba(255,212,0,.14),rgba(255,212,0,.03))}
    .fw-now.wait{background:linear-gradient(90deg,rgba(90,169,255,.14),rgba(90,169,255,.03))}
    .fw-dot{width:8px;height:8px;border-radius:50%;background:#ffd400;flex:0 0 auto}
    .fw-now.wait .fw-dot{background:#5aa9ff}
    .fw-now.idle .fw-dot{background:rgba(255,255,255,.2)}
    .fw-now.off{background:linear-gradient(90deg,rgba(255,255,255,.07),transparent)}
    .fw-now.off .fw-dot{background:rgba(255,255,255,.3)}
    .fw-now.off .fw-clock{color:rgba(255,255,255,.45)}
    .fw-now.run .fw-dot{animation:fwp 1.6s infinite}
    @keyframes fwp{0%,100%{opacity:1}50%{opacity:.35}}
    .fw-main{flex:1;min-width:0}
    .fw-title{font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fw-sub{font-size:10.5px;color:rgba(255,255,255,.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fw-clock{font-variant-numeric:tabular-nums;font-weight:800;color:#ffd400;font-size:15px;flex:0 0 auto}
    .fw-now.wait .fw-clock{color:#5aa9ff}

    .fw-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;flex:1;min-height:0;overflow-y:auto}
    .fw-btn{
      display:flex;flex-direction:column;align-items:flex-start;gap:1px;
      background:#1a1a18;border:1px solid rgba(255,255,255,.12);border-radius:9px;
      padding:6px 9px;cursor:pointer;color:inherit;font-family:inherit;text-align:right;
      min-width:0;overflow:hidden;position:relative;
    }
    .fw-btn:hover{background:#232320;border-color:rgba(255,255,255,.26)}
    .fw-btn.on{background:#ffd400;color:#000;border-color:#ffd400}
    .fw-btn.biz{border-color:rgba(34,211,238,.35)}
    .fw-btn.biz.on{background:#22d3ee;border-color:#22d3ee;color:#000}
    .fw-btn.learn{border-color:rgba(185,140,255,.35);grid-column:1 / -1;align-items:center}
    .fw-btn.learn.on{background:#b98cff;border-color:#b98cff;color:#000}
    .fw-btn-t{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
    .fw-btn-n{font-size:10px;opacity:.6;font-variant-numeric:tabular-nums}

    .fw-today{
      display:flex;gap:8px;align-items:baseline;padding:5px 10px;background:#131312;
      border:1px solid rgba(255,255,255,.08);border-radius:9px;font-size:11px;
    }
    .fw-today-t{font-weight:700;color:#ffd400;flex:0 0 auto}
    .fw-today-s{color:rgba(255,255,255,.42);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fw-key{
      position:absolute;inset-block-start:3px;inset-inline-start:5px;font-size:9px;
      color:rgba(255,255,255,.28);font-variant-numeric:tabular-nums;
    }
    .fw-btn.on .fw-key{color:rgba(0,0,0,.4)}

    .fw-row{display:flex;gap:5px}
    .fw-mini{
      flex:1;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:8px;
      padding:5px 4px;font-size:11px;cursor:pointer;color:rgba(255,255,255,.62);font-family:inherit;
    }
    .fw-mini:hover{color:#fff;border-color:rgba(255,255,255,.3)}
    .fw-mini.pause{border-color:rgba(255,159,67,.4);color:#ff9f43}
    .fw-mini.pause.on{background:#ff9f43;color:#000;border-color:#ff9f43;font-weight:700}
    .fw-mini.go{border-color:rgba(185,140,255,.55);color:#b98cff;font-weight:700}
    .fw-mini.del{flex:0 0 34px;border-color:rgba(255,90,77,.35);color:#ff5a4d}
    .fw-mini.del:hover{background:rgba(255,90,77,.16);border-color:#ff5a4d}

    /* סוג הזמן — לחיצה אחת, בלי לעצור */
    .fw-kinds{display:flex;gap:4px}
    .fw-kind{
      flex:1;background:transparent;border:1px solid rgba(255,255,255,.1);border-radius:7px;
      padding:4px 2px;font-size:10px;cursor:pointer;color:rgba(255,255,255,.5);
      font-family:inherit;white-space:nowrap;overflow:hidden;
    }
    .fw-kind:hover{color:#fff;border-color:rgba(255,255,255,.28)}
    .fw-kind.on{background:rgba(255,255,255,.11);color:#fff;border-color:rgba(255,255,255,.3);font-weight:700}

    .fw-now.pause .fw-dot{background:#b98cff;animation:none}
    .fw-now.pause .fw-clock{color:#b98cff}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:6px}
  `;
  return st;
}
