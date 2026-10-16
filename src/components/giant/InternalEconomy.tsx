"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Vault } from "lucide-react";

/* ═══ הכלכלה-הפנימית — ההוכחה-החיה של תורת-משתמשי-פנים ═════════════════════
 * מנדט-הבעלים (trace 1a143bc66c2a9c05): "20-ומשהו עסקאות ב-24 שעות זה מגוחך —
 * אלפים, עשרות-אלפים, מאות-אלפים עסקאות ביום, ללא תלות חוץ". הכרטיס-הזה מציג
 * את מנוע-הכלכלה-הפנימית (fleet-economy :3016): משכורות, שירותים הדדיים,
 * החלפות AMM אמיתיות, סטייקינג — על ספר hash-chain, אפס-הדמיות. כל-מספר-חי.
 * השירות עצמו נולד מהשרת-החי (spawn-מ-API — חוק-הישרדות שנמדד) ומאטים את
 * כל-הכספת לגיט כל-10 דקות (vault-seal מובנה). */

interface EconomyMetrics {
  ok: boolean;
  totalTx?: number;
  tx24h?: number;
  tx1h?: number;
  projectedPerDay?: number;
  byKind?: Record<string, number>;
  rejected?: number;
  errors?: number;
  seq?: number;
  supply?: { saosTotal: number; saosStaked: number; usdsInPool: number; saosInPool: number };
  pool?: { priceUsdsPerSaos: number; feesUsds: number; feesSaos: number };
  topAccounts?: Array<{ id: string; count: number; role: string }>;
  lastSeal?: { at: string; action: string } | null;
  error?: string;
}

const f2 = (x: number | undefined, digits = 2) => (typeof x === "number" && isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—");
const KIND_HE: Record<string, string> = {
  salary: "משכורות", service: "שירותים-הדדיים", swap: "החלפות-AMM",
  stake: "סטייק", unstake: "ביטול-סטייק", infra: "תשתית", tip: "טיפים",
  tax: "מס-שירותים 2%", recovery: "ריפוי-ספר", "dex-fee": "עמלות-דקס",
};

export function InternalEconomy() {
  const [m, setM] = useState<EconomyMetrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/economy", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setM((await res.json()) as EconomyMetrics);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "כשל-רשת");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const t0 = window.setTimeout(() => void load(), 0); // חוק-defer: הקריאה-הראשונה-אחרי-commit
    const iv = setInterval(() => void load(), 6_000);
    return () => { window.clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  const green = m?.ok && typeof m.totalTx === "number" && m.totalTx > 0;

  return (
    <section
      aria-label="הכלכלה-הפנימית-חיה"
      className={`rounded-xl border p-4 ${green ? "border-amber-500/30 bg-amber-500/5" : "border-zinc-700 bg-zinc-900/60"}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-amber-400" aria-hidden />
          <h3 className="text-sm font-semibold text-amber-100">הכלכלה-הפנימית — החיילים משתמשים ברשת (ספר-חי)</h3>
        </div>
        <span className="flex items-center gap-2 text-xs">
          <span className={`size-2 rounded-full ${green ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" : "bg-red-400"}`} aria-hidden />
          <span className={green ? "text-emerald-300" : "text-red-300"}>
            {!ready ? "טוען…" : green ? "זורם" : err ?? m?.error ?? "לא-זורם"}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4" dir="rtl">
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/70 p-3">
          <div className="text-zinc-400">עסקאות/24ש׳ (פנימיות)</div>
          <div className="mt-1 text-lg font-bold text-amber-200">{f2(m?.tx24h, 0)}</div>
        </div>
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/70 p-3">
          <div className="text-zinc-400">קצב-שעתי</div>
          <div className="mt-1 text-lg font-bold text-amber-200">{f2(m?.tx1h, 0)}<span className="text-xs text-zinc-500"> /שעה</span></div>
        </div>
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/70 p-3">
          <div className="text-zinc-400">חיזוי-יומי</div>
          <div className="mt-1 text-lg font-bold text-emerald-300">{f2(m?.projectedPerDay, 0)}</div>
        </div>
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/70 p-3">
          <div className="text-zinc-400">מחיר-בריכה SAOS/USDS</div>
          <div className="mt-1 text-lg font-bold text-zinc-100">{m?.pool ? m.pool.priceUsdsPerSaos.toFixed(4) : "—"}</div>
        </div>
      </div>

      {m?.byKind && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          {Object.entries(m.byKind).map(([k, v]) => (
            <span key={k}>{KIND_HE[k] ?? k}: <b className="text-zinc-200">{f2(v, 0)}</b></span>
          ))}
          {typeof m.seq === "number" && <span>גובה-הספר: <b className="text-zinc-200">#{f2(m.seq, 0)}</b></span>}
          {typeof m.supply?.saosStaked === "number" && <span>סטוקן: <b className="text-amber-300">{f2(m.supply.saosStaked)} SAOS</b></span>}
          {typeof m.rejected === "number" && <span>נדחות-בכנות: <b className="text-zinc-300">{f2(m.rejected, 0)}</b></span>}
          {typeof m.errors === "number" && <span>שגיאות: <b className={m.errors ? "text-red-300" : "text-zinc-300"}>{m.errors}</b></span>}
        </div>
      )}

      {m?.topAccounts && m.topAccounts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span className="text-amber-200/80">הפעילים-ביותר:</span>
          {m.topAccounts.slice(0, 5).map((a) => (
            <span key={a.id}>{a.id} <b className="text-zinc-300">{a.count}</b></span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <Vault className="size-3.5 text-zinc-500" aria-hidden />
        <span>אטימת-כספת (vault-seal): {m?.lastSeal ? `${m.lastSeal.action} · ${m.lastSeal.at}` : "בתזמון — סבב-ראשון דקה-אחרי-עלייה"}</span>
        <span>· אספקת-SAOS קבועה: {f2(m?.supply?.saosTotal, 0)} (חוק-21M המתוקן)</span>
      </div>
    </section>
  );
}
