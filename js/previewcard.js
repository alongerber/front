/* ============================================================
   previewcard.js — הרכיב שמציג תצוגה מקדימה של לינק
   משמש בעמוד ידע, בפנקס ובכרטיס הפריט. אותו מראה בכל מקום.
   ============================================================ */

import { el, toast } from './util.js';
import * as LP from './linkpreview.js';
import * as A from './attachments.js';
import { S, getItem } from './store.js';

/**
 * מחזיר אלמנט שמציג את הלינק. אם עוד אין תצוגה מקדימה — מושך אותה
 * ברקע ומעדכן את עצמו כשהיא מגיעה.
 * opts.compact — שורה אחת בלי תמונה, למקומות צפופים
 * opts.onDone  — נקרא אחרי שנמשכה תצוגה, כדי לרענן מונים
 */
export function previewCard(itemId, opts = {}) {
  const box = el('div', { class: 'lp' + (opts.compact ? ' compact' : '') });
  draw(box, itemId, opts);
  return box;
}

function draw(box, itemId, opts) {
  const it = getItem(itemId);
  box.innerHTML = '';
  if (!it || !it.url) return;

  const p = it.preview;

  /* עוד לא נמשך — מושכים ברקע ומציגים שלד */
  if (!p) {
    box.append(skeleton(it));
    if (S().settings.linkPreview) {
      LP.fetchPreview(itemId).then(() => { draw(box, itemId, opts); opts.onDone && opts.onDone(); });
    } else {
      box.innerHTML = '';
      box.append(bare(it, opts));
    }
    return;
  }

  if (p.failed) { box.append(bare(it, opts, p)); return; }

  const a = el('a', {
    class: 'lp-card', href: it.url, target: '_blank', rel: 'noopener',
    title: it.url
  });

  if (!opts.compact && (p.imageId || p.imageUrl)) {
    const img = el('img', { class: 'lp-img', alt: '', loading: 'lazy' });
    if (p.imageId) A.blobUrl(p.imageId).then(u => { if (u) img.src = u; else if (p.imageUrl) img.src = p.imageUrl; });
    else img.src = p.imageUrl;
    a.append(img);
  }

  const body = el('div', { class: 'lp-body' });
  body.append(el('div', { class: 'lp-site' },
    p.kind === 'video' ? '▶ ' : '',
    p.site || p.host || '',
    p.author ? ' · ' + p.author : ''));
  if (p.title) body.append(el('div', { class: 'lp-title' }, p.title));

  const text = p.summary || p.desc;
  if (text) body.append(el('div', { class: 'lp-desc' + (p.summary ? ' is-summary' : '') },
    p.summary ? '✦ ' + text : text));

  a.append(body);
  box.append(a);

  if (!opts.compact) box.append(el('div', { class: 'lp-acts' },
    el('button', {
      class: 'btn btn-xs', 'data-tip': 'מושך מחדש את הכותרת, התיאור והתמונה מהדף',
      onclick: async e => {
        e.preventDefault();
        await LP.dropPreviewImage(itemId);
        box.innerHTML = ''; box.append(skeleton(it));
        await LP.fetchPreview(itemId, { force: true });
        draw(box, itemId, opts);
        opts.onDone && opts.onDone();
      }
    }, '↻ רענן'),
    el('button', {
      class: 'btn btn-xs', 'data-tip': 'מעתיק את הכתובת ללוח',
      onclick: e => {
        e.preventDefault();
        navigator.clipboard.writeText(it.url).then(() => toast('הועתק', 'ok')).catch(() => toast('נכשל', 'err'));
      }
    }, 'העתק לינק')
  ));
}

function skeleton(it) {
  return el('div', { class: 'lp-card lp-skel' },
    el('div', { class: 'lp-body' },
      el('div', { class: 'lp-site' }, host(it.url)),
      el('div', { class: 'lp-title muted' }, 'מושך תצוגה מקדימה…')));
}

/** אין תצוגה — לפחות כתובת קריאה */
function bare(it, opts, p) {
  const wrap = el('div', {});
  wrap.append(el('a', {
    class: 'lp-card lp-bare', href: it.url, target: '_blank', rel: 'noopener'
  },
    el('div', { class: 'lp-body' },
      el('div', { class: 'lp-site' }, host(it.url)),
      el('div', { class: 'lp-title' }, it.title || it.url))));

  if (p && p.failed && !opts.compact) wrap.append(el('div', { class: 'small muted', style: { marginTop: '4px' } },
    'לא הצלחתי למשוך תצוגה מקדימה. ',
    el('a', {
      style: { cursor: 'pointer' },
      onclick: async e => {
        e.preventDefault();
        await LP.fetchPreview(it.id, { force: true });
        toast('ניסיתי שוב');
      }
    }, 'נסה שוב')));
  return wrap;
}

function host(url) {
  try { return new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}
