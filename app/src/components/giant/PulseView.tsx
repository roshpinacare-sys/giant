"use client";

import { useCallback, useEffect, useState } from "react";

/* ═══ דופק-הצי + רישום-ההחלטות ══════════════════════════════════════════
 * כל-הנתונים נמדדים-חי מהגיט. כשל = כנה. אפס-ירוק-מזויף. */

interface RepoHealth {
  name: string;
  pushedAt: string | null;
  private: boolean;
  ageHours: number | null;
  state: "live" | "active" | "quiet" | "unknown";
}
interface DecisionRow {
  id: string;
  date: string;
  title: string;
}
interface PulsePayload {
  ok: boolean;
  note?: string;
  repos: RepoHealth[];
  total: number;
  decisions: DecisionRow[];
  fetchedAt: string;
}

function dotOf(s: RepoHealth["state"]): string {
  return s === "live" ? "bg-emerald-500" : s === "active" ? "bg-amber-500" : s === "quiet" ? "bg-stone-600" : "bg-stone-700";
}
function labelOf(s: RepoHealth["state"]): string {
  return s === "live" ? "חי" : s === "active" ? "פעיל" : s === "quiet" ? "שקט" : "לא-ידוע";
}
function ageHe(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} דק'`;
  if (h < 24) return `${Math.round(h)} שע'`;
  return `${Math.round(h / 24)} ימ'`;
}

export function PulseView() {
  const [data, setData] = useState<PulsePayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/pulse", { cache: "no-store" });
      const d = (await res.json()) as PulsePayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  const live = (data?.repos ?? []).filter((r) => r.state === "live").length;
  const active = (data?.repos ?? []).filter((r) => r.state === "active").length;
  const quiet = (data?.repos ?? []).filter((r) => r.state === "quiet").length;

  return (
    <div className="space-y-5" dir="rtl">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { v: data?.total ?? "—", l: "ספרי-האחזקה", c: "text-zinc-100" },
          { v: live, l: "חיים (6 שע')", c: "text-emerald-400" },
          { v: active, l: "פעילים (48 שע')", c: "text-amber-400" },
          { v: quiet, l: "שקטים", c: "text-zinc-500" },
        ].map((s) => (
          <article key={s.l} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-center">
            <p className={`text-2xl font-black ${s.c}`}>{s.v}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{s.l}</p>
          </article>
        ))}
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-300">מפת-האחזקה — כל-הספרים</h3>
        <div className="max-h-96 overflow-y-auto pr-1">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500 backdrop-blur">
              <tr>
                <th className="px-2 py-2 font-semibold">ספר</th>
                <th className="px-2 py-2 font-semibold">מצב</th>
                <th className="px-2 py-2 font-semibold">דחיפה</th>
                <th className="px-2 py-2 font-semibold">שכבה</th>
              </tr>
            </thead>
            <tbody>
              {(data?.repos ?? []).map((r) => (
                <tr key={r.name} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                  <td className="px-2 py-2 font-mono font-semibold text-zinc-200">{r.name}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5 text-zinc-400">
                      <span className={`h-2 w-2 rounded-full ${dotOf(r.state)}`} aria-hidden />
                      {labelOf(r.state)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-zinc-500">{ageHe(r.ageHours)}</td>
                  <td className="px-2 py-2">
                    {r.private ? <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-bold text-zinc-400">עורף</span> : <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-500">פומבי</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.repos.length === 0 && <p className="py-4 text-center text-xs text-zinc-500">הדופק לא נמדד כרגע</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-300">רישום-ההחלטות — אחרונות (Pulse/DECISIONS)</h3>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {(data?.decisions ?? []).map((d) => (
            <article key={d.id} className="rounded-xl border border-white/5 bg-zinc-900 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-400">R{d.id}</span>
                <span className="text-[10px] text-zinc-500">{d.date}</span>
              </div>
              <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-zinc-300">{d.title}</p>
            </article>
          ))}
          {data && data.decisions.length === 0 && <p className="text-xs text-zinc-500">הרישום לא נמדד כרגע</p>}
        </div>
      </section>
    </div>
  );
}
