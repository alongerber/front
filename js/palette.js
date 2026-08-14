/* ============================================================
   palette.js — חיפוש על כל המערכת
   חלון אחד שמוצא הכל: פתקים, לקוחות, משימות, ידע, החלטות,
   רעיונות, שגרות וקישורים. נפתח ב-Ctrl+Shift+F.
   ============================================================ */

import { typeMeta, noteTag } from './store.js';
import { el, modal, closeModal, input, ago, dmy, hhmm } from './util.js';
import { search, suggestions } from './search.js';
import { go, openItem } from './app.js';

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
    placeholder: 'חפש הכל…  אפשר גם סוג:פתק · נושא:שיווק · יש:תמונה · יעד:היום',
    'data-tip': 'notes.globalSearch'
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
      hint.textContent = 'התחל להקליד. החיפוש עובר על הכותרת, התוכן, שורות הרשימות, שמות הקבצים והנושאים.';
      rows = [];
      return;
    }

    const found = search(q, { limit: 40 });
    rows = found.map(f => f.item);
    hint.textContent = rows.length
      ? `${rows.length} תוצאות · חצים לניווט, Enter לפתיחה`
      : 'לא נמצא כלום. נסה מילה אחת קצרה יותר.';

    rows.forEach((it, i) => results.append(row(it, i)));
    mark();
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
