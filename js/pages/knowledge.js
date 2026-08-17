/* ============================================================
   knowledge.js — הבעיה מספר אחת: דברים ללמוד שנערמים ונשכחים
   ציון רלוונטיות שמחזיר אותו לפריט הנכון בזמן הנכון
   ============================================================ */

import { S, update, addItem, patchItem, getItem, removeItem } from '../store.js';
import { el, ago, dur, toast, modal, input, select, textarea, field, confirmBox, dmy, MIN, DAY } from '../util.js';
import * as T from '../timer.js';
import { rankedKnowledge, knowledgeScore } from '../brain.js';
import { refresh, openItem } from '../app.js';
import { previewCard } from '../previewcard.js';
import { addLink } from '../links.js';
import { hintBadge } from '../help.js';

export default { render };

const STATUS = {
  new: { label: 'חדש', cls: '' },
  doing: { label: 'בתהליך', cls: 'pill-y' },
  done: { label: 'נצפה', cls: 'pill-g' },
  irrelevant: { label: 'לא רלוונטי', cls: '' }
};

let filter = 'open';

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'ידע'),
    el('div', { class: 'desc' }, 'מה שנערם ונשכח — כאן הוא חוזר'),
    el('div', { class: 'right' },
      ...[['open', 'פתוחים'], ['all', 'הכל'], ['done', 'נצפו'], ['archive', 'ארכיון']].map(([k, l]) =>
        el('button', { class: 'btn btn-sm ' + (filter === k ? 'btn-y' : ''), onclick: () => { filter = k; refresh(); } }, l)),
      el('button', { class: 'btn btn-sm btn-y', onclick: () => form() }, '+ פריט ידע')
    )
  ));

  const ranked = rankedKnowledge();
  const top = ranked[0];

  if (top && filter === 'open') {
    const c = el('div', { class: 'card', style: { borderColor: 'rgba(255,212,0,.4)', background: 'linear-gradient(135deg,rgba(255,212,0,.07),transparent)' } });
    c.append(el('div', { class: 'small', style: { color: '#ffd400', marginBottom: '6px' } }, 'הכי רלוונטי עכשיו'));
    c.append(el('div', { style: { fontSize: '19px', fontWeight: '800' } }, top.item.title));
    c.append(el('div', { class: 'muted small', style: { marginTop: '5px' } }, 'נבחר כי ' + top.why + '.'));
    c.append(el('div', { style: { display: 'flex', gap: '7px', marginTop: '12px', flexWrap: 'wrap' } },
      el('button', {
        class: 'btn btn-sm btn-y', onclick: () => {
          T.startTimer(top.item.id, 'learn');
          if (top.item.url) window.open(top.item.url, '_blank', 'noopener');
          refresh();
        }
      }, '▶ מתחיל עכשיו'),
      top.item.url ? el('a', { class: 'btn btn-sm', href: top.item.url, target: '_blank', rel: 'noopener' }, 'פתח לינק') : null,
      el('button', { class: 'btn btn-sm', onclick: () => markDone(top.item) }, 'כבר ראיתי'),
      el('button', { class: 'btn btn-sm', onclick: () => { patchItem(top.item.id, { lastTouched: Date.now() }); toast('נדחה — יחזור בעוד כמה ימים'); refresh(); } }, 'לא עכשיו')
    ));
    root.append(c);
  }

  const all = s.items.filter(i => i.type === 'knowledge');
  const list = all.filter(k => {
    if (filter === 'archive') return k.archived;
    if (k.archived) return false;
    if (filter === 'open') return k.status !== 'done' && k.status !== 'irrelevant';
    if (filter === 'done') return k.status === 'done';
    return true;
  });

  const scored = list.map(k => ({ item: k, ...knowledgeScore(k) }))
    .sort((a, b) => b.score - a.score);

  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, filter === 'archive' ? 'ארכיון' : 'הרשימה'),
    el('span', { class: 'sub' }, `${scored.length} פריטים · ממוין לפי רלוונטיות`)));

  if (!scored.length) {
    card.append(el('div', { class: 'empty' },
      'ריק. הדבק לינק בשורת הקלט למעלה — הוא ייכנס לכאן לבד.'));
  }

  const wrap = el('div', { class: 'klist' });
  scored.forEach((x, i) => wrap.append(row(x, i === 0 && filter === 'open')));
  card.append(wrap);
  root.append(card);
}

function row(x, isTop) {
  const k = x.item;
  const running = T.activeTimer() && T.activeTimer().itemId === k.id;
  const st = STATUS[k.status] || STATUS.new;
  const rel = k.relatedItemId ? getItem(k.relatedItemId) : null;

  const node = el('div', { class: 'kitem' + (isTop ? ' top' : '') });
  const head = el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } });

  head.append(el('div', { style: { flex: 1, minWidth: 0, cursor: 'pointer' }, onclick: () => form(k) },
    el('div', { style: { fontWeight: '600', display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' } },
      k.title,
      k.urgent ? el('span', { class: 'pill pill-r' }, 'דחוף') : null
    ),
    el('div', { class: 'small muted', style: { marginTop: '3px' } }, x.why),
    k.note ? el('div', { class: 'small muted', style: { marginTop: '4px', opacity: '.8' } }, k.note.slice(0, 130)) : null
  ));

  head.append(el('div', { style: { display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' } },
    el('span', { class: 'kscore', 'data-tip': 'know.score' }, Math.round(x.score)),
    el('span', { class: 'pill ' + st.cls }, st.label),
    el('span', { class: 'pill' }, (k.estMinutes || 20) + ' דק\'')
  ));
  node.append(head);

  // תצוגה מקדימה של הלינק — כדי שבעוד חודש תזהה על מה מדובר
  if (k.url) node.append(previewCard(k.id, { onDone: () => refresh() }));

  const acts = el('div', { style: { display: 'flex', gap: '5px', marginTop: '9px', flexWrap: 'wrap', alignItems: 'center' } });
  acts.append(el('button', {
    class: 'btn btn-xs ' + (running ? 'btn-y' : ''),
    onclick: () => { T.startTimer(k.id, 'learn'); refresh(); }
  }, running ? '● לומד' : '▶ ללמוד'));

  const stSel = select(Object.entries(STATUS).map(([v, o]) => ({ value: v, label: o.label })), k.status || 'new',
    { style: { width: 'auto', padding: '3px 8px', fontSize: '12px' } });
  stSel.addEventListener('change', e => {
    if (e.target.value === 'done') { markDone(k); return; }
    patchItem(k.id, { status: e.target.value, lastTouched: Date.now() });
    refresh();
  });
  acts.append(stSel);

  if (rel) acts.append(el('span', { class: 'pill', style: { cursor: 'pointer' }, onclick: () => openItem(rel.id) }, '↔ ' + rel.title));
  if ((k.tags || []).length) (k.tags || []).forEach(t => acts.append(el('span', { class: 'pill' }, '#' + t)));

  acts.append(el('span', { style: { flex: 1 } }));
  acts.append(el('button', {
    class: 'btn btn-xs', 'data-tip': 'know.archive',
    onclick: () => { patchItem(k.id, { archived: !k.archived }, (k.archived ? 'החזרה מהארכיון: ' : 'העברה לארכיון: ') + k.title); toast(k.archived ? 'הוחזר' : 'לארכיון'); refresh(); }
    , 'aria-label': k.archived ? 'שחזר מהארכיון' : 'לארכיון'
  }, k.archived ? '↩' : '🗄'));
  node.append(acts);
  return node;
}

/* ================= הגשר: מידע → פעולה =================
   פריט ידע שמסומן "נצפה" ונעלם הוא למידה שנמחקה מרשימה.
   שאלה אחת קצרה הופכת אותו למשהו שנשאר. */

export function markDone(k) {
  const ta = textarea({
    placeholder: 'מה השורה התחתונה? מה עושים עם זה?', rows: 3,
    value: k.resolution || ''
  });
  const micWrap = el('div', { style: { marginTop: '6px' } });
  import('../voice.js').then(V => {
    const b = V.micButton(ta, { el, toast });
    if (b) micWrap.append(b);
  }).catch(() => { });

  const mk = { note: true, task: false };
  const cbNote = el('input', {
    type: 'checkbox', checked: true,
    style: { width: '15px', height: '15px', accentColor: '#ffd400', cursor: 'pointer' },
    onchange: e => mk.note = e.target.checked
  });
  const cbTask = el('input', {
    type: 'checkbox',
    style: { width: '15px', height: '15px', accentColor: '#ffd400', cursor: 'pointer' },
    onchange: e => mk.task = e.target.checked
  });

  const body = el('div', {},
    el('div', { class: 'muted small', style: { marginBottom: '11px', lineHeight: '1.75' } },
      'למדת משהו. אם זה לא ייכתב עכשיו, בעוד שבוע לא תזכור שלמדת. ' +
      'משפט אחד מספיק — ואפשר גם לדלג.'),
    el('div', { style: { fontWeight: '600', marginBottom: '5px' } }, k.title),
    ta, micWrap,
    el('div', { class: 'hr' }),
    el('label', { class: 'chk' }, cbNote, el('span', {}, 'שמור כפתק בפנקס (נושא: לפי התגיות)')),
    el('label', { class: 'chk' }, cbTask, el('span', {}, 'ופתח משימה — יש כאן משהו לעשות'))
  );

  modal({
    title: 'מה למדת?',
    body,
    actions: [
      { label: 'דלג', onClick: () => { patchItem(k.id, { status: 'done', lastTouched: Date.now() }); toast('סומן כנצפה'); refresh(); } },
      'spacer',
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const text = ta.value.trim();
          patchItem(k.id, { status: 'done', lastTouched: Date.now(), resolution: text }, 'סיום פריט ידע');

          if (text && mk.note) {
            const tagIds = matchTags(k.tags || []);
            const note = addItem({
              type: 'note', kind: 'note',
              title: k.title,
              body: text + (k.url ? '\n\n' + k.url : ''),
              url: k.url || '',
              noteTags: tagIds,
              links: [k.id]
            });
            addLink(k.id, note.id);
          }
          if (text && mk.task) {
            const t = addItem({ type: 'task', title: firstLine(text), note: 'מתוך: ' + k.title, links: [k.id] });
            addLink(k.id, t.id);
          }

          toast(text ? 'נשמר — הידע לא הלך לאיבוד' : 'סומן כנצפה', 'ok');
          refresh();
        }
      }
    ]
  });
}

const firstLine = t => (t.split('\n')[0] || t).slice(0, 90);

/** מנסה להתאים את תגיות פריט הידע לנושאי הפנקס */
function matchTags(tags) {
  const nt = S().noteTags;
  const out = [];
  tags.forEach(t => {
    const hit = nt.find(x => x.name === t || x.name.includes(t) || t.includes(x.name));
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  });
  return out;
}

/* ================= טופס ================= */

export function form(existing) {
  const s = S();
  const k = existing || {};
  const fT = input({ value: k.title || '', placeholder: 'מה יש ללמוד' });
  const fU = input({ value: k.url || '', placeholder: 'https://…', dir: 'ltr' });
  const fN = textarea({ placeholder: 'למה זה מעניין, מה לבדוק' });
  fN.value = k.note || '';
  const fTags = input({ value: (k.tags || []).join(', '), placeholder: 'סרטונים, סוכנת, תמחור' });
  const fEst = input({ type: 'number', value: k.estMinutes ?? 20 });
  const fUrg = select([{ value: '0', label: 'רגיל' }, { value: '1', label: 'דחוף' }], k.urgent ? '1' : '0');
  const rels = [{ value: '', label: '— בלי קשר —' },
  ...s.items.filter(i => !i.archived && ['client', 'task', 'decision'].includes(i.type)).map(i => ({ value: i.id, label: i.title }))];
  const fRel = select(rels, k.relatedItemId || '');

  modal({
    title: existing ? 'עריכת פריט ידע' : 'פריט ידע חדש',
    body: el('div', {},
      field('כותרת', fT),
      field('לינק', fU),
      field('הערה', fN),
      field('תגיות', fTags, 'מופרדות בפסיק — משמשות לקשר לפריטים פעילים'),
      el('div', { class: 'row' },
        field(el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'זמן משוער (דקות)', hintBadge('know.est')), fEst),
        field('דחיפות', fUrg),
        field(el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'קשור ל', hintBadge('know.related')), fRel))
    ),
    actions: [
      existing ? { label: 'מחק', cls: 'btn-danger', onClick: () => { confirmBox('למחוק לגמרי? אפשר במקום זה לשלוח לארכיון.', () => { removeItem(existing.id); refresh(); }); return false; } } : null,
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const data = {
            title: fT.value.trim() || 'ללא כותרת',
            url: fU.value.trim(),
            note: fN.value,
            tags: fTags.value.split(',').map(x => x.trim()).filter(Boolean),
            estMinutes: Number(fEst.value) || 20,
            urgent: fUrg.value === '1',
            relatedItemId: fRel.value || null
          };
          if (existing) patchItem(existing.id, data);
          else addItem(Object.assign({ type: 'knowledge' }, data));
          toast('נשמר', 'ok'); refresh();
        }
      }
    ].filter(Boolean)
  });
}
