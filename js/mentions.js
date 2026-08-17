/* ============================================================
   mentions.js — הקלדת @ בתוך טקסט
   מציג רשימה, ובחירה מכניסה את השם לטקסט ומוסיפה קישור אמיתי.
   הקישור נשמר כמזהה, לא כטקסט — שינוי שם לא שובר אותו.
   ============================================================ */

import { el } from './util.js';
import * as L from './links.js';

/**
 * מחבר השלמת @ לשדה טקסט.
 * onLink(itemId) נקרא כשנבחר פריט, כדי לשמור את הקישור.
 * מחזיר פונקציית ניתוק.
 */
export function attachMentions(field, { onLink, exclude = null } = {}) {
  let pop = null, items = [], sel = 0, start = -1;

  const close = () => { if (pop) { pop.remove(); pop = null; } start = -1; };

  function open(query, caret) {
    items = L.candidates(query, { exclude, limit: 7 });
    if (!items.length) { close(); return; }
    sel = 0;
    if (!pop) {
      pop = el('div', { class: 'mention-pop' });
      document.body.append(pop);
    }
    render();
    place(caret);
  }

  function render() {
    if (!pop) return;
    pop.innerHTML = '';
    items.forEach((it, i) => {
      pop.append(el('button', {
        class: 'mention-row' + (i === sel ? ' on' : ''),
        onmousedown: e => { e.preventDefault(); pick(i); }
      },
        el('span', { class: 'mention-ic' }, L.iconOf(it)),
        el('span', { class: 'mention-t' }, it.title),
        it.business ? el('span', { class: 'mention-s' }, it.business) : null
      ));
    });
  }

  function place() {
    if (!pop) return;
    const r = field.getBoundingClientRect();
    pop.style.top = Math.min(window.innerHeight - 220, r.bottom + 4) + 'px';
    pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    pop.style.width = Math.min(320, r.width) + 'px';
  }

  function pick(i) {
    const it = items[i];
    if (!it) return close();
    const v = field.value;
    const before = v.slice(0, start);
    const after = v.slice(field.selectionStart);
    field.value = before + it.title + ' ' + after;
    const pos = before.length + it.title.length + 1;
    field.setSelectionRange(pos, pos);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    onLink && onLink(it.id, it);
    close();
    field.focus();
  }

  const onInput = () => {
    const v = field.value, c = field.selectionStart;
    // מחפשים @ אחרון לפני הסמן, בלי רווח אחריו
    const upto = v.slice(0, c);
    const at = upto.lastIndexOf('@');
    if (at < 0) return close();
    const frag = upto.slice(at + 1);
    if (/[\s\n]/.test(frag) || frag.length > 24) return close();
    // @ חייב להיות בתחילת מילה
    if (at > 0 && !/[\s\n(\[]/.test(v[at - 1])) return close();
    start = at;
    open(frag, c);
  };

  const onKey = e => {
    if (!pop) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  field.addEventListener('input', onInput);
  field.addEventListener('keydown', onKey);
  field.addEventListener('blur', () => setTimeout(close, 120));
  window.addEventListener('scroll', close, true);

  return () => {
    close();
    field.removeEventListener('input', onInput);
    field.removeEventListener('keydown', onKey);
  };
}

/* ---------- שורת הקישורים ---------- */

/**
 * צ'יפים של הפריטים המקושרים, עם כפתור הוספה.
 * onChange נקרא אחרי כל שינוי.
 */
export function linkChips(itemId, { onChange, onOpen } = {}) {
  const box = el('div', { class: 'link-chips' });

  const draw = () => {
    box.innerHTML = '';
    const out = L.linksOf(itemId);
    const back = L.backlinksOf(itemId).filter(b => !out.some(o => o.id === b.id));

    out.forEach(it => box.append(chip(it, true)));
    back.forEach(it => box.append(chip(it, false)));

    box.append(el('button', {
      class: 'tag-pill add sm', 'data-tip': 'gen.link',
      onclick: () => picker(itemId, () => { draw(); onChange && onChange(); })
    }, '+ קשר'));
  };

  const chip = (it, outgoing) => el('span', {
    class: 'link-chip' + (outgoing ? '' : ' back'),
    'data-tip': outgoing ? 'קישור שיצרת מכאן' : 'הפריט הזה מקשר לכאן'
  },
    el('span', { class: 'lc-ic' }, outgoing ? L.iconOf(it) : '↩'),
    el('button', {
      class: 'lc-t',
      onclick: () => { onOpen ? onOpen(it.id) : import('./app.js').then(a => a.openItem(it.id)); }
    }, it.title),
    outgoing ? el('button', {
      class: 'lc-x', 'data-tip': 'הסר קישור',
      onclick: () => { L.removeLink(itemId, it.id); draw(); onChange && onChange(); }, 'aria-label': 'הסר' }, '×') : null
  );

  draw();
  return box;
}

/** חלון בחירה — כשלא בא לך להקליד @ */
function picker(itemId, done) {
  import('./util.js').then(({ modal, closeModal, input, el: e2 }) => {
    const box = e2('div', {});
    const search = input({ placeholder: 'חפש לקוח, משימה, פתק…' });
    const list = e2('div', { class: 'actionlist', style: { maxHeight: '46vh', overflowY: 'auto', marginTop: '10px' } });

    const draw = q => {
      list.innerHTML = '';
      const cands = L.candidates(q, { exclude: itemId, limit: 30 });
      if (!cands.length) { list.append(e2('div', { class: 'empty' }, 'אין התאמה')); return; }
      cands.forEach(it => list.append(e2('div', {
        class: 'act', style: { cursor: 'pointer' },
        onclick: () => { L.addLink(itemId, it.id); closeModal(); done && done(); }
      },
        e2('span', { class: 'act-rank' }, L.iconOf(it)),
        e2('div', { class: 'act-main' },
          e2('div', { class: 'act-title' }, it.title),
          e2('div', { class: 'act-why' }, it.business || it.note || '')))));
    };

    search.addEventListener('input', e => draw(e.target.value));
    draw('');
    box.append(search, list);
    modal({ title: 'קשר לפריט', body: box, actions: [{ label: 'סגור' }] });
  });
}
