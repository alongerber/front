/* ============================================================
   money.js — מנויים, עלות לסרטון, רווח, וסימולטור ההחלטות
   ============================================================ */

import { S, update, uid, monthlySubsILS, monthMoney, monthKey, lineOf, patchItem } from '../store.js';
import { el, nis, num, dur, dmy, toast, modal, input, select, field, confirmBox, clamp, HOUR, DAY } from '../util.js';
import * as T from '../timer.js';
import { unitEconomics, measuredHoursPerVideo, deliveredThisMonth } from '../brain.js';
import { refresh, openItem } from '../app.js';

export default { render };

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'כסף'),
    el('div', { class: 'desc' }, 'מה נכנס, מה יוצא, ומה זה אומר על השעה שלך'),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-sm', onclick: () => ledgerModal() }, '+ תנועה'))
  ));

  root.append(headline());
  root.append(el('div', { class: 'grid g-2-1', style: { marginTop: '14px' } },
    el('div', {}, simulator(), unitCard()),
    el('div', {}, subsCard(), ledgerCard())
  ));
}

/* ================= כותרת: רווח בשלושה חתכים ================= */

function headline() {
  const s = S();
  const m = monthMoney();
  const e = unitEconomics();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const focus = T.focusMs(null, monthStart, Date.now());
  const realHourly = focus ? m.profit / (focus / HOUR) : null;

  return el('div', { class: 'grid g4' },
    el('div', { class: 'stat g' },
      el('div', { class: 'lbl' }, 'הכנסות החודש'),
      el('div', { class: 'val' }, nis(m.income)),
      el('div', { class: 'sub' }, `${m.delivered} נמסרו`)),
    el('div', { class: 'stat r' },
      el('div', { class: 'lbl' }, 'הוצאות החודש'),
      el('div', { class: 'val' }, nis(m.expenses)),
      el('div', { class: 'sub' }, `מנויים ${nis(m.subs)}${m.media ? ' · מדיה ' + nis(m.media) : ''}`)),
    el('div', { class: 'stat ' + (m.profit >= 0 ? 'y' : 'r') },
      el('div', { class: 'lbl' }, 'נטו החודש'),
      el('div', { class: 'val' }, nis(m.profit)),
      el('div', { class: 'sub' }, m.profit >= 0 ? 'נשאר בכיס' : 'חור שצריך לסגור')),
    el('div', { class: 'stat' },
      el('div', { class: 'lbl' }, 'רווח לשעת עבודה בפועל'),
      el('div', { class: 'val', style: { color: realHourly == null ? '' : realHourly >= (s.settings.hourlyTarget || 250) ? '#3ddc84' : '#ff5a4d' } },
        realHourly == null ? '—' : nis(realHourly)),
      el('div', { class: 'sub' }, realHourly == null ? 'צריך שעות רשומות' : `יעד ${nis(s.settings.hourlyTarget || 250)}`))
  );
}

/* ================= סימולטור ההחלטות ================= */

const SLIDERS = [
  { key: 'price', name: 'מחיר לסרטון', desc: 'כמה אתה גובה על סרטון בודד. זה המספר שהכי קל לשנות והכי מפחיד לגעת בו.', min: 400, max: 4000, step: 10, fmt: nis },
  { key: 'perMonth', name: 'כמה סרטונים בחודש', desc: 'כמה אתה מספיק בפועל — לא כמה היית רוצה.', min: 1, max: 30, step: 1, fmt: v => v + ' סרטונים' },
  { key: 'leadCost', name: 'עלות ממוצעת לליד', desc: 'כמה עולה לך להביא לקוח אחד — כולל פרסום.', min: 0, max: 800, step: 10, fmt: nis },
  { key: 'hours', name: 'שעות לסרטון', desc: 'זמן קשב אמיתי לסרטון. המערכת מציעה את מה שהיא מדדה.', min: 0.5, max: 20, step: 0.5, fmt: v => num(v) + ' שעות' },
  { key: 'rate', name: 'תעריף שעתי יעד', desc: 'כמה השעה שלך שווה בעיניך. משמש לתמחור עלות הזמן שלך.', min: 50, max: 800, step: 10, fmt: nis }
];

function simulator() {
  const s = S();
  const base = unitEconomics();
  const vals = {
    price: base.price, perMonth: base.perMonth, leadCost: base.leadCost,
    hours: base.hours, rate: base.rate
  };

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h2', {}, 'סימולטור החלטות'),
    el('span', { class: 'sub' }, 'הזז וראה מה קורה'),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-xs', onclick: () => {
          update(st => {
            const l = st.productLines.find(x => x.id === base.line.id);
            l.pricing.unit = vals.price;
            l.estHours = vals.hours;
            st.settings.hourlyTarget = vals.rate;
            st.settings.avgLeadCost = vals.leadCost;
          });
          toast('הערכים נשמרו כברירת מחדל', 'ok'); refresh();
        }
      }, 'שמור כברירת מחדל'))
  ));

  const out = el('div', {});
  const verdictBox = el('div', { class: 'verdict', style: { marginBottom: '16px' } });

  const paint = () => {
    const e = unitEconomics(vals);
    verdictBox.textContent = verdict(e);
    out.innerHTML = '';
    out.append(el('div', { class: 'grid g4' },
      kpi('רווח לסרטון', nis(e.profitPerVideo), e.profitPerVideo > 0 ? '#3ddc84' : '#ff5a4d', 'אחרי מנויים, ליד, והזמן שלך'),
      kpi('נטו לחודש', nis(e.monthlyNet), e.monthlyNet > 0 ? '#ffd400' : '#ff5a4d', 'הכנסות פחות הוצאות'),
      kpi('₪ לשעה בפועל', nis(e.realHourly), e.realHourly >= vals.rate ? '#3ddc84' : '#ff5a4d', `יעד ${nis(vals.rate)}`),
      kpi('שעות ביום', num(e.hoursPerDay) + ' שע\'', e.hoursPerDay > 9 ? '#ff5a4d' : '#ffffff', 'ב-22 ימי עבודה')
    ));
  };

  SLIDERS.forEach(sl => {
    const wrap = el('div', { class: 'sl' });
    const valNode = el('span', { class: 'vv' }, sl.fmt(vals[sl.key]));
    const range = el('input', {
      type: 'range', min: sl.min, max: sl.max, step: sl.step, value: vals[sl.key],
      oninput: e => { vals[sl.key] = Number(e.target.value); valNode.textContent = sl.fmt(vals[sl.key]); paint(); }
    });
    wrap.append(
      el('div', { class: 'sl-h' }, el('span', { class: 'nm' }, sl.name), valNode),
      el('div', { class: 'sl-d' }, sl.desc),
      range
    );
    card.append(wrap);
  });

  paint();
  card.append(el('div', { class: 'hr' }), verdictBox, out);
  return card;
}

function kpi(lbl, val, color, sub) {
  return el('div', {},
    el('div', { class: 'small muted' }, lbl),
    el('div', { class: 'tabular', style: { fontSize: '20px', fontWeight: '900', color } }, val),
    el('div', { class: 'small muted' }, sub)
  );
}

function verdict(e) {
  const net = Math.round(e.monthlyNet);
  const hpd = e.hoursPerDay;
  const parts = [`בקצב הזה תגיע ל-${nis(net)} נטו בחודש, ותעבוד ${num(hpd)} שעות ביום.`];
  if (hpd > 9) parts.push('זה יותר משעות של משרה מלאה — או שמעלים מחיר או שמורידים כמות.');
  else if (e.realHourly < e.rate) parts.push(`השעה שלך יוצאת ${nis(e.realHourly)} מול יעד של ${nis(e.rate)}.`);
  else if (net < 0) parts.push('אתה מפסיד. המנויים לבדם אוכלים את זה.');
  else if (hpd < 3) parts.push('נשאר לך זמן — הוא שווה יותר בשיווק מאשר בהמתנה.');
  else parts.push('המספרים סוגרים.');
  return parts.join(' ');
}

/* ================= עלות לסרטון ================= */

function unitCard() {
  const e = unitEconomics();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'עלות לסרטון — מה באמת מרכיב אותה'),
    el('span', { class: 'sub' }, `לפי ${e.perMonth} סרטונים בחודש`)));

  const rows = [
    ['מנויים חלקי כמות', e.subsPerVideo, 'סה"כ ' + nis(e.subsILS) + ' לחודש'],
    ['עלות הבאת ליד', e.leadCost, 'ממוצע פרסום ללקוח'],
    ['הזמן שלך', e.timeCost, `${num(e.hours)} שעות × ${nis(e.rate)}`],
  ];
  const tb = el('table', { class: 'tb' });
  rows.forEach(([k, v, sub]) => tb.append(el('tr', {},
    el('td', {}, el('div', {}, k), el('div', { class: 'small muted' }, sub)),
    el('td', { class: 'num' }, nis(v))
  )));
  tb.append(el('tr', {},
    el('td', { style: { fontWeight: '700' } }, 'סה"כ עלות'),
    el('td', { class: 'num', style: { fontWeight: '700' } }, nis(e.costPerVideo))));
  tb.append(el('tr', {},
    el('td', { style: { fontWeight: '700' } }, 'מחיר'),
    el('td', { class: 'num', style: { fontWeight: '700', color: '#ffd400' } }, nis(e.price))));
  tb.append(el('tr', {},
    el('td', { style: { fontWeight: '700' } }, 'רווח לסרטון'),
    el('td', { class: 'num', style: { fontWeight: '700', color: e.profitPerVideo > 0 ? '#3ddc84' : '#ff5a4d' } }, nis(e.profitPerVideo))));
  card.append(tb);

  card.append(el('div', { class: 'small muted', style: { marginTop: '10px', lineHeight: '1.6' } },
    `בלי לתמחר את הזמן שלך נשאר בכיס ${nis(e.cashPerVideo)} לסרטון. ` +
    `זמן הקשב שנמדד בפועל: ${num(measuredHoursPerVideo(e.line.id))} שעות לסרטון.`));
  return card;
}

/* ================= מנויים ================= */

function subsCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  const total = monthlySubsILS();
  const usd = s.subscriptions.filter(x => x.currency === 'USD').reduce((a, x) => a + x.cost, 0);

  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'מנויים'),
    el('span', { class: 'sub' }, `$${num(usd, 0)} · ${nis(total)} לחודש`),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-xs', onclick: () => {
          update(st => st.subscriptions.push({ id: uid('s'), name: 'מנוי חדש', cost: 0, currency: 'USD' }));
          refresh();
        }
      }, '+')
    )));

  const rateInp = input({ type: 'number', step: '0.01', value: s.settings.usdRate, style: { width: '86px' } });
  rateInp.addEventListener('change', () => { update(st => { st.settings.usdRate = Number(rateInp.value) || 3.65; }); refresh(); });

  s.subscriptions.forEach(sub => {
    const nm = input({ value: sub.name, style: { flex: '2' } });
    const co = input({ type: 'number', value: sub.cost, style: { flex: '0 0 80px' } });
    const cu = select([{ value: 'USD', label: '$' }, { value: 'ILS', label: '₪' }], sub.currency, { style: { flex: '0 0 62px' } });
    const save = () => update(st => {
      const x = st.subscriptions.find(y => y.id === sub.id);
      if (!x) return;
      x.name = nm.value; x.cost = Number(co.value) || 0; x.currency = cu.value;
    });
    [nm, co, cu].forEach(n => n.addEventListener('change', () => { save(); refresh(); }));
    card.append(el('div', { style: { display: 'flex', gap: '5px', marginBottom: '5px' } },
      nm, co, cu,
      el('button', {
        class: 'btn btn-xs btn-danger',
        onclick: () => { update(st => { st.subscriptions = st.subscriptions.filter(y => y.id !== sub.id); }); refresh(); }
      }, '×')
    ));
  });

  card.append(el('div', { class: 'hr' }));
  card.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
    el('span', { class: 'small muted', style: { flex: 1 } }, 'שער דולר'),
    rateInp));
  card.append(el('div', { style: { display: 'flex', marginTop: '9px' } },
    el('span', { style: { flex: 1, fontWeight: '700' } }, 'סה"כ לחודש'),
    el('span', { class: 'tabular', style: { fontWeight: '900', color: '#ff5a4d' } }, nis(total))));
  return card;
}

/* ================= תנועות ================= */

function ledgerCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'תנועות'),
    el('span', { class: 'sub' }, 'תשלומים נרשמים לבד כשלקוח עובר לשלב תשלום'),
    el('div', { class: 'right' }, el('button', { class: 'btn btn-xs', onclick: () => ledgerModal() }, '+'))));

  const paid = s.items.filter(i => i.type === 'client' && i.paidAt)
    .map(c => ({ id: c.id, date: c.paidAt, title: c.title, amount: Number(c.amount) || 0, auto: true }));
  const manual = s.ledger.map(l => ({ id: l.id, date: l.date, title: l.title, amount: l.amount, auto: false }));
  const all = paid.concat(manual).sort((a, b) => b.date - a.date).slice(0, 14);

  if (!all.length) { card.append(el('div', { class: 'empty' }, 'אין תנועות עדיין')); return card; }

  all.forEach(r => card.append(el('div', { style: { display: 'flex', gap: '8px', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,.05)' } },
    el('span', { class: 'muted small tabular', style: { flex: '0 0 54px' } }, dmy(r.date)),
    el('span', { style: { flex: 1, cursor: r.auto ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, onclick: () => r.auto && openItem(r.id) }, r.title),
    el('span', { class: 'tabular', style: { color: r.amount >= 0 ? '#3ddc84' : '#ff5a4d' } },
      (r.amount >= 0 ? '+' : '−') + nis(Math.abs(r.amount))),
    !r.auto ? el('button', {
      class: 'btn btn-xs', style: { padding: '1px 6px' },
      onclick: () => { update(st => { st.ledger = st.ledger.filter(x => x.id !== r.id); }); refresh(); }
    }, '×') : null
  )));
  return card;
}

function ledgerModal() {
  const fT = input({ placeholder: 'למשל: קידום ממומן' });
  const fA = input({ type: 'number', placeholder: '-350' });
  const fD = input({ type: 'date', value: new Date().toISOString().slice(0, 10) });
  modal({
    title: 'תנועת כסף',
    body: el('div', {},
      field('תיאור', fT),
      el('div', { class: 'row' }, field('סכום ₪', fA, 'מספר שלילי = הוצאה'), field('תאריך', fD))),
    actions: [{ label: 'ביטול' }, {
      label: 'שמור', cls: 'btn-y', onClick: () => {
        const a = Number(fA.value);
        if (!a) { toast('צריך סכום', 'err'); return; }
        update(s => s.ledger.push({ id: uid('lg'), title: fT.value || 'תנועה', amount: a, date: new Date(fD.value).getTime() }));
        toast('נרשם', 'ok'); refresh();
      }
    }]
  });
}
