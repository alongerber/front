/* ============================================================
   tagfield.js — שדה תגיות עם השלמה אוטומטית
   ------------------------------------------------------------
   רכיב אחד שמשרת את בנק השוטים, את הידע ואת הפנקס.

   למה זה נבנה ראשון: בנק בלי השלמה מת תוך שבועיים. מקלידים
   "מוסך" ביום ראשון, "מוסכים" ביום שלישי, ו"מוסך " עם רווח
   בסוף ביום חמישי — ואז חיפוש "מוסך" מחזיר שליש מהשוטים,
   ומי שחיפש פעם אחת ולא מצא, לא יחפש שוב.

   שלושה כללים:

   1. תגית קיימת מנצחת. הקלדת "מוסך " וכבר קיימת "מוסך" —
      נשמרת הקיימת, באיות שלה. אין שתי תגיות שנראות אותו דבר.
   2. תמיד אפשר להקליד חדש. רשימה סגורה נגמרת תמיד באותו מקום:
      תגית שהומצאה בשדה "הערות".
   3. מקלדת בלבד מספיקה — חצים, אנטר, פסיק, Backspace. היד לא
      עוזבת את המקלדת כדי לתייג.
   ============================================================ */

import { S } from './store.js';
import { el } from './util.js';

const NIQQUD = /[֑-ׇ]/g;

/** צורת התצוגה: בלי ניקוד, בלי פסיקים, רווח אחד בין מילים */
export const normTag = s => String(s || '')
  .replace(NIQQUD, '')
  .replace(/,/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** מפתח להשוואה. "מוסך", "מוסך " ו-Moshe/moshe הם אותו דבר */
export const tagKey = s => normTag(s).replace(/["'`׳״]/g, '').toLowerCase();

/**
 * כל התגיות החופשיות שקיימות במערכת, עם כמה פעמים כל אחת.
 * types מצמצם לסוגי פריטים מסוימים — אבל ברירת המחדל היא הכל,
 * כי תגית שנכתבה על פריט ידע צריכה להשלים גם על שוט.
 */
export function tagPool({ types = null } = {}) {
  const map = new Map();
  S().items.forEach(i => {
    if (types && !types.includes(i.type)) return;
    (i.tags || []).forEach(t => {
      const k = tagKey(t);
      if (!k) return;
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { name: normTag(t), count: 1 });
    });
  });
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'));
}

/** הצורה המקובלת של תגית — אם היא כבר קיימת, האיות שלה קובע */
export function canonical(name, pool) {
  const k = tagKey(name);
  if (!k) return '';
  const p = pool || tagPool();
  const hit = p.find(t => tagKey(t.name) === k);
  return hit ? hit.name : normTag(name);
}

/** הצעות לשאילתה. התאמה מדויקת, ואז תחילית, ואז הכלה. */
export function suggestTags(query, { pool, exclude = [], limit = 8 } = {}) {
  const p = pool || tagPool();
  const q = tagKey(query);
  const skip = new Set(exclude.map(tagKey));
  const out = [];
  p.forEach(t => {
    const k = tagKey(t.name);
    if (skip.has(k)) return;
    let s = -1;
    if (!q) s = 0;
    else if (k === q) s = 100;
    else if (k.startsWith(q)) s = 60;
    else if (k.includes(q)) s = 30;
    if (s < 0) return;
    // תגית שבשימוש עולה — אבל לא מספיק כדי לעקוף התאמת תחילית
    out.push({ name: t.name, count: t.count, score: s + Math.min(t.count, 15) });
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/* ============================================================
   הרכיב
   ------------------------------------------------------------
   tagField(['מוסך'], {onChange}) → {node, get, set, add, focus}
   ============================================================ */

export function tagField(initial = [], opts = {}) {
  const {
    placeholder = 'תגית, ואנטר',
    types = null,
    allowNew = true,
    limit = 8,
    onChange = null,
    pool: poolFn = null            // מקור חלופי: [{name, count}]
  } = opts;

  const getPool = () => (typeof poolFn === 'function' ? poolFn() : tagPool({ types }));

  let tags = [];
  let open = [];                   // ההצעות המוצגות כרגע
  let hi = -1;                     // מי מסומן בחצים

  const chips = el('div', { class: 'tagf-chips' });
  const inp = el('input', {
    class: 'tagf-in', type: 'text', placeholder,
    autocomplete: 'off', spellcheck: 'false'
  });
  const pop = el('div', { class: 'tagf-pop' });
  const node = el('div', { class: 'tagf' }, chips, pop);
  chips.append(inp);

  /* קריאת התגיות שומרת קודם את מה שהוקלד ועוד לא אושר. מי
     שהקליד "מוסך" ולחץ ישר על "הוסף" מתכוון שהתגית תישמר —
     והלחיצה מגיעה לפני שה-blur הספיק לרוץ. */
  const get = () => { flush(); return tags.slice(); };
  const emit = () => { if (onChange) onChange(tags.slice()); };

  function addTag(raw, quiet) {
    const pool = getPool();
    const name = canonical(raw, pool);
    if (!name) return false;
    if (!allowNew && !pool.some(t => tagKey(t.name) === tagKey(name))) return false;
    if (tags.some(t => tagKey(t) === tagKey(name))) return false;
    tags.push(name);
    if (!quiet) { drawChips(); emit(); }
    return true;
  }

  function removeTag(name) {
    tags = tags.filter(t => tagKey(t) !== tagKey(name));
    drawChips();
    emit();
  }

  function set(list) {
    tags = [];
    (list || []).forEach(t => addTag(t, true));
    drawChips();
  }

  function drawChips() {
    [...chips.querySelectorAll('.tagf-chip')].forEach(n => n.remove());
    tags.forEach(t => chips.insertBefore(el('span', { class: 'tagf-chip' },
      el('span', {}, t),
      el('button', {
        class: 'tagf-x', type: 'button', title: 'הסר את התגית ' + t,
        onclick: () => { removeTag(t); inp.focus(); }
      }, '×')
    ), inp));
  }

  function drawPop() {
    pop.innerHTML = '';
    if (!open.length) { pop.classList.remove('on'); return; }
    pop.classList.add('on');
    open.forEach((s, i) => pop.append(el('div', {
      class: 'tagf-row' + (i === hi ? ' on' : ''),
      /* mousedown ולא click: click מגיע אחרי blur, והשדה כבר
         הספיק לנקות את עצמו */
      onmousedown: e => { e.preventDefault(); commit(s.name); }
    },
      el('span', { class: 'tagf-row-t' }, s.name),
      el('span', { class: 'tagf-row-n' }, s.isNew ? 'חדשה' : String(s.count))
    )));
  }

  function refreshPop() {
    const typed = normTag(inp.value);
    open = suggestTags(inp.value, { pool: getPool(), exclude: tags, limit });
    const exact = open.some(s => tagKey(s.name) === tagKey(typed));
    if (allowNew && typed && !exact) open.unshift({ name: typed, count: 0, isNew: true });
    hi = open.length ? 0 : -1;

    /* הקלדה שהיא תחילית של תגית קיימת אחת ויחידה — זו הכוונה.
       "מוס" ואנטר יבחרו "מוסך", ולא ייצרו תגית שנייה שנראית
       כמוה. כשיש כמה מועמדות, מה שהוקלד מנצח — ואפשר תמיד
       Escape כדי לשמור בדיוק את מה שהוקלד. */
    if (allowNew && !exact && typed.length >= 2) {
      const pre = open.filter(s => !s.isNew && tagKey(s.name).startsWith(tagKey(typed)));
      if (pre.length === 1) hi = open.indexOf(pre[0]);
    }
    drawPop();
  }

  function closePop() { open = []; hi = -1; drawPop(); }

  /** מה תישמר עכשיו: המסומנת בהצעות, ואם אין — מה שהוקלד */
  const pickName = () => (hi >= 0 && open[hi]) ? open[hi].name : inp.value;

  function commit(name) {
    addTag(name != null ? name : inp.value);
    inp.value = '';
    closePop();
    inp.focus();
  }

  /** שומר את מה שבשדה בלי לגעת במיקוד */
  function flush() {
    const v = normTag(inp.value) ? pickName() : '';
    if (!v) return;
    inp.value = '';
    closePop();
    addTag(v);
  }

  /* נפתח בהקלדה, לא במיקוד. מודאל שממקד את השדה הראשון היה
     פותח רשימה שמכסה את מה שמתחתיה עוד לפני שביקשת משהו.
     חץ למטה פותח את הרשימה המלאה כשרוצים לדפדף. */
  inp.addEventListener('input', refreshPop);

  /* יציאה מהשדה שומרת את מה שהוקלד. מי שהקליד "מוסך" ולחץ על
     "שמור" מתכוון שהתגית תישמר, לא שתיעלם. */
  inp.addEventListener('blur', () => setTimeout(flush, 140));

  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open.length) refreshPop();
      else { hi = (hi + 1) % open.length; drawPop(); }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open.length) { hi = (hi - 1 + open.length) % open.length; drawPop(); }
      return;
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      const pick = pickName();
      // שדה ריק — לא חוטפים את המקש מהטופס שמסביב
      if (!normTag(pick)) return;
      e.preventDefault();
      commit(pick);
      return;
    }
    if (e.key === 'Escape' && open.length) { e.stopPropagation(); closePop(); return; }
    if (e.key === 'Backspace' && !inp.value && tags.length) {
      e.preventDefault();
      removeTag(tags[tags.length - 1]);
    }
  });

  chips.addEventListener('click', e => { if (e.target === chips) inp.focus(); });

  set(initial);

  return { node, get, set, add: v => addTag(v), focus: () => inp.focus(), input: inp };
}
