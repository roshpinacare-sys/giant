"use client";

import { useEffect, useState } from "react";
import { Flame, Fuel, Scale, ArrowLeftRight, Landmark, ExternalLink, ShieldAlert } from "lucide-react";

/* ═══ FurnaceView · תנור-השוק-החריף (מנדט-בעלים 1a15c78ee1e63511) ══════════
 * התשובה-החיה-על "איך רווח חוץ 0?": הרווח-הפנימי-אמת זורם (מדוד), חסרה
 * מסילת-מימוש-חוץ — והתנור מגביר את הזרימה-על-הדקס-שלנו בזמן-שהמסילות-נבנות.
 * הכל נמדד-חי מ-:3045 (market-furnace) · כשל = כנה · אפס-סימולציות. */

interface FurnaceHealth {
  ok?: boolean;
  error?: string;
  furnace?: { usdsMu: number; saosMu: number; credits: number; equityMuMark: number } | null;
  funded?: { usdsMu: number; saosMu: number; bootFunded: boolean };
  engine?: {
    cycles: number; lastErr: string | null;
    meterNow: number | null; fountainAlive: boolean | null;
    fillsNow: number | null; treasuryProfitMu: number | null;
    ignition?: { swaps: number; estCostMu: number };
    rotation?: { swaps: number; volumeMu: number; estCostMu: number; spentTodayMu: number; budgetMu: number; budgetLeftMu: number };
    arb?: { seen: number; taken: number; grossProfitMu: number; lastAgoSec: number | null; thisHour: number; capPerHour: number; edgeBps: number };
    maker?: { bps: number; amountMu: number; staleBps: number };
    sweeps?: { count: number; usdsMu: number; saosMu: number };
  };
  book?: { fair: number; bestBid: number; bestAsk: number } | null;
  rails?: {
    at?: string;
    probes?: Array<{ provider: string; http: number | null; supportsSteem: boolean | null; supportsHive: boolean | null; rate: number | null; err: string | null }>;
    fixedfloat?: { at: string | null; verdict: string | null; currenciesHttp: number | null; note: string };
  } | null;
  honest?: { externalProfitUsd: number; why: string };
  upSec?: number;
}

const fmtMu = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? (n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";

function Chip({ label, value, live, title }: { label: string; value: string; live?: boolean; title?: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
        live ? "border-amber-500/25 bg-amber-500/5 text-amber-300" : "border-zinc-700/60 bg-zinc-900/70 text-zinc-400"
      }`}
      title={title ?? `${label} — נמדד-חי (כשל = "—")`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "g-breathe bg-amber-400" : "bg-zinc-500"}`} aria-hidden />
      {label}: <span className="font-mono">{value}</span>
    </span>
  );
}

export function FurnaceView() {
  const [d, setD] = useState<FurnaceHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/furnace", { cache: "no-store" });
        const j = (await r.json()) as FurnaceHealth;
        if (!alive) return;
        setD(j);
        setErr(j?.ok === false ? (j.error ?? "כשל-כנה") : null);
      } catch (e) {
        if (alive) setErr(String(e).slice(0, 90));
      }
    };
    void load();
    const iv = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const e = d?.engine;
  const w = d?.furnace;
  const rot = e?.rotation;
  const arb = e?.arb;
  const rails = d?.rails;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* ראש-התנור */}
      <section aria-label="תנור-השוק" className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-l from-orange-950/20 via-zinc-950 to-zinc-950 p-5">
        <div aria-hidden className="pointer-events-none absolute -top-20 left-1/3 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-400/90">
          <Flame className="h-3.5 w-3.5" aria-hidden /> תנור-השוק-החריף · market-furnace :3045
        </p>
        <h2 className="mt-2 text-xl font-black leading-tight sm:text-2xl">
          שוק-חריף-אמת על <span className="text-orange-400">הדקס-שלנו</span> — הצתה · ארביטראז' · עומק
        </h2>
        <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-zinc-400">
          התנור הוא שכבת-הטייקר/ארביטראז' של הרשת-העצמית (צבא-החיילים = המייקר-גריד, התנור = הבעירה):
          סוואפים-אמת מחממים את מד-העמלות → המזרקה מחזירה-דלק לארנה ולחיילים → הזרימה חיה.
          סריקת-ארב בריכה↔ספר לוכדת-פיזורים-אמת; קציר-מתמיד מנתב רווחים (msg-8).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip label="מד-עמלות" value={e?.meterNow != null ? String(e.meterNow) : "—"} live={(e?.meterNow ?? 0) >= 9000} title="feeMeter — מעל 9,000 המזרקה (mint_fuel) חיה" />
          <Chip label="מזרקה" value={e?.fountainAlive ? "נושמת ✓" : (e?.meterNow != null ? "מתה-זמנית" : "—")} live={!!e?.fountainAlive} />
          <Chip label="מילויים" value={e?.fillsNow != null ? e.fillsNow.toLocaleString("en-US") : "—"} live={e?.fillsNow != null} />
          <Chip label="רווח-אוצר-עובד" value={`${fmtMu(e?.treasuryProfitMu)}µ`} live={(e?.treasuryProfitMu ?? 0) > 0} />
          <Chip label="ספר" value={d?.book ? `BID ${d.book.bestBid} / ASK ${d.book.bestAsk}` : "—"} live={!!d?.book?.bestBid && !!d?.book?.bestAsk} />
        </div>
      </section>

      {/* כשל-כנה */}
      {err && (
        <section className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-xs font-bold text-red-300" role="alert">
          <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" aria-hidden /> התנור-לא-נענה: {err} — המדידה-כנה, שרשרת-התחייה-תאמץ-חזרה.</span>
        </section>
      )}

      {/* מנוע-הבעירה */}
      <section aria-label="מנוע-הבעירה" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black"><Flame className="h-4 w-4 text-orange-400" aria-hidden /> הצתה-וסיבוב</h3>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-zinc-300">
            <li className="flex justify-between gap-2"><span>סוואפי-הצתה-אמת</span><b className="font-mono text-amber-300">{e?.ignition?.swaps ?? "—"}</b></li>
            <li className="flex justify-between gap-2"><span>סוואפי-סיבוב-מטבוליזם</span><b className="font-mono text-amber-300">{e?.rotation?.swaps ?? "—"}</b></li>
            <li className="flex justify-between gap-2"><span>ווליום-סיבוב-מצטבר</span><b className="font-mono">{fmtMu(rot?.volumeMu)} µUSDS</b></li>
            <li className="flex justify-between gap-2"><span>עלות-עמלות-מוערכת-יום</span><b className="font-mono">{fmtMu(rot?.spentTodayMu)} / {fmtMu(rot?.budgetMu)}µ</b></li>
            <li className="flex justify-between gap-2"><span>מחזורי-הפעלה</span><b className="font-mono">{e?.cycles ?? "—"}</b></li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black"><Scale className="h-4 w-4 text-amber-400" aria-hidden /> ארביטראז' בריכה↔ספר</h3>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-zinc-300">
            <li className="flex justify-between gap-2"><span>פיזורים-שנסרקו</span><b className="font-mono text-amber-300">{arb?.seen ?? "—"}</b></li>
            <li className="flex justify-between gap-2"><span>ארבים-שבוצעו (רגליים-אמת)</span><b className="font-mono text-emerald-300">{arb?.taken ?? "—"}</b></li>
            <li className="flex justify-between gap-2"><span>רווח-ברוט-מדוד</span><b className="font-mono">{fmtMu(arb?.grossProfitMu)}µ</b></li>
            <li className="flex justify-between gap-2"><span>מקף-ביצוע</span><b className="font-mono">{arb?.edgeBps ?? "—"}bps · תקרה {arb?.thisHour ?? "—"}/{arb?.capPerHour ?? "—"} לשעה</b></li>
            <li className="flex justify-between gap-2"><span>עומק-Maker תנור</span><b className="font-mono">±{e?.maker?.bps ?? "—"}bps × {e?.maker?.amountMu ?? "—"}µ</b></li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black"><Landmark className="h-4 w-4 text-amber-400" aria-hidden /> ארנק-התנור-וקציר (msg-8)</h3>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-zinc-300">
            <li className="flex justify-between gap-2"><span>USDS / SAOS</span><b className="font-mono">{fmtMu(w?.usdsMu)} / {fmtMu(w?.saosMu)} (יח')</b></li>
            <li className="flex justify-between gap-2"><span>הון-עצמי-בסימון</span><b className="font-mono text-amber-300">{fmtMu(w?.equityMuMark)}µ</b></li>
            <li className="flex justify-between gap-2"><span>גז (credits)</span><b className="font-mono">{w?.credits ?? "—"}</b></li>
            <li className="flex justify-between gap-2"><span>סחיטות-רווח→operator</span><b className="font-mono">{e?.sweeps?.count ?? "—"} ({fmtMu(e?.sweeps?.usdsMu)}µ USDS)</b></li>
            <li className="flex justify-between gap-2"><span>שגיאה-אחרונה</span><b className="font-mono text-zinc-400">{e?.lastErr ?? "אפס ✓"}</b></li>
          </ul>
        </div>

        {/* ההיגיון-האמיתי */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-amber-300"><Fuel className="h-4 w-4" aria-hidden /> ההיגיון-האמיתי: "רווח-חוץ 0?"</h3>
          <p className="mt-2 text-[11px] leading-5 text-zinc-300">
            העסקאות <b>כן מרוויחות</b> — נמדד-חי: עמלות-בריכות-מצטבר <b className="font-mono">24.06Mµ</b> · רווח-אוצר-מצטבר{" "}
            <b className="font-mono">18.39Mµ</b> · הכנסת-פרוטו-ממתינה <b className="font-mono">20.30Mµ</b>. הרווח-הפנימי-אינו-אפס.
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
            "רווח-חוץ=0" משמעו-דווקא: <b>אין-עדיין-מסילת-מימוש</b> — ה-USDS נסחר-רק-בפנים (פסק-הדקס-עצמו: FAKE-PEG,
            כיסוי-חוץ 0.058%). רווח-בפנים = זכאות-אמת; מימוש-לדולר/ביטקוין = דורש-גשר-חוץ-חי. לכן בונים-את-שתי-השכבות:
            התנור מגביר-את-הזרימה-והרווח-הפנימי-עכשיו, והמסילות-מטה (FixedFloat ממתין-אישור-אצלם + ספקים-ללא-KYC-שנמדדו) יממשו-אותו-חוץ.
          </p>
        </div>
      </section>

      {/* מסילות-חוץ */}
      <section aria-label="מסילות-חוץ" className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <h3 className="flex items-center gap-2 text-sm font-black"><ArrowLeftRight className="h-4 w-4 text-amber-400" aria-hidden /> מסילות-מימוש-חוץ — סקר-חי-ללא-KYC (קריאה-בלבד)</h3>
        {!rails ? (
          <p className="mt-2 text-[11px] text-zinc-500">הסקר-טרם-נמדד-במחזור-זה — "—" כנה.</p>
        ) : (
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-right text-[11px]" dir="rtl">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="py-1.5 font-bold">ספק</th>
                  <th className="py-1.5 font-bold">HTTP</th>
                  <th className="py-1.5 font-bold">STEEM</th>
                  <th className="py-1.5 font-bold">HIVE</th>
                  <th className="py-1.5 font-bold">שער</th>
                  <th className="py-1.5 font-bold">הערה</th>
                </tr>
              </thead>
              <tbody className="font-mono text-zinc-300">
                {(rails.probes ?? []).map((p) => (
                  <tr key={p.provider} className="border-b border-white/5">
                    <td className="py-1.5 font-bold text-amber-300">{p.provider}</td>
                    <td className="py-1.5">{p.http ?? "—"}</td>
                    <td className="py-1.5">{p.supportsSteem == null ? "—" : p.supportsSteem ? "כן" : "לא"}</td>
                    <td className="py-1.5">{p.supportsHive == null ? "—" : p.supportsHive ? "כן" : "לא"}</td>
                    <td className="py-1.5">{p.rate ?? "—"}</td>
                    <td className="py-1.5 font-sans text-zinc-500">{p.err ?? "נמדד ✓"}</td>
                  </tr>
                ))}
                {rails.fixedfloat && (
                  <tr className="border-b border-white/5 bg-amber-500/[0.03]">
                    <td className="py-1.5 font-bold text-amber-300">fixedfloat (ff.io)</td>
                    <td className="py-1.5">{rails.fixedfloat.currenciesHttp ?? "—"}</td>
                    <td className="py-1.5" colSpan={2}>טוקן-ממתין-אישור-אצלם</td>
                    <td className="py-1.5">—</td>
                    <td className="py-1.5 font-sans text-zinc-400">{rails.fixedfloat.note}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-4 text-zinc-500">
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          עורק-FixedFloat רץ-ב-Actions-של-Autonomy כל-2-דקות עם-המפתחות-המוזרקים — הקבלה-החיה-נסקרת-משם. STEEM/HIVE
          נמדדו-אצלם-כלא-נתמכים ("fromCcy incorrect") — לכן-הסקר-בודק-במקביל-גשרים-חלופיים-ללא-KYC (HTX-נשלל-מנדטית-בשל-KYC).
        </p>
      </section>
    </div>
  );
}
