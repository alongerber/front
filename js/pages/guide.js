/* ============================================================
   guide.js — המדריך
   ------------------------------------------------------------
   המערכת גדלה, ומערכת שצריך ללמוד היא מערכת שלא משתמשים בה.
   העמוד הזה עונה על שלוש שאלות בלבד:
     1. מה עוד לא הגדרתי — רשימה שמסמנת את עצמה
     2. מה השגרה — מה עושים בבוקר, במהלך היום, ובסוף השבוע
     3. אני תקוע — תשובות לשאלות שבאמת נשאלות
   ============================================================ */

import { S, update } from '../store.js';
import { el, toast, HOUR, DAY } from '../util.js';
import { refresh, go } from '../app.js';
import * as P from '../presence.js';
import * as FW from '../floatwin.js';
import * as AB from '../autobackup.js';
import * as SM from '../sampling.js';

export default { render };

/* ============================================================
   1. רשימת ההתחלה — נבדקת מהמצב האמיתי, לא מסימון ידני
   ============================================================ */

function steps() {
  const s = S();
  const notifOK = 'Notification' in window && Notification.permission === 'granted';
  const clients = s.items.filter(i => i.type === 'client' && !i.archived).length;
  const anyTime = s.timeEntries.length > 0 || s.samples.some(x => x.answeredAt);

  return [
    {
      id: 'client',
      done: clients > 0,
      title: 'להכניס לקוח אחד',
      why: 'בלי לקוח אחד אין על מה למדוד ואין מה לתמחר. אפילו לקוח ישן שכבר נמסר.',
      action: ['לצינור', () => go('#/pipeline')]
    },
    {
      id: 'presence',
      done: !!s.settings.presenceEnabled && P.supported(),
      skip: !P.supported(),
      title: 'לאשר זיהוי נוכחות',
      why: 'זה מה שגורע לבד את הזמן שבו קמת מהמחשב. בלעדיו הטיימר סופר גם את ארוחת הצהריים.',
      action: ['להגדרות', () => go('#/settings')]
    },
    {
      id: 'notify',
      done: notifOK,
      title: 'לאשר התראות',
      why: 'כדי שהשאלה "מה אתה עושה עכשיו?" תגיע אליך גם כשאתה בוגאס ולא בדפדפן.',
      action: ['להגדרות', () => go('#/settings')]
    },
    {
      id: 'float',
      done: !!s.settings.floatUsed,
      skip: !FW.supported(),
      title: 'לפתוח את החלון הצף',
      why: 'חלונית קטנה שצפה מעל כל התוכנות. שם מחליפים פרויקט בלחיצה, בלי לחפש לשונית.',
      action: ['פתח עכשיו', async () => {
        try {
          await FW.open();
          update(st => { st.settings.floatUsed = true; });
          toast('גרור אותו לפינה של המסך', 'ok');
          refresh();
        } catch (e) { toast(e.message, 'err'); }
      }]
    },
    {
      id: 'backup',
      done: !!s.settings.autoBackupDir || !!s.settings.lastBackupAt,
      title: 'לבחור תיקיית גיבוי',
      why: 'הנתונים יושבים רק בדפדפן הזה. זה הדבר היחיד שאין ממנו העתק.',
      action: ['להגדרות', () => go('#/settings')]
    },
    {
      id: 'measure',
      done: anyTime,
      title: 'למדוד משהו אחד',
      why: 'תלחץ על לקוח בחלון הצף ותעבוד עשר דקות. משם המערכת מתחילה לדעת כמה דברים לוקחים.',
      action: null
    }
  ].filter(x => !x.skip);
}

/* ============================================================ */

function render(root) {
  const st = steps();
  const done = st.filter(x => x.done).length;
  const allDone = done === st.length;

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'מדריך'),
    el('div', { class: 'desc' }, 'מאיפה מתחילים, מה השגרה, ומה עושים כשנתקעים'),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-sm',
        onclick: async () => {
          update(s => { s.settings.onboarded = false; });
          const OB = await import('../onboarding.js');
          OB.start();
        }
      }, '↺ הפעל שוב את ההדרכה'))
  ));

  /* --- רשימת ההתחלה --- */
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, allDone ? '✓ הכל מוגדר' : 'מה עוד לא הגדרת'),
    el('span', { class: 'sub' }, `${done} מתוך ${st.length}`)));

  card.append(el('div', { class: 'bar', style: { marginBottom: '13px' } },
    el('i', { style: { width: (done / st.length * 100) + '%', background: allDone ? 'var(--green)' : 'var(--accent)' } })));

  if (allDone) {
    card.append(el('div', { class: 'advice' },
      el('div', { style: { fontWeight: '700' } }, 'סיימת את ההגדרה.'),
      el('div', { class: 'small', style: { marginTop: '4px' } },
        'מכאן זה פשוט: פותחים את החלון הצף בבוקר, מחליפים פרויקט בלחיצה, ובסוף השבוע נכנסים לסקירה.')));
  }

  st.forEach(x => card.append(el('div', {
    class: 'step' + (x.done ? ' done' : ''),
  },
    el('span', { class: 'step-n' }, x.done ? '✓' : '○'),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { fontWeight: '600' } }, x.title),
      el('div', { class: 'small muted', style: { lineHeight: '1.6' } }, x.why)),
    !x.done && x.action
      ? el('button', { class: 'btn btn-xs btn-y', onclick: x.action[1] }, x.action[0])
      : null
  )));
  root.append(card);

  /* --- השגרה --- */
  root.append(section('השגרה', 'מה עושים ומתי'));
  root.append(el('div', { class: 'grid g3' },
    routineCard('☀', 'בבוקר', '30 שניות', [
      ['פותחים את החלון הצף', 'הכפתור 🪟 בפס העליון. גוררים אותו לפינה של המסך ומשאירים שם כל היום.'],
      ['מסתכלים על הבית', 'רשימה אחת ממוינת. מה שלמעלה הוא מה שצריך לעשות עכשיו.'],
      ['לוחצים על הפרויקט הראשון', 'בחלון הצף. מכאן הזמן נמדד לבד.']
    ]),
    routineCard('⚡', 'במהלך היום', 'לחיצה פה ושם', [
      ['מחליפים פרויקט בחלון הצף', 'לחיצה אחת, או מקש 1-9. הקודם נסגר ונרשם לבד.'],
      ['יוצאים להפסקה? ☕', 'לחיצה על הפסקה. הזמן נרשם ולא נספר בתמחור.'],
      ['זורקים דברים לשורה העליונה', 'לינק, מחשבה, משימה. המערכת מסווגת לבד.'],
      ['עונים לשאלה שקופצת', 'כפתור אחד. זו רשת הביטחון של המדידה.']
    ]),
    routineCard('◐', 'בסוף השבוע', '10 דקות', [
      ['נכנסים לסקירה', 'מיום חמישי יש תזכורת. מה נמסר, לאן הלכו השעות, מה תקוע.'],
      ['מנקים מה שלא זז', 'כפתור אחד מעביר לארכיון את מה שלא נגעת בו חודש.'],
      ['כותבים משפט אחד', 'וסוגרים את השבוע.']
    ])
  ));

  /* --- מה כל עמוד עושה --- */
  root.append(section('מה כל עמוד עושה', 'בשורה אחת'));
  root.append(pagesCard());

  /* --- אני תקוע --- */
  root.append(section('אני תקוע', 'השאלות שבאמת נשאלות'));
  root.append(faqCard());
}

/* ---------- רכיבים ---------- */

const section = (title, sub) => el('div', { class: 'section' },
  el('span', { class: 'bar' }), el('h2', {}, title),
  sub ? el('span', { class: 'sub' }, sub) : null, el('span', { class: 'line' }));

function routineCard(icon, title, time, rows) {
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-h' },
    el('h3', {}, icon + ' ' + title),
    el('span', { class: 'sub' }, time)));
  rows.forEach(([t, d], i) => c.append(el('div', { style: { marginBottom: '11px' } },
    el('div', { style: { display: 'flex', gap: '7px', alignItems: 'baseline' } },
      el('span', { class: 'step-n sm' }, String(i + 1)),
      el('span', { style: { fontWeight: '600', fontSize: '13.5px' } }, t)),
    el('div', { class: 'small muted', style: { marginInlineStart: '25px', lineHeight: '1.6' } }, d))));
  return c;
}

const PAGES_INFO = [
  ['◆', 'בית', 'רשימה אחת ממוינת לפי דחיפות. אם אתה לא יודע מה לעשות — תסתכל למעלה.', '#/'],
  ['▤', 'צינור', 'כל הלקוחות לפי שלב. גוררים כרטיס כדי להעביר שלב.', '#/pipeline'],
  ['◷', 'זמן', 'הטיימר, ציר היום, וכמה באמת לקח כל דבר.', '#/time'],
  ['₪', 'כסף', 'המחיר שאתה צריך לגבות, וכמה נשאר בכיס.', '#/money'],
  ['❐', 'ידע', 'מה שרצית ללמוד. המערכת מחזירה אליך את הרלוונטי.', '#/knowledge'],
  ['↻', 'שגרה', 'מה שחוזר — תוכן, קמפיין, ניירת.', '#/routines'],
  ['✓', 'משימות', 'משימות, החלטות פתוחות ורעיונות.', '#/tasks'],
  ['🗒', 'פנקס', 'הזבל היפה: פתקים, רשימות, צילומי מסך, מסמכים.', '#/notes'],
  ['◐', 'סקירה', 'פעם בשבוע — מה קרה ומה לשנות.', '#/review'],
  ['⚙', 'כלים', 'קיצורי דרך למה שכבר בנית.', '#/tools'],
  ['✦', 'עוזר', 'צ\'אט עם קלוד שמכיר את הנתונים שלך.', '#/assistant'],
  ['⚙︎', 'הגדרות', 'גיבוי, הרשאות, מחירים, תחומים.', '#/settings']
];

function pagesCard() {
  const c = el('div', { class: 'card' });
  PAGES_INFO.forEach(([ic, name, desc, href]) => c.append(el('div', {
    style: { display: 'flex', gap: '10px', alignItems: 'baseline', padding: '6px 0', cursor: 'pointer' },
    onclick: () => go(href)
  },
    el('span', { style: { width: '20px', textAlign: 'center', opacity: '.7' } }, ic),
    el('span', { style: { fontWeight: '700', flex: '0 0 62px' } }, name),
    el('span', { class: 'small muted', style: { flex: 1 } }, desc)
  )));
  return c;
}

const FAQ = [
  ['אני לא יודע מה לעשות עכשיו',
    'תיכנס לבית. הפריט הראשון ברשימה הוא מה שהמערכת חושבת שהכי דחוף, ולידו כתוב למה. ' +
    'אם גם זה לא מסתדר לך — תלחץ עליו ותתחיל טיימר, תמיד עדיף להתחיל ממשהו.'],
  ['שכחתי להחליף טיימר וזה רץ על הדבר הלא נכון',
    'עמוד זמן → ציר היום. אפשר לגרור את הקצוות של כל קטע ולתקן. ' +
    'ואם הצטברו הרבה טעויות — כפתור 🧹 סורק 30 יום ומציע תיקונים בלחיצה.'],
  ['המספרים בעמוד כסף נראים מוזרים',
    'תסתכל על השורה מתחת למספר — היא אומרת מאיפה הוא בא. ' +
    '"הערכה שהקלדת" זה ניחוש, "לפי הטיימר" זה בערך, "נמדד מדגימות" זה אמין. ' +
    'בהתחלה הכל ניחושים, וזה בסדר.'],
  ['השאלה "מה אתה עושה עכשיו" מפריעה לי',
    'הגדרות → מדידת זמן → אפשר להוריד את התדירות או לכבות לגמרי. ' +
    'אבל אם כיבית — הטיימר לבד יהיה פחות מדויק, כי אין מי שיתפוס טעויות.'],
  ['איפה שמים דברים שהם לא לקוח ולא משימה?',
    'בפנקס. פתק, רשימה, צילום מסך, חוזה — הכל. ואם זה שעות עבודה שהן לא ללקוח ' +
    '(מודעות, ניירת) — אלה "תחומים", בהגדרות.'],
  ['הכל נעלם / החלפתי מחשב',
    'הגדרות → ייבוא מקובץ, ותבחר את קובץ הגיבוי האחרון. ' +
    'אם עוד לא הגדרת גיבוי אוטומטי — תעשה את זה עכשיו, זה שלושים שניות.'],
  ['טעיתי ומחקתי משהו',
    'Ctrl+Z. המערכת זוכרת 25 פעולות אחורה, ובתחתית התפריט כתוב בדיוק מה יבוטל.'],
  ['אני לא זוכר איפה שמתי משהו',
    'Ctrl+Shift+F. מחפש בכל המערכת בבת אחת — כולל תוכן פתקים ושמות קבצים. ' +
    'אותו חלון גם מבצע פקודות: "התחל דני", "הפסקה", "גבה".']
];

function faqCard() {
  const c = el('div', { class: 'card' });
  FAQ.forEach(([q, a]) => {
    const body = el('div', { class: 'small muted', style: { lineHeight: '1.75', padding: '2px 0 10px 22px', display: 'none' } }, a);
    const head = el('button', {
      class: 'faq-q',
      onclick: () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        head.querySelector('.faq-x').textContent = open ? '+' : '−';
      }
    }, el('span', { class: 'faq-x' }, '+'), el('span', {}, q));
    c.append(head, body);
  });
  return c;
}
