/* ============================================================
   money.js — מנויים, עלות לסרטון, רווח, וסימולטור ההחלטות
   ============================================================ */

import { S, update, uid, monthlySubsILS, monthMoney, lineOf } from '../store.js';
import { el, nis, num, dmy, toast, modal, input, select, field, HOUR } from '../util.js';
import * as T from '../timer.js';
import { unitEconomics, measuredHoursPerVideo, hoursPerVideo } from '../brain.js';
import { hintBadge } from '../help.js';
import { refresh, openItem } from '../app.js';
import * as MO from '../money.js';

export default { render };

/* עוזרים קטנים לבניית כותרות נושא ומספרים עם הסבר */
function section(title, sub) {
  return el('div', { class: 'section' },
    el('span', { class: 'bar' }),
    el('h2', {}, title),
    sub ? el('span', { class: 'sub' }, sub) : null,
    el('span', { class: 'line' })
  );
}

function statBox(label, value, opts = {}) {
  return el('div', { class: 'stat ' + (opts.cls || '') },
    el('div', { class: 'lbl', style: { display: 'flex', alignItems: 'center' } },
      label, opts.tip ? hintBadge(opts.tip) : null),
    el('div', { class: 'val', style: opts.color ? { color: opts.color } : {} }, value),
    opts.sub ? el('div', { class: 'sub' }, opts.sub) : null
  );
}

/* ============================================================ */

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'כסף'),
    el('div', { class: 'desc' }, 'מה נכנס, מה יוצא, ומה זה אומר על השעה שלך'),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-sm', 'data-tip': 'money.ledger', onclick: () => ledgerModal() }, '+ תנועה'))
  ));

  root.append(priceCard());

  root.append(section('החודש בפועל', 'מה שקרה, לא מה שאולי יקרה'));
  root.append(headline());

  root.append(section('סרטון בודד', 'כמה מרוויחים על סרטון אחד — בשתי דרכי מדידה'));
  root.append(perVideo());

  root.append(section('כמה זמן ייקח הבא', 'לפי מה שנמסר בפועל, לא לפי הרגשה'));
  root.append(forecastCard());

  root.append(section('מאיפה מגיעים הלקוחות', 'כמה עולה ליד בכל ערוץ, וכמה מהם נסגרים'));
  root.append(sourcesCard());

  root.append(section('הכנסה חוזרת', 'לקוחות שמשלמים כל חודש'));
  root.append(mrrCard());

  root.append(section('מה קורה אם אשנה משהו', 'הזז סליידר וראה מיד'));
  root.append(simulator());

  root.append(section('הוצאות קבועות', 'מה שיוצא כל חודש בלי קשר לכמות'));
  root.append(el('div', { class: 'grid g2' }, subsCard(), ledgerCard()));
}

/* ================= המחיר שאתה צריך =================
   המספר היחיד בעמוד שאומר לך מה לעשות, ולא רק מה קרה. */

function priceCard() {
  const r = MO.requiredPrice();
  const ok = r.gap <= 0;
  const card = el('div', { class: 'card', style: { borderColor: ok ? 'rgba(61,220,132,.4)' : 'rgba(255,159,67,.45)' } });

  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'המחיר שאתה צריך', hintBadge('money.required')),
    el('span', { class: 'sub' }, 'מספר אחד, מחושב ממה שנמדד')));

  card.append(el('div', { style: { display: 'flex', gap: '20px', alignItems: 'baseline', flexWrap: 'wrap' } },
    el('div', { style: { fontSize: '38px', fontWeight: '900', letterSpacing: '-1px', color: ok ? 'var(--green)' : '#ff9f43' } },
      nis(r.need)),
    el('div', { class: 'muted' },
      ok ? `אתה גובה ${nis(r.current)} — מכסה.`
        : `אתה גובה ${nis(r.current)}. חסרים ${nis(r.gap)}.`)
  ));

  /* איך הגענו לזה */
  const step = (label, val, note) => el('div', {
    style: { display: 'flex', gap: '8px', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--line)' }
  },
    el('span', {}, label),
    note ? el('span', { class: 'muted small' }, note) : null,
    el('span', { class: 'tabular', style: { marginInlineStart: 'auto', fontWeight: '600' } }, val));

  card.append(el('div', { style: { marginTop: '14px' } },
    step('הזמן שלך', nis(r.hours * r.rate),
      `${num(r.hours)} שעות × ${nis(r.rate)} לשעה`),
    step('מנויים', nis(r.subsPerVideo), `מחולק ל-${num(r.perMonth)} סרטונים בחודש`),
    step('הבאת הלקוח', nis(r.leadCost), 'עלות ממוצעת לליד'),
    el('div', { style: { display: 'flex', paddingTop: '7px', fontWeight: '700' } },
      el('span', {}, 'סה"כ, מעוגל'),
      el('span', { class: 'tabular', style: { marginInlineStart: 'auto' } }, nis(r.need)))
  ));

  /* מה זה אומר בפועל */
  const box = el('div', { class: 'advice', style: { marginTop: '14px' } });
  if (ok) {
    box.append(el('div', { style: { fontWeight: '700', marginBottom: '5px' } }, 'המחיר מכסה — אפשר להשאיר אותו.'),
      el('div', { class: 'small' },
        `במחיר של ${nis(r.current)} השעה שלך יוצאת ${nis(r.actualRate)} בפועל, ` +
        `מול יעד של ${nis(r.rate)}.`));
  } else {
    box.append(el('div', { style: { fontWeight: '700', marginBottom: '5px' } },
      `במחיר הנוכחי השעה שלך יוצאת ${nis(r.actualRate)} במקום ${nis(r.rate)}.`));
    const ul = el('ul', { style: { margin: '6px 0 0', paddingInlineStart: '18px', lineHeight: '1.9' } });
    ul.append(el('li', {}, `להעלות ל-${nis(r.need)} — זה מכסה בדיוק`));
    const hoursNeeded = r.rate > 0 ? (r.current - r.subsPerVideo - r.leadCost) / r.rate : 0;
    if (hoursNeeded > 0.25)
      ul.append(el('li', {}, `או לקצר את העבודה ל-${num(hoursNeeded)} שעות (עכשיו ${num(r.hours)})`));
    const morePerMonth = Math.ceil(monthlySubsILS() / Math.max(1, r.current - r.hours * r.rate - r.leadCost));
    if (morePerMonth > 0 && morePerMonth < 60)
      ul.append(el('li', {}, `או לעשות ${morePerMonth} סרטונים בחודש — המנויים מתחלקים על יותר ראשים`));
    box.append(ul);
  }
  card.append(box);

  if (r.lowData) card.append(el('div', { class: 'alert warn', style: { marginTop: '11px' } },
    el('div', { style: { flex: 1 } },
      `נמסרו רק ${r.deliveredCount} סרטונים ב-90 יום, אז המנויים מתחלקים על מעט ראשים ` +
      `(${nis(r.subsPerVideo)} לסרטון). המספר נכון מתמטית, אבל הוא בעיקר אומר שצריך יותר סרטונים — ` +
      'לא בהכרח מחיר גבוה יותר.')));

  card.append(el('div', { class: 'small muted', style: { marginTop: '9px' } },
    r.hoursSource === 'samples' ? 'השעות נמדדו בדגימות — זה המספר האמין ביותר שיש.'
      : r.hoursSource === 'timer' ? 'השעות לפי הטיימר. הפעל מדידה בדגימות למספר אמין יותר.'
        : 'השעות הן הערכה שהקלדת, לא מדידה. עד שיצטברו נתונים, קח את המחיר הזה בעירבון מוגבל.'));

  if (!ok) card.append(el('button', {
    class: 'btn btn-y', style: { marginTop: '11px' },
    onclick: () => {
      const line = lineOf(null);
      update(st => {
        const l = st.productLines.find(x => x.id === line.id);
        if (l) l.pricing.unit = r.need;
      }, { label: 'שינוי מחיר' });
      toast(`המחיר עודכן ל-${nis(r.need)}`, 'ok');
      refresh();
    }
  }, `עדכן את המחיר ל-${nis(r.need)}`));

  return card;
}

/* ================= תחזית ================= */

function forecastCard() {
  const f = MO.forecast();
  const card = el('div', { class: 'card' });

  if (!f) {
    card.append(el('div', { class: 'empty' },
      'צריך לפחות שני סרטונים שנמסרו עם מדידת זמן כדי לחזות. ' +
      'אחרי שניים-שלושה יופיע כאן טווח אמיתי.'));
    return card;
  }

  card.append(el('div', { class: 'grid g3', style: { marginBottom: '13px' } },
    statBox('בדרך כלל', num(f.p50) + ' שעות', {
      cls: 'y', tip: 'money.p50',
      sub: `מחצית מהסרטונים לקחו פחות מזה`
    }),
    statBox('כשמסתבך', num(f.p80) + ' שעות', {
      color: '#ff9f43', tip: 'money.p80',
      sub: 'אחד מכל חמישה חורג מזה'
    }),
    statBox('להבטיח ללקוח', f.days80 + ' ימים', {
      cls: 'g', tip: 'money.deliveryPromise',
      sub: `בפועל בדרך כלל ${f.days50} ימים`
    })
  ));

  card.append(el('div', { class: 'advice' },
    el('div', { style: { fontWeight: '700', marginBottom: '5px' } },
      `הסרטון הבא: תכנן ${num(f.p50)} שעות, שמור ${num(f.p80)} ביומן.`),
    el('div', { class: 'small' },
      `לפי ${f.n} סרטונים שנמסרו. הקצר לקח ${num(f.min)} שעות, הארוך ${num(f.max)}. ` +
      `ההבטחה ללקוח צריכה להישען על ${f.days80} ימים ולא על ${f.days50} — ` +
      'עדיף למסור מוקדם מאשר לאחר.')
  ));

  return card;
}

/* ================= מקור הליד ================= */

function sourcesCard() {
  const rows = MO.bySource({ days: 90 });
  const card = el('div', { class: 'card' });

  if (!rows.length) {
    card.append(el('div', { class: 'empty' },
      'עוד אין לקוחות עם מקור מסומן. בכרטיס של כל לקוח יש שדה "מאיפה הגיע" — ' +
      'אחרי כמה לקוחות יופיע כאן פילוח שאומר לך אם הקמפיין משתלם.'));
    return card;
  }

  const tb = el('table', { class: 'tb' },
    el('tr', {},
      el('th', {}, 'ערוץ'), el('th', {}, 'לידים'), el('th', {}, 'נסגרו'),
      el('th', {}, el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'המרה', hintBadge('money.conv'))),
      el('th', {}, 'הכנסה'), el('th', {}, 'הוצאה'),
      el('th', {}, el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'לליד', hintBadge('money.cpl'))),
      el('th', {}, 'ללקוח סגור')));

  rows.forEach(r => {
    tb.append(el('tr', {},
      el('td', { style: { fontWeight: '600' } },
        el('span', { class: 'dot', style: { background: r.meta.color, marginInlineEnd: '6px' } }), r.meta.name),
      el('td', { class: 'num' }, String(r.leads)),
      el('td', { class: 'num' }, String(r.won)),
      el('td', {
        class: 'num',
        style: { color: r.convRate >= 0.5 ? '#3ddc84' : r.convRate < 0.2 && r.leads >= 3 ? '#ff5a4d' : '' }
      }, r.leads ? Math.round(r.convRate * 100) + '%' : '—'),
      el('td', { class: 'num' }, r.revenue ? nis(r.revenue) : '—'),
      el('td', { class: 'num muted' }, r.spend ? nis(r.spend) : '—'),
      el('td', { class: 'num' }, r.costPerLead ? nis(r.costPerLead) : '—'),
      el('td', {
        class: 'num',
        style: { color: r.costPerWin && r.revenue / Math.max(1, r.won) < r.costPerWin ? '#ff5a4d' : '' }
      }, r.costPerWin ? nis(r.costPerWin) : '—')
    ));
  });
  card.append(tb);

  /* המסקנה במשפט */
  const paid = rows.filter(r => r.spend > 0);
  if (paid.length) {
    const best = paid.slice().sort((a, b) => (b.roi ?? -9) - (a.roi ?? -9))[0];
    const worst = paid.slice().sort((a, b) => (a.roi ?? 9) - (b.roi ?? 9))[0];
    card.append(el('div', { class: 'advice', style: { marginTop: '13px' } },
      best.roi != null && best.roi > 0
        ? el('div', {}, `${best.meta.name} מחזיר ${num(best.roi + 1)} ₪ על כל שקל. זה הערוץ להגדיל.`)
        : el('div', {}, 'אף ערוץ ממומן לא מחזיר את ההשקעה עדיין.'),
      paid.length > 1 && worst.roi != null && worst.roi < 0
        ? el('div', { class: 'small', style: { marginTop: '4px' } },
          `${worst.meta.name} מפסיד ${nis(worst.spend - worst.revenue)} ב-90 יום. שווה לכבות או לשנות.`)
        : null
    ));
  } else {
    const org = rows.find(r => r.source === 'organic' || r.source === 'referral');
    if (org) card.append(el('div', { class: 'small muted', style: { marginTop: '11px' } },
      `כרגע הכל אורגני והפניות — עלות אפס. כשתתחיל קמפיין, רשום את ההוצאה ב"+ תנועה" ` +
      `וסמן אותה כפרסום, וכאן תראה אם הוא משתלם.`));
  }

  return card;
}

/* ================= הכנסה חוזרת ================= */

function mrrCard() {
  const m = MO.mrr();
  const due = MO.renewalsDue({ withinDays: 10 });
  const card = el('div', { class: 'card' });

  if (!m.count) {
    card.append(el('div', { class: 'empty' },
      'אין לקוחות בריטיינר. חבילת ארבעת הסרטונים ב-4,200 ₪ היא בדיוק כזאת — ' +
      'בכרטיס הלקוח אפשר לסמן "משלם כל חודש" ואז הוא ייספר כאן.'));
    return card;
  }

  card.append(el('div', { class: 'grid g3', style: { marginBottom: '13px' } },
    statBox('הכנסה חודשית קבועה', nis(m.total), {
      cls: 'g', tip: 'money.mrr', sub: `${m.count} לקוחות בריטיינר`
    }),
    statBox('כיסוי המנויים', Math.round(m.total / Math.max(1, monthlySubsILS()) * 100) + '%', {
      sub: `המנויים עולים ${nis(monthlySubsILS())} בחודש`
    }),
    statBox('בשנה', nis(m.total * 12), { sub: 'אם כולם יישארו' })
  ));

  if (due.length) card.append(el('div', { class: 'alert warn', style: { marginBottom: '11px' } },
    el('div', { style: { flex: 1 } },
      due.length === 1
        ? `${due[0].title} — חידוש ב-${dmy(due[0].nextRenewalAt)}`
        : `${due.length} חידושים בעשרה הימים הקרובים`)));

  const tb = el('table', { class: 'tb' },
    el('tr', {}, el('th', {}, 'לקוח'), el('th', {}, 'לחודש'), el('th', {}, 'חידוש הבא'), el('th', {})));
  m.list.forEach(c => {
    const late = c.nextRenewalAt && c.nextRenewalAt < Date.now();
    tb.append(el('tr', {},
      el('td', { style: { fontWeight: '600', cursor: 'pointer' }, onclick: () => openItem(c.id) }, c.title),
      el('td', { class: 'num' }, nis(c.monthlyAmount || c.amount || 0)),
      el('td', { class: 'num', style: { color: late ? '#ff5a4d' : '' } },
        c.nextRenewalAt ? dmy(c.nextRenewalAt) : '—'),
      el('td', {}, el('button', {
        class: 'btn btn-xs', 'data-tip': 'רושם את התשלום החודשי ומזיז את החידוש חודש קדימה',
        onclick: () => {
          const amt = c.monthlyAmount || c.amount || 0;
          update(st => {
            st.ledger.push({ id: uid('lg'), title: `ריטיינר — ${c.title}`, amount: amt, date: Date.now() });
            const x = st.items.find(i => i.id === c.id);
            if (x) { x.nextRenewalAt = MO.nextRenewalDate(x.nextRenewalAt || Date.now()); x.paidAt = Date.now(); }
          }, { label: 'רישום חידוש' });
          toast(`נרשם ${nis(amt)} מ${c.title}`, 'ok');
          refresh();
        }
      }, 'שולם'))
    ));
  });
  card.append(tb);
  return card;
}

/* ================= החודש בפועל ================= */

function headline() {
  const s = S();
  const m = monthMoney();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const focus = T.focusMs(null, monthStart, Date.now());
  const realHourly = focus ? m.profit / (focus / HOUR) : null;
  const target = s.settings.hourlyTarget || 250;

  return el('div', { class: 'grid g4' },
    statBox('נכנס החודש', nis(m.income), {
      cls: 'g', sub: `${m.delivered} סרטונים נמסרו`,
      tip: 'כסף מלקוחות שסימנת אצלם "שולם" החודש. מתעדכן לבד כשאתה מעביר לקוח לשלב תשלום.'
    }),
    statBox('יצא החודש', nis(m.expenses), {
      cls: 'r', sub: `מנויים ${nis(m.subs)}${m.media ? ' · מדיה ' + nis(m.media) : ''}`,
      tip: 'מנויים חודשיים, עלויות מדיה שנזקפו ללקוחות, וכל תנועה שרשמת ידנית.'
    }),
    statBox('נשאר בכיס', nis(m.profit), {
      cls: m.profit >= 0 ? 'y' : 'r',
      sub: m.profit >= 0 ? 'זה הרווח האמיתי' : 'ההוצאות גדולות מההכנסות',
      tip: 'money.monthlyNet'
    }),
    statBox('השעה שלך יוצאת', realHourly == null ? '—' : nis(realHourly), {
      color: realHourly == null ? '' : realHourly >= target ? '#3ddc84' : '#ff9f43',
      sub: realHourly == null ? 'צריך שעות רשומות' : `היעד שקבעת: ${nis(target)}`,
      tip: 'money.realHourly'
    })
  );
}

/* ================= סרטון בודד — שני מספרים, לא אחד ================= */

function perVideo() {
  const e = unitEconomics();
  const card = el('div', { class: 'card' });

  const covers = e.profitPerVideo >= 0;

  card.append(el('div', { class: 'grid g2', style: { gap: '18px' } },
    /* --- כסף אמיתי --- */
    el('div', {},
      el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } },
        el('span', { style: { fontWeight: '700' } }, 'נשאר לך בכיס'),
        hintBadge('money.cashPerVideo')),
      el('div', { class: 'tabular', style: { fontSize: '30px', fontWeight: '900', color: '#3ddc84' } },
        nis(e.cashPerVideo)),
      el('div', { class: 'small muted', style: { lineHeight: '1.6', marginTop: '4px' } },
        `המחיר ${nis(e.price)} פחות ${nis(e.subsPerVideo)} מנויים ופחות ${nis(e.leadCost)} פרסום. ` +
        'זה כסף אמיתי שנכנס לחשבון.')
    ),
    /* --- מול התעריף --- */
    el('div', {},
      el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } },
        el('span', { style: { fontWeight: '700' } }, 'מול התעריף שקבעת'),
        hintBadge('money.vsRate')),
      el('div', { class: 'tabular', style: { fontSize: '30px', fontWeight: '900', color: covers ? '#3ddc84' : '#ff9f43' } },
        (covers ? '+' : '') + nis(e.profitPerVideo)),
      el('div', { class: 'small muted', style: { lineHeight: '1.6', marginTop: '4px' } },
        covers
          ? `המחיר מכסה בנוחות תעריף של ${nis(e.rate)} לשעה.`
          : `זה לא הפסד כסף. זה אומר שהמחיר לא מכסה ${nis(e.rate)} לשעה כשסרטון לוקח ${num(e.hours)} שעות.`)
    )
  ));

  /* --- הפירוק, בשפה פשוטה --- */
  card.append(el('div', { class: 'hr' }));
  card.append(el('div', { class: 'small muted', style: { marginBottom: '8px' } },
    'מאיפה המספרים באים:'));

  const tb = el('table', { class: 'tb' });
  const row = (k, sub, v, tip, strong) => tb.append(el('tr', {},
    el('td', {},
      el('div', { style: { display: 'flex', alignItems: 'center', fontWeight: strong ? '700' : '400' } },
        k, tip ? hintBadge(tip) : null),
      sub ? el('div', { class: 'small muted' }, sub) : null),
    el('td', { class: 'num', style: { fontWeight: strong ? '700' : '400' } }, v)
  ));

  row('מה הלקוח משלם', 'המחיר שקבעת לסרטון בודד', nis(e.price), null, true);
  row('פחות: חלק מהמנויים', `${nis(e.subsILS)} לחודש חלקי ${e.perMonth} סרטונים`, '−' + nis(e.subsPerVideo), 'money.subsPerVideo');
  row('פחות: פרסום להביא את הלקוח', 'עלות ממוצעת לליד', '−' + nis(e.leadCost), 'money.leadCost');
  row('= נשאר בכיס', 'כסף אמיתי', nis(e.cashPerVideo), null, true);
  row('פחות: הזמן שלך', `${num(e.hours)} שעות × ${nis(e.rate)} לשעה — לא כסף שיוצא`, '−' + nis(e.timeCost), 'money.timeCost');
  row('= מול התעריף שקבעת', covers ? 'המחיר מכסה את התעריף' : 'המחיר לא מכסה את התעריף', nis(e.profitPerVideo), null, true);
  card.append(tb);

  /* --- מה לעשות עם זה --- */
  if (!covers) card.append(adviceBox(e));

  card.append(hoursSourceLine(e.line.id));

  return card;
}

/** מאיפה בא המספר "כמה שעות לוקח סרטון" — כדי שתדע כמה לסמוך עליו */
function hoursSourceLine(lineId) {
  const h = hoursPerVideo(lineId);
  const box = el('div', { class: 'small muted', style: { marginTop: '11px', lineHeight: '1.7' } });

  if (h.source === 'samples') {
    box.append(el('span', { style: { color: '#a3e635', fontWeight: '600' } },
      `סרטון לוקח לך ${num(h.hours)} שעות נטו`));
    box.append(el('span', {}, ` — נמדד מ-${h.samples} דגימות על ${h.n} סרטונים שנמסרו. ` +
      `טווח הטעות בערך ±${h.errorPct}%, והוא קטן ככל שנאספות עוד דגימות.`));
  } else if (h.source === 'timer') {
    box.append(el('span', { style: { color: '#ffd400', fontWeight: '600' } },
      `סרטון לוקח לך ${num(h.hours)} שעות`));
    box.append(el('span', {}, ` — לפי הטיימר, על ${h.n} סרטונים שנמסרו. ` +
      'הטיימר מדויק רק כשזכרת להחליף אותו. '));
    box.append(el('a', { href: '#/time', style: { cursor: 'pointer' } }, 'הדגימות נותנות מספר אמין יותר.'));
  } else {
    box.append(el('span', {}, `סרטון לוקח לך ${num(h.hours)} שעות — זו ההערכה שהקלדת, לא מדידה. `));
    box.append(el('a', { href: '#/time' }, 'הפעל מדידה בדגימות'));
    box.append(el('span', {}, ' ותוך שבוע יהיה כאן מספר אמיתי.'));
  }
  return box;
}

/**
 * המלצות קונקרטיות לסגירת הפער.
 * שני מצבים שונים לגמרי:
 *  - נשאר בכיס שלילי: המחיר לא מכסה אפילו מנויים ופרסום. קיצור שעות לא יעזור.
 *  - נשאר בכיס חיובי אבל קטן מהתעריף: שלוש דרכים אמיתיות לבחור מהן.
 */
function adviceBox(e) {
  const box = el('div', { class: 'advice' });
  const list = el('ul', { style: { margin: '0', paddingInlineStart: '18px', lineHeight: '1.9' } });

  if (e.cashPerVideo <= 0) {
    // המנויים לבדם גדולים מהמחיר — רק מחיר או כמות יעזרו
    const priceNeeded = Math.ceil((e.subsPerVideo + e.leadCost) / 10) * 10;
    const perMonthNeeded = (e.price - e.leadCost) > 0
      ? Math.ceil(e.subsILS / (e.price - e.leadCost)) + 1
      : null;

    const qty = e.perMonth === 1 ? 'סרטון אחד' : e.perMonth === 2 ? 'שני סרטונים' : `${e.perMonth} סרטונים`;
    box.append(el('div', { style: { fontWeight: '700', marginBottom: '7px' } },
      `בקצב של ${qty} בחודש, המנויים לבדם עולים ${nis(e.subsPerVideo)} לסרטון — יותר מהמחיר.`));
    list.append(el('li', {}, `לעשות יותר סרטונים: המנויים מתחלקים על יותר ראשים${perMonthNeeded ? `. מ-${perMonthNeeded} סרטונים בחודש זה מתחיל להיות רווחי` : ''}`));
    list.append(el('li', {}, `או להעלות את המחיר למעל ${nis(priceNeeded)} לסרטון`));
    list.append(el('li', {}, `או לקצץ מנויים — ${nis(e.subsILS)} לחודש זו ההוצאה הכי כבדה שלך`));
    box.append(list);
    box.append(el('div', { class: 'small muted', style: { marginTop: '8px' } },
      'שים לב: כמות הסרטונים מחושבת ממה שנמסר החודש בפועל. אם החודש רק התחיל, המספר עוד יעלה.'));
    return box;
  }

  // הכסף חיובי, פשוט לא מספיק לתעריף — שלוש דרכים אמיתיות
  const priceNeeded = Math.ceil(e.costPerVideo / 10) * 10;
  const hoursNeeded = e.rate > 0 ? e.cashPerVideo / e.rate : 0;
  const rateSupported = e.hours > 0 ? e.cashPerVideo / e.hours : 0;

  box.append(el('div', { style: { fontWeight: '700', marginBottom: '7px' } }, 'שלוש דרכים לסגור את הפער — בחר אחת:'));
  list.append(el('li', {}, `להעלות את המחיר ל-${nis(priceNeeded)} לסרטון`));
  if (hoursNeeded >= 0.25)
    list.append(el('li', {}, `לקצר את העבודה ל-${num(hoursNeeded)} שעות לסרטון (עכשיו ${num(e.hours)})`));
  if (rateSupported > 0)
    list.append(el('li', {}, `להוריד את היעד ל-${nis(rateSupported)} לשעה — זה מה שהמחיר הנוכחי מממן`));
  box.append(list);
  box.append(el('div', { class: 'small muted', style: { marginTop: '8px' } },
    'אפשר גם לשלב. תזיז את הסליידרים למטה כדי לראות מה מרגיש נכון.'));
  return box;
}

/* ================= סימולטור ================= */

const SLIDERS = [
  { key: 'price', name: 'מחיר לסרטון', desc: 'כמה אתה גובה על סרטון בודד. המספר הכי קל לשנות והכי מפחיד לגעת בו.', min: 400, max: 4000, step: 10, fmt: nis },
  { key: 'perMonth', name: 'כמה סרטונים בחודש', desc: 'כמה אתה מספיק בפועל — לא כמה היית רוצה. ככל שיותר, המנויים מתחלקים על יותר סרטונים.', min: 1, max: 30, step: 1, fmt: v => v + ' סרטונים' },
  { key: 'leadCost', name: 'עלות להביא לקוח אחד', desc: 'כמה פרסום עולה כדי שלקוח אחד יסגור. הוצאת 900 ₪ והגיעו 5? זה 180 ₪.', min: 0, max: 800, step: 10, fmt: nis },
  { key: 'hours', name: 'שעות עבודה לסרטון', desc: 'זמן קשב אמיתי, לא זמן שהפרויקט פתוח. המערכת מציעה את מה שהיא מדדה אצלך.', min: 0.5, max: 20, step: 0.5, fmt: v => num(v) + ' שעות' },
  { key: 'rate', name: 'כמה השעה שלך שווה', desc: 'היעד שאתה קובע לעצמך. לא כסף שיוצא — רק בדיקה אם המחיר הוגן כלפיך.', min: 50, max: 800, step: 10, fmt: nis }
];

function simulator() {
  const base = unitEconomics();
  const vals = {
    price: base.price, perMonth: base.perMonth, leadCost: base.leadCost,
    hours: base.hours, rate: base.rate
  };

  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h2', { style: { display: 'flex', alignItems: 'center' } }, 'סימולטור', hintBadge('money.simulator')),
    el('span', { class: 'sub' }, 'שום דבר לא נשמר עד שתלחץ'),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-xs',
        'data-tip': 'שומר את הערכים האלה כברירת המחדל של המערכת. משפיע על כל החישובים בעמוד.',
        onclick: () => {
          update(st => {
            const l = st.productLines.find(x => x.id === base.line.id);
            l.pricing.unit = vals.price;
            l.estHours = vals.hours;
            st.settings.hourlyTarget = vals.rate;
            st.settings.avgLeadCost = vals.leadCost;
          });
          toast('נשמר כברירת מחדל', 'ok'); refresh();
        }
      }, 'שמור את הערכים האלה'))
  ));

  const out = el('div', {});
  const verdictBox = el('div', { class: 'verdict', style: { marginBottom: '14px' } });

  const paint = () => {
    const e = unitEconomics(vals);
    verdictBox.innerHTML = '';
    verdictBox.append(...verdict(e));
    out.innerHTML = '';
    out.append(el('div', { class: 'grid g4' },
      kpi('נשאר בכיס לסרטון', nis(e.cashPerVideo), '#3ddc84', 'כסף אמיתי, בלי הזמן שלך', 'money.cashPerVideo'),
      kpi('נטו לחודש', nis(e.monthlyNet), e.monthlyNet > 0 ? '#3ddc84' : '#ff5a4d', 'הכנסות פחות הוצאות', 'money.monthlyNet'),
      kpi('השעה שלך תצא', nis(e.realHourly), e.realHourly >= vals.rate ? '#3ddc84' : '#ff9f43', `היעד: ${nis(vals.rate)}`, 'money.realHourly'),
      kpi('שעות עבודה ביום', num(e.hoursPerDay) + ' שע\'', e.hoursPerDay > 9 ? '#ff5a4d' : '#ffffff', 'ב-22 ימי עבודה בחודש')
    ));
  };

  SLIDERS.forEach(sl => {
    const wrap = el('div', { class: 'sl' });
    const valNode = el('span', { class: 'vv' }, sl.fmt(vals[sl.key]));
    const range = el('input', {
      type: 'range', min: sl.min, max: sl.max, step: sl.step, value: vals[sl.key],
      'aria-label': sl.name,
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

function kpi(lbl, val, color, sub, tip) {
  return el('div', {},
    el('div', { class: 'small muted', style: { display: 'flex', alignItems: 'center' } },
      lbl, tip ? hintBadge(tip) : null),
    el('div', { class: 'tabular', style: { fontSize: '20px', fontWeight: '900', color } }, val),
    el('div', { class: 'small muted' }, sub)
  );
}

/** משפט אחד בעברית + שורת המלצה */
function verdict(e) {
  const net = Math.round(e.monthlyNet);
  const hpd = e.hoursPerDay;
  const main = `בקצב הזה תגיע ל-${nis(net)} נטו בחודש, ותעבוד ${num(hpd)} שעות ביום.`;

  let advice;
  if (net < 0) advice = 'אתה מפסיד. המנויים לבדם אוכלים את ההכנסה — צריך יותר סרטונים או מחיר גבוה יותר.';
  else if (hpd > 9) advice = 'זה יותר משעות של משרה מלאה. או להעלות מחיר, או להוריד כמות.';
  else if (e.realHourly < e.rate) advice = `השעה שלך יוצאת ${nis(e.realHourly)} מול יעד של ${nis(e.rate)}. הפער לא ענק — מחיר קצת גבוה יותר סוגר אותו.`;
  else if (hpd < 3) advice = 'נשאר לך זמן. הוא שווה יותר בשיווק מאשר בהמתנה.';
  else advice = 'המספרים סוגרים. זה קצב שאפשר לחיות איתו.';

  return [
    el('div', {}, main),
    el('div', { class: 'small', style: { marginTop: '7px', opacity: '.85' } }, advice)
  ];
}

/* ================= מנויים ================= */

function subsCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  const total = monthlySubsILS();
  const usd = s.subscriptions.filter(x => x.currency === 'USD').reduce((a, x) => a + x.cost, 0);

  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'מנויים', hintBadge('money.subs')),
    el('span', { class: 'sub' }, `$${num(usd, 0)} · ${nis(total)} לחודש`),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-xs', 'data-tip': 'מוסיף שורת מנוי ריקה. מלא שם וסכום.',
        onclick: () => {
          update(st => st.subscriptions.push({ id: uid('s'), name: 'מנוי חדש', cost: 0, currency: 'USD' }));
          refresh();
        }
      }, '+ מנוי')
    )));

  const rateInp = input({ type: 'number', step: '0.01', value: s.settings.usdRate, style: { width: '86px' } });
  rateInp.addEventListener('change', () => { update(st => { st.settings.usdRate = Number(rateInp.value) || 3.65; }); refresh(); });

  s.subscriptions.forEach(sub => {
    const nm = input({ value: sub.name, style: { flex: '2' }, 'aria-label': 'שם המנוי' });
    const co = input({ type: 'number', value: sub.cost, style: { flex: '0 0 80px' }, 'aria-label': 'עלות' });
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
        class: 'btn btn-xs btn-danger', 'data-tip': 'מוחק את המנוי מהרשימה',
        onclick: () => { update(st => { st.subscriptions = st.subscriptions.filter(y => y.id !== sub.id); }); refresh(); }
      }, '×')
    ));
  });

  card.append(el('div', { class: 'hr' }));
  card.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
    el('span', { class: 'small muted', style: { flex: 1, display: 'flex', alignItems: 'center' } },
      'שער דולר', hintBadge('כמה שקלים בדולר. משמש להמרת המנויים הדולריים.')),
    rateInp));
  card.append(el('div', { style: { display: 'flex', marginTop: '9px' } },
    el('span', { style: { flex: 1, fontWeight: '700' } }, 'סה"כ יוצא כל חודש'),
    el('span', { class: 'tabular', style: { fontWeight: '900', color: '#ff5a4d' } }, nis(total))));
  return card;
}

/* ================= תנועות ================= */

function ledgerCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'תנועות', hintBadge('money.ledger')),
    el('div', { class: 'right' }, el('button', { class: 'btn btn-xs', onclick: () => ledgerModal() }, '+ תנועה'))));

  const paid = s.items.filter(i => i.type === 'client' && i.paidAt)
    .map(c => ({ id: c.id, date: c.paidAt, title: c.title, amount: Number(c.amount) || 0, auto: true }));
  const manual = s.ledger.map(l => ({ id: l.id, date: l.date, title: l.title, amount: l.amount, auto: false }));
  const all = paid.concat(manual).sort((a, b) => b.date - a.date).slice(0, 14);

  if (!all.length) {
    card.append(el('div', { class: 'empty' },
      'אין תנועות עדיין. תשלום מלקוח נרשם כאן לבד ברגע שתעביר אותו לשלב "תשלום" בצינור.'));
    return card;
  }

  all.forEach(r => card.append(el('div', { style: { display: 'flex', gap: '8px', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,.05)' } },
    el('span', { class: 'muted small tabular', style: { flex: '0 0 54px' } }, dmy(r.date)),
    el('span', {
      style: { flex: 1, cursor: r.auto ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      'data-tip': r.auto ? 'נרשם לבד כשהלקוח עבר לשלב תשלום. לחיצה פותחת את כרטיס הלקוח.' : null,
      onclick: () => r.auto && openItem(r.id)
    }, r.title),
    el('span', { class: 'tabular', style: { color: r.amount >= 0 ? '#3ddc84' : '#ff5a4d' } },
      (r.amount >= 0 ? '+' : '−') + nis(Math.abs(r.amount))),
    !r.auto ? el('button', {
      class: 'btn btn-xs', style: { padding: '1px 6px' }, 'data-tip': 'מוחק את התנועה',
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
    title: 'תנועת כסף ידנית',
    body: el('div', {},
      el('div', { class: 'muted small', style: { marginBottom: '12px' } },
        'להוצאות ולהכנסות שלא מגיעות מלקוח בצינור — קמפיין, רישיון, החזר.'),
      field('על מה', fT),
      el('div', { class: 'row' },
        field('סכום ₪', fA, 'מספר רגיל = הכנסה. מספר עם מינוס = הוצאה.'),
        field('תאריך', fD))),
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
