"use client";

// giant DEX · סקירת-שוק: KPIs-חיים, SAOS-זרקור, פאנל-אספקת-אמת, ארנת-הווליום (M-9), מובילים, טופ-זוגות

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Flame, Gauge, Landmark, TrendingDown, TrendingUp, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
import {
  chainColor,
  fmtMicro,
  fmtPct,
  fmtPrice,
  trendBg,
  trendColor,
} from "@/lib/dex-format";
import type { Overview, PairSummary, SupplyPanel } from "@/lib/dex-types";

export function OverviewView({ onTrade }: { onTrade?: (pairId: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dex/overview", { cache: "no-store" });
      const d = (await res.json()) as Overview;
      setData(d);
    } catch {
      // שקט
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  const { kpis, moversUp, moversDown, arena, engine, topPairs, sparks, supply } = data;

  return (
    <div className="space-y-4">
      {/* KPI-ראשי */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="נפח-אמת · 24 שעות" value={fmtMicro(kpis.vol24h)} icon={<Activity className="h-4 w-4" />} tone="up" />
        <Kpi label="TVL · נזילות-אמת" value={fmtMicro(kpis.tvl)} icon={<Gauge className="h-4 w-4" />} />
        <Kpi label="עמלות-אמת · 24h" value={fmtMicro(kpis.fees24h)} icon={<Flame className="h-4 w-4" />} tone="warn" />
        <Kpi label="זוגות" value={String(kpis.pairsCount)} icon={<Zap className="h-4 w-4" />} />
      </div>

      {/* פאנל-האמת: אספקת-המטבע — נגזר-לדג'ר, אפס-סימולציות */}
      {supply && <SupplyTruth supply={supply} />}

      {/* פועם-הצי · פעילות-אמת-של-סוכני-הצי על ה-AMM */}
      <FleetPulse />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* זרקור-SAOS */}
        <section className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/50 to-[#0d1312] p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-lg font-black text-emerald-300" aria-hidden="true">
                  S
                </span>
                <div>
                  <div className="flex items-center gap-2 text-xl font-black text-white" dir="ltr">
                    SAOS
                    <Badge className="bg-emerald-500/15 text-[10px] text-emerald-300 hover:bg-emerald-500/15">המטבע-האמיתי</Badge>
                  </div>
                  <div className="text-xs text-zinc-500">Giant Chain · מנופק-מהלדג'ר · מסחר-אמת-בלבד</div>
                </div>
              </div>
              <div className="mt-4 flex items-end gap-3">
                <span
                  key={kpis.saosPrice}
                  className="animate-price-pulse text-4xl font-black tabular-nums text-white"
                  dir="ltr"
                >
                  {fmtPrice(kpis.saosPrice)}
                </span>
                <span className={cn("rounded-lg px-2 py-1 text-sm font-bold tabular-nums", trendBg(kpis.saosChange24h))} dir="ltr">
                  {fmtPct(kpis.saosChange24h)}
                </span>
              </div>
            </div>
            <Spark data={sparks["SAOS/USDS"] ?? []} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat label="נפח-24h" value={fmtMicro(kpis.vol24h)} />
            <MiniStat label="נפח-7d" value={fmtMicro(kpis.vol7d)} />
            <MiniStat label="נפח-30d" value={fmtMicro(kpis.vol30d)} />
          </div>
        </section>

        {/* ארנת-הווליום M-9 */}
        <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
              <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ארנת-הווליום · M-9 · נפח-אמת-בלבד
            </h3>
            <Badge
              className={
                engine.running
                  ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15"
                  : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/15"
              }
            >
              {engine.running ? "מנוע-חי" : "מנוע-מתחמם"}
            </Badge>
          </div>
          <div className="space-y-3">
            <Goal
              label="יעד-שבועי · 500K µ יומי"
              pct={arena.goal7dPct}
              current={arena.current24h}
              target={arena.target7d}
            />
            <Goal
              label="יעד-חודשי · 1M µ יומי"
              pct={arena.goal30dPct}
              current={arena.current24h}
              target={arena.target30d}
            />
          </div>
          {/* גרף-עמודות-14 יום */}
          <div className="mt-4 flex h-16 items-end gap-1" dir="ltr">
            {arena.days.slice(-14).map((d) => {
              const max = Math.max(...arena.days.map((x) => x.vol), 1);
              return (
                <div
                  key={d.day}
                  className="flex-1 rounded-t bg-emerald-500/60 transition-all hover:bg-emerald-400"
                  style={{ height: `${Math.max(4, (d.vol / max) * 100)}%` }}
                  title={`${d.day}: ${fmtMicro(d.vol)}`}
                />
              );
            })}
          </div>
          <div className="mt-1 text-[10px] text-zinc-600">נפח-יומי · 14 ימים אחרונים (µ-USDS)</div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        {/* מובילים */}
        <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> עולים
              </h3>
              <MoverList movers={moversUp} onTrade={onTrade} />
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-red-400">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> יורדים
              </h3>
              <MoverList movers={moversDown} onTrade={onTrade} />
            </div>
          </div>
        </section>

        {/* טופ-זוגות */}
        <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <h3 className="mb-2 text-xs font-bold text-zinc-400">הזוגות-החמים · לפי-נפח</h3>
          <div className="space-y-0.5">
            {topPairs.map((p: PairSummary) => (
              <button
                key={p.id}
                onClick={() => onTrade?.(p.id)}
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-bold text-white" dir="ltr">
                    {p.base}/{p.quote}
                  </span>
                  <Badge className={cn("hidden shrink-0 text-[9px] sm:inline-flex", chainColor(p.chain))}>{p.chain}</Badge>
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums sm:gap-3" dir="ltr">
                  <span className="text-zinc-300">{fmtPrice(p.price)}</span>
                  <span className={cn("w-14 rounded px-1 py-0.5 text-center text-xs font-semibold sm:w-16", trendBg(p.change24h))}>
                    {fmtPct(p.change24h)}
                  </span>
                  <span className="hidden w-20 text-end text-xs text-zinc-500 sm:inline">{fmtMicro(p.vol24h)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** פאנל-האמת · אספקת-המטבע — כל-מספר נגזר-מהלדג'ר. אין-הנפקה-סמויה, אין-סימולציה. */
function SupplyTruth({ supply }: { supply: SupplyPanel }) {
  const saos = supply.saos;
  const usds = supply.usds;
  const ageH = supply.marketAgeSec !== null ? supply.marketAgeSec / 3600 : null;
  const ageLabel =
    ageH === null
      ? "—"
      : ageH < 1
        ? `${Math.round(supply.marketAgeSec! / 60)} דקות`
        : ageH < 48
          ? `${ageH.toFixed(1)} שעות`
          : `${(ageH / 24).toFixed(1)} ימים`;
  const fillPct = saos.cap ? Math.min(100, (saos.issued / saos.cap) * 100) : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0b0f0e] p-4" aria-label="פאנל-אספקת-המטבע">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Landmark className="h-4 w-4 text-amber-400" aria-hidden="true" />
          אספקת-המטבע · נגזר-מהלדג'ר
        </h3>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Badge className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10">אמת-בלבד · אפס-סימולציות</Badge>
          <span>גיל-השוק: {ageLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="תקרת-SAOS" value={saos.cap?.toLocaleString("he-IL") ?? "—"} />
        <MiniStat label="מנופק-באמת" value={saos.issued.toLocaleString("he-IL")} />
        <MiniStat label="קופה (אחרי-בריכה)" value={saos.treasury.toLocaleString("he-IL")} />
        <MiniStat label="ארנק-הבעלים" value={saos.owner.toLocaleString("he-IL")} />
        <MiniStat label="נעול-בבריכה" value={(saos.inPool ?? 0).toLocaleString("he-IL")} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Progress value={fillPct} className="h-2" aria-label={`מנופק ${fillPct.toFixed(2)}% מהתקרה`} />
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span dir="ltr">{`${saos.issued.toLocaleString("he-IL")} / ${saos.cap?.toLocaleString("he-IL")}`}</span>
          <span>
            טרם-מנופק: {(saos.notYetIssued ?? 0).toLocaleString("he-IL")} · USDS-פנימי: {usds.issued.toLocaleString("he-IL")}
          </span>
        </div>
        <div className="text-[11px] text-zinc-600">מקורות-מחיר: {supply.priceSource}</div>
      </div>
    </section>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "up" | "warn" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <span
          className={cn(
            "text-zinc-500",
            tone === "up" && "text-emerald-400",
            tone === "warn" && "text-amber-400",
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums text-white" dir="ltr">
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/30 py-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="font-bold tabular-nums text-zinc-200" dir="ltr">
        {value}
      </div>
    </div>
  );
}

function Goal({ label, pct, current, target }: { label: string; pct: number; current: number; target: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-bold tabular-nums text-emerald-400" dir="ltr">
          {pct.toFixed(0)}%
        </span>
      </div>
      <Progress value={pct} className="h-2 bg-white/5 [&>div]:bg-emerald-500" aria-label={label} />
      <div className="mt-1 text-[10px] text-zinc-600 tabular-nums" dir="ltr">
        {fmtMicro(current)} / {fmtMicro(target)}
      </div>
    </div>
  );
}

function MoverList({ movers, onTrade }: { movers: { pairId: string; base: string; price: number; change24h: number }[]; onTrade?: (id: string) => void }) {
  if (!movers.length) return <div className="py-3 text-xs text-zinc-600">—</div>;
  return (
    <div className="space-y-1">
      {movers.map((m) => (
        <button
          key={m.pairId}
          onClick={() => onTrade?.(m.pairId)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
        >
          <span className="font-bold text-white" dir="ltr">
            {m.base}
          </span>
          <span className="flex items-center gap-2 tabular-nums" dir="ltr">
            <span className="text-xs text-zinc-400">{fmtPrice(m.price)}</span>
            <span className={cn("text-xs font-bold", trendColor(m.change24h))}>{fmtPct(m.change24h)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Spark({ data }: { data: { t: number; v: number }[] }) {
  if (data.length < 2) return null;
  const vs = data.map((d) => d.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const up = vs[vs.length - 1] >= vs[0];
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * 100},${28 - ((d.v - min) / span) * 26}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-16 w-36 shrink-0" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="1.8" />
      <polygon
        points={`0,30 ${pts} 100,30`}
        fill={up ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)"}
      />
    </svg>
  );
}

/* ==================== פועם-הצי · FleetPulse ==================== */
// פעילות-הצי — כל-שורה עסקת-AMM-אמיתית של סוכן-מאומת. אפס-סימולציה.

interface FleetState {
  fleetVol24h: number;
  fleetTrades24h: number;
  totalAllocated: number;
  agents: { agentId: string; name: string; active: boolean; balanceUsds: number; lastTradeAt: string | null }[];
  recentTrades: { side: string; price: number; amount: number; total: number; t: string }[];
}

function FleetPulse() {
  const [st, setSt] = useState<FleetState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fleet/state", { cache: "no-store" });
        const d = (await res.json()) as FleetState;
        if (alive) setSt(d);
      } catch {
        // שקט — הפאנל הבא ינסה שוב
      }
    };
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const active = st?.agents.filter((a) => a.active) ?? [];

  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4" aria-label="פועם-הצי">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Bot className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          פועם-הצי · סוכנים-מסחרים-באמת
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        </h3>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          aria-expanded={open}
        >
          {open ? "הסתר-פירוט" : "פירוט-סוכנים"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-black/20 p-2">
          <div className="text-[10px] text-zinc-500">נפח-צי · 24h</div>
          <div className="font-bold tabular-nums text-emerald-300" dir="ltr">{fmtMicro(st?.fleetVol24h ?? 0)}</div>
        </div>
        <div className="rounded-lg bg-black/20 p-2">
          <div className="text-[10px] text-zinc-500">עסקאות-צי · 24h</div>
          <div className="font-bold tabular-nums text-white" dir="ltr">{String(st?.fleetTrades24h ?? 0)}</div>
        </div>
        <div className="rounded-lg bg-black/20 p-2">
          <div className="text-[10px] text-zinc-500">סוכנים-פעילים</div>
          <div className="font-bold tabular-nums text-white" dir="ltr">{String(active.length)}</div>
        </div>
      </div>
      {open && (
        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto" role="list">
          {active.length === 0 && (
            <p className="py-2 text-center text-xs text-zinc-600">
              אין סוכנים-פעילים עדיין · הבעלים מקצה דרך מסך-הארנק
            </p>
          )}
          {active.map((a) => (
            <div key={a.agentId} role="listitem" className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-xs">
              <span className="flex items-center gap-2">
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300" dir="ltr">{a.agentId}</span>
                <span className="text-zinc-400">{a.name}</span>
              </span>
              <span className="tabular-nums text-zinc-300" dir="ltr">{fmtMicro(a.balanceUsds)} USDS</span>
            </div>
          ))}
          {st && st.recentTrades.length > 0 && (
            <div className="pt-2">
              <div className="mb-1 text-[10px] font-bold text-zinc-500">עסקאות-צי-אחרונות</div>
              {st.recentTrades.slice(0, 6).map((t, i) => (
                <div key={`${t.t}-${i}`} className="flex items-center justify-between px-1 py-0.5 text-[11px] tabular-nums">
                  <span className={t.side === "BUY" ? "text-emerald-400" : "text-red-400"} dir="ltr">{t.side}</span>
                  <span className="text-zinc-500" dir="ltr">{fmtPrice(t.price)} · {fmtMicro(t.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

