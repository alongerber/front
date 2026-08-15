/* ============================================================
   settings.js — הגדרות, גיבוי, התראות, סוגי פריטים
   ============================================================ */

import { S, update, uid, addItem, patchItem, downloadBackup, importJSON, exportJSON, resetAll, loadSample, liveAttachmentIds } from '../store.js';
import { el, ago, toast, modal, input, select, field, confirmBox, dur, num, DAY } from '../util.js';
import * as A from '../attachments.js';
import * as AB from '../autobackup.js';
import { labelWithHint, hintBadge } from '../help.js';
import * as SM from '../sampling.js';
import * as P from '../presence.js';
import * as FW from '../floatwin.js';
import * as T from '../timer.js';
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
    el('div', {}, samplingCard(), bucketsCard(), backupCard(), notifyCard()),
    el('div', {}, generalCard(), typesCard(), dangerCard())
  ));
}

/* ---------- דליי זמן שאינם לקוח ---------- */

function bucketsCard() {
  const s = S();
  const list = s.items.filter(i => i.type === 'bucket' && !i.archived);
  const card = el('div', { class: 'card' });

  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'תחומים', hintBadge('time.buckets')),
    el('span', { class: 'sub' }, 'שעות שהולכות לעסק ולא ללקוח')));

  card.append(el('div', { class: 'small muted', style: { lineHeight: '1.75', marginBottom: '13px' } },
    'לא כל שעה שייכת ללקוח. מודעות, דף נחיתה, פיתוח הסוכנת, ניירת — ' +
    'בלי דלי משלהן הן נדבקות ללקוח אקראי או נעלמות, ואז "כמה עולה לי סרטון" ' +
    'יוצא שגוי. התחומים מופיעים בחלון הצף, במחליף הטיימר ובשאלת הדגימה.'));

  if (!list.length) card.append(el('div', { class: 'empty' }, 'אין תחומים. הוסף אחד למטה.'));

  list.forEach(bk => {
    const nm = input({ value: bk.title, style: { flex: '0 0 130px' } });
    nm.addEventListener('change', () => {
      patchItem(bk.id, { title: nm.value.trim() || bk.title }, 'שינוי שם תחום');
      refresh();
    });
    const nt = input({ value: bk.note || '', placeholder: 'מה נכנס לכאן', style: { flex: 1 } });
    nt.addEventListener('change', () => patchItem(bk.id, { note: nt.value }));

    const hrs = T.focusMs(bk.id, Date.now() - 30 * DAY, Date.now());
    card.append(el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '7px' } },
      nm, nt,
      el('span', { class: 'small muted', style: { flex: '0 0 62px', textAlign: 'center' } },
        hrs > 60000 ? dur(hrs, true) : '—'),
      el('button', {
        class: 'btn btn-xs btn-danger',
        'data-tip': 'מסתיר את התחום. השעות שנרשמו עליו נשארות.',
        onclick: () => confirmBox(
          `להסיר את "${bk.title}"? השעות שנרשמו עליו יישארו בדוחות.`,
          () => { patchItem(bk.id, { archived: true }, 'הסרת תחום'); toast('הוסר'); refresh(); })
      }, '×')
    ));
  });

  card.append(el('button', {
    class: 'btn btn-sm btn-y', style: { marginTop: '7px' },
    onclick: () => {
      addItem({ type: 'bucket', title: 'תחום חדש', note: '' });
      toast('נוסף — שנה את השם', 'ok'); refresh();
    }
  }, '+ תחום'));

  const archived = s.items.filter(i => i.type === 'bucket' && i.archived);
  if (archived.length) card.append(el('div', { class: 'small muted', style: { marginTop: '9px' } },
    `${archived.length} תחומים מוסתרים · `,
    el('a', {
      style: { cursor: 'pointer' },
      onclick: () => { archived.forEach(a => patchItem(a.id, { archived: false })); refresh(); }
    }, 'החזר הכל')));

  return card;
}

/* ---------- שכבה 1: זיהוי נוכחות ---------- */

function presenceBlock() {
  const box = el('div', { style: { marginBottom: '13px' } });
  box.append(el('div', { style: { fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center' } },
    'שכבה 1 · האם אתה ליד המחשב', hintBadge('time.presence')));

  if (!P.supported()) {
    box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7' } },
      'הדפדפן הזה לא תומך. בכרום או באדג\' המערכת יודעת לבד מתי קמת מהמחשב — ' +
      'גם כשאתה בוגאס — וגורעת את הזמן הזה מהמדידה בלי שתעשה כלום.'));
    return box;
  }

  box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '9px' } },
    'רואה הקלדה ותזוזת עכבר בכל המערכת, לא רק בלשונית הזאת. זמן שבו לא היית ' +
    'ליד המחשב נגרע מזמן הקשב לבד — גם אם הטיימר המשיך לרוץ.'));

  const line = el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'בודק…');
  const row = el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } });
  box.append(line, row);

  P.status().then(st => {
    line.textContent = st.text;
    line.style.color = st.level === 'on' ? 'var(--green)' : st.level === 'denied' ? 'var(--red)' : '';
    row.innerHTML = '';
    if (st.level === 'on') {
      row.append(el('button', {
        class: 'btn btn-sm btn-danger', onclick: () => {
          P.stop();
          update(s => { s.settings.presenceEnabled = false; });
          toast('כובה'); refresh();
        }
      }, 'כבה'));
    } else if (st.level !== 'denied' && st.level !== 'unsupported') {
      row.append(el('button', {
        class: 'btn btn-sm btn-y', onclick: async () => {
          const p = await P.requestPermission();
          toast(p === 'granted' ? 'זיהוי הנוכחות פעיל' : 'לא אושר', p === 'granted' ? 'ok' : 'err');
          refresh();
        }
      }, 'אשר עכשיו'));
    }
  });
  return box;
}

/* ---------- שכבה 2: חלון צף ---------- */

function floatBlock() {
  const box = el('div', { style: { marginBottom: '13px' } });
  box.append(el('div', { style: { fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center' } },
    'שכבה 2 · חלון צף', hintBadge('time.floatWin')));

  if (!FW.supported()) {
    box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7' } },
      'הדפדפן הזה לא תומך בחלון צף. בכרום או באדג\' אפשר לפתוח חלונית קטנה ' +
      'שצפה מעל כל התוכנות, ולהחליף פרויקט בלחיצה בלי לעזוב את וגאס.'));
    return box;
  }

  box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '9px' } },
    'חלונית קטנה שצפה מעל כל התוכנות, כולל וגאס במסך מלא. רואים בה על מה ' +
    'הטיימר, ומחליפים פרויקט בלחיצה אחת בלי לחפש לשונית. ' +
    'זו התשובה ל"אני לא אזכור לעדכן" — אתה לא צריך לזכור, זה מול העיניים.'));

  box.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
    el('button', {
      class: 'btn btn-sm btn-y', onclick: async () => {
        try { await FW.open(); toast('החלון הצף פתוח', 'ok'); }
        catch (e) { toast(e.message, 'err'); }
      }
    }, '🪟 פתח עכשיו'),
    el('span', { class: 'small muted', style: { alignSelf: 'center' } },
      'גם מהכפתור 🪟 בסרגל העליון')
  ));
  return box;
}

/* ================= מדידה בדגימות ================= */

function samplingCard() {
  const s = S();
  const c = SM.cfg();
  const card = el('div', { class: 'card' });

  card.append(el('div', { class: 'card-h' },
    el('h3', { style: { display: 'flex', alignItems: 'center' } }, 'מדידת זמן', hintBadge('time.samples')),
    el('span', { class: 'sub' }, 'איך המערכת יודעת כמה זמן לקח סרטון')));

  card.append(el('div', { class: 'small muted', style: { lineHeight: '1.75', marginBottom: '13px' } },
    'שלוש שכבות שעובדות יחד: הטיימר אומר על מה אתה עובד, זיהוי הנוכחות גורע ' +
    'לבד את הזמן שלא היית ליד המחשב, והדגימות הן רשת ביטחון.'));

  card.append(presenceBlock());
  card.append(floatBlock());
  card.append(el('div', { class: 'hr' }));
  card.append(el('div', { style: { fontWeight: '700', marginBottom: '4px' } }, 'שכבה 3 · דגימות'));
  card.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '11px' } },
    'המערכת שואלת "מה אתה עושה עכשיו?" בזמנים אקראיים, ואתה לוחץ כפתור אחד. ' +
    'תופס את המקרה שבו הטיימר על דני אבל אתה בעצם על משה.'));

  const on = el('input', {
    type: 'checkbox', checked: c.enabled,
    style: { width: '16px', height: '16px', accentColor: '#ffd400', cursor: 'pointer' },
    onchange: e => { update(st => { st.settings.sampling.enabled = e.target.checked; }); refresh(); }
  });
  card.append(el('label', { class: 'chk' }, on, el('span', {}, 'מדידה בדגימות פעילה')));

  const numRow = (key, label, min, max, tip, hint) => {
    const i = input({ type: 'number', min, max, value: c[key] });
    if (tip) i.setAttribute('data-tip', tip);
    i.addEventListener('change', () => {
      const v = Number(i.value);
      if (!Number.isFinite(v)) return;
      update(st => { st.settings.sampling[key] = Math.max(min, Math.min(max, v)); st.samplePlan = null; });
      refresh();
    });
    return field(tip ? labelWithHint(label, tip) : label, i, hint);
  };

  const w = Math.round(SM.sampleWeightMs() / 60000);
  card.append(el('div', { class: 'row' },
    numRow('perDay', 'כמה שאלות ביום', 1, 48, 'time.sampleFreq'),
    numRow('fromHour', 'משעה', 0, 23),
    numRow('toHour', 'עד שעה', 1, 24)
  ));
  card.append(el('div', { class: 'small muted', style: { marginTop: '-4px', marginBottom: '11px' } },
    `לפי ההגדרה הזאת כל דגימה שווה ${w} דקות, ושאלה תקפוץ בערך אחת ל-${w} דקות.`));

  /* ימי עבודה */
  const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const daysRow = el('div', { class: 'tag-strip', style: { marginBottom: '13px' } });
  DAYS.forEach((d, i) => {
    const active = c.days.includes(i);
    daysRow.append(el('button', {
      class: 'tag-pill' + (active ? ' on' : ''),
      style: active ? { background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)' } : {},
      onclick: () => {
        update(st => {
          const arr = st.settings.sampling.days || [];
          st.settings.sampling.days = active ? arr.filter(x => x !== i) : arr.concat(i).sort();
          st.samplePlan = null;
        });
        refresh();
      }
    }, d));
  });
  card.append(el('div', {}, el('label', { class: 'fl' }, 'ימי עבודה'), daysRow));

  /* התראות מערכת */
  const notifCb = el('input', {
    type: 'checkbox', checked: c.notify,
    style: { width: '16px', height: '16px', accentColor: '#ffd400', cursor: 'pointer' },
    onchange: e => { update(st => { st.settings.sampling.notify = e.target.checked; }); refresh(); }
  });
  card.append(el('label', { class: 'chk', 'data-tip': 'time.sampleNotify' }, notifCb,
    el('span', {}, 'להקפיץ כהתראת מערכת (מעל וגאס ותוכנות אחרות)')));

  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  if (c.notify && perm !== 'granted') {
    card.append(el('div', { class: 'alert warn', style: { marginTop: '9px' } },
      el('div', { style: { flex: 1 } },
        perm === 'denied'
          ? 'חסמת התראות בדפדפן. בלי זה השאלה תופיע רק כשהמערכת פתוחה מולך. ' +
            'לפתיחה מחדש: אייקון המנעול בשורת הכתובת → התראות → אפשר.'
          : 'צריך לאשר התראות, אחרת השאלה לא תגיע אליך כשאתה בתוכנה אחרת.'),
      perm !== 'denied' ? el('button', {
        class: 'btn btn-xs btn-y',
        onclick: async () => { await notify.requestPermission(); refresh(); }
      }, 'אשר עכשיו') : null));
  }

  /* מה קורה כשלא עונים */
  const missSel = select([
    { value: 'assume', label: 'להניח שהמשכתי באותו דבר (מסומן כניחוש)' },
    { value: 'drop', label: 'לא לספור בכלל' }
  ], c.onMiss, {
    onchange: e => { update(st => { st.settings.sampling.onMiss = e.target.value; }); refresh(); }
  });
  card.append(field('כשלא עניתי לשאלה', missSel));

  /* מצב נוכחי */
  const conf = SM.confidence();
  card.append(el('div', { class: 'alert ' + (conf.level === 'high' ? 'good' : conf.level === 'low' ? '' : 'warn') },
    conf.text));

  card.append(el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '11px' } },
    el('button', {
      class: 'btn btn-sm',
      'data-tip': 'מקפיץ שאלה עכשיו, כדי לראות איך זה נראה',
      onclick: () => { SM.askNow(); toast('שאלה נשלחה', 'ok'); refresh(); }
    }, 'נסה עכשיו'),
    s.samples.length ? el('button', {
      class: 'btn btn-sm btn-danger',
      onclick: () => confirmBox(
        `למחוק את כל ${s.samples.length} הדגימות? המדידה תתחיל מאפס.`,
        () => { update(st => { st.samples = []; }, { label: 'מחיקת דגימות' }); toast('נמחקו'); refresh(); })
    }, 'מחק דגימות') : null
  ));

  return card;
}

/* ================= גיבוי אוטומטי לתיקייה ================= */

function autoBackupBlock() {
  const box = el('div', {});
  box.append(el('div', { style: { fontWeight: '700', marginBottom: '5px' } }, 'גיבוי אוטומטי לתיקייה'));

  if (!AB.supported()) {
    box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7' } },
      'הדפדפן הזה לא מאפשר לאתר לכתוב לתיקייה. בכרום או באדג\' תוכל לבחור תיקייה פעם אחת ' +
      'והמערכת תגבה לשם לבד, בלי שתצטרך לזכור.'));
    return box;
  }

  box.append(el('div', { class: 'small muted', style: { lineHeight: '1.7', marginBottom: '10px' } },
    'בוחרים תיקייה פעם אחת — למשל תיקייה מסונכרנת בדרייב — והמערכת כותבת לשם קובץ גיבוי ' +
    'בכל פתיחה, לא יותר מפעם ביום. שומרת 30 קבצים אחרונים ומוחקת ישנים.'));

  const line = el('div', { class: 'small muted', style: { marginBottom: '9px' } }, 'בודק…');
  const row = el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } });
  box.append(line, row);

  const filesCb = el('input', {
    type: 'checkbox', checked: !!s0().settings.autoBackupFiles,
    style: { width: '15px', height: '15px', accentColor: '#ffd400', cursor: 'pointer' },
    onchange: e => update(st => { st.settings.autoBackupFiles = e.target.checked; })
  });
  box.append(el('label', {
    class: 'chk', style: { marginTop: '9px' },
    'data-tip': 'הגיבוי האוטומטי יכלול גם את התמונות והמסמכים מהפנקס. הקובץ ייצא גדול בהרבה.'
  }, filesCb, el('span', {}, 'כלול גם קבצים מהפנקס בגיבוי האוטומטי')));

  (async () => {
    const st = await AB.status();
    const name = await AB.folderName();
    row.innerHTML = '';
    const last = s0().settings.lastAutoBackupAt;

    if (st === 'granted') {
      line.textContent = `כותב ל"${name}" · ` + (last ? 'גיבוי אוטומטי אחרון לפני ' + ago(last) : 'עוד לא נכתב גיבוי');
      line.style.color = 'var(--green)';
      row.append(
        el('button', {
          class: 'btn btn-sm', onclick: async () => {
            try { const n = await AB.backupNow(); toast('נכתב ' + n, 'ok'); refresh(); }
            catch (e) { toast(e.message, 'err'); }
          }
        }, 'גבה עכשיו'),
        el('button', { class: 'btn btn-sm', onclick: () => changeFolder() }, 'החלף תיקייה'),
        el('button', {
          class: 'btn btn-sm btn-danger', onclick: async () => {
            await AB.forget();
            update(stt => { stt.settings.autoBackupDir = false; });
            toast('נותק'); refresh();
          }
        }, 'נתק')
      );
    } else if (st === 'prompt') {
      line.textContent = `התיקייה "${name}" נבחרה, אבל הדפדפן מבקש אישור מחדש.`;
      line.style.color = 'var(--yellow)';
      row.append(el('button', {
        class: 'btn btn-sm btn-y', onclick: async () => {
          const ok = await AB.reconnect();
          toast(ok ? 'חובר מחדש' : 'לא אושר', ok ? 'ok' : 'err');
          refresh();
        }
      }, 'חבר מחדש'));
    } else {
      line.textContent = 'לא נבחרה תיקייה. הגיבוי כרגע ידני בלבד.';
      line.style.color = '';
      row.append(el('button', { class: 'btn btn-sm btn-y', onclick: () => changeFolder() }, 'בחר תיקייה'));
    }
  })();

  async function changeFolder() {
    try {
      const name = await AB.chooseFolder();
      update(st => { st.settings.autoBackupDir = true; });
      toast('התיקייה "' + name + '" נבחרה', 'ok');
      try { const n = await AB.backupNow(); toast('נכתב ' + n, 'ok'); } catch { /* ננסה שוב מחר */ }
      refresh();
    } catch (e) {
      if (e && e.name === 'AbortError') return;      // סגר את החלון
      toast(e.message || 'בחירת התיקייה נכשלה', 'err');
    }
  }

  return box;
}

const s0 = () => S();

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

  card.append(el('div', { class: 'hr' }));
  card.append(autoBackupBlock());

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
    ['leadSlaMinutes', 'ליד ללא מענה אחרי (דקות)', 5, 1440, null],
    ['timerNudgeHours', 'טיימר רץ יותר מ (שעות)', 1, 12, null],
    ['decisionStaleDays', 'החלטה נחשבת תקועה אחרי (ימים)', 1, 60, null],
    ['autoWaitMinutes', 'מעבר אוטומטי להמתנה אחרי (דקות בלי מגע)', 0, 60, 'time.autoWait'],
    ['idleAskMinutes', 'שואלים "איפה היית" אחרי (דקות)', 1, 60, null],
    ['longAbsenceHours', 'עוצרים טיימר לבד אחרי (שעות)', 1, 12, null]
  ];
  rows.forEach(([key, label, min, max, tip]) => {
    const i = input({ type: 'number', min, max, value: s.settings[key] });
    if (tip) i.setAttribute('data-tip', tip);
    i.addEventListener('change', () => {
      const v = Number(i.value);
      update(st => { st.settings[key] = Number.isFinite(v) && (v > 0 || min === 0) ? v : st.settings[key]; });
    });
    card.append(field(tip ? labelWithHint(label, tip) : label, i,
      key === 'autoWaitMinutes' ? '0 = מכובה. עובד רק כשהטאב פתוח מולך.' : null));
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
