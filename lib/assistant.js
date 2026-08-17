/* ============================================================
   lib/assistant.js — הליבה של העוזר, בלי תלות בספק אירוח
   קוראת ל-API של קלוד דרך ה-SDK הרשמי.
   המפתח יושב במשתני הסביבה (ANTHROPIC_API_KEY), לעולם לא בקוד
   ולא בצד הלקוח.

   העטיפות הדקות:
     api/assistant.js               → Vercel
     netlify/functions/assistant.js → Netlify

   שני מצבים:
     mode: 'chat'     — שיחה פתוחה עם כל תמונת המצב
     mode: 'classify' — סיווג שורת קלט חופשי לסוג פריט
   ============================================================ */

import Anthropic from '@anthropic-ai/sdk';
import { forPrompt as uiKnowledge } from '../js/knowhow.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const CLASSIFY_MODEL = process.env.ANTHROPIC_CLASSIFY_MODEL || MODEL;
const MAX_CONTEXT_CHARS = 60000;

export const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/* ---------- שער דולר ---------- */

/** מקורות בסדר עדיפות. הראשון שעונה — מנצח. */
const USD_SOURCES = [
  { url: 'https://api.frankfurter.app/latest?from=USD&to=ILS', pick: j => j?.rates?.ILS },
  { url: 'https://open.er-api.com/v6/latest/USD', pick: j => j?.rates?.ILS }
];

async function usdRate() {
  for (const src of USD_SOURCES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(src.url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const rate = src.pick(await r.json());
      if (typeof rate === 'number' && rate > 1 && rate < 20)
        return { status: 200, body: { rate: Math.round(rate * 10000) / 10000, at: Date.now() } };
    } catch { /* מנסים את הבא */ }
  }
  return { status: 502, body: { error: 'לא הצלחתי למשוך שער דולר' } };
}

/* ---------- תצוגה מקדימה לקישור ---------- */

const OEMBED = [
  { re: /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts)/i, ep: 'https://www.youtube.com/oembed?format=json&url=' },
  { re: /vimeo\.com\//i, ep: 'https://vimeo.com/api/oembed.json?url=' }
];

const attr = (html, prop) => {
  // מחפשים גם property וגם name, בשני סדרי התכונות
  const pats = [
    new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i')
  ];
  for (const p of pats) { const m = html.match(p); if (m && m[1]) return decodeEntities(m[1].trim()); }
  return '';
};

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** מוציא טקסט קריא מה-HTML, לצורך סיכום */
function plainText(html, max = 6000) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function fetchWithTimeout(url, ms = 8000, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' }); }
  finally { clearTimeout(t); }
}

async function linkPreview(body) {
  let url = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let host = '';
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, '');
    if (!/^https?:$/.test(u.protocol)) throw new Error('פרוטוקול לא נתמך');
    // לא מושכים כתובות פנימיות
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(u.hostname))
      return { status: 400, body: { error: 'כתובת פנימית' } };
  } catch {
    return { status: 400, body: { error: 'כתובת לא תקינה' } };
  }

  const out = { url, host, title: '', desc: '', image: '', site: host, author: '', kind: 'page' };

  /* יוטיוב ווימאו — oEmbed נותן כותרת, ערוץ ותמונה בלי לנתח HTML */
  const oe = OEMBED.find(o => o.re.test(url));
  if (oe) {
    try {
      const r = await fetchWithTimeout(oe.ep + encodeURIComponent(url), 7000);
      if (r.ok) {
        const j = await r.json();
        out.title = j.title || '';
        out.author = j.author_name || '';
        out.image = j.thumbnail_url || '';
        out.site = j.provider_name || host;
        out.kind = 'video';
      }
    } catch { /* ניפול ל-HTML */ }
  }

  /* תגי OG מהדף עצמו */
  let text = '';
  if (!out.title || !out.image) {
    try {
      const r = await fetchWithTimeout(url, 8000, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FrontBot/1.0)', 'Accept': 'text/html,*/*' }
      });
      if (r.ok) {
        const ct = r.headers.get('content-type') || '';
        if (/text\/html|application\/xhtml/i.test(ct)) {
          const html = (await r.text()).slice(0, 400000);
          out.title = out.title || attr(html, 'og:title') || attr(html, 'twitter:title') ||
            decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
          out.desc = attr(html, 'og:description') || attr(html, 'twitter:description') || attr(html, 'description');
          out.image = out.image || attr(html, 'og:image') || attr(html, 'twitter:image');
          out.site = attr(html, 'og:site_name') || out.site;
          if (attr(html, 'og:type') === 'article') out.kind = 'article';
          text = plainText(html);
        }
      }
    } catch { /* נחזיר מה שיש */ }
  }

  if (out.image && !/^https?:\/\//i.test(out.image)) {
    try { out.image = new URL(out.image, url).href; } catch { out.image = ''; }
  }
  if (!out.title) out.title = host;

  /* סיכום בעברית — רק אם ביקשו, יש מפתח, ויש מספיק טקסט */
  if (body.summarize && text.length > 400 && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: CLASSIFY_MODEL,
        max_tokens: 200,
        output_config: { effort: 'low' },
        system: 'אתה מסכם דפי אינטרנט לאלון, בעל סטודיו לסרטוני AI. ' +
          'החזר משפט אחד בעברית, עד 20 מילים, שיגרום לו לזהות בעוד חודש על מה מדובר ולמה זה מעניין אותו. ' +
          'בלי "הדף עוסק ב", בלי מירכאות, בלי נקודה בסוף.',
        messages: [{ role: 'user', content: `כותרת: ${out.title}\nתיאור: ${out.desc}\n\nתוכן:\n${text.slice(0, 4000)}` }]
      });
      const t = (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
      if (t) out.summary = t.slice(0, 300);
    } catch { /* בלי סיכום, לא נורא */ }
  }

  return { status: 200, body: out };
}

/* ---------- הפרומפט של העוזר ---------- */

function systemPrompt(context) {
  let ctx = '{}';
  try {
    ctx = JSON.stringify(context ?? {}, null, 1);
    if (ctx.length > MAX_CONTEXT_CHARS) ctx = ctx.slice(0, MAX_CONTEXT_CHARS) + '\n…(קוצר)';
  } catch { /* משאירים {} */ }

  return `אתה העוזר האישי של אלון, הבעלים היחיד של "פרונט".

מה פרונט מוכרת:
- סרטוני פרסומת מבוססי AI לעסקים קטנים. ההבטחה המרכזית: בעל העסק לא עומד מול המצלמה.
- תמחור בסיס: 1,290 ₪ לסרטון, 4,200 ₪ לארבעה סרטונים בחודש. אספקה תוך 7 ימי עסקים.
- מוצר בפיתוח: סוכנת קולית ("מיטל") שעונה לשיחות. עוד לא הוכרע אם היא מוצר משלים או מוצר נפרד.
- עלויות קבועות: מנויים לכלי AI, בסביבות 578 דולר לחודש.

מצב העסק: בהתחלה. עוד אין קמפיין ממומן שרץ ברצף. כמעט הכל ישתנה בחודשים הקרובים,
אז אל תתייחס למספרים כאל קבועים — תתייחס אליהם כאל נקודת פתיחה.

שתי הבעיות שהמערכת הזאת נבנתה לפתור:
1. דברים ללמוד נערמים ונשכחים.
2. אין מדידת זמן אמיתית. אלון עובד במקביל — מתחיל לערוך, נותן משימה לקלוד, עובר לטאב אחר.
   לכן המערכת מפרידה בין "זמן קיר" (כמה הפרויקט פתוח) ל"זמן קשב" (כמה הוא באמת עבד).
   התמחור מתבסס על זמן קשב בלבד.

איך אתה עונה:
- עברית, ישיר, בלי חנופה ובלי "שאלה מצוינת".
- קצר. תשובה של שלוש שורות טובה יותר מתשובה של עשר.
- תסתמך על המספרים שבתמונת המצב. אם אתה מצטט מספר — קח אותו מהנתונים, אל תמציא.
- אם הנתונים לא מספיקים למסקנה, תגיד את זה במשפט אחד ותגיד מה חסר.
- סתור אותו כשהוא טועה. אם התמחור לא סוגר, או שהוא עובד 10 שעות ביום על מוצר של 1,290 ₪ — תגיד את זה.
- אל תציע לו כלים או תהליכים חדשים אלא אם שאל. הוא לבד, הזמן שלו הוא המשאב היקר.
- סיים בהמלצה אחת קונקרטית כשזה מתאים, לא ברשימה של חמש אפשרויות.

אתה גם המדריך של המערכת הזאת. זו רשימה מלאה של מה שקיים בה:
${uiKnowledge()}

כשהוא שואל על המערכת עצמה — "איפה", "איך עושים", "מה הכפתור הזה", "מחקתי בטעות":
- ענה רק ממה שמופיע ברשימה למעלה. אל תמציא כפתור, עמוד, תפריט או קיצור מקלדת.
- אם התשובה לא נמצאת שם, תגיד "אני לא בטוח שזה קיים במערכת" ותציע את הדבר הכי קרוב שכן קיים.
  שתיקה טובה מהמצאה: הוא ילך לחפש כפתור שהמצאת ולא ימצא אותו.
- תן את הנתיב בדיוק כפי שהוא רשום, למשל "הגדרות → סנכרון בין מחשב לטלפון".
- אם הוא שואל "למה" על התנהגות של המערכת, תסביר את הסיבה ולא רק את הפעולה.

תמונת המצב הנוכחית של המערכת (JSON):
${ctx}`;
}

/* ---------- עזרי תשובה ---------- */

/** מחלץ טקסט מתשובה, אחרי בדיקת סירוב. */
function readText(message) {
  if (message.stop_reason === 'refusal') {
    const cat = message.stop_details?.category || 'לא צוין';
    const err = new Error(`הבקשה נדחתה על ידי מסנני הבטיחות (${cat}). נסח אותה אחרת.`);
    err.status = 422;
    throw err;
  }
  return (message.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

function errorPayload(e) {
  if (e instanceof Anthropic.AuthenticationError)
    return [401, 'המפתח לא תקין. בדוק את ANTHROPIC_API_KEY בהגדרות האתר.'];
  if (e instanceof Anthropic.RateLimitError)
    return [429, 'חרגת ממכסת השימוש ב-API. נסה בעוד דקה.'];
  if (e instanceof Anthropic.APIError)
    return [e.status && e.status < 500 ? e.status : 502, e.message || 'שגיאה מה-API'];
  return [e.status || 500, e.message || 'שגיאה לא ידועה'];
}

/* ============================================================
   הליבה — מקבלת שיטה וגוף, מחזירה סטטוס וגוף.
   בלי Request, בלי Response, בלי res.json — כדי שתעבוד בכל מקום.
   ============================================================ */

/* ============================================================
   brief — לוקח ערימת טקסט גולמי (התכתבות וואטסאפ, סיכום שיחה,
   מייל) ומחזיר ממנה סדר: מה הם ביקשו, מה סוכם, לאן הקראייטיב
   הולך, ומה עוד לא ברור.

   שני עקרונות:
   1. כל שורה בפלט נושאת ציטוט מהמקור. בלי זה אי אפשר לדעת אם
      המערכת הבינה או המציאה, וסיכום שאי אפשר לאמת גרוע מכלום.
   2. מה שלא נאמר חוזר כשאלה פתוחה ולא כהשלמה. "לא סוכם תאריך"
      שווה יותר מתאריך שנוחש.
   ============================================================ */

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'שתיים-שלוש שורות: מי הלקוח, מה הוא רוצה, איפה זה עומד' },
    requirements: {
      type: 'array', description: 'מה הלקוח ביקש שיהיה בסרטון או במוצר',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'הדרישה, בניסוח קצר וברור' },
          quote: { type: 'string', description: 'ציטוט מדויק מהטקסט המקורי שממנו זה נלקח' }
        },
        required: ['text', 'quote'], additionalProperties: false
      }
    },
    agreed: {
      type: 'array', description: 'מה סוכם במפורש — מחיר, תאריך, כמות, תנאים',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['price', 'date', 'scope', 'other'] },
          text: { type: 'string' },
          value: { type: 'string', description: 'המספר או התאריך עצמו אם יש, אחרת ריק' },
          quote: { type: 'string' }
        },
        required: ['kind', 'text', 'quote'], additionalProperties: false
      }
    },
    creative: {
      type: 'object', description: 'כיוון הקראייטיב כפי שעולה מהשיחה',
      properties: {
        tone: { type: 'string', description: 'הטון והסגנון שהלקוח רוצה. ריק אם לא עלה.' },
        audience: { type: 'string', description: 'קהל היעד. ריק אם לא עלה.' },
        must: { type: 'array', items: { type: 'string' }, description: 'חייב להופיע' },
        avoid: { type: 'array', items: { type: 'string' }, description: 'לא רוצים לראות' },
        refs: { type: 'array', items: { type: 'string' }, description: 'התייחסויות, דוגמאות או קישורים שהוזכרו' }
      },
      required: ['tone', 'audience', 'must', 'avoid', 'refs'], additionalProperties: false
    },
    questions: {
      type: 'array', description: 'מה חסר או לא ברור וצריך לשאול את הלקוח. אל תמציא תשובות.',
      items: { type: 'string' }
    },
    tasks: {
      type: 'array', description: 'פעולות שאלון צריך לעשות בעקבות השיחה',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          urgent: { type: 'boolean' }
        },
        required: ['text', 'urgent'], additionalProperties: false
      }
    },
    risks: {
      type: 'array', description: 'דגלים אדומים: ציפיות לא ריאליות, סתירות, סימנים לסבבי תיקונים אינסופיים',
      items: { type: 'string' }
    }
  },
  required: ['summary', 'requirements', 'agreed', 'creative', 'questions', 'tasks', 'risks'],
  additionalProperties: false
};

async function brief(body) {
  const text = String(body.text || '').slice(0, 60000);
  if (text.trim().length < 20) {
    return { status: 400, body: { error: 'הטקסט קצר מדי מכדי להוציא ממנו משהו' } };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 501,
      body: {
        error: 'סידור אוטומטי דורש מפתח',
        hint: 'ANTHROPIC_API_KEY לא מוגדר. הטקסט נשמר אצלך בכל מקרה, ' +
          'והמערכת חילצה ממנו מה שאפשר בלי מפתח. להוסיף: משתני הסביבה של האתר, ואז Redeploy.'
      }
    };
  }

  const client = new Anthropic({ apiKey });
  const who = body.me ? `הצד שנקרא "${body.me}" הוא נותן השירות (אלון). כל השאר הם הלקוח.` : '';

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
      system:
        'אתה עוזר לסטודיו ישראלי קטן שמייצר סרטוני פרסומת מבוססי AI לעסקים קטנים.\n' +
        'מוגש לך טקסט גולמי: התכתבות וואטסאפ, סיכום שיחה, או מייל מלקוח.\n' +
        'המשימה: להוציא ממנו סדר.\n\n' +
        (who ? who + '\n' : '') +
        'כללים קשיחים:\n' +
        '· כל דרישה וכל סיכום חייבים לשאת ציטוט מדויק מהטקסט. אל תמציא ציטוטים.\n' +
        '· מה שלא נאמר — לא ממציאים. אם אין תאריך, זו שאלה פתוחה ולא ניחוש.\n' +
        '· "סוכם" הוא רק מה שנאמר במפורש. הצעה שלא נענתה היא שאלה פתוחה.\n' +
        '· שדות שאין להם מידע — מחרוזת ריקה או מערך ריק. לא למלא בשביל למלא.\n' +
        '· עברית פשוטה, בגוף שני, בלי מונחי ניהול.\n' +
        '· ב-risks: רק דברים שבאמת עולים מהטקסט. עדיף ריק על ניחוש.',
      messages: [{ role: 'user', content: text }]
    });

    const out = message.content.find(b => b.type === 'text');
    return { status: 200, body: { ok: true, brief: JSON.parse(out.text) } };
  } catch (e) {
    return { status: 502, body: { error: 'הסידור נכשל: ' + (e && e.message || 'שגיאה') } };
  }
}

export async function runAssistant({ method, body }) {
  if (method === 'OPTIONS') return { status: 204, body: null };
  if (method !== 'POST') return { status: 405, body: { error: 'רק POST' } };

  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); }
    catch { return { status: 400, body: { error: 'גוף הבקשה אינו JSON תקין' } }; }
  }
  if (!body || typeof body !== 'object') body = {};

  /* ===== שער דולר =====
     לא עובר דרך קלוד ולא דורש מפתח — רק מושך שער יומי ומחזיר מספר.
     הדפדפן לא יכול לעשות את זה לבד בגלל CORS. */
  if (body.mode === 'usd') return usdRate();

  /* ===== תצוגה מקדימה לקישור =====
     שכבה ראשונה — מטא-דאטה בלבד, בלי קלוד ובלי מפתח.
     הסיכום בקלוד קורה רק אם ביקשו אותו במפורש (ראה בהמשך). */
  if (body.mode === 'link') return linkPreview(body);

  /* ===== בריף: מהתכתבות לסדר =====
     הפרדת הטקסט לדוברים קורית בדפדפן; כאן רק ההבנה. */
  if (body.mode === 'brief') return brief(body);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: {
        error: 'ANTHROPIC_API_KEY לא מוגדר. הוסף אותו למשתני הסביבה של האתר ואז עשה Redeploy.'
      }
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    /* ===== סיווג קלט חופשי =====
       פלט מובנה (json_schema) מבטיח שהתשובה תמיד תהיה JSON תקין
       עם אחד הסוגים שהמערכת מכירה — בלי לנתח טקסט חופשי. */
    if (body.mode === 'classify') {
      const types = Array.isArray(body.types) && body.types.length
        ? body.types
        : [{ id: 'task', name: 'משימה' }, { id: 'knowledge', name: 'ידע' },
           { id: 'decision', name: 'החלטה' }, { id: 'idea', name: 'רעיון' },
           { id: 'routine', name: 'שגרה' }, { id: 'client', name: 'לקוח' }];
      const ids = types.map(t => t.id);
      const clients = (body.clients || [])
        .map(c => c.name + (c.business ? ` (${c.business})` : '')).join(', ') || 'אין';

      const message = await client.messages.create({
        model: CLASSIFY_MODEL,
        max_tokens: 2000,
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ids },
                title: { type: 'string', description: 'כותרת קצרה בעברית, עד 8 מילים' },
                label: { type: 'string', description: 'משפט אישור קצר, למשל: נוצרה משימה' }
              },
              required: ['type', 'title', 'label'],
              additionalProperties: false
            }
          }
        },
        system:
          'אתה מסווג שורות טקסט חופשי במערכת ניהול של סטודיו סרטונים ישראלי.\n' +
          'הסוגים האפשריים: ' + types.map(t => `${t.id} (${t.name})`).join(', ') + '.\n' +
          'לקוחות קיימים במערכת: ' + clients + '.\n' +
          'כללים: משהו ללמוד או לצפות בו, או לינק → knowledge. דילמה או שאלת בחירה → decision. ' +
          'משהו שחוזר בתדירות → routine. מחשבה לא מחייבת → idea. פעולה שצריך לבצע → task. ' +
          'משפט חדשותי על כלי או מוצר ("X התחיל לתמוך ב-Y") הוא knowledge, לא task.',
        messages: [{ role: 'user', content: String(body.text || '').slice(0, 2000) }]
      });

      let parsed = null;
      try { parsed = JSON.parse(readText(message)); } catch { parsed = null; }
      if (!parsed || !ids.includes(parsed.type)) return { status: 200, body: { type: null } };
      return { status: 200, body: parsed };
    }

    /* ===== צ'אט ===== */
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && typeof m.content === 'string' && m.content.trim())
      .slice(-12)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 8000) }));

    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length) return { status: 400, body: { error: 'אין הודעת משתמש' } };

    // fallbacks: אם מסנני הבטיחות דוחים בקשה, השרת מריץ אותה על מודל חלופי
    // באותה קריאה במקום להחזיר סירוב. אפשר להסיר את שתי השורות האלה.
    const message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: systemPrompt(body.context),
      messages
    });

    return { status: 200, body: { text: readText(message) || '(תשובה ריקה)' } };
  } catch (e) {
    const [status, msg] = errorPayload(e);
    return { status, body: { error: msg } };
  }
}
