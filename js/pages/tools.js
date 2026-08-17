/* ============================================================
   tools.js — קישורים למה שכבר בנוי
   ============================================================ */

import { S, update, uid } from '../store.js';
import { el, toast, modal, input, field, confirmBox } from '../util.js';
import { refresh } from '../app.js';
import { hintBadge, labelWithHint } from '../help.js';

export default { render };

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'כלים'),
    el('div', { class: 'desc' }, 'קיצורי דרך לכל מה שכבר בנית', hintBadge('tools.link')),
    el('div', { class: 'right' }, el('button', { class: 'btn btn-sm btn-y', onclick: () => form() }, '+ קישור'))
  ));

  const grid = el('div', { class: 'grid g3' });
  s.links.forEach(l => {
    const card = el('div', { class: 'card' });
    card.append(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('a', { href: l.url, target: '_blank', rel: 'noopener', style: { fontWeight: '700', fontSize: '15px' } }, l.title),
        el('div', { class: 'small muted', style: { marginTop: '3px' } }, l.desc || ''),
        el('div', { class: 'small', style: { marginTop: '6px', color: 'rgba(255,255,255,.28)', direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, l.url)
      ),
      el('button', { class: 'btn btn-xs', onclick: () => form(l), 'aria-label': 'עריכה' }, '✎')
    ));
    card.append(el('div', { style: { marginTop: '11px' } },
      el('a', { class: 'btn btn-sm btn-y', href: l.url, target: '_blank', rel: 'noopener' }, 'פתח ↗')));
    grid.append(card);
  });
  root.append(grid);

  root.append(el('div', { class: 'card', style: { marginTop: '14px' } },
    el('div', { class: 'card-h' },
      el('h3', {}, 'המחירים שלך'),
      el('span', { class: 'sub' }, 'משתנים בצינור → ⚙ שלבים')),
    el('div', { class: 'small muted', style: { lineHeight: '1.8' } },
      ...s.productLines.map(p => el('div', {},
        el('b', {}, p.name + ': '),
        p.pricing?.unit ? `${p.pricing.unit} ₪ ליחידה` : 'עוד לא תומחר',
        p.pricing?.bundle ? ` · ${p.pricing.bundle} ₪ ל-${p.pricing.bundleQty || 4} בחודש` : '',
        p.pricing?.deliveryDays ? ` · אספקה ${p.pricing.deliveryDays} ימי עסקים` : ''
      ))
    )));
}

function form(existing) {
  const l = existing || {};
  const fT = input({ value: l.title || '', placeholder: 'שם הכלי' });
  const fU = input({ value: l.url || '', placeholder: 'https://…', dir: 'ltr' });
  const fD = input({ value: l.desc || '', placeholder: 'שורה אחת שמסבירה מה זה' });

  modal({
    title: existing ? 'עריכת קישור' : 'קישור חדש',
    body: el('div', {}, field('שם', fT), field('כתובת', fU), field('תיאור', fD)),
    actions: [
      existing ? {
        label: 'מחק', cls: 'btn-danger',
        onClick: () => { confirmBox('למחוק את הקישור?', () => { update(s => { s.links = s.links.filter(x => x.id !== existing.id); }); refresh(); }); return false; }
      } : null,
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          let url = fU.value.trim();
          if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
          const data = { title: fT.value.trim() || 'ללא שם', url, desc: fD.value.trim() };
          update(s => {
            if (existing) Object.assign(s.links.find(x => x.id === existing.id), data);
            else s.links.push(Object.assign({ id: uid('l') }, data));
          });
          toast('נשמר', 'ok'); refresh();
        }
      }
    ].filter(Boolean)
  });
}
