"use client";

// giant DEX · הקליפה-המאחדת: סקירה · מסחר · סוואפ · בריכות · ארנק — בורסה אחת חיה

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Droplets, LineChart, Repeat2, Wallet as WalletIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { OverviewView } from "@/components/giant/dex/overview";
import { TerminalView } from "@/components/giant/dex/terminal";
import { SwapView } from "@/components/giant/dex/swap";
import { PoolsView } from "@/components/giant/dex/pools";
import { WalletView } from "@/components/giant/dex/wallet";

type Tab = "overview" | "trade" | "swap" | "pools" | "wallet";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "סקירת-שוק", icon: BarChart3 },
  { id: "trade", label: "מסחר", icon: LineChart },
  { id: "swap", label: "סוואפ", icon: Repeat2 },
  { id: "pools", label: "בריכות", icon: Droplets },
  { id: "wallet", label: "ארנק", icon: WalletIcon },
];

export function DexView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [tradePairId, setTradePairId] = useState<string | undefined>(undefined);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const goTrade = useCallback((pairId: string) => {
    setTradePairId(pairId);
    setTab("trade");
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e0d] shadow-2xl" dir="rtl">
      {/* כותרת-בורסה */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#0d1312] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-base font-black text-emerald-400" aria-hidden="true">
            G
          </span>
          <div>
            <div className="flex items-center gap-2 text-sm font-black tracking-wide text-white">
              giant DEX
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                שוק-חי
              </span>
            </div>
            <div className="text-[10px] text-zinc-500">בורסת-הריבונות · Giant Chain ורשתות-מוכרות</div>
          </div>
        </div>
        <span className="hidden font-mono text-xs tabular-nums text-zinc-500 sm:block" dir="ltr">
          {clock}
        </span>
      </div>

      {/* לשוניות */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/5 bg-[#0b100f] px-2 py-1.5" role="tablist" aria-label="מסכי-הבורסה">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.id
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {/* תוכן */}
      <div className="min-h-[560px] p-3 sm:p-4">
        {tab === "overview" && <OverviewView onTrade={goTrade} />}
        {tab === "trade" && <TerminalView key={tradePairId ?? "default"} initialPairId={tradePairId} />}
        {tab === "swap" && <SwapView />}
        {tab === "pools" && <PoolsView />}
        {tab === "wallet" && <WalletView />}
      </div>
    </div>
  );
}
