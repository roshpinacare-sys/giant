"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Inbox, ScrollText, Users } from "lucide-react";

/* ═══ המשרד-החי — המשרד-היחיד של הריבונות (GIANT · צו-הצמצום) ═══════════
 * מצב-חי מ-FleetHQ/office: סוכנים-במשמרת, משימות-שוטפות, תיבת-המפעיל
 * (קבלות-ההוראות של הבעלים — כאן הצי קורא אותן ומתחיל לעבוד), והצעות-משרד.
 * כשל = כנה; אפס-סינתזה. */

interface OfficeAgent {
  id: string;
  state: string;
  station: string;
  activity: string;
}
interface OfficePayload {
  ok: boolean;
  note?: string;
  statusHe: string | null;
  connected: boolean | null;
  backend: string | null;
  capturedAt: string | null;
  agents: OfficeAgent[];
  tasks: { id: string; title: string }[];
  inbox: { at: string; id: string; text: string }[];
  proposals: string[];
  inboxMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
  fetchedAt: string;
}

function timeHe(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}
function stateColor(s: string): string {
  if (s === "working" || s === "walking") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "idle") return "bg-amber-500/10 text-amber-400 border-amber-500/25";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

export function OfficeView() {
  const [data, setData] = useState<OfficePayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/office", { cache: "no-store" });
      const d = (await res.json()) as OfficePayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  return (
    <div className="space-y-5" dir="rtl">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-zinc-50">
              <Building2 className="h-5 w-5 text-amber-500" aria-hidden /> המשרד-החי · המשרד-היחיד
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {data?.statusHe ?? "מצב-המשרד לא נמדד כרגע"} {data?.backend ? `· backend: ${data.backend}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data?.connected !== null && data?.connected !== undefined && (
              <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black ${data.connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${data.connected ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
                {data.connected ? "מחובר-חי" : "מנותק"}
              </span>
            )}
            {data?.capturedAt && <span className="text-[10px] text-zinc-500">נתפס {timeHe(data.capturedAt)}</span>}
          </div>
        </div>
        {err && <p className="mt-2 text-xs font-semibold text-red-400">{err}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* סוכנים-במשמרת */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Users className="h-4 w-4 text-amber-500" aria-hidden /> סוכנים-במשמרת {data && <Badge variant="outline" className="border-white/10 text-zinc-400">{data.agents.length}</Badge>}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {!data && [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-16 rounded-xl bg-zinc-950" />)}
            {(data?.agents ?? []).map((a) => (
              <article key={a.id} className="rounded-xl border border-white/5 bg-zinc-950/60 p-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-black text-zinc-100">{a.id}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${stateColor(a.state)}`}>{a.state}</span>
                </div>
                <p className="mt-1 truncate text-[10px] text-zinc-500" title={a.activity || a.station}>{a.activity || a.station}</p>
              </article>
            ))}
            {data && data.agents.length === 0 && <p className="col-span-full text-xs text-zinc-500">אין סוכנים-מדידים כרגע</p>}
          </div>
          {/* משימות-שוטפות */}
          {data && data.tasks.length > 0 && (
            <div className="mt-4 border-t border-white/5 pt-3">
              <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-600">משימות-שוטפות</h4>
              <ul className="space-y-1.5">
                {data.tasks.map((t) => (
                  <li key={t.id} className="truncate text-[11px] leading-5 text-zinc-400" title={t.title}>
                    <span className="font-mono text-zinc-500">{t.id}</span> · {t.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* תיבת-המפעיל */}
        <section className="rounded-2xl border border-amber-600/25 bg-amber-500/[0.03] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <Inbox className="h-4 w-4 text-amber-500" aria-hidden /> תיבת-המפעיל — קבלות-הוראות
            </h3>
            {data?.inboxMeta.exists && (
              <span className="font-mono text-[10px] text-zinc-500">sha16:{data.inboxMeta.sha16?.slice(0, 8)} · {ageHe(data.inboxMeta.ageMinutes)}</span>
            )}
          </div>
          <p className="mb-3 text-[10px] leading-4 text-zinc-600">הזרם שאליו מגיעות ההוראות-מאוטמות של הבעלים; הצי קורא, מפרק לעבודה ומדווח חזרה.</p>
          <div className="max-h-72 space-y-2 overflow-y-auto pl-1">
            {!data && [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg bg-zinc-950" />)}
            {(data?.inbox ?? []).map((r, i) => (
              <div key={`${r.id || "no-id"}-${r.at}-${i}`} className="rounded-lg border border-white/5 bg-zinc-950/60 p-2.5">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="font-mono text-zinc-400">{r.id.slice(0, 12)}</span>
                  <span>· {timeHe(r.at)}</span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-300">{r.text}</p>
              </div>
            ))}
            {data && data.inbox.length === 0 && <p className="text-xs text-zinc-500">התיבה ריקה-כנה</p>}
          </div>
        </section>
      </div>

      {/* הצעות-משרד */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <ScrollText className="h-4 w-4 text-amber-500" aria-hidden /> הצעות-המשרד — אחרונות
        </h3>
        <div className="flex flex-wrap gap-2">
          {!data && [1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-56 rounded-full bg-zinc-950" />)}
          {(data?.proposals ?? []).map((p, i) => (
            <span key={`${p}-${i}`} className="rounded-full border border-white/5 bg-zinc-950/60 px-3 py-1.5 font-mono text-[10px] text-zinc-400">{p}</span>
          ))}
          {data && data.proposals.length === 0 && <p className="text-xs text-zinc-500">אין הצעות-פתוחות</p>}
        </div>
      </section>
    </div>
  );
}
