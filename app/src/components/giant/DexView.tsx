"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CandleChart } from "./CandleChart";

/* ═══ דקס — שטח-מסחר אמיתי על מצב-המנוע מהגיט (saos-dex/db) ═════════════
 * זוגות-אמת · נרות-OHLCV · ווליום/עסקאות-יומי · pools · ARMED-LIVE ·
 * מטבעות-גדולים כהקשר. הכל מדיד; SIM-מוצהר לעולם לא מוצג כ-live. */

interface Candle { t: number; o: number; h: number; l: number; c: number; vMu: number; qMu: number; n: number }
interface DexPayload {
  ok: boolean; note?: string; savedAt: string | null; height: number | null;
  pairs: { name: string; candles: Candle[] }[];
  poolPairs: { pair: string; reserves: { a: string; b: string; ra: number; rb: number } }[];
  treasuryProfit: number | null; treasuryProfitEver: number | null; feeMeter: number | null;
  ordersOpen: number | null;
  metrics: { day: string; beats: number; ticks: number; fills: number; swaps: number; height: number; vol24QuoteMu: number; trades24: number }[];
  grid: { verdict: string; engine: string; chains: string[]; armed: boolean; real: boolean; publishedAt: string | null; hive: { ok: boolean; publishedAt: string | null } | null } | null;
  fetchedAt: string;
}
interface CoinRow { id: string; symbol: string; name: string; priceUsd: number | null; change24h: number | null }
interface MarketPayload { ok: boolean; coins: CoinRow[]; fetchedAt: string }

function fmtMu(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
function fmtNum(v: number): string {
  return v.toLocaleString("en-US");
}
function timeHe(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function DexView() {
  const [dex, setDex] = useState<DexPayload | null>(null);
  const [mkt, setMkt] = useState<MarketPayload | null>(null);
  const [err, setErr] = useState("");
  const [pair, setPair] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/giant/dex", { cache: "no-store" }).then((r) => r.json() as Promise<DexPayload>),
        fetch("/api/giant/market", { cache: "no-store" }).then((r) => r.json() as Promise<MarketPayload>),
      ]);
      setDex(a);
      setMkt(b);
      setErr(a.ok ? "" : a.note ?? "לא נמדד");
      if (!pair && a.pairs.length) setPair(a.pairs[0].name);
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, [pair]);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  const active = useMemo(() => dex?.pairs.find((p) => p.name === pair) ?? dex?.pairs[0] ?? null, [dex, pair]);
  const last = active?.candles[active.candles.length - 1] ?? null;
  const prev = active?.candles[active.candles.length - 2] ?? null;
  const change = last && prev && prev.c > 0 ? ((last.c - prev.c) / prev.c) * 100 : null;
  const volSum = active ? active.candles.reduce((s, c) => s + c.qMu, 0) : 0;

  return (
    <div className="space-y-4" dir="rtl">
      {/* פס-עליון: מצב-המנוע */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <span className="text-sm font-black text-zinc-100">הדקס-הריבוני · SAOS/USDS</span>
        {dex?.ok && (
          <>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">SIM-מוצהר</span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">height {dex.height ? fmtNum(dex.height) : "—"}</span>
            {dex.grid?.armed && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">grid {dex.grid.verdict || "ARMED-LIVE"}</span>
            )}
            <span className="text-[10px] text-zinc-500">snapshot {timeHe(dex.savedAt)}</span>
          </>
        )}
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        {/* ═══ אזור-המסחר ═══ */}
        <div className="space-y-4">
          {/* בחירת-זוג + מחיר */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {(dex?.pairs ?? []).map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setPair(p.name)}
                    className={`h-9 rounded-lg px-3 font-mono text-xs font-bold transition ${p.name === active?.name ? "bg-amber-600 text-zinc-950" : "border border-white/10 text-zinc-400 hover:text-zinc-200"}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {last && (
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-black text-zinc-50">{fmtMu(last.c)}</span>
                  <span className="text-[10px] text-zinc-500">µUSDS</span>
                  {change !== null && (
                    <span className={`text-xs font-bold ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="p-2" style={{ height: 340 }}>
              <CandleChart candles={active?.candles ?? []} height={330} />
            </div>
            {last && (
              <div className="grid grid-cols-3 gap-2 border-t border-white/10 px-4 py-2 text-center text-[11px] sm:grid-cols-6">
                {[
                  ["נפתח", fmtMu(last.o)],
                  ["גבוה", fmtMu(last.h)],
                  ["נמוך", fmtMu(last.l)],
                  ["וול זוג", `${fmtMu(volSum)}µ`],
                  ["פוזיציות", fmtNum(last.n)],
                  ["מדוד", timeHe(dex?.fetchedAt ?? null).split(", ")[1] ?? "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-zinc-500">{l}</p>
                    <p className="font-mono font-bold text-zinc-200">{v}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* מדדים-יומיים אמיתיים */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <h3 className="mb-2 text-sm font-bold text-zinc-300">מדדי-המנוע — ימים אחרונים (ווליום-כנות)</h3>
            <div className="max-h-56 overflow-y-auto pr-1">
              <table className="w-full text-right text-xs">
                <thead className="text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1.5">יום</th>
                    <th className="px-2 py-1.5">ווליום 24ש' (µUSDS)</th>
                    <th className="px-2 py-1.5">עסקאות-24ש'</th>
                    <th className="px-2 py-1.5">fills</th>
                    <th className="px-2 py-1.5">swaps</th>
                    <th className="px-2 py-1.5">beats</th>
                    <th className="px-2 py-1.5">גובה</th>
                  </tr>
                </thead>
                <tbody>
                  {(dex?.metrics ?? []).slice().reverse().map((d) => (
                    <tr key={d.day} className="border-t border-white/5">
                      <td className="px-2 py-1.5 font-mono text-zinc-300">{d.day}</td>
                      <td className="px-2 py-1.5 font-mono font-bold text-amber-400">{fmtMu(d.vol24QuoteMu)}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-300">{fmtNum(d.trades24)}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-400">{fmtNum(d.fills)}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-400">{fmtNum(d.swaps)}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-400">{fmtNum(d.beats)}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-500">{fmtNum(d.height)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dex && dex.metrics.length === 0 && <p className="py-3 text-center text-xs text-zinc-500">אין מדדים נמדדים</p>}
            </div>
          </section>

          {/* pools */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <h3 className="mb-2 text-sm font-bold text-zinc-300">נזילות · pools המנוע</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {(dex?.poolPairs ?? []).map((p) => (
                <div key={p.pair} className="rounded-xl border border-white/5 bg-zinc-950 p-3">
                  <p className="font-mono text-xs font-bold text-zinc-200">{p.pair}</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                    <span className="text-zinc-500">{p.reserves.a}: <b className="font-mono text-zinc-300">{fmtMu(p.reserves.ra)}</b></span>
                    <span className="text-zinc-500">{p.reserves.b}: <b className="font-mono text-zinc-300">{fmtMu(p.reserves.rb)}</b></span>
                  </div>
                </div>
              ))}
            </div>
            {dex && dex.poolPairs.length === 0 && <p className="text-xs text-zinc-500">אין pools נמדדים</p>}
          </section>
        </div>

        {/* ═══ עמודה-צידית ═══ */}
        <div className="space-y-4">
          {/* מטבעות-גדולים */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <h3 className="mb-2 text-xs font-bold text-zinc-400">מטבעות-גדולים · הקשר-שוק</h3>
            <div className="space-y-1.5">
              {(mkt?.coins ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-950 px-2.5 py-2">
                  <span className="font-mono text-xs font-bold text-zinc-200">{c.symbol}</span>
                  <span className="font-mono text-xs text-zinc-300">{c.priceUsd === null ? "—" : `$${c.priceUsd >= 1000 ? c.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 }) : c.priceUsd.toFixed(2)}`}</span>
                  <span className={`w-16 text-left font-mono text-[11px] ${c.change24h === null ? "text-zinc-600" : c.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {c.change24h === null ? "—" : `${c.change24h >= 0 ? "+" : ""}${c.change24h.toFixed(2)}%`}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-zinc-600">steem/hive — שכבת-עגין בלבד, לא-חזית</p>
          </section>

          {/* רווחי-אוצר */}
          <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-4">
            <h3 className="mb-2 text-xs font-bold text-amber-400">רווחי-האוצר מהמנוע</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">רווח-שוטף</span><span className="font-mono font-bold text-zinc-100">{dex?.treasuryProfit === null ? "—" : fmtMu(dex?.treasuryProfit ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">מאז-תחילת-החיים</span><span className="font-mono font-bold text-zinc-100">{dex?.treasuryProfitEver === null ? "—" : fmtMu(dex?.treasuryProfitEver ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">fee-meter</span><span className="font-mono font-bold text-zinc-100">{dex?.feeMeter === null ? "—" : fmtMu(dex?.feeMeter ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">פקודות-פתוחות</span><span className="font-mono font-bold text-zinc-100">{dex?.ordersOpen === null ? "—" : fmtNum(dex?.ordersOpen ?? 0)}</span></div>
            </div>
          </section>

          {/* grid-ציבורי */}
          {dex?.grid && (
            <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
              <h3 className="mb-1.5 text-xs font-bold text-zinc-400">שכבת-הגריד הציבורית</h3>
              <p className={`text-[11px] font-bold ${dex.grid.armed ? "text-emerald-400" : "text-amber-400"}`}>{dex.grid.verdict || "—"}</p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">{dex.grid.engine}</p>
              <p className="mt-1 text-[10px] text-zinc-600">רשתות: {dex.grid.chains.join(" · ")} · פורסם {timeHe(dex.grid.publishedAt)}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
