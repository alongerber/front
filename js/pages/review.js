/* ============================================================
   review.js — הסקירה השבועית
   ------------------------------------------------------------
   מערכת מעקב מראה לך נתונים. מערכת שמנהלת אותך עוצרת אותך פעם
   בשבוע ושואלת: מה נמסר, לאן הלכו השעות, מה תקוע, ומה לזרוק.

   הכל נבנה מנתונים שכבר יש. קלוד רק כותב את פסקת הסיכום, ורק
   אם ביקשת.
   ============================================================ */

import { S, update, patchItem, getItem, monthMoney, monthlySubsILS, lineOf } from '../store.js';
import { el, dur, nis, num, dmy, dayName, ago, toast, modal, closeModal, textarea, startOfDay, MIN, HOUR, DAY } from '../util.js';
import * as T from '../timer.js';
import * as SM from '../sampling.js';
import * as MO from '../money.js';
import { hintBadge } from '../help.js';
import { refresh, openItem } from '../app.js';
import { callAssistant } from '../api.js';

export default { render };

const now = () => Date.now();

/** תחילת השבוע: ראשון האחרון */
function weekStart(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() - offset * 7);
  return d.getTime();
}

let weekOffset = 0;

/* ============================================================ */

function render(root) {
  const from = weekStart(weekOffset);
  const to = Math.min(now(), from + 7 * DAY);
  const d = data(from, to);

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'סקירה שבועית'),
    el('div', { class: 'desc' }, 'פעם בשבוע עוצרים ומסתכלים', hintBadge('review.what')),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-xs', onclick: () => { weekOffset++; refresh(); } }, '→ שבוע קודם'),
      el('span', { class: 'small', style: { padding: '0 6px' } },
        weekOffset === 0 ? 'השבוע' : `${dmy(from)} – ${dmy(from + 6 * DAY)}`),
      el('button', {
        class: 'btn btn-xs', disabled: weekOffset === 0,
        onclick: () => { weekOffset = Math.max(0, weekOffset - 1); refresh(); }
      }, 'הבא ←')
    )
  ));

  root.append(numbers(d));
  root.append(whereTime(d));
  root.append(el('div', { class: 'grid g2' }, shipped(d), stuck(d)));
  root.append(dropList(d));
  root.append(summaryCard(d));
  root.append(closeCard(d, from));
}

/* ---------- איסוף ---------- */

function data(from, to) {
  const s = S();
  const focus = T.focusMs(null, from, to);
  const gross = T.grossFocusMs(null, from, to);
  const wait = T.waitMs(null, from, to);

  const delivered = s.items.filter(i => i.type === 'client' && i.deliveredAt >= from && i.deliveredAt < to);
  const paid = s.items.filter(i => i.type === 'client' && i.paidAt >= from && i.paidAt < to);
  const newLeads = s.items.filter(i => i.type === 'client' && i.createdAt >= from && i.createdAt < to);
  const income = paid.reduce((a, c) => a + (c.amount || 0), 0) +
    s.ledger.filter(l => l.amount > 0 && l.date >= from && l.date < to).reduce((a, l) => a + l.amount, 0);
  const spend = s.ledger.filter(l => l.amount < 0 && l.date >= from && l.date < to)
    .reduce((a, l) => a + Math.abs(l.amount), 0);

  /* לאן הלכו השעות */
  const byItem = new Map();
  const addMs = (id, ms) => { if (ms > 0) byItem.set(id, (byItem.get(id) || 0) + ms); };
  s.items.forEach(i => {
    if (!['client', 'bucket', 'task', 'knowledge'].includes(i.type)) return;
    addMs(i.id, T.focusMs(i.id, from, to));
  });
  const hours = Array.from(byItem.entries())
    .map(([id, ms]) => ({ item: getItem(id), ms }))
    .filter(x => x.item && x.ms > 5 * MIN)
    .sort((a, b) => b.ms - a.ms);

  /* תקועים */
  const stuckItems = s.items.filter(i => {
    if (i.archived) return false;
    if (i.type === 'client' && !i.deliveredAt)
      return now() - (i.stageSince || i.createdAt) > 5 * DAY;
    if (i.type === 'task' && !i.done) return now() - i.createdAt > 14 * DAY;
    if (i.type === 'decision' && i.status === 'open') return now() - i.createdAt > 14 * DAY;
    return false;
  }).sort((a, b) => (a.stageSince || a.createdAt) - (b.stageSince || b.createdAt));

  /* מועמדים לזריקה: יושבים חודש ואף אחד לא נגע */
  const drop = s.items.filter(i =>
    !i.archived && ['idea', 'knowledge', 'task'].includes(i.type) &&
    now() - (i.updatedAt || i.createdAt) > 30 * DAY &&
    !(i.type === 'task' && i.done) &&
    !(i.type === 'knowledge' && i.status === 'done')
  ).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0)).slice(0, 8);

  const sampleStats = SM.stats({ from, to });

  return {
    from, to, focus, gross, wait, delivered, paid, newLeads, income, spend,
    hours, stuck: stuckItems, drop, sampleStats,
    days: Math.max(1, Math.round((to - from) / DAY))
  };
}

/* ---------- מספרים ---------- */

function numbers(d) {
  const perDay = d.focus / d.days;
  const perVideo = d.delivered.length ? d.focus / d.delivered.length : 0;

  return el('div', { class: 'grid g4' },
    stat('נמסרו', String(d.delivered.length), d.delivered.length ? 'y' : '',
      d.delivered.length ? d.delivered.map(c => c.title).join(', ').slice(0, 40) : 'שבוע בלי מסירה'),
    stat('זמן עבודה נטו', dur(d.focus, true), '',
      `${dur(perDay, true)} ביום בממוצע` + (d.gross - d.focus > MIN ? ` · נגרעו ${dur(d.gross - d.focus, true)}` : '')),
    stat('נכנס', nis(d.income), d.income > d.spend ? 'g' : '',
      d.spend ? `יצא ${nis(d.spend)}` : 'בלי הוצאות רשומות'),
    stat('לידים חדשים', String(d.newLeads.length), '',
      perVideo ? `${dur(perVideo, true)} לסרטון שנמסר` : 'עוד לא נמסר כלום השבוע')
  );
}

const stat = (lbl, val, cls, sub) => el('div', { class: 'stat ' + (cls || '') },
  el('div', { class: 'lbl' }, lbl),
  el('div', { class: 'val' }, val),
  el('div', { class: 'sub' }, sub || ''));

/* ---------- לאן הלכו השעות ---------- */

function whereTime(d) {
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'לאן הלכו השעות', hintBadge('review.hours')),
    el('span', { class: 'sub' }, 'לקוחות מול העסק עצמו')));

  if (!d.hours.length) {
    card.append(el('div', { class: 'empty' }, 'לא נרשם זמן השבוע.'));
    return card;
  }

  const total = d.hours.reduce((a, x) => a + x.ms, 0);
  const clientMs = d.hours.filter(x => x.item.type === 'client').reduce((a, x) => a + x.ms, 0);
  const bizMs = d.hours.filter(x => x.item.type === 'bucket').reduce((a, x) => a + x.ms, 0);

  d.hours.slice(0, 8).forEach(x => {
    const share = x.ms / total;
    const isBiz = x.item.type === 'bucket';
    card.append(el('div', { style: { marginBottom: '9px' } },
      el('div', { style: { display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '3px' } },
        el('span', {
          style: { fontWeight: '600', cursor: 'pointer', color: isBiz ? '#22d3ee' : '' },
          onclick: () => openItem(x.item.id)
        }, (isBiz ? '◈ ' : '') + x.item.title),
        el('span', { class: 'muted small', style: { marginInlineStart: 'auto' } },
          `${dur(x.ms, true)} · ${Math.round(share * 100)}%`)),
      el('div', { class: 'bar' }, el('i', { style: { width: (share * 100) + '%', background: isBiz ? '#22d3ee' : 'var(--accent)' } }))));
  });

  const restMs = Math.max(0, total - clientMs - bizMs);
  if (total > 0) card.append(el('div', { class: 'advice', style: { marginTop: '11px' } },
    el('div', {},
      `${Math.round(clientMs / total * 100)}% מהזמן הלך ללקוחות, ` +
      `${Math.round(bizMs / total * 100)}% לעסק עצמו` +
      (restMs / total > 0.05 ? `, ו-${Math.round(restMs / total * 100)}% למשימות ולמידה` : '') + '.'),
    bizMs > clientMs
      ? el('div', { class: 'small', style: { marginTop: '4px' } },
        'יותר זמן על העסק מאשר על לקוחות. בשבוע של בנייה זה הגיוני; בשבוע רגיל זה סימן.')
      : null));

  return card;
}

/* ---------- מה נמסר ---------- */

function shipped(d) {
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' }, el('h3', {}, 'מה יצא השבוע')));

  const rows = [];
  d.delivered.forEach(c => rows.push(['📦', c.title, 'נמסר', c.id]));
  d.paid.forEach(c => rows.push(['₪', c.title, nis(c.amount || 0), c.id]));
  S().items.filter(i => i.type === 'task' && i.doneAt >= d.from && i.doneAt < d.to)
    .forEach(t => rows.push(['✓', t.title, 'בוצע', t.id]));

  if (!rows.length) {
    card.append(el('div', { class: 'empty' }, 'שום דבר לא נסגר השבוע.'));
    return card;
  }
  rows.slice(0, 10).forEach(([ic, title, sub, id]) => card.append(el('div', {
    style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '5px 0', cursor: 'pointer' },
    onclick: () => openItem(id)
  },
    el('span', { style: { width: '18px', textAlign: 'center' } }, ic),
    el('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title),
    el('span', { class: 'small muted' }, sub))));
  return card;
}

/* ---------- מה תקוע ---------- */

function stuck(d) {
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'מה תקוע'),
    el('span', { class: 'sub' }, 'יושב יותר מדי בלי תזוזה')));

  if (!d.stuck.length) {
    card.append(el('div', { class: 'empty' }, 'שום דבר לא תקוע. נדיר, תיהנה.'));
    return card;
  }
  d.stuck.slice(0, 8).forEach(i => card.append(el('div', {
    style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '5px 0', cursor: 'pointer' },
    onclick: () => openItem(i.id)
  },
    el('span', { style: { width: '18px', textAlign: 'center' } },
      i.type === 'client' ? '👤' : i.type === 'decision' ? '⚖️' : '✓'),
    el('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, i.title),
    el('span', { class: 'small', style: { color: 'var(--red)' } }, ago(i.stageSince || i.createdAt)))));
  return card;
}

/* ---------- מה לזרוק ---------- */

function dropList(d) {
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'מה לזרוק', hintBadge('review.drop')),
    el('span', { class: 'sub' }, 'חודש בלי מגע — כנראה לא באמת יקרה')));

  if (!d.drop.length) {
    card.append(el('div', { class: 'empty' }, 'אין מה לנקות. הרשימות נקיות.'));
    return card;
  }

  d.drop.forEach(i => card.append(el('div', {
    style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '5px 0' }
  },
    el('span', { style: { width: '18px', textAlign: 'center' } },
      i.type === 'idea' ? '💡' : i.type === 'knowledge' ? '📚' : '✓'),
    el('span', {
      style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' },
      onclick: () => openItem(i.id)
    }, i.title),
    el('span', { class: 'small muted' }, ago(i.updatedAt || i.createdAt)),
    el('button', {
      class: 'btn btn-xs',
      onclick: () => { patchItem(i.id, { archived: true }, 'ארכיון: ' + i.title); toast('לארכיון'); refresh(); }
    }, 'לארכיון'))));

  card.append(el('button', {
    class: 'btn btn-sm btn-danger', style: { marginTop: '11px' },
    'data-tip': 'מעביר את כולם לארכיון. לא מוחק — אפשר להחזיר, ואפשר לבטל ב-Ctrl+Z.',
    onclick: () => {
      update(s => {
        d.drop.forEach(x => { const it = s.items.find(y => y.id === x.id); if (it) it.archived = true; });
      }, { label: `ארכיון ל-${d.drop.length} פריטים` });
      toast(`${d.drop.length} פריטים לארכיון`, 'ok');
      refresh();
    }
  }, `העבר את כל ${d.drop.length} לארכיון`));

  return card;
}

/* ---------- הסיכום ---------- */

function summaryCard(d) {
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'המסקנה'),
    el('span', { class: 'sub' }, 'מה שכדאי לעשות אחרת בשבוע הבא')));

  /* מסקנות מקומיות — תמיד, בחינם */
  const facts = localFacts(d);
  const ul = el('ul', { style: { margin: 0, paddingInlineStart: '18px', lineHeight: '1.95' } });
  facts.forEach(f => ul.append(el('li', {}, f)));
  card.append(ul);

  /* פסקה מקלוד — רק אם ביקשת */
  const out = el('div', { style: { marginTop: '12px' } });
  card.append(out);

  if (S().settings.assistantEnabled) card.append(el('button', {
    class: 'btn btn-sm', style: { marginTop: '11px' },
    'data-tip': 'שולח את מספרי השבוע לקלוד ומבקש פסקה קצרה. עולה כמה אגורות.',
    onclick: async e => {
      e.target.disabled = true;
      e.target.textContent = 'חושב…';
      out.innerHTML = '';
      try {
        const text = await askClaude(d, facts);
        out.append(el('div', { class: 'advice' },
          el('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.8' } }, text)));
      } catch (err) {
        out.append(el('div', { class: 'alert warn' },
          'העוזר לא זמין: ' + (err.message || err) + '. המסקנות למעלה עדיין תקפות.'));
      }
      e.target.disabled = false;
      e.target.textContent = '✦ בקש מקלוד פסקה';
    }
  }, '✦ בקש מקלוד פסקה'));

  return card;
}

function localFacts(d) {
  const out = [];
  const perDay = d.focus / d.days;
  const target = (S().settings.workHoursPerDay || 6) * HOUR;

  if (d.delivered.length) {
    const per = d.focus / d.delivered.length;
    out.push(`נמסרו ${d.delivered.length} סרטונים, ${dur(per, true)} כל אחד בממוצע.`);
  } else {
    out.push('שבוע בלי מסירה. אם זה חוזר על עצמו, שווה לבדוק איפה הפקק.');
  }

  if (perDay < target * 0.5)
    out.push(`${dur(perDay, true)} ביום בממוצע, מול יעד של ${dur(target, true)}. או שהמדידה לא תופסת הכל, או שהיה שבוע קצר.`);
  else if (perDay > target * 1.2)
    out.push(`${dur(perDay, true)} ביום — מעל היעד. שבוע כזה לא מחזיק לאורך זמן.`);

  const biz = d.hours.filter(x => x.item.type === 'bucket').reduce((a, x) => a + x.ms, 0);
  const tot = d.hours.reduce((a, x) => a + x.ms, 0);
  if (tot && biz / tot > 0.4)
    out.push(`${Math.round(biz / tot * 100)}% מהזמן הלך לעסק ולא ללקוחות — שעות שאף אחד לא משלם עליהן ישירות.`);

  if (d.income) {
    const rate = d.focus ? d.income / (d.focus / HOUR) : 0;
    out.push(`נכנסו ${nis(d.income)}. ביחס לשעות שעבדת זה ${nis(rate)} לשעה.`);
  }

  if (d.stuck.length) out.push(`${d.stuck.length} דברים תקועים, הוותיק מביניהם ${ago(d.stuck[0].stageSince || d.stuck[0].createdAt)}.`);
  if (d.drop.length) out.push(`${d.drop.length} פריטים לא זזו חודש. כנראה לא יקרו — שווה לנקות.`);
  if (d.sampleStats.counted) {
    const off = d.sampleStats.offCount;
    if (off) out.push(`${Math.round(off / d.sampleStats.counted * 100)}% מהבדיקות היו "לא עבודה". זה נורמלי, וטוב שזה נמדד.`);
  }
  return out;
}

async function askClaude(d, facts) {
  const r = await callAssistant({
    mode: 'chat',
    messages: [{
      role: 'user',
      content: 'זו הסקירה השבועית שלי. כתוב לי שלוש-ארבע שורות: מה הדבר האחד ' +
        'שהכי שווה לשנות בשבוע הבא, ולמה. בלי מחמאות, בלי רשימות, בלי לחזור על המספרים. ' +
        'דבר איתי ישיר.\n\n' + facts.join('\n')
    }],
    context: {
      נמסרו: d.delivered.length,
      זמן_קשב_שעות: Math.round(d.focus / HOUR * 10) / 10,
      נכנס: d.income, יצא: d.spend,
      לידים_חדשים: d.newLeads.length,
      תקועים: d.stuck.length,
      לאן_הלכו_השעות: d.hours.slice(0, 6).map(x => ({
        מה: x.item.title, סוג: x.item.type, שעות: Math.round(x.ms / HOUR * 10) / 10
      }))
    }
  });
  if (!r.ok) throw new Error('סטטוס ' + r.status);
  const j = await r.json();
  return j.text || j.reply || 'לא הגיעה תשובה.';
}

/* ---------- סגירת השבוע ---------- */

function closeCard(d, from) {
  const s = S();
  const done = (s.reviews || []).some(r => r.week === from);
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });

  const ta = textarea({
    placeholder: 'משפט אחד לעצמך: מה השבוע הזה לימד אותך?', rows: 2,
    value: (s.reviews || []).find(r => r.week === from)?.note || ''
  });

  card.append(el('div', { class: 'card-h' },
    el('h3', {}, done ? '✓ השבוע נסגר' : 'סגור את השבוע'),
    el('span', { class: 'sub' }, 'נשמר, ואפשר לחזור אליו')));
  card.append(ta);
  card.append(el('button', {
    class: 'btn btn-y', style: { marginTop: '9px' },
    onclick: () => {
      update(st => {
        if (!Array.isArray(st.reviews)) st.reviews = [];
        const ex = st.reviews.find(r => r.week === from);
        const payload = {
          week: from, at: now(), note: ta.value.trim(),
          delivered: d.delivered.length, focusMs: d.focus, income: d.income
        };
        if (ex) Object.assign(ex, payload); else st.reviews.push(payload);
      }, { label: 'סגירת שבוע' });
      toast('השבוע נסגר', 'ok');
      refresh();
    }
  }, done ? 'עדכן' : 'סגור שבוע'));

  const past = (s.reviews || []).filter(r => r.week !== from).sort((a, b) => b.week - a.week).slice(0, 4);
  if (past.length) {
    card.append(el('div', { class: 'hr' }));
    card.append(el('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'שבועות קודמים'));
    past.forEach(r => card.append(el('div', { class: 'small', style: { display: 'flex', gap: '9px', padding: '3px 0' } },
      el('span', { class: 'muted', style: { flex: '0 0 84px' } }, dmy(r.week)),
      el('span', { style: { flex: 1, minWidth: 0 } }, r.note || '—'),
      el('span', { class: 'muted' }, `${r.delivered} · ${dur(r.focusMs, true)}`))));
  }

  return card;
}
