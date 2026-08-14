/* ============================================================
   notify.js — התראות דפדפן
   עובד רק כשהדפדפן פתוח ברקע. אנחנו אומרים את זה בממשק בפירוש.
   ============================================================ */

import { S, update } from './store.js';
import { MIN, HOUR, toast } from './util.js';
import { runRules } from './rules.js';

const SEEN_KEY = 'front.notified';
let timer = null;

export const supported = () => 'Notification' in window;
export const permission = () => supported() ? Notification.permission : 'unsupported';

export async function requestPermission() {
  if (!supported()) { toast('הדפדפן הזה לא תומך בהתראות', 'err'); return 'unsupported'; }
  const p = await Notification.requestPermission();
  update(s => { s.settings.notifications.enabled = p === 'granted'; });
  toast(p === 'granted' ? 'התראות אושרו' : 'ההתראות נשארו כבויות', p === 'granted' ? 'ok' : 'err');
  return p;
}

function seen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; }
}
function markSeen(id) {
  const s = seen(); s[id] = Date.now();
  localStorage.setItem(SEEN_KEY, JSON.stringify(s));
}

const CATEGORY = id =>
  id.startsWith('leads') ? 'lead'
  : id.startsWith('due_') ? 'deadline'
  : id.startsWith('routines') ? 'routine'
  : id.startsWith('decisions') ? 'decision'
  : id.startsWith('timer') ? 'timer'
  : null;

function fire(title, body, tag) {
  try {
    const n = new Notification(title, {
      body, tag, dir: 'rtl', lang: 'he',
      icon: 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0a09"/><path d="M18 48V16h28v7.2H27.2v6.2h17.2v7.2H27.2V48z" fill="#ffd400"/></svg>`)
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { console.warn('התראה נכשלה', e); }
}

/** סורק את מנוע הכללים ומוציא רק מה שרלוונטי ולא נשלח לאחרונה */
export function scan() {
  const st = S().settings.notifications;
  if (!st.enabled || permission() !== 'granted') return;
  const sn = seen();
  const alerts = runRules();

  alerts.forEach(a => {
    const cat = CATEGORY(a.id);
    if (!cat || !st[cat]) return;
    if (a.level !== 'bad' && a.level !== 'warn') return;
    const last = sn[a.id] || 0;
    const cooldown = cat === 'timer' ? 60 * MIN : 3 * HOUR;
    if (Date.now() - last < cooldown) return;
    fire('פרונט', a.text, a.id);
    markSeen(a.id);
  });
}

export function start() {
  clearInterval(timer);
  timer = setInterval(scan, 5 * MIN);
  setTimeout(scan, 8000);
}

export function testNotification() {
  if (permission() !== 'granted') { toast('צריך לאשר התראות קודם', 'err'); return; }
  fire('פרונט', 'זו התראת בדיקה. אם ראית אותה — הכל עובד.', 'test');
}
