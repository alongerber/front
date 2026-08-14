/* ============================================================
   help.js — הסברים קצרים בכל מקום
   מילון אחד של ניסוחים בעברית פשוטה + מנוע טולטיפ.
   כל טקסט הסבר במערכת עובר דרך כאן, כדי שהניסוח יהיה עקבי.
   ============================================================ */

/* ---------- המילון ---------- */

export const HELP = {
  /* --- ניווט --- */
  'nav.': 'תמונת מצב. מה דחוף עכשיו, כמה עבדת היום, ומה קורה עם הכסף החודש.',
  'nav.pipeline': 'כל הלקוחות לפי שלב. רואים מי ממתין למענה ומי תקוע.',
  'nav.time': 'הטיימר, ציר היום, ודוחות כמה באמת לקח כל דבר.',
  'nav.money': 'מנויים, עלות אמיתית לסרטון, וסימולטור שמראה מה קורה אם תשנה מחיר או כמות.',
  'nav.knowledge': 'כל מה שרצית ללמוד. המערכת מחזירה אליך את הרלוונטי ביותר.',
  'nav.routines': 'משימות שחוזרות: תוכן, בדיקת קמפיין, ניירת לרואה חשבון.',
  'nav.tasks': 'משימות, החלטות פתוחות ורעיונות.',
  'nav.tools': 'קישורים מהירים לכל מה שכבר בנית.',
  'nav.assistant': 'צ\'אט עם קלוד שמכיר את כל הנתונים שלך.',
  'nav.settings': 'גיבוי, התראות, מחירים ושלבים.',

  /* --- זמן: שלושת המספרים --- */
  'time.wall': 'זמן קיר — כמה זמן עבר מהרגע שפתחת את הפרויקט. כולל לילות, סופי שבוע, והמתנה לקלוד. אומר ללקוח כמה זמן זה לוקח, לא כמה עבדת.',
  'time.focus': 'זמן קשב — כמה דקות באמת ישבת על זה. רק זה נחשב לתמחור. אם קלוד רץ ואתה בטאב אחר, זה לא נספר.',
  'time.available': 'זמן זמין — כמה שעות עבודה יש לך ביום. משנים את זה בהגדרות.',
  'time.wait': 'המתנה — נתת משימה לקלוד ועברת לדבר אחר. הזמן ממשיך לרוץ על הפרויקט, אבל לא נחשב כעבודה שלך.',
  'time.switch': 'לחיצה אחת מעבירה את הטיימר לפריט אחר. הקודם נעצר ונרשם לבד, אין צורך לעצור ידנית.',
  'time.waitBtn': 'עוצר את הטיימר אבל משאיר את הפריט פתוח. לחץ כשאתה מעביר משימה לקלוד ועובר לדבר אחר.',
  'time.timeline': 'כל מה שנרשם היום. אפשר לגרור את הקצוות של כל קטע כדי לתקן שעות, וללחוץ על פער כדי למלא אותו.',
  'time.gap': 'פרק זמן שלא נרשם עליו כלום. לחיצה פותחת חלון למלא מה עשית בו.',

  /* --- כסף --- */
  'money.cashPerVideo': 'כמה כסף באמת נשאר בכיס מסרטון אחד: המחיר פחות המנויים והפרסום. בלי לתמחר את הזמן שלך.',
  'money.vsRate': 'האם המחיר מכסה את התעריף שקבעת לעצמך. מספר שלילי לא אומר שהפסדת כסף — הוא אומר שהשעה שלך יוצאת פחות מהיעד.',
  'money.realHourly': 'כמה השעה שלך שווה בפועל: מה שנשאר בכיס חלקי השעות שהשקעת.',
  'money.hourlyTarget': 'כמה אתה רוצה שהשעה שלך תהיה שווה. משמש רק כדי לבדוק אם המחיר מספיק — לא יוצא לך מהכיס.',
  'money.subsPerVideo': 'סך המנויים החודשיים חלקי מספר הסרטונים בחודש. ככל שתעשה יותר סרטונים, המנוי מתחלק על יותר ראשים ויורד לסרטון.',
  'money.leadCost': 'כמה עולה לך להביא לקוח אחד, כולל פרסום. אם הוצאת 900 ₪ על מודעות והגיעו 5 לקוחות — זה 180 ₪ לליד.',
  'money.timeCost': 'השעות שהשקעת כפול התעריף שקבעת. זה לא כסף שיוצא — זו הדרך לבדוק אם המחיר הוגן כלפיך.',
  'money.monthlyNet': 'הכנסות החודש פחות ההוצאות. זה המספר שנשאר לך בסוף החודש.',
  'money.simulator': 'הזז סליידר וראה מיד מה קורה. שום דבר לא נשמר עד שתלחץ "שמור כברירת מחדל".',
  'money.subs': 'כל מה שאתה משלם עליו כל חודש. סכום שמתעדכן לבד לפי שער הדולר.',
  'money.ledger': 'תשלומים מלקוחות נרשמים לבד כשאתה מעביר אותם לשלב "תשלום". כאן מוסיפים ידנית הוצאות כמו קמפיין או רישיון.',

  /* --- צינור --- */
  'pipe.stage': 'איפה הלקוח עומד עכשיו. גוררים כרטיס בין עמודות כדי להעביר שלב.',
  'pipe.stuck': 'מסומן באדום כשהלקוח יושב בשלב הזה יותר מדי זמן. הסף לכל שלב נקבע בעורך השלבים.',
  'pipe.next': 'מעביר לשלב הבא. "תשלום" מסמן שקיבלת כסף, "מסירה" סוגר את הלקוח.',
  'pipe.editor': 'כאן מוסיפים קו מוצר חדש (למשל הסוכנת הקולית) עם שלבים ומחירים משלו.',
  'pipe.priority': 'כמה השלב הזה צועק. 10 = ליד, מטפלים בו לפני הכל. 4 = פרסום, יכול לחכות.',
  'pipe.sla': 'אחרי כמה דקות בשלב הזה נחשב שהלקוח תקוע. 120 = שעתיים.',
  'pipe.value': 'הסכום של כל הלקוחות שעוד לא נמסרו. כסף שכבר מובטח אבל עוד לא נכנס.',

  /* --- ידע --- */
  'know.score': 'ציון רלוונטיות. מחושב לבד מארבעה דברים: כמה זמן הפריט יושב בלי מגע, האם הוא קשור למה שאתה עובד עליו עכשיו, כמה זמן פנוי נשאר לך היום, והאם סימנת אותו כדחוף.',
  'know.related': 'קושר את הפריט ללקוח או משימה. כשתעבוד עליהם, הפריט הזה יקפוץ לראש הרשימה.',
  'know.est': 'כמה דקות זה ייקח. המערכת מציעה פריטים שנכנסים בזמן שנשאר לך.',
  'know.archive': 'מסתיר מהרשימה בלי למחוק. אפשר להחזיר בכל רגע מלשונית ארכיון.',

  /* --- שגרה --- */
  'routine.freq': 'כל כמה זמן זה חוזר. אחרי שתסמן בוצע, המערכת תזכיר לך שוב בעוד תקופה.',
  'routine.miss': 'פוספסה פעמיים? המערכת מפסיקה לצעוק ומעבירה אותה לרשימה שקטה. לא נערם לך לחץ.',

  /* --- בית --- */
  'home.queue': 'רשימה אחת ממוינת לפי דחיפות. ליד חדש תמיד מנצח סרטון בעבודה, כי ליד שלא עונים לו הולך לאיבוד.',
  'home.mode': 'רשימה = רק סדר עדיפויות. יום מוצע = המערכת מציעה שעות לכל דבר, ואפשר לגרור לשנות.',
  'home.today': 'כמה זמן קשב נרשם היום, ועל מה. לא כולל המתנה.',
  'home.month': 'הכנסות מלקוחות ששילמו החודש, מול מנויים והוצאות.',
  'home.learn': 'פריט אחד שהמערכת בחרה, עם משפט שמסביר למה דווקא הוא.',

  /* --- כללי --- */
  'gen.capture': 'הדבק כאן כל דבר — משימה, לינק, מחשבה. המערכת מסווגת לבד ומראה לך מה יצא. אם טעתה, יש כפתור לשנות סוג.',
  'gen.export': 'מוריד קובץ עם כל הנתונים. זה הגיבוי היחיד שיש — הנתונים יושבים רק בדפדפן הזה.',
  'gen.archiveItem': 'מסתיר בלי למחוק.',
  'gen.progress': 'שני מדדים: הצ\'קליסט מחשב לבד לפי מה שסימנת, והסליידר הוא הרגשה שלך. הגבוה מביניהם קובע.'
};

/* ---------- מנוע הטולטיפ ---------- */

let tipEl = null;
let hideTimer = null;

function ensure() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'tip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.append(tipEl);
  return tipEl;
}

function place(target) {
  const t = ensure();
  const r = target.getBoundingClientRect();
  t.style.visibility = 'hidden';
  t.classList.add('show');
  const tr = t.getBoundingClientRect();

  // מתחת לאלמנט, ואם אין מקום — מעליו
  let top = r.bottom + 8;
  if (top + tr.height > window.innerHeight - 8) top = Math.max(8, r.top - tr.height - 8);

  // מיושר לימין האלמנט (RTL), עם קלמפ לגבולות המסך
  let right = window.innerWidth - r.right;
  right = Math.min(Math.max(8, right), window.innerWidth - tr.width - 8);

  t.style.top = top + 'px';
  t.style.right = right + 'px';
  t.style.left = 'auto';
  t.style.visibility = 'visible';
}

function show(target, text) {
  clearTimeout(hideTimer);
  const t = ensure();
  t.textContent = text;
  place(target);
}

function hide() {
  if (!tipEl) return;
  hideTimer = setTimeout(() => tipEl.classList.remove('show'), 60);
}

/** מפעיל את הטולטיפים. נקרא פעם אחת מ-app.js */
export function initHelp() {
  const resolve = el => {
    const raw = el.getAttribute('data-tip');
    if (!raw) return '';
    return HELP[raw] || raw;      // מפתח מהמילון, או טקסט חופשי
  };

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    const text = resolve(el);
    if (text) show(el, text);
  });

  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-tip]')) hide();
  });

  document.addEventListener('focusin', e => {
    const el = e.target.closest('[data-tip]');
    if (el) { const text = resolve(el); if (text) show(el, text); }
  });
  document.addEventListener('focusout', hide);

  // מגע: לחיצה על סימן השאלה מציגה, לחיצה נוספת במקום אחר מסתירה
  document.addEventListener('click', e => {
    const badge = e.target.closest('.hint-badge');
    if (badge) {
      e.preventDefault();
      e.stopPropagation();
      const host = badge.closest('[data-tip]') || badge;
      const text = resolve(host);
      if (text) { show(host, text); clearTimeout(hideTimer); hideTimer = setTimeout(hide, 6000); }
      return;
    }
    hide();
  });

  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}

/* ---------- עזרים לבנייה ---------- */

/** מוסיף הסבר לאלמנט קיים ומחזיר אותו */
export function withTip(el, key) {
  if (el && key) el.setAttribute('data-tip', key);
  return el;
}

/** סימן שאלה קטן וניתן ללחיצה, לצד תווית */
export function hintBadge(key) {
  const s = document.createElement('span');
  s.className = 'hint-badge';
  s.setAttribute('data-tip', key);
  s.setAttribute('tabindex', '0');
  s.setAttribute('aria-label', 'הסבר');
  s.textContent = '?';
  return s;
}

/** תווית + סימן שאלה, לשימוש בכותרות של כרטיסים ומספרים */
export function labelWithHint(text, key, cls = '') {
  const w = document.createElement('span');
  w.className = 'lbl-hint ' + cls;
  w.append(document.createTextNode(text), hintBadge(key));
  return w;
}
