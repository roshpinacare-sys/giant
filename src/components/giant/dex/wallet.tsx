"use client";

// giant DEX · ארנק: יתרות-חיות, עמדות-LP, לדג'ר-אישי, ברז-דמו

import { useCallback, useEffect, useState } from "react";
import { Copy, Droplets, Loader2, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { chainColor, fmtAmount, fmtClock, fmtMicro, fmtPrice } from "@/lib/dex-format";
import type { WalletState } from "@/lib/dex-types";

export function WalletView() {
  const { toast } = useToast();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [faucetBusy, setFaucetBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dex/wallet", { cache: "no-store" });
      const data = (await res.json()) as WalletState;
      setWallet(data);
    } catch {
      // שמירה-על-מצב
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const faucet = async () => {
    setFaucetBusy(true);
    try {
      const res = await fetch("/api/dex/wallet/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDS" }),
      });
      const data = (await res.json()) as { amount?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "הברז נסגר");
      toast({ title: `נטענו ${fmtAmount(data.amount ?? 0)} USDS`, description: "ברז-הדמו של giant" });
      await load();
    } catch (err) {
      toast({
        title: "הברז נדחה",
        description: err instanceof Error ? err.message : "שגיאה",
        variant: "destructive",
      });
    } finally {
      setFaucetBusy(false);
    }
  };

  const addr = "giant1q…sovereignty·treasury·owner";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* יתרות */}
        <div className="rounded-xl border border-white/5 bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h3 className="text-sm font-bold text-zinc-200">יתרות ({wallet?.balances.length ?? 0})</h3>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-emerald-500/30 bg-transparent text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => void faucet()}
              disabled={faucetBusy}
            >
              {faucetBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Droplets className="h-3.5 w-3.5" aria-hidden="true" />}
              ברז-דמו · +10K USDS
            </Button>
          </div>
          <div className="divide-y divide-white/5">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-9 rounded-full bg-white/5" />
                  <Skeleton className="h-4 w-40 bg-white/5" />
                </div>
              ))}
            {wallet?.balances.map((b) => (
              <div key={b.token} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400"
                    aria-hidden="true"
                  >
                    {b.token.slice(0, 2)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      {b.token}
                      <Badge className={cn("text-[9px]", chainColor(b.chain))}>{b.chain}</Badge>
                    </div>
                    <div className="text-xs text-zinc-500 tabular-nums" dir="ltr">
                      {fmtPrice(b.priceUsd)} USDS
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-sm font-semibold tabular-nums text-zinc-100" dir="ltr">
                    {fmtAmount(b.amount)}
                  </div>
                  <div className="text-xs tabular-nums text-emerald-400/80" dir="ltr">
                    ≈ {fmtMicro(b.valueUsd)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* לדג'ר-אישי */}
        <div className="rounded-xl border border-white/5 bg-white/[0.03]">
          <div className="border-b border-white/5 px-4 py-3">
            <h3 className="text-sm font-bold text-zinc-200">היסטוריית-תנועות</h3>
          </div>
          <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
            {wallet?.ledger.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="text-zinc-300">{l.reason}</div>
                  <div className="text-xs text-zinc-600">{fmtClock(l.t)}</div>
                </div>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    l.amount >= 0 ? "text-emerald-400" : "text-red-400",
                  )}
                  dir="ltr"
                >
                  {l.amount >= 0 ? "+" : ""}
                  {fmtAmount(l.amount)} {l.token}
                </span>
              </div>
            ))}
            {wallet?.ledger.length === 0 && (
              <div className="py-6 text-center text-sm text-zinc-600">אין תנועות</div>
            )}
          </div>
        </div>
      </div>

      {/* כרטיס-ארנק */}
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/60 to-[#0d1312] p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-emerald-300">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              ארנק-הבעלים · giant
            </span>
            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">Giant Chain</Badge>
          </div>
          <div className="mt-4 text-3xl font-bold tabular-nums text-white" dir="ltr">
            {wallet ? fmtMicro(wallet.totalUsd) : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">שווי-כולל (כולל עמדות-נזילות)</div>
          <button
            className="mt-4 flex items-center gap-1.5 rounded-md bg-black/40 px-3 py-1.5 font-mono text-xs text-zinc-400 hover:bg-black/60"
            onClick={() => {
              void navigator.clipboard?.writeText(addr);
              toast({ title: "הכתובת הועתקה" });
            }}
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
            {addr}
          </button>
        </div>

        {/* עמדות-LP */}
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <h3 className="mb-3 text-sm font-bold text-zinc-200">עמדות-נזילות ({wallet?.positions.length ?? 0})</h3>
          <div className="space-y-2">
            {wallet?.positions.map((p, i) => (
              <div key={`${p.pairId}-${i}`} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2.5 text-sm">
                <span className="font-bold text-white" dir="ltr">
                  {p.base}/{p.quote}
                </span>
                <span className="font-mono text-xs text-emerald-400 tabular-nums" dir="ltr">
                  ≈ {fmtMicro(p.valueUsd)}
                </span>
              </div>
            ))}
            {wallet?.positions.length === 0 && (
              <div className="py-3 text-center text-xs text-zinc-600">הצטרף לבריכה בלשונית "בריכות"</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
