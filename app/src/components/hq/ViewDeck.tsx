/**
 * ViewDeck.tsx — סרגל-החדר המקצועי (במקום שכבת-המשחק).
 * ------------------------------------------------------------------
 * · נקודות תצפית: כפתורים אמיתיים (מקלדת-נגישים, aria-pressed, קיצורי 1..7,
 *   Esc = תצפית כללית) — כל נקודה היא הרכב על אזור אמיתי בתוכנית.
 * · מצב-חדר כנה: חיבור + טריות + "החדר בהכנה…" עד הפריים האמיתי הראשון
 *   (נמדד מהרנדרר — לא הנחה), כי בכלי-חלש קומפילציית-ה-shaders עלולה לארוך.
 * · Task 11-a — שלט-מסלול (פינת-החדר): חי / מראה — מציאות נמדדה מ-{savedAt} /
 *   הדגמה (סימן-מים DEMO) + HUD נתונים אמיתיים מינימלי (יעד · לוח-משימות ·
 *   הכרעות) מה-store בלבד, עם טוקני-העיצוב הקיימים.
 * · סיור: צ'יפ "סיור" מפעיל את מצלמת-הבמאי הקולנועית; כל קלט משתמש מחזיר שליטה.
 * · טוסטים: הודעות אמיתיות בלבד (הגיעו מהפורמן דרך הגשר).
 * · T19-c (refero): סולם-גופנים ממושמע (11 / 12 / 12.5), מקצב ריווח 4/8,
 *   פאנל-HUD אחד (.sl-panel — עומק עדין במקום מסגרות-כפולות), memo לחלקים
 *   היציבים — הכרום רגוע ומקצועי, ההתנהגות ללא-שינוי.
 * אין ג'ויסטיק, אין ריצה, אין WASD, אין מבט-ראשון — הניווט אדריכלי.
 */
'use client';

import { memo, useEffect, useState } from 'react';
import { bus, director, type PresetId } from '@/lib/hq/world';
import { CAMERA_PRESETS } from '@/lib/hq/contract';
import { useHq, type Lang } from '@/lib/hq/store';
import { setTour } from './CameraDirector';

/** שידור בחירת נקודת תצפית למצלמת הבמאי (אירוע דומיין יחיד, בלי קפלים) */
export function selectPreset(id: PresetId) {
  director.preset = id;
  director.focus = null;
  window.dispatchEvent(new CustomEvent('hq-camera-preset', { detail: id }));
}

/** Task 11-a — שלט-המסלול בפינת-החדר: מה מוצג כאן, בשפה-אחת וכנה.
 *  חי = סוקט הפורמן · מראה = יומן אמיתי קפוא ב-{savedAt} ·
 *  הדגמה = backend 'sim' מפורש בלבד (סימן-מים חובה) · שגיאת-יומן מוצגת ככשל. */
const ModeChip = memo(function ModeChip({ lang }: { lang: Lang }) {
  const feedMode = useHq((s) => s.feedMode);
  const feedReady = useHq((s) => s.feedReady);
  const feedSavedAt = useHq((s) => s.feedSavedAt);
  const feedError = useHq((s) => s.feedError);
  const sim = useHq((s) => s.snap.status.backend === 'sim');
  const he = lang === 'he';
  const stamp = feedSavedAt
    ? new Date(feedSavedAt).toLocaleString(he ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem' })
    : null;
  const { text, color } = sim
    ? { text: he ? 'DEMO · הדגמה — לא מציאות' : 'DEMO · simulation — not reality', color: 'var(--st-danger)' }
    : feedMode === 'mirror'
      ? feedError && !feedReady
        ? { text: he ? `מראה — יומן לא זמין (${feedError})` : `Mirror — journal unavailable (${feedError})`, color: 'var(--st-danger)' }
        : feedReady
          ? { text: he ? `מראה — מציאות נמדדה מ-${stamp ?? '?'}` : `Mirror — measured reality from ${stamp ?? '?'}`, color: 'var(--st-info)' }
          : { text: he ? 'מראה — טוען יומן אמיתי…' : 'Mirror — loading the real journal…', color: 'var(--st-attention)' }
      : { text: he ? 'חי — הפורמן בזמן-אמת' : 'Live — the foreman in real time', color: 'var(--st-ok)' };
  return (
    <div
      className="sl-panel pointer-events-none absolute end-3 top-3 z-10 flex max-w-[70%] items-center gap-2 px-3 py-2"
      dir="rtl"
      role="status"
    >
      <span className="sl-dot" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="text-[12px] font-semibold" style={{ color }}>{text}</span>
    </div>
  );
});

/** Task 11-a — HUD נתונים אמיתיים מינימלי: יעד פעיל + ספירת לוח-המשימות +
 *  הכרעות — הכל מה-store (אותה אמת של הסוקט/המראה), טוקני-עיצוב קיימים.
 *  מה שלא נמדד לא מוצג — אין כאן מספר יבש. */
const RoomHud = memo(function RoomHud({ lang }: { lang: Lang }) {
  const goal = useHq((s) => s.snap.goal);
  const tasks = useHq((s) => s.snap.tasks);
  const decisions = useHq((s) => s.snap.decisions);
  const journal = useHq((s) => s.feedJournal);
  const he = lang === 'he';
  const count = (st: string) => tasks.filter((t) => t.status === st).length;
  const done = count('done');
  const active = count('todo') + count('doing') + count('review') + count('blocked');
  const openD = decisions.filter((d) => d.status === 'open').length;
  const answeredD = decisions.length - openD;
  return (
    <div
      className="pointer-events-none absolute start-3 top-3 z-10 flex max-w-[64%] flex-col gap-2"
      dir="rtl"
      aria-label={he ? 'מדדי-המשרד' : 'Office metrics'}
    >
      {goal && (
        <div className="sl-panel px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">{he ? 'היעד הנוכחי' : 'Current goal'}</div>
          <div className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-5 text-[color:var(--ink)]">{goal.text}</div>
          {typeof goal.progress === 'number' && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]">
              <div className="h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, Math.round(goal.progress * 100)))}%` }} />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="sl-panel px-3 py-2 text-[12px] font-semibold text-[color:var(--ink-2)]">
          {he ? `לוח: ${done} בוצעו · ${active} פתוחות` : `Wall: ${done} done · ${active} open`}
        </span>
        <span className="sl-panel px-3 py-2 text-[12px] font-semibold text-[color:var(--ink-2)]">
          {he ? `הכרעות: ${answeredD} הוכרעו${openD ? ` · ${openD} פתוחות` : ''}` : `Decisions: ${answeredD} resolved${openD ? ` · ${openD} open` : ''}`}
        </span>
        {journal && (journal.rescuedCount != null || journal.reviewRoundsTotal != null) && (
          <span className="sl-panel px-3 py-2 text-[12px] font-semibold text-[color:var(--ink-3)]">
            {he
              ? `יומן: ${journal.rescuedCount ?? '—'} חילוצים · ${journal.reviewRoundsTotal ?? '—'} עידוני-ביקורת`
              : `Journal: ${journal.rescuedCount ?? '—'} rescues · ${journal.reviewRoundsTotal ?? '—'} review rounds`}
          </span>
        )}
      </div>
    </div>
  );
});

/** טוסטים — הודעות אמיתיות בלבד */
const RoomToasts = memo(function RoomToasts() {
  const toasts = useHq((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-max max-w-[92%] -translate-x-1/2 flex-col items-center gap-2" dir="rtl" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="sl-panel rounded-full px-4 py-2 text-[12.5px] font-semibold text-[color:var(--ink)]">
          {t.text}
        </div>
      ))}
    </div>
  );
});

/** מצב-חדר כנה: חיבור + טריות + הכנה — ומסלול-מראה כנה (Task 11-a) */
const RoomStatus = memo(function RoomStatus({ lang }: { lang: Lang }) {
  const connected = useHq((s) => s.connected);
  const ready = useHq((s) => s.roomReady);
  const gotSnapshot = useHq((s) => s.snap.agents.length > 0 || s.snap.tasks.length > 0);
  const mirrorReady = useHq((s) => s.feedMode === 'mirror' && s.feedReady);
  const he = lang === 'he';
  return (
    <div className="sl-panel pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 px-3 py-2 sm:flex" dir="rtl">
      <span className="sl-dot" style={{ backgroundColor: !ready ? 'var(--st-neutral)' : mirrorReady ? 'var(--st-info)' : connected ? 'var(--st-ok)' : 'var(--st-attention)' }} aria-hidden="true" />
      <span className="text-[12px] font-medium text-[color:var(--ink-2)]">
        {!ready
          ? (he ? 'החדר בהכנה…' : 'Preparing the room…')
          : mirrorReady
            ? (he ? 'מראה — יומן המשרד האמיתי (רענון כל שתי דקות)' : 'Mirror — the office’s real journal (2-min refresh)')
            : !connected
              ? (he ? 'מנותק ממקור-האמת — מציג נתונים אחרונים' : 'Truth source unreachable — showing last data')
              : gotSnapshot
                ? (he ? 'חי' : 'Live')
                : (he ? 'מחובר — ממתין לסנאפשוט ראשון' : 'Connected — awaiting first snapshot')}
      </span>
    </div>
  );
});

/** צ'יפ מקור-האמת (Task 3D-TRUTH): מאיפה הנתונים + גילם — כנות מלאה,
 *  בלי ירוק-מזויף: נתונים ישנים מסומנים כישנים, חסר מסומן כחסר. */
const TruthChip = memo(function TruthChip({ lang }: { lang: Lang }) {
  const truth = useHq((s) => s.truth);
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  if (!truth || !truth.fetchedAt) return null;
  const he = lang === 'he';
  const truthBase = truth.foremanCapturedAt ?? truth.fetchedAt;
  const ageMin = Math.max(0, Math.round((Date.now() - truthBase) / 60_000));
  const stale = ageMin >= 30;
  const parts: string[] = [];
  if (truth.foremanOk) parts.push(he ? 'פורמן' : 'foreman');
  if (truth.pulseVerdict) parts.push(`דופק ${truth.pulseVerdict}`);
  if (truth.treasuryNetSp !== null) parts.push(`${truth.treasuryNetSp.toLocaleString('he-IL', { maximumFractionDigits: 1 })} SP`);
  const label = parts.length
    ? (he ? `נתונים אמיתיים · ${parts.join(' · ')} · לפני ${ageMin} דק'` : `measured · ${parts.join(' · ')} · ${ageMin}m ago`)
    : (he ? 'אין מקור-אמת — החדר ריק מנתונים' : 'no truth source — room shows no data');
  return (
    <div
      className="sl-panel pointer-events-none absolute right-3 bottom-3 z-10 flex max-w-[58%] items-center gap-2 px-3 py-2 sm:max-w-[46%]"
      dir="rtl"
      role="status"
    >
      <span className="sl-dot" style={{ backgroundColor: stale || !truth.foremanOk ? 'var(--st-attention)' : 'var(--st-ok)' }} aria-hidden="true" />
      <span className="truncate text-[12px] font-medium text-[color:var(--ink-2)]" title={label}>{label}</span>
    </div>
  );
});

/** שכבת-הכנה — נעלמת בפריים האמיתי הראשון */
function PreparingVeil({ lang }: { lang: Lang }) {
  const ready = useHq((s) => s.roomReady);
  if (ready) return null;
  const he = lang === 'he';
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" dir="rtl" role="status" aria-live="polite">
      <div className="sl-panel flex items-center gap-3 px-5 py-3.5">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--line-strong)] border-t-[color:var(--accent)]" aria-hidden="true" />
        <div>
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{he ? 'החדר בהכנה…' : 'Preparing the room…'}</div>
          <div className="text-[12px] text-[color:var(--ink-3)]">{he ? 'טוען דמויות ומקמפל תאורה — זה יימשך רגע' : 'Loading crew and compiling lighting — this takes a moment'}</div>
        </div>
      </div>
    </div>
  );
}

/** סרגל נקודות-התצפית */
const PresetDeck = memo(function PresetDeck({ lang }: { lang: Lang }) {
  const [active, setActive] = useState<PresetId>(director.preset);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const onPreset = (e: Event) => setActive((e as CustomEvent<PresetId>).detail);
    window.addEventListener('hq-camera-preset', onPreset as EventListener);
    const off = bus.on('focus', ({ target, id }) => {
      if (target && id) setFocusId(id);
      if (!target) setFocusId(null);
    });
    return () => {
      window.removeEventListener('hq-camera-preset', onPreset as EventListener);
      off();
    };
  }, []);

  // קיצורי מקלדת: 1..7 לנקודות, Esc לתצפית כללית
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= CAMERA_PRESETS.length) selectPreset(CAMERA_PRESETS[n - 1].id);
      if (e.key === 'Escape') selectPreset('overview');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const he = lang === 'he';
  const [tourOn, setTourOn] = useState(director.tour);
  useEffect(() => {
    const on = (e: Event) => setTourOn(Boolean((e as CustomEvent<{ on?: boolean }>).detail?.on));
    window.addEventListener('hq-camera-tour', on as EventListener);
    return () => window.removeEventListener('hq-camera-tour', on as EventListener);
  }, []);
  return (
    <nav
      className="sl-panel pointer-events-auto absolute bottom-12 left-1/2 z-10 flex max-w-[96%] -translate-x-1/2 flex-nowrap items-center gap-1 overflow-x-auto p-1 sm:bottom-3"
      dir="rtl"
      aria-label={he ? 'נקודות תצפית בחדר' : 'Room camera presets'}
    >
      {/* Task 11-a — הסיור הקולנועי: כל קלט-משתמש מחזיר שליטה מיידית */}
      <button
        onClick={() => setTour(!tourOn)}
        aria-pressed={tourOn}
        title={he ? 'סיור-מודרך בין התחנות — כל לחיצה בחדר מחזירה שליטה' : 'Guided tour between the stations — any click returns control'}
        className="sl-chip !border-transparent !bg-transparent !text-[12px] !font-semibold hover:!bg-[color:var(--surface-2)]"
        style={tourOn ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : undefined}
      >
        {tourOn ? (he ? '◉ הסיור חי — לחיצה מחזירה שליטה' : '◉ Tour live — click to take control') : (he ? '▶ סיור' : '▶ Tour')}
      </button>
      <span className="mx-0.5 h-4 w-px bg-[color:var(--line)]" aria-hidden="true" />
      {CAMERA_PRESETS.map((p, i) => {
        const on = focusId ? false : active === p.id;
        return (
          <button
            key={p.id}
            onClick={() => selectPreset(p.id)}
            aria-pressed={on}
            title={`${p.label[lang]} (${i + 1})`}
            className="sl-chip !border-transparent !bg-transparent !text-[12px] !font-semibold hover:!bg-[color:var(--surface-2)]"
            style={on ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : undefined}
          >
            <span className="me-1 hidden whitespace-nowrap text-[10px] font-bold text-[color:var(--ink-3)] sm:inline" aria-hidden="true">{i + 1}</span>
            <span className="whitespace-nowrap">{p.label[lang]}</span>
          </button>
        );
      })}
    </nav>
  );
});

export function ViewDeck() {
  const lang = useHq((s) => s.lang);
  return (
    <>
      <ModeChip lang={lang} />
      <RoomHud lang={lang} />
      <RoomToasts />
      <PreparingVeil lang={lang} />
      <PresetDeck lang={lang} />
      <RoomStatus lang={lang} />
      <TruthChip lang={lang} />
    </>
  );
}
