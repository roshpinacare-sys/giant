"use client";

import type { EngineFlow } from "@/lib/giant/flow-types";

/* ═══ T69 · דופק-הזרימה — רכיב-האמת-המשותף ═══════════════════════════════
 * הצ'יפים-שמוכיחים-חיים: ריצות-מוצלחות-אחרונות של-מנועי-הכסף על-המכונה
 * (התאום-הציבורי ב-Domain, R71). משמש את DexView · WalletView · SovereigntyView —
 * אפס-שכפול-עיצוב; הגיל-החי מחושב-בכל-רינדור מהזמן-האמיתי.
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

export function FlowHeartbeat({ flow, label }: { flow: EngineFlow | null; label?: string }) {
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
    </div>
  );
}
