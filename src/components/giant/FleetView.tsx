"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw, Ship } from "lucide-react";

/* ═══ הצי — לקוחות-האמת-הראשונים של-הריבונות ═══════════════════════════════
 * הוראת-הבעלים: הסוכנים-והצי עובדים-כלקוחות-האמת-של-הפלטפורמה-שלנו.
 * הם-לא-ניטור-פסיבי: כל-סוכן-מחזיק-ארנק-אמת-בלדג'ר (FLEET:<agentId>),
 * מחליט-מתי-לסחור, מציב-פקודות-לימיט, מבטל-זקנות — הכול-דרך אותו-מנוע-אמת
 * שה-API-הציבורי-מפעיל. אין-הדמיה: כל-מספר-כאן-מגיע-מהלדג'ר.
 * הבריאות-מדודה-כנה — כולל-שגיאות (אין-ירוק-מזויף). */

interface AgentRow {
  agentId: string;
  name: string;
  active: boolean;
  allocationUsds: number;
  balanceUsds: number;
  vol24h: number;
  trades24h: number;
  lastTradeAt: string | null;
}

interface LoopHealth {
  running: boolean;
  sweeps: number;
  trades: number;
  orders: number;
  cancels: number;
  errors: number;
  lastError: string | null;
  lastSweepAt: string | null;
  lastActionAt: string | null;
}

interface FleetState {
  limits: { minPerAgent: number; maxPerAgent: number; maxTotalFleet: number };
  fleetVol24h: number;
  fleetTrades24h: number;
  totalAllocated: number;
  agents: AgentRow[];
  recentTrades: Array<{ side: string; price: number; amount: number; total: number; t: string }>;
  loop: LoopHealth | null;
}

const f2 = (n: number | null | undefined, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—";

const agoHe = (iso: string | null) => {
  if (!iso) return "מעולם-לא";
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (sec < 60) return "עכשיו";
  const min = Math.round(sec / 60);
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.floor(min / 60);
  return `לפני ${h} שע׳ ${min % 60 ? `${min % 60} דק׳` : ""}`.trim();
};

const timeHe = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

export function FleetView() {
  const [state, setState] = useState<FleetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/fleet/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((await res.json()) as FleetState);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "כשל-רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t0 = window.setTimeout(() => void load(), 0);
    const iv = setInterval(() => void load(), 45_000);
    return () => {
      window.clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  const loop = state?.loop ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6" dir="rtl">
      {/* ─── כותרת ─── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <Ship className="size-5 text-amber-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-amber-100">הצי — לקוחות-האמת-הראשונים</h2>
            <p className="text-xs text-zinc-400">הסוכנים-שלנו-מסחררים-על-הבריכה-שלנו · ארנק-אמת · לדג'ר-אמת · אפס-תלות-חוץ</p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition hover:border-amber-500/40 hover:text-amber-300"
          aria-label="רענון-מצב-הצי"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          רענון
        </button>
      </header>

      {/* ─── בריאות-הלולאה — מדידה-כנה ─── */}
      <section
        aria-label="בריאות-לולאת-הצי"
        className={`rounded-xl border p-4 ${
          loop?.running
            ? "border-emerald-500/30 bg-emerald-500/5"
            : loop
              ? "border-red-500/30 bg-red-500/5"
              : "border-zinc-700 bg-zinc-900/60"
        }`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block size-2.5 rounded-full ${
                loop?.running ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" : "bg-red-400"
              }`}
              aria-hidden
            />
            <span className={`text-sm font-medium ${loop?.running ? "text-emerald-300" : "text-red-300"}`}>
              {loop ? (loop.running ? "לולאת-הלקוחות-חיה" : "לולאת-הלקוחות-שקטה") : "טוען-בריאות…"}
            </span>
          </div>
          {loop && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
              <span>סריקות: <b className="text-zinc-200">{loop.sweeps.toLocaleString("en-US")}</b></span>
              <span>עסקאות: <b className="text-amber-300">{loop.trades}</b></span>
              <span>לימיטים: <b className="text-zinc-200">{loop.orders}</b></span>
              <span>ביטולים: <b className="text-zinc-200">{loop.cancels}</b></span>
              <span className={loop.errors > 0 ? "text-red-300" : ""}>שגיאות: <b>{loop.errors}</b></span>
              <span>סריקה-אחרונה: {agoHe(loop.lastSweepAt)}</span>
              <span>פעולה-אחרונה: {agoHe(loop.lastActionAt)}</span>
            </div>
          )}
        </div>
        {loop?.lastError && (
          <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
            שגיאה-אחרונה (כנה): {loop.lastError}
          </p>
        )}
      </section>

      {/* ─── חוקי-האמת ─── */}
      <section className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4" aria-label="חוקי-האמת-של-הצי">
        <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-400">
          <li>· כל-סוכן-מחזיק-ארנק-אמת (FLEET:&lt;agentId&gt;) — מהקופה, עם-רשומת-מקור-בלדג'ר. אין-הדפסה-סמויה.</li>
          <li>· הסוכנים-מחליטים-בעצמם: התאמת-מלאי-סביב-מחיר-הבריכה · לימיט-ליד-המחיר · ביטול-זקנים — בלי-יד-אנושית.</li>
          <li>· כל-פעולה-עוברת-את-אותו-מנוע-אמת (עמלות · נעילות · מילויים · השפעת-מחיר) — כמו-לקוח-חוץ-בדיוק.</li>
          <li>· מינון-כנה: פקודה-עד-12 USDS · עד-2 לימיטים-פתוחים-לסוכן · מרווח-בין-פעולות-2–5 דק — לקוח-קמעונאי, לא-לוויתן.</li>
          <li>· הלולאה-איננה-תלויה-בשום-שירות-חוץ — גם-בלי-Binance הצי-ממשיך-לעבוד.</li>
        </ul>
      </section>

      {err && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          המצב-לא-נמדד-כרגע (כשל-כנה): {err}
        </p>
      )}

      {/* ─── מספרי-על ─── */}
      {state && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="מספרי-הצי">
          {[
            { label: "נפח-צי-24h (USDS)", val: f2(state.fleetVol24h), cls: "text-amber-300" },
            { label: "עסקאות-צי-24h", val: String(state.fleetTrades24h), cls: "text-zinc-100" },
            { label: "הוקצה-לצי (USDS)", val: f2(state.totalAllocated, 0), cls: "text-zinc-100" },
            { label: "תקרת-הצי (USDS)", val: f2(state.limits.maxTotalFleet, 0), cls: "text-zinc-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <p className="text-[11px] text-zinc-500">{s.label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${s.cls}`}>{s.val}</p>
            </div>
          ))}
        </section>
      )}

      {/* ─── הסוכנים ─── */}
      {state && (
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4" aria-label="רשימת-הסוכנים">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Bot className="size-4 text-amber-400" aria-hidden /> הסוכנים-הפעילים ({state.agents.filter((a) => a.active).length}/{state.agents.length})
          </h3>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[640px] text-right text-xs">
              <thead>
                <tr className="border-b border-zinc-700/70 text-zinc-500">
                  <th className="pb-2 font-medium">סוכן</th>
                  <th className="pb-2 font-medium">מצב</th>
                  <th className="pb-2 font-medium">הקצאה</th>
                  <th className="pb-2 font-medium">יתרה-חופשית (USDS)</th>
                  <th className="pb-2 font-medium">נפח-24h</th>
                  <th className="pb-2 font-medium">עסקאות-24h</th>
                  <th className="pb-2 font-medium">סחר-אחרון</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {state.agents.map((a) => (
                  <tr key={a.agentId} className="text-zinc-300">
                    <td className="py-2.5 font-medium text-zinc-100">{a.agentId}</td>
                    <td className="py-2.5">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] ${
                        a.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-600 bg-zinc-800 text-zinc-400"
                      }`}>
                        {a.active ? "פעיל" : "מושבת"}
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums">{f2(a.allocationUsds, 0)}</td>
                    <td className="py-2.5 tabular-nums text-amber-300">{f2(a.balanceUsds)}</td>
                    <td className="py-2.5 tabular-nums">{f2(a.vol24h)}</td>
                    <td className="py-2.5 tabular-nums">{a.trades24h}</td>
                    <td className="py-2.5 text-zinc-400">{agoHe(a.lastTradeAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── עסקאות-אמת-אחרונות ─── */}
      {state && state.recentTrades.length > 0 && (
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4" aria-label="עסקאות-צי-אחרונות">
          <h3 className="mb-3 text-sm font-medium text-zinc-200">עסקאות-האמת-האחרונות (מהלדג'ר)</h3>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pl-1 text-xs">
            {state.recentTrades.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                <span className={`font-medium ${t.side === "BUY" ? "text-emerald-300" : "text-orange-300"}`}>
                  {t.side === "BUY" ? "קנייה" : "מכירה"}
                </span>
                <span className="tabular-nums text-zinc-300">{f2(t.amount, 4)} SAOS @ {f2(t.price, 5)}</span>
                <span className="tabular-nums text-zinc-400">{f2(t.total)} USDS</span>
                <span className="text-zinc-500">{timeHe(t.t)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
