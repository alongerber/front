/* ============================================================
   api.js — איתור נקודת הקצה של העוזר
   Vercel מגיש אותה ב-/api/assistant, Netlify ב-/.netlify/functions/assistant.
   מנסים את שתיהן פעם אחת, זוכרים מי ענתה, וממשיכים איתה.
   ============================================================ */

const CANDIDATES = ['/api/assistant', '/.netlify/functions/assistant'];

let resolved = null;

/** נכשל ב-fetch או 404/405 = הנתיב לא קיים כאן, ננסה את הבא */
const isMissing = r => r.status === 404 || r.status === 405 || r.status === 501;

export async function callAssistant(payload) {
  const list = resolved ? [resolved] : CANDIDATES;
  let lastError = null;

  for (const url of list) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      lastError = e;
      continue;
    }
    if (isMissing(r) && !resolved) { lastError = new Error('לא נמצא'); continue; }
    resolved = url;
    return r;
  }

  // אם נתיב שהצליח בעבר נפל, נאפס כדי לנסות את שניהם בפעם הבאה
  resolved = null;
  throw lastError || new Error('אין חיבור לעוזר');
}

export const assistantEndpoint = () => resolved;
