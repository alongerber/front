/* ============================================================
   palette.js — חיפוש על כל המערכת
   חלון אחד שמוצא הכל: פתקים, לקוחות, משימות, ידע, החלטות,
   רעיונות, שגרות וקישורים. נפתח ב-Ctrl+Shift+F.
   ============================================================ */

import { S, typeMeta, noteTag, downloadBackup } from './store.js';
import { el, modal, closeModal, input, toast, ago, dmy, hhmm } from './util.js';
import { search, suggestions } from './search.js';
import { go, openItem, doUndo, openSwitcher } from './app.js';
import * as T from './timer.js';

/* ---------- פקודות ----------
   הפלטה לא רק מוצאת — היא גם מבצעת. אין טעם לחפש "דני" ואז
   לנווט לצינור ואז ללחוץ טיימר, כשאפשר להקליד "התחל דני". */

function commands(q) {
  const s = S();
  const out = [];
  const add = (label, sub, run, icon) => out.push({ cmd: true, label, sub, run, icon: icon || '⌘' });

  /* התחל טיימר על פריט */
  const startable = s.items.filter(i => !i.archived &&
    ['client', 'bucket', 'task', 'knowledge'].includes(i.type) &&
    !i.deliveredAt && !i.done);
  const m = q.match(/^(?:התחל|טיימר|start)\s+(.*)$/);
  if (m && m[1]) {
    const needle = m[1].trim().toLowerCase();
    startable.filter(i => i.title.toLowerCase().includes(needle)).slice(0, 5).forEach(i =>
      add('התחל טיימר על ' + i.title, typeMeta(i.type).name,
        () => { T.startTimer(i.id, i.type === 'knowledge' ? 'learn' : 'work'); toast('הטיימר רץ על ' + i.title, 'ok'); }, '▶'));
  }

  const has = (...words) => words.some(w => q.includes(w));

  if (!q || has('טיימר', 'החלף', 'עבוד')) add('החלף טיימר', 'בחירה מרשימה', () => openSwitcher(), '▶');
  // בלי 'מיקרופון' — זו מילה שמופיעה בתוכן אמיתי, ופקודה לא אמורה לדחוק תוצאת חיפוש
  if (!q || has('רעיון מהיר', 'הכתב', 'quick'))
    add('רעיון מהיר', 'מסך אחד, הכתבה, בלי ניווט', () => go('#/quick'), '⚡');
  if (has('השהה', 'pause')) add('השהה טיימר', 'זוכר על מה עבדת', () => { T.pauseTimer(); toast('מושהה — הזמן נשמר'); }, '⏸');
  if (has('המשך', 'resume')) add('המשך מהמושהה', 'חוזר בדיוק לאותו דבר', () => {
    if (T.resumePaused()) toast('ממשיך', 'ok'); else toast('אין מה להמשיך', 'err');
  }, '▶');
  if (has('הפסק', 'קפה', 'break')) add('הפסקה', 'לא עבודה — נרשם ולא נספר', () => { T.startFree('off'); toast('בהפסקה'); }, '☕');
  if (has('עצור', 'stop')) add('עצור טיימר', 'נסגר ונרשם', () => { T.stopTimer(); toast('נעצר ונרשם'); }, '■');
  if (has('למידה', 'ללמוד')) add('טיימר למידה', 'למידה כללית', () => { T.startFree('learn'); toast('טיימר למידה'); }, '📚');
  if (has('גבה', 'גיבוי', 'backup')) add('ייצוא גיבוי', 'מוריד קובץ JSON', () => { const n = downloadBackup(); toast('ירד ' + n, 'ok'); }, '⬇');
  if (has('בטל', 'undo')) add('בטל פעולה אחרונה', 'Ctrl+Z', () => doUndo(), '↶');
  if (has('פתק', 'note')) add('פתק חדש', 'נפתח בעורך', () => {
    import('./store.js').then(st => {
      const n = st.addItem({ type: 'note', title: '', body: '', kind: 'note' });
      import('./pages/notes.js').then(mod => mod.openNote(n.id));
    });
  }, '🗒');
  if (has('רשימה', 'צקליסט', "צ'קליסט")) add('רשימה חדשה', 'עם תיבות סימון', () => {
    import('./store.js').then(st => {
      const n = st.addItem({ type: 'note', title: '', kind: 'list', checklist: [{ id: 'c1', text: '', done: false }] });
      import('./pages/notes.js').then(mod => mod.openNote(n.id));
    });
  }, '☑');

  /* ניווט */
  const PAGES = [
    ['בית', '#/'], ['צינור', '#/pipeline'], ['זמן', '#/time'], ['כסף', '#/money'],
    ['ידע', '#/knowledge'], ['שגרה', '#/routines'], ['משימות', '#/tasks'],
    ['פנקס', '#/notes'], ['כלים', '#/tools'], ['עוזר', '#/assistant'], ['הגדרות', '#/settings']
  ];
  PAGES.forEach(([name, href]) => {
    if (q && name.includes(q.replace(/^(עבור ל|לך ל|פתח)\s*/, ''))) 
      add('פתח: ' + name, 'ניווט', () => go(href), '→');
  });

  return out.slice(0, 8);
}

let open = false;

const PAGE_OF = {
  client: '#/pipeline', task: '#/tasks', decision: '#/tasks?f=decision',
  idea: '#/tasks?f=idea', knowledge: '#/knowledge', routine: '#/routines', note: '#/notes'
};

export function openPalette(initial = '') {
  if (open) return;
  open = true;

  const box = el('div', {});
  const inp = input({
    value: initial,
    placeholder: 'חפש או הפעל…  "התחל דני" · "הפסקה" · "גבה" · סוג:פתק · יש:תמונה',
    'data-tip': 'gen.commands'
  });
  const results = el('div', { class: 'pal-list' });
  const hint = el('div', { class: 'small muted', style: { marginTop: '9px' } });

  const chips = el('div', { class: 'chips', style: { marginTop: '9px' } });
  suggestions().slice(0, 8).forEach(sg => chips.append(el('button', {
    class: 'chip', 'data-tip': sg.desc,
    onclick: () => { inp.value = (inp.value.trim() ? inp.value.trim() + ' ' : '') + sg.text; draw(); inp.focus(); }
  }, sg.text)));

  let rows = [], cursor = 0;

  function draw() {
    const q = inp.value;
    results.innerHTML = '';
    cursor = 0;

    if (!q.trim()) {
      const base = commands('');
      rows = base;
      base.forEach((c, i) => results.append(cmdRow(c, i)));
      hint.textContent = 'חפש כל דבר, או הקלד פקודה: "התחל דני" · "הפסקה" · "עצור" · "גבה" · "בטל".';
      mark();
      return;
    }

    const cmds = commands(q.trim());
    const found = search(q, { limit: 40 });
    rows = cmds.concat(found.map(f => f.item));

    const nf = found.length;
    hint.textContent = rows.length
      ? (cmds.length ? `${cmds.length} פקודות · ` : '') +
        `${nf} תוצאות · חצים לניווט, Enter להפעלה`
      : 'לא נמצא כלום. נסה מילה אחת קצרה יותר, או פקודה כמו "התחל דני".';

    rows.forEach((it, i) => results.append(it.cmd ? cmdRow(it, i) : row(it, i)));
    mark();
  }

  function cmdRow(c, i) {
    return el('div', {
      class: 'pal-row is-cmd', 'data-i': String(i),
      onmouseenter: () => { cursor = i; mark(); },
      onclick: () => pick(c)
    },
      el('span', { class: 'pal-ic' }, c.icon),
      el('div', { class: 'pal-main' },
        el('div', { class: 'pal-t' }, c.label),
        el('div', { class: 'pal-s' }, c.sub || 'פקודה')),
      el('span', { class: 'pal-kbd' }, '↵')
    );
  }

  function row(it, i) {
    const isLink = it.type === '__link';
    const meta = isLink ? { name: 'קישור', icon: '🔗', color: '#94a3b8' } : typeMeta(it.type);
    const tags = (it.noteTags || []).map(id => noteTag(id)).filter(Boolean);

    return el('div', {
      class: 'pal-row', 'data-i': String(i),
      onmouseenter: () => { cursor = i; mark(); },
      onclick: () => pick(it)
    },
      el('span', { class: 'pal-ic', style: { color: meta.color } }, meta.icon),
      el('div', { class: 'pal-main' },
        el('div', { class: 'pal-t' }, it.title || (it.body || '').slice(0, 60) || 'בלי כותרת'),
        el('div', { class: 'pal-s' },
          meta.name,
          it.business ? ' · ' + it.business : '',
          it.updatedAt ? ' · ' + ago(it.updatedAt) : '',
          it.reminderAt ? ' · ⏰ ' + dmy(it.reminderAt) + ' ' + hhmm(it.reminderAt) : ''
        )
      ),
      tags.length ? el('div', { class: 'pal-tags' },
        ...tags.slice(0, 3).map(t => el('span', {
          class: 'note-tag', style: { borderColor: t.color + '77', color: t.color }
        }, t.name))) : null,
      (it.attachments || []).length ? el('span', { class: 'small muted' }, '📎') : null
    );
  }

  function mark() {
    Array.from(results.children).forEach((n, i) => n.classList.toggle('on', i === cursor));
    const cur = results.children[cursor];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function pick(it) {
    closeModal();
    if (it.cmd) { try { it.run(); } catch (e) { toast(String(e.message || e), 'err'); } return; }
    if (it.type === '__link') { window.open(it.url, '_blank', 'noopener'); return; }
    const href = PAGE_OF[it.type];
    if (href) go(href);
    setTimeout(() => openItem(it.id), 60);
  }

  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(rows.length - 1, cursor + 1); mark(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); mark(); }
    if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); pick(rows[cursor]); }
  });

  box.append(inp, chips, hint, results);
  draw();

  modal({ title: 'חיפוש בכל המערכת', body: box, wide: true, onClose: () => { open = false; } });
  setTimeout(() => inp.focus(), 50);
}

/** נקרא פעם אחת מ-app.js */
export function initPalette() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openPalette();
    }
  });
}
