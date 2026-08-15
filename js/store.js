/* ============================================================
   store.js — מודל הנתונים, localStorage, ייצוא/ייבוא
   הכל נשען על ארבעה מושגים: קווי מוצר · שלבים · פריטים · רשומות זמן
   ============================================================ */

const KEY = 'front.v1';
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

export const uid = (p = 'i') =>
  p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const now = () => Date.now();

/* ---------- ברירות מחדל ---------- */

function defaultStages() {
  // priority: כמה השלב "צועק". ליד תמיד מנצח הפקה — גם אם ההפקה ממתינה ימים.
  // sla: אחרי כמה דקות בשלב זה נחשב תקוע.
  return [
    { id: uid('st'), name: 'פרסום',       priority: 4,  sla: 3 * 24 * 60 },
    { id: uid('st'), name: 'ליד',          priority: 10, sla: 120 },
    { id: uid('st'), name: 'שיחת מכירה',  priority: 9,  sla: 24 * 60 },
    { id: uid('st'), name: 'תשלום',        priority: 8,  sla: 2 * 24 * 60 },
    { id: uid('st'), name: 'אפיון',        priority: 7,  sla: 24 * 60 },
    { id: uid('st'), name: 'יצירה',        priority: 6,  sla: 3 * 24 * 60 },
    { id: uid('st'), name: 'סבב תיקונים',  priority: 7,  sla: 24 * 60 },
    { id: uid('st'), name: 'אישור',        priority: 8,  sla: 24 * 60 },
    { id: uid('st'), name: 'מסירה',        priority: 9,  sla: 4 * 60 }
  ];
}

export function defaultState() {
  const videoLine = {
    id: 'pl_video',
    name: 'סרטונים',
    color: '#ffd400',
    stages: defaultStages(),
    pricing: { unit: 1290, bundle: 4200, bundleQty: 4, deliveryDays: 7 },
    estHours: 4 // הערכה התחלתית לשעות קשב לפריט; מתעדכן מהמדידה בפועל
  };

  return {
    version: 1,
    createdAt: now(),

    settings: {
      ownerName: 'אלון',
      businessName: 'פרונט',
      hourlyTarget: 250,          // תעריף שעתי יעד ₪
      workHoursPerDay: 6,         // זמן זמין ליום
      dayStartHour: 9,
      usdRate: 3.65,
      usdRateAt: null,            // מתי נמשך אוטומטית. null = הוקלד ידנית
      usdRateAuto: true,          // למשוך שער יומי דרך פונקציית השרת
      leadSlaMinutes: 120,        // ליד ללא מענה מעל X דקות
      idleAskMinutes: 3,          // מעל כמה דקות היעדרות שואלים "איפה היית"
      autoWaitMinutes: 8,         // הטאב פתוח ואין מגע X דקות → הטיימר עובר להמתנה לבד. 0 = מכובה
      presenceEnabled: false,     // Idle Detection — לדעת אם אתה ליד המחשב בכלל (כרום/אדג')
      floatWindow: true,          // חלון צף מעל שאר התוכנות
      longAbsenceHours: 2,        // מעל כמה שעות הטיימר נעצר לבד
      timerNudgeHours: 2,         // טיימר רץ מעל X שעות בלי מגע
      decisionStaleDays: 7,       // החלטה פתוחה שיושבת יותר מדי
      autoBackupDays: 3,
      lastBackupAt: null,
      autoBackupDir: false,       // נבחרה תיקייה לגיבוי אוטומטי
      autoBackupFiles: false,     // לצרף גם את הקבצים מהפנקס לגיבוי האוטומטי
      lastAutoBackupAt: null,
      bucketsSeeded: false,
      onboarded: false,           // ההדרכה בפעם הראשונה
      floatUsed: false,           // האם נפתח החלון הצף אי פעם    // נקבע ל-true אחרי זריעה חד-פעמית, כדי שמחיקה תישאר מחיקה
      homeMode: 'list',           // 'list' | 'day'
      notifications: {
        enabled: false,
        lead: true, deadline: true, routine: true, decision: true, timer: true, note: true
      },
      assistantEnabled: true,
      assistantClassify: true,    // להשתמש בעוזר לסיווג הקלט החופשי
      linkPreview: true,          // למשוך כותרת, תיאור ותמונה לכל לינק שמדביקים
      linkSummary: true,          // ולבקש גם משפט סיכום בעברית (עולה גרושים)

      /* מדידת זמן בדגימות — המערכת שואלת "מה אתה עושה עכשיו?"
         בזמנים אקראיים, ומספרת. ראה sampling.js */
      sampling: {
        enabled: true,
        perDay: 4,
        fromHour: 9,
        toHour: 19,
        days: [0, 1, 2, 3, 4],    // 0 = ראשון
        onMiss: 'assume',         // 'assume' | 'drop' | 'endOfDay'
        notify: true              // להקפיץ כהתראת מערכת, גם מעל תוכנות אחרות
      }
    },

    productLines: [videoLine],

    itemTypes: [
      { id: 'client',    name: 'לקוח',   icon: '👤', color: '#ffd400', system: true },
      { id: 'task',      name: 'משימה',  icon: '✓',  color: '#5aa9ff', system: true },
      { id: 'knowledge', name: 'ידע',    icon: '📚', color: '#b98cff', system: true },
      { id: 'decision',  name: 'החלטה',  icon: '⚖️', color: '#ff9f43', system: true },
      { id: 'routine',   name: 'שגרה',   icon: '🔁', color: '#3ddc84', system: true },
      { id: 'idea',      name: 'רעיון',  icon: '💡', color: '#ff6b9d', system: true },
      { id: 'note',      name: 'פתק',    icon: '🗒', color: '#a3e635', system: true },
      { id: 'bucket',    name: 'תחום',   icon: '◈',  color: '#22d3ee', system: true }
    ],

    items: defaultItems(),
    timeEntries: [],
    samples: [],                 // [{id, at, firedAt, answeredAt, itemId, kind, source}]
    samplePlan: null,            // {date, times:[ts], fired:[ts]}
    presenceLog: [],             // [{t, active}] נקודות מעבר של "ליד המחשב"/"לא"



    subscriptions: [
      { id: uid('s'), name: 'Claude',            cost: 200, currency: 'USD' },
      { id: uid('s'), name: 'ElevenLabs',        cost: 99,  currency: 'USD' },
      { id: uid('s'), name: 'Higgsfield / וידאו', cost: 149, currency: 'USD' },
      { id: uid('s'), name: 'HeyGen',            cost: 89,  currency: 'USD' },
      { id: uid('s'), name: 'Netlify + דומיינים', cost: 21,  currency: 'USD' },
      { id: uid('s'), name: 'כלים נלווים',        cost: 20,  currency: 'USD' }
    ],

    // תנועות כסף שנרשמות ידנית (הכנסה נרשמת אוטומטית כשלקוח מגיע לשלב תשלום)
    ledger: [],

    // חיפושים שמורים — שאילתה שהופכת לכפתור קבוע ברצועה
    savedViews: [],

    // סקירות שבועיות שנסגרו — [{week, at, note, delivered, focusMs, income}]
    reviews: [],

    // תגיות הפנקס — נושאים ופרויקטים. ניתנות לעריכה, שינוי צבע ומחיקה.
    noteTags: [
      { id: 'nt_biz',     name: 'העסק',      color: '#ffd400' },
      { id: 'nt_video',   name: 'סרטונים',   color: '#5aa9ff' },
      { id: 'nt_agent',   name: 'סוכנת קולית', color: '#e879f9' },
      { id: 'nt_market',  name: 'שיווק',     color: '#3ddc84' },
      { id: 'nt_admin',   name: 'ניירת',     color: '#94a3b8' },
      { id: 'nt_personal',name: 'אישי',      color: '#ff9f43' }
    ],

    links: [
      { id: uid('l'), title: 'הדף של מיטל',  url: 'https://agentfront.netlify.app',          desc: 'הסוכנת הקולית — הדף הציבורי' },
      { id: uid('l'), title: 'לוח השיחות',   url: 'https://agentfront.netlify.app/dash.html', desc: 'כל השיחות שמיטל ניהלה' },
      { id: uid('l'), title: 'דף הנחיתה',    url: 'https://frontvid.netlify.app',            desc: 'הדף שאליו מגיעים מהמודעות' },
      { id: uid('l'), title: 'ElevenLabs',   url: 'https://elevenlabs.io/app',               desc: 'קולות וסוכנות קוליות' },
      { id: uid('l'), title: 'Meta Ads',     url: 'https://adsmanager.facebook.com',         desc: 'ניהול הקמפיינים' },
      { id: uid('l'), title: 'Netlify',      url: 'https://app.netlify.com',                 desc: 'האחסון של כל הדפים' }
    ],

    // מצב ריצה
    timer: null,                 // {itemId,startedAt,kind}
    paused: null,                // {itemId,kind,at} — מה היה רץ לפני ההשהיה
    waiting: [],                 // [{itemId,since,note}]
    lastSeenAt: now(),
    pendingAbsence: null,        // {from,to}
    dismissedAlerts: {},
    chat: [],
    dayPlan: null                // {date, blocks:[...]}
  };
}

/* דליי זמן שאינם לקוח — שעות שהולכות לעסק עצמו.
   בלי אלה, שעות של שיווק וניירת נדבקות ללקוח אקראי או נעלמות,
   ואז "כמה עולה לי סרטון" יוצא שגוי. ניתנים לעריכה ולהוספה. */
export function defaultBuckets() {
  const t = now();
  const b = (title, note) => ({
    id: uid('b'), type: 'bucket', title, note,
    tags: [], createdAt: t, updatedAt: t, archived: false
  });
  return [
    b('פרונט', 'קידום ופיתוח העסק: מודעות, דף נחיתה, תוכן, הסוכנת הקולית'),
    b('ניירת וכספים', 'חשבוניות, רואה חשבון, בנק')
  ];
}

export const buckets = () => state.items.filter(i => i.type === 'bucket' && !i.archived);

function defaultItems() {
  const t = now();
  const routine = (title, freq, note) => ({
    id: uid('r'), type: 'routine', title, note: note || '', freq,
    tags: [], createdAt: t, updatedAt: t, archived: false,
    lastDone: null, missCount: 0, nextDue: t
  });

  return [
    routine('תוכן אורגני', 'custom', 'שלוש פעמים בשבוע — ריל או פוסט'),
    routine('בדיקת קמפיין', 'daily', 'עלות לליד, מה עובד, מה לכבות'),
    routine('ניירת לרואה חשבון', 'monthly', 'חשבוניות והוצאות של החודש'),
    routine('סקירת שיחות של הסוכנת', 'weekly', 'לעבור על ההקלטות ולתקן פרומפט'),
    routine('מבט על מספרים', 'weekly', 'רווח, זמן קשב, עלות לסרטון'),
    routine('גיבוי המערכת', 'weekly', 'ייצוא JSON ושמירה בענן')
  ].map(r => {
    if (r.title === 'תוכן אורגני') r.customDays = 2;
    return r;
  }).concat(defaultBuckets());
}

/* ---------- טעינה ושמירה ---------- */

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn('טעינה נכשלה, מתחילים מברירת מחדל', e);
    return defaultState();
  }
}

function migrate(s) {
  const d = defaultState();
  // מיזוג רדוד + עמוק להגדרות, כדי שגרסאות ישנות לא ישברו
  const out = Object.assign({}, d, s);
  out.settings = Object.assign({}, d.settings, s.settings || {});
  out.settings.notifications = Object.assign({}, d.settings.notifications, (s.settings || {}).notifications || {});
  out.settings.sampling = Object.assign({}, d.settings.sampling, (s.settings || {}).sampling || {});
  for (const k of ['productLines', 'itemTypes', 'items', 'timeEntries', 'subscriptions', 'ledger', 'links', 'waiting', 'chat', 'noteTags', 'samples', 'presenceLog', 'savedViews', 'reviews']) {
    if (!Array.isArray(out[k])) out[k] = d[k];
  }
  // סוגי פריטים שנוספו בגרסאות מאוחרות יותר — משלימים בלי לגעת במה שהמשתמש ערך
  d.itemTypes.forEach(dt => {
    if (!out.itemTypes.some(x => x.id === dt.id)) out.itemTypes.push(dt);
  });

  // דליי הזמן נזרעים פעם אחת בלבד, כדי שמחיקה שלהם תישאר מחיקה
  if (!out.settings.bucketsSeeded) {
    out.settings.bucketsSeeded = true;
    if (!out.items.some(i => i.type === 'bucket')) out.items = out.items.concat(defaultBuckets());
  }

  if (!out.productLines.length) out.productLines = d.productLines;
  out.productLines.forEach(p => { if (!Array.isArray(p.stages) || !p.stages.length) p.stages = defaultStages(); });
  return out;
}

let saveTimer = null;

/* מזהה הטאב הזה. נכתב יחד עם הנתונים כדי שנדע להתעלם מהכתיבות של עצמנו. */
const TAB = uid('tab');
const STAMP_KEY = KEY + '.stamp';

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    // חותמת נפרדת וקטנה — האירוע שהטאבים האחרים מקשיבים לו
    localStorage.setItem(STAMP_KEY, TAB + ':' + Date.now());
  } catch (e) {
    console.error('שמירה נכשלה', e);
    window.dispatchEvent(new CustomEvent('front:storage-full'));
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 120);
}

/* ---------- סנכרון בין טאבים ----------
   בלי זה: פותחים את המערכת בשני טאבים, עובדים באחד, והשני — שיושב על מצב ישן —
   דורס הכל ברגע שנוגעים בו. כאן הטאב מאמץ מיד כל שינוי שנכתב בטאב אחר. */

window.addEventListener('storage', e => {
  if (e.key !== STAMP_KEY || !e.newValue) return;
  if (e.newValue.startsWith(TAB + ':')) return;        // הכתיבה שלנו

  // אם יש לנו כתיבה תלויה באוויר — היא מבוססת על מצב ישן. שומרים אותה קודם ומוותרים.
  const hadPending = !!saveTimer;
  clearTimeout(saveTimer);
  saveTimer = null;

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    state = migrate(JSON.parse(raw));
    undoStack.length = 0;                               // הביטול כבר לא מתאים למצב החדש
    subs.forEach(f => { try { f(state); } catch (err) { console.error(err); } });
    window.dispatchEvent(new CustomEvent('front:external-change', { detail: { hadPending } }));
  } catch (err) {
    console.warn('סנכרון בין טאבים נכשל', err);
  }
});

/** שמירה מיידית — לפני סגירת הטאב או מעבר לרקע, שלא תיפול כתיבה באוויר */
export const flush = () => { if (saveTimer) writeNow(); };
window.addEventListener('beforeunload', flush);
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/* ---------- API ---------- */

export const S = () => state;

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

/* ---------- ביטול פעולה ----------
   כל שינוי עובר דרך update() אחת, אז מספיק לצלם את המצב לפניה.
   הצילום הוא מחרוזת JSON — הקבצים יושבים ב-IndexedDB ולא נכנסים לכאן. */

const UNDO_MAX = 25;
const undoStack = [];        // [{ json, label, at }]
let undoing = false;

export function undoDepth() { return undoStack.length; }
export function lastUndoLabel() { return undoStack.length ? undoStack[undoStack.length - 1].label : null; }

/** מחזיר את התיאור של מה שבוטל, או null אם אין מה לבטל */
export function undo() {
  const snap = undoStack.pop();
  if (!snap) return null;
  undoing = true;
  try {
    state = migrate(JSON.parse(snap.json));
    persist();
    subs.forEach(f => { try { f(state); } catch (e) { console.error(e); } });
  } finally { undoing = false; }
  return snap.label || 'הפעולה האחרונה';
}

/** update(fn) — משנה את המצב, שומר, ומודיע לכולם
 *  opts.silent — בלי רינדור מחדש ובלי צילום (משמש לפעימת "אני כאן")
 *  opts.label  — מה לכתוב ב"בוטל: ___". בלי תווית אין צילום ואי אפשר לבטל. */
export function update(fn, opts = {}) {
  if (opts.label && !opts.silent && !undoing) {
    try {
      undoStack.push({ json: JSON.stringify(state), label: opts.label, at: now() });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    } catch (e) { console.warn('צילום לביטול נכשל', e); }
  }
  const r = fn(state);
  if (r && typeof r === 'object') state = r;
  persist();
  if (!opts.silent) subs.forEach(f => { try { f(state); } catch (e) { console.error(e); } });
  return state;
}

export function replaceState(next) {
  state = migrate(next);
  persist();
  subs.forEach(f => f(state));
}

export function resetAll() {
  state = defaultState();
  persist();
  subs.forEach(f => f(state));
}

/* ---------- עזרי פריטים ---------- */

export function addItem(partial) {
  const t = now();
  const item = Object.assign({
    id: uid(partial.type ? partial.type[0] : 'i'),
    type: 'task', title: '', note: '', tags: [], links: [],
    createdAt: t, updatedAt: t, archived: false
  }, partial);

  if (item.type === 'client') {
    const line = state.productLines.find(p => p.id === item.productLineId) || state.productLines[0];
    item.productLineId = line.id;
    if (!item.stageId) item.stageId = line.stages[0].id;
    if (!item.stageSince) item.stageSince = t;
    if (!Array.isArray(item.checklist)) item.checklist = checklistFromLine(line, item.stageId);
    if (typeof item.manualProgress !== 'number') item.manualProgress = 0;
    item.source = item.source || 'other';        // מאיפה הגיע: מודעה / אורגני / הפניה / חוזר
    item.retainer = !!item.retainer;             // משלם כל חודש?
    if (item.retainer && !item.nextRenewalAt) item.nextRenewalAt = t;
  }
  if (item.type === 'knowledge') {
    item.status = item.status || 'new';
    item.lastTouched = item.lastTouched || t;
    if (typeof item.estMinutes !== 'number') item.estMinutes = 20;
    item.urgent = !!item.urgent;
  }
  if (item.type === 'decision') item.status = item.status || 'open';
  if (item.type === 'routine') {
    item.freq = item.freq || 'weekly';
    item.lastDone = item.lastDone || null;
    item.missCount = item.missCount || 0;
    item.nextDue = item.nextDue || t;
  }
  if (item.type === 'task') item.done = !!item.done;
  if (item.type === 'note') {
    item.body = item.body || '';
    item.kind = item.kind || 'note';          // 'note' טקסט חופשי | 'list' צ'קליסט
    if (!Array.isArray(item.checklist)) item.checklist = [];
    if (!Array.isArray(item.attachments)) item.attachments = [];
    if (!Array.isArray(item.noteTags)) item.noteTags = [];
    item.color = item.color || 'default';
    item.pinned = !!item.pinned;
    item.reminderAt = item.reminderAt || null;
    item.reminderDone = !!item.reminderDone;
    if (!Array.isArray(item.history)) item.history = [];
  }

  update(s => { s.items.unshift(item); });
  return item;
}

/** label אופציונלי — אם הועבר, הפעולה ניתנת לביטול ב-Ctrl+Z */
export function patchItem(id, patch, label) {
  update(s => {
    const it = s.items.find(x => x.id === id);
    if (!it) return;
    Object.assign(it, patch, { updatedAt: now() });
  }, { label });
  return state.items.find(x => x.id === id);
}

export function removeItem(id) {
  const it = getItem(id);
  const label = 'מחיקת ' + (it && it.title ? `"${it.title}"` : 'הפריט');
  update(s => {
    s.items = s.items.filter(x => x.id !== id);
    s.timeEntries = s.timeEntries.filter(e => e.itemId !== id);
    s.waiting = s.waiting.filter(w => w.itemId !== id);
    s.samples = s.samples.filter(x => x.itemId !== id);
    // קישורים שהצביעו לפריט שנמחק — מנקים, שלא יישארו צ'יפים ריקים
    s.items.forEach(i => {
      if (Array.isArray(i.links) && i.links.includes(id)) i.links = i.links.filter(x => x !== id);
    });
    if (s.timer && s.timer.itemId === id) s.timer = null;
  }, { label });
}

export const getItem = id => state.items.find(x => x.id === id);
export const itemsOf = type => state.items.filter(x => x.type === type && !x.archived);

export function typeMeta(type) {
  return state.itemTypes.find(t => t.id === type) ||
    { id: type, name: type, icon: '•', color: '#888' };
}

/* ---------- חיפושים שמורים ---------- */

export function addSavedView(name, query) {
  const v = { id: uid('sv'), name: name || query, query, createdAt: now() };
  update(s => { if (!Array.isArray(s.savedViews)) s.savedViews = []; s.savedViews.push(v); },
    { label: 'שמירת תצוגה' });
  return v;
}

export function removeSavedView(id) {
  update(s => { s.savedViews = (s.savedViews || []).filter(v => v.id !== id); },
    { label: 'מחיקת תצוגה שמורה' });
}

export const savedViews = () => S().savedViews || [];

/* ---------- היסטוריית גרסאות לפתק ----------
   Keep מוחק ואין דרך חזרה. כאן שומרים עשר גרסאות אחרונות —
   זה זול, כי הכל טקסט והקבצים ממילא יושבים במקום אחר. */

const HISTORY_MAX = 10;

/** צילום של תוכן הפתק לפני שינוי. נשמר רק אם באמת השתנה משהו. */
export function pushHistory(id) {
  const n = getItem(id);
  if (!n || n.type !== 'note') return;
  const snap = {
    at: now(),
    title: n.title || '',
    body: n.body || '',
    kind: n.kind || 'note',
    checklist: (n.checklist || []).map(c => ({ text: c.text, done: !!c.done }))
  };
  const last = (n.history || [])[0];
  if (last && sameSnap(last, snap)) return;

  update(s => {
    const it = s.items.find(x => x.id === id);
    if (!it) return;
    if (!Array.isArray(it.history)) it.history = [];
    it.history.unshift(snap);
    if (it.history.length > HISTORY_MAX) it.history.length = HISTORY_MAX;
  }, { silent: true });
}

function sameSnap(a, b) {
  return a.title === b.title && a.body === b.body && a.kind === b.kind &&
    (a.checklist || []).length === (b.checklist || []).length &&
    (a.checklist || []).every((c, i) => c.text === b.checklist[i].text && !!c.done === !!b.checklist[i].done);
}

/** משחזר גרסה. הגרסה הנוכחית נדחפת להיסטוריה קודם, כדי שאפשר יהיה לחזור. */
export function restoreHistory(id, index) {
  const n = getItem(id);
  if (!n || !n.history || !n.history[index]) return false;
  const snap = n.history[index];
  pushHistory(id);
  update(s => {
    const it = s.items.find(x => x.id === id);
    if (!it) return;
    it.title = snap.title;
    it.body = snap.body;
    it.kind = snap.kind;
    it.checklist = (snap.checklist || []).map(c => ({ id: uid('c'), text: c.text, done: !!c.done }));
    it.updatedAt = now();
  }, { label: 'שחזור גרסה' });
  return true;
}

/* ---------- הפנקס ---------- */

export const notes = () => state.items.filter(i => i.type === 'note');

export const noteTag = id => state.noteTags.find(t => t.id === id);

export function addNoteTag(name, color) {
  const t = { id: uid('nt'), name: name || 'נושא חדש', color: color || '#94a3b8' };
  update(s => { s.noteTags.push(t); });
  return t;
}

export function patchNoteTag(id, patch) {
  update(s => {
    const t = s.noteTags.find(x => x.id === id);
    if (t) Object.assign(t, patch);
  });
}

/** מוחק תגית ומנקה אותה מכל הפתקים */
export function removeNoteTag(id) {
  const t = noteTag(id);
  update(s => {
    s.noteTags = s.noteTags.filter(x => x.id !== id);
    s.items.forEach(i => {
      if (Array.isArray(i.noteTags)) i.noteTags = i.noteTags.filter(x => x !== id);
    });
  }, { label: 'מחיקת הנושא ' + (t ? `"${t.name}"` : '') });
}

/** כל מזהי הקבצים שעדיין בשימוש — לניקוי יתומים ב-IndexedDB */
export function liveAttachmentIds() {
  const ids = [];
  state.items.forEach(i => {
    (i.attachments || []).forEach(a => ids.push(a.id));
    if (i.preview && i.preview.imageId) ids.push(i.preview.imageId);
  });
  return ids;
}

/* ---------- קווי מוצר ושלבים ---------- */

export const lineOf = id => state.productLines.find(p => p.id === id) || state.productLines[0];
export function stageOf(item) {
  const line = lineOf(item.productLineId);
  return line.stages.find(s => s.id === item.stageId) || line.stages[0];
}
export function stageIndex(item) {
  const line = lineOf(item.productLineId);
  const i = line.stages.findIndex(s => s.id === item.stageId);
  return i < 0 ? 0 : i;
}

export function checklistFromLine(line, fromStageId) {
  const i = Math.max(0, line.stages.findIndex(s => s.id === fromStageId));
  return line.stages.slice(i).map(s => ({ id: uid('c'), text: s.name, done: false }));
}

export function moveToStage(itemId, stageId) {
  update(s => {
    const it = s.items.find(x => x.id === itemId);
    if (!it) return;
    it.stageId = stageId;
    it.stageSince = now();
    it.updatedAt = now();
    // סימון אוטומטי בצ'קליסט של כל מה שלפני השלב החדש
    const line = s.productLines.find(p => p.id === it.productLineId);
    if (line && Array.isArray(it.checklist)) {
      const idx = line.stages.findIndex(x => x.id === stageId);
      line.stages.forEach((st, i) => {
        const c = it.checklist.find(c => c.text === st.name);
        if (c && i < idx) c.done = true;
      });
    }
  }, { label: 'העברת שלב' });
}

/* ---------- כסף ---------- */

export function monthlySubsILS() {
  const r = state.settings.usdRate || 3.65;
  return state.subscriptions.reduce((a, s) =>
    a + (s.currency === 'USD' ? s.cost * r : s.cost), 0);
}

export function monthKey(ts = now()) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** הכנסות החודש: לקוחות שעברו את שלב התשלום + רשומות ידניות */
export function monthMoney(mk = monthKey()) {
  let income = 0, delivered = 0;
  state.items.filter(i => i.type === 'client').forEach(c => {
    if (!c.paidAt) return;
    if (monthKey(c.paidAt) !== mk) return;
    income += Number(c.amount) || 0;
    delivered++;
  });
  let extraIn = 0, extraOut = 0;
  state.ledger.forEach(l => {
    if (monthKey(l.date) !== mk) return;
    if (l.amount >= 0) extraIn += l.amount; else extraOut += -l.amount;
  });
  const subs = monthlySubsILS();
  const media = state.items.filter(i => i.type === 'client' && monthKey(i.paidAt || i.createdAt) === mk)
    .reduce((a, c) => a + (Number(c.mediaCost) || 0), 0);
  return {
    income: income + extraIn,
    expenses: subs + media + extraOut,
    subs, media, extraOut, delivered,
    profit: income + extraIn - (subs + media + extraOut)
  };
}

/* ---------- ייצוא / ייבוא ---------- */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function downloadBackup() {
  const d = new Date();
  const name = `front-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  update(s => { s.settings.lastBackupAt = now(); });
  return name;
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items))
    throw new Error('הקובץ לא נראה כמו גיבוי של פרונט');
  replaceState(parsed);
}

/**
 * טעינת נתוני הדוגמה: כל חותמות הזמן בקובץ נשמרות יחסית ל-sampleBaseTime,
 * וכאן מזיזים אותן כך שהדוגמה תמיד נראית "טרייה" ביום שבו טוענים אותה.
 */
export function loadSample(json) {
  const baseline = json.sampleBaseTime;
  if (baseline) {
    const shift = now() - baseline;
    const walk = node => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'number' && v > 1e12 && v < 4e12 && k !== 'sampleBaseTime') node[k] = v + shift;
        else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(json);
    delete json.sampleBaseTime;
  }
  // ההדרכה היא מצב של המשתמש, לא של הנתונים. מי שכבר עבר אותה
  // וטוען דוגמה כדי להסתכל לא אמור לקבל אותה שוב.
  const seen = state.settings.onboarded;
  replaceState(json);
  if (seen) update(s => { s.settings.onboarded = true; }, { silent: true });
}

export function backupOverdue() {
  const s = state.settings;
  if (!s.autoBackupDays) return false;
  const last = s.lastBackupAt || state.createdAt;
  return now() - last > s.autoBackupDays * DAY;
}

export const CONST = { MIN, HOUR, DAY };
