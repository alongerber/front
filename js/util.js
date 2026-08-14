/* ============================================================
   util.js — עזרי DOM, פורמט עברי, מודאל, טוסט
   ============================================================ */

export const MIN = 60000, HOUR = 3600000, DAY = 86400000;

/* ---------- DOM ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'data' && typeof v === 'object') for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
    // true בוליאני: דרך המאפיין (property) ולא setAttribute — אחרת draggable="" לא באמת גורר
    else if (v === true) { if (k in n) n[k] = true; else n.setAttribute(k, ''); }
    else n.setAttribute(k, v);
  }
  for (const c of children.flat(3)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- זמן ---------- */

/** 1:05:12 / 5:12 */
export function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
           : `${m}:${String(ss).padStart(2, '0')}`;
}

/** "3 שע' 20 דק'" · מעל יומיים עובר לימים, כי "264 שע'" זה לא מספר שאפשר לקרוא */
export function dur(ms, short = false) {
  if (!ms || ms <= 0) return '0';
  const m = Math.round(ms / MIN);
  if (m < 1) return "0 דק'";
  if (m < 60) return `${m} דק'`;
  if (ms >= 2 * DAY) {
    const d = Math.round(ms / DAY);
    return d === 2 ? 'יומיים' : `${d} ימים`;
  }
  const h = Math.floor(m / 60), r = m % 60;
  if (short) return r ? `${h}:${String(r).padStart(2, '0')} שע'` : `${h} שע'`;
  return r ? `${h} שע' ${r} דק'` : `${h} שע'`;
}

/** "3 ימים" / "שעתיים" — לתיאור ותק */
export function ago(ts) {
  const d = Date.now() - ts;
  if (d < MIN) return 'עכשיו';
  if (d < HOUR) return `${Math.floor(d / MIN)} דק'`;
  if (d < DAY) {
    const h = Math.floor(d / HOUR);
    return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  }
  const days = Math.floor(d / DAY);
  if (days === 1) return 'יום';
  if (days === 2) return 'יומיים';
  if (days < 30) return `${days} ימים`;
  const mo = Math.round(days / 30);
  return mo === 1 ? 'חודש' : mo === 2 ? 'חודשיים' : `${mo} חודשים`;
}

export const hhmm = ts => new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
export const dmy  = ts => new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
export const dm   = ts => new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
export const dayName = ts => new Date(ts).toLocaleDateString('he-IL', { weekday: 'long' });

export function startOfDay(ts = Date.now()) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function endOfDay(ts = Date.now()) { return startOfDay(ts) + DAY - 1; }
export const isToday = ts => startOfDay(ts) === startOfDay();
export const dateInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

/* ---------- מספרים ---------- */
/* עטוף ב-LTR isolate כדי שהמינוס לא יקפוץ לצד השני בתוך משפט בעברית */
export const nis = n => {
  const v = Math.round(n || 0);
  return '⁦' + (v < 0 ? '-' : '') + '₪' + Math.abs(v).toLocaleString('he-IL') + '⁩';
};
export const num = (n, d = 1) => (Math.round((n || 0) * 10 ** d) / 10 ** d).toLocaleString('he-IL');
export const pct = n => Math.round((n || 0) * 100) + '%';
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- טוסט ---------- */
export function toast(msg, kind = '') {
  const box = $('#toasts');
  if (!box) return;
  const t = el('div', { class: 'toast ' + kind }, msg);
  box.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 3200);
  setTimeout(() => t.remove(), 3600);
}

/* ---------- מודאל ---------- */
let modalCloser = null;

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const back = $('#modal-back'), box = $('#modal');
  box.className = 'modal' + (wide ? ' wide' : '');
  box.innerHTML = '';

  const head = el('div', { class: 'modal-h' },
    el('h3', {}, title || ''),
    el('button', { class: 'x', onclick: () => closeModal(), 'aria-label': 'סגור' }, '×')
  );
  const content = el('div', {});
  if (typeof body === 'string') content.innerHTML = body; else if (body) content.append(body);

  box.append(head, content);

  if (actions.length) {
    const f = el('div', { class: 'modal-f' });
    let spacerAdded = false;
    actions.forEach(a => {
      if (a === 'spacer') { f.append(el('div', { class: 'sp' })); spacerAdded = true; return; }
      f.append(el('button', {
        class: 'btn ' + (a.cls || ''),
        onclick: () => { const r = a.onClick && a.onClick(); if (r !== false) closeModal(); }
      }, a.label));
    });
    if (!spacerAdded) f.prepend(el('div', { class: 'sp' }));
    box.append(f);
  }

  back.classList.add('open');
  modalCloser = onClose;
  const first = box.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 40);
  return { content, close: closeModal };
}

export function closeModal() {
  $('#modal-back').classList.remove('open');
  if (modalCloser) { const f = modalCloser; modalCloser = null; f(); }
}

export function confirmBox(text, onYes, yesLabel = 'כן, למחוק') {
  modal({
    title: 'רגע —',
    body: el('div', { class: 'muted' }, text),
    actions: [
      { label: 'ביטול' },
      { label: yesLabel, cls: 'btn-danger', onClick: onYes }
    ]
  });
}

document.addEventListener('click', e => {
  if (e.target.id === 'modal-back') closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ---------- טופס פשוט ---------- */
export function field(label, input, hint) {
  return el('div', { class: 'field' },
    el('label', { class: 'fl' }, label),
    input,
    hint ? el('div', { class: 'small muted', style: { marginTop: '4px' } }, hint) : null
  );
}

export function input(attrs = {}) { return el('input', Object.assign({ class: 'inp' }, attrs)); }
export function textarea(attrs = {}) { return el('textarea', Object.assign({ class: 'inp' }, attrs)); }
export function select(options, value, attrs = {}) {
  const s = el('select', Object.assign({ class: 'inp' }, attrs));
  options.forEach(o => {
    const opt = el('option', { value: o.value }, o.label);
    if (String(o.value) === String(value)) opt.selected = true;
    s.append(opt);
  });
  return s;
}

/* ---------- שונות ---------- */
export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function drag(node, { onMove, onEnd }) {
  const start = e => {
    e.preventDefault();
    const x0 = (e.touches ? e.touches[0].clientX : e.clientX);
    const move = ev => onMove((ev.touches ? ev.touches[0].clientX : ev.clientX) - x0);
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up);
      onEnd && onEnd();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
  };
  node.addEventListener('mousedown', start);
  node.addEventListener('touchstart', start, { passive: false });
}
