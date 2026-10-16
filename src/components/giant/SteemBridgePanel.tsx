"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowDownNarrowWide, ArrowUpNarrowWide, Link2, RefreshCw } from "lucide-react";

/* ═══ פאנל-גשר-סטים — השוק-האמיתי של סטים על-המסך ═══════════════════════
 * הוראת-הבעלים (trace 1a146513162051a5): "הכל בדקס יהיה נזיל — נשתמש בשוק
 * של סטימיט ועוד". הפאנל מציג רק-אמת:
 *  · השוק-הפנימי של סטים מהשרשרת (עומק-אמת: bids/asks אמיתיים)
 *  · סימני-האורקל (STEEM/SBD ל-USD, מוצלבים משני-מקורות)
 *  · בריכות-הגישור שלנו ומצב-ההצמדה (סטייה-מדודה מהאורקל)
 *  · פעילות-שסתום-ההצמדה (עסקאות-תיקון-אמת)
 * אם-האורקל לא-זמין — כתוב-במפורש. אפס-מספרים-מצוירים. */

interface BookLevel {
  price: number;
  steem: number;
  sbd: number;
  totalSbd: number;
}
interface SteemMarketPayload {
  ok: boolean;
  snapshot?: {
    at: number;
    internal: {
      live: boolean;
      latestSbdPerSteem: number | null;
      lowestAskSbd: number | null;
      highestBidSbd: number | null;
      spreadPct: number | null;
      volume24hSbd: number | null;
      medianSbdPerSteem: number | null;
      bids: BookLevel[];
      asks: BookLevel[];
      depthSbd: number | null;
    };
    usd: { steemUsd: number | null; sbdUsd: number | null; source: string | null };
    oracle: { steemUsds: number | null; sbdUsds: number | null; fresh: boolean };
  };
  pools?: {
    base: string;
    pairId: string;
    price: number;
    target: number | null;
    devPct: number | null;
    pegged: boolean;
    reserveBase: number;
    reserveQuote: number;
    tvlUsds: number;
    vol24h: number;
  }[];
  health?: {
    valveRunning?: boolean;
    runs?: number;
    actions?: number;
    skippedOracle?: number;
    lastRunAt?: string | null;
    lastAction?: { pair: string; side: string; amountIn: number; outAmount: number; devPct: number } | null;
    lastError?: string | null;
  } | null;
}

const f = (n: number | null | undefined, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";

export function SteemBridgePanel() {
  const [d, setD] = useState<SteemMarketPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/dex/steem/market", { cache: "no-store" });
        const j = (await r.json()) as SteemMarketPayload;
        if (!alive) return;
        setD(j);
        setErr(j.ok ? null : "השרת מדווח-כשל");
      } catch {
        if (alive) setErr("השרת לא נגיש");
      }
    }
    void load();
    const iv = setInterval(load, 15_000); // אורקל-מטמון-20ש׳ — סקירה-כל-15ש׳
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const snap = d?.snapshot;
  const pools = d?.pools ?? [];
  const health = d?.health ?? null;

  return (
    <section className="rounded-2xl border border-sky-700/30 bg-zinc-900/60 p-5" dir="rtl" aria-label="גשר-סטים">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-zinc-100">
            <Link2 className="h-4 w-4 text-sky-400" aria-hidden />
            גשר-סטים · השוק-האמיתי של סטימיט — נזילות-חיה
          </h3>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            שוק-הפנימי STEEM/SBD מהשרשרת · אורקל {snap?.usd.source ?? "—"} · שסתום-הצמדה 10ש׳
          </p>
        </div>
        <div className="flex items-center gap-2">
          {snap?.oracle.fresh ? (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-400" title="אורקל-חי מתוק">
              אורקל-חי
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-400" title="האורקל לא-זמין-כרגע — השסתום מדלג בכנות">
              אורקל-לא-זמין
            </span>
          )}
          {health?.valveRunning && (
            <span className="flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-[10px] font-black text-sky-400">
              <RefreshCw className="h-3 w-3 animate-spin [animation-duration:3s]" aria-hidden />
              שסתום · {f(health.actions ?? 0, 0)} תיקונים
            </span>
          )}
        </div>
      </div>

      {err && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs font-bold text-red-300">{err}</p>
      )}

      {/* סימני-אורקל */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="סימן-STEEM בדולרים (מוצלב CoinGecko+HTX)">
          <p className="text-[9px] font-bold uppercase text-zinc-500">STEEM / USD</p>
          <p className="mt-1 font-mono text-sm font-black text-zinc-100">${f(snap?.usd.steemUsd, 5)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="סימן-SBD בדולרים (SBD נסחר-במחיר-חופשי)">
          <p className="text-[9px] font-bold uppercase text-zinc-500">SBD / USD</p>
          <p className="mt-1 font-mono text-sm font-black text-zinc-100">${f(snap?.usd.sbdUsd, 4)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="השוק-הפנימי של סטים · עסקה-אחרונה">
          <p className="text-[9px] font-bold uppercase text-zinc-500">STEEM / SBD (שרשרת)</p>
          <p className="mt-1 font-mono text-sm font-black text-zinc-100">{f(snap?.internal.latestSbdPerSteem, 5)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950 p-3" title="נפח-24h אמת בשוק-הפנימי + פיזור-ביד-המכר/הקנייה">
          <p className="text-[9px] font-bold uppercase text-zinc-500">נפח-24h · פיזור</p>
          <p className="mt-1 font-mono text-sm font-black text-zinc-100">
            {f(snap?.internal.volume24hSbd, 0)} SBD · {f(snap?.internal.spreadPct, 2)}%
          </p>
        </div>
      </div>

      {/* עומק-אמת מהשרשרת */}
      {snap?.internal.live && (snap.internal.asks.length > 0 || snap.internal.bids.length > 0) ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="עומק-השוק-הפנימי">
          <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-black text-rose-300">
              <ArrowUpNarrowWide className="h-3 w-3" aria-hidden />
              היצע (asks) · מוכרי-STEEM
            </p>
            <table className="mt-1.5 w-full text-[10px]">
              <tbody>
                {snap.internal.asks.slice(0, 5).map((l, i) => (
                  <tr key={`ask-${l.price}-${i}`} className="border-b border-white/5 last:border-0">
                    <td className="py-0.5 font-mono text-rose-300">{f(l.price, 5)}</td>
                    <td className="py-0.5 text-left font-mono text-zinc-400">{f(l.steem, 0)} STEEM</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-black text-emerald-300">
              <ArrowDownNarrowWide className="h-3 w-3" aria-hidden />
              ביקוש (bids) · קוני-STEEM
            </p>
            <table className="mt-1.5 w-full text-[10px]">
              <tbody>
                {snap.internal.bids.slice(0, 5).map((l, i) => (
                  <tr key={`bid-${l.price}-${i}`} className="border-b border-white/5 last:border-0">
                    <td className="py-0.5 font-mono text-emerald-300">{f(l.price, 5)}</td>
                    <td className="py-0.5 text-left font-mono text-zinc-400">{f(l.steem, 0)} STEEM</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-zinc-600 sm:col-span-2">
            עומק-מוצג: {f(snap.internal.depthSbd, 0)} SBD · מקור: condenser_api.get_order_book (עומק-אמת מהשרשרת של סטים)
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[10px] text-zinc-500">
          ספר-העומק-מהשרשרת לא-זמין-כרגע — לא-ממציאים עומק.
        </p>
      )}

      {/* בריכות-הגישור + הצמדה */}
      {pools.length > 0 ? (
        <div className="mt-3 space-y-2" aria-label="בריכות-הגישור">
          {pools.map((p) => {
            const devAbs = p.devPct !== null ? Math.abs(p.devPct) : null;
            const barPct = devAbs !== null ? Math.min(100, (devAbs / 3) * 100) : null; // סקאלה-0..3%
            return (
              <div key={p.pairId || p.base} className="rounded-xl border border-white/10 bg-zinc-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-zinc-100">
                    {p.base}/USDS <span className="font-mono font-normal text-zinc-400">· מחיר {f(p.price, 6)}</span>
                  </p>
                  {p.pegged ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black text-emerald-400">מוצמד · {f(p.devPct, 3)}%</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-black text-amber-400">סוטה · {f(p.devPct, 3)}%</span>
                  )}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`סטיית-הצמדה ${f(p.devPct, 3)}%`}>
                  <div
                    className={`h-full rounded-full ${p.pegged ? "bg-emerald-500/70" : "bg-amber-500/80"}`}
                    style={{ width: `${barPct ?? 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  רזרבות: {f(p.reserveBase, 0)} {p.base} + {f(p.reserveQuote, 0)} USDS · TVL {f(p.tvlUsds, 0)} USDS · יעד-אורקל {f(p.target, 6)} · נפח-24h {f(p.vol24h, 0)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[10px] text-zinc-500">
          בריכות-הגישור נזרעות-בגנזיס-הראשון-שהאורקל-חי (ניסיון-חוזר-אוטומטי בכל-קריאה).
        </p>
      )}

      {/* פעילות-שסתום */}
      {health?.lastAction ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-sky-600/25 bg-sky-500/[0.05] px-3 py-2 text-[10px] text-sky-300">
          <Activity className="h-3 w-3" aria-hidden />
          תיקון-אחרון: {health.lastAction.side === "BUY" ? "קנייה" : "מכירה"} {f(health.lastAction.amountIn, 2)} {health.lastAction.pair} · סטייה-שנמדדה {f(health.lastAction.devPct * 100, 3)}%
        </p>
      ) : (
        <p className="mt-3 text-[10px] text-zinc-600">
          {health?.lastError ? `שסתום: ${health.lastError}` : "אין-תיקונים-נדרשים — הבריכות בטווח-ההצמדה"}
        </p>
      )}
    </section>
  );
}
