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

  win = await documentPictureInPicture.requestWindow({ width: 310, height: 260 });
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
  if (c) c.textContent = hms(T.elapsed());
}

function render() {
  if (!isOpen()) return;
  const doc = win.document;
  const t = T.activeTimer();
  const it = t && t.itemId ? getItem(t.itemId) : null;
  const auto = !!(t && t.autoFrom);
  const away = P.running() && !P.isActiveNow();

  doc.body.innerHTML = '';

  /* השורה העליונה — מה רץ עכשיו */
  const state = !t ? 'idle' : t.kind === 'off' ? 'off' : (t.kind === 'wait' || away) ? 'wait' : 'run';
  doc.body.append(e(doc, 'div', { class: 'fw-now ' + state },
    e(doc, 'span', { class: 'fw-dot' }),
    e(doc, 'div', { class: 'fw-main' },
      e(doc, 'div', { class: 'fw-title' },
        !t ? 'שום דבר לא רץ'
          : t.kind === 'off' ? 'הפסקה'
            : (it ? it.title : (T.KINDS[t.kind]?.name || 'עבודה'))),
      e(doc, 'div', { class: 'fw-sub' },
        t && t.kind === 'off' ? 'לא נספר כזמן עבודה'
          : away ? 'לא ליד המחשב — לא נספר'
            : auto ? 'המתנה שזוהתה לבד'
              : t ? (T.KINDS[t.kind]?.name || '') : 'לחץ על לקוח או תחום למטה')),
    e(doc, 'div', { class: 'fw-clock', id: 'fw-clock' }, t ? hms(T.elapsed()) : '—')
  ));

  /* כפתורי החלפה — לקוחות פעילים, ואחריהם דליי העסק */
  const s = S();
  const clients = s.items
    .filter(i => i.type === 'client' && !i.archived && !i.deliveredAt)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 6);
  const bucketList = s.items.filter(i => i.type === 'bucket' && !i.archived);

  const grid = e(doc, 'div', { class: 'fw-grid' });
  const cell = (item, cls) => {
    const on = t && t.itemId === item.id && t.kind !== 'wait';
    const todayMs = T.focusMs(item.id, startOfToday(), Date.now());
    grid.append(e(doc, 'button', {
      class: 'fw-btn ' + (cls || '') + (on ? ' on' : ''),
      title: item.business || item.note || item.title,
      onclick: () => { T.startTimer(item.id); render(); }
    },
      e(doc, 'span', { class: 'fw-btn-t' }, item.title),
      todayMs > 60000 ? e(doc, 'span', { class: 'fw-btn-n' }, dur(todayMs, true)) : null
    ));
  };
  clients.forEach(c => cell(c));
  bucketList.forEach(bk => cell(bk, 'biz'));
  grid.append(e(doc, 'button', {
    class: 'fw-btn learn' + (t && !t.itemId && t.kind === 'learn' ? ' on' : ''),
    onclick: () => { T.startFree('learn'); render(); }
  }, e(doc, 'span', { class: 'fw-btn-t' }, '📚 למידה')));
  doc.body.append(grid);

  /* שורת פעולות — "הפסקה" קודם, כי זו הלחיצה שסוגרת את החור */
  const onBreak = t && t.kind === 'off';
  doc.body.append(e(doc, 'div', { class: 'fw-row' },
    e(doc, 'button', {
      class: 'fw-mini pause' + (onBreak ? ' on' : ''),
      title: 'לא עבודה — פייסבוק, קפה, חיים. נרשם ולא נספר בתמחור.',
      onclick: () => { T.startFree('off'); render(); }
    }, onBreak ? '☕ בהפסקה' : '☕ הפסקה'),
    e(doc, 'button', {
      class: 'fw-mini', onclick: () => { T.stopTimer(); render(); }
    }, '■ עצור'),
    e(doc, 'button', {
      class: 'fw-mini', onclick: () => { window.focus(); }
    }, '↗ למערכת')
  ));
}

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
      min-width:0;overflow:hidden;
    }
    .fw-btn:hover{background:#232320;border-color:rgba(255,255,255,.26)}
    .fw-btn.on{background:#ffd400;color:#000;border-color:#ffd400}
    .fw-btn.biz{border-color:rgba(34,211,238,.35)}
    .fw-btn.biz.on{background:#22d3ee;border-color:#22d3ee;color:#000}
    .fw-btn.learn{border-color:rgba(185,140,255,.35);grid-column:1 / -1;align-items:center}
    .fw-btn.learn.on{background:#b98cff;border-color:#b98cff;color:#000}
    .fw-btn-t{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
    .fw-btn-n{font-size:10px;opacity:.6;font-variant-numeric:tabular-nums}

    .fw-row{display:flex;gap:5px}
    .fw-mini{
      flex:1;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:8px;
      padding:5px 4px;font-size:11px;cursor:pointer;color:rgba(255,255,255,.62);font-family:inherit;
    }
    .fw-mini:hover{color:#fff;border-color:rgba(255,255,255,.3)}
    .fw-mini.pause{border-color:rgba(255,159,67,.4);color:#ff9f43}
    .fw-mini.pause.on{background:#ff9f43;color:#000;border-color:#ff9f43;font-weight:700}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:6px}
  `;
  return st;
}
