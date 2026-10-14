"use client";

// giant DEX · בריכות-נזילות: טבלת-בריכות + הפקדה/משיכה + עמדות-הבעלים

import { useCallback, useEffect, useState } from "react";
import { Droplets, Loader2, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { chainColor, fmtAmount, fmtMicro, fmtPct, fmtPrice } from "@/lib/dex-format";
import type { PoolRow } from "@/lib/dex-types";

export function PoolsView() {
  const { toast } = useToast();
  const [pools, setPools] = useState<PoolRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [addPool, setAddPool] = useState<PoolRow | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [remPool, setRemPool] = useState<PoolRow | null>(null);
  const [remPct, setRemPct] = useState(100);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dex/pools", { cache: "no-store" });
      const data = (await res.json()) as { pools: PoolRow[] };
      setPools(data.pools);
    } catch {
      setPools([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const addLiquidity = async () => {
    if (!addPool) return;
    const amt = Number(addAmount);
    if (!amt || amt <= 0) {
      toast({ title: "הזן סכום", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/dex/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", pairId: addPool.pairId, quoteAmount: amt }),
      });
      const data = (await res.json()) as { error?: string; shares?: number };
      if (!res.ok) throw new Error(data.error ?? "ההפקדה נכשלה");
      toast({
        title: "נזילות הופקדה",
        description: `הצטרפת לבריכה ${addPool.base}/${addPool.quote} · נפח-הון פעיל`,
      });
      setAddPool(null);
      setAddAmount("");
      await load();
    } catch (err) {
      toast({
        title: "ההפקדה נדחתה",
        description: err instanceof Error ? err.message : "שגיאה",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const removeLiquidity = async () => {
    if (!remPool) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dex/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", positionId: remPool.pairId, pct: remPct }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "המשיכה נכשלה");
      toast({
        title: "נזילות נמשכה",
        description: `${remPct}% מהעמדה ב-${remPool.base}/${remPool.quote} חזר לארנק`,
      });
      setRemPool(null);
      await load();
    } catch (err) {
      toast({
        title: "המשיכה נדחתה",
        description: err instanceof Error ? err.message : "שגיאה",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const myPools = pools?.filter((p) => p.myShares > 0) ?? [];

  return (
    <div className="space-y-4">
      {/* עמדות-שלי */}
      {myPools.length > 0 && (
        <section aria-label="עמדות-הנזילות שלי">
          <h3 className="mb-2 text-sm font-bold text-zinc-200">עמדות-הנזילות שלי ({myPools.length})</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myPools.map((p) => (
              <div key={p.pairId} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold text-white" dir="ltr">
                    {p.base}/{p.quote}
                  </span>
                  <Badge className={cn("text-[10px]", chainColor(p.chain))}>{p.chain}</Badge>
                </div>
                <div className="space-y-0.5 text-xs text-zinc-400" dir="ltr">
                  <div className="flex justify-between">
                    <span>{p.base}</span>
                    <span className="font-mono">{fmtAmount(p.myBase)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{p.quote}</span>
                    <span className="font-mono">{fmtAmount(p.myQuote)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1">
                    <span className="text-zinc-500">שווי</span>
                    <span className="font-mono font-semibold text-emerald-400">{fmtMicro(p.myBase * p.price + p.myQuote)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-9 w-full border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => setRemPool(p)}
                >
                  משיכת-נזילות
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* כל-הבריכות */}
      <section aria-label="כל-הבריכות">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">בריכות-הנזילות ({pools?.length ?? 0})</h3>
          <Button variant="ghost" size="sm" className="h-8 text-zinc-400 hover:bg-white/5" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.03]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs text-zinc-500">
                <th className="px-4 py-3 text-start font-medium">בריכה</th>
                <th className="px-4 py-3 text-start font-medium">TVL</th>
                <th className="px-4 py-3 text-start font-medium">נפח-24h</th>
                <th className="px-4 py-3 text-start font-medium">עמלות-24h</th>
                <th className="px-4 py-3 text-start font-medium">APR</th>
                <th className="px-4 py-3 text-end font-medium">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {!pools &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-6 w-full bg-white/5" />
                    </td>
                  </tr>
                ))}
              {pools?.map((p) => (
                <tr key={p.pairId} className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex -space-x-1.5" aria-hidden="true">
                        <span className="h-6 w-6 rounded-full border border-[#0b0f0e] bg-emerald-500/25" />
                        <span className="h-6 w-6 rounded-full border border-[#0b0f0e] bg-zinc-500/25" />
                      </span>
                      <div>
                        <div className="font-bold text-white" dir="ltr">
                          {p.base}/{p.quote}
                        </div>
                        <Badge className={cn("mt-0.5 text-[9px]", chainColor(p.chain))}>{p.chain}</Badge>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-zinc-200" dir="ltr">
                    {fmtMicro(p.tvl)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-zinc-300" dir="ltr">
                    {fmtMicro(p.vol24h)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-amber-400/90" dir="ltr">
                    {fmtMicro(p.fees24h)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-bold tabular-nums",
                        p.aprPct >= 30 ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/10 text-zinc-300",
                      )}
                      dir="ltr"
                    >
                      {fmtPct(p.aprPct)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Button
                      size="sm"
                      className="h-9 bg-emerald-600 px-3 text-white hover:bg-emerald-500"
                      onClick={() => setAddPool(p)}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      הפקדה
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* דיאלוג-הפקדה */}
      <Dialog open={!!addPool} onOpenChange={(v) => !v && setAddPool(null)}>
        <DialogContent className="border-white/10 bg-[#0d1312] sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Droplets className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              הפקדת-נזילות · {addPool?.base}/{addPool?.quote}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500" htmlFor="add-amount">
                סכום ב-{addPool?.quote} (ה-{addPool?.base} מזווד אוטומטית לפי המחיר)
              </label>
              <Input
                id="add-amount"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                dir="ltr"
                placeholder="0.00"
                className="h-11 border-white/10 bg-black/30 text-white"
              />
              {addPool && Number(addAmount) > 0 && (
                <div className="mt-2 rounded-md bg-black/30 p-2 text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span>מקבל-נתח בערך</span>
                    <span className="font-mono" dir="ltr">
                      {fmtAmount(
                        (Number(addAmount) / (addPool.reserveQuote + Number(addAmount))) * 100,
                      )}
                      %
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-emerald-400">
                    <span>APR שנתי</span>
                    <span className="font-mono" dir="ltr">
                      {fmtPct(addPool.aprPct)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10 bg-transparent text-zinc-300 hover:bg-white/5" onClick={() => setAddPool(null)}>
              ביטול
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void addLiquidity()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              הפקדה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* דיאלוג-משיכה */}
      <Dialog open={!!remPool} onOpenChange={(v) => !v && setRemPool(null)}>
        <DialogContent className="border-white/10 bg-[#0d1312] sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-white">משיכת-נזילות · {remPool?.base}/{remPool?.quote}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-center">
              <span className="text-4xl font-bold tabular-nums text-emerald-400" dir="ltr">
                {remPct}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={10}
              value={remPct}
              onChange={(e) => setRemPct(Number(e.target.value))}
              className="w-full accent-emerald-500"
              aria-label="אחוז-משיכה"
            />
            {remPool && (
              <div className="rounded-md bg-black/30 p-2 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>{remPool.base}</span>
                  <span className="font-mono" dir="ltr">
                    {fmtAmount((remPool.myBase * remPct) / 100)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>{remPool.quote}</span>
                  <span className="font-mono" dir="ltr">
                    {fmtAmount((remPool.myQuote * remPct) / 100)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10 bg-transparent text-zinc-300 hover:bg-white/5" onClick={() => setRemPool(null)}>
              ביטול
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void removeLiquidity()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              משיכה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
