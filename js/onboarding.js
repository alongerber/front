/* ============================================================
   onboarding.js — הפעם הראשונה
   ------------------------------------------------------------
   חמישה מסכים, כל אחד עם פעולה אחת. אפשר לדלג על הכל.
   המטרה היא לא ללמד את המערכת — היא להביא אותו למצב שבו
   המערכת עובדת בשבילו בלי שהוא צריך להבין אותה.
   ============================================================ */

import { S, update } from './store.js';
import { $, el, toast, modal, closeModal, input } from './util.js';
import * as P from './presence.js';
import * as FW from './floatwin.js';
import * as AB from './autobackup.js';
import * as notify from './notify.js';

let idx = 0;
let box = null;

export const needed = () => !S().settings.onboarded;

export function start() {
  idx = 0;
  box = el('div', { class: 'ob' });
  draw();
  modal({
    title: '', body: box, wide: true,
    onClose: () => { update(s => { s.settings.onboarded = true; }); }
  });
}

function finish() {
  update(s => { s.settings.onboarded = true; });
  closeModal();
  toast('אפשר להתחיל. המדריך תמיד זמין בכפתור ? למעלה.', 'ok');
  location.hash = '#/';
}

/* ---------- המסכים ---------- */

function pages() {
  return [
    {
      icon: '👋',
      title: 'זו המערכת שלך',
      lines: [
        'היא נבנתה כדי לפתור שני דברים: שדברים ללמוד לא ייערמו וייעלמו, ושתדע כמה זמן באמת לוקח לך סרטון — כדי לתמחר נכון.',
        'כל השאר נבנה סביב זה.'
      ],
      note: 'ארבעה מסכים, בערך דקה. אפשר לדלג ולחזור מתי שתרצה.'
    },
    {
      icon: '⏱',
      title: 'איך נמדד הזמן',
      lines: [
        'אתה לוחץ פעם אחת על מה שאתה עובד עליו, וזהו. המערכת גורעת לבד את הזמן שבו לא היית ליד המחשב, ומדי פעם שואלת שאלה אחת כדי לוודא שלא טעתה.',
        'אתה לא צריך לזכור כלום ואתה לא צריך למלא כלום.'
      ],
      action: P.supported() ? {
        label: 'אשר זיהוי נוכחות',
        done: () => S().settings.presenceEnabled,
        sub: 'הרשאה חד-פעמית. בלעדיה הטיימר סופר גם את ארוחת הצהריים.',
        run: async () => {
          const r = await P.requestPermission();
          if (r === 'granted') { toast('פעיל', 'ok'); return true; }
          toast('לא אושר — אפשר לחזור לזה בהגדרות', 'err');
          return false;
        }
      } : null,
      note: P.supported() ? null : 'הדפדפן הזה לא תומך בזיהוי נוכחות. בכרום או באדג\' זה עובד.'
    },
    {
      icon: '🪟',
      title: 'החלון הצף',
      lines: [
        'חלונית קטנה שצפה מעל כל התוכנות — גם מעל וגאס במסך מלא. בתוכה כל הפרויקטים שלך, וכמה זמן הלך לכל אחד היום.',
        'עברת מיוסי ליעקב? לחיצה אחת בפינת המסך. או מקש 1-9.'
      ],
      action: FW.supported() ? {
        label: 'פתח עכשיו',
        done: () => S().settings.floatUsed,
        sub: 'גרור אותו לפינה ותשאיר אותו שם.',
        run: async () => {
          try {
            await FW.open();
            update(s => { s.settings.floatUsed = true; });
            return true;
          } catch (e) { toast(e.message, 'err'); return false; }
        }
      } : null,
      note: FW.supported() ? null : 'החלון הצף דורש כרום או אדג\' 116+. אפשר להחליף פרויקט גם מהפס העליון או ב-Ctrl+J.'
    },
    {
      icon: '🔔',
      title: 'שאלה אחת פה ושם',
      lines: [
        'כמה פעמים ביום תקפוץ שאלה: "מה אתה עושה עכשיו?" עם כפתורים. לחיצה אחת, שנייה וחצי.',
        'אם תאשר התראות, היא תגיע אליך גם כשאתה בתוכנה אחרת — עם הכפתורים בתוך ההתראה, כדי שלא תצטרך לעבור לדפדפן.'
      ],
      action: {
        label: 'אשר התראות',
        done: () => 'Notification' in window && Notification.permission === 'granted',
        sub: 'אותה הרשאה משמשת גם לתזכורות מהפנקס ולדדליינים.',
        run: async () => {
          const r = await notify.requestPermission();
          return r === 'granted';
        }
      }
    },
    {
      icon: '💾',
      title: 'הדבר היחיד שאסור לאבד',
      lines: [
        'כל הנתונים יושבים בדפדפן הזה בלבד. אין שרת ואין ענן. ניקוי היסטוריה או החלפת מחשב — והכל נעלם.',
        'בחר תיקייה אחת, רצוי מסונכרנת לדרייב, והמערכת תכתוב לשם גיבוי בכל פתיחה.'
      ],
      action: AB.supported() ? {
        label: 'בחר תיקייה',
        done: () => S().settings.autoBackupDir,
        sub: 'פעם אחת, ואז זה קורה לבד.',
        run: async () => {
          try {
            const name = await AB.chooseFolder();
            update(s => { s.settings.autoBackupDir = true; });
            await AB.backupNow().catch(() => { });
            toast('נכתב גיבוי ל"' + name + '"', 'ok');
            return true;
          } catch (e) {
            if (e && e.name === 'AbortError') return false;
            toast(e.message, 'err');
            return false;
          }
        }
      } : null,
      note: AB.supported() ? null : 'בדפדפן הזה אין גיבוי אוטומטי לתיקייה. תזכור לייצא JSON כל כמה ימים — הגדרות → ייצוא גיבוי.'
    },
    {
      icon: '🚀',
      title: 'זהו, אפשר להתחיל',
      lines: [
        'תתחיל פשוט לעבוד. תכניס לקוח, תלחץ עליו בחלון הצף, תזרוק דברים לשורה העליונה.',
        'תוך שבוע יהיה לך מספר אמיתי לכמה זמן לוקח סרטון, ומשם המחיר נגזר לבד.'
      ],
      action: {
        label: '👋 קח אותי סיבוב במסך',
        done: () => false,
        sub: 'המערכת תדליק אור על כפתור אחד בכל פעם ותסביר. דקה וחצי.',
        run: async () => {
          const T = await import('./tour.js');
          finish();
          setTimeout(() => T.start('start'), 350);
          return true;
        }
      },
      note: 'נתקעת אחר כך? הכפתור ? למעלה פותח את המדריך, ואפשר להריץ את הסיור שוב.',
      last: true
    }
  ];
}

/* ---------- ציור ---------- */

function draw() {
  const list = pages();
  const p = list[idx];
  box.innerHTML = '';

  box.append(el('div', { class: 'ob-dots' },
    ...list.map((_, i) => el('span', { class: 'ob-dot' + (i === idx ? ' on' : i < idx ? ' past' : '') }))));

  box.append(el('div', { class: 'ob-icon' }, p.icon));
  box.append(el('h2', { class: 'ob-title' }, p.title));
  p.lines.forEach(l => box.append(el('p', { class: 'ob-line' }, l)));

  if (p.action) {
    const isDone = p.action.done();
    const btn = el('button', {
      class: 'btn ' + (isDone ? '' : 'btn-y'), style: { marginTop: '4px' },
      disabled: isDone,
      onclick: async () => {
        btn.disabled = true;
        btn.textContent = 'רגע…';
        const ok = await p.action.run();
        if (ok) { draw(); } else { btn.disabled = false; btn.textContent = p.action.label; }
      }
    }, isDone ? '✓ מוגדר' : p.action.label);
    box.append(el('div', { class: 'ob-action' },
      btn,
      el('div', { class: 'small muted', style: { marginTop: '6px' } }, p.action.sub)));
  }

  if (p.note) box.append(el('div', { class: 'ob-note' }, p.note));

  box.append(el('div', { class: 'ob-foot' },
    idx > 0
      ? el('button', { class: 'btn btn-sm', onclick: () => { idx--; draw(); } }, '→ אחורה')
      : el('span', {}),
    el('div', { style: { marginInlineStart: 'auto', display: 'flex', gap: '7px' } },
      !p.last ? el('button', { class: 'btn btn-sm btn-ghost', onclick: finish }, 'דלג על הכל') : null,
      el('button', {
        class: 'btn btn-sm btn-y',
        onclick: () => { if (p.last) finish(); else { idx++; draw(); } }
      }, p.last ? 'בוא נתחיל' : 'הבא ←'))
  ));
}
