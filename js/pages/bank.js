/* ============================================================
   bank.js — המסך של בנק השוטים והתבניות
   ------------------------------------------------------------
   עמוד אחד, שתי לשוניות. שוטים ותבניות הם אותה תנועה — "מה
   שכבר עבד, מוכן לשימוש חוזר" — ושני עמודים נפרדים היו אומרים
   שצריך לזכור באיזה מהם חיפשת.

   הכפתור המרכזי בכל שורה הוא "השתמשתי בזה". הוא מה שממלא את
   הבנק בעצמו: ברגע שהוא מחובר לטיימר, כל שימוש נרשם על ההפקה
   הנכונה בלי שאלה אחת.
   ============================================================ */

import { getItem, removeItem } from '../store.js';
import { el, toast, modal, closeModal, input, textarea, select, field, confirmBox, ago } from '../util.js';
import { refresh, openItem } from '../app.js';
import { hintBadge } from '../help.js';
import { tagField } from '../tagfield.js';
import * as B from '../bank.js';
import * as P from '../production.js';

export default { render };

let tab = 'shot';
const q = { text: '', type: '', tag: '' };

function render(root, params = {}) {
  if (params.tab === 'template' || params.tab === 'shot') tab = params.tab;
  if (params.tag) q.tag = params.tag;

  const isShot = tab === 'shot';

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'בנק'),
    el('div', { class: 'desc' },
      'מה שכבר עבד, מוכן לשימוש חוזר. לא הקבצים — האינדקס אליהם.',
      hintBadge('bank.what')),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-sm ' + (isShot ? 'btn-y' : ''),
        onclick: () => { tab = 'shot'; q.type = ''; refresh(); }
      }, 'שוטים · ' + B.shots().length),
      el('button', {
        class: 'btn btn-sm ' + (!isShot ? 'btn-y' : ''),
        onclick: () => { tab = 'template'; q.type = ''; refresh(); }
      }, 'תבניות · ' + B.templates().length)
    )
  ));

  root.append(isShot ? quickAddShot() : quickAddTemplate());

  /* המסננים והרשימה מצטיירים מחדש בלי לרנדר את העמוד: הקלדה
     בשורת החיפוש שמאבדת את המיקוד היא שורת חיפוש שאי אפשר
     להקליד בה. רק שינוי נתונים קורא ל-refresh. */
  const sub = el('span', { class: 'sub' });
  const body = el('div', {});
  const card = el('div', { class: 'card', style: { marginTop: '14px' } },
    el('div', { class: 'card-h' }, el('h3', {}, isShot ? 'שוטים' : 'תבניות'), sub),
    body);

  const drawList = () => {
    const list = B.query(tab, q);
    sub.textContent = list.length + ' · ממוין לפי מה שנגעת בו לאחרונה';
    body.innerHTML = '';
    if (!list.length) body.append(el('div', { class: 'empty' },
      B.allOf(tab).length
        ? 'אין התאמה. נסה תגית אחרת או נקה את המסננים.'
        : isShot
          ? 'ריק. הדבק לינק מהדרייב למעלה, תן תגית אחת, וזהו — אפשר להשלים פרטים אחר כך.'
          : 'ריק. תבנית היא מה שלמדת על תחום: איזו זווית עבדה, מה אסור להגיד, ומה נכשל.'));
    list.forEach(it => body.append(isShot ? shotRow(it) : templateRow(it)));
  };

  root.append(filters(isShot, drawList));
  root.append(card);
  drawList();
}

/* ============================================================
   הוספה מהירה — לינק ותגיות, בלי טופס
   ============================================================ */

function quickAddShot() {
  const fU = input({ placeholder: 'הדבק לינק מהדרייב', dir: 'ltr' });
  const tags = tagField([], { placeholder: 'תגיות (מוסך, לילה…)' });
  const fT = select(Object.entries(B.SHOT_TYPES).map(([v, o]) => ({ value: v, label: o.icon + ' ' + o.name })), 'char',
    { style: { width: 'auto' } });

  const go = () => {
    const out = B.quickAddShot({ url: fU.value, tags: tags.get(), shotType: fT.value });
    if (out.error) { toast(out.error, 'err'); return; }
    toast('נוסף — ' + out.item.title, 'ok');
    refresh();
  };
  fU.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });

  return el('div', { class: 'card bank-quick' },
    el('div', { class: 'bank-quick-in' }, fU),
    el('div', { class: 'bank-quick-in' }, tags.node),
    fT,
    el('button', { class: 'btn btn-y', onclick: go }, '+ הוסף'),
    el('button', {
      class: 'btn', 'data-tip': 'bank.full',
      onclick: () => shotForm(null, { url: fU.value, tags: tags.get(), shotType: fT.value })
    }, 'עם פרומפט')
  );
}

function quickAddTemplate() {
  const fD = input({ placeholder: 'תחום — מוסכים, מספרות, מרפאות שיניים…' });
  const tags = tagField([], { placeholder: 'תגיות' });

  const go = () => {
    const out = B.quickAddTemplate({ domain: fD.value, tags: tags.get() });
    if (out.error) { toast(out.error, 'err'); return; }
    toast('נוספה תבנית ל' + out.item.domain, 'ok');
    refresh();
  };
  fD.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });

  return el('div', { class: 'card bank-quick' },
    el('div', { class: 'bank-quick-in' }, fD),
    el('div', { class: 'bank-quick-in' }, tags.node),
    el('button', { class: 'btn btn-y', onclick: go }, '+ הוסף'),
    el('button', { class: 'btn', onclick: () => templateForm() }, 'עם תוכן')
  );
}

/* ============================================================
   מסננים
   ============================================================ */

/* לחיצה על תגית בתוך שורה — הפונקציה נקבעת ברינדור, כדי
   שהשורה לא תצטרך להכיר את המסננים */
let onTagPick = () => refresh();

function filters(isShot, drawList) {
  const box = el('div', { class: 'bank-filters' });

  const fQ = input({ placeholder: 'חפש — תגית, שם, טקסט מהפרומפט', value: q.text });
  let t = null;
  fQ.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { q.text = fQ.value; drawList(); }, 220);
  });
  box.append(fQ);

  const typeChips = el('div', { class: 'bank-chips' });
  const tagChipsBox = el('div', { class: 'bank-chips' });

  const drawChips = () => {
    if (isShot) {
      typeChips.innerHTML = '';
      typeChips.append(el('button', {
        class: 'tag-pill sm' + (!q.type ? ' on' : ''),
        onclick: () => { q.type = ''; drawChips(); drawList(); }
      }, 'הכל'));
      Object.entries(B.SHOT_TYPES).forEach(([k, o]) => typeChips.append(el('button', {
        class: 'tag-pill sm' + (q.type === k ? ' on' : ''),
        style: q.type === k ? { background: o.color, color: '#000', borderColor: o.color } : { borderColor: o.color + '55' },
        onclick: () => { q.type = q.type === k ? '' : k; drawChips(); drawList(); }
      }, o.icon + ' ' + o.name)));
    }

    tagChipsBox.innerHTML = '';
    const tags = B.bankTags().slice(0, 12);
    if (!tags.length) return;
    tagChipsBox.append(el('span', { class: 'small muted' }, 'תגיות:'));
    tags.forEach(x => tagChipsBox.append(el('button', {
      class: 'tag-pill sm' + (q.tag === x.name ? ' on' : ''),
      onclick: () => { q.tag = q.tag === x.name ? '' : x.name; drawChips(); drawList(); }
    }, '#' + x.name, el('span', { class: 'muted' }, String(x.count)))));
    if (q.tag) tagChipsBox.append(el('button', {
      class: 'btn btn-xs', onclick: () => { q.tag = ''; drawChips(); drawList(); }
    }, 'נקה'));
  };

  box.append(typeChips, tagChipsBox);
  drawChips();
  // לחיצה על תגית בשורה מסננת — והשורה צריכה לדעת לצייר מחדש
  onTagPick = () => { drawChips(); drawList(); };
  return box;
}

/* ============================================================
   שורת שוט
   ============================================================ */

function useLine(it) {
  const n = B.useCount(it.id);
  if (!n) return 'עוד לא היה בשימוש';
  return n + (n === 1 ? ' שימוש' : ' שימושים') + ' · אחרון ' + ago(B.lastUsedAt(it.id));
}

/** "השתמשתי בזה" — הכפתור שממלא את הבנק בעצמו */
function useBtn(it, { copy = false } = {}) {
  return el('button', {
    class: 'btn btn-xs ' + (copy ? '' : 'btn-y'),
    'data-tip': copy ? 'bank.copy' : 'bank.use',
    onclick: async () => {
      if (copy) {
        try { await navigator.clipboard.writeText(it.prompt || ''); }
        catch { showPrompt(it); }
      }
      const out = B.markUsed(it.id);
      if (!out.ok) { toast('לא נמצא', 'err'); return; }
      const where = out.target ? ' על ' + (out.target.type === 'production' ? P.label(out.target) : out.target.title) : '';
      toast((copy ? 'הועתק ונרשם' : 'נרשם שימוש') + where +
        (out.target ? '' : ' · אין טיימר רץ, אז זה לא שויך לסרטון'), 'ok');
      refresh();
    }
  }, copy ? '⧉ העתק פרומפט' : '✓ השתמשתי בזה');
}

function tagChips(it) {
  return (it.tags || []).map(t => el('button', {
    class: 'pill', style: { cursor: 'pointer' },
    onclick: () => { q.tag = q.tag === t ? '' : t; onTagPick(); }
  }, '#' + t));
}

function shotRow(it) {
  const m = B.shotMeta(it.shotType);
  const node = el('div', { class: 'bank-row' });

  node.append(el('span', {
    class: 'bank-ic', style: { background: m.color + '22', color: m.color }, title: m.name
  }, m.icon));

  const mid = el('div', { style: { flex: 1, minWidth: 0 } });
  mid.append(el('div', { style: { fontWeight: '600', cursor: 'pointer' }, onclick: () => shotForm(it) }, it.title));
  mid.append(el('div', { class: 'small muted', style: { marginTop: '2px' } }, m.name + ' · ' + useLine(it)));
  if (it.prompt) mid.append(el('div', { class: 'bank-prompt', onclick: () => showPrompt(it) }, it.prompt));
  if (!it.prompt) mid.append(el('div', { class: 'small', style: { color: 'var(--t3)', marginTop: '4px' } },
    'בלי פרומפט — ' , el('button', { class: 'btn btn-xs', onclick: () => shotForm(it) }, 'הוסף')));

  const chips = tagChips(it);
  if (chips.length) mid.append(el('div', { class: 'bank-tags' }, ...chips));
  node.append(mid);

  const acts = el('div', { class: 'bank-acts' });
  acts.append(useBtn(it));
  if (it.prompt) acts.append(useBtn(it, { copy: true }));
  if (it.url) acts.append(el('a', { class: 'btn btn-xs', href: it.url, target: '_blank', rel: 'noopener' }, '↗ פתח'));
  acts.append(el('button', { class: 'btn btn-xs', title: 'עריכה', onclick: () => shotForm(it) }, '✎'));
  acts.append(delBtn(it));
  node.append(acts);
  return node;
}

/* ============================================================
   שורת תבנית
   ============================================================ */

const SECTIONS = [
  ['angles',    'זוויות שעבדו',   ''],
  ['analogies', 'אנלוגיות',       ''],
  ['avoid',     'מה אסור להגיד',  'warn'],
  ['failed',    'מה נכשל',        'warn']
];

function templateRow(it) {
  const node = el('div', { class: 'bank-row col' });

  const head = el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } });
  head.append(el('span', { class: 'bank-ic', style: { background: 'rgba(240,171,252,.14)', color: '#f0abfc' } }, '📐'));
  const mid = el('div', { style: { flex: 1, minWidth: 0 } },
    el('div', { style: { fontWeight: '600', cursor: 'pointer' }, onclick: () => templateForm(it) }, it.title),
    el('div', { class: 'small muted', style: { marginTop: '2px' } },
      (it.domain && it.domain !== it.title ? it.domain + ' · ' : '') + useLine(it)));
  const chips = tagChips(it);
  if (chips.length) mid.append(el('div', { class: 'bank-tags' }, ...chips));
  head.append(mid);

  const acts = el('div', { class: 'bank-acts' });
  acts.append(useBtn(it));
  acts.append(el('button', { class: 'btn btn-xs', title: 'עריכה', onclick: () => templateForm(it) }, '✎'));
  acts.append(delBtn(it));
  head.append(acts);
  node.append(head);

  const filled = SECTIONS.filter(([k]) => (it[k] || '').trim());
  if (!filled.length) {
    node.append(el('div', { class: 'small muted', style: { marginTop: '8px' } },
      'ריקה. ',
      el('button', { class: 'btn btn-xs', onclick: () => templateForm(it) }, 'מלא מה שכבר למדת על התחום')));
  }
  filled.forEach(([k, label, cls]) => {
    const sec = el('div', { class: 'bank-sec' + (cls ? ' ' + cls : '') });
    sec.append(el('div', { class: 'bank-sec-h' }, label));
    String(it[k]).split('\n').map(x => x.trim()).filter(Boolean)
      .forEach(line => sec.append(el('div', { class: 'bank-line' }, line)));
    node.append(sec);
  });

  return node;
}

/* ============================================================
   פעולות משותפות
   ============================================================ */

function delBtn(it) {
  return el('button', {
    class: 'btn btn-xs btn-danger', title: 'מחק',
    'data-tip': 'מוחק לגמרי. הקובץ בדרייב לא נוגע — רק השורה כאן. Ctrl+Z מחזיר.',
    onclick: () => confirmBox('למחוק את "' + (it.title || 'הפריט') + '"? הקובץ בדרייב יישאר.', () => {
      removeItem(it.id); toast('נמחק. Ctrl+Z מחזיר.', 'ok'); refresh();
    })
  }, '🗑');
}

function showPrompt(it) {
  modal({
    title: it.title,
    body: el('div', {},
      el('div', { class: 'small muted', style: { marginBottom: '8px' } },
        'הפרומפט שיצר את זה · ' + (it.prompt || '').length + ' תווים'),
      el('pre', { class: 'brief-raw' }, it.prompt || '')),
    actions: ['spacer', { label: 'סגור' }]
  });
}

function usesBlock(it) {
  const list = B.usesOf(it.id).slice().sort((a, b) => b.at - a.at);
  const box = el('div', {});
  box.append(el('div', { class: 'bank-sec-h' }, 'איפה זה כבר עבד'));
  if (!list.length) {
    box.append(el('div', { class: 'small muted' },
      'עוד לא נרשם שימוש. "השתמשתי בזה" בזמן שרץ טיימר על הפקה — והשורה תיכתב לבד.'));
    return box;
  }
  list.slice(0, 12).forEach(u => {
    const t = u.itemId ? getItem(u.itemId) : null;
    box.append(el('div', { class: 'bank-line' },
      t
        ? el('button', { class: 'btn btn-xs', onclick: () => { closeModal(); openItem(t.id); } },
          t.type === 'production' ? P.label(t) : t.title)
        : el('span', { class: 'muted' }, 'בלי שיוך'),
      el('span', { class: 'small muted', style: { marginInlineStart: '8px' } }, ago(u.at))));
  });
  box.append(el('button', {
    class: 'btn btn-xs', style: { marginTop: '8px' },
    onclick: () => { if (B.undoLastUse(it.id)) { toast('השימוש האחרון בוטל'); closeModal(); refresh(); } }
  }, 'בטל את השימוש האחרון'));
  return box;
}

/* ============================================================
   טופס שוט
   ============================================================ */

function shotForm(existing, seed = {}) {
  const it = existing || {};
  const fT = input({ value: it.title || '', placeholder: 'שם הקובץ — כדי למצוא אותו גם אם הלינק נשבר' });
  const fU = input({ value: it.url || seed.url || '', placeholder: 'https://drive.google.com/…', dir: 'ltr' });
  const fType = select(Object.entries(B.SHOT_TYPES).map(([v, o]) => ({ value: v, label: o.icon + ' ' + o.name })),
    it.shotType || seed.shotType || 'char');
  const tags = tagField(it.tags || seed.tags || []);
  const fP = textarea({ rows: 7, placeholder: 'הפרומפט המדויק שיצר את השוט' });
  fP.value = it.prompt || '';
  const fN = textarea({ rows: 2, placeholder: 'מה חשוב לזכור עליו' });
  fN.value = it.note || '';

  /* מונה תווים שמוצג תמיד. תקרה שמגלים אותה רק כשנחתכים היא
     תקרה שמאבדת טקסט. */
  const counter = el('div', { class: 'small muted' });
  const drawCount = () => {
    const n = fP.value.length;
    counter.textContent = n + ' / ' + B.PROMPT_MAX + ' תווים' + (n > B.PROMPT_MAX ? ' · העודף לא יישמר' : '');
    counter.style.color = n > B.PROMPT_MAX ? 'var(--red)' : (n > B.PROMPT_MAX * 0.9 ? 'var(--yellow)' : '');
  };
  fP.addEventListener('input', drawCount);
  drawCount();

  modal({
    title: existing ? 'עריכת שוט' : 'שוט חדש',
    wide: true,
    body: el('div', {},
      field('שם', fT),
      el('div', { class: 'row' }, field('לינק', fU), field('סוג', fType)),
      field(el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'תגיות', hintBadge('bank.tags')),
        tags.node, 'לפי מה תחפש בעוד חצי שנה — תחום, מצב תאורה, סגנון'),
      field(el('span', { style: { display: 'inline-flex', alignItems: 'center' } }, 'הפרומפט', hintBadge('bank.prompt')),
        fP),
      counter,
      field('הערה', fN),
      existing ? el('div', { class: 'hr' }) : null,
      existing ? usesBlock(it) : null
    ),
    actions: [
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const data = {
            title: fT.value, url: fU.value, shotType: fType.value,
            tags: tags.get(), prompt: fP.value, note: fN.value
          };
          if (existing) B.save(existing.id, data);
          else B.addShot(data);
          if (fP.value.length > B.PROMPT_MAX) toast('הפרומפט נחתך ל-' + B.PROMPT_MAX + ' תווים', 'err');
          else toast('נשמר', 'ok');
          refresh();
        }
      }
    ]
  });
}

/* ============================================================
   טופס תבנית
   ============================================================ */

function templateForm(existing) {
  const it = existing || {};
  const fD = input({ value: it.domain || '', placeholder: 'מוסכים' });
  const fT = input({ value: it.title || '', placeholder: 'שם התבנית — ריק יקבל את שם התחום' });
  const tags = tagField(it.tags || []);
  const areas = {};
  SECTIONS.forEach(([k, label]) => {
    const ta = textarea({ rows: 3, placeholder: 'שורה לכל דבר' });
    ta.value = it[k] || '';
    areas[k] = { ta, label };
  });

  modal({
    title: existing ? 'עריכת תבנית' : 'תבנית חדשה',
    wide: true,
    body: el('div', {},
      el('div', { class: 'row' }, field('תחום', fD), field('שם', fT)),
      field('תגיות', tags.node),
      ...SECTIONS.map(([k, label]) => field(label, areas[k].ta,
        k === 'avoid' ? 'מה שמוריד אמון בתחום הזה' : k === 'failed' ? 'מה שכבר ניסית ולא עבד' : '')),
      existing ? el('div', { class: 'hr' }) : null,
      existing ? usesBlock(it) : null
    ),
    actions: [
      { label: 'ביטול' },
      {
        label: 'שמור', cls: 'btn-y', onClick: () => {
          const data = {
            domain: fD.value, title: fT.value.trim() || fD.value, tags: tags.get()
          };
          SECTIONS.forEach(([k]) => data[k] = areas[k].ta.value);
          if (existing) B.save(existing.id, data);
          else B.addTemplate(data);
          toast('נשמר', 'ok'); refresh();
        }
      }
    ]
  });
}
