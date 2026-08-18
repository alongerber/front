/* ============================================================
   migrations.js — המרות חד-פעמיות של מבנה הנתונים
   ------------------------------------------------------------
   בלי ייבוא. בכוונה: המיגרציה רצה בתוך טעינת ה-store, לפני
   שהמודולים האחרים קיימים, ומחזור ייבוא כאן הוא קריסה שקטה
   בעליית האפליקציה.

   כל מיגרציה היא פונקציה טהורה על אובייקט מצב: משנה אותו
   במקום, ומחזירה דוח מספרים. המספרים הם האימות היחיד.
   ============================================================ */

const now = () => Date.now();

/* השדות שעוברים מהלקוח להפקה. משוכפל בכוונה מ-production.js:
   הקובץ הזה חייב להישאר בלי ייבוא, כי הוא רץ בתוך טעינת ה-store. */
const WORK_FIELDS = [
  'stageId', 'stageSince', 'checklist', 'manualProgress',
  'dueDate', 'deliveredAt', 'deliveredAsset'
];

/* ============================================================
   הלקוח היה גם ההפקה — והפרדנו
   ------------------------------------------------------------
   רצה פעם אחת, בטעינה. שלושה כללים שמגנים עליה:

   1. עותק מלא נכתב ומאומת לפני שנוגעים בשורה אחת. נכשל —
      לא ממשיכים. ראה snapshot() ב-store.js.
   2. מזהה ההפקה נגזר ממזהה הלקוח ולא אקראי, כך שהמחשב והטלפון
      מייצרים את אותה הפקה ולא שתיים. זה הבאג הכי סביר במיגרציה
      שמסתנכרנת.
   3. שדות העבודה נשארים על הלקוח ופשוט לא נקראים יותר. מכשיר
      שלא עודכן ידחוף לקוחות בצורה הישנה, ומחיקה הייתה הופכת
      את המיזוג לבלגן.
   ============================================================ */

export const productionIdFor = clientId => 'pr_' + clientId;

/**
 * ממירה מצב מגרסה שבה הלקוח היה גם ההפקה.
 * מקבלת אובייקט מצב ומשנה אותו במקום. מחזירה דוח מספרים —
 * הם האימות היחיד שזה עבד.
 */
export function migrateToProductions(s) {
  const report = { clients: 0, productions: 0, entries: 0, samples: 0, waiting: 0, plan: 0, timer: 0 };
  const t = now();
  const map = new Map();                       // clientId → productionId

  const clients = s.items.filter(i => i.type === 'client');

  clients.forEach(c => {
    const pid = productionIdFor(c.id);
    map.set(c.id, pid);
    report.clients++;

    if (s.items.some(i => i.id === pid)) return;   // כבר קיימת

    const p = {
      id: pid,
      type: 'production',
      title: c.title,
      note: '',
      clientId: c.id,
      productLineId: c.productLineId,
      seq: 1,
      tags: [], links: [],
      createdAt: c.createdAt,                       // לא לאפס "מהתחלה עד מסירה"
      updatedAt: t,
      archived: !!c.archived,
      migratedFrom: c.id
    };
    WORK_FIELDS.forEach(f => { if (c[f] !== undefined) p[f] = c[f]; });
    const line = (s.productLines || []).find(l => l.id === c.productLineId) || (s.productLines || [])[0];
    if (!p.stageId && line) p.stageId = (line.stages[0] || {}).id;
    if (!p.stageSince) p.stageSince = c.createdAt;
    if (typeof p.manualProgress !== 'number') p.manualProgress = 0;
    if (!Array.isArray(p.checklist)) p.checklist = [];

    s.items.push(p);
    c.migratedTo = pid;
    c.updatedAt = t;
    report.productions++;
  });

  /* --- מה שהצביע ללקוח מצביע עכשיו להפקה --- */
  const to = id => map.get(id) || id;

  (s.timeEntries || []).forEach(e => {
    if (e.itemId && map.has(e.itemId)) { e.itemId = to(e.itemId); report.entries++; }
  });
  (s.samples || []).forEach(x => {
    if (x.itemId && map.has(x.itemId)) { x.itemId = to(x.itemId); report.samples++; }
  });
  (s.waiting || []).forEach(w => {
    if (w.itemId && map.has(w.itemId)) { w.itemId = to(w.itemId); report.waiting++; }
  });
  if (s.dayPlan && Array.isArray(s.dayPlan.blocks)) {
    s.dayPlan.blocks.forEach(b => {
      if (b.id && map.has(b.id)) { b.id = to(b.id); b.kind = 'production'; report.plan++; }
    });
  }
  [s.timer, s.paused].forEach(x => {
    if (x && x.itemId && map.has(x.itemId)) { x.itemId = to(x.itemId); report.timer++; }
  });

  /* משימות מעקב — מקבלות גם את ההפקה, כדי שהקישור לסרטון יימצא */
  (s.items || []).forEach(i => {
    if (i.type === 'task' && i.clientId && map.has(i.clientId) && !i.productionId)
      i.productionId = to(i.clientId);
  });

  /* --- הכנסה חוזרת צריכה נקודת התחלה --- */
  clients.forEach(c => {
    if (c.retainer && !c.retainerStartedAt) c.retainerStartedAt = c.paidAt || c.createdAt;
  });

  return report;
}

/* ============================================================
   אינווריאנט: לכל לקוח יש הפקה
   ------------------------------------------------------------
   רץ בכל טעינה, לא פעם אחת. הסיבה: מכשיר שלא עודכן דוחף לקוחות
   בצורה הישנה, והם היו נוחתים כאן בלי הפקה — כלומר בלי להופיע
   בצינור ובלי דרך למדוד עליהם זמן.

   נוצר רק ללקוח שמעולם לא הייתה לו הפקה. מי שמחק הפקה בכוונה
   נושא את הסימון migratedTo, וההפקה לא תקום לתחייה.
   ============================================================ */
export function ensureProductions(s) {
  let made = 0;
  const t = now();
  const has = new Set();
  s.items.forEach(i => { if (i.type === 'production' && i.clientId) has.add(i.clientId); });

  s.items.filter(i => i.type === 'client' && !i.migratedTo && !has.has(i.id)).forEach(c => {
    const pid = productionIdFor(c.id);
    if (s.items.some(i => i.id === pid)) return;
    const line = (s.productLines || []).find(l => l.id === c.productLineId) || (s.productLines || [])[0];
    const p = {
      id: pid, type: 'production', title: c.title, note: '',
      clientId: c.id, productLineId: c.productLineId || (line && line.id),
      seq: 1, tags: [], links: [],
      createdAt: c.createdAt || t, updatedAt: t, archived: !!c.archived,
      manualProgress: 0, checklist: []
    };
    WORK_FIELDS.forEach(f => { if (c[f] !== undefined) p[f] = c[f]; });
    if (!p.stageId && line) p.stageId = (line.stages[0] || {}).id;
    if (!p.stageSince) p.stageSince = p.createdAt;
    s.items.push(p);
    c.migratedTo = pid;
    made++;
  });
  return made;
}
