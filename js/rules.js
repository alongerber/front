/* ============================================================
   rules.js — מנוע הכללים
   רץ תמיד, בלי עלות. מייצר את ההתראות בבית.
   ============================================================ */

import { S, monthMoney, lineOf, stageOf } from './store.js';
import { MIN, HOUR, DAY, dur, nis, ago, startOfDay } from './util.js';
import { activeTimer, elapsed, focusMs, avgFocusPerDelivery, availableToday } from './timer.js';
import { dueRoutines, unitEconomics, deliveredThisMonth } from './brain.js';
import * as IN from './inbox.js';
import * as CL from './clock.js';

const now = () => Date.now();

/** מחזיר [{id, level:'bad'|'warn'|'good'|'', text, action?}] */
export function runRules() {
  const s = S();
  const st = s.settings;
  const out = [];
  const push = (id, level, text, action) => out.push({ id, level, text, action });

  /* --- תיבת הנכנס ---
     ראשונה ברשימה בכוונה: תשלום שנקלט ולא אושר הוא לקוח שממתין
     ולא יודע את זה. */
  const inbox = IN.pending();
  if (inbox.length) {
    const money = inbox.filter(r => r.kind === 'payment').length;
    push('inbox', money ? 'bad' : 'warn',
      money
        ? (money === 1 ? 'התקבל תשלום שממתין לאישור' : `${money} תשלומים ממתינים לאישור`)
        : `${inbox.length} ${inbox.length === 1 ? 'דבר ממתין' : 'דברים ממתינים'} בנכנס`,
      { type: 'goto', href: '#/inbox' });
  }

  /* --- לידים ללא מענה --- */
  const leadStageNames = ['ליד', 'שיחת מכירה'];
  const lateLeads = s.items.filter(i => {
    if (i.type !== 'client' || i.archived || i.deliveredAt) return false;
    const stg = stageOf(i);
    if (!leadStageNames.some(n => stg.name.includes(n))) return false;
    return now() - (i.stageSince || i.createdAt) > (st.leadSlaMinutes || 120) * MIN;
  });
  if (lateLeads.length) {
    push('leads', 'bad',
      lateLeads.length === 1
        ? `${lateLeads[0].title} מחכה למענה ${ago(lateLeads[0].stageSince || lateLeads[0].createdAt)}`
        : `${lateLeads.length} לידים בלי מענה מעל ${dur((st.leadSlaMinutes || 120) * MIN)}`,
      { type: 'goto', href: '#/pipeline' });
  }

  /* --- הפקות שחורגות מהממוצע --- */
  const avg = avgFocusPerDelivery();
  if (avg && avg.count >= 2) {
    s.items.filter(i => i.type === 'production' && !i.deliveredAt && !i.archived).forEach(c => {
      const f = focusMs(c.id);
      if (f > avg.avgMs * 1.4 && f > 30 * MIN) {
        const over = Math.round((f / avg.avgMs - 1) * 100);
        push('over_' + c.id, 'warn', `${c.title} עבר את הממוצע ב-${over}% (${dur(f)} מול ${dur(avg.avgMs)})`,
          { type: 'goto', href: '#/time' });
      }
    });
  }

  /* --- שעון ההפקה ---
     ההתראה נופלת ביום העסקים החמישי מתוך שבעה. לא ביום השביעי,
     כי אז כבר אין מה לעשות איתה. */
  CL.openClocks().forEach(x => {
    const p = x.production;
    const name = (s.items.find(i => i.id === p.clientId) || {}).title || p.title;
    if (x.state === 'late')
      push('clock_' + p.id, 'bad',
        `${name} — עברת את ההבטחה ב-${Math.abs(x.left)} ${Math.abs(x.left) === 1 ? 'יום עסקים' : 'ימי עסקים'}`,
        { type: 'goto', href: '#/pipeline' });
    else if (!x.paused && x.left <= 2)
      push('clock_' + p.id, 'warn',
        x.left === 0
          ? `${name} — היום היום האחרון מתוך ${CL.promisedDays(p)} ימי העסקים`
          : `${name} — נשארו ${x.left} ${x.left === 1 ? 'יום עסקים' : 'ימי עסקים'} מתוך ${CL.promisedDays(p)}`,
        { type: 'goto', href: '#/pipeline' });
  });

  /* --- דדליינים --- */
  s.items.filter(i => (i.type === 'production' || i.type === 'task') && !i.archived && !i.done && !i.deliveredAt && i.dueDate)
    .filter(i => !i.clockStartedAt)     // הפקה עם שעון כבר קיבלה התראה משלה
    .forEach(i => {
      const left = i.dueDate - now();
      if (left < 0) push('due_' + i.id, 'bad', `${i.title} — עבר את תאריך היעד ב${ago(i.dueDate)}`);
      else if (left < DAY) push('due_' + i.id, 'warn', `${i.title} — יעד בעוד ${dur(left)}`);
    });

  /* --- חידושים של לקוחות קבועים --- */
  const renew = s.items.filter(i =>
    i.type === 'client' && i.retainer && !i.archived && !i.retainerEndedAt &&
    i.nextRenewalAt && i.nextRenewalAt <= now() + 3 * DAY);
  if (renew.length) {
    const late = renew.filter(c => c.nextRenewalAt < now());
    push('renew', late.length ? 'bad' : 'warn',
      renew.length === 1
        ? (late.length ? `${renew[0].title} — החידוש עבר, לא נרשם תשלום` : `${renew[0].title} — חידוש בעוד ${dur(renew[0].nextRenewalAt - now())}`)
        : `${renew.length} חידושים של לקוחות קבועים בימים הקרובים`,
      { type: 'goto', href: '#/money' });
  }

  /* --- תזכורות מהפנקס --- */
  const dueNotes = s.items.filter(i =>
    i.type === 'note' && !i.archived && i.reminderAt && !i.reminderDone && i.reminderAt <= now());
  if (dueNotes.length) {
    const first = dueNotes[0];
    push('noteRem', 'warn',
      dueNotes.length === 1
        ? `תזכורת מהפנקס: ${first.title || 'פתק בלי כותרת'}`
        : `${dueNotes.length} תזכורות מהפנקס — ${dueNotes.slice(0, 2).map(n => n.title || 'פתק').join(', ')}`,
      { type: 'goto', href: '#/notes' });
  }

  /* --- שגרות --- */
  const routines = dueRoutines().filter(r => r.missCount < 2);
  if (routines.length)
    push('routines', '', routines.length === 1
      ? `שגרה ממתינה: ${routines[0].title}`
      : `${routines.length} שגרות ממתינות — ${routines.slice(0, 2).map(r => r.title).join(', ')}`,
      { type: 'goto', href: '#/routines' });

  /* --- החלטות תקועות --- */
  const staleDecisions = s.items.filter(i => i.type === 'decision' && i.status === 'open' && !i.archived &&
    now() - i.createdAt > (st.decisionStaleDays || 7) * DAY);
  if (staleDecisions.length)
    push('decisions', 'warn',
      `${staleDecisions.length === 1 ? 'החלטה פתוחה' : staleDecisions.length + ' החלטות פתוחות'} כבר ${ago(staleDecisions[0].createdAt)}: ${staleDecisions[0].title}`,
      { type: 'goto', href: '#/decisions' });

  /* --- טיימר רץ יותר מדי --- */
  const t = activeTimer();
  if (t && elapsed() > (st.timerNudgeHours || 2) * HOUR)
    push('timer', 'warn', `הטיימר רץ ${dur(elapsed())} ברצף — זה עדיין נכון?`, { type: 'goto', href: '#/time' });

  /* --- תחזית חודשית --- */
  const m = monthMoney();
  const d = new Date();
  const dayOfMonth = d.getDate();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (dayOfMonth >= 5 && m.income > 0) {
    const projected = m.income / dayOfMonth * daysInMonth;
    const projNet = projected - m.expenses;
    push('forecast', projNet > 0 ? 'good' : 'warn',
      `בקצב הזה תסיים את החודש ב-${nis(projected)} הכנסות · ${nis(projNet)} נטו`,
      { type: 'goto', href: '#/money' });
  } else if (dayOfMonth >= 10 && m.income === 0) {
    push('forecast', 'warn', `${dayOfMonth} בחודש ובלי הכנסה רשומה — ההוצאות רצות על ${nis(m.expenses)}`,
      { type: 'goto', href: '#/money' });
  }

  /* --- זמן זמין --- */
  const av = availableToday();
  if (av.used > av.total * 1.15)
    push('overwork', 'warn', `רשמת ${dur(av.used)} היום — מעל היעד של ${dur(av.total)}`);

  /* --- סקירה שבועית --- */
  const wd = new Date().getDay();
  const wkStart = (() => { const d2 = new Date(); d2.setHours(0, 0, 0, 0); d2.setDate(d2.getDate() - d2.getDay()); return d2.getTime(); })();
  const reviewed = (s.reviews || []).some(r => r.week === wkStart);
  if (!reviewed && (wd === 4 || wd === 5 || wd === 6))
    push('review', '', 'סוף שבוע — שווה עשר דקות של סקירה', { type: 'goto', href: '#/review' });

  /* --- גיבוי --- */
  const lastBackup = st.lastBackupAt || s.createdAt;
  if (st.autoBackupDays && now() - lastBackup > st.autoBackupDays * DAY)
    push('backup', 'warn', `לא גיבית ${ago(lastBackup)}. הנתונים יושבים רק בדפדפן הזה.`,
      { type: 'backup' });

  /* --- אין כלום --- */
  if (!out.length) {
    const k = s.items.filter(i => i.type === 'knowledge' && !i.archived && i.status !== 'done').length;
    push('calm', 'good', k ? `שקט. יש ${k} דברים ללמוד שמחכים — זה הזמן.` : 'שקט. הכל במקום.');
  }

  const dismissed = s.dismissedAlerts || {};
  return out.filter(a => !dismissed[a.id] || dismissed[a.id] < now() - 12 * HOUR);
}

/** מספרים לתגיות בניווט */
export function navCounts() {
  const s = S();
  const q = s.items.filter(i => i.type === 'production' && !i.archived && !i.deliveredAt).length;
  return {
    pipeline: q,
    inbox: IN.count(),
    routines: dueRoutines().filter(r => r.missCount < 2).length,
    knowledge: s.items.filter(i => i.type === 'knowledge' && !i.archived && i.status === 'new').length,
    decisions: s.items.filter(i => i.type === 'decision' && !i.archived && i.status === 'open').length,
    // משימה שממתינה לתאריך עתידי אינה "פתוחה" — התגית חייבת להסכים עם העמוד
    tasks: s.items.filter(i => i.type === 'task' && !i.archived && !i.done &&
      !(i.snoozeUntil && i.snoozeUntil > now())).length,
    notes: s.items.filter(i =>
      i.type === 'note' && !i.archived && i.reminderAt && !i.reminderDone && i.reminderAt <= now()).length,
    // חידושים בשלושת הימים הקרובים — תגית שמופיעה רק אחרי שאיחרת מופיעה מאוחר מדי
    // תגית על המדריך עד שההגדרה הבסיסית הושלמה
    // חייב לספור בדיוק את מה שהעמוד מציג, אחרת התגית אומרת 4 והעמוד אומר 6
    guide: (() => {
      const notifOK = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      const hasIdle = typeof window !== 'undefined' && 'IdleDetector' in window;
      const hasPip = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
      const steps = [
        s.items.some(i => i.type === 'client' && !i.archived),
        hasIdle ? !!s.settings.presenceEnabled : null,
        notifOK,
        hasPip ? !!s.settings.floatUsed : null,
        !!s.settings.installed || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches),
        !!s.settings.syncEnabled && !!localStorage.getItem('front.syncToken'),
        !!s.settings.autoBackupDir || !!s.settings.lastBackupAt,
        s.timeEntries.length > 0 || (s.samples || []).some(x => x.answeredAt)
      ];
      return steps.filter(x => x === false).length;
    })(),
    review: (() => {
      const d2 = new Date(); d2.setHours(0, 0, 0, 0); d2.setDate(d2.getDate() - d2.getDay());
      const wk = d2.getTime();
      const day = new Date().getDay();
      return (day >= 4 && !(s.reviews || []).some(r => r.week === wk)) ? 1 : 0;
    })(),
    money: s.items.filter(i => i.type === 'client' && i.retainer && !i.archived &&
      !i.retainerEndedAt && i.nextRenewalAt && i.nextRenewalAt <= now() + 3 * DAY).length
  };
}
