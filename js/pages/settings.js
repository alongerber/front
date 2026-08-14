/* ============================================================
   settings.js — הגדרות, גיבוי, התראות, סוגי פריטים
   ============================================================ */

import { S, update, uid, downloadBackup, importJSON, exportJSON, resetAll, loadSample, liveAttachmentIds } from '../store.js';
import { el, ago, toast, modal, input, select, field, confirmBox, dur, num, DAY } from '../util.js';
import * as A from '../attachments.js';
import * as notify from '../notify.js';
import { lineEditor } from './pipeline.js';
import { refresh } from '../app.js';

export default { render };

function render(root) {
  const s = S();

  root.append(el('div', { class: 'page-h' },
    el('h1', {}, 'הגדרות'),
    el('div', { class: 'desc' }, 'הכל ניתן לשינוי — המערכת עובדת בשבילך')
  ));

  root.append(el('div', { class: 'grid g2' },
    el('div', {}, backupCard(), notifyCard()),
    el('div', {}, generalCard(), typesCard(), dangerCard())
  ));
}

/* ================= גיבוי ================= */

function backupCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'גיבוי — קרא את זה'),
    el('span', { class: 'sub' }, 'שיטת המעבר בין מכשירים היחידה')));

  card.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '13px' } },
    'כל הנתונים יושבים ב-localStorage של הדפדפן הזה בלבד. ניקוי היסטוריה, החלפת מחשב, או מצב גלישה פרטית — והכל נעלם. ' +
    'ייצוא JSON הוא הגיבוי היחיד, והוא גם הדרך להעביר את המערכת למכשיר אחר: מייצאים כאן, מייבאים שם.'));

  const last = s.settings.lastBackupAt;
  const overdue = last ? (Date.now() - last > (s.settings.autoBackupDays || 3) * DAY) : true;
  card.append(el('div', { class: 'alert ' + (overdue ? 'warn' : 'good'), style: { marginBottom: '13px' } },
    last ? `גיבוי אחרון לפני ${ago(last)}` : 'עוד לא גיבית אף פעם'));

  const file = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  file.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    confirmBox(`לייבא את "${f.name}"? כל מה שיש עכשיו במערכת יוחלף.`, async () => {
      try {
        const parsed = JSON.parse(text);
        const files = parsed._files;
        delete parsed._files;
        if (files) {
          const n = await A.importAll(files);
          if (n) toast(`שוחזרו ${n} קבצים`, 'ok');
        }
        importJSON(JSON.stringify(parsed));
        toast('יובא בהצלחה', 'ok');
        refresh();
      }
      catch (err) { toast('ייבוא נכשל: ' + err.message, 'err'); }
    }, 'כן, החלף הכל');
    file.value = '';
  });

  /* קבצים מצורפים — נכנסים לגיבוי רק אם מסמנים, כי הם מנפחים אותו */
  const attIds = liveAttachmentIds();
  const withFiles = el('input', {
    type: 'checkbox', checked: attIds.length > 0,
    style: { width: '15px', height: '15px', accentColor: '#ffd400', cursor: 'pointer' }
  });

  const exportNow = async () => {
    if (!withFiles.checked || !attIds.length) {
      const n = downloadBackup(); toast('ירד ' + n, 'ok'); refresh(); return;
    }
    toast('אורז גם את הקבצים…');
    try {
      const obj = JSON.parse(exportJSON());
      obj._files = await A.exportAll(attIds);
      const d = new Date();
      const name = `front-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-full.json`;
      const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      update(st => { st.settings.lastBackupAt = Date.now(); });
      toast(`ירד ${name} · ${A.fmtSize(blob.size)}`, 'ok');
      refresh();
    } catch (err) { toast('הייצוא נכשל: ' + err.message, 'err'); }
  };

  card.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
    el('button', { class: 'btn btn-y', onclick: exportNow }, '⬇ ייצוא גיבוי JSON'),
    el('button', { class: 'btn', onclick: () => file.click() }, '⬆ ייבוא מקובץ'),
    el('button', {
      class: 'btn', onclick: () => {
        navigator.clipboard.writeText(exportJSON())
          .then(() => toast('הכל הועתק ללוח', 'ok'))
          .catch(() => toast('העתקה נכשלה', 'err'));
      }
    }, 'העתק ללוח'),
    file
  ));

  card.append(el('label', {
    class: 'chk', style: { marginTop: '11px' },
    'data-tip': 'תמונות ומסמכים מהפנקס יושבים במקום נפרד בדפדפן ולא נכנסים לגיבוי הרגיל. סימון כאן אורז אותם לתוך אותו קובץ — הוא יוצא גדול בהרבה.'
  }, withFiles,
    el('span', {}, attIds.length
      ? `כלול גם את הקבצים מהפנקס (${attIds.length})`
      : 'כלול גם את הקבצים מהפנקס — אין קבצים כרגע')));

  const days = input({ type: 'number', min: 1, max: 30, value: s.settings.autoBackupDays || 3 });
  days.addEventListener('change', () => { update(st => { st.settings.autoBackupDays = Number(days.value) || 3; }); refresh(); });
  card.append(el('div', { style: { marginTop: '13px' } },
    field('תזכורת גיבוי כל כמה ימים', days, 'המערכת תזכיר לך בבית ובתפריט')));

  card.append(el('div', { class: 'small muted', style: { marginTop: '4px' } },
    'טיפ: שמור את קובץ הגיבוי בדרייב או בוואטסאפ לעצמך. זה לוקח 10 שניות ומציל חודש עבודה.'));

  // קובץ דוגמה
  card.append(el('div', { class: 'hr' }));
  card.append(el('div', { class: 'small muted', style: { marginBottom: '7px' } },
    'רוצה לראות איך זה נראה מלא לפני שאתה מזין משהו?'));
  card.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
    el('button', {
      class: 'btn btn-sm', onclick: () => {
        confirmBox('לטעון נתוני דוגמה? כל מה שיש עכשיו יוחלף. (הנתונים מומצאים — למחוק אחרי שהסתכלת.)', async () => {
          try {
            const r = await fetch('./sample-data.json');
            const j = await r.json();
            loadSample(j);
            toast('נטענו נתוני דוגמה', 'ok');
            location.hash = '#/'; refresh();
          } catch (err) { toast('טעינת הדוגמה נכשלה: ' + err.message, 'err'); }
        }, 'כן, טען דוגמה');
      }
    }, 'טען נתוני דוגמה'),
    el('a', { class: 'btn btn-sm', href: './sample-data.json', download: 'front-sample.json' }, 'הורד את קובץ הדוגמה')
  ));
  return card;
}

/* ================= התראות ================= */

function notifyCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  const perm = notify.permission();

  card.append(el('div', { class: 'card-h' }, el('h3', {}, 'התראות')));
  card.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '12px' } },
    'ההתראות הן התראות דפדפן. הן עובדות רק כשהדפדפן פתוח — גם אם החלון ממוזער או בטאב אחר. ' +
    'אם סגרת את הדפדפן לגמרי, לא תקבל כלום. זו מגבלה של הטכנולוגיה, לא באג.'));

  card.append(el('div', { class: 'alert ' + (perm === 'granted' ? 'good' : perm === 'denied' ? 'bad' : ''), style: { marginBottom: '12px' } },
    perm === 'granted' ? 'ההרשאה ניתנה — ההתראות פעילות'
      : perm === 'denied' ? 'חסמת התראות בדפדפן. צריך לפתוח את הגדרות האתר בדפדפן ולאפשר.'
        : perm === 'unsupported' ? 'הדפדפן הזה לא תומך בהתראות'
          : 'עוד לא ביקשנו הרשאה'));

  card.append(el('div', { style: { display: 'flex', gap: '7px', marginBottom: '13px', flexWrap: 'wrap' } },
    el('button', { class: 'btn btn-y', onclick: async () => { await notify.requestPermission(); refresh(); } }, 'אשר התראות'),
    el('button', { class: 'btn', onclick: () => notify.testNotification() }, 'שלח התראת בדיקה')
  ));

  const opts = [
    ['lead', 'ליד ללא מענה'],
    ['deadline', 'דדליין מתקרב'],
    ['routine', 'שגרה שהגיע זמנה'],
    ['decision', 'החלטה פתוחה שיושבת יותר מדי'],
    ['timer', 'טיימר רץ יותר מדי בלי מגע'],
    ['note', 'תזכורת שקבעת על פתק בפנקס']
  ];
  opts.forEach(([k, label]) => {
    const cb = el('input', {
      type: 'checkbox', checked: !!s.settings.notifications[k],
      style: { width: '16px', height: '16px', accentColor: '#ffd400', cursor: 'pointer' },
      onchange: e => update(st => { st.settings.notifications[k] = e.target.checked; })
    });
    card.append(el('label', { class: 'chk' }, cb, el('span', {}, label)));
  });

  card.append(el('div', { class: 'hr' }));
  const rows = [
    ['leadSlaMinutes', 'ליד ללא מענה אחרי (דקות)', 5, 1440],
    ['timerNudgeHours', 'טיימר רץ יותר מ (שעות)', 1, 12],
    ['decisionStaleDays', 'החלטה נחשבת תקועה אחרי (ימים)', 1, 60],
    ['idleAskMinutes', 'שואלים "איפה היית" אחרי (דקות)', 1, 60],
    ['longAbsenceHours', 'עוצרים טיימר לבד אחרי (שעות)', 1, 12]
  ];
  rows.forEach(([key, label, min, max]) => {
    const i = input({ type: 'number', min, max, value: s.settings[key] });
    i.addEventListener('change', () => update(st => { st.settings[key] = Number(i.value) || st.settings[key]; }));
    card.append(field(label, i));
  });
  return card;
}

/* ================= כללי ================= */

function generalCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' }, el('h3', {}, 'כללי')));

  const rows = [
    ['ownerName', 'שם', 'text'],
    ['workHoursPerDay', 'שעות עבודה ביום (זמן זמין)', 'number'],
    ['dayStartHour', 'שעת התחלה', 'number'],
    ['hourlyTarget', 'תעריף שעתי יעד ₪', 'number'],
    ['usdRate', 'שער דולר', 'number'],
    ['avgLeadCost', 'עלות ממוצעת לליד ₪', 'number']
  ];
  rows.forEach(([key, label, type]) => {
    const i = input({ type, value: s.settings[key] ?? (type === 'number' ? 0 : '') , step: key === 'usdRate' ? '0.01' : '1' });
    i.addEventListener('change', () => {
      update(st => { st.settings[key] = type === 'number' ? Number(i.value) : i.value; });
      refresh();
    });
    card.append(field(label, i));
  });

  card.append(el('div', { class: 'hr' }));
  card.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
    el('button', { class: 'btn', onclick: lineEditor }, 'קווי מוצר ושלבים')));

  card.append(el('div', { class: 'hr' }));
  const a1 = el('input', {
    type: 'checkbox', checked: !!s.settings.assistantEnabled,
    style: { width: '16px', height: '16px', accentColor: '#ffd400' },
    onchange: e => update(st => { st.settings.assistantEnabled = e.target.checked; })
  });
  const a2 = el('input', {
    type: 'checkbox', checked: !!s.settings.assistantClassify,
    style: { width: '16px', height: '16px', accentColor: '#ffd400' },
    onchange: e => update(st => { st.settings.assistantClassify = e.target.checked; })
  });
  card.append(el('label', { class: 'chk' }, a1, el('span', {}, 'העוזר מופעל')));
  card.append(el('label', { class: 'chk' }, a2, el('span', {}, 'העוזר מדייק את הקלט החופשי (עולה קצת כסף לכל שורה)')));
  return card;
}

/* ================= סוגי פריטים ================= */

function typesCard() {
  const s = S();
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' },
    el('h3', {}, 'סוגי פריטים'),
    el('div', { class: 'right' },
      el('button', {
        class: 'btn btn-xs', onclick: () => {
          const id = prompt('מזהה באנגלית (למשל: partner)');
          if (!id) return;
          const name = prompt('שם בעברית');
          if (!name) return;
          update(st => st.itemTypes.push({ id: id.replace(/\s/g, '_'), name, icon: '•', color: '#5aa9ff' }));
          toast('נוסף', 'ok'); refresh();
        }
      }, '+')
    )));

  s.itemTypes.forEach(t => {
    const nm = input({ value: t.name, style: { flex: 1 } });
    nm.addEventListener('change', () => { update(st => { st.itemTypes.find(x => x.id === t.id).name = nm.value; }); refresh(); });
    const ic = input({ value: t.icon || '•', style: { flex: '0 0 54px', textAlign: 'center' } });
    ic.addEventListener('change', () => update(st => { st.itemTypes.find(x => x.id === t.id).icon = ic.value; }));
    card.append(el('div', { style: { display: 'flex', gap: '5px', marginBottom: '5px', alignItems: 'center' } },
      ic, nm,
      t.system ? el('span', { class: 'pill' }, 'מובנה')
        : el('button', {
          class: 'btn btn-xs btn-danger',
          onclick: () => { update(st => { st.itemTypes = st.itemTypes.filter(x => x.id !== t.id); }); refresh(); }
        }, '×')
    ));
  });
  return card;
}

/* ================= מסוכן ================= */

function dangerCard() {
  const s = S();
  const size = new Blob([exportJSON()]).size;
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'card-h' }, el('h3', {}, 'נתונים')));
  const line = el('div', { class: 'small muted', style: { marginBottom: '11px' } },
    `${s.items.length} פריטים · ${s.timeEntries.length} רשומות זמן · ${num(size / 1024, 0)} KB`);
  card.append(line);

  // הקבצים יושבים ב-IndexedDB ולא נספרים בשורה שלמעלה
  A.usage().then(u => {
    const ids = liveAttachmentIds();
    if (!ids.length && !u.used) return;
    line.append(el('span', {}, ` · ${ids.length} קבצים בפנקס`),
      u.used ? el('span', {}, ` · ${A.fmtSize(u.used)} מתוך ${A.fmtSize(u.quota)}`) : null);
  });

  card.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
    el('button', {
      class: 'btn', 'data-tip': 'מוחק קבצים שנשארו בדפדפן אחרי שהפתק שהחזיק אותם נמחק. לא נוגע בקבצים שעדיין מוצגים.',
      onclick: async () => {
        const n = await A.pruneOrphans(liveAttachmentIds());
        toast(n ? `נמחקו ${n} קבצים יתומים` : 'אין קבצים יתומים', 'ok');
        refresh();
      }
    }, 'נקה קבצים יתומים'),
    el('button', {
      class: 'btn', onclick: () => confirmBox(
        'למחוק את כל רשומות הזמן? הפריטים יישארו.',
        () => { update(st => { st.timeEntries = []; st.timer = null; st.waiting = []; }); toast('נמחקו'); refresh(); })
    }, 'מחק רשומות זמן'),
    el('button', {
      class: 'btn btn-danger', onclick: () => confirmBox(
        'לאפס הכל לברירת מחדל? כל הלקוחות, הזמנים, הידע והקבצים בפנקס יימחקו. ייצא גיבוי קודם!',
        async () => { resetAll(); await A.pruneOrphans([]); toast('אופס'); location.hash = '#/'; refresh(); }, 'כן, אפס הכל')
    }, 'אפס הכל')
  ));
  return card;
}
