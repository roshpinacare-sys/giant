"use client";

import type { EngineFlow, FlowTrajectory } from "@/lib/giant/flow-types";

/* ═══ T69/T70 · דופק-הזרימה — רכיב-האמת-המשותף ═══════════════════════════════
 * הצ'יפים-שמוכיחים-חיים: ריצות-מוצלחות-אחרונות של-מנועי-הכסף על-המכונה
 * (התאום-הציבורי ב-Domain, R71) + מסלול-הזרימה: התקדמות-הגובה-על-השרשרת
 * בין-מדידות-אמיתיות-שהמערכת-רשמה-בעצמה (פנקס-כנה, אפס-זריעה).
 * משמש את DexView · WalletView · SovereigntyView — אפס-שכפול-עיצוב;
 * הגיל-החי מחושב-בכל-רינדור מהזמן-האמיתי.
 * כישלון-מדידה = הרכיב לא מציג כלום (fail-honest; אף-צ'יפ-מזויף לא ייוולד). */

function ageHe(iso: string | null): { text: string; fresh: boolean } {
  if (!iso) return { text: "אין-הצלחה-מדודה", fresh: false };
  const ageMin = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(ageMin)) return { text: "אין-הצלחה-מדודה", fresh: false };
  const fresh = ageMin <= 150;
  return {
    text: ageMin < 60 ? `לפני ${ageMin} דק'` : `לפני ${(ageMin / 60).toFixed(1)} ש'`,
    fresh,
  };
}

function clockHe(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function TrajectoryLine({ trajectory }: { trajectory: FlowTrajectory | null }) {
  if (!trajectory || trajectory.entries < 2 || trajectory.deltaHeight === null) return null; // כנה: פחות-משתי-מדידות — אין-הצהרה
  const d = trajectory.deltaHeight;
  if (d === 0) {
    return (
      <p className="mt-1.5 text-[9px] leading-4 text-amber-400/80" dir="rtl">
        מסלול-הזרימה: הגובה ({trajectory.last?.height.toLocaleString("en-US")}) לא-התקדם בין-המדידות-השמורות
        ({trajectory.entries} מדידות · מ-{clockHe(trajectory.first?.measuredAt ?? null)}) — כנה.
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-[9px] leading-4 text-emerald-400/90" dir="rtl">
      מסלול-הזרימה:{" "}
      <b className="font-mono font-black" dir="ltr">
        +{d.toLocaleString("en-US")}
      </b>{" "}
      בלוקים-על-השרשרת מאז-המדידה-הראשונה-שנשמרה ({trajectory.entries} מדידות-חיות של-המערכת-עצמה ·{" "}
      {clockHe(trajectory.first?.measuredAt ?? null)} → {clockHe(trajectory.last?.measuredAt ?? null)}) — הפרש-אמיתי
      בין-שתי-מדידות-אמיתיות, אפס-זריעה.
    </p>
  );
}

/* ═══ T71 · ספארקליין-המסלול — הזיכרון-העצמי-הופך-נראה ═══════════════════════
 * גובה-השרשרת על-ציר-המדידות, ישר-מהפנק-עצמו (עד-24 מדידות אחרונות).
 * כנה: נרשם-רק-כשיש-לפחות-שתי-מדידות-אמיתיות-תקינות; טווח-אפס = קו-שטוח-כנה. */
function TrajectorySparkline({ trajectory }: { trajectory: FlowTrajectory | null }) {
  const pts = (trajectory?.recent ?? []).filter((e) => Number.isFinite(e.height));
  if (pts.length < 2) return null; // כנה: אין-עוד-קו-להציג
  const W = 600, H = 34, pad = 4;
  const heights = pts.map((e) => e.height);
  const min = Math.min(...heights), max = Math.max(...heights);
  const span = max - min;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  const y = (v: number) => (span === 0 ? H / 2 : H - pad - ((v - min) / span) * (H - 2 * pad));
  const line = pts.map((e, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(e.height).toFixed(1)}`).join(" ");
  const lastPt = pts[pts.length - 1], firstPt = pts[0];
  return (
    <div className="mt-2" aria-hidden={false}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ direction: "ltr" }}
        role="img"
        aria-label={`מסלול-הזרימה: גובה-השרשרת על-פני ${pts.length} מדידות-חיות, מ-${firstPt.height} עד ${lastPt.height}`}
      >
        <path d={line} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((e, i) => (
          <circle
            key={`${e.measuredAt}-${i}`}
            cx={x(i)}
            cy={y(e.height)}
            r={i === pts.length - 1 ? 3.4 : 2.2}
            fill={i === pts.length - 1 ? "#a7f3d0" : "#10b981"}
          />
        ))}
      </svg>
      <p className="mt-1 flex items-center justify-between font-mono text-[9px] text-zinc-500" dir="ltr">
        <span>{firstPt.height.toLocaleString("en-US")}</span>
        <span className="text-zinc-600">
          {pts.length} measurements · self-ledger
        </span>
        <span className="font-bold text-emerald-400">{lastPt.height.toLocaleString("en-US")}</span>
      </p>
    </div>
  );
}

export function FlowHeartbeat({
  flow,
  trajectory,
  label,
}: {
  flow: EngineFlow | null;
  trajectory?: FlowTrajectory | null;
  label?: string;
}) {
  if (!flow || flow.beats.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-[10px] font-black text-zinc-300">
        {label ?? "דופק-הזרימה — ריצות-אחרונות על-המכונה"} <span className="font-mono text-zinc-500">({flow.repo})</span>:
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {flow.beats.map((b) => {
          const a = ageHe(b.lastSuccessAt);
          return (
            <span
              key={b.workflow}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] ${
                a.fresh
                  ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/[0.07] text-amber-400"
              }`}
              dir="ltr"
              title={`ריצה-אחרונה: ${b.event} · סיום: ${b.conclusion} · הצלחה-אחרונה: ${b.lastSuccessAt ?? "—"}`}
            >
              {b.workflow}
              <b className="font-black">{b.conclusion}</b>
              <span className="text-zinc-400">{a.text}</span>
            </span>
          );
        })}
      </div>
      {/* T70/T71 · מסלול-הזרימה — הטקסט-הכנה + הספארקליין-החי (מוצג-רק-כשיש-מה-להראות) */}
      <TrajectoryLine trajectory={trajectory ?? null} />
      <TrajectorySparkline trajectory={trajectory ?? null} />
    </div>
  );
}
