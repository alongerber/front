/* ============================================================
   sw.js — Service Worker
   קיים בשביל דבר אחד עיקרי: התראה עם כפתורי תשובה בתוכה.
   התראה רגילה (new Notification) לא תומכת בכפתורים; רק התראה
   שמוקפצת מ-Service Worker כן. זה מה שמאפשר לענות על דגימת זמן
   מתוך וגאס, בלי לעבור לדפדפן.

   בנוסף — מטמון בסיסי, כדי שהמערכת תיפתח גם בלי רשת.
   ============================================================ */

const CACHE = 'front-v6';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/util.js', './js/timer.js',
  './js/brain.js', './js/rules.js', './js/help.js', './js/capture.js',
  './js/sampling.js', './js/sampleui.js', './js/search.js', './js/notify.js',
  './js/presence.js', './js/floatwin.js', './js/money.js', './js/links.js',
  './js/mentions.js', './js/voice.js', './js/linkpreview.js', './js/previewcard.js',
  './js/attachments.js', './js/autobackup.js', './js/timecheck.js', './js/palette.js', './js/api.js',
  './js/onboarding.js', './js/sync.js', './js/tour.js', './js/brief.js', './js/knowhow.js', './js/delivery.js',
  './js/pages/quick.js', './js/pages/home.js', './js/pages/guide.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => { }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* רשת קודם, מטמון כגיבוי. המערכת משתנה הרבה — לא רוצים לתת קוד ישן. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { });
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

/* ---------- דגימות זמן ---------- */

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'sample-ask') return;
  const { id, title, body, actions } = d;
  self.registration.showNotification(title || 'פרונט', {
    body: body || 'מה אתה עושה עכשיו?',
    tag: 'front-sample',
    renotify: true,
    requireInteraction: true,        // נשארת עד שעונים, לא נעלמת אחרי 5 שניות
    dir: 'rtl', lang: 'he',
    data: { kind: 'sample', id },
    actions: (actions || []).slice(0, 2),
    icon: iconUrl(), badge: iconUrl()
  });
});

function iconUrl() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#0a0a09"/>' +
    '<path d="M18 48V16h28v7.2H27.2v6.2h17.2v7.2H27.2V48z" fill="#ffd400"/></svg>');
}

self.addEventListener('notificationclick', e => {
  const data = e.notification.data || {};
  e.notification.close();
  if (data.kind !== 'sample') { e.waitUntil(focusApp()); return; }

  const payload = { type: 'sample-answer', id: data.id, action: e.action || null };

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) {
      all.forEach(c => c.postMessage(payload));
      // לחיצה על גוף ההתראה (בלי כפתור) — פותחים את החלון כדי לבחור מהרשימה
      if (!e.action) { try { await all[0].focus(); } catch { /* אין הרשאה */ } }
      return;
    }
    // אין חלון פתוח — פותחים אחד ומעבירים את התשובה ב-URL
    const q = `?sample=${encodeURIComponent(data.id)}&a=${encodeURIComponent(e.action || '')}`;
    await self.clients.openWindow('./' + q + '#/time');
  })());
});
