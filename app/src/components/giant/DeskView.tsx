"use client";

import { useCallback, useEffect, useState } from "react";

/* ═══ שולחן-המסחר — saos-desk (mandate + beat) ═══════════════════════════
 * מצב-ביצוע · מגבלות-סיכון · סדרת-equity · משקלי-אסטרטגיות.
 * paper מוצהר לעולם לא מוצג כ-live; liveOwnerArmed כן-מוצג כשהוא אמיתי. */

interface StrategyWeight { name: string; weight: number; wins: number; losses: number }
interface DeskPayload {
  ok: boolean; note?: string; mode: string | null; liveOwnerArmed: boolean;
  limits: Record<string, number>; quorum: Record<string, number> | null;
  beat: number | null; chainHead: string | null; equity: number[];
  strategies: StrategyWeight[]; fetchedAt: string;
}

const LIMIT_HE: Record<string, string> = {
  maxPositionPct: "מקסימום-פוזיציה %",
  maxDailyLossPct: "מקסימום-הפסד יומי %",
  kellyCap: "תקרת-Kelly",
  drawdownHaltPct: "עצירת-משיכה %",
  volHaltPct: "עצירת-תנודתיות %",
  minConfidence: "ביטחון-מינימום",
  minWeightedScore: "ציון-משוקלל-מינימום",
  rounds: "סבבי-אישור",
};

function Sparkline({ data, height = 90 }: { data: number[]; height?: number }) {
  if (data.length < 2) return <p className="py-6 text-center text-xs text-zinc-600">אין סדרת-equity נמדדת</p>;
  const W = 600, H = height, pad = 8;
  const min = Math.min(...data, 0), max = Math.max(...data, 0.001);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zero = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" dir="ltr" role="img" aria-label="סדרת-equity">
      <line x1={pad} x2={W - pad} y1={zero} y2={zero} stroke="#3f3f46" strokeDasharray="3 3" strokeWidth="1" />
      <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={v >= 0 ? "#10b981" : "#ef4444"} />
      ))}
    </svg>
  );
}

export function DeskView() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/desk", { cache: "no-store" });
      const d = (await res.json()) as DeskPayload;
      setDesk(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  const wins = (desk?.strategies ?? []).reduce((s, w) => s + w.wins, 0);
  const losses = (desk?.strategies ?? []).reduce((s, w) => s + w.losses, 0);

  return (
    <div className="space-y-4" dir="rtl">
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <span className="text-sm font-black text-zinc-100">שולחן-המסחר הריבוני</span>
        {desk?.ok && (
          <>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${desk.mode === "paper" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {desk.mode === "paper" ? "PAPER-מוצהר" : desk.mode?.toUpperCase()}
            </span>
            {desk.liveOwnerArmed && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">LIVE-ARMED (דו-מפתח)</span>}
            <span className="font-mono text-[10px] text-zinc-500">beat {desk.beat ?? "—"} · head {desk.chainHead ?? "—"}</span>
          </>
        )}
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* equity */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-bold text-zinc-300">סדרת-equity (נמדדה, מה-lead)</h3>
          <Sparkline data={desk?.equity ?? []} />
          <p className="mt-1 text-[10px] text-zinc-600">
            {desk?.equity.length ?? 0} מדידות · ירוק=עסקה-חיובית · אדום=שלילית · אפס-הבטחות-תשואה
          </p>
        </section>

        {/* מגבלות-סיכון */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-bold text-zinc-300">מגבלות-סיכון (mandate)</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(desk?.limits ?? {}).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-zinc-950 px-3 py-2">
                <p className="text-[10px] text-zinc-500">{LIMIT_HE[k] ?? k}</p>
                <p className="font-mono text-sm font-bold text-zinc-100">{v}</p>
              </div>
            ))}
            {desk?.quorum && Object.entries(desk.quorum).map(([k, v]) => (
              <div key={`q-${k}`} className="rounded-lg bg-zinc-950 px-3 py-2">
                <p className="text-[10px] text-zinc-500">{LIMIT_HE[k] ?? `quorum.${k}`}</p>
                <p className="font-mono text-sm font-bold text-zinc-100">{v}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* אסטרטגיות */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-300">משקלי-האסטרטגיות (למידה-חיה)</h3>
          <span className="font-mono text-[11px] text-zinc-500">
            נצחונות <b className="text-emerald-400">{wins}</b> · הפסדים <b className="text-red-400">{losses}</b>
            {wins + losses > 0 && <> · hit-rate <b className="text-zinc-200">{Math.round((wins / (wins + losses)) * 100)}%</b></>}
          </span>
        </div>
        <div className="space-y-2">
          {(desk?.strategies ?? []).map((s) => {
            const total = s.wins + s.losses;
            const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
            return (
              <div key={s.name} className="rounded-xl border border-white/5 bg-zinc-950 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-200">{s.name}</span>
                  <span className="font-mono text-zinc-400">
                    weight <b className="text-amber-400">{s.weight.toFixed(3)}</b>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">{s.wins}W / {s.losses}L · {rate}%</p>
              </div>
            );
          })}
          {desk && desk.strategies.length === 0 && <p className="text-xs text-zinc-500">אין משקלים נמדדים</p>}
        </div>
      </section>
    </div>
  );
}
