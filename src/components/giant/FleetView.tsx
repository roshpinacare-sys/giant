"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Boxes, RefreshCw, Ship } from "lucide-react";
import { InternalEconomy } from "@/components/giant/InternalEconomy";

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
  balanceSaos?: number;
  openOrders?: number;
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
  bookShare?: {
    totalOrders: number;
    fleetOrders: number;
    fleetPct: number;
    totalLocked: number;
    fleetLocked: number;
    fleetPctLocked: number;
  };
  agents: AgentRow[];
  recentTrades: Array<{ side: string; price: number; amount: number; total: number; agentId?: string | null; t: string }>;
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
            <h2 className="text-lg font-semibold text-amber-100">הצי — משתמשי-הרשת (פנים-ראשון)</h2>
            <p className="text-xs text-zinc-400">הוראת-הבעלים (גל-77): החיילים-הצי-והסוכנים הם-המשתמשים-ברשת — הוכחה-ומטרה · אין-חיפוש-לקוחות-חוץ · הפיתוח-כלפי-פנים</p>
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

      {/* ─── משתמשי-הפנים-חיים — המדידה-הרשמית ─── */}
      <section aria-label="משתמשי-הפנים-חיים" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-medium text-amber-200">משתמשי-פנים-חיים:</span>
          <span>סוכנים-פעילים: <b className="text-emerald-300">{state ? state.agents.filter((a) => a.active).length : "—"}/{state?.agents.length ?? "—"}</b></span>
          <span>ריצות/24ש׳: <b className="text-amber-300">{f2(state?.fleetTrades24h, 0)}</b></span>
          <span>ווליום/24ש׳: <b className="text-amber-300">{f2(state?.fleetVol24h)} USDS</b></span>
          <span>תקציב-מוקצה: <b className="text-zinc-200">{f2(state?.totalAllocated)} USDS</b></span>
        </div>
      </section>

      {/* ─── הכלכלה-הפנימית — מנוע-העסקאות-הפנימיות (תורת-משתמשי-פנים) ─── */}
      <InternalEconomy />

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
          <li>· כל-פעולה-עוברת-את-אותו-מנוע-אמת (עמלות · נעילות · מילויים · השפעת-מחיר) — המנוע-לא-מבחין-בין-משתמש-פנים-לכל-אחר: חוק-אחד-לכולם.</li>
          <li>· שירות-עצמי-מלא (גל-62): כל-סוכן-מציב-לימיט-עם-עיקול, מבטל-את-שלו, ורואה-רק-את-שלו — באסימון-הסוכן-שלו.</li>
          <li>· מינון-כנה (גל-82 · נמדד): פקודה-עד-24-USDS-ולא-יותר-מ-0.6%-מרזרבת-כל-בריכה · עד-8-פקודות-פתוחות-לסוכן · מרווח-בין-פעולות-5–20-שנ׳ · סריקה-כל-4-שנ׳ — קמעונאי-רב-בריכות, לא-לוויתן.</li>
          <li>· הלולאה-סוחרת-על-כל-בריכה-ילידה-חיה (SAOS + SC-CONSOLE/DOMAIN/ROSH/FLEET) — ריבוי-בריכות-מגל-82 · איננה-תלויה-בשום-שירות-חוץ.</li>
          <li>· דוקטרינת-פנים-ראשון: היכולות-מפותחות-כלפי-פנים — המסילות-משרתות-קודם-את-האוצר-והצבא; מסילות-ה-API-פתוחות-אך-אינן-היעד.</li>
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

      {/* ─── עומק-פנימי — הצי-הוא-הנזילות (ההוכחה-החיה) ─── */}
      {state?.bookShare && (
        <section
          aria-label="עומק-פנימי-מהצי"
          className={`rounded-xl border p-4 ${
            state.bookShare.fleetPct >= 50
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-zinc-700 bg-zinc-900/60"
          }`}
        >
          <h3 className="mb-3 text-sm font-medium text-zinc-200">עומק-פנימי — הצי-הוא-הנזילות (נמדד-חי-מהספר-הפתוח)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "פקודות-הצי-מהספר", val: `${state.bookShare.fleetOrders}/${state.bookShare.totalOrders}`, sub: `${state.bookShare.fleetPct}% מהספר`, cls: "text-emerald-300" },
              { label: "נעול-מהצי-בעיקול (USDS)", val: f2(state.bookShare.fleetLocked), sub: `${state.bookShare.fleetPctLocked}% מהנעול`, cls: "text-amber-300" },
              { label: "סך-הנעול-בספר (USDS)", val: f2(state.bookShare.totalLocked), sub: "כל-החשבונות", cls: "text-zinc-100" },
              { label: "הוקצה-לצי (USDS)", val: f2(state.totalAllocated, 0), sub: `תקרה ${f2(state.limits.maxTotalFleet, 0)}`, cls: "text-zinc-100" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <p className="text-[11px] text-zinc-500">{s.label}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${s.cls}`}>{s.val}</p>
                <p className="text-[10px] text-zinc-500">{s.sub}</p>
              </div>
            ))}
          </div>
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
                  <th className="pb-2 font-medium">USDS חופשי</th>
                  <th className="pb-2 font-medium">SAOS</th>
                  <th className="pb-2 font-medium">פתוחות</th>
                  <th className="pb-2 font-medium">נפח-24h</th>
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
                    <td className="py-2.5 tabular-nums text-zinc-300">{f2(a.balanceSaos, 2)}</td>
                    <td className="py-2.5 tabular-nums">
                      {(a.openOrders ?? 0) > 0 ? (
                        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 tabular-nums">
                          {a.openOrders}
                        </span>
                      ) : (
                        <span className="text-zinc-600">0</span>
                      )}
                    </td>
                    <td className="py-2.5 tabular-nums">{f2(a.vol24h)}</td>
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
                {t.agentId && (
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">{t.agentId}</span>
                )}
                <span className="tabular-nums text-zinc-300">{f2(t.amount, 4)} SAOS @ {f2(t.price, 5)}</span>
                <span className="tabular-nums text-zinc-400">{f2(t.total)} USDS</span>
                <span className="text-zinc-500">{timeHe(t.t)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── מלאי-היכולות-החי (גל-86 · חיווט-הכל-לכלים) ─── */}
      <CapabilitiesPanel />
    </div>
  );
}

interface CapRow {
  name: string;
  group: string;
  state: "OK" | "BLOCKED" | "FAIL" | "DOWN" | "STARTABLE" | "UNKNOWN";
  detail: string;
  runnable: boolean;
  measuredAt: string;
}

const CAP_STATE_HE: Record<CapRow["state"], { label: string; cls: string }> = {
  OK: { label: "חי", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  BLOCKED: { label: "חסום-שער", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  STARTABLE: { label: "מוכן-להקמה", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  DOWN: { label: "למטה", cls: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
  FAIL: { label: "כשל-כנה", cls: "border-red-500/30 bg-red-500/10 text-red-300" },
  UNKNOWN: { label: "לא-הוכח", cls: "border-zinc-600 bg-zinc-800 text-zinc-400" },
};

function CapabilitiesPanel() {
  const [caps, setCaps] = useState<CapRow[] | null>(null);
  const [measuredAt, setMeasuredAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/capabilities", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { capabilities?: CapRow[]; measuredAt?: string };
      setCaps(j.capabilities ?? []);
      setMeasuredAt(j.measuredAt ?? null);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "כשל-רשת");
    }
  }, []);

  useEffect(() => {
    const t0 = window.setTimeout(() => void load(), 0);
    const iv = setInterval(() => void load(), 120_000);
    return () => {
      window.clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  const groups = Array.from(new Set((caps ?? []).map((c) => c.group)));
  const okCount = (caps ?? []).filter((c) => c.state === "OK").length;

  return (
    <section className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4" aria-label="מלאי-יכולות-הריבונות">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Boxes className="size-4 text-zinc-400" aria-hidden />
          <h3 className="text-sm font-medium text-zinc-200">מלאי-היכולות-החי — כל-רכוש-הגיט מחובר-לכלים (גל-86)</h3>
        </div>
        <div className="flex items-center gap-3">
          {caps && (
            <span className="text-[11px] text-zinc-500">
              {okCount}/{caps.length} חיים{measuredAt ? ` · מדוד ${agoHe(measuredAt)}` : ""}
            </span>
          )}
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-amber-500/40 hover:text-amber-300"
            aria-label="מדידה-חוזרת-של-המלאי"
          >
            <RefreshCw className="size-3" aria-hidden />
            מדידה
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-red-300">כשל-מדידה: {err}</p>}
      {!caps && !err && <p className="text-xs text-zinc-500">מודד את המלאי-החי (הרצת-כלים אמיתית — עד-דקה)…</p>}
      {caps && (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{g}</p>
              <ul className="space-y-1.5">
                {caps.filter((c) => c.group === g).map((c) => {
                  const st = CAP_STATE_HE[c.state] ?? CAP_STATE_HE.UNKNOWN;
                  return (
                    <li key={`${c.group}-${c.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                      <span className="font-mono text-zinc-200">{c.name}</span>
                      <span className="min-w-0 flex-1 text-zinc-500" style={{ overflowWrap: "anywhere" }}>{c.detail}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
