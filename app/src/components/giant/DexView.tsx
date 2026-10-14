"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CandleChart } from "./CandleChart";
import { Recipe } from "./Recipe";
import { AnimatedNumber } from "./AnimatedNumber";
import { Activity, Coins, Flame, Gauge, TrendingUp, Trophy, Layers, Scale, Rocket, CandlestickChart, Globe2 } from "lucide-react";

/* ═══ הדקס — מרכז-הכובד של הריבונות (GIANT · R360 · V3 מיזוג-צי) ══════════
 * מיזוג-הליינים (T55): שטח-המסחר-עם-נרות-אמת (התאומים, api/giant/dex) +
 * ליגת-הענקים · מפת-מוצרים · שתי-קופות R74 · תא-טיס (הליין-החי).
 * משטח-אחד-לכל-יכולת; הכל נמדד מהגיט; אפס-מספרים-מצוירים. */

interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  vol24hUsd: number | null;
}
interface AssetRow {
  symbol: string;
  refPrice: number | null;
  listed: number | null;
}
interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vMu: number;
  qMu: number;
  n: number;
}
interface DexEnginePayload {
  ok: boolean;
  note?: string;
  savedAt: string | null;
  height: number | null;
  pairs: { name: string; candles: Candle[] }[];
  poolPairs: { pair: string; reserves: { a: string; b: string; ra: number; rb: number } }[];
  treasuryProfit: number | null;
  treasuryProfitEver: number | null;
  feeMeter: number | null;
  ordersOpen: number | null;
  metrics: { day: string; beats: number; ticks: number; fills: number; swaps: number; height: number; vol24QuoteMu: number; trades24: number }[];
  grid: { verdict: string; engine: string; chains: string[]; armed: boolean; real: boolean; publishedAt: string | null; hive: { ok: boolean; publishedAt: string | null } | null } | null;
  fetchedAt: string;
}
interface DexEssentials {
  engine: string | null;
  publishedAt: string | null;
  runAt: string | null;
  ticks: number | null;
  cadenceMin: number | null;
  height: number | null;
  tps: number | null;
  opsTotal: number | null;
  fills: number | null;
  swaps: number | null;
  ladders: number | null;
  liveOrders: number | null;
  treasuryProfitSim: number | null;
  feeMeterMu: number | null;
  gasFundedMu: number | null;
  halted: boolean | null;
  haltReason: string | null;
  dbOk: boolean | null;
  rejectedLastHeight: number | null;
  rejectedLastCount: number | null;
  tickMs: number | null;
  backingWsteem: number | null;
  backingWsbd: number | null;
}
interface MarketPayload {
  ok: boolean;
  note?: string;
  source: string | null;
  cachedAgeMin: number | null;
  coins: CoinRow[];
  anchors: { name: string; note: string }[];
  dex: DexEssentials | null;
  assets: AssetRow[];
  klines: { symbol: string; source: string; candles: { t: number; o: number; h: number; l: number; c: number; v: number }[] }[];
  dexMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
  fetchedAt: string;
}
interface ProductRow {
  id: string;
  name: string;
  status: string;
  blurb: string;
  repo: string;
  url: string;
}
interface ProductsPayload {
  ok: boolean;
  note?: string;
  products: ProductRow[];
  fetchedAt: string;
}
interface GiantRow {
  id: string;
  name: string;
  vol24h: number | null;
  fees24h: number | null;
  category: string | null;
  ours: boolean;
}
interface GiantsPayload {
  ok: boolean;
  note?: string;
  book: string | null;
  publishedAt: string | null;
  familiesCount: number | null;
  league: GiantRow[];
  ours: GiantRow | null;
  oursFills: number | null;
  oursSwaps: number | null;
  econ: { engine: string | null; externalBidExists: boolean | null; internalPriceUsdsMu: number | null; doctrineHe: string | null } | null;
  giantsMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
  econMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
}

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
function fmtVol(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
/* קנון-יחידות (saos-dex kernel.ts:8): 1 = 1000µ · כל-מספר בספר הוא µ.
 * תצוגה-כנה: מחיר = µ÷1000 ב-USDS · כמויות = µ÷1000 ביחידות-שלמות.
 * העיוות-ההיסטורי (הצגת-µ כיחידה) הנפיח כל-סכום ×1000 — תוקן. */
function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const u = v / 1000;
  if (u >= 1000) return u.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (u >= 1) return u.toFixed(u >= 100 ? 2 : 3);
  return u.toFixed(4);
}
function fmtAmt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const u = v / 1000;
  if (Math.abs(u) >= 1e6) return `${(u / 1e6).toFixed(2)}M`;
  return Math.round(u).toLocaleString("en-US");
}
function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US");
}
function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}
function timeHe(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: { icon: typeof Activity; label: string; value: string; sub?: string; tone?: "default" | "amber" | "emerald" }) {
  const border = tone === "amber" ? "border-amber-600/30" : tone === "emerald" ? "border-emerald-600/25" : "border-white/10";
  const color = tone === "amber" ? "text-amber-400" : tone === "emerald" ? "text-emerald-400" : "text-zinc-50";
  return (
    <article className={`rounded-2xl border ${border} bg-zinc-900/60 p-4 transition hover:border-amber-600/40`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-zinc-500">{label}</span>
        <Icon className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
      </div>
      <p className={`mt-2 font-mono text-2xl font-black tracking-tight ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
    </article>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number | null; max: number; color: string }) {
  const pct = value !== null && max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-bold text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">{fmtInt(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* המוצרים נשלפים-חי מהקטלוג (Domain/marketing/products.json) — אפס-מערך-סטטי */

export function DexView() {
  const [data, setData] = useState<MarketPayload | null>(null);
  const [giants, setGiants] = useState<GiantsPayload | null>(null);
  const [eng, setEng] = useState<DexEnginePayload | null>(null);
  const [prods, setProds] = useState<ProductsPayload | null>(null);
  const [err, setErr] = useState("");
  const [pair, setPair] = useState<string | null>(null);
  const [mktPair, setMktPair] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, g, e, p] = await Promise.all([
        fetch("/api/giant/market", { cache: "no-store" }),
        fetch("/api/giant/giants", { cache: "no-store" }),
        fetch("/api/giant/dex", { cache: "no-store" }),
        fetch("/api/giant/products", { cache: "no-store" }),
      ]);
      const d = (await m.json()) as MarketPayload;
      const gl = (await g.json()) as GiantsPayload;
      const en = (await e.json()) as DexEnginePayload;
      const pr = (await p.json()) as ProductsPayload;
      setData(d);
      setGiants(gl);
      setEng(en);
      setProds(pr);
      setErr(d.ok || en.ok ? "" : d.note ?? en.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  const dex = data?.dex ?? null;
  const maxAct = Math.max(dex?.fills ?? 0, dex?.swaps ?? 0, dex?.opsTotal ?? 1);
  const league = giants?.league ?? [];
  const leaderVol = league[0]?.vol24h ?? null;
  const saosPriceMu = giants?.econ?.internalPriceUsdsMu ?? null;

  const active = useMemo(() => eng?.pairs.find((p) => p.name === pair) ?? eng?.pairs[0] ?? null, [eng, pair]);
  const last = active?.candles[active.candles.length - 1] ?? null;
  const prev = active?.candles[active.candles.length - 2] ?? null;
  const change = last && prev && prev.c > 0 ? ((last.c - prev.c) / prev.c) * 100 : null;
  const volSum = active ? active.candles.reduce((s, c) => s + (c.qMu ?? 0), 0) : 0;

  /* השוק-האמיתי: נרות-Binance-חיים של מטבעות-גדולים */
  const mkt = useMemo(() => {
    const list = data?.klines ?? [];
    if (list.length === 0) return null;
    const chosen = list.find((k) => k.symbol === mktPair) ?? list[0];
    const lc = chosen.candles[chosen.candles.length - 1] ?? null;
    const pc = chosen.candles[chosen.candles.length - 2] ?? null;
    const ch = lc && pc && pc.c > 0 ? ((lc.c - pc.c) / pc.c) * 100 : null;
    const vol = chosen.candles.reduce((s, c) => s + c.v * (c.c || 0), 0); // ≈ quote-USD (נגזר משני-מדידים)
    return { chosen, last: lc, change: ch, vol };
  }, [data, mktPair]);

  return (
    <div className="space-y-5" dir="rtl">
      <Recipe
        sources={[
          "saos-dex/db/state-snapshot.json · klines.json · dex-metrics.json · grid-public.json (raw-GitHub · PAT שרת-בלבד)",
          "Kraken → Binance → CoinGecko (שרשרת-מקורות · keyless) + מטמון-כנות עם גיל-מוצהר",
          "Binance /api/v3/klines (נרות-אמת · keyless) · api.llama.fi (ליגה)",
          "Domain/estate: dex/state.json · dex/giants.json · honest-econ.json",
        ]}
        measuredAt={data?.fetchedAt ?? null}
        failNote="חוזה-כשל: כל-מקור שנכשל מוצג 'לא נמדד' — אפס מספרים-מצוירים."
      />
      {/* פס-פיקוד: המטבע-שלנו קודם */}
      <section className="overflow-hidden rounded-2xl border border-amber-600/30 bg-gradient-to-l from-amber-500/[0.07] via-zinc-900/60 to-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 font-black text-xl text-zinc-950" aria-hidden>S</span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-lg font-black text-zinc-50">
                SAOS / USDS
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black text-amber-400">מטבע-הריבונות · מרכז-הכובד</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-bold text-zinc-400">SIM-מוצהר (R74)</span>
                {eng?.grid?.armed && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">grid {eng.grid.verdict || "ARMED-LIVE"}</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                מחיר-ספר-פנימי {saosPriceMu !== null ? `${(saosPriceMu / 1000).toFixed(3)} USDS` : "—"} · אין-ביד-חוץ (מוצהר-כנה)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-5 text-center">
            <div>
              <AnimatedNumber className="font-mono text-xl font-black text-zinc-50" value={dex?.fills ?? giants?.oursFills ?? null} format={(n) => Math.round(n).toLocaleString("en-US")} />
              <p className="text-[10px] font-bold text-zinc-500">fills · ספר-חי</p>
            </div>
            <div>
              <AnimatedNumber className="font-mono text-xl font-black text-zinc-50" value={dex?.swaps ?? giants?.oursSwaps ?? null} format={(n) => Math.round(n).toLocaleString("en-US")} />
              <p className="text-[10px] font-bold text-zinc-500">swaps</p>
            </div>
            <div>
              <AnimatedNumber className="font-mono text-xl font-black text-emerald-400" value={eng?.ordersOpen ?? dex?.liveOrders ?? null} format={(n) => Math.round(n).toLocaleString("en-US")} />
              <p className="text-[10px] font-bold text-zinc-500">הזמנות-חיות</p>
            </div>
            <div>
              <AnimatedNumber className="font-mono text-xl font-black text-amber-400" value={eng?.height ?? dex?.height ?? null} format={(n) => Math.round(n).toLocaleString("en-US")} />
              <p className="text-[10px] font-bold text-zinc-500">גובה-שרשרת</p>
            </div>
          </div>
        </div>
      </section>

      {dex?.halted && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/[0.06] px-4 py-3">
          <p className="text-xs font-bold text-red-400">היפוך-מנוע פעיל (halted) {dex.haltReason ? `· ${dex.haltReason}` : ""} — מוצהר-כנה, אפס-הסתרה</p>
        </section>
      )}

      {/* ═══ שטח-המסחר: נרות-אמת (מיזוג-התאומים) ═══ */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <CandlestickChart className="h-4 w-4 text-amber-500" aria-hidden /> שטח-המסחר · נרות-אמת מהמנוע
          </h3>
          {eng?.savedAt && <span className="text-[10px] text-zinc-500">snapshot {timeHe(eng.savedAt)}</span>}
        </div>
        {!eng && <Skeleton className="m-4 h-72 w-[calc(100%-2rem)] rounded-xl bg-zinc-900" />}
        {eng && eng.pairs.length === 0 && <p className="p-4 text-xs text-zinc-500">אין זוגות-נרות נמדדים כרגע — fail-honest {eng.note ?? ""}</p>}
        {eng && eng.pairs.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {eng.pairs.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setPair(p.name)}
                    aria-pressed={p.name === active?.name}
                    className={`h-9 rounded-lg px-3 font-mono text-xs font-bold transition ${p.name === active?.name ? "bg-amber-600 text-zinc-950" : "border border-white/10 text-zinc-400 hover:text-zinc-200"}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {last && (
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-black text-zinc-50">{fmtPrice(last.c)}</span>
                  <span className="text-[10px] text-zinc-500">USDS / יחידת-בסיס</span>
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
                  ["נפתח", fmtPrice(last.o)],
                  ["גבוה", fmtPrice(last.h)],
                  ["נמוך", fmtPrice(last.l)],
                  ["וול זוג", `${fmtAmt(volSum)} USDS`],
                  ["פוזיציות", fmtInt(last.n ?? null)],
                  ["מדוד", timeHe(eng.fetchedAt).split(", ")[1] ?? "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-zinc-500">{l}</p>
                    <p className="font-mono font-bold text-zinc-200">{v}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ═══ השוק-האמיתי: נרות-אמת של מטבעות-גדולים (Binance keyless) ═══ */}
      <section className="rounded-2xl border border-emerald-600/20 bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Globe2 className="h-4 w-4 text-emerald-500" aria-hidden /> השוק-האמיתי · מטבעות-גדולים · נרות-שעה-חיים
          </h3>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">נרות-אמת · לא-ספר-פנימי</span>
            {mkt?.last && (
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-lg font-black text-zinc-50">{fmtUsd(mkt.last.c)}</span>
                {mkt.change !== null && (
                  <span className={`text-xs font-bold ${mkt.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {mkt.change >= 0 ? "▲" : "▼"} {Math.abs(mkt.change).toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {(data?.klines ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-4 py-2">
            {(data?.klines ?? []).map((k) => (
              <button
                key={k.symbol}
                onClick={() => setMktPair(k.symbol)}
                aria-pressed={k.symbol === mkt?.chosen.symbol}
                className={`h-9 rounded-lg px-3 font-mono text-xs font-bold transition ${k.symbol === mkt?.chosen.symbol ? "bg-emerald-600 text-zinc-950" : "border border-white/10 text-zinc-400 hover:text-zinc-200"}`}
              >
                {k.symbol}
              </button>
            ))}
            <span className="mr-auto font-mono text-[10px] text-zinc-500">ווליום-48ש׳ ≈ {fmtVol(mkt?.vol ?? null)} · {mkt?.chosen.source ?? "—"} · keyless</span>
          </div>
        )}
        <div className="p-2" style={{ height: 300 }}>
          {mkt ? (
            <CandleChart candles={mkt.chosen.candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, vMu: c.v, qMu: c.v * c.c, n: 0 }))} height={290} unit="plain" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              {data ? "נרות-השוק לא נמדדו כרגע — fail-honest (Binance לא הגיב)" : "טוען נרות-אמת…"}
            </div>
          )}
        </div>
      </section>

      {/* מדדי-המנוע — הווליום-הכנה יום-יום (הוכחת-הווליום) */}
      {eng && eng.metrics.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
            <TrendingUp className="h-4 w-4 text-amber-500" aria-hidden /> מדדי-המנוע · ימים-אחרונים (ווליום-כנות, µUSDS)
          </h3>
          <div className="max-h-64 overflow-y-auto pr-1">
            <table className="w-full text-right text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                <tr className="border-b border-white/5">
                  <th className="px-2 py-1.5 font-bold">יום</th>
                  <th className="px-2 py-1.5 font-bold">ווליום 24ש׳</th>
                  <th className="px-2 py-1.5 font-bold">עסקאות-24ש׳</th>
                  <th className="px-2 py-1.5 font-bold">fills</th>
                  <th className="px-2 py-1.5 font-bold">swaps</th>
                  <th className="px-2 py-1.5 font-bold">beats</th>
                  <th className="px-2 py-1.5 font-bold">גובה</th>
                </tr>
              </thead>
              <tbody>
                {eng.metrics.slice().reverse().map((d) => (
                  <tr key={d.day} className="border-b border-white/5 last:border-0">
                    <td className="px-2 py-1.5 font-mono text-zinc-300">{d.day}</td>
                    <td className="px-2 py-1.5 font-mono font-bold text-amber-400">{fmtAmt(d.vol24QuoteMu)}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-300">{fmtInt(d.trades24)}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-400">{fmtInt(d.fills)}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-400">{fmtInt(d.swaps)}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-400">{fmtInt(d.beats)}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-500">{fmtInt(d.height)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* מטבעות-גדולים */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">מטבעות-גדולים ורשתות-מוכרות</h3>
          {data && <span className="text-[10px] text-zinc-500">נמדד {new Date(data.fetchedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}{data.source ? ` · ${data.source}` : ""}</span>}
        </div>
        {err && <p className="mb-2 text-xs font-semibold text-red-400">{err}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!data && [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl bg-zinc-900" />)}
          {(data?.coins ?? []).map((c) => {
            const up = (c.change24h ?? 0) >= 0;
            return (
              <article key={c.id} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 transition hover:border-amber-600/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-zinc-50">{c.symbol}</span>
                  <span className="text-[10px] text-zinc-500">{c.name}</span>
                </div>
                <p className="mt-2 font-mono text-xl font-black tracking-tight text-zinc-50">{fmtUsd(c.priceUsd)}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={c.change24h === null ? "text-zinc-500" : up ? "text-emerald-400" : "text-red-400"}>
                    {c.change24h === null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(c.change24h).toFixed(2)}%`}
                  </span>
                  <span className="text-zinc-500">וול {fmtVol(c.vol24hUsd)}</span>
                </div>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${c.priceUsd !== null ? "bg-zinc-800 text-zinc-400" : "bg-red-500/10 text-red-400"}`}>
                  {c.priceUsd === null
                    ? "לא נמדד · fail-honest"
                    : data.cachedAgeMin !== null
                      ? `נמדד לפני ${data.cachedAgeMin} ד׳ · מטמון-כנות`
                      : `measured · live · ${data.source ?? "market"}`}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      {/* ליגת-הענקים */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> ליגת-הענקים · ווליום 24h (נמדד)
          </h3>
          {giants?.giantsMeta.exists && (
            <span className="font-mono text-[10px] text-zinc-500">
              {giants.book} · sha16:{giants.giantsMeta.sha16?.slice(0, 8)} · גיל {ageHe(giants.giantsMeta.ageMinutes)}
              {giants.familiesCount !== null ? ` · ${giants.familiesCount} משפחות` : ""}
            </span>
          )}
        </div>
        {!giants && <Skeleton className="h-40 w-full rounded-xl bg-zinc-900" />}
        {giants && league.length === 0 && <p className="rounded-xl border border-white/5 bg-zinc-950/60 p-4 text-xs text-zinc-500">הליגה לא נמדדה כרגע — fail-honest {giants.note ?? ""}</p>}
        {league.length > 0 && (
          <div className="space-y-2">
            {league.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center font-mono text-xs font-black text-zinc-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-bold text-zinc-200">{f.name}</span>
                    <span className="shrink-0 font-mono text-xs text-zinc-300">{fmtVol(f.vol24h)}<span className="mr-1.5 text-[9px] text-zinc-600">עמלות {fmtVol(f.fees24h)}</span></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-gradient-to-l from-amber-600 to-amber-400" style={{ width: leaderVol && f.vol24h ? `${Math.max(2, (f.vol24h / leaderVol) * 100)}%` : "2%" }} />
                  </div>
                </div>
              </div>
            ))}
            {giants?.ours && (
              <div className="mt-3 rounded-xl border border-amber-600/30 bg-amber-500/[0.05] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-black text-amber-400">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-600 text-[10px] text-zinc-950" aria-hidden>S</span>
                    SAOS (אנחנו)
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    ווליום-חוץ: <b className="text-zinc-200">אין (R74)</b> · פעולות-ספר: {fmtInt(giants.oursFills)} fills · {fmtInt(giants.oursSwaps)} swaps
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">
                  הכנות-היא-החוק: אין-לנו ביד-קונה-חוץ ואין נזילות-חוץ — הווליום-שלנו נמדד בפעולות-הספר. ההוכחה-הראשונה (ווליום-חוץ-גבוה) נמדדת-בפועל, לא-נטענת.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* pools + תא-הטיס */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-zinc-500">נזילות · pools המנוע</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {(eng?.poolPairs ?? []).map((p) => (
              <div key={p.pair} className="rounded-xl border border-white/5 bg-zinc-950 p-3">
                <p className="font-mono text-xs font-bold text-zinc-200">{p.pair}</p>
                <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                  <span className="text-zinc-500">{p.reserves.a}: <b className="font-mono text-zinc-300">{fmtAmt(p.reserves.ra)}</b></span>
                  <span className="text-zinc-500">{p.reserves.b}: <b className="font-mono text-zinc-300">{fmtAmt(p.reserves.rb)}</b></span>
                </div>
              </div>
            ))}
          </div>
          {eng && eng.poolPairs.length === 0 && <p className="text-xs text-zinc-500">אין pools נמדדים — fail-honest</p>}
          {eng?.grid && (
            <div className="mt-3 rounded-xl border border-white/5 bg-zinc-950/60 px-3 py-2">
              <p className={`text-[11px] font-bold ${eng.grid.armed ? "text-emerald-400" : "text-amber-400"}`}>גריד-ציבורי: {eng.grid.verdict || "—"}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{eng.grid.engine}</p>
              <p className="text-[10px] text-zinc-600">רשתות: {eng.grid.chains.join(" · ")} · פורסם {timeHe(eng.grid.publishedAt)}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-500">
            <Scale className="h-3.5 w-3.5" aria-hidden /> שתי-קופות · כנות-מלאה (R74)
          </h4>
          <div className="space-y-2 text-xs leading-6">
            <p className="flex justify-between"><span className="text-zinc-500">רווח-ספר-שוטף (SIM)</span><span className="font-mono font-bold text-amber-400">{fmtAmt(eng?.treasuryProfit ?? dex?.treasuryProfitSim ?? null)} USDS</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">רווח-ספר מאז-תחילת-החיים</span><span className="font-mono text-zinc-200">{fmtAmt(eng?.treasuryProfitEver ?? null)} USDS</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">feeMeter (µ)</span><span className="font-mono text-zinc-200">{fmtAmt(eng?.feeMeter ?? dex?.feeMeterMu ?? null)}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">gas ממומן (mu)</span><span className="font-mono text-zinc-200">{fmtInt(dex?.gasFundedMu)}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">גיבוי WSTEEM / WSBD</span><span className="font-mono text-zinc-200">{fmtInt(dex?.backingWsteem)} / {fmtInt(dex?.backingWsbd)}</span></p>
            <p className="border-t border-white/5 pt-2 text-[10px] leading-4 text-zinc-600">
              כסף-אמיתי = יתרות-שרשרת בלבד; SAOS = יחידות-סימולציה פנימיות. רווח-בספר ≠ רווח-אמיתי — ההפרדה מוצגת-כאן בכל-מסך.
            </p>
          </div>
        </section>
      </div>

      {/* תא-הטיס: עומק-פעילות */}
      {dex && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">תא-הטיס · עומק-פעילות (ספר-Domain, מדיד)</h4>
            {data?.dexMeta.exists && <span className="font-mono text-[10px] text-zinc-500">sha16:{data.dexMeta.sha16?.slice(0, 8)} · גיל {ageHe(data.dexMeta.ageMinutes)}</span>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Bar label="ops" value={dex.opsTotal} max={maxAct || 1} color="bg-amber-500" />
              <Bar label="fills" value={dex.fills} max={maxAct || 1} color="bg-amber-400" />
              <Bar label="swaps" value={dex.swaps} max={maxAct || 1} color="bg-emerald-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Kpi icon={Gauge} label="גובה-שרשרת" value={fmtInt(dex.height)} sub={dex.engine ?? undefined} tone="amber" />
              <Kpi icon={Flame} label="סולמות" value={fmtInt(dex.ladders)} sub={`tick ${dex.tickMs ?? "—"}ms · ${dex.dbOk ? "db ok" : "db —"}`} tone="emerald" />
            </div>
          </div>
          {dex.rejectedLastCount !== null && dex.rejectedLastCount > 0 && (
            <p className="mt-3 rounded-lg border border-white/5 bg-zinc-950/60 px-3 py-2 text-[11px] leading-5 text-zinc-500">
              דחיות-בלוק-אחרון: <span className="font-mono text-zinc-300">{fmtInt(dex.rejectedLastCount)}</span> בגובה {fmtInt(dex.rejectedLastHeight)} — מוצהר, לא מוסתר
            </p>
          )}
        </section>
      )}

      {/* מפת-מוצרים — חיה מהקטלוג (Domain/marketing/products.json) */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Layers className="h-4 w-4 text-amber-500" aria-hidden /> מפת-המוצרים · כמו-הענקים, רק-טוב-יותר
          </h3>
          {prods && <span className="font-mono text-[10px] text-zinc-500">{prods.products.length} מוצרים · קטלוג-חי{prods.products.length === 0 ? " · fail-honest" : ""}</span>}
        </div>
        {!prods && <Skeleton className="h-24 w-full rounded-xl bg-zinc-900" />}
        {prods && prods.products.length === 0 && <p className="rounded-xl border border-white/5 bg-zinc-950/60 p-4 text-xs text-zinc-500">הקטלוג לא נמדד כרגע — fail-honest {prods.note ?? ""}</p>}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {(prods?.products ?? []).slice(0, 9).map((p) => (
            <article key={p.id || p.name} className="rounded-xl border border-white/10 bg-zinc-950/50 p-3.5 transition hover:border-amber-600/30">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-black text-zinc-100">{p.name}</p>
                {p.status && <span className="shrink-0 rounded-full border border-zinc-600/40 bg-zinc-800/60 px-2 py-0.5 text-[9px] font-black text-zinc-400">{p.status}</span>}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-zinc-500">{p.blurb || "—"}</p>
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block font-mono text-[9px] text-amber-500/80 hover:text-amber-400">
                  {p.url.replace(/^https?:\/\//, "")} ↗
                </a>
              )}
            </article>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-emerald-600/20 bg-emerald-500/[0.04] px-3 py-2 text-[10px] leading-4 text-zinc-400">
          <Rocket className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" aria-hidden />
          סדר-הפתיחה נאטם-בחוק: הוכחת-ווליום על-הדקס (עכשיו) → נגזרות → הלוואות → מינוף. כל-שלב נפתח רק אחרי-הוכחה מדידה של-שלב-לפניו.
        </p>
      </section>

      {/* סל-הנכסים */}
      {data && data.assets.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="mb-3 text-sm font-bold text-zinc-200">סל-הנכסים של הדקס</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 pl-4 font-bold">נכס</th>
                  <th className="pb-2 pl-4 font-bold">מחיר-ייחוס</th>
                  <th className="pb-2 font-bold">רשום-בספר</th>
                </tr>
              </thead>
              <tbody>
                {data.assets.map((a) => (
                  <tr key={a.symbol} className={`border-b border-white/5 last:border-0 ${a.symbol === "SAOS" ? "font-black" : ""}`}>
                    <td className="py-2.5 pl-4">
                      <span className={a.symbol === "SAOS" ? "font-mono text-sm text-amber-400" : "font-mono text-zinc-300"}>{a.symbol}</span>
                      {a.symbol === "SAOS" && <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-400">מטבע-הבית</span>}
                    </td>
                    <td className="py-2.5 pl-4 font-mono text-zinc-200">{fmtInt(a.refPrice)}</td>
                    <td className="py-2.5 font-mono text-zinc-400">{fmtInt(a.listed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* עגינים + קריאת-הדרך */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/5 bg-zinc-900/40 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">שכבת-עגין (לא-חזית · מושתקת-בכוונה)</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(data?.anchors ?? []).map((a) => (
              <span key={a.name} className="rounded-full border border-white/5 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-500" title={a.note}>
                {a.name}
              </span>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-zinc-50">
            <Coins className="h-4 w-4 text-amber-500" aria-hidden /> ההוכחה-הראשונה: ווליום-גבוה-מאוד על הדקס שלנו
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-zinc-400">נמדד-בכנות (volume-honesty, ללא-הבטחות) — ואז נגזרים · הלוואות · מינוף. הענקים מיושנים; אנחנו בונים את-מה-שהם-לא.</p>
        </section>
      </div>
    </div>
  );
}
