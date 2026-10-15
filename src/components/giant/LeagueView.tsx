"use client";

import { useCallback, useEffect, useState } from "react";

/* ═══ ליגת-הענקים — הדלת-הראשית של GIANT (Task 41) ═══════════════════════
 * המופע-החי של שולחן-הענקים (קנון R75 · Console/Domain): כל מי שמייצר היום
 * ב-DeFi — נמדד keyless מ-DefiLlama, השורה-שלנו נמדדת מספר-המנוע עם כנות-מלאה.
 * משטחי-הצי: הצטרפות לכל-הסוכנים — כל-המוצרים-החיים של הרשת דלת-אחת-קדימה. */

interface LeagueRow { name: string; tier: string; fees24: number | null; fees30: number | null; vol24: number | null; allTime: number | null }
interface OursRow { vol24Mu: number | null; trades24: number | null; externalValueUsd: number; height: number | null; armed: boolean }
interface LeaguePayload {
  ok: boolean; note?: string; rows: LeagueRow[]; ours: OursRow | null;
  source: string; fetchedAt: string;
}
/* מד-המרחק-מהענקים — מוצר-מול-מוצר (הוראת-בעלים trace 1a13feac8b93b859: "למרות-הטענות-של-הסוכנים") */
interface GapCap { id: string; he: string; weight: number; giant: "yes" | "partial" | "no"; giantFact: string | null; ours: "yes" | "partial" | "no"; oursProof: string | null; gapClosedAt?: string }
interface GapPayload {
  ok: boolean; note?: string;
  gap: {
    ok: boolean; note?: string; answerHe: string | null;
    sources: Array<{ id: string; url: string; what: string }>;
    capabilities: GapCap[];
    score: { ours: number | null; giants: number | null; method: string | null };
    gapPlan: Array<{ next: string; why: string; ownerDecision: boolean }>;
    liveAudit: { engineRunning: boolean | null; engineTicks: number | null; openLimitOrders: number | null; limitOrdersTotal: number | null; realTradesTotal: number | null };
  } | null;
}

function usd(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}
function fmtMu(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
function tierCls(tier: string): string {
  const base = "rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap";
  if (tier === "DEX") return `${base} bg-amber-500/10 text-amber-400`;
  if (tier === "נגזרים") return `${base} bg-rose-500/10 text-rose-400`;
  if (tier === "אגרגטור") return `${base} bg-teal-500/10 text-teal-400`;
  if (tier === "ארנק") return `${base} bg-zinc-500/15 text-zinc-300`;
  return `${base} bg-emerald-500/10 text-emerald-400`;
}

/** משטחי-הצי — ההצטרפות: כל-הסוכנים, כל-המוצרים-החיים, דלת-אחת */
const FLEET_SURFACES: Array<{ label: string; he: string; url: string }> = [
  { label: "שולחן-הענקים", he: "הליגה · מפת-הפריצות המלאה", url: "https://roshpinacare-sys.github.io/Domain/giants.html" },
  { label: "הכסף", he: "money · הערוצים-האמיתיים", url: "https://roshpinacare-sys.github.io/Domain/money.html" },
  { label: "DeFi", he: "הבורסה · המשטח-המוסדי", url: "https://roshpinacare-sys.github.io/Domain/defi.html" },
  { label: "הארנק", he: "wallet · 7 רשתות חיות", url: "https://roshpinacare-sys.github.io/Domain/wallet.html" },
  { label: "הקונסולה", he: "console · dex-beat שעה-בשעה", url: "https://roshpinacare-sys.github.io/Domain/console.html" },
  { label: "המשרד-התלת-ממדי", he: "office3d · חדר-הצוות הציבורי", url: "https://roshpinacare-sys.github.io/Domain/office3d/" },
  { label: "המשטח-הסטטי", he: "Pulse · דופק-הצי", url: "https://roshpinacare-sys.github.io/Pulse/sovereign.html" },
];

function verdictChip(v: "yes" | "partial" | "no") {
  const base = "rounded-full px-2 py-0.5 text-[9px] font-black whitespace-nowrap";
  if (v === "yes") return <span className={`${base} bg-emerald-500/10 text-emerald-400`}>יש</span>;
  if (v === "partial") return <span className={`${base} bg-amber-500/10 text-amber-400`}>חלקי</span>;
  return <span className={`${base} bg-red-500/10 text-red-400`}>אין</span>;
}

export function GiantsView() {
  const [data, setData] = useState<LeaguePayload | null>(null);
  const [gapData, setGapData] = useState<GapPayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/league", { cache: "no-store" });
      const d = (await res.json()) as LeaguePayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
    try {
      const r2 = await fetch("/api/giant/giants", { cache: "no-store" });
      setGapData((await r2.json()) as GapPayload);
    } catch { /* כנה — מד-המרחק יישאר חסר */ }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 120_000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  const oursVol = data?.ours ? (data.ours.vol24Mu ?? 0) / 1e6 : null; // µUSDS → USDS

  return (
    <div className="space-y-5" dir="rtl">
      {/* ═══ גיבור-הליגה ═══ */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-bl from-zinc-900 via-zinc-900/60 to-zinc-950 p-6">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-amber-600/10 blur-3xl" aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">ליגת-החזית · נמדד keyless · fail-closed</p>
        <h2 className="mt-2 text-2xl font-black leading-9 text-zinc-50 sm:text-3xl">
          ליגת-הענקים · כל מי שמייצר היום ב-DeFi
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-6 text-zinc-400">
          לא סיפורים, לא הבטחות, לא וידאו-שיווקי, ולא מרכיבי-קומפוזיט מתהדרים — הטבלה-החיה: עמלות-פרוטוקול וווליום
          נמדדות מהפידים-הציבוריים (DefiLlama · אפס-מפתחות) מול השורה-שלנו מספר-המנוע החי.
          כל-משפחה שלא נמצאה בפיד פשוט לא מופיעה · אפס-המצאה.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
            {data?.rows.length ? `${data.rows.length} משפחות נמדדו` : "טוען את הליגה…"}
          </span>
          {data?.ours?.armed && (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-[10px] font-bold text-amber-400">הגריד ARMED-LIVE</span>
          )}
          <span className="font-mono text-[10px] text-zinc-600">{data?.source ?? "api.llama.fi"}</span>
        </div>
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* ═══ טבלת-הליגה ═══ */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-200">שולחן-הענקים · עמלות חיות</h3>
          <span className="text-[10px] text-zinc-500">ממוין לפי עמלות-30-יום · השורה-שלנו נצמדת למטה בכנות</span>
        </div>
        <div className="max-h-[560px] overflow-auto pr-1">
          <table className="w-full min-w-[640px] text-right text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900/95 text-[10px] uppercase text-zinc-500 backdrop-blur">
              <tr>
                <th className="px-2 py-2">משפחה</th>
                <th className="px-2 py-2">סוג</th>
                <th className="px-2 py-2">עמלות 24ש'</th>
                <th className="px-2 py-2">עמלות 30ד'</th>
                <th className="px-2 py-2">ווליום 24ש'</th>
                <th className="px-2 py-2">הכל-הזמנים</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.name} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                  <td className="px-2 py-2 font-bold text-zinc-200">{r.name}</td>
                  <td className="px-2 py-2"><span className={tierCls(r.tier)}>{r.tier}</span></td>
                  <td className="px-2 py-2 font-mono text-zinc-300">{usd(r.fees24)}</td>
                  <td className="px-2 py-2 font-mono font-semibold text-zinc-100">{usd(r.fees30)}</td>
                  <td className="px-2 py-2 font-mono text-zinc-400">{usd(r.vol24)}</td>
                  <td className="px-2 py-2 font-mono text-zinc-500">{usd(r.allTime)}</td>
                </tr>
              ))}
              {/* השורה-שלנו — כנות-מלאה */}
              {data?.ours && (
                <tr className="border-t-2 border-amber-600/40 bg-amber-500/[0.04]">
                  <td className="px-2 py-2 font-black text-amber-400">SAOS DEX <span className="mr-1 text-[9px] font-normal text-zinc-500">— אנחנו</span></td>
                  <td className="px-2 py-2"><span className={tierCls("DEX")}>DEX</span></td>
                  <td className="px-2 py-2 font-mono text-zinc-500">$0.00</td>
                  <td className="px-2 py-2 font-mono text-zinc-500">$0.00</td>
                  <td className="px-2 py-2 font-mono font-bold text-amber-400" title="יחידות-פנימיות בספר-סגור · אין ערך-חוץ">
                    {fmtMu(data.ours.vol24Mu)}µ
                    {data.ours.trades24 !== null && <span className="mr-1.5 text-[9px] font-normal text-zinc-500">{data.ours.trades24.toLocaleString("en-US")} עסקאות</span>}
                  </td>
                  <td className="px-2 py-2 font-mono text-zinc-500">$0.00</td>
                </tr>
              )}
            </tbody>
          </table>
          {data && data.rows.length === 0 && <p className="py-4 text-center text-xs text-zinc-500">הליגה לא נמדדה — אפס-המצאה</p>}
        </div>
        <p className="mt-2 rounded-lg border border-white/5 bg-zinc-950 px-3 py-2 text-[10px] leading-5 text-zinc-500">
          <b className="text-zinc-400">קריאה כנה:</b> עמלות-פרוטוקול הן הדלק של הענקים · הכסף שנשאר אצלם מכל החלפה.
          השורה-שלנו מראה את האמת-המלאה: צבירת-העמלות שלנו <b>יחידות-פנימיות בספר-סגור</b> ואין לה ערך-חוץ — עד שהגשר-החוץ ייפתח בהכרעת-בעלים.
        </p>
      </section>

      {/* ═══ מד-המרחק-מהענקים · מוצר-מול-מוצר (הוראת-הבעלים: "למרות-הטענות-של-הסוכנים") ═══ */}
      {gapData?.gap && gapData.gap.ok && (
        <section className="rounded-2xl border border-amber-600/30 bg-gradient-to-l from-amber-950/20 via-zinc-900/60 to-zinc-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-zinc-100">מד-המרחק-מהענקים · מוצר-מול-מוצר, לא-טענה-מול-טענה</h3>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-5 text-zinc-400">{gapData.gap.answerHe}</p>
            </div>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-[10px] font-bold text-amber-400">
              {gapData.gap.capabilities.length} יכולות משוקללות
            </span>
          </div>

          {/* ציוני-המרחק — מחושבים-מהמשקלים, לא-מוכרזים */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-600/25 bg-zinc-950 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-bold text-amber-400">המרחק-שלנו (SAOS DEX)</p>
                <p className="font-mono text-2xl font-black text-amber-400">{gapData.gap.score.ours != null ? `${gapData.gap.score.ours.toFixed(1)}%` : "—"}</p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${gapData.gap.score.ours ?? 0}%` }} />
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-500">כן=1 · חלקי=0.5 · אין=0 · משוקלל-לפי-חשיבות-להיות-ענק</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-bold text-zinc-300">קו-הבסיס של הענקים (Uniswap/Jupiter)</p>
                <p className="font-mono text-2xl font-black text-zinc-100">{gapData.gap.score.giants != null ? `${gapData.gap.score.giants.toFixed(1)}%` : "—"}</p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-zinc-400 transition-all" style={{ width: `${gapData.gap.score.giants ?? 0}%` }} />
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-500">עובדות-מקור-ציבורי (docs · wallet · DefiLlama) — לא-שיווק</p>
            </div>
          </div>

          {/* טבלת-היכולות */}
          <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-white/10" role="region" aria-label="מטריצת-היכולות">
            <table className="w-full min-w-[720px] text-right text-[11px]">
              <thead className="sticky top-0 bg-zinc-950/95 text-[9px] uppercase text-zinc-500 backdrop-blur">
                <tr>
                  <th className="px-3 py-2">יכולת</th>
                  <th className="px-3 py-2">משקל</th>
                  <th className="px-3 py-2">הענקים</th>
                  <th className="px-3 py-2">העובדה-אצלם</th>
                  <th className="px-3 py-2">אנחנו</th>
                  <th className="px-3 py-2">ההוכחה-אצלנו</th>
                </tr>
              </thead>
              <tbody>
                {gapData.gap.capabilities.map((c) => (
                  <tr key={c.id} className={`border-t border-white/5 ${c.gapClosedAt ? "bg-emerald-500/[0.04]" : ""}`}>
                    <td className="px-3 py-2 font-bold text-zinc-200">
                      {c.he}
                      {c.gapClosedAt && <span className="mr-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black text-emerald-400">נסגר</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-500">×{c.weight}</td>
                    <td className="px-3 py-2">{verdictChip(c.giant)}</td>
                    <td className="px-3 py-2 leading-5 text-zinc-500">{c.giantFact}</td>
                    <td className="px-3 py-2">{verdictChip(c.ours)}</td>
                    <td className="px-3 py-2 leading-5 text-zinc-400">{c.oursProof}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* הצעדים-הבאים — הדרך-לענקים */}
          <div className="mt-3 flex flex-wrap gap-2">
            {gapData.gap.gapPlan.map((p) => (
              <span key={p.next} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[10px] leading-5 text-zinc-400" title={p.why}>
                <b className="text-amber-400">→ {p.next}</b> · {p.why}
                {p.ownerDecision && <span className="mr-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black text-amber-400">הכרעת-בעלים</span>}
              </span>
            ))}
          </div>

          {/* ביקורת-חי-עצמית + מקורות */}
          <p className="mt-3 rounded-lg border border-white/5 bg-zinc-950 px-3 py-2 text-[10px] leading-5 text-zinc-500">
            <b className="text-zinc-400">ביקורת-חי-עצמית:</b>{" "}
            מנוע {gapData.gap.liveAudit.engineRunning ? <span className="font-bold text-emerald-400">חי</span> : "לא-רץ"}
            {gapData.gap.liveAudit.engineTicks != null ? ` · ${gapData.gap.liveAudit.engineTicks.toLocaleString("en-US")} טיקים` : ""}
            {gapData.gap.liveAudit.realTradesTotal != null ? ` · ${gapData.gap.liveAudit.realTradesTotal.toLocaleString("en-US")} עסקאות-אמת` : ""}
            {gapData.gap.liveAudit.openLimitOrders != null ? ` · ${gapData.gap.liveAudit.openLimitOrders} פקודות-לימיט פתוחות (מתוך ${gapData.gap.liveAudit.limitOrdersTotal})` : ""}
            {" · "}מקורות: {gapData.gap.sources.map((x) => x.url).join(" · ")}
          </p>
        </section>
      )}

      {/* ═══ משטחי-הצי — ההצטרפות ═══ */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-zinc-300">משטחי-הצי · כל-המוצרים-החיים של הרשת — דלת-אחת</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FLEET_SURFACES.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 transition hover:border-amber-600/40 hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-zinc-100 group-hover:text-amber-400">{s.label}</span>
                <span className="text-amber-500/60 transition group-hover:text-amber-400">↗</span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">{s.he}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
