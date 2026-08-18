/* ============================================================
   inbox.js — המסך של תיבת הנכנס
   ------------------------------------------------------------
   שורה אחת לכל דבר שהגיע מבחוץ, וכפתור אחד שמאשר. הכל אמור
   להיות מובן בלי לפתוח כלום: מי, כמה, ומה יקרה כשתלחץ.

   "מה יקרה כשתלחץ" הוא לא קישוט. הכפתור פותח לקוח, מתחיל
   שעון ורושם הכנסה — ומי שלא יודע את זה מראש ילחץ בזהירות
   או לא ילחץ בכלל.
   ============================================================ */

import { S, getItem } from '../store.js';
import { el, nis, ago, dmy, hhmm, toast, modal, closeModal, select, confirmBox } from '../util.js';
import { refresh, openItem } from '../app.js';
import { hintBadge } from '../help.js';
import * as IN from '../inbox.js';

export default { render };

let showHandled = false;

function render(root) {
  const pending = IN.pending();
  const handled = IN.handled();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'נכנס'),
    el('div', { class: 'desc' },
      'כל מה שנוצר מבחוץ — תשלומים ושיחות — ממתין כאן לאישור שלך. ' +
      'עד שלא אישרת, שום דבר לא נכנס לצינור.',
      hintBadge('inbox.what'))
  ));

  /* ---- ממתינים ---- */
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'ממתין לאישור'),
    el('span', { class: 'sub' }, pending.length ? pending.length + '' : '')));

  if (!pending.length) {
    card.append(el('div', { class: 'empty' },
      'ריק. כשיתקבל תשלום או תסתיים שיחה עם הסוכנת — זה יופיע כאן.'));
  }
  pending.forEach(r => card.append(row(r, true)));
  root.append(card);

  /* ---- טופלו ---- */
  if (handled.length) {
    const c2 = el('div', { class: 'card', style: { marginTop: '14px' } });
    c2.append(el('div', { class: 'card-h' },
      el('h3', {}, 'טופלו'),
      el('span', { class: 'sub' }, handled.length + ''),
      el('div', { class: 'right' }, el('button', {
        class: 'btn btn-xs', onclick: () => { showHandled = !showHandled; refresh(); }
      }, showHandled ? 'הסתר' : 'הצג'))));
    if (showHandled) handled.slice(0, 40).forEach(r => c2.append(row(r, false)));
    root.append(c2);
  }
}

/* ============================================================
   שורה
   ============================================================ */

function row(r, actionable) {
  const meta = IN.kindMeta(r.kind);
  const f = r.fields || {};

  const bits = [
    f.amount ? nis(f.amount) : null,
    f.product === 'bundle' ? 'חבילה חודשית' : f.product === 'single' ? 'סרטון בודד' : null,
    f.phone || null,
    f.business || null,
    r.source || null
  ].filter(Boolean);

  const box = el('div', { class: 'inbox-row' + (r.status === 'rejected' ? ' dim' : '') });

  box.append(el('span', {
    class: 'inbox-kind',
    style: { background: meta.color + '22', color: meta.color },
    title: meta.name
  }, meta.icon));

  const mid = el('div', { style: { flex: 1, minWidth: 0 } },
    el('div', { style: { fontWeight: '600' } }, r.title || meta.name),
    el('div', { class: 'small muted' },
      [meta.name, ...bits].join(' · ') + ' · ' + ago(r.at)));
  if (r.note) mid.append(el('div', { class: 'small', style: { color: 'var(--yellow)', marginTop: '3px' } }, r.note));
  if (r.status === 'accepted' && r.resultId) {
    const it = getItem(r.resultId);
    if (it) mid.append(el('button', {
      class: 'btn btn-xs', style: { marginTop: '5px' }, onclick: () => openItem(r.resultId)
    }, '↗ פתח את מה שנוצר'));
  }
  box.append(mid);

  if (!actionable) {
    box.append(el('span', { class: 'pill ' + (r.status === 'accepted' ? 'pill-g' : '') },
      r.status === 'accepted' ? 'אושר' : 'נדחה'));
    box.append(el('button', {
      class: 'btn btn-xs', title: 'החזר לממתינים',
      onclick: () => { IN.reopen(r.id); toast('חזר לממתינים'); refresh(); }
    }, '↩'));
    return box;
  }

  const acts = el('div', { class: 'inbox-acts' });
  acts.append(el('button', {
    class: 'btn btn-xs btn-y',
    onclick: () => confirmAccept(r)
  }, 'אשר'));
  acts.append(el('button', {
    class: 'btn btn-xs', title: 'הצג את מה שהתקבל',
    onclick: () => modal({
      title: r.title || IN.kindMeta(r.kind).name,
      body: el('div', {},
        el('div', { class: 'small muted', style: { marginBottom: '8px' } },
          `${dmy(r.at)} ${hhmm(r.at)} · ${r.source || 'לא צוין מקור'}` +
          (r.dedupeKey ? ` · מזהה ${r.dedupeKey}` : '')),
        el('pre', { class: 'brief-raw' }, r.raw || JSON.stringify(r.fields, null, 2))),
      actions: ['spacer', { label: 'סגור' }]
    })
  }, '👁'));
  acts.append(el('button', {
    class: 'btn btn-xs btn-danger', title: 'לא רלוונטי',
    onclick: () => confirmBox('לדחות את "' + (r.title || 'הרשומה') + '"? אפשר יהיה להחזיר.',
      () => { IN.reject(r.id); toast('נדחה'); refresh(); })
  }, '✕'));
  box.append(acts);
  return box;
}

/* ============================================================
   אישור — אומרים מה עומד לקרות לפני שקורה
   ============================================================ */

function confirmAccept(r) {
  const f = r.fields || {};
  const guess = IN.findClient(f);
  const clients = S().items.filter(i => i.type === 'client' && !i.archived);

  const pick = select(
    [{ value: '', label: guess ? `זוהה לבד — ${guess.title}` : '— לקוח חדש —' },
    ...clients.map(c => ({ value: c.id, label: c.title }))], '');

  const what =
    r.kind === 'payment'
      ? (guess
        ? `הפקה חדשה ל${guess.title}, התשלום יירשם, ושעון ${'7'} ימי העסקים יתחיל.`
        : `לקוח חדש${f.name ? ' — ' + f.name : ''}, הפקה ראשונה, רישום התשלום, והשעון מתחיל.`)
      : r.kind === 'call-brief'
        ? (guess ? `תמליל השיחה יתווסף ל"מה סוכם איתם" של ${guess.title}.` : 'צריך לבחור לקוח — אחרת אין לאן לצרף את השיחה.')
        : (guess ? `${guess.title} כבר קיים — לא ייפתח לקוח נוסף.` : 'ליד חדש בצינור, עם תמליל השיחה מצורף.');

  modal({
    title: 'לאשר?',
    body: el('div', {},
      el('div', { style: { marginBottom: '12px', lineHeight: '1.7' } }, what),
      r.kind === 'payment' && !f.verified
        ? el('div', { class: 'alert warn', style: { marginBottom: '12px' } },
          el('div', {}, 'התשלום הזה לא אומת אוטומטית. ודא שהכסף באמת התקבל לפני שאתה מאשר.'))
        : null,
      el('div', { class: 'small muted', style: { marginBottom: '5px' } }, 'שייך ללקוח'),
      pick),
    actions: [
      { label: 'ביטול' },
      {
        label: 'אשר', cls: 'btn-y', onClick: () => {
          const out = IN.accept(r.id, pick.value ? { clientId: pick.value } : {});
          if (out.error) { toast(out.error, 'err'); return false; }
          toast(out.message || 'אושר', 'ok');
          closeModal();
          refresh();
        }
      }
    ]
  });
}
