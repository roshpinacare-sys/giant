"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, ShieldAlert, RefreshCw, ExternalLink, Radio, Wrench, Gauge, Landmark, Scale } from "lucide-react";
import type { CapitalPayload, MovementReadiness, RepairRow, StrategyRow, SovereignFiling } from "@/lib/giant/capital-types";

/* ═══ דלת-ההון — מנוע-ההון הריבוני · דוקטרינת-הקידום MND-20261015 ═══
 * "אני רוצה כן לקדם תנועות הון כאשר אנחנו מוכנים" (הבעלים):
 *  · מנדט-עמידה חי בראש-הדלת — התקדמות-בשערים-ירוקים, לא-חסימה
 *  · אמת-החשבון-הריבוני (headcorner) נמדדת-חי: חופשי+תחום+מלאי (התיקון-הגדול)
 *  · לולאת-התיקון: אבחון+תיקון במקום-סגירה
 *  · שערי-מוכנות מדודים-חי — הכרעה-אוטומטית אפס-שיקול-דעת */

const STATUS_HE: Record<StrategyRow["status"], string> = {
  ACTIVE: "פעילה-חי",
  READY: "מוכנה",
  "NEEDS-APPROVAL": "מסמך-הרחבה",
  DORMANT: "רדומה",
  REJECTED: "נדחתה",
  REPAIRING: "בתיקון-חי",
};

const STATUS_CLS: Record<StrategyRow["status"], string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-400",
  READY: "bg-amber-500/10 text-amber-400",
  "NEEDS-APPROVAL": "bg-amber-500/15 text-amber-300",
  DORMANT: "bg-zinc-500/10 text-zinc-400",
  REJECTED: "bg-red-500/10 text-red-400",
  REPAIRING: "bg-teal-500/10 text-teal-300",
};

const LIQ_HE: Record<StrategyRow["liquidity"], string> = {
  FULL: "מלאה",
  HIGH: "גבוהה",
  MEDIUM: "בינונית",
  "LOCKED-7D": "נעולה-7-ימים",
  LOW: "נמוכה",
  NONE: "אין",
};

const GATE_CLS: Record<"GREEN" | "RED" | "AMBER", string> = {
  GREEN: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  RED: "bg-red-500/10 text-red-400 border-red-500/30",
  AMBER: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const GATE_HE: Record<"GREEN" | "RED" | "AMBER", string> = { GREEN: "ירוק", RED: "אדום", AMBER: "צהוב" };

const REPAIR_STATE_CLS: Record<RepairRow["repairState"], string> = {
  "FIXED-LIVE": "bg-emerald-500/10 text-emerald-300",
  "IN-FLIGHT": "bg-teal-500/10 text-teal-300",
  "MEASURED-ROUTED": "bg-amber-500/10 text-amber-300",
  "AUTO-FLIP-ARMED": "bg-amber-500/10 text-amber-300",
  "AWAITING-OWNER": "bg-zinc-500/10 text-zinc-300",
};

const VERDICT_CLS: Record<MovementReadiness["verdict"], string> = {
  ADVANCE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "ADVANCE-ABLE": "bg-teal-500/10 text-teal-300 border-teal-500/30",
  "REPAIR-FIRST": "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

const VERDICT_HE: Record<MovementReadiness["verdict"], string> = {
  ADVANCE: "מתקדמת",
  "ADVANCE-ABLE": "מוכנה-להתקדם",
  "REPAIR-FIRST": "תיקון-קודם",
};

const fmt = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";

function FilingChip({ filing }: { filing: SovereignFiling }) {
  return (
    <a
      href={filing.streamUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20"
      title={`זרם-הריבונות · הוגש ${filing.filedAt} · רישום: ${filing.registryRef}`}
    >
      <Radio className="h-3 w-3 shrink-0" aria-hidden />
      {filing.reqId} · פתוח בזרם-הריבונות
      <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden />
    </a>
  );
}

export function CapitalView() {
  const [d, setD] = useState<CapitalPayload | null>(null);
  const [err, setErr] = useState("");
  const [spin, setSpin] = useState(false);

  const load = useCallback(async () => {
    setSpin(true);
    try {
      const res = await fetch("/api/giant/capital", { cache: "no-store" });
      const j = (await res.json()) as CapitalPayload;
      setD(j);
      setErr(j.ok ? "" : j.note ?? "לא-נמדד");
    } catch {
      setErr("השרת-לא-נגיש-כרגע");
    } finally {
      setSpin(false);
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* כותרת-הדלת */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <span className="text-sm font-black text-zinc-100">מנוע-ההון הריבוני</span>
        {d?.ok && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            שבע-אסטרטגיות · נמדד-חי · דוקטרינת-קידום
          </span>
        )}
        {d && <span className="font-mono text-[10px] text-zinc-500">מדידה {new Date(d.measuredAt).toLocaleTimeString("he-IL")} · {d.meta?.ms ?? "—"}ms · RPC {d.meta?.rpc?.replace("https://", "") ?? "—"}</span>}
        <button
          onClick={() => void load()}
          className="mr-auto flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 text-[10px] font-bold text-zinc-400 transition hover:border-amber-600/40 hover:text-amber-400"
          aria-label="מדוד-שוב"
        >
          <RefreshCw className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} aria-hidden />
          מדוד-שוב
        </button>
      </section>
      {err && (
        <p className="flex items-center gap-2 text-xs text-red-400">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          {err}
        </p>
      )}

      {/* מנדט-העמידה — הוראת-הבעלים החיה */}
      {d?.mandate && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-black text-emerald-300">
              <span className="g-breathe h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              מנדט-עמידה {d.mandate.id} · רשום-במנוע
            </span>
            <span className="font-mono text-[9px] text-zinc-500" dir="ltr">{d.mandate.sourceTrace}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-200">{d.mandate.directiveHe}</p>
          <p className="mt-1.5 text-[11px] leading-5 text-emerald-200/90">
            <b>האפקט:</b> {d.mandate.effectHe}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-zinc-400">{d.mandate.doctrineHe}</p>
        </section>
      )}

      {/* אמת-החשבון-הריבוני — התיקון-הגדול של המלאי + המיקור-החי */}
      {d?.sovereign && (
        <section className="rounded-2xl border border-emerald-600/25 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-300">
              <Landmark className="h-4 w-4 text-emerald-400" aria-hidden />
              אמת-החשבון-הריבוני
            </h3>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300" dir="ltr">{d.sovereign.account}</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">חי-על-השרשרת</span>
          </div>
          <p className="mb-3 mt-1 text-[10px] leading-4 text-zinc-500">{d.sovereign.treasuryBasisHe}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
              <p className="mb-2 text-[11px] font-black text-emerald-400">מלאי-האמת · חופשי + תחום-בהזמנות (התיקון-הגדול)</p>
              <p className="mb-2 font-mono text-2xl font-black text-emerald-300" dir="ltr">
                {d.sovereign.treasuryUsdMarked != null ? `${fmt(d.sovereign.treasuryUsdMarked)}$` : "—"}
              </p>
              <ul className="space-y-1 font-mono text-[10px] text-zinc-300" dir="ltr">
                <li>STEEM free {fmt(d.sovereign.holdings.steemFree, 3)} + locked {fmt(d.sovereign.holdings.steemLocked, 3)} = <b>{fmt(d.sovereign.holdings.steemTotal, 3)}</b></li>
                <li>SBD free {fmt(d.sovereign.holdings.sbdFree, 3)} + locked {fmt(d.sovereign.holdings.sbdLocked, 3)} = <b>{fmt(d.sovereign.holdings.sbdTotal, 3)}</b></li>
                <li className="text-zinc-500">SP own {fmt(d.sovereign.sp.ownSp, 1)} · out {fmt(d.sovereign.sp.delegatedOutSp, 1)} · in {fmt(d.sovereign.sp.receivedInSp, 1)} · net <b>{fmt(d.sovereign.sp.netWorkingSp, 1)}</b></li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-950 p-3">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-black text-zinc-300">
                <Gauge className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                המיקור-החי (100-האופ-האחרונים)
              </p>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {[
                  { k: "fills", v: d.sovereign.ops.fills },
                  { k: "הזמנות-חדשות", v: d.sovereign.ops.orderCreates },
                  { k: "ביטולים", v: d.sovereign.ops.cancels },
                  { k: "STEEM-נמכר", v: fmt(d.sovereign.ops.sellsSteem, 1) },
                  { k: "SBD-התקבל", v: fmt(d.sovereign.ops.sbdReceived, 2) },
                  { k: "VWAP SBD/STEEM", v: d.sovereign.ops.sellVwapSbdPerSteem != null ? d.sovereign.ops.sellVwapSbdPerSteem.toFixed(5) : "—" },
                ].map((c) => (
                  <div key={c.k} className="rounded-lg bg-zinc-900/80 px-2 py-1.5">
                    <p className="text-[8px] text-zinc-500">{c.k}</p>
                    <p className="font-mono text-xs font-bold text-zinc-100" dir="ltr">{c.v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-mono text-[9px] text-zinc-600" dir="ltr">
                {d.sovereign.ops.windowFrom?.slice(0, 16) ?? "—"} → {d.sovereign.ops.windowTo?.slice(0, 16) ?? "—"}
              </p>
              {d.sovereign.openOrders.length > 0 && (
                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1 g-scroll">
                  {d.sovereign.openOrders.slice(0, 6).map((o) => (
                    <p key={o.orderId} className="flex items-center gap-2 font-mono text-[9px] text-zinc-400" dir="ltr">
                      <span className={o.side === "SELL-SBD" ? "text-emerald-500" : "text-amber-500"}>{o.side}</span>
                      <span>{o.amountSbd != null ? `${o.amountSbd.toFixed(3)} SBD` : `${(o.amountSteem ?? 0).toFixed(3)} STEEM`}</span>
                      <span className="text-zinc-600">@ {o.priceSbdPerSteem.toFixed(5)}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 font-mono text-[9px] leading-4 text-zinc-500">{d.sovereign.evidenceHe}</p>
        </section>
      )}

      {/* שערי-מוכנות — הכרעת-הקידום */}
      {(d?.readiness ?? []).length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-1 text-sm font-bold text-zinc-300">שערי-מוכנות · ההכרעה-האוטומטית-לפי-המנדט</h3>
          <p className="mb-3 text-[10px] text-zinc-500">כל-שער נמדד-חי בכל-מדידה — ירוק-מלא = התנועה-מתקדמת · אפס-שיקול-דעת, אפס-חסימה-יזומה</p>
          <div className="space-y-3">
            {(d?.readiness ?? []).map((m) => (
              <article key={m.movementId} className="rounded-xl border border-white/5 bg-zinc-950 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-zinc-100">{m.nameHe}</span>
                  <span className="font-mono text-[9px] text-zinc-600" dir="ltr">{m.movementId}</span>
                  <span className={`mr-auto rounded-full border px-2.5 py-0.5 text-[10px] font-black ${VERDICT_CLS[m.verdict]}`}>
                    {VERDICT_HE[m.verdict]}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-zinc-400">{m.verdictHe}</p>
                <ul className="mt-2 space-y-1.5">
                  {m.gates.map((g) => (
                    <li key={g.gate} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                      <span className={`mt-0.5 rounded border px-1.5 py-px text-[8px] font-black ${GATE_CLS[g.state]}`}>{GATE_HE[g.state]}</span>
                      <span className="text-[10px] font-bold text-zinc-300">{g.he}</span>
                      <span className="font-mono text-[9px] text-zinc-500" dir="ltr">{g.measured}</span>
                      <span className="text-[9px] text-zinc-600">{g.flipHe}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* לולאת-התיקון — אבחון+תיקון במקום-סגירה */}
      {(d?.repairs ?? []).length > 0 && (
        <section className="rounded-2xl border border-teal-600/25 bg-zinc-900/60 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-300">
            <Wrench className="h-4 w-4 text-teal-400" aria-hidden />
            לולאת-התיקון · מה-שלא-מסתדר — מאובחן-ומתוקן, לא-נסגר
          </h3>
          <p className="mb-3 text-[10px] text-zinc-500">דוקטרינת MND-20261015: כל-אבחון נושא-מדידה-חיה · כל-תיקון נושא-נתיב-פעולה</p>
          <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1 g-scroll">
            {(d?.repairs ?? []).map((r) => (
              <article key={r.strategyId} className="rounded-xl border border-white/5 bg-zinc-950 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-zinc-100">{r.nameHe}</span>
                  <span className={`mr-auto rounded-full px-2 py-0.5 text-[9px] font-black ${REPAIR_STATE_CLS[r.repairState]}`}>
                    {r.repairStateHe}
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-zinc-400"><b className="text-zinc-300">אבחון:</b> {r.diagnosisHe}</p>
                <p className="mt-1 font-mono text-[9px] leading-4 text-zinc-500" dir="ltr">{r.measuredEvidence}</p>
                <ul className="mt-1.5 space-y-1">
                  {r.repairsHe.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-[10px] leading-4 text-zinc-400">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-teal-500" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* דירוג-ROI — שבע-האסטרטגיות */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <h3 className="mb-1 text-sm font-bold text-zinc-300">דירוג-ROI אחיד · שבע-האסטרטגיות</h3>
        <p className="mb-3 text-[10px] leading-4 text-zinc-500">
          תשואה-נמדדת קודמת לכל-טענה · סטטוס-נגזר-מהמציאות-על-השרשרת (לא-מהחלטה-מנהלית) · אפס-הסתרה
        </p>
        <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1 g-scroll">
          {(d?.strategies ?? []).map((s) => (
            <article
              key={s.id}
              className={`rounded-xl border p-3 ${
                s.status === "ACTIVE"
                  ? "border-emerald-600/30 bg-emerald-500/[0.03]"
                  : s.status === "REPAIRING"
                    ? "border-teal-600/30 bg-teal-500/[0.03]"
                    : "border-white/5 bg-zinc-950"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 font-mono text-[11px] font-black text-zinc-300" aria-label={`דירוג ${s.rank}`}>
                  {s.rank}
                </span>
                <span className="text-xs font-black text-zinc-100">{s.nameHe}</span>
                <span className="font-mono text-[9px] tracking-wider text-zinc-600" dir="ltr">{s.id}</span>
                <span className={`mr-auto rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_CLS[s.status]}`}>
                  {STATUS_HE[s.status]}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] sm:grid-cols-4">
                <p className="text-zinc-500">
                  תשואה:{" "}
                  <b className={`font-mono ${s.aprPct != null && s.aprPct > 0 ? "text-emerald-400" : s.aprPct != null ? "text-zinc-300" : "text-zinc-600"}`} dir="ltr">
                    {s.aprPct != null ? `${fmt(s.aprPct)}%` : "—"}
                  </b>
                </p>
                <p className="text-zinc-500">נזילות: <b className="text-zinc-300">{LIQ_HE[s.liquidity]}</b></p>
                <p className="text-zinc-500">סיכון: <b className={s.risk === "HIGH" ? "text-red-400" : s.risk === "MEDIUM" ? "text-amber-400" : "text-emerald-400"}>{s.risk}</b></p>
                <p className="text-zinc-500">התאמת-הון: <b className="font-mono text-zinc-300" dir="ltr">{s.capitalFitUsd != null ? `${fmt(s.capitalFitUsd)}$` : "—"}</b></p>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">{s.aprBasis}</p>
              <p className="mt-0.5 font-mono text-[9px] leading-4 text-zinc-600" dir="ltr">{s.evidence}</p>
            </article>
          ))}
          {d && d.strategies.length === 0 && <p className="text-xs text-zinc-500">אין-אסטרטגיות-נמדדות</p>}
        </div>
      </section>

      {/* תוכנית-ההרחבה MM-INTERNAL */}
      {d?.mmPlan && (
        <section className="rounded-2xl border border-amber-600/25 bg-zinc-900/60 p-4">
          <h3 className="mb-1 text-sm font-bold text-zinc-300">
            תוכנית-ההרחבה · מכשור-שוק פנימי <span className="font-mono text-[10px] text-zinc-500" dir="ltr">MM-INTERNAL</span>
          </h3>
          <p className="mb-3 text-[10px] text-zinc-500">המיקור-חי-כבר-על-השרשרת · המסמך = פרמטרי-ההרחבה הנגזרים-ממדידה-חיה</p>
          <div className="mb-3 flex flex-col gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-xs font-black text-amber-300">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {d.mmPlan.statusLine}
            </span>
            <FilingChip filing={d.mmPlan.filing} />
            <span className="text-[10px] leading-4 text-amber-200/70">{d.mmPlan.approvalPathHe}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {[
              { k: "spread נמדד", v: d.mmPlan.inputs.spreadPct != null ? `${fmt(d.mmPlan.inputs.spreadPct)}%` : "—" },
              { k: "עומק-ספר נמדד", v: d.mmPlan.inputs.totalDepthUsd != null ? `${fmt(d.mmPlan.inputs.totalDepthUsd)}$` : "—" },
              { k: "מלאי-אמת (מתוקן)", v: d.mmPlan.inputs.realMoneyUsd != null ? `${fmt(d.mmPlan.inputs.realMoneyUsd)}$` : "—" },
              { k: "תקציב-מיקור (20%)", v: d.mmPlan.params.quoteBudgetUsd != null ? `${fmt(d.mmPlan.params.quoteBudgetUsd)}$` : "—" },
              { k: "הזמנה-מרבית", v: d.mmPlan.params.maxOrderUsd != null ? `${fmt(d.mmPlan.params.maxOrderUsd)}$` : "—" },
              { k: "דיוק-דיור-מינ' ", v: d.mmPlan.params.quoteAtSpreadPct != null ? `${fmt(d.mmPlan.params.quoteAtSpreadPct)}%` : "—" },
            ].map((p) => (
              <div key={p.k} className="rounded-lg bg-zinc-950 px-3 py-2">
                <p className="text-[9px] text-zinc-500">{p.k}</p>
                <p className="font-mono text-sm font-bold text-zinc-100" dir="ltr">{p.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-zinc-500">{d.mmPlan.paramsBasisHe}</p>
          <h4 className="mb-1.5 mt-3 text-[11px] font-black text-zinc-300">מעקות-הביטול והפסק (חד-סטריים, ללא-שיקול-דעת)</h4>
          <ul className="space-y-1">
            {d.mmPlan.guardrailsHe.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-[10px] leading-4 text-zinc-400">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
                {g}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* מטריצת-הדלגציה SP-DELEGATE — מוחשית על SP-אמת */}
      {d?.spMatrix && (
        <section className="rounded-2xl border border-amber-600/25 bg-zinc-900/60 p-4">
          <h3 className="mb-1 text-sm font-bold text-zinc-300">
            מטריצת-מחזור · העברת-SP <span className="font-mono text-[10px] text-zinc-500" dir="ltr">SP-DELEGATE</span>
          </h3>
          <p className="mb-3 text-[10px] leading-4 text-zinc-500">
            אומדן-ה-APR החי: <b className="font-mono text-amber-400" dir="ltr">{d.spMatrix.aprPct != null ? `${fmt(d.spMatrix.aprPct)}%` : "—"}</b>
            {d.spMatrix.realizedCurationAprPct != null && (
              <> · הלכידה-הממשית-נמדדה: <b className="font-mono text-teal-300" dir="ltr">{fmt(d.spMatrix.realizedCurationAprPct)}%</b> (הפער = לולאת-התיקון)</>
            )}
            {" · "}{d.spMatrix.aprBasisHe}
            {d.reward?.formulaHe && <> · <span className="font-mono text-zinc-600" dir="ltr">{d.reward.formulaHe}</span></>}
          </p>
          <div className="mb-3 flex flex-col gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-xs font-black text-amber-300">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {d.spMatrix.statusLine}
            </span>
            <FilingChip filing={d.spMatrix.filing} />
            <span className="text-[10px] leading-4 text-amber-200/70">{d.spMatrix.approvalPathHe}</span>
          </div>
          <div className="space-y-2">
            {d.spMatrix.rows.map((r) => (
              <article key={r.sharePct} className="rounded-xl border border-white/5 bg-zinc-950 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-black text-zinc-100" dir="ltr">{r.sharePct}%</span>
                  <span className="text-[10px] text-zinc-500">מ-SP-החזקה · מופעל {r.workingSp} SP לכל-1000 · נזילות-שמורה {r.liquidityRetainedPct}% · חזרה-מהדלגציה {r.recallDays}-ימים</span>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  {r.cells.map((c) => (
                    <div key={c.cadence} className="rounded-lg bg-zinc-900/80 px-2.5 py-2">
                      <p className="text-[9px] font-bold text-zinc-400">{c.cadenceHe}</p>
                      <p className="font-mono text-sm font-bold text-emerald-400" dir="ltr">
                        {c.per1000SpAnnualUsd != null ? `${fmt(c.per1000SpAnnualUsd)}$` : "—"}
                        <span className="text-[9px] text-zinc-600"> /שנה·ל-1000SP</span>
                      </p>
                      <p className="mt-0.5 text-[9px] leading-3 text-zinc-600">{c.note}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500">
            <Scale className="h-3 w-3 shrink-0" aria-hidden />
            {d.sovereign
              ? `על-SP-אמת-נמדד: ${fmt(d.sovereign.sp.netWorkingSp, 1)} SP-נטו · ${fmt(d.sovereign.sp.delegatedOutSp, 1)} SP כבר-מועבר-חי — המטריצה מוחשית ולא-היפותטית`
              : "יחידות-המטריצה = לכל-1000-SP (SP-החשבון-לא-נמדד-במדידה-זו)"}
          </p>
        </section>
      )}

      {/* אמת-שתי-הקופות (R74) */}
      {d?.ledger && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-1 text-sm font-bold text-zinc-300">אמת-שתי-הקופות · כסף-אמת מול ספר-פנימי</h3>
          <p className="mb-3 text-[10px] leading-4 text-zinc-500">{d.ledger.doctrineHe ?? "דוקטרינת R74"}{d.ledger.residueNoteHe ? ` · ${d.ledger.residueNoteHe}` : ""}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-black text-emerald-400">
                <span className="g-breathe h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                כסף-אמת (שרשרת · מסומן-שוק-חוץ)
              </p>
              <p className="mb-2 font-mono text-2xl font-black text-emerald-300" dir="ltr">
                {d.ledger.realUsd != null ? `${fmt(d.ledger.realUsd)}$` : "—"}
              </p>
              <ul className="space-y-1">
                {d.ledger.realLines.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-400">
                    <span className="font-bold text-zinc-300" dir="ltr">{l.asset}</span>
                    <span className="font-mono" dir="ltr">{l.amount != null ? fmt(l.amount, 3) : "—"}</span>
                    <span className="font-mono text-emerald-400/80" dir="ltr">{l.usd != null ? `= ${fmt(l.usd)}$` : "unmarked"}</span>
                    <span className="font-mono text-[9px] text-zinc-600" dir="ltr">{l.source}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 rounded-lg bg-amber-500/[0.06] px-2 py-1.5 text-[9px] leading-4 text-amber-300/90">
                השורות-כאן = הספר-הישן (חופשי-בלבד). המלאי-המתוקן-והמלא — למעלה בכרטיס-אמת-החשבון-הריבוני (חופשי+תחום).
              </p>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3">
              <p className="mb-2 text-[11px] font-black text-red-400">ספר-פנימי (SIM · אין-תביעת-ערך-חוץ)</p>
              <p className="font-mono text-2xl font-black text-zinc-400" dir="ltr">
                {d.ledger.simBookUsds != null ? fmt(d.ledger.simBookUsds) : "—"}
                <span className="text-xs text-zinc-600"> USDS</span>
              </p>
              <p className="mt-1 inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-black text-red-400">
                {d.ledger.simLabel} · אסור-המרה-לדולר
              </p>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-zinc-950 px-3 py-2 font-mono text-[10px] text-zinc-500">
            grid.json: armed={String(d.ledger.gridArmed)} · {d.ledger.gridAt ?? "לא-נמדד"} — מנוע-הגריד חי-בספר-SIM ואינו-תביעת-כסף-אמת
          </p>
        </section>
      )}
    </div>
  );
}
