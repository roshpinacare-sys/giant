"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ═══ רישום-ההחלטות — דפדפן-חיפוש על Pulse/DECISIONS המלא ══════════════ */

interface DecisionFull {
  id: string; date: string; content: string; context: string; acceptance: string;
}
interface DecisionsPayload {
  ok: boolean; note?: string; decisions: DecisionFull[]; total: number; fetchedAt: string;
}

export function LedgerView() {
  const [data, setData] = useState<DecisionsPayload | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/decisions", { cache: "no-store" });
      const d = (await res.json()) as DecisionsPayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    return () => clearTimeout(t0);
  }, [load]);

  const filtered = useMemo(() => {
    const rows = data?.decisions ?? [];
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      r.content.toLowerCase().includes(s) || r.context.toLowerCase().includes(s) || r.acceptance.toLowerCase().includes(s) || r.id.includes(s)
    );
  }, [data, q]);

  return (
    <div className="space-y-4" dir="rtl">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-black text-zinc-100">רישום-ההחלטות — {data?.total ?? "—"} רשומות</h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">כל-ההכרעות-הריבוניות, חדש-ראשון · Pulse/DECISIONS</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש בהחלטות…"
          aria-label="חיפוש בהחלטות"
          className="h-10 w-56 rounded-lg border border-white/15 bg-zinc-900 px-3 text-xs text-zinc-100 outline-none focus:border-amber-500/70"
        />
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {filtered.map((r) => {
          const isOpen = open === r.id;
          return (
            <article key={r.id} className="rounded-xl border border-white/10 bg-zinc-900/60">
              <button
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-right transition hover:bg-white/[0.02]"
                aria-expanded={isOpen}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-400">R{r.id}</span>
                    <span className="text-[10px] text-zinc-500">{r.date}</span>
                  </div>
                  <p className={`mt-1.5 text-xs leading-5 text-zinc-300 ${isOpen ? "" : "line-clamp-2"}`}>{r.content}</p>
                </div>
                <span className="shrink-0 text-zinc-600">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-white/5 px-4 py-3">
                  {r.context && (
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500">הקשר</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-zinc-400">{r.context}</p>
                    </div>
                  )}
                  {r.acceptance && (
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500">קבלה</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-zinc-400">{r.acceptance}</p>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {data && filtered.length === 0 && <p className="py-4 text-center text-xs text-zinc-500">לא נמצאו החלטות לחיפוש</p>}
      </div>
    </div>
  );
}
