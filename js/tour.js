/* ============================================================
   tour.js — סיור מודרך
   ------------------------------------------------------------
   מדריך כתוב הוא מדריך שלא קוראים. כאן המערכת מדליקה זרקור על
   כפתור אחד, מסבירה אותו במשפט, ועוברת לבא.

   כללי הכתיבה של הטקסטים כאן:
     · בלי מונחים. "עבודה על העסק", לא "דלי".
     · משפט אחד שאומר מה זה, ומשפט שני שאומר למה אכפת לך.
     · פנייה ישירה: "תלחץ", "תראה", ולא "ניתן ללחוץ".

   אלמנט שלא קיים במסך מדולג בשקט — סיור שנתקע על כפתור שלא
   נמצא גרוע יותר מסיור קצר.
   ============================================================ */

import { $, el } from './util.js';
import { go } from './app.js';

const SCROLL_PAD = 90;

let box = null, bubble = null, ring = null;
let steps = [], idx = 0, onDone = null, cleanup = [];

/* ============================================================
   הסיורים. sel = מה מדליקים, page = לאיזה עמוד לעבור קודם.
   ============================================================ */

const TOURS = {
  start: {
    name: 'סיור ראשון',
    sub: 'שבעה דברים, דקה וחצי',
    steps: [
      {
        page: '#/', sel: '#timerbar',
        title: 'הפס העליון — מה אתה עושה עכשיו',
        text: 'כל עוד אתה עובד, כאן רשום על מה. המספר הגדול הוא כמה זמן הלך על זה היום — ' +
          'לא כמה זמן עבר מאז שלחצת. עברת ליעקב וחזרת? הוא ממשיך מאיפה שהיה.'
      },
      {
        page: '#/', sel: '[data-tour="float"]',
        title: 'החלון הצף',
        text: 'חלונית קטנה שנשארת מעל כל התוכנות — גם מעל וגאס במסך מלא. ' +
          'בתוכה כל הלקוחות שלך, ומעבר ביניהם הוא לחיצה אחת בפינת המסך במקום לחפש לשונית.'
      },
      {
        page: '#/', sel: '#capture',
        title: 'השורה הזאת בולעת הכל',
        text: 'רעיון, לינק, משימה, "דני שילם" — תזרוק לכאן והמערכת תחליט לבד לאן זה הולך. ' +
          'לא צריך לבחור סוג ולא למלא טופס. Ctrl+K קופץ לכאן מכל מקום.'
      },
      {
        page: '#/', sel: '#view .card',
        title: 'מה לעשות עכשיו',
        text: 'רשימה אחת, ממוינת לפי מה שדוחף. אם אתה פותח את המערכת ולא יודע במה להתחיל — ' +
          'תעשה את מה שלמעלה. זה כל התפקיד של המסך הזה.'
      },
      {
        page: '#/pipeline', sel: '#view .card, #view .col',
        title: 'כל הלקוחות, לפי שלב',
        text: 'מי בשיחת מכירה, מי בהפקה, מי מחכה לתשלום. גוררים כרטיס כדי להעביר שלב, ' +
          'והמערכת מתריעה כשמישהו יושב יותר מדי זמן במקום אחד.'
      },
      {
        page: '#/time', sel: '#view .card',
        title: 'כמה זמן באמת לקח',
        text: 'הטבלה כאן אומרת כמה שעות הלכו על כל לקוח, וכמה שקלים לשעה יצא לך ממנו. ' +
          'זה המספר שאי אפשר לנחש ואי אפשר לשחזר בדיעבד — ובלעדיו אין תמחור נכון.'
      },
      {
        page: '#/money', sel: '#view .card',
        title: 'כמה אתה צריך לגבות',
        text: 'ההוצאות הקבועות שלך חלקי כמה סרטונים אתה מספיק, ועוד השעות שלך. ' +
          'המספר הזה עובד גם לפני שיש לקוח אחד — הוא אומר לך מאיזה מחיר אתה מפסיד.'
      },
      {
        page: '#/', sel: '#guide-open',
        title: 'וזהו',
        text: 'הכפתור הזה תמיד כאן. בפנים: מה עוד לא הגדרת, מה השגרה של הבוקר, ' +
          'ותשובות לשאלות שנתקעים בהן. אפשר גם להריץ את הסיור הזה שוב.'
      }
    ]
  },

  time: {
    name: 'איך נמדד הזמן',
    sub: 'ארבעה דברים',
    steps: [
      {
        page: '#/time', sel: '#timerbar',
        title: 'לחיצה אחת, וזהו',
        text: 'אתה לוחץ על מה שאתה עובד עליו. מכאן המערכת סופרת לבד, ' +
          'ומורידה את הזמן שבו קמת מהמחשב בלי שתעשה כלום.'
      },
      {
        page: '#/time', sel: '[data-tour="pause"], [data-tour="float"]',
        title: 'השהיה זוכרת, עצירה שוכחת',
        text: '"עצור" סוגר והולך. "השהה" רושם את הזמן וזוכר על מה עבדת, ' +
          'אז חזרה היא לחיצה אחת ולא חיפוש מחדש ברשימה.'
      },
      {
        page: '#/time', sel: '#view .card:nth-of-type(2)',
        title: 'ציר היום',
        text: 'כל היום שלך כפס אחד. אם שכחת להחליף טיימר — תגרור את הקצה של הקטע ותתקן. ' +
          'לא צריך לזכור בזמן אמת; אפשר לסדר אחר כך.'
      },
      {
        page: '#/settings', sel: '#view .card',
        title: 'השאלה שקופצת',
        text: 'כמה פעמים ביום המערכת שואלת "מה אתה עושה עכשיו?" עם כפתורים. ' +
          'זו רשת ביטחון: היא תופסת את הפעמים שהטיימר רץ על דני ואתה בעצם על משה.'
      }
    ]
  }
};

export const list = () => Object.entries(TOURS).map(([id, t]) => ({ id, name: t.name, sub: t.sub }));

/* ============================================================ */

export function start(id = 'start', done = null) {
  const t = TOURS[id];
  if (!t) return;
  stop();
  steps = t.steps.slice();
  idx = 0;
  onDone = done;

  box = el('div', { class: 'tour-back' });
  ring = el('div', { class: 'tour-ring' });
  bubble = el('div', { class: 'tour-bubble' });
  document.body.append(box, ring, bubble);
  document.body.classList.add('tour-on');

  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); stop(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); next(); }   // בעברית שמאלה = קדימה
    if (e.key === 'ArrowRight') { e.preventDefault(); prev(); }
  };
  document.addEventListener('keydown', key);
  cleanup.push(() => document.removeEventListener('keydown', key));

  const onResize = () => place();
  addEventListener('resize', onResize);
  addEventListener('scroll', onResize, true);
  const follow = setInterval(place, 400);     // המסך חי מתחת לזרקור
  cleanup.push(() => {
    removeEventListener('resize', onResize);
    removeEventListener('scroll', onResize, true);
    clearInterval(follow);
  });

  show();
}

export function stop() {
  cleanup.forEach(f => { try { f(); } catch (e) { } });
  cleanup = [];
  [box, ring, bubble].forEach(n => n && n.remove());
  box = ring = bubble = null;
  document.body.classList.remove('tour-on');
  const f = onDone; onDone = null;
  if (f) f();
}

const next = () => { if (idx < steps.length - 1) { idx++; show(); } else stop(); };
const prev = () => { if (idx > 0) { idx--; show(); } };

/* ---------- ציור צעד ---------- */

let sel = null;

/* מחפשים מחדש בכל מיקום ולא שומרים הפניה לאלמנט:
   סרגל הטיימר נבנה מחדש בכל שנייה, וההפניה השמורה הפכה לצומת
   מנותק — הזרקור התכווץ ל-0 ונראה כמו באג עיצובי. */
const find = () => (sel ? document.querySelector(sel) : null);

async function show() {
  const s = steps[idx];
  if (!s) return stop();

  if (s.page && location.hash.replace(/\?.*$/, '') !== s.page.replace('#', '#')) {
    go(s.page);
    await new Promise(r => setTimeout(r, 260));
  }

  sel = s.sel || null;
  const target = find();
  // אלמנט שלא קיים כאן — מדלגים בשקט במקום להצביע על כלום
  if (s.sel && !target) {
    if (idx < steps.length - 1) { idx++; return show(); }
    return stop();
  }

  if (target) {
    const r = target.getBoundingClientRect();
    if (r.top < SCROLL_PAD || r.bottom > innerHeight - 120) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await new Promise(r2 => setTimeout(r2, 320));
    }
  }

  drawBubble(s);
  place();
}

function drawBubble(s) {
  bubble.innerHTML = '';
  bubble.append(
    el('div', { class: 'tour-count' }, `${idx + 1} מתוך ${steps.length}`),
    el('h3', { class: 'tour-title' }, s.title),
    el('p', { class: 'tour-text' }, s.text),
    el('div', { class: 'tour-dots' },
      ...steps.map((_, i) => el('span', { class: 'tour-dot' + (i === idx ? ' on' : i < idx ? ' past' : '') }))),
    el('div', { class: 'tour-foot' },
      el('button', { class: 'btn btn-sm btn-ghost', onclick: stop }, 'לא עכשיו'),
      el('div', { style: { marginInlineStart: 'auto', display: 'flex', gap: '7px' } },
        idx > 0 ? el('button', { class: 'btn btn-sm', onclick: prev }, 'אחורה') : null,
        el('button', { class: 'btn btn-sm btn-y', onclick: next },
          idx === steps.length - 1 ? 'סיימתי' : 'הבא')))
  );
  bubble.classList.remove('in');
  requestAnimationFrame(() => bubble.classList.add('in'));
}

/** מציב את הזרקור והבועה. הבועה נצמדת לצד שיש בו מקום. */
function place() {
  if (!bubble) return;
  const target = find();

  if (!target) {
    ring.style.opacity = '0';
    bubble.className = 'tour-bubble in center';
    bubble.style.cssText = '';
    return;
  }

  const r = target.getBoundingClientRect();
  const pad = 8;
  ring.style.opacity = '1';
  ring.style.top = (r.top - pad) + 'px';
  ring.style.left = (r.left - pad) + 'px';
  ring.style.width = (r.width + pad * 2) + 'px';
  ring.style.height = (r.height + pad * 2) + 'px';

  bubble.className = 'tour-bubble in';
  const bw = Math.min(360, innerWidth - 24);
  bubble.style.width = bw + 'px';

  const below = innerHeight - r.bottom;
  const bh = bubble.offsetHeight || 210;

  if (innerWidth < 640) {
    // בטלפון: יריעה בתחתית, תמיד באותו מקום
    bubble.style.left = '12px';
    bubble.style.width = (innerWidth - 24) + 'px';
    bubble.style.top = '';
    bubble.style.bottom = 'calc(12px + env(safe-area-inset-bottom))';
    // אם הזרקור מוסתר על ידה — נדחוף אותו למעלה
    if (r.bottom > innerHeight - bh - 24) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }

  bubble.style.bottom = '';
  const top = below > bh + 20 ? r.bottom + 14 : Math.max(12, r.top - bh - 14);
  bubble.style.top = top + 'px';

  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(12, Math.min(left, innerWidth - bw - 12));
  bubble.style.left = left + 'px';
}
