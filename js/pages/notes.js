/* ============================================================
   notes.js — הפנקס
   פתקים, צ'קליסטים, תמונות, מסמכים, נושאים ותזכורות.
   הקבצים עצמם יושבים ב-IndexedDB (attachments.js), רק המטא-דאטה כאן.
   ============================================================ */

import { S, update, uid, addItem, patchItem, getItem, removeItem, noteTag, addNoteTag, patchNoteTag, removeNoteTag } from '../store.js';
import { el, toast, modal, closeModal, input, textarea, field, confirmBox, dmy, hhmm, dateInput, DAY, MIN } from '../util.js';
import { searchNotes, suggestions } from '../search.js';
import { hintBadge } from '../help.js';
import { refresh } from '../app.js';
import * as A from '../attachments.js';

export default { render };

/* צבעי פתקים — כמו ב-Keep, אבל בגוונים שמתאימים לרקע כהה */
export const COLORS = {
  default: { name: 'ללא', bg: '#131312', line: 'rgba(255,255,255,.10)' },
  yellow: { name: 'צהוב', bg: '#3a3213', line: 'rgba(255,212,0,.35)' },
  green: { name: 'ירוק', bg: '#12301f', line: 'rgba(61,220,132,.32)' },
  blue: { name: 'כחול', bg: '#12263a', line: 'rgba(90,169,255,.32)' },
  purple: { name: 'סגול', bg: '#26193a', line: 'rgba(185,140,255,.32)' },
  pink: { name: 'ורוד', bg: '#361824', line: 'rgba(255,107,157,.32)' },
  orange: { name: 'כתום', bg: '#3a2612', line: 'rgba(255,159,67,.32)' },
  gray: { name: 'אפור', bg: '#22252a', line: 'rgba(148,163,184,.30)' }
};

/* מצב התצוגה — נשמר בין רינדורים */
let view = { tag: null, query: '', showArchived: false };

/* ============================================================ */

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'פנקס'),
    el('div', { class: 'desc' }, 'כל מה שצריך לזרוק לאיזשהו מקום', hintBadge('notes.board')),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-sm', 'data-tip': 'ניהול הנושאים: הוספה, שינוי שם, צבע ומחיקה.',
        onclick: tagManager
      }, '⚙ נושאים'),
      el('button', {
        class: 'btn btn-sm ' + (view.showArchived ? 'btn-y' : ''),
        'data-tip': 'notes.archive',
        onclick: () => { view.showArchived = !view.showArchived; refresh(); }
      }, '🗄 ארכיון')
    )
  ));

  root.append(composer());
  root.append(searchRow());
  root.append(tagStrip());

  /* --- איזה פתקים מציגים --- */
  let list;
  const found = searchNotes(view.query);
  if (found) {
    list = found.filter(n => view.showArchived ? n.archived : !n.archived);
  } else {
    list = s.items.filter(n => n.type === 'note' && (view.showArchived ? n.archived : !n.archived));
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  if (view.tag) list = list.filter(n => (n.noteTags || []).includes(view.tag));

  if (!list.length) {
    root.append(emptyState());
    return;
  }

  // בחיפוש מציגים לוח אחד לפי ניקוד. בלי חיפוש מפרידים נעוצים משאר.
  if (found) {
    root.append(el('div', { class: 'section' },
      el('span', { class: 'bar' }),
      el('h2', {}, `${list.length} ${list.length === 1 ? 'תוצאה' : 'תוצאות'}`),
      el('span', { class: 'line' })));
    root.append(board(list));
    return;
  }

  const pinned = list.filter(n => n.pinned);
  const rest = list.filter(n => !n.pinned);

  if (pinned.length) {
    root.append(el('div', { class: 'section' },
      el('span', { class: 'bar' }), el('h2', {}, 'נעוצים'), el('span', { class: 'line' })));
    root.append(board(pinned));
  }
  if (rest.length) {
    if (pinned.length) root.append(el('div', { class: 'section' },
      el('span', { class: 'bar' }), el('h2', {}, 'השאר'), el('span', { class: 'line' })));
    root.append(board(rest));
  }
}

function emptyState() {
  const c = el('div', { class: 'card', style: { textAlign: 'center', padding: '34px 20px' } });
  if (view.query) {
    c.append(el('div', { class: 'muted' }, 'לא נמצא כלום.'),
      el('div', { class: 'small muted', style: { marginTop: '6px' } }, 'נסה מילה אחרת, או נקה את החיפוש.'));
  } else if (view.showArchived) {
    c.append(el('div', { class: 'muted' }, 'הארכיון ריק.'));
  } else {
    c.append(
      el('div', { style: { fontWeight: '700', fontSize: '16px' } }, 'הפנקס ריק'),
      el('div', { class: 'muted small', style: { marginTop: '8px', lineHeight: '1.7' } },
        'כאן זורקים דברים בלי לחשוב איפה הם צריכים לשבת. פתק, רשימת קניות, צילום מסך, חוזה.'),
      el('div', { style: { marginTop: '14px', display: 'flex', gap: '7px', justifyContent: 'center', flexWrap: 'wrap' } },
        el('button', { class: 'btn btn-y', onclick: () => quickNew('note') }, 'פתק ראשון'),
        el('button', { class: 'btn', onclick: () => quickNew('list') }, 'רשימה ראשונה'))
    );
  }
  return c;
}

/* ================= שורת יצירה מהירה ================= */

function composer() {
  const box = el('div', { class: 'card composer' });
  const fake = el('div', { class: 'composer-fake' },
    el('span', { class: 'muted' }, 'כתוב פתק…'),
    el('div', { class: 'composer-icons' },
      iconBtn('☑', 'רשימה עם תיבות סימון', e => { e.stopPropagation(); quickNew('list'); }),
      iconBtn('🖼', 'העלה תמונה', e => { e.stopPropagation(); quickNew('note', { pickImage: true }); }),
      iconBtn('📎', 'צרף מסמך', e => { e.stopPropagation(); quickNew('note', { pickFile: true }); })
    )
  );
  fake.addEventListener('click', () => quickNew('note'));
  box.append(fake);
  return box;
}

function iconBtn(txt, tip, onclick) {
  return el('button', { class: 'icon-sq', 'data-tip': tip, onclick }, txt);
}

function quickNew(kind, opts = {}) {
  const note = addItem({
    type: 'note', title: '', body: '', kind,
    noteTags: view.tag ? [view.tag] : [],
    checklist: kind === 'list' ? [{ id: uid('c'), text: '', done: false }] : []
  });
  editor(note.id, opts);
}

/* ================= חיפוש ================= */

function searchRow() {
  const wrap = el('div', { class: 'notes-search' });
  const inp = input({
    value: view.query,
    placeholder: 'חיפוש בפנקס…  אפשר גם נושא:שיווק · יש:תמונה · נעוץ',
    'data-tip': 'notes.search'
  });
  let t;
  inp.addEventListener('input', e => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => { view.query = v; refresh(); setTimeout(() => focusEnd(), 0); }, 220);
  });
  wrap.append(inp);
  if (view.query) wrap.append(el('button', {
    class: 'btn btn-sm', onclick: () => { view.query = ''; refresh(); }
  }, 'נקה'));

  const chips = el('div', { class: 'chips' });
  suggestions().slice(0, 8).forEach(sg => chips.append(el('button', {
    class: 'chip', 'data-tip': sg.desc,
    onclick: () => { view.query = (view.query ? view.query.trim() + ' ' : '') + sg.text; refresh(); }
  }, sg.text)));

  return el('div', {}, wrap, chips);
}

function focusEnd() {
  const i = document.querySelector('.notes-search input');
  if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

/* ================= רצועת הנושאים ================= */

function tagStrip() {
  const s = S();
  const counts = {};
  s.items.forEach(n => {
    if (n.type !== 'note' || n.archived) return;
    (n.noteTags || []).forEach(id => counts[id] = (counts[id] || 0) + 1);
  });

  const strip = el('div', { class: 'tag-strip', 'data-tip': 'notes.tags' });
  strip.append(el('button', {
    class: 'tag-pill' + (view.tag ? '' : ' on'),
    onclick: () => { view.tag = null; refresh(); }
  }, 'הכל'));

  s.noteTags.forEach(t => {
    strip.append(el('button', {
      class: 'tag-pill' + (view.tag === t.id ? ' on' : ''),
      style: view.tag === t.id ? { background: t.color, color: '#000', borderColor: t.color } : { borderColor: t.color + '66' },
      onclick: () => { view.tag = view.tag === t.id ? null : t.id; refresh(); }
    },
      el('span', { class: 'dot', style: { background: t.color } }),
      t.name,
      counts[t.id] ? el('span', { class: 'tag-count' }, String(counts[t.id])) : null
    ));
  });

  strip.append(el('button', { class: 'tag-pill add', onclick: newTagPrompt }, '+ נושא'));
  return strip;
}

function newTagPrompt() {
  const fN = input({ placeholder: 'שם הנושא' });
  const fC = el('input', { type: 'color', value: '#5aa9ff', class: 'color-in' });
  modal({
    title: 'נושא חדש',
    body: el('div', {},
      el('div', { class: 'muted small', style: { marginBottom: '11px' } },
        'נושא הוא כמו תיקייה. פתק יכול להיות בכמה נושאים בו זמנית.'),
      field('שם', fN),
      field('צבע', fC)),
    actions: [{ label: 'ביטול' }, {
      label: 'צור', cls: 'btn-y', onClick: () => {
        if (!fN.value.trim()) { toast('צריך שם', 'err'); return; }
        addNoteTag(fN.value.trim(), fC.value);
        toast('הנושא נוצר', 'ok'); refresh();
      }
    }]
  });
}

/* ================= לוח הפתקים ================= */

function board(list) {
  const b = el('div', { class: 'board' });
  list.forEach(n => b.append(card(n)));
  return b;
}

function card(n) {
  const c = COLORS[n.color] || COLORS.default;
  const node = el('div', {
    class: 'note' + (n.pinned ? ' pinned' : ''),
    style: { background: c.bg, borderColor: c.line }
  });

  /* תמונות */
  const imgs = (n.attachments || []).filter(a => a.kind === 'image');
  if (imgs.length) {
    const strip = el('div', { class: 'note-imgs' + (imgs.length > 1 ? ' multi' : '') });
    imgs.slice(0, 4).forEach(a => {
      const im = el('img', { alt: a.name, loading: 'lazy' });
      A.blobUrl(a.id).then(u => { if (u) im.src = u; });
      strip.append(im);
    });
    if (imgs.length > 4) strip.append(el('div', { class: 'more-imgs' }, '+' + (imgs.length - 4)));
    strip.addEventListener('click', () => editor(n.id));
    node.append(strip);
  }

  const body = el('div', { class: 'note-body', onclick: e => { if (!e.target.closest('input,button,a')) editor(n.id); } });

  if (n.title) body.append(el('div', { class: 'note-title' }, n.title));

  if (n.kind === 'list') {
    const items = n.checklist || [];
    const open = items.filter(x => !x.done);
    const done = items.filter(x => x.done);
    const ul = el('div', { class: 'note-list' });
    open.slice(0, 8).forEach(x => ul.append(checkRow(n, x)));
    if (done.length) {
      ul.append(el('div', { class: 'note-done-sep' }, `${done.length} סומנו`));
      done.slice(0, 3).forEach(x => ul.append(checkRow(n, x)));
    }
    if (open.length > 8) ul.append(el('div', { class: 'small muted' }, `ועוד ${open.length - 8}…`));
    body.append(ul);
  } else if (n.body) {
    body.append(el('div', { class: 'note-text' }, n.body.slice(0, 420)));
  }

  /* מסמכים */
  const files = (n.attachments || []).filter(a => a.kind !== 'image');
  if (files.length) {
    const fl = el('div', { class: 'note-files' });
    files.forEach(a => fl.append(el('button', {
      class: 'file-chip', 'data-tip': `${a.name} · ${A.fmtSize(a.size)}`,
      onclick: e => { e.stopPropagation(); openAttachment(a); }
    }, '📎 ' + a.name.slice(0, 24))));
    body.append(fl);
  }

  node.append(body);

  /* תגיות ותזכורת */
  const foot = el('div', { class: 'note-foot' });
  (n.noteTags || []).forEach(id => {
    const t = noteTag(id);
    if (t) foot.append(el('span', { class: 'note-tag', style: { borderColor: t.color + '77', color: t.color } }, t.name));
  });
  if (n.reminderAt) {
    const late = n.reminderAt < Date.now() && !n.reminderDone;
    foot.append(el('button', {
      class: 'note-rem' + (late ? ' late' : '') + (n.reminderDone ? ' done' : ''),
      'data-tip': n.reminderDone ? 'התזכורת טופלה. לחיצה מחזירה אותה לפעילה.'
        : late ? 'התזכורת עברה. לחיצה מסמנת שטיפלת.' : 'תזכורת עתידית. לחיצה מסמנת שכבר טיפלת.',
      onclick: e => {
        e.stopPropagation();
        patchItem(n.id, { reminderDone: !n.reminderDone });
        toast(n.reminderDone ? 'התזכורת חזרה' : 'סומן כטופל', 'ok');
        refresh();
      }
    }, '⏰ ' + remLabel(n.reminderAt)));
  }
  if (foot.children.length) node.append(foot);

  /* פעולות */
  node.append(el('div', { class: 'note-acts' },
    iconBtn(n.pinned ? '📌' : '📍', n.pinned ? 'בטל נעיצה' : 'notes.pin',
      e => { e.stopPropagation(); patchItem(n.id, { pinned: !n.pinned }); refresh(); }),
    iconBtn('🎨', 'צבע רקע לפתק. עוזר להבדיל בין נושאים במבט מהיר.', e => { e.stopPropagation(); colorPicker(n); }),
    iconBtn('⏰', 'notes.reminder', e => { e.stopPropagation(); reminderPicker(n); }),
    iconBtn('🏷', 'notes.tags', e => { e.stopPropagation(); tagPicker(n); }),
    iconBtn(n.archived ? '↩' : '🗄', n.archived ? 'החזר ללוח' : 'notes.archive',
      e => { e.stopPropagation(); patchItem(n.id, { archived: !n.archived }, (n.archived ? 'החזרת פתק מהארכיון' : 'העברת פתק לארכיון')); toast(n.archived ? 'הוחזר' : 'לארכיון'); refresh(); })
  ));

  return node;
}

function checkRow(n, x) {
  return el('label', { class: 'note-chk' + (x.done ? ' done' : '') },
    el('input', {
      type: 'checkbox', checked: x.done || false,
      onclick: e => e.stopPropagation(),
      onchange: e => {
        update(s => {
          const it = s.items.find(i => i.id === n.id);
          const c = it?.checklist.find(y => y.id === x.id);
          if (c) c.done = e.target.checked;
          if (it) it.updatedAt = Date.now();
        });
        refresh();
      }
    }),
    el('span', {}, x.text || '—')
  );
}

const remLabel = ts => {
  const d = ts - Date.now();
  if (Math.abs(d) < DAY && new Date(ts).toDateString() === new Date().toDateString()) return 'היום ' + hhmm(ts);
  if (d > 0 && d < 2 * DAY) return 'מחר ' + hhmm(ts);
  return dmy(ts) + ' ' + hhmm(ts);
};

/* ================= עורך הפתק ================= */

function editor(id, opts = {}) {
  const n = getItem(id);
  if (!n) return;

  const fTitle = input({ value: n.title || '', placeholder: 'כותרת', style: { fontWeight: '700', fontSize: '16px' } });
  const bodyWrap = el('div', {});
  const attWrap = el('div', { class: 'edit-atts' });
  const tagWrap = el('div', { class: 'edit-tags' });

  /* --- גוף: טקסט או צ'קליסט --- */
  let checklist = JSON.parse(JSON.stringify(n.checklist || []));
  let kind = n.kind || 'note';
  const fBody = textarea({ placeholder: 'מה יש לך?', rows: 6 });
  fBody.value = n.body || '';

  function drawBody() {
    bodyWrap.innerHTML = '';
    if (kind === 'note') { bodyWrap.append(fBody); return; }

    const list = el('div', { class: 'edit-list' });
    checklist.forEach((x, i) => {
      const ti = input({ value: x.text, placeholder: 'פריט', class: 'inp bare' });
      ti.addEventListener('input', e => { checklist[i].text = e.target.value; });
      ti.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checklist.splice(i + 1, 0, { id: uid('c'), text: '', done: false });
          drawBody();
          const inputs = bodyWrap.querySelectorAll('input[type=text],input:not([type])');
          if (inputs[i + 1]) inputs[i + 1].focus();
        }
        if (e.key === 'Backspace' && !e.target.value && checklist.length > 1) {
          e.preventDefault();
          checklist.splice(i, 1); drawBody();
          const inputs = bodyWrap.querySelectorAll('input[type=text],input:not([type])');
          if (inputs[Math.max(0, i - 1)]) inputs[Math.max(0, i - 1)].focus();
        }
      });
      list.append(el('div', { class: 'edit-row' + (x.done ? ' done' : '') },
        el('input', {
          type: 'checkbox', checked: x.done || false,
          onchange: e => { checklist[i].done = e.target.checked; drawBody(); }
        }),
        ti,
        el('button', {
          class: 'icon-sq', 'data-tip': 'מחק שורה',
          onclick: () => { checklist.splice(i, 1); if (!checklist.length) checklist.push({ id: uid('c'), text: '', done: false }); drawBody(); }
        }, '×')
      ));
    });
    list.append(el('button', {
      class: 'btn btn-xs', style: { marginTop: '6px' },
      onclick: () => { checklist.push({ id: uid('c'), text: '', done: false }); drawBody(); }
    }, '+ שורה'));
    bodyWrap.append(list);
  }
  drawBody();

  /* --- קבצים --- */
  let atts = (n.attachments || []).slice();

  function drawAtts() {
    attWrap.innerHTML = '';
    atts.forEach(a => {
      if (a.kind === 'image') {
        const im = el('img', { class: 'att-thumb', alt: a.name });
        A.blobUrl(a.id).then(u => { if (u) im.src = u; });
        attWrap.append(el('div', { class: 'att' }, im,
          el('button', { class: 'att-x', 'data-tip': 'הסר', onclick: () => { atts = atts.filter(x => x.id !== a.id); drawAtts(); } }, '×')));
      } else {
        attWrap.append(el('div', { class: 'att file' },
          el('button', { class: 'file-chip', onclick: () => openAttachment(a) }, '📎 ' + a.name),
          el('button', { class: 'att-x', 'data-tip': 'הסר', onclick: () => { atts = atts.filter(x => x.id !== a.id); drawAtts(); } }, '×')));
      }
    });
  }
  drawAtts();

  const fileInput = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
  fileInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) { toast(`${f.name} גדול מ-25MB — דילגתי`, 'err'); continue; }
      try {
        const { blob, width, height } = await A.prepareFile(f);
        const aid = uid('att');
        await A.putBlob(aid, blob);
        atts.push({
          id: aid, name: f.name, mime: blob.type || f.type, size: blob.size,
          kind: /^image\//.test(f.type) ? 'image' : 'file', width, height
        });
      } catch (err) {
        toast('שמירת ' + f.name + ' נכשלה: ' + (err.message || err), 'err');
      }
    }
    drawAtts();
    fileInput.value = '';
  });

  const pickImages = () => { fileInput.accept = 'image/*'; fileInput.click(); };
  const pickFiles = () => { fileInput.accept = ''; fileInput.click(); };

  /* --- נושאים --- */
  let tags = (n.noteTags || []).slice();
  function drawTags() {
    tagWrap.innerHTML = '';
    S().noteTags.forEach(t => {
      const on = tags.includes(t.id);
      tagWrap.append(el('button', {
        class: 'tag-pill sm' + (on ? ' on' : ''),
        style: on ? { background: t.color, color: '#000', borderColor: t.color } : { borderColor: t.color + '66' },
        onclick: () => { tags = on ? tags.filter(x => x !== t.id) : tags.concat(t.id); drawTags(); }
      }, t.name));
    });
  }
  drawTags();

  /* --- תזכורת --- */
  let reminderAt = n.reminderAt || null;
  const remLine = el('div', { class: 'small muted' });
  function drawRem() {
    remLine.innerHTML = '';
    remLine.append(reminderAt
      ? el('span', {}, '⏰ ' + remLabel(reminderAt), ' ',
        el('button', { class: 'btn btn-xs', onclick: () => { reminderAt = null; drawRem(); } }, 'הסר'))
      : el('span', {}, 'בלי תזכורת'));
  }
  drawRem();

  /* --- הרכבה --- */
  const bText = el('button', {
    class: 'btn btn-xs', 'data-tip': 'notes.kind',
    onclick: () => { kind = 'note'; drawBody(); redrawToggle(); }
  }, 'טקסט');
  const bList = el('button', {
    class: 'btn btn-xs', 'data-tip': 'notes.kind',
    onclick: () => {
      kind = 'list';
      if (!checklist.length) {
        // ממירים שורות טקסט לפריטי רשימה
        const lines = (fBody.value || '').split('\n').map(x => x.trim()).filter(Boolean);
        checklist = (lines.length ? lines : ['']).map(t => ({ id: uid('c'), text: t, done: false }));
      }
      drawBody(); redrawToggle();
    }
  }, 'רשימה');

  function redrawToggle() {
    bText.classList.toggle('btn-y', kind === 'note');
    bList.classList.toggle('btn-y', kind === 'list');
  }
  redrawToggle();

  const body = el('div', {},
    fTitle,
    el('div', { style: { display: 'flex', gap: '6px', margin: '10px 0' } }, bText, bList),
    bodyWrap,
    attWrap,
    el('div', { class: 'hr' }),
    el('div', { class: 'small muted', style: { marginBottom: '5px' } }, 'נושאים'),
    tagWrap,
    el('div', { class: 'hr' }),
    el('div', { style: { display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' } },
      el('button', { class: 'btn btn-xs', 'data-tip': 'notes.files', onclick: pickImages }, '🖼 תמונה'),
      el('button', { class: 'btn btn-xs', 'data-tip': 'notes.files', onclick: pickFiles }, '📎 מסמך'),
      el('button', { class: 'btn btn-xs', 'data-tip': 'notes.reminder', onclick: () => reminderPicker({ id }, ts => { reminderAt = ts; drawRem(); }) }, '⏰ תזכורת'),
      remLine
    ),
    fileInput
  );

  const save = () => {
    patchItem(id, {
      title: fTitle.value.trim(),
      body: kind === 'note' ? fBody.value : n.body,
      kind,
      checklist: checklist.filter(x => x.text.trim() || x.done),
      attachments: atts,
      noteTags: tags,
      reminderAt,
      reminderDone: reminderAt && reminderAt !== n.reminderAt ? false : n.reminderDone
    });
    cleanupBlobs(id, atts);
    refresh();
  };

  modal({
    title: n.title || 'פתק',
    body, wide: true,
    onClose: () => {
      // פתק שנוצר ונשאר ריק לגמרי — נמחק, שלא יתמלא הלוח בזבל
      const cur = getItem(id);
      if (cur && !cur.title && !cur.body && !(cur.attachments || []).length &&
        !(cur.checklist || []).some(x => x.text.trim()) && !fTitle.value.trim() &&
        !fBody.value.trim() && !atts.length && !checklist.some(x => x.text.trim())) {
        removeItem(id); refresh(); return;
      }
      save();
    },
    actions: [
      {
        label: 'מחק', cls: 'btn-danger', onClick: () => {
          confirmBox('למחוק את הפתק? הקבצים המצורפים יימחקו איתו.', async () => {
            for (const a of atts) { await A.delBlob(a.id); A.releaseUrl(a.id); }
            removeItem(id); refresh();
          });
          return false;
        }
      },
      'spacer',
      { label: 'סגור ושמור', cls: 'btn-y' }
    ]
  });
}

/** מוחק קבצים שהוסרו מהפתק */
async function cleanupBlobs(noteId, keep) {
  const n = getItem(noteId);
  if (!n) return;
  const keepIds = new Set(keep.map(a => a.id));
  const before = (n.attachments || []).map(a => a.id);
  for (const id of before) if (!keepIds.has(id)) { await A.delBlob(id); A.releaseUrl(id); }
}

/* ================= פתיחת קובץ ================= */

async function openAttachment(a) {
  const url = await A.blobUrl(a.id);
  if (!url) { toast('הקובץ לא נמצא', 'err'); return; }
  if (a.kind === 'image') {
    modal({
      title: a.name, wide: true,
      body: el('div', { style: { textAlign: 'center' } },
        el('img', { src: url, style: { maxWidth: '100%', borderRadius: '10px' } }),
        el('div', { class: 'small muted', style: { marginTop: '8px' } }, A.fmtSize(a.size)))
    });
  } else {
    const link = document.createElement('a');
    link.href = url; link.download = a.name; link.click();
  }
}

/* ================= בוררים ================= */

function colorPicker(n) {
  const box = el('div', { class: 'color-grid' });
  Object.entries(COLORS).forEach(([k, c]) => {
    box.append(el('button', {
      class: 'color-dot' + (n.color === k ? ' on' : ''),
      style: { background: c.bg, borderColor: c.line },
      'data-tip': c.name,
      onclick: () => { patchItem(n.id, { color: k }); closeModal(); refresh(); }
    }));
  });
  modal({ title: 'צבע הפתק', body: box });
}

function tagPicker(n) {
  let tags = (n.noteTags || []).slice();
  const box = el('div', { class: 'edit-tags' });
  const draw = () => {
    box.innerHTML = '';
    S().noteTags.forEach(t => {
      const on = tags.includes(t.id);
      box.append(el('button', {
        class: 'tag-pill sm' + (on ? ' on' : ''),
        style: on ? { background: t.color, color: '#000', borderColor: t.color } : { borderColor: t.color + '66' },
        onclick: () => { tags = on ? tags.filter(x => x !== t.id) : tags.concat(t.id); draw(); }
      }, t.name));
    });
  };
  draw();
  modal({
    title: 'נושאים', body: el('div', {}, box,
      el('button', { class: 'btn btn-xs', style: { marginTop: '11px' }, onclick: () => { closeModal(); newTagPrompt(); } }, '+ נושא חדש')),
    actions: [{ label: 'ביטול' }, {
      label: 'שמור', cls: 'btn-y',
      onClick: () => { patchItem(n.id, { noteTags: tags }); refresh(); }
    }]
  });
}

/** בורר תזכורת. onPick אופציונלי — אם לא הועבר, שומר ישר על הפתק */
function reminderPicker(n, onPick) {
  const now = new Date();
  const at = (d, h, m = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.getTime(); };
  const quick = [
    { label: 'עוד שעה', ts: Date.now() + 60 * MIN },
    { label: 'היום בערב (19:00)', ts: at(0, 19) },
    { label: 'מחר בבוקר (9:00)', ts: at(1, 9) },
    { label: 'עוד שבוע', ts: at(7, 9) }
  ].filter(q => q.ts > Date.now());

  const fD = input({ type: 'date', value: dateInput(Date.now() + DAY) });
  const fT = input({ type: 'time', value: '09:00' });

  const apply = ts => {
    if (onPick) onPick(ts);
    else { patchItem(n.id, { reminderAt: ts, reminderDone: false }); refresh(); }
    toast('תזכורת נקבעה ל' + remLabel(ts), 'ok');
    closeModal();
  };

  const box = el('div', {},
    el('div', { class: 'muted small', style: { marginBottom: '11px' } },
      'התזכורת תופיע בבית ובהתראות הדפדפן. התראות דפדפן עובדות רק כשהדפדפן פתוח.'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '13px' } },
      ...quick.map(q => el('button', { class: 'btn', style: { textAlign: 'right' }, onclick: () => apply(q.ts) }, q.label))),
    el('div', { class: 'hr' }),
    el('div', { class: 'row' }, field('תאריך', fD), field('שעה', fT))
  );

  modal({
    title: 'תזכורת', body: box,
    actions: [{ label: 'ביטול' }, {
      label: 'קבע', cls: 'btn-y', onClick: () => {
        const ts = new Date(fD.value + 'T' + (fT.value || '09:00')).getTime();
        if (!ts || Number.isNaN(ts)) { toast('תאריך לא תקין', 'err'); return; }
        apply(ts);
      }
    }]
  });
}

/* ================= ניהול נושאים ================= */

function tagManager() {
  const box = el('div', {});
  const draw = () => {
    box.innerHTML = '';
    box.append(el('div', { class: 'muted small', style: { marginBottom: '12px' } },
      'נושא הוא כמו תיקייה או פרויקט. פתק יכול לשבת בכמה נושאים.'));
    S().noteTags.forEach(t => {
      const nm = input({ value: t.name, style: { flex: 1 } });
      nm.addEventListener('change', () => { patchNoteTag(t.id, { name: nm.value }); refresh(); });
      const col = el('input', {
        type: 'color', value: t.color, class: 'color-in',
        onchange: e => { patchNoteTag(t.id, { color: e.target.value }); refresh(); }
      });
      const count = S().items.filter(i => i.type === 'note' && (i.noteTags || []).includes(t.id)).length;
      box.append(el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } },
        col, nm,
        el('span', { class: 'small muted', style: { flex: '0 0 60px', textAlign: 'center' } }, count + ' פתקים'),
        el('button', {
          class: 'btn btn-xs btn-danger',
          onclick: () => confirmBox(
            `למחוק את "${t.name}"? הפתקים עצמם יישארו — רק הנושא יוסר מהם.`,
            () => { removeNoteTag(t.id); draw(); refresh(); })
        }, '×')
      ));
    });
    box.append(el('button', {
      class: 'btn btn-y', style: { marginTop: '9px' },
      onclick: () => { addNoteTag('נושא חדש', '#5aa9ff'); draw(); refresh(); }
    }, '+ נושא'));
  };
  draw();
  modal({ title: 'נושאים', body: box, actions: [{ label: 'סגור', cls: 'btn-y' }] });
}

/* מאפשר לקלט החופשי ולחיפוש לפתוח פתק */
export { editor as openNote };
