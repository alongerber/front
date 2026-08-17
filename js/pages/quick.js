/* ============================================================
   quick.js — קליטה מהירה
   ------------------------------------------------------------
   הרגע שזה נבנה בשבילו: אתה מקשיב לפודקאסט, יש רעיון, ואתה
   בטלפון עם יד אחת. עד היום זה הלך ל-Keep או לוואטסאפ לעצמך
   ומשם לא חזר.

   שלושה כללים:
     1. מסך אחד. אין ניווט, אין כרטיסים, אין החלטות.
     2. הכפתורים למטה, בטווח אגודל.
     3. אחרי שמירה נשארים כאן. מחשבה אחת מביאה את הבאה.

   הטקסט לא הולך לאיבוד גם אם הדפדפן נסגר באמצע —
   הוא נשמר בכל הקלדה כטיוטה.
   ============================================================ */

import { S, update, getItem } from '../store.js';
import { el, toast, ago } from '../util.js';
import { classify, commit, retype } from '../capture.js';
import { refresh, openItem, go } from '../app.js';
import * as V from '../voice.js';

export default { render };

const DRAFT = 'front.quickDraft';

/* מה שהמסך הזה יודע לייצר. סדר לפי מה שבאמת נזרק לכאן. */
const TYPES = [
  { id: 'knowledge', icon: '📚', name: 'ללמוד' },
  { id: 'idea', icon: '💡', name: 'רעיון' },
  { id: 'task', icon: '✓', name: 'משימה' },
  { id: 'note', icon: '🗒', name: 'פתק' }
];

/* ---------- פרמטרים מבחוץ ---------- */

/** שיתוף ממערכת ההפעלה מגיע כ-?text=&url=&title= */
export function sharedText(params) {
  const bits = [params.title, params.text, params.url].filter(Boolean);
  // אנדרואיד לפעמים דוחף את הקישור גם ל-text וגם ל-url
  return bits.filter((b, i) => bits.indexOf(b) === i).join(' ').trim();
}

/* ============================================================ */

function render(root, params = {}) {
  const box = el('div', { class: 'qk' });

  const shared = sharedText(params);
  const draft = shared || localStorage.getItem(DRAFT) || '';

  /* --- שדה הכתיבה --- */
  const field = el('textarea', {
    class: 'qk-field', rows: '5', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'מה עלה לך עכשיו?'
  });
  field.value = draft;

  const guess = el('div', { class: 'qk-guess' });
  let override = null;                 // סוג שנבחר ידנית גובר על הניחוש

  const paint = () => {
    localStorage.setItem(DRAFT, field.value);
    const txt = field.value.trim();
    guess.innerHTML = '';
    if (!txt) { guess.append(el('span', { class: 'muted' }, 'אפשר גם להכתיב — הכפתור הגדול למטה')); return; }
    const r = classify(txt);
    const label = override
      ? (TYPES.find(t => t.id === override)?.name || override)
      : (r ? r.label : 'יישמר');
    guess.append(el('span', { class: 'qk-guess-t' }, '→ ' + label));
  };
  field.addEventListener('input', paint);

  /* --- שמירה --- */
  const recent = el('div', { class: 'qk-recent' });

  const save = () => {
    const txt = field.value.trim();
    if (!txt) { field.focus(); return; }
    if (V.listening()) V.stop();

    const r = classify(txt);
    let item = commit(r);
    if (item && override && item.type !== override && override !== 'note') {
      retype(item, override);
      item = getItem(item.id);
    }
    field.value = '';
    override = null;
    localStorage.removeItem(DRAFT);
    paint();
    drawTypes();
    drawRecent();
    toast('✓ נשמר', 'ok');
    // רטט קצר — אישור שמרגישים בכיס, בלי להסתכל על המסך
    try { navigator.vibrate && navigator.vibrate(30); } catch { /* לא בכל דפדפן */ }
    field.focus();
  };

  /* --- בחירת סוג ידנית --- */
  const typeRow = el('div', { class: 'qk-types' });
  const drawTypes = () => {
    typeRow.innerHTML = '';
    TYPES.forEach(t => typeRow.append(el('button', {
      class: 'qk-type' + (override === t.id ? ' on' : ''),
      onclick: () => { override = override === t.id ? null : t.id; drawTypes(); paint(); field.focus(); }
    }, t.icon + ' ' + t.name)));
  };
  drawTypes();

  /* --- מיקרופון --- */
  const micLabel = el('span', {}, '🎙 הכתב');
  const mic = el('button', { class: 'qk-mic', onclick: () => toggleMic() }, micLabel);

  let auto = false;
  const toggleMic = () => {
    if (V.listening()) { V.stop(); return; }
    V.dictate(field, {
      onState: (st, msg) => {
        mic.classList.toggle('on', st === 'start');
        micLabel.textContent = st === 'start' ? '● מקשיב — לחץ לעצור' : '🎙 הכתב';
        if (st === 'error') toast(msg, 'err');
        // הפעלה אוטומטית מקיצור הדרך נחסמת לפעמים עד שיש נגיעה במסך
        if (st === 'error' && auto) { auto = false; micLabel.textContent = '🎙 לחץ להכתבה'; }
        paint();
      }
    });
  };

  /* --- הרכבה --- */
  box.append(el('div', { class: 'qk-h' },
    el('h1', {}, 'רעיון מהיר'),
    el('button', { class: 'btn btn-xs btn-ghost', onclick: () => go('#/') }, 'למערכת ←')));

  box.append(field, guess, typeRow);

  const foot = el('div', { class: 'qk-foot' });
  if (V.supported()) foot.append(mic);
  foot.append(el('button', { class: 'qk-save', onclick: save }, 'שמור'));
  box.append(foot);

  if (!V.supported()) box.append(el('div', { class: 'qk-note' },
    'הדפדפן הזה לא תומך בהכתבה. באייפון — כפתור המיקרופון של המקלדת עושה את אותו דבר.'));

  /* --- מה שנקלט לאחרונה. בלי זה אין דרך לדעת שזה באמת נשמר --- */
  function drawRecent() {
    recent.innerHTML = '';
    const list = S().items
      .filter(i => !i.archived && Date.now() - (i.createdAt || 0) < 3 * 24 * 3600e3)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5);
    if (!list.length) return;
    recent.append(el('div', { class: 'qk-recent-h' }, 'נקלט לאחרונה'));
    list.forEach(i => recent.append(el('button', {
      class: 'qk-item', onclick: () => openItem(i.id)
    },
      el('span', { class: 'qk-item-t' }, i.title),
      el('span', { class: 'qk-item-w' }, ago(i.createdAt))
    )));
  }
  drawRecent();
  box.append(recent);

  root.append(box);

  paint();
  // ?mic=1 מגיע מקיצור הדרך של מסך הבית — שתי נגיעות מהנעילה עד להקלטה
  setTimeout(() => {
    field.focus();
    if (params.mic === '1' && V.supported() && !V.listening()) { auto = true; toggleMic(); }
  }, 60);

  // Ctrl+Enter או Enter כפול שומרים בלי להרים את היד לכפתור
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  });
}
