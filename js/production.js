/* ============================================================
   production.js — ההפקה
   ------------------------------------------------------------
   עד עכשיו הלקוח היה גם ההפקה: שלב אחד, תאריך יעד אחד, מסירה
   אחת. זה עבד מצוין כשמכרנו סרטון בודד, ונשבר ברגע שיש חבילה
   של ארבעה סרטונים בחודש — כי אין דרך לומר "השני בעריכה
   בזמן שהשלישי באפיון".

   החלוקה:
     הלקוח  — מי הוא: שם, טלפון, מקור, כסף, ומה סוכם איתו.
     ההפקה  — העבודה: שלב, תאריך יעד, מסירה, והזמן שנמדד.

   גם לסטוץ יש הפקה מפורשת אחת. שני מסלולי קוד — אחד "עם הפקה"
   ואחד "בלי" — הם בדיוק הבלגן שהחלוקה הזאת באה לסלק. וסטוץ
   שהופך למנוי הוא אז הוספת שורה, לא מיגרציה.
   ============================================================ */

import { S, update, uid, getItem, patchItem, addItem, lineOf, checklistFromLine } from './store.js';

const now = () => Date.now();

/* השדות שעברו מהלקוח להפקה. רשימה אחת, כדי שהמיגרציה
   והיצירה של הפקה חדשה לא יתפצלו לשתי אמיתות. */
export const WORK_FIELDS = [
  'stageId', 'stageSince', 'checklist', 'manualProgress',
  'dueDate', 'deliveredAt', 'deliveredAsset'
];

/* ============================================================
   1. שליפה
   ============================================================ */

export const isProduction = i => !!i && i.type === 'production';

export const productionsOf = clientId => S().items
  .filter(i => i.type === 'production' && i.clientId === clientId && !i.archived)
  .sort((a, b) => (a.seq || 0) - (b.seq || 0));

export const clientOf = p => (p && p.clientId) ? getItem(p.clientId) : null;

/** כל ההפקות הפעילות — מה שהצינור ורשימת הדחיפויות מציגים */
export const openProductions = () => S().items
  .filter(i => i.type === 'production' && !i.archived && !i.deliveredAt);

/**
 * השם שמוצג. לקוח עם הפקה אחת נראה בדיוק כמו קודם — "יוסי
 * מספרה" — כי אין מה להוסיף. רק כשיש יותר מאחת מופיע המספר.
 */
export function label(p) {
  if (!p) return '';
  const c = clientOf(p);
  const base = p.title || (c ? c.title : 'הפקה');
  if (!c) return base;
  const sibs = productionsOf(c.id);
  return sibs.length > 1 ? `${base} · סרטון ${p.seq || 1}` : base;
}

/* ============================================================
   2. יצירה
   ============================================================ */

/** ההפקה הבאה של הלקוח. מחזיר את הפריט שנוצר. */
export function addProduction(clientId, extra = {}) {
  const c = getItem(clientId);
  if (!c || c.type !== 'client') return null;

  const line = lineOf(c.productLineId);
  const seq = productionsOf(clientId).reduce((a, p) => Math.max(a, p.seq || 0), 0) + 1;
  const stageId = extra.stageId || line.stages[0].id;

  return addItem(Object.assign({
    type: 'production',
    title: c.title,
    clientId,
    productLineId: line.id,
    seq,
    stageId,
    stageSince: now(),
    checklist: checklistFromLine(line, stageId),
    manualProgress: 0
  }, extra));
}

/** שינוי שם לקוח מתגלגל להפקות שלו, אחרת הצינור מציג שם ישן */
export function renameProductions(clientId, title) {
  update(s => {
    s.items.forEach(i => {
      if (i.type === 'production' && i.clientId === clientId) {
        i.title = title;
        i.updatedAt = now();
      }
    });
  });
}

/* ============================================================
   3. צבירה ללקוח
   ------------------------------------------------------------
   רשומות זמן מצביעות להפקה. אבל טלפון שלא עודכן עדיין דוחף
   רשומות שמצביעות ללקוח — ואם נתעלם מהן, שעות ייעלמו בשקט.
   לכן כל צבירה סופרת גם את אלה. זה זול, וזה מונע את הסוג הגרוע
   של באג: זה שנראה כמו נתון תקין.
   ============================================================ */

/** כל המזהים שזמן של הלקוח הזה עשוי להיות רשום עליהם */
export const timeIdsOf = clientId => [clientId, ...productionsOf(clientId).map(p => p.id)];

/** סוכם פונקציית זמן על הלקוח וכל הפקותיו */
export const sumOverClient = (clientId, fn) =>
  timeIdsOf(clientId).reduce((a, id) => a + (fn(id) || 0), 0);
