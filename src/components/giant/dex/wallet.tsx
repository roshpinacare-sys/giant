"use client";

// giant DEX · ארנק: יתרות-חיות, עמדות-LP, לדג'ר-אישי, הנפקת-USDS-מתועדת

import { useCallback, useEffect, useState } from "react";
import { Copy, Droplets, Loader2, Wallet } from "lucide-react";
import { Bot, KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ownerFetch } from "@/lib/owner-client";
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
      const res = await ownerFetch("/api/dex/wallet/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDS" }),
      });
      const data = (await res.json()) as { amount?: number; error?: string; authRequired?: boolean };
      if (!res.ok) {
        throw new Error(
          data.authRequired
            ? "הברז הוא פעולת-בעלים — היכנס במפתח-ה-headcorner"
            : data.error ?? "הברז נסגר",
        );
      }
      toast({ title: `נטענו ${fmtAmount(data.amount ?? 0)} USDS`, description: "הנפקה-מתועדת · נרשמת-בפאנל-האספקה" });
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
              הנפקה-מתועדת · +10K USDS
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
        <FleetOps />
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

/* ==================== FleetOps · הקצאת-צי (בעלים) ==================== */
// הבעלים מקצה-עבודה-אמיתית לסוכנים מהקופה — לדג'ר-גלוי, אסימון-מוצג-פעם-אחת.

interface FleetAgentRow {
  agentId: string;
  name: string;
  active: boolean;
  allocationUsds: number;
  balanceUsds: number;
  lastTradeAt: string | null;
}

function FleetOps() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<FleetAgentRow[]>([]);
  const [agentId, setAgentId] = useState("");
  const [usds, setUsds] = useState("150");
  const [busy, setBusy] = useState(false);
  const [freshToken, setFreshToken] = useState<{ agentId: string; token: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/fleet/state", { cache: "no-store" });
      const d = (await res.json()) as { agents?: FleetAgentRow[] };
      setAgents(d.agents ?? []);
    } catch {
      // שקט
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const allocate = async () => {
    if (!agentId.trim()) {
      toast({ title: "הזן מזהה-סוכן", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await ownerFetch("/api/fleet/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agentId.trim(), usds: Number(usds) }),
      });
      const d = (await res.json()) as { ok?: boolean; token?: string; error?: string; authRequired?: boolean };
      if (!res.ok) {
        throw new Error(
          d.authRequired ? "הקצאת-צי היא פעולת-בעלים — היכנס במפתח-ה-headcorner" : d.error ?? "ההקצאה נכשלה",
        );
      }
      setFreshToken({ agentId: agentId.trim(), token: d.token ?? "" });
      setAgentId("");
      toast({ title: "הקצאה נרשמה בלדג'ר", description: "האסימון מוצג פעם-אחת — העבר לסוכן" });
      await load();
    } catch (err) {
      toast({ title: "ההקצאה נדחתה", description: err instanceof Error ? err.message : "שגיאה", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Bot className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          צי-הסוכנים ({agents.filter((a) => a.active).length} פעילים)
        </h3>
      </div>
      <div className="space-y-3 p-4">
        {/* הקצאה-חדשה */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="מזהה-סוכן (למשל zai-main)"
              className="h-9 border-white/10 bg-black/20 text-xs"
              aria-label="מזהה-סוכן"
            />
            <Input
              value={usds}
              onChange={(e) => setUsds(e.target.value)}
              inputMode="decimal"
              className="h-9 border-white/10 bg-black/20 text-center text-xs tabular-nums"
              aria-label="סכום-הקצאה USDS"
            />
          </div>
          <Button
            size="sm"
            className="h-9 w-full bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => void allocate()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
            הקצאת-עבודה · מהקופה · לדג'ר
          </Button>
        </div>

        {/* אסימון-טרי — מוצג-פעם-אחת */}
        {freshToken && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3" dir="ltr">
            <div className="mb-1 text-[10px] font-bold text-amber-300">TOKEN · ONCE · {freshToken.agentId}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-amber-200">
                {freshToken.token}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-amber-500/40 px-2 text-amber-300 hover:bg-amber-500/10"
                onClick={() => {
                  void navigator.clipboard.writeText(freshToken.token);
                  toast({ title: "האסימון הועתק" });
                }}
                aria-label="העתקת-אסימון"
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
            <button
              className="mt-1 text-[10px] text-amber-400/70 underline"
              onClick={() => setFreshToken(null)}
            >
              קיבלתי — הסתר-לתמיד
            </button>
          </div>
        )}

        {/* רשימת-סוכנים */}
        <div className="max-h-44 space-y-1 overflow-y-auto" role="list">
          {agents.length === 0 && (
            <p className="py-2 text-center text-xs text-zinc-600">אין-סוכנים-מוקצים עדיין</p>
          )}
          {agents.map((a) => (
            <div key={a.agentId} role="listitem" className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-xs">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    a.active ? "bg-emerald-400" : "bg-zinc-600",
                  )}
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] text-emerald-300" dir="ltr">{a.agentId}</span>
              </span>
              <span className="tabular-nums text-zinc-300" dir="ltr">
                {fmtAmount(a.balanceUsds)} / {fmtAmount(a.allocationUsds)} USDS
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-600">
          חוק-אמת: הכסף זז-מהקופה בלדג'ר (TREASURY→FLEET) · תקרת-הצי 2,000 USDS · כל-עסקת-סוכן מסומנת FLEET בזרם-העסקאות.
        </p>
      </div>
    </div>
  );
}
