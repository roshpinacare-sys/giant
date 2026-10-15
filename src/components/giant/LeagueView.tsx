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

export function GiantsView() {
  const [data, setData] = useState<LeaguePayload | null>(null);
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
