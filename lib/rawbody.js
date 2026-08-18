/* ============================================================
   rawbody.js — הגוף כפי שהתקבל, בלי שאף אחד נגע בו
   ------------------------------------------------------------
   כל חתימה מחושבת על הבייטים המקוריים. Vercel מפענח JSON לבד
   כשה-content-type מתאים, ואחרי parse ו-stringify חוזר מספיק
   שרווח אחד יזוז כדי שהחתימה לא תתאים — והשגיאה תיראה כמו
   "הסוד שגוי" ותשלח אותך לחפש במקום הלא נכון.
   ============================================================ */

const LIMIT = 512 * 1024;

export function readRaw(req) {
  // מי שכיבה את ה-parser מקבל stream; אם בכל זאת הגיע גוף מפוענח,
  // עדיף להחזיר אותו כמחרוזת מאשר להיתקע.
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object' && !req.readable)
    return Promise.resolve(JSON.stringify(req.body));

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > LIMIT) { reject(new Error('גוף גדול מדי')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
