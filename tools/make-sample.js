#!/usr/bin/env node
/* מייצר את sample-data.json — נתוני דוגמה, 3-4 פריטים מכל סוג.
   הזמנים נשמרים יחסית ל-sampleBaseTime, והמערכת מזיזה אותם ל"עכשיו" בטעינה. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = Date.parse('2026-01-15T10:00:00+02:00');
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const t = (d = 0, h = 0, m = 0) => BASE - d * DAY - h * HOUR - m * MIN;

let n = 0;
const id = p => `${p}_sample${++n}`;

const stage = (name, priority, sla) => ({ id: 'st_' + name.replace(/\s/g, ''), name, priority, sla });

const stages = [
  stage('פרסום', 4, 4320),
  stage('ליד', 10, 120),
  stage('שיחת מכירה', 9, 1440),
  stage('תשלום', 8, 2880),
  stage('אפיון', 7, 1440),
  stage('יצירה', 6, 4320),
  stage('סבב תיקונים', 7, 1440),
  stage('אישור', 8, 1440),
  stage('מסירה', 9, 240)
];
const S = nm => stages.find(x => x.name === nm).id;

const voiceStages = [
  { id: 'vst_lead', name: 'ליד', priority: 10, sla: 120 },
  { id: 'vst_demo', name: 'דמו', priority: 9, sla: 1440 },
  { id: 'vst_pay', name: 'תשלום', priority: 8, sla: 2880 },
  { id: 'vst_build', name: 'הקמת סוכנת', priority: 6, sla: 4320 },
  { id: 'vst_live', name: 'עלייה לאוויר', priority: 9, sla: 240 }
];

const base = i => ({ tags: [], createdAt: t(i), updatedAt: t(i), archived: false, note: '' });

/* ---------- לקוחות ---------- */
const clients = [
  {
    id: id('c'), type: 'client', title: 'דני', business: 'מוסך דני חיפה',
    productLineId: 'pl_video', stageId: S('יצירה'), stageSince: t(2),
    amount: 1290, mediaCost: 60, phone: '0521234567',
    dueDate: t(-3), paidAt: t(4), deliveredAt: null,
    manualProgress: 60, checklist: [
      { id: id('ck'), text: 'אפיון', done: true },
      { id: id('ck'), text: 'יצירה', done: false },
      { id: id('ck'), text: 'סבב תיקונים', done: false },
      { id: id('ck'), text: 'אישור', done: false },
      { id: id('ck'), text: 'מסירה', done: false }
    ],
    source: 'ad',
    ...base(6), note: 'רוצה דגש על טסט טורים ועל זה שלא צריך תור.'
  },
  {
    id: id('c'), type: 'client', title: 'שירלי', business: 'סטודיו לציפורניים',
    productLineId: 'pl_video', stageId: S('ליד'), stageSince: t(0, 3, 20),
    amount: 1290, mediaCost: 0, phone: '0549876543',
    dueDate: null, paidAt: null, deliveredAt: null,
    manualProgress: 0, checklist: [],
    source: 'ad',
    ...base(0), note: 'הגיעה מהמודעה. לא חזרתי אליה עדיין.'
  },
  {
    id: id('c'), type: 'client', title: 'משה', business: 'פיצה מרקש',
    productLineId: 'pl_video', stageId: S('תשלום'), stageSince: t(1, 4),
    amount: 4200, mediaCost: 120, phone: '0501112233',
    dueDate: t(-9), paidAt: null, deliveredAt: null,
    manualProgress: 10, checklist: [
      { id: id('ck'), text: 'תשלום', done: false },
      { id: id('ck'), text: 'אפיון', done: false },
      { id: id('ck'), text: 'יצירה', done: false }
    ],
    source: 'referral', retainer: true, monthlyAmount: 4200, nextRenewalAt: t(-2),
    ...base(3), note: 'חבילה של ארבעה סרטונים לחודש. סיכמנו, מחכה להעברה.'
  },
  {
    id: id('c'), type: 'client', title: 'רונית', business: 'קליניקה לפיזיותרפיה',
    productLineId: 'pl_video', stageId: S('מסירה'), stageSince: t(9),
    amount: 1290, mediaCost: 45, phone: '0533334444',
    dueDate: t(10), paidAt: t(16), deliveredAt: t(9),
    manualProgress: 100, checklist: [
      { id: id('ck'), text: 'אפיון', done: true },
      { id: id('ck'), text: 'יצירה', done: true },
      { id: id('ck'), text: 'סבב תיקונים', done: true },
      { id: id('ck'), text: 'אישור', done: true },
      { id: id('ck'), text: 'מסירה', done: true }
    ],
    source: 'organic',
    ...base(20), note: 'עברה חלק. ביקשה הצעת מחיר לעוד שניים.'
  },
  {
    id: id('c'), type: 'client', title: 'עמית', business: 'מכון כושר בקריות',
    productLineId: 'pl_voice', stageId: 'vst_demo', stageSince: t(1, 6),
    amount: 900, mediaCost: 0, phone: '0526667777',
    dueDate: null, paidAt: null, deliveredAt: null,
    manualProgress: 25, checklist: [],
    source: 'referral',
    ...base(4), note: 'רוצה שמיטל תענה לשיחות בערב. שלחתי דמו, מחכה לתשובה.'
  }
];

/* ---------- משימות ---------- */
const tasks = [
  { id: id('t'), type: 'task', title: 'לתקן את המחירים בדף הנחיתה', done: false, priority: 'high', dueDate: t(-1), clientId: null, ...base(2) },
  { id: id('t'), type: 'task', title: 'לשלוח לדני גרסה ראשונה לאישור', done: false, priority: 'normal', dueDate: t(-2), clientId: clients[0].id, ...base(1) },
  { id: id('t'), type: 'task', title: 'להעלות שלושה רילים לאינסטגרם', done: false, priority: 'normal', dueDate: null, clientId: null, ...base(5) },
  { id: id('t'), type: 'task', title: 'לבנות דף מחירים לסוכנת הקולית', done: false, priority: 'normal', dueDate: null, clientId: null, ...base(8) },
  { id: id('t'), type: 'task', title: 'לשלוח חשבונית לרונית', done: true, doneAt: t(15), priority: 'normal', dueDate: null, clientId: clients[3].id, ...base(16) }
];

/* ---------- ידע ---------- */
const knowledge = [
  {
    id: id('k'), type: 'knowledge', title: 'Higgsfield — שליטה בתנועת מצלמה',
    url: 'https://higgsfield.ai', estMinutes: 25, urgent: false, status: 'new',
    lastTouched: t(12), relatedItemId: clients[0].id, ...base(12),
    tags: ['סרטונים', 'וידאו'], note: 'יכול לחסוך סבבי תיקונים על תנועות מצלמה.'
  },
  {
    id: id('k'), type: 'knowledge', title: 'ElevenLabs Agents — העברת שיחה לאדם',
    url: 'https://elevenlabs.io/docs/agents-platform/overview', estMinutes: 40, urgent: true, status: 'doing',
    lastTouched: t(3), relatedItemId: clients[4].id, ...base(9),
    tags: ['סוכנת', 'מיטל'], note: 'בלי זה אי אפשר למכור את מיטל לעסקים עם תורים.'
  },
  {
    id: id('k'), type: 'knowledge', title: 'איך לתמחר שירות שהעלות השולית שלו אפסית',
    url: '', estMinutes: 15, urgent: false, status: 'new',
    lastTouched: t(21), relatedItemId: null, ...base(21),
    tags: ['תמחור'], note: 'פודקאסט ששמעתי חצי ממנו. רלוונטי לדילמה על הסוכנת.'
  },
  {
    id: id('k'), type: 'knowledge', title: 'Meta Ads — קמפיין לידים לעסקים מקומיים',
    url: 'https://www.facebook.com/business/ads', estMinutes: 30, urgent: false, status: 'new',
    lastTouched: t(6), relatedItemId: null, ...base(6),
    tags: ['פרסום', 'לידים'], note: ''
  },
  {
    id: id('k'), type: 'knowledge', title: 'שימוש ב-Claude לעריכת וידאו אוטומטית',
    url: '', estMinutes: 20, urgent: false, status: 'done',
    lastTouched: t(11), relatedItemId: null, ...base(14),
    tags: ['קלוד'], note: 'ראיתי. שווה לנסות בסרטון הבא.'
  }
];

/* ---------- החלטות ---------- */
const decisions = [
  { id: id('d'), type: 'decision', title: 'האם למכור את הסוכנת הקולית בנפרד או ביחד עם הסרטונים?', status: 'open', ...base(14), note: 'ביחד = עסקה גדולה יותר. בנפרד = קהל רחב יותר.' },
  { id: id('d'), type: 'decision', title: 'האם להעלות את המחיר ל-1,490 ₪ לסרטון?', status: 'open', ...base(5), note: 'אף אחד לא התלונן על המחיר עד היום. זה בדרך כלל סימן.' },
  { id: id('d'), type: 'decision', title: 'להתמקד בענף אחד או להישאר רוחבי?', status: 'open', ...base(19), note: 'מוסכים עבד טוב. אולי לרדוף אחרי זה.' },
  { id: id('d'), type: 'decision', title: 'לשים קמפיין ממומן או להמשיך אורגני עוד חודש?', status: 'resolved', resolution: 'קמפיין קטן של 40 ₪ ליום לשבועיים, ואז להחליט לפי עלות לליד.', resolvedAt: t(7), ...base(24) }
];

/* ---------- רעיונות ---------- */
const ideas = [
  { id: id('i'), type: 'idea', title: 'סדרת סרטונים "לפני ואחרי" למוסכים', ...base(4) },
  { id: id('i'), type: 'idea', title: 'להציע חבילה שנתית עם הנחה של חודשיים', ...base(10) },
  { id: id('i'), type: 'idea', title: 'לתת למיטל לענות גם בוואטסאפ ולא רק בטלפון', ...base(2) },
  { id: id('i'), type: 'idea', title: 'דף נחיתה נפרד לכל ענף — מוסכים, קליניקות, מסעדות', ...base(13) }
];

/* ---------- שגרות ---------- */
const routines = [
  { id: id('r'), type: 'routine', title: 'תוכן אורגני', freq: 'custom', customDays: 2, lastDone: t(3), missCount: 0, nextDue: t(1), note: 'ריל או פוסט', ...base(30) },
  { id: id('r'), type: 'routine', title: 'בדיקת קמפיין', freq: 'daily', lastDone: t(1), missCount: 0, nextDue: t(0, 2), note: 'עלות לליד, מה עובד', ...base(30) },
  { id: id('r'), type: 'routine', title: 'ניירת לרואה חשבון', freq: 'monthly', lastDone: t(28), missCount: 0, nextDue: t(-2), note: 'חשבוניות והוצאות', ...base(60) },
  { id: id('r'), type: 'routine', title: 'סקירת שיחות של הסוכנת', freq: 'weekly', lastDone: t(9), missCount: 1, nextDue: t(2), note: 'לעבור על ההקלטות', ...base(40) },
  { id: id('r'), type: 'routine', title: 'מבט על מספרים', freq: 'weekly', lastDone: t(4), missCount: 0, nextDue: t(-3), note: '', ...base(40) },
  { id: id('r'), type: 'routine', title: 'גיבוי המערכת', freq: 'weekly', lastDone: t(6), missCount: 0, nextDue: t(1), note: 'ייצוא JSON', ...base(40) }
];

/* ---------- תחומים: שעות שהולכות לעסק ולא ללקוח ---------- */
const bucketsList = [
  { id: id('b'), type: 'bucket', title: 'פרונט', note: 'קידום ופיתוח העסק: מודעות, דף נחיתה, תוכן, הסוכנת הקולית', ...base(40) },
  { id: id('b'), type: 'bucket', title: 'ניירת וכספים', note: 'חשבוניות, רואה חשבון, בנק', ...base(40) }
];

/* ---------- נושאים ופתקים ---------- */
const noteTags = [
  { id: 'nt_biz', name: 'העסק', color: '#ffd400' },
  { id: 'nt_video', name: 'סרטונים', color: '#5aa9ff' },
  { id: 'nt_agent', name: 'סוכנת קולית', color: '#e879f9' },
  { id: 'nt_market', name: 'שיווק', color: '#3ddc84' },
  { id: 'nt_admin', name: 'ניירת', color: '#94a3b8' },
  { id: 'nt_personal', name: 'אישי', color: '#ff9f43' }
];

const chk = (...rows) => rows.map(r => {
  const done = r.startsWith('*');
  return { id: id('c'), text: done ? r.slice(1) : r, done };
});

/* שים לב לסדר: noteBase ראשון, כדי שהשדות הספציפיים יגברו עליו */
const noteBase = (i, extra = {}) => Object.assign({
  id: id('n'), type: 'note', kind: 'note', body: '', checklist: [], noteTags: [],
  attachments: [], color: 'default', pinned: false, reminderAt: null, reminderDone: false,
  tags: [], note: '', archived: false, createdAt: t(i), updatedAt: t(i)
}, extra);

const notes = [
  noteBase(20, {
    title: 'מבנה תסריט שעובד',
    body: 'שנייה 0-3: הבעיה, בלי מבוא.\nשנייה 3-8: הפתרון, מראים ולא מספרים.\nשנייה 8-12: מחיר או הצעה.\nסוף: קריאה לפעולה אחת בלבד, לא שתיים.\n\nכל מה שארוך מ-15 שניות נופל באמצע.',
    noteTags: ['nt_video'], color: 'yellow', pinned: true
  }),
  noteBase(24, {
    title: 'מה לשאול לקוח בשיחת אפיון', kind: 'list',
    checklist: chk('מי הלקוח שלך, בגיל ובאזור', 'מה השאלה שהכי חוזרת אצלך',
      'יש לך צילומים קיימים?', 'מה המתחרים עושים שמעצבן אותך',
      'איפה הסרטון ירוץ — אינסטגרם, טיקטוק, אתר'),
    noteTags: ['nt_video', 'nt_market'], color: 'green', pinned: true
  }),
  noteBase(9, {
    title: 'ציוד ותוכנות לבדוק', kind: 'list',
    checklist: chk('Higgsfield — תנועות מצלמה', 'Runway Gen-4', '*HeyGen אווטארים',
      'מוזיקה ברישיון — Epidemic'),
    noteTags: ['nt_video', 'nt_biz'], color: 'blue'
  }),
  noteBase(6, {
    title: 'מיטל — מה עוד חסר לפני מכירה', kind: 'list',
    checklist: chk('העברת שיחה לאדם', 'סיכום שיחה בוואטסאפ', '*זיהוי שעות פתיחה',
      'תמחור — עדיין לא סגור'),
    noteTags: ['nt_agent'], color: 'purple', reminderAt: t(-3)
  }),
  noteBase(11, {
    title: 'טקסטים למודעות',
    body: '"הלקוחות שלך גוללים. אתה לא שם."\n"סרטון פרסומת ב-7 ימים. 1,290 ₪. בלי צוות צילום."\n"מוסך? קליניקה? מסעדה? יש לי סרטון בשבילך."',
    noteTags: ['nt_market'], color: 'orange'
  }),
  noteBase(28, {
    title: 'ניירת לרואה חשבון — מה שולחים', kind: 'list',
    checklist: chk('חשבוניות שהוצאתי', 'קבלות על מנויים בדולר', 'דוח מהבנק', 'הוצאות פרסום ממטא'),
    noteTags: ['nt_admin'], reminderAt: t(-5)
  }),
  noteBase(35, {
    title: 'סיסמאות ומקומות',
    body: 'הכל ב-1Password. כאן רק תזכורת מה קיים:\n· Netlify — הדפים\n· ElevenLabs — הקולות\n· מטא — הקמפיינים\n· Vercel — הפונקציה של העוזר\n\nלא לכתוב כאן סיסמאות אמיתיות.',
    noteTags: ['nt_admin', 'nt_biz'], color: 'gray'
  }),
  noteBase(16, {
    title: 'התנגדויות ששמעתי, ומה עונים',
    body: '"יקר לי" → כמה עולה לך יום בלי לקוחות חדשים?\n"אין לי צילומים" → לא צריך, הכל נוצר.\n"אני לא יודע מה להגיד" → אני כותב את התסריט.\n"אנסה לבד עם AI" → קח, זה קישור לכלי. תחזור אליי בעוד שבוע.',
    noteTags: ['nt_market', 'nt_biz'], color: 'pink'
  })
];

/* ---------- רשומות זמן ---------- */
const entries = [];
const E = (itemId, day, fromH, toH, kind) => entries.push({
  id: id('te'), itemId,
  start: t(day) - (10 - fromH) * HOUR,
  end: t(day) - (10 - toH) * HOUR,
  kind, note: ''
});

// רונית — סרטון שנמסר, כדי שיהיה ממוצע אמיתי
E(clients[3].id, 18, 9, 10.5, 'work');
E(clients[3].id, 17, 11, 13, 'work');
E(clients[3].id, 17, 13, 14.5, 'wait');
E(clients[3].id, 16, 9.5, 11, 'work');
E(clients[3].id, 10, 15, 16, 'work');

// דני — בעבודה עכשיו
E(clients[0].id, 3, 9, 11, 'work');
E(clients[0].id, 3, 11, 12.5, 'wait');
E(clients[0].id, 2, 14, 15.5, 'work');
E(clients[0].id, 1, 10, 11.25, 'work');

// משה, עמית, למידה, ומשימות
E(clients[2].id, 3, 16, 16.75, 'work');
E(clients[4].id, 2, 12, 13, 'work');
E(knowledge[1].id, 3, 8, 8.75, 'learn');
E(knowledge[4].id, 11, 20, 20.5, 'learn');
E(tasks[2].id, 1, 12, 13, 'work');
E(null, 1, 13, 14, 'off');

// שעות שהלכו לעסק עצמו — קמפיין, דף נחיתה, ניירת
E(bucketsList[0].id, 4, 10, 12, 'work');
E(bucketsList[0].id, 2, 16, 17.5, 'work');
E(bucketsList[1].id, 6, 9, 10, 'work');

/* ---------- המצב המלא ---------- */
const state = {
  version: 1,
  sampleBaseTime: BASE,
  createdAt: t(45),
  settings: {
    ownerName: 'אלון', businessName: 'פרונט',
    hourlyTarget: 250, workHoursPerDay: 6, dayStartHour: 9,
    usdRate: 3.65, usdRateAuto: true, usdRateAt: null, leadSlaMinutes: 120, idleAskMinutes: 3,
    longAbsenceHours: 2, timerNudgeHours: 2, decisionStaleDays: 7,
    autoBackupDays: 3, lastBackupAt: t(5), homeMode: 'list', bucketsSeeded: true,   // הדוגמה כוללת תחומים, שלא ייזרעו שוב
    presenceEnabled: false, floatWindow: true, autoWaitMinutes: 8,
    sampling: { enabled: true, perDay: 4, fromHour: 9, toHour: 19, days: [0,1,2,3,4], onMiss: 'assume', notify: true },
    avgLeadCost: 130,
    notifications: { enabled: false, lead: true, deadline: true, routine: true, decision: true, timer: true, note: true },
    assistantEnabled: true, assistantClassify: true
  },
  productLines: [
    {
      id: 'pl_video', name: 'סרטונים', color: '#ffd400', stages,
      pricing: { unit: 1290, bundle: 4200, bundleQty: 4, deliveryDays: 7 }, estHours: 4
    },
    {
      id: 'pl_voice', name: 'סוכנת קולית', color: '#5aa9ff', stages: voiceStages,
      pricing: { unit: 900, bundle: 0, bundleQty: 1, deliveryDays: 5 }, estHours: 3
    }
  ],
  itemTypes: [
    { id: 'client', name: 'לקוח', icon: '👤', color: '#ffd400', system: true },
    { id: 'task', name: 'משימה', icon: '✓', color: '#5aa9ff', system: true },
    { id: 'knowledge', name: 'ידע', icon: '📚', color: '#b98cff', system: true },
    { id: 'decision', name: 'החלטה', icon: '⚖️', color: '#ff9f43', system: true },
    { id: 'routine', name: 'שגרה', icon: '🔁', color: '#3ddc84', system: true },
    { id: 'idea', name: 'רעיון', icon: '💡', color: '#ff6b9d', system: true },
    { id: 'note', name: 'פתק', icon: '🗒', color: '#a3e635', system: true },
    { id: 'bucket', name: 'תחום', icon: '◈', color: '#22d3ee', system: true }
  ],
  noteTags,
  items: [...clients, ...tasks, ...knowledge, ...decisions, ...ideas, ...routines, ...notes, ...bucketsList],
  timeEntries: entries,
  subscriptions: [
    { id: id('s'), name: 'Claude', cost: 200, currency: 'USD' },
    { id: id('s'), name: 'ElevenLabs', cost: 99, currency: 'USD' },
    { id: id('s'), name: 'Higgsfield / וידאו', cost: 149, currency: 'USD' },
    { id: id('s'), name: 'HeyGen', cost: 89, currency: 'USD' },
    { id: id('s'), name: 'Netlify + דומיינים', cost: 21, currency: 'USD' },
    { id: id('s'), name: 'כלים נלווים', cost: 20, currency: 'USD' }
  ],
  ledger: [
    { id: id('lg'), title: 'קמפיין ממומן — מטא', amount: -560, date: t(8), source: 'ad' },
    { id: id('lg'), title: 'קמפיין ממומן — מטא', amount: -420, date: t(34), source: 'ad' },
    { id: id('lg'), title: 'מוזיקה בליווי רישיון', amount: -95, date: t(12) }
  ],
  links: [
    { id: id('l'), title: 'הדף של מיטל', url: 'https://agentfront.netlify.app', desc: 'הסוכנת הקולית — הדף הציבורי' },
    { id: id('l'), title: 'לוח השיחות', url: 'https://agentfront.netlify.app/dash.html', desc: 'כל השיחות שמיטל ניהלה' },
    { id: id('l'), title: 'דף הנחיתה', url: 'https://frontvid.netlify.app', desc: 'הדף שאליו מגיעים מהמודעות' },
    { id: id('l'), title: 'ElevenLabs', url: 'https://elevenlabs.io/app', desc: 'קולות וסוכנות קוליות' },
    { id: id('l'), title: 'Meta Ads', url: 'https://adsmanager.facebook.com', desc: 'ניהול הקמפיינים' },
    { id: id('l'), title: 'Netlify', url: 'https://app.netlify.com', desc: 'האחסון של כל הדפים' }
  ],
  timer: null,
  waiting: [{ itemId: clients[0].id, since: t(0, 0, 38), note: 'קלוד מרנדר גרסה שנייה' }],
  lastSeenAt: BASE,
  pendingAbsence: null,
  dismissedAlerts: {},
  chat: [],
  dayPlan: null
};

const out = path.join(__dirname, '..', 'sample-data.json');
fs.writeFileSync(out, JSON.stringify(state, null, 2), 'utf8');
console.log('נכתב:', out, '·', state.items.length, 'פריטים ·', state.timeEntries.length, 'רשומות זמן');
