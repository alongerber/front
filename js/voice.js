/* ============================================================
   voice.js — הכתבה בעברית
   Web Speech API. אתה נוסע בין לקוחות; זה ההבדל בין לתעד ולשכוח.
   קיים בכרום ובאדג'. בדפדפן אחר הכפתור פשוט לא מוצג.
   ============================================================ */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const supported = () => !!SR;

let rec = null;
let active = null;      // {field, onDone, base}

export const listening = () => !!rec;

/**
 * מתחיל להכתיב לתוך שדה. לחיצה נוספת עוצרת.
 * onState(state) — 'start' | 'stop' | 'error'
 */
export function dictate(field, { onState, lang = 'he-IL' } = {}) {
  if (!SR) return false;
  if (rec) { stop(); return false; }

  rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  // מה שכבר כתוב נשמר; ההכתבה מתווספת אחריו
  const base = field.value ? field.value.replace(/\s+$/, '') + ' ' : '';
  active = { field, onState, base };

  rec.onresult = e => {
    let finalText = '', interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    if (finalText) active.base += finalText.replace(/\s+$/, '') + ' ';
    field.value = active.base + interim;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    // גלילה לסוף, שתראה מה נכתב
    try { field.setSelectionRange(field.value.length, field.value.length); } catch { /* לא כל שדה תומך */ }
  };

  rec.onerror = e => {
    const msg = e.error === 'not-allowed' ? 'לא ניתנה הרשאה למיקרופון'
      : e.error === 'no-speech' ? 'לא שמעתי כלום'
        : e.error === 'network' ? 'ההכתבה דורשת חיבור לאינטרנט'
          : 'ההכתבה נכשלה';
    onState && onState('error', msg);
    stop();
  };

  rec.onend = () => { const f = active && active.onState; rec = null; active = null; f && f('stop'); };

  try {
    rec.start();
    onState && onState('start');
    return true;
  } catch {
    rec = null; active = null;
    onState && onState('error', 'ההכתבה לא נפתחה');
    return false;
  }
}

export function stop() {
  if (!rec) return;
  try { rec.stop(); } catch { /* כבר נעצר */ }
}

/* ---------- הכפתור ---------- */

/** כפתור מיקרופון שמחובר לשדה. מחזיר null אם הדפדפן לא תומך. */
export function micButton(field, { el: mk, toast, size = 'btn-xs' } = {}) {
  if (!supported()) return null;
  const btn = mk('button', {
    class: 'btn ' + size + ' mic',
    'data-tip': 'voice.dictate',
    type: 'button'
  }, '🎤');

  btn.addEventListener('click', e => {
    e.preventDefault();
    if (listening()) { stop(); return; }
    dictate(field, {
      onState: (st, msg) => {
        btn.classList.toggle('on', st === 'start');
        btn.textContent = st === 'start' ? '⏺ מקליט' : '🎤';
        if (st === 'error' && toast) toast(msg, 'err');
      }
    });
  });
  return btn;
}
