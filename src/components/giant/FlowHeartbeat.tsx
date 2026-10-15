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
      {/* T70 · מסלול-הזרימה — התקדמות-הגובה-בין-מדידות-אמיתיות-שנרשמו-בפנקס (כנה: מוצג-רק-כשיש-מה-להראות) */}
      <TrajectoryLine trajectory={trajectory ?? null} />
    </div>
  );
}
