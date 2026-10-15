/**
 * GitWallData.tsx — קיר-האמת של הגיט (exec-14-3d, שכבה L2).
 * ------------------------------------------------------------------
 * קיר הגיט נעלה מ"זרם קומיטים" למד-אמת פר-ספר (repo), חוקי DESIGN.md:
 * · שורה לכל ספר: נקודת-מצב סמנטית (החוק האחד — אותם צבעים בכל המסוף):
 *   conclusion 'success' → ok #14855c · 'failure' → danger #cc423e ·
 *   status 'in_progress'/'pending' → working #a8741c · null/לא-ידוע → ink-3 #8b867b
 * · commits7d — ערך נמדד; חסר → '—' ממש. אף-פעם לא 0 מומצא.
 *   תקרה-נמדדת (commits7dCapped) מוצגת כנה: "100+".
 * · כותרת-טריות (חוק-הטריות): ≤45 דק' → ok "טרי" · 45–90 → attention "מאוחר" ·
 *   >90 → danger "לא ידוע — מת" · בלי חותמת-זמן → danger "לא ידוע".
 *   לא-ידוע לעולם לא ירוק.
 * · RTL אמיתי בקנבס (direction+align), עברית, מונו למספרים.
 * · רענון: בכל שינוי בחנות + טיק-טריות כל 30 שניות (התיישנות נמדדת בזמן-ציור).
 * · קליק על הקיר → bus 'focus' (הזרימה הקיימת של CameraDirector/ViewDeck).
 * · window.__hqWall = { updatedAt, reposRendered } — ל-probe.
 */
'use client';

import { useEffect } from 'react';
import { DynTex } from '@/lib/hq/textures';
import { useHq } from '@/lib/hq/store';

// ─────────────── חוקי-צבע סמנטיים (ערכי-אור מ-DESIGN.md §2) ───────────────
export const SEMANTIC = {
  ok: '#14855c',
  danger: '#cc423e',
  working: '#a8741c',
  attention: '#b58216',
  neutral: '#716d64',
  ink3: '#8b867b',
} as const;

export interface WallRepoRow {
  name: string;
  dotColor: string;
  statusLabel: string;
  /** תווית נמדדת: '—' · '14' · '100+' (תקרה-נמדדת) */
  commitsLabel: string;
}

/** נקודת-מצב סמנטית לפי החוק האחד — המיפוי היחיד, בלי המצאות */
export function repoDot(conclusion: string | null | undefined, status: string | null | undefined): { color: string; label: string } {
  if (conclusion === 'success') return { color: SEMANTIC.ok, label: 'הצלחה' };
  if (conclusion === 'failure') return { color: SEMANTIC.danger, label: 'כשל' };
  if (status === 'in_progress' || status === 'pending') return { color: SEMANTIC.working, label: 'בעבודה' };
  return { color: SEMANTIC.ink3, label: '—' };
}

export interface Freshness {
  tone: 'ok' | 'attention' | 'danger';
  /** תווית עברית קצרה לצ'יפ/כותרת */
  label: string;
  /** true — אין חותמת-זמן נמדדת או שהיא מתה; לעולם לא ירוק */
  unknown: boolean;
  minutes: number | null;
}

/** חוק-הטריות: ≤45 דק' ok · 45–90 attention "מאוחר" · >90 danger "לא ידוע — מת" · בלי-זמן danger "לא ידוע" */
export function computeFreshness(updatedAtMs: number | null | undefined): Freshness {
  if (!updatedAtMs || !Number.isFinite(updatedAtMs)) {
    return { tone: 'danger', label: 'לא ידוע', unknown: true, minutes: null };
  }
  const mins = (Date.now() - updatedAtMs) / 60000;
  const ago = mins < 1 ? 'עכשיו' : mins < 60 ? `${Math.round(mins)} דק'` : `${Math.floor(mins / 60)} שע'`;
  if (mins <= 45) return { tone: 'ok', label: `טרי · ${ago}`, unknown: false, minutes: mins };
  if (mins <= 90) return { tone: 'attention', label: `מאוחר · ${ago}`, unknown: false, minutes: mins };
  return { tone: 'danger', label: `לא ידוע — מת · ${ago}`, unknown: true, minutes: mins };
}

// ─────────────── לוח-הקנבס של הקיר ───────────────
interface BoardData {
  rows: WallRepoRow[];
  /** חותמת-הזמן הנמדדת של הנתונים (digest.generatedAt / foreman lastFetch) */
  updatedAtMs: number | null;
  /** שורת-מקור כנה (repoLabel מהחוט; '—' כשלא נמדד) */
  sourceLabel: string;
}

const W = 1280;
const H = 720;
const HEADER_H = 88;
const COLHEAD_H = 44;
const FOOTER_H = 56;
const ROW_H = 60;
const MAX_ROWS = Math.floor((H - HEADER_H - COLHEAD_H - FOOTER_H) / ROW_H);

function makeGitWallBoard() {
  let data: BoardData = { rows: [], updatedAtMs: null, sourceLabel: '—' };
  const dyn = new DynTex(W, H, (ctx) => {
    const fresh = computeFreshness(data.updatedAtMs);
    // מסך-כלי רגוע (המקום אור-יום; הכלי כהה כמסך) — אותו גוף כמו שאר המסכים
    ctx.fillStyle = '#0c100d';
    ctx.fillRect(0, 0, W, H);

    // ── כותרת + צ'יפ טריות ──
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.strokeStyle = 'rgba(140,200,160,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HEADER_H + 0.5); ctx.lineTo(W, HEADER_H + 0.5); ctx.stroke();
    ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#dce8df';
    ctx.font = "700 36px 'Heebo',system-ui,sans-serif";
    ctx.fillText('קיר הגיט · אמת-מצב הספרים', W - 28, HEADER_H / 2 - 4);
    // צ'יפ טריות: נקודה + תווית — הטון הסמנטי של חוק-הטריות
    const tone = fresh.tone === 'ok' ? SEMANTIC.ok : fresh.tone === 'attention' ? SEMANTIC.attention : SEMANTIC.danger;
    ctx.textAlign = 'left';
    ctx.font = "600 26px 'Heebo',system-ui,sans-serif";
    const chipX = 28 + 16;
    ctx.fillStyle = tone;
    ctx.fillText(fresh.label, chipX + 12, HEADER_H / 2 - 4);
    // נקודת-צ'יפ — מוצגת גם כש"לא ידוע" (בצבע הסמנטי הנכון, לעולם לא ירוקה)
    ctx.beginPath();
    ctx.arc(chipX, HEADER_H / 2 - 4, 8, 0, 7);
    ctx.fill();

    // ── כותרות-עמודות ──
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(150,162,152,0.85)';
    ctx.font = "600 21px 'Heebo',system-ui,sans-serif";
    ctx.fillText('ספר', W - 28, HEADER_H + COLHEAD_H / 2);
    ctx.textAlign = 'left';
    ctx.font = "500 19px ui-monospace,monospace";
    ctx.fillText('עדכונים · 7 ימים', 28, HEADER_H + COLHEAD_H / 2);

    // ── שורות ספרים ──
    const rows = data.rows.slice(0, MAX_ROWS);
    rows.forEach((r, i) => {
      const y = HEADER_H + COLHEAD_H + i * ROW_H;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.028)';
        ctx.fillRect(12, y, W - 24, ROW_H);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(12, y + ROW_H + 0.5); ctx.lineTo(W - 12, y + ROW_H + 0.5); ctx.stroke();
      // נקודת-מצב (החוק האחד) — קצה ימין
      ctx.fillStyle = r.dotColor;
      ctx.beginPath();
      ctx.arc(W - 44, y + ROW_H / 2, 9, 0, 7);
      ctx.fill();
      // שם-הספר — מיושר ימין (RTL)
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillStyle = '#e4eee6';
      ctx.font = "600 29px 'Heebo',system-ui,sans-serif";
      const nm = r.name.length > 30 ? r.name.slice(0, 29) + '…' : r.name;
      ctx.fillText(nm, W - 72, y + ROW_H / 2);
      // תווית-מצב קטנה אחרי השם
      ctx.fillStyle = 'rgba(150,162,152,0.75)';
      ctx.font = "500 20px 'Heebo',system-ui,sans-serif";
      ctx.fillText(r.statusLabel, W - 72 - ctx.measureText(nm).width - 18, y + ROW_H / 2);
      // commits7d — מונו משמאל; '—' ממש כשלא נמדד
      ctx.direction = 'ltr'; ctx.textAlign = 'left';
      ctx.font = "500 28px ui-monospace,monospace";
      ctx.fillStyle = r.commitsLabel === '—' ? 'rgba(139,134,123,0.95)' : '#cfdad1';
      ctx.fillText(r.commitsLabel, 28, y + ROW_H / 2);
    });

    // ── מצב-ריק כן ──
    if (!rows.length) {
      ctx.direction = 'rtl'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(139,134,123,0.9)';
      ctx.font = "500 30px 'Heebo',system-ui,sans-serif";
      ctx.fillText('— אין מדידה עדיין · ממתין לחוט-האמת', W / 2, (HEADER_H + COLHEAD_H + H - FOOTER_H) / 2);
    }

    // ── תחתית: מקור כן + עודף ──
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
    ctx.strokeStyle = 'rgba(140,200,160,0.12)';
    ctx.beginPath(); ctx.moveTo(0, H - FOOTER_H + 0.5); ctx.lineTo(W, H - FOOTER_H + 0.5); ctx.stroke();
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(150,162,152,0.85)';
    ctx.font = "500 21px 'Heebo',system-ui,sans-serif";
    const extra = data.rows.length - rows.length;
    const left = extra > 0 ? ` (+${extra} נוספים)` : '';
    ctx.fillText(`מקור: ${data.sourceLabel} · ${rows.length} ספרים${left}`, W - 28, H - FOOTER_H / 2);
    ctx.textAlign = 'left';
    ctx.font = "500 20px ui-monospace,monospace";
    ctx.fillStyle = tone;
    ctx.fillText('●', 28, H - FOOTER_H / 2);
  });
  return {
    tex: dyn.tex,
    set(next: BoardData) {
      const sig = next.rows.map((r) => `${r.name}|${r.dotColor}|${r.commitsLabel}`).join('#') + '|' + (next.updatedAtMs ?? '') + '|' + next.sourceLabel;
      const prevSig = data.rows.map((r) => `${r.name}|${r.dotColor}|${r.commitsLabel}`).join('#') + '|' + (data.updatedAtMs ?? '') + '|' + data.sourceLabel;
      data = next;
      if (sig !== prevSig) dyn.markDirty();
    },
    /** טיק-טריות: אותם נתונים, אבל ההתיישנות נמדדת מחדש בזמן-ציור */
    bump() { dyn.markDirty(); },
    update: (now: number) => dyn.update(now),
  };
}

export type GitWallBoard = ReturnType<typeof makeGitWallBoard>;
let _board: GitWallBoard | null = null;
/** מופע-יחיד (עצל) — נוצר בצד-לקוח בלבד */
export function gitBoard(): GitWallBoard {
  if (!_board) _board = makeGitWallBoard();
  return _board;
}

// ─────────────── ויסות window.__hqWall ───────────────
const hqWall = { updatedAt: null as number | null, reposRendered: 0 };

/** מזרים את נתוני החנות אל לוח-הקיר: בכל שינוי git + טיק-טריות של 30 שניות */
export function GitWallSync() {
  const git = useHq((s) => s.snap.git);
  useEffect(() => {
    const apply = (force: boolean) => {
      const g = useHq.getState().snap.git ?? null;
      // R57 — מקור-האמת של הקיר: ספרי-הצי (books.list מהיומן-החי). ה-`fleet`
      // הישן מעולם לא מוזן בשרשרת-הזו (נמדד: הקיר היה ריק-נצחי) — הוא נשאר
      // ערוץ-גיבוי תקני, אבל הספרים קודמים כשהם קיימים.
      let rows: WallRepoRow[];
      if (g?.books?.length) {
        rows = g.books.map((b) => {
          // חוק-הטריות פר-ספר — נמדד (ageHours), לעולם לא מנוחש:
          // fresh → ok 'טרי' · empty → ink3 'ריק' · אחרת → attention 'מיושן · Xh'
          const age = b.ageHours != null ? (b.ageHours < 1 ? `${Math.max(1, Math.round(b.ageHours * 60))} דק'` : `${Math.round(b.ageHours)} ש'`) : null;
          const dot = b.empty
            ? { color: SEMANTIC.ink3, label: 'ריק' }
            : b.fresh
              ? { color: SEMANTIC.ok, label: 'טרי' }
              : { color: SEMANTIC.attention, label: age ? `מיושן · ${age}` : 'מיושן' };
          return { name: b.name, dotColor: dot.color, statusLabel: dot.label, commitsLabel: '—' };
        });
      } else {
        rows = (g?.fleet ?? []).map((r) => {
          const dot = repoDot(r.lastRunConclusion, r.lastRunStatus);
          // נמדד → מספר; תקרה-נמדדת → "100+"; לא-נמדד → '—' ממש (אף-פעם לא 0)
          const commits =
            typeof r.commits7d === 'number' && Number.isFinite(r.commits7d)
              ? `${r.commits7d}${r.commits7dCapped ? '+' : ''}`
              : '—';
          return { name: r.label, dotColor: dot.color, statusLabel: dot.label, commitsLabel: commits };
        });
      }
      const updatedAtMs = g?.lastFetch && Number.isFinite(g.lastFetch) ? g.lastFetch : null;
      gitBoard().set({ rows, updatedAtMs, sourceLabel: g?.books?.length ? 'ספרי-הצי · office-live' : g?.repoLabel || '—' });
      if (force) gitBoard().bump(); // טיק-טריות: ציור מחדש עם התיישנות נמדדת
      hqWall.updatedAt = updatedAtMs;
      hqWall.reposRendered = rows.length;
      (window as unknown as Record<string, unknown>).__hqWall = hqWall; // ל-probe
    };
    apply(true);
    // טיק-ציור: DynTex מצויר רק דרך update() (חוק 200ms שלו) — בלי טיק זה
    // הקיר נשאר על הפריים-הראשון הריק גם כשהנתונים הגיעו (נמדד חי, exec-14-3d)
    const repaint = setInterval(() => gitBoard().update(Date.now()), 1000);
    const iv = setInterval(() => apply(true), 30_000);
    return () => { clearInterval(iv); clearInterval(repaint); };
  }, [git]);
  return null;
}
