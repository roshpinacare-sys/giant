"use client";

// giant DEX · סוואפ: ממשק-החלפות בתקן-הענקים (Uniswap-class) עם נתיב, פגיעת-מחיר והחלקה

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronDown, Info, Loader2, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { chainColor, fmtAmount, fmtMicro, fmtPct, fmtPrice, trendBg, trendColor } from "@/lib/dex-format";
import type { PairSummary, SwapQuote } from "@/lib/dex-types";

export function SwapView() {
  const { toast } = useToast();
  const [pairs, setPairs] = useState<PairSummary[]>([]);
  const [pairId, setPairId] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amountIn, setAmountIn] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const pair = useMemo(() => pairs.find((p) => p.id === pairId) ?? null, [pairs, pairId]);
  const tokenIn = pair ? (side === "BUY" ? pair.quote : pair.base) : "";
  const tokenOut = pair ? (side === "BUY" ? pair.base : pair.quote) : "";

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
    void (async () => {
      try {
        const res = await fetch("/api/dex/pairs", { cache: "no-store" });
        const data = (await res.json()) as { pairs: PairSummary[] };
        setPairs(data.pairs);
        const gnt = data.pairs.find((p) => p.base === "GNT");
        if (gnt) setPairId(gnt.id);
      } catch {
        // שקט
      }
      await loadBalances();
    })();
  }, [loadBalances]);

  useEffect(() => {
    const amt = Number(amountIn);
    if (!pair || !amt || amt <= 0) {
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
            body: JSON.stringify({ pairId: pair.id, side, amountIn: amt, slippagePct: slippage }),
          });
          const data = (await res.json()) as { quote?: SwapQuote };
          setQuote(data.quote ?? null);
        } catch {
          setQuote(null);
        } finally {
          setQuoting(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [amountIn, pair, side, slippage]);

  const flip = () => {
    setSide((s) => (s === "BUY" ? "SELL" : "BUY"));
    setAmountIn("");
    setQuote(null);
  };

  const execute = async () => {
    if (!pair || !quote) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/dex/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairId: pair.id,
          side,
          amountIn: Number(amountIn),
          slippagePct: slippage,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "ההחלפה נכשלה");
      toast({
        title: "ההחלפה בוצעה",
        description: `${tokenIn} → ${tokenOut} · בורסת giant`,
      });
      setAmountIn("");
      setQuote(null);
      await loadBalances();
    } catch (err) {
      toast({
        title: "ההחלפה נדחתה",
        description: err instanceof Error ? err.message : "שגיאה",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-[#0d1312] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-bold text-white">החלפה</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:bg-white/5">
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 border-white/10 bg-[#0d1211] p-3" dir="rtl" align="end">
              <div className="mb-2 text-xs font-semibold text-zinc-300">סף-החלקה</div>
              <div className="grid grid-cols-3 gap-1">
                {[0.1, 0.5, 1].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={cn(
                      "rounded-md py-1.5 text-xs font-semibold transition-colors",
                      slippage === s ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-zinc-400 hover:bg-white/10",
                    )}
                    dir="ltr"
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* מכירה-של-מה */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
            <span>מכינים לשלוח</span>
            <span dir="ltr">
              יתרה: {fmtAmount(balances[tokenIn] ?? 0)} {tokenIn}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              dir="ltr"
              placeholder="0.00"
              className="h-11 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums text-white placeholder:text-zinc-700 focus-visible:ring-0"
            />
            <TokenPicker pairs={pairs} selected={pairId} side={side} onSelect={(id) => setPairId(id)} open={pickerOpen} setOpen={setPickerOpen} />
          </div>
        </div>

        {/* היפוך */}
        <div className="relative z-10 -my-2 flex justify-center">
          <Button
            size="icon"
            onClick={flip}
            className="h-9 w-9 rounded-lg border-4 border-[#0d1312] bg-[#1a2422] text-zinc-300 hover:bg-[#243230]"
            aria-label="היפוך-כיוון"
          >
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* מקבלים */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="mb-1.5 text-xs text-zinc-500">מקבלים (משוער)</div>
          <div className="flex items-center gap-2">
            <span className="h-11 flex-1 text-2xl font-semibold tabular-nums text-zinc-300" dir="ltr">
              {quoting ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-600" aria-hidden="true" />
              ) : quote ? (
                fmtAmount(quote.outAmount)
              ) : (
                "—"
              )}
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-2 text-sm font-bold text-white">
              <span className={`h-2 w-2 rounded-full ${side === "BUY" ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
              {tokenOut}
            </span>
          </div>
        </div>

        {/* פרטי-הצעה */}
        {quote && pair && (
          <div className="mt-3 space-y-1 rounded-xl bg-black/20 p-3 text-xs" dir="rtl">
            <QRow label="מחיר" value={`1 ${tokenOut} = ${fmtPrice(quote.effectivePrice)} ${tokenIn}`} mono />
            <QRow
              label="פגיעת-מחיר"
              value={fmtPct(quote.priceImpactPct)}
              className={Math.abs(quote.priceImpactPct) > 1 ? "text-amber-400" : "text-emerald-400"}
            />
            <QRow label="עמלת-בריכה" value="0.30%" />
            <QRow label="מותר-מינימום" value={`${fmtAmount(quote.minOut)} ${tokenOut}`} mono />
            <QRow
              label="נתיב"
              value={quote.route.join(" → ")}
              className="flex flex-row-reverse gap-1"
            />
          </div>
        )}

        <Button
          onClick={() => void execute()}
          disabled={executing || !quote || quoting}
          className="mt-3 h-13 w-full rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500 disabled:bg-white/5 disabled:text-zinc-600"
          style={{ height: 52 }}
        >
          {executing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          {!pair ? "בחר זוג" : quote ? `החלף ${tokenIn} → ${tokenOut}` : "הזן סכום"}
        </Button>
      </div>
    </div>
  );
}

function QRow({ label, value, className, mono }: { label: string; value: string; className?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-zinc-500">
        {label}
        <Info className="h-3 w-3 text-zinc-700" aria-hidden="true" />
      </span>
      <span className={`${mono ? "font-mono" : "font-semibold"} tabular-nums ${className ?? "text-zinc-200"}`} dir="ltr">
        {value}
      </span>
    </div>
  );
}

function TokenPicker({
  pairs,
  selected,
  side,
  onSelect,
  open,
  setOpen,
}: {
  pairs: PairSummary[];
  selected: string;
  side: "BUY" | "SELL";
  onSelect: (id: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="gap-1.5 rounded-lg bg-black/40 px-3 py-2 text-sm font-bold text-white hover:bg-black/60">
          {selected
            ? `${pairs.find((p) => p.id === selected)?.[side === "BUY" ? "quote" : "base"] ?? "—"}`
            : "בחר"}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 border-white/10 bg-[#0d1211] p-2" dir="rtl" align="end">
        <div className="max-h-64 overflow-y-auto">
          {pairs.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onSelect(p.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm hover:bg-white/5",
                p.id === selected && "bg-white/5",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-bold text-white">{p.base}</span>
                <Badge className={cn("text-[10px]", chainColor(p.chain))}>{p.chain}</Badge>
              </span>
              <span className="flex flex-col items-end" dir="ltr">
                <span className="text-xs text-zinc-300 tabular-nums">{fmtPrice(p.price)}</span>
                <span className={cn("text-[10px] tabular-nums", trendColor(p.change24h))}>{fmtPct(p.change24h)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
