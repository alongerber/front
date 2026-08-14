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

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const CLASSIFY_MODEL = process.env.ANTHROPIC_CLASSIFY_MODEL || MODEL;
const MAX_CONTEXT_CHARS = 60000;

export const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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

export async function runAssistant({ method, body }) {
  if (method === 'OPTIONS') return { status: 204, body: null };
  if (method !== 'POST') return { status: 405, body: { error: 'רק POST' } };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: {
        error: 'ANTHROPIC_API_KEY לא מוגדר. הוסף אותו למשתני הסביבה של האתר ואז עשה Redeploy.'
      }
    };
  }

  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); }
    catch { return { status: 400, body: { error: 'גוף הבקשה אינו JSON תקין' } }; }
  }
  if (!body || typeof body !== 'object') body = {};

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
