/* ============================================================
   assistant.js — שני מצבים: מנוע כללים (חינם, תמיד) וצ'אט (API)
   ============================================================ */

import { S, update, monthMoney, monthlySubsILS, lineOf, stageOf } from '../store.js';
import { el, dur, nis, num, ago, toast, HOUR, DAY, startOfDay } from '../util.js';
import * as T from '../timer.js';
import { runRules } from '../rules.js';
import { callAssistant } from '../api.js';
import { unitEconomics, rankedKnowledge, dueRoutines, actionQueue, measuredHoursPerVideo } from '../brain.js';
import { refresh, go } from '../app.js';
import { hintBadge } from '../help.js';
import * as KH from '../knowhow.js';
import * as TOUR from '../tour.js';

export default { render };

let sending = false;

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'עוזר'),
    el('div', { class: 'desc' },
      'שאל אותו על העסק — או על המערכת עצמה: "איפה מדליקים סנכרון", "מחקתי בטעות". ' +
      'שאלות על המערכת נענות כאן במקום, בלי לשלוח שום דבר החוצה.',
      hintBadge('assist.cost')),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-sm', onclick: () => { update(st => { st.chat = []; }); refresh(); } }, 'נקה שיחה'))
  ));

  /* ---- מנוע כללים ---- */
  const rules = el('div', { class: 'card' });
  rules.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'מנוע הכללים', hintBadge('assist.cost')),
    el('span', { class: 'sub' }, 'רץ תמיד · לא עולה כלום · אותן התראות שבבית')));
  const alerts = runRules();
  const box = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } });
  alerts.forEach(a => box.append(el('div', { class: 'alert ' + (a.level || '') }, el('div', { style: { flex: 1 } }, a.text))));
  rules.append(box);
  root.append(rules);

  /* ---- צ'אט ---- */
  const card = el('div', { class: 'card', style: { marginTop: '14px' } });
  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'צ\'אט', hintBadge('assist.context')),
    el('span', { class: 'sub' }, 'העסק והמערכת · מקבל את הנתונים שלך')));

  const chat = el('div', { class: 'chat' });
  const msgs = s.chat || [];
  if (!msgs.length) {
    chat.append(el('div', { class: 'msg sys' },
      'שאלות על המערכת ("איך מוחקים זמן שנרשם בטעות?") נענות מיד ובחינם. ' +
      'שאלות על העסק הולכות לקלוד עם כל הנתונים שלך.'));
    const sugg = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' } });
    [
      'שמתי טיימר על הדבר הלא נכון, איך מוחקים?',
      'איפה מדליקים סנכרון עם הטלפון?',
      'לפי המספרים שלי — להעלות מחיר או להוריד זמן?',
      'מה הדבר הכי חשוב שאני לא עושה עכשיו?'
    ].forEach(q => sugg.append(el('button', { class: 'btn btn-xs', onclick: () => send(q) }, q)));
    chat.append(sugg);
  }
  msgs.forEach((m, i) => chat.append(msgNode(m, i)));
  card.append(chat);

  const inp = el('input', { class: 'inp', placeholder: 'שאל את העוזר…', style: { flex: 1 } });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(inp.value, inp); });
  card.append(el('div', { style: { display: 'flex', gap: '7px', marginTop: '12px' } },
    inp,
    el('button', { class: 'btn btn-y', onclick: () => send(inp.value, inp) }, 'שלח')));

  card.append(el('div', { class: 'small muted', style: { marginTop: '9px' } },
    'שאלות על המערכת עובדות תמיד, גם בלי אינטרנט. שאלות על העסק דורשות ' +
    'ANTHROPIC_API_KEY במשתני הסביבה של האתר. ראה README.'));
  root.append(card);
  setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 30);
}

/* ============================================================
   הודעה בצ'אט
   ------------------------------------------------------------
   תשובה על המערכת שווה הרבה פחות אם היא רק טקסט. "הגדרות →
   סנכרון" זה עדיין ניווט שאתה צריך לעשות, אז הכפתור עושה אותו.
   ============================================================ */

function msgNode(m) {
  const node = el('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') }, m.text);
  if (m.role === 'user') return node;

  const acts = [];
  if (m.go) acts.push(el('button', { class: 'btn btn-xs btn-y', onclick: () => go(m.go) }, 'קח אותי לשם'));
  if (m.tour) acts.push(el('button', { class: 'btn btn-xs', onclick: () => TOUR.start(m.tour) }, '▶ הראה לי'));
  if (m.local && m.q) {
    acts.push(el('button', {
      class: 'btn btn-xs', title: 'אם לא לזה התכוונת',
      onclick: () => send(m.q, null, true)
    }, 'לא לזה התכוונתי'));
  }
  if (acts.length) node.append(el('div', { class: 'msg-acts' }, ...acts));
  return node;
}

/* ================= שליחה ================= */

/* skipLocal — כשהוא לחץ "לא לזה התכוונתי": אותה שאלה, הפעם לקלוד. */
async function send(text, inputNode, skipLocal) {
  text = String(text || '').trim();
  if (!text || sending) return;
  sending = true;
  if (inputNode) inputNode.value = '';

  if (skipLocal) {
    /* השאלה כבר בהיסטוריה. מסירים את התשובה המקומית שלא קלעה,
       כדי שהשיחה תסתיים בשאלה שלו ולא בתשובה שנדחתה. */
    update(s => {
      for (let i = s.chat.length - 1; i >= 0; i--) {
        if (s.chat[i].local && s.chat[i].q === text) { s.chat.splice(i, 1); break; }
      }
    });
  } else {
    update(s => { s.chat.push({ role: 'user', text, at: Date.now() }); });
  }

  /* ---- תשובה מקומית על המערכת ----
     מיידית, בלי רשת, בלי מפתח, ובלי סיכוי שתומצא כאן פונקציה
     שלא קיימת. answer() מחזיר null כשההתאמה לא חד-משמעית. */
  const known = skipLocal ? null : KH.answer(text);
  if (known) {
    update(s => {
      s.chat.push({
        role: 'assistant', text: known.a, at: Date.now(),
        go: known.go || null, tour: known.tour || null, local: true, q: text
      });
    });
    sending = false;
    refresh();
    return;
  }
  refresh();

  const chatEl = document.querySelector('.chat');
  const pending = el('div', { class: 'msg ai' }, 'חושב…');
  if (chatEl) { chatEl.append(pending); chatEl.scrollTop = chatEl.scrollHeight; }

  try {
    const r = await callAssistant({
      mode: 'chat',
      messages: S().chat.slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      context: snapshot()
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('שגיאה ' + r.status));
    update(s => { s.chat.push({ role: 'assistant', text: j.text || '(תשובה ריקה)', at: Date.now() }); });
  } catch (e) {
    /* אם השרת לא זמין, נציע את מה שכן יש כאן. ההתאמה לא הייתה
       חזקה מספיק לענות בביטחון — אבל היא טובה מספיק להצעה. */
    const near = KH.search(text, 2).filter(h => h.score >= 5).map(h => h.entry);
    update(s => {
      s.chat.push({
        role: 'assistant',
        text: 'לא הצלחתי להגיע לעוזר: ' + (e.message || e) +
          '\n\nבדוק ש-ANTHROPIC_API_KEY מוגדר במשתני הסביבה של האתר (ב-Vercel: Settings → Environment Variables · ב-Netlify: Site configuration → Environment variables), ושהאתר עלה מחדש אחרי ההגדרה. מקומית צריך vercel dev או netlify dev.' +
          '\n\nבינתיים שאלות על המערכת עצמה — "איפה", "איך עושים" — נענות כאן גם בלי מפתח.' +
          (near.length ? '\n\nאולי התכוונת ל: ' + near.map(x => '"' + x.q[0] + '"').join(' · ') : '')
      });
    });
  } finally {
    sending = false;
    refresh();
  }
}

/* ================= תמונת מצב למודל ================= */

export function snapshot() {
  const s = S();
  const m = monthMoney();
  const e = unitEconomics();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const focusMonth = T.focusMs(null, monthStart, Date.now());
  const av = T.availableToday();
  const t = T.activeTimer();

  const clients = s.items.filter(i => i.type === 'client' && !i.archived).map(c => ({
    שם: c.title, עסק: c.business || '', קו: lineOf(c.productLineId).name,
    שלב: stageOf(c).name, בשלב: ago(c.stageSince || c.createdAt),
    סכום: c.amount || 0,
    שולם: !!c.paidAt, נמסר: !!c.deliveredAt,
    זמן_קשב: dur(T.focusMs(c.id)), זמן_קיר: dur(T.wallMs(c.id)),
    המתנה: T.waitMs(c.id) ? dur(T.waitMs(c.id)) : null,
    יעד: c.dueDate ? new Date(c.dueDate).toLocaleDateString('he-IL') : null
  }));

  return {
    היום: new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    בעלים: s.settings.ownerName,
    קווי_מוצר: s.productLines.map(p => ({
      שם: p.name,
      שלבים: p.stages.map(x => x.name),
      מחיר_יחיד: p.pricing?.unit, מחיר_חבילה: p.pricing?.bundle,
      ימי_אספקה: p.pricing?.deliveryDays,
      שעות_קשב_נמדדות_לפריט: measuredHoursPerVideo(p.id)
    })),
    כסף_החודש: {
      הכנסות: m.income, הוצאות: m.expenses, נטו: m.profit,
      מנויים_חודשי: Math.round(monthlySubsILS()), נמסרו: m.delivered,
      עלות_לסרטון: Math.round(e.costPerVideo), רווח_לסרטון: Math.round(e.profitPerVideo),
      רווח_לשעה_בפועל: focusMonth ? Math.round(m.profit / (focusMonth / HOUR)) : null,
      תעריף_שעתי_יעד: s.settings.hourlyTarget
    },
    זמן: {
      זמן_קשב_החודש: dur(focusMonth),
      זמן_קשב_היום: dur(av.used),
      זמן_זמין_ביום: dur(av.total),
      רץ_עכשיו: t ? { פריט: t.itemId ? (s.items.find(i => i.id === t.itemId)?.title || '') : 'כללי', סוג: T.KINDS[t.kind].name, כמה: dur(T.elapsed()) } : null,
      בהמתנה: s.waiting.map(w => (s.items.find(i => i.id === w.itemId) || {}).title).filter(Boolean)
    },
    לקוחות: clients,
    משימות_פתוחות: s.items.filter(i => i.type === 'task' && !i.done && !i.archived).map(t2 => t2.title).slice(0, 25),
    החלטות_פתוחות: s.items.filter(i => i.type === 'decision' && i.status === 'open' && !i.archived)
      .map(d => ({ שאלה: d.title, פתוחה: ago(d.createdAt), הערה: d.note || '' })),
    ידע_ממתין: rankedKnowledge().slice(0, 10).map(k => ({ כותרת: k.item.title, למה: k.why, דקות: k.item.estMinutes })),
    שגרות_ממתינות: dueRoutines().map(r => r.title),
    רעיונות: s.items.filter(i => i.type === 'idea' && !i.archived).map(i => i.title).slice(0, 15),
    התראות_מנוע_הכללים: runRules().map(a => a.text),
    מה_דחוף_עכשיו: actionQueue(7).map(x => ({ פריט: x.item.title, למה: x.why }))
  };
}
