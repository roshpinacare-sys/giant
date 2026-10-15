"use client";

// giant DEX · טרמינל-מסחר: בורר-זוגות + כותרת-מחיר חיה + גרף + ספר-הזמנות + סרט + טופס-מסחר

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { CandleChart } from "@/components/giant/dex/candle-chart";
import {
  fmtAmount,
  fmtClock,
  fmtMicro,
  fmtPct,
  fmtPrice,
  fmtQty,
  trendColor,
  trendBg,
  chainColor,
} from "@/lib/dex-format";
import {
  TIMEFRAMES,
  type Candle,
  type Depth,
  type PairSummary,
  type Timeframe,
  type TradeRow,
  type TradeSide,
} from "@/lib/dex-types";

interface TerminalProps {
  initialPairId?: string;
}

export function TerminalView({ initialPairId }: TerminalProps) {
  const { toast } = useToast();
  const [pairs, setPairs] = useState<PairSummary[]>([]);
  const [pairId, setPairId] = useState<string>(initialPairId ?? "");
  const [tf, setTf] = useState<Timeframe>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(true);
  const [candlesSource, setCandlesSource] = useState<string>("");
  const [depth, setDepth] = useState<Depth | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPrice = useRef<number>(0);

  const pair = useMemo(
    () => pairs.find((p) => p.id === pairId) ?? null,
    [pairs, pairId],
  );

  // זוגות
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dex/pairs", { cache: "no-store" });
        const data = (await res.json()) as { pairs: PairSummary[] };
        setPairs(data.pairs);
        if (!pairId && data.pairs.length) {
          const gnt = data.pairs.find((p) => p.isNative) ?? data.pairs[0];
          setPairId(gnt.id);
        }
        if (initialPairId) setPairId(initialPairId);
      } catch {
        // מצב-שגיאה כנה בטבלה
      }
    })();
  }, []);

  // שוק-חי: סקירה-כללית כל-6 שניות לעדכון-מחיר
  useEffect(() => {
    const t = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/dex/pairs", { cache: "no-store" });
          const data = (await res.json()) as { pairs: PairSummary[] };
          setPairs(data.pairs);
        } catch {
          // שקט
        }
      })();
    }, 6_000);
    return () => clearInterval(t);
  }, []);

  // הבהוב-מחיר
  useEffect(() => {
    if (pair && prevPrice.current > 0 && pair.price !== prevPrice.current) {
      setFlash(pair.price > prevPrice.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 600);
      prevPrice.current = pair.price;
      return () => clearTimeout(t);
    }
    if (pair) prevPrice.current = pair.price;
  }, [pair]);

  // נרות
  const loadCandles = useCallback(async () => {
    if (!pairId) return;
    try {
      const res = await fetch(`/api/dex/candles?pair=${pairId}&tf=${tf}&limit=300`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { candles: Candle[]; source?: string };
      setCandles(data.candles ?? []);
      setCandlesSource(data.source ?? "");
    } catch {
      // שמירה-על-נתונים-קיימים
    } finally {
      setCandlesLoading(false);
    }
  }, [pairId, tf]);

  useEffect(() => {
    setCandlesLoading(true);
    void loadCandles();
  }, [loadCandles]);

  useEffect(() => {
    const t = setInterval(() => void loadCandles(), 12_000);
    return () => clearInterval(t);
  }, [loadCandles]);

  // ספר-הזמנות + סרט
  useEffect(() => {
    if (!pairId) return;
    const load = async () => {
      try {
        const [dRes, tRes] = await Promise.all([
          fetch(`/api/dex/depth?pair=${pairId}`, { cache: "no-store" }),
          fetch(`/api/dex/trades?pair=${pairId}&limit=40`, { cache: "no-store" }),
        ]);
        const dData = (await dRes.json()) as Depth;
        const tData = (await tRes.json()) as { trades: TradeRow[] };
        setDepth(dData);
        setTrades(tData.trades ?? []);
      } catch {
        // שקט
      }
    };
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [pairId]);

  const filteredPairs = useMemo(
    () =>
      q
        ? pairs.filter((p) => `${p.base}/${p.quote} ${p.chain}`.toLowerCase().includes(q.toLowerCase()))
        : pairs,
    [pairs, q],
  );

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_300px]">
      {/* אזור-ראשי */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* כותרת-זוג */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-white/5 bg-white/[0.03] p-4">
          <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto gap-2 px-2 py-1.5 text-lg font-bold text-white hover:bg-white/5"
              >
                {pair ? `${pair.base}/${pair.quote}` : "—"}
                <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 border-white/10 bg-[#0d1211] p-3" dir="rtl" align="start">
              <div className="relative mb-2">
                <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="חיפוש זוג…"
                  className="h-9 border-white/10 bg-white/5 ps-8 text-white placeholder:text-zinc-600"
                />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filteredPairs.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPairId(p.id);
                      setSelectorOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-white/5 ${p.id === pairId ? "bg-white/5" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-white">{p.base}</span>
                      <span className="text-xs text-zinc-500">/{p.quote}</span>
                      {p.isNative ? (
                        <Badge className="bg-emerald-500/15 text-[10px] text-emerald-400 hover:bg-emerald-500/15">
                          מסחר-אמת
                        </Badge>
                      ) : (
                        <Badge className="bg-sky-500/10 text-[10px] text-sky-300/90 hover:bg-sky-500/10">
                          שוק-אמת · Binance
                        </Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums" dir="ltr">
                      <span className="text-zinc-300">{fmtPrice(p.price)}</span>
                      <span className={trendColor(p.change24h)}>{fmtPct(p.change24h)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {pair && (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`text-2xl font-bold tabular-nums transition-colors duration-300 ${flash === "up" ? "text-emerald-400" : flash === "down" ? "text-red-400" : "text-white"}`}
                  dir="ltr"
                >
                  {fmtPrice(pair.price)}
                </span>
                <span className={`rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${trendBg(pair.change24h)}`} dir="ltr">
                  {fmtPct(pair.change24h)}
                </span>
              </div>
              <div className="hidden grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid">
                <Stat label={pair.isNative ? "נפח-24h" : "נפח-שוק-24h"} value={pair.isNative ? fmtMicro(pair.vol24h) : `${fmtAmount(pair.vol24h)} USDT`} />
                {pair.isNative ? (
                  <Stat label="נזילות" value={fmtMicro(pair.liquidity)} />
                ) : (
                  <Stat label="מקור" value="Binance חי" />
                )}
                <Stat label="גבוה-24h" value={fmtPrice(pair.high24h)} mono />
                <Stat label="נמוך-24h" value={fmtPrice(pair.low24h)} mono />
              </div>
              <Badge className={`ms-auto ${chainColor(pair.chain)}`}>{pair.chain}</Badge>
            </>
          )}
        </div>

        {/* בורר-טיים-פריים + גרף */}
        <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-1">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tf === t ? "bg-emerald-500/15 text-emerald-400" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
            <span className="ms-auto text-xs text-zinc-600">
              {candlesSource === "binance"
                ? "היסטוריית-שוק-אמת · Binance"
                : candlesSource === "binance-down"
                  ? "ההזנה-נפלה · מציג-את-האמת-המקומית"
                  : "AMM-גנזיס · נולד-עכשיו · צובר-עסקאות-אמת"}
              · גלגלת=זום · גרירה=הזזה
            </span>
          </div>
          <CandleChart
            candles={candles}
            loading={candlesLoading}
            base={pair?.base ?? ""}
            quote={pair?.quote ?? "USDS"}
            height={360}
          />
        </div>

        {/* טופס-מסחר */}
        {pair && (pair.isNative ? <TradeForm pair={pair} onDone={loadCandles} /> : <RefOnlyNotice base={pair.base} />)}
      </div>

      {/* ספר-הזמנות + סרט */}
      <div className="flex min-w-0 flex-col gap-3">
        <OrderBook depth={depth} pair={pair} />
        <TradeTape trades={trades} />
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-zinc-500">{label}</span>
      <span className={`${mono ? "font-mono" : "font-semibold"} text-zinc-200 tabular-nums`} dir="ltr">
        {value}
      </span>
    </span>
  );
}

/** הודעת-אמת: זוג-עזר אינו-נסחר-כאן — אבל-השוק-שלו-מוצג-חי-מ-Binance */
function RefOnlyNotice({ base }: { base: string }) {
  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-4 text-center">
      <p className="text-sm font-semibold text-sky-200">{base} · שוק-אמת-מ-Binance (לא-נסחר-כאן)</p>
      <p className="mt-1 text-xs text-zinc-400">
        הגרף, ספר-ההזמנות והסרט-למעלה = נתוני-השוק-האמת-הציבוריים. אין-מסחר-על-מדדי-חוץ.
        טופס-המסחר-האמיתי פתוח על SAOS/USDS — המטבע-שלנו, עם-רזרבות-מהלדג'ר.
      </p>
    </div>
  );
}

/* ============================== ספר-הזמנות ============================== */

function OrderBook({ depth, pair }: { depth: Depth | null; pair: PairSummary | null }) {
  if (!depth || !pair) {
    return (
      <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4 text-center text-sm text-zinc-500">
        טוען ספר-הזמנות…
      </div>
    );
  }
  // חוק-אמת: מודים-בכנות-רק-כשההזנה-נפלה. כשיש-ספר-אמת — מציגים-אותו.
  if (depth.refOnly || (depth.bids.length === 0 && depth.asks.length === 0)) {
    return (
      <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4 text-center">
        <p className="text-sm font-semibold text-zinc-300">ספר-ההזמנות לא-זמין-כרגע</p>
        <p className="mt-1 text-xs text-zinc-500">
          ההזנה-החיה-מ-Binance לא-ענתה ברגע-זה. לא-מציגים-עומק-מדומה — רק-אמת.
        </p>
      </div>
    );
  }
  const isBinance = depth.source === "binance";
  const maxTotal = Math.max(
    depth.bids[depth.bids.length - 1]?.total ?? 1,
    depth.asks[depth.asks.length - 1]?.total ?? 1,
  );
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-zinc-200">ספר-הזמנות</span>
        <span className="text-[10px] text-zinc-600">
          {isBinance ? "שוק-אמת · Binance" : "בריכת-AMM · נגזר-מהרזרבות"}
        </span>
      </div>
      <div className="space-y-0.5" dir="ltr">
        {[...depth.asks].reverse().slice(-7).map((a, i) => (
          <BookRow key={`a${i}`} price={a.price} amount={a.amount} total={a.total} maxTotal={maxTotal} side="ask" isBinance={isBinance} />
        ))}
        <div className="my-1.5 flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5">
          <span className="text-sm font-bold tabular-nums text-white">{fmtPrice(depth.mid)}</span>
          <span className="text-[10px] text-zinc-500">{isBinance ? "USDT" : "USDS"}</span>
        </div>
        {depth.bids.slice(0, 7).map((b, i) => (
          <BookRow key={`b${i}`} price={b.price} amount={b.amount} total={b.total} maxTotal={maxTotal} side="bid" isBinance={isBinance} />
        ))}
      </div>
    </div>
  );
}

function BookRow({
  price,
  amount,
  total,
  maxTotal,
  side,
  isBinance,
}: {
  price: number;
  amount: number;
  total: number;
  maxTotal: number;
  side: "bid" | "ask";
  isBinance?: boolean;
}) {
  const pct = Math.min(100, (total / maxTotal) * 100);
  return (
    <div className="relative flex items-center justify-between overflow-hidden rounded px-2 py-1 text-[11px] tabular-nums">
      <div
        className={`absolute inset-y-0 ${side === "bid" ? "right-0 bg-emerald-500/10" : "right-0 bg-red-500/10"}`}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <span className={`relative z-10 font-mono ${side === "bid" ? "text-emerald-400" : "text-red-400"}`}>
        {fmtPrice(price)}
      </span>
      <span className="relative z-10 font-mono text-zinc-400">{isBinance ? fmtQty(amount) : fmtAmount(amount)}</span>
      <span className="relative z-10 w-16 text-end font-mono text-zinc-500">
        {isBinance ? fmtAmount(total) : fmtMicro(total)}
      </span>
    </div>
  );
}

/* ============================== סרט-עסקאות ============================== */

function TradeTape({ trades }: { trades: TradeRow[] }) {
  const isBinance = trades[0]?.source === "binance";
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-zinc-200">עסקאות אחרונות</span>
        <span className="text-[10px] text-zinc-600">{isBinance ? "שוק-אמת · Binance" : "הבורסה-שלנו"}</span>
      </div>
      <div className="max-h-64 space-y-0.5 overflow-y-auto" dir="ltr">
        {trades.slice(0, 25).map((t) => (
          <div key={t.id} className="flex items-center justify-between px-2 py-1 text-[11px] tabular-nums">
            <span className={`w-16 font-mono ${t.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
              {fmtPrice(t.price)}
            </span>
            <span className="w-16 text-end font-mono text-zinc-400">
              {isBinance ? fmtQty(t.amount) : fmtAmount(t.amount)}
            </span>
            <span className="w-16 text-end font-mono text-zinc-600">{fmtClock(t.t)}</span>
          </div>
        ))}
        {trades.length === 0 && (
          <div className="py-4 text-center text-xs text-zinc-600">
            {isBinance ? "ההזנה-לא-זמינה-כרגע — לא-מציגים-עסקאות-מדומות" : "אין עסקאות-עדיין · השוק-נולד-בגנזיס"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== טופס-מסחר ============================== */

function TradeForm({ pair, onDone }: { pair: PairSummary; onDone: () => void }) {
  const { toast } = useToast();
  const [side, setSide] = useState<TradeSide>("BUY");
  const [amountIn, setAmountIn] = useState("");
  const [quote, setQuote] = useState<{ outAmount: number; priceImpactPct: number; effectivePrice: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [sliderPct, setSliderPct] = useState(0);

  const loadBalances = useCallback(async () => {
    try {
      const res = await fetch("/api/dex/wallet", { cache: "no-store" });
      const data = (await res.json()) as { balances: { token: string; amount: number }[] };
      const map: Record<string, number> = {};
      for (const b of data.balances ?? []) map[b.token] = b.amount;
      setBalances(map);
    } catch {
      // שקט
    }
  }, []);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  const tokenIn = side === "BUY" ? pair.quote : pair.base;
  const balIn = balances[tokenIn] ?? 0;

  useEffect(() => {
    const amt = Number(amountIn);
    if (!amt || amt <= 0) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/dex/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pairId: pair.id, side, amountIn: amt, slippagePct: 0.5 }),
          });
          const data = (await res.json()) as {
            quote?: { outAmount: number; priceImpactPct: number; effectivePrice: number };
            error?: string;
          };
          if (data.quote) {
            setQuote({
              outAmount: data.quote.outAmount,
              priceImpactPct: data.quote.priceImpactPct,
              effectivePrice: data.quote.effectivePrice,
            });
          } else {
            setQuote(null);
          }
        } catch {
          setQuote(null);
        } finally {
          setQuoting(false);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [amountIn, pair.id, pair, side]);

  const execute = async () => {
    const amt = Number(amountIn);
    if (!amt || amt <= 0) {
      toast({ title: "הזן סכום", variant: "destructive" });
      return;
    }
    setExecuting(true);
    try {
      const res = await fetch("/api/dex/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairId: pair.id, side, amountIn: amt, slippagePct: 0.5 }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "הביצוע נכשל");
      toast({
        title: side === "BUY" ? `נקנה ${pair.base}` : `נמכר ${pair.base}`,
        description: `העסקה בוצעה בבורסת giant`,
      });
      setAmountIn("");
      setSliderPct(0);
      await loadBalances();
      onDone();
    } catch (err) {
      toast({
        title: "ההזמנה נדחתה",
        description: err instanceof Error ? err.message : "שגיאה",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  };

  const setPct = (p: number) => {
    setSliderPct(p);
    setAmountIn(((balIn * p) / 100).toFixed(balIn > 1000 ? 0 : 6));
  };

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
        <button
          onClick={() => setSide("BUY")}
          className={`min-h-[40px] rounded-md text-sm font-bold transition-colors ${
            side === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          קנייה {pair.base}
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={`min-h-[40px] rounded-md text-sm font-bold transition-colors ${
            side === "SELL" ? "bg-red-500/20 text-red-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          מכירה {pair.base}
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">סכום ({tokenIn})</span>
            <span className="text-zinc-500 tabular-nums" dir="ltr">
              יתרה: {fmtAmount(balIn)} {tokenIn}
            </span>
          </div>
          <Input
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            dir="ltr"
            placeholder="0.00"
            className="h-12 border-white/10 bg-black/30 text-lg font-semibold tabular-nums text-white placeholder:text-zinc-700"
          />
          <div className="mt-2 px-1">
            <Slider
              value={[sliderPct]}
              onValueChange={(v) => setPct(v[0] ?? 0)}
              max={100}
              step={5}
              aria-label="אחוז-מהיתרה"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
        <div className="rounded-md bg-black/20 p-2.5 text-xs">
          {quoting ? (
            <span className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> מחשב הצעת-מחיר…
            </span>
          ) : quote ? (
            <div className="space-y-1" dir="rtl">
              <Row label="תקבל בערך" value={`≈ ${fmtAmount(quote.outAmount)} ${side === "BUY" ? pair.base : pair.quote}`} />
              <Row label="מחיר-אפקטיבי" value={fmtPrice(quote.effectivePrice)} mono />
              <Row
                label="פגיעת-מחיר"
                value={fmtPct(quote.priceImpactPct)}
                className={Math.abs(quote.priceImpactPct) > 1 ? "text-amber-400" : "text-zinc-300"}
              />
              <Row label="עמלה" value="0.30%" />
            </div>
          ) : (
            <span className="text-zinc-600">הזן סכום לקבלת-הצעת-מחיר חיה</span>
          )}
        </div>
        <Button
          onClick={() => void execute()}
          disabled={executing || !amountIn || Number(amountIn) <= 0}
          className={`h-12 w-full text-base font-bold ${
            side === "BUY" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
          } text-white`}
        >
          {executing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          {side === "BUY" ? `קנה ${pair.base}` : `מכור ${pair.base}`}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, className, mono }: { label: string; value: string; className?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`${mono ? "font-mono" : "font-semibold"} tabular-nums ${className ?? "text-zinc-200"}`} dir="ltr">
        {value}
      </span>
    </div>
  );
}
