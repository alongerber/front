/* ============================================================
   sampleui.js — הצד הנראה של הדגימות
   רושם את ה-Service Worker, מקפיץ את השאלה, וקולט את התשובה —
   בין אם נלחצה בתוך ההתראה (גם מעל וגאס) ובין אם בתוך המערכת.
   ============================================================ */

import { S, getItem } from './store.js';
import { $, el, toast, modal, closeModal, hhmm, MIN } from './util.js';
import * as SM from './sampling.js';

let swReg = null;
let onAnswered = () => { };

/* ---------- Service Worker ---------- */

export async function initSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type === 'sample-answer') handleNotifAnswer(d);
    });
  } catch (e) {
    console.warn('רישום Service Worker נכשל', e);
  }
  return swReg;
}

export const swReady = () => !!swReg;

/* ---------- הקפצת השאלה ---------- */

function askViaNotification(sm) {
  const c = SM.cfg();
  if (!c.notify) return false;
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  if (!swReg || !swReg.active) return false;

  const { clients, buckets } = SM.candidates(4);
  const top = clients[0] || buckets[0];

  // ווינדוס מציג שני כפתורים לכל היותר, אז: הסביר ביותר + "לא עבודה"
  const actions = [];
  if (top) actions.push({ action: top.id, title: short(top.title) });
  actions.push({ action: 'off', title: 'לא עבודה' });

  const others = clients.slice(1, 3).concat(buckets.slice(0, 2))
    .filter(x => x !== top).map(c2 => c2.title).join(' · ');
  swReg.active.postMessage({
    type: 'sample-ask', id: sm.id,
    title: 'מה אתה עושה עכשיו?',
    body: others ? 'לחיצה על ההודעה לרשימה המלאה: ' + others : 'לחיצה על ההודעה לרשימה המלאה',
    actions
  });
  return true;
}

const short = s => (s || '').length > 14 ? s.slice(0, 13) + '…' : (s || '');

/* ---------- פס בתוך המערכת ---------- */

function askInPage(sm) {
  const box = $('#capture-feedback');
  if (!box) return;
  box.innerHTML = '';
  const row = el('div', { class: 'cf cf-sample' });
  row.append(el('span', { style: { fontWeight: '700' } }, '⏱ מה אתה עושה עכשיו?'));

  const { clients, tasks, buckets } = SM.candidates(5);
  const pick = (label, opts, cls) => row.append(el('button', {
    class: 'btn btn-xs ' + (cls || ''),
    onclick: () => { SM.answer(sm.id, opts); box.innerHTML = ''; onAnswered(); }
  }, label));

  clients.slice(0, 3).forEach(c => pick(short(c.title), { itemId: c.id, kind: 'work' }));
  buckets.slice(0, 2).forEach(bk => pick('◈ ' + short(bk.title), { itemId: bk.id, kind: 'work' }));
  tasks.slice(0, 1).forEach(t => pick(short(t.title), { itemId: t.id, kind: 'work' }));
  pick('📚 למידה', { kind: 'learn' });
  pick('☕ לא עבודה', { kind: 'off' });

  row.append(el('button', {
    class: 'btn btn-xs', onclick: () => { box.innerHTML = ''; picker(sm.id); }
  }, 'אחר…'));

  row.append(el('span', { class: 'small muted' }, hhmm(sm.at)));
  row.append(el('button', { class: 'cf-x', onclick: () => box.innerHTML = '', 'aria-label': 'הסר' }, '×'));
  box.append(row);
}

/* ---------- הרשימה המלאה ---------- */

export function picker(id) {
  const sm = S().samples.find(x => x.id === id) || SM.openSample();
  if (!sm) { toast('אין דגימה פתוחה', 'err'); return; }

  const s = S();
  const box = el('div', {});
  box.append(el('div', { class: 'muted small', style: { marginBottom: '12px', lineHeight: '1.7' } },
    `הדגימה נשאלה ב-${hhmm(sm.at)}. כל דגימה מייצגת בערך ` +
    `${Math.round(SM.sampleWeightMs() / MIN)} דקות, אז התשובה כאן היא המדידה.`));

  const grid = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '50vh', overflowY: 'auto' } });
  const opt = (label, sub, opts, cls) => grid.append(el('button', {
    class: 'btn ' + (cls || ''), style: { textAlign: 'right', padding: '10px 13px' },
    onclick: () => { SM.answer(sm.id, opts); closeModal(); toast('נרשם', 'ok'); onAnswered(); }
  },
    el('div', { style: { fontWeight: '600' } }, label),
    sub ? el('div', { class: 'small muted' }, sub) : null));

  s.items.filter(i => i.type === 'client' && !i.archived && !i.deliveredAt)
    .forEach(c => opt(c.title, c.business || 'לקוח', { itemId: c.id, kind: 'work' }));
  s.items.filter(i => i.type === 'bucket' && !i.archived)
    .forEach(bk => opt('◈ ' + bk.title, bk.note || 'תחום בעסק', { itemId: bk.id, kind: 'work' }));
  s.items.filter(i => i.type === 'task' && !i.archived && !i.done).slice(0, 6)
    .forEach(t => opt(t.title, 'משימה', { itemId: t.id, kind: 'work' }));

  grid.append(el('div', { class: 'hr' }));
  opt('📚 למידה', 'קראתי, צפיתי, התעדכנתי', { kind: 'learn' });
  opt('☕ לא עבודה', 'הפסקה, פייסבוק, חיים', { kind: 'off' });

  box.append(grid);
  modal({ title: 'מה אתה עושה עכשיו?', body: box, actions: [{ label: 'דלג' }] });
}

/* ---------- תשובה שהגיעה מההתראה ---------- */

function handleNotifAnswer(d) {
  const sm = S().samples.find(x => x.id === d.id);
  if (!sm || sm.answeredAt) return;

  if (!d.action) { picker(d.id); return; }             // נלחץ גוף ההתראה
  if (d.action === 'off') SM.answer(d.id, { kind: 'off' });
  else if (d.action === 'learn') SM.answer(d.id, { kind: 'learn' });
  else SM.answer(d.id, { itemId: d.action, kind: 'work' });

  const it = d.action && getItem(d.action);
  toast('נרשם: ' + (it ? it.title : 'לא עבודה'), 'ok');
  onAnswered();
}

/** תשובה שהגיעה דרך פתיחת חלון חדש מההתראה */
function consumeUrlAnswer() {
  const q = new URLSearchParams(location.search);
  const id = q.get('sample');
  if (!id) return;
  const a = q.get('a');
  handleNotifAnswer({ id, action: a || null });
  history.replaceState(null, '', location.pathname + location.hash);
}

/* ---------- חיבור ---------- */

export function init(onChange) {
  onAnswered = onChange || (() => { });
  initSW();
  consumeUrlAnswer();

  SM.onSample((ev, sm) => {
    if (ev !== 'fire') { if (ev === 'stale') onAnswered(); return; }
    // כשהלשונית מולך — פס בתוך המערכת עדיף על התראת מערכת
    if (document.visibilityState === 'visible') askInPage(sm);
    else if (!askViaNotification(sm)) askInPage(sm);
    onAnswered();
  });

  SM.start();

  // חזרת לטאב ויש דגימה פתוחה — מציגים אותה
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const sm = SM.openSample();
    if (sm) askInPage(sm);
  });
}

/** נקרא מהעמודים כדי להציג דגימה ממתינה */
export function showOpen() {
  const sm = SM.openSample();
  if (sm) askInPage(sm);
  return !!sm;
}
