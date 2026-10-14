"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, CircleDashed, HeartPulse, ShieldCheck, XCircle } from "lucide-react";

/* ═══ הדופק — מערכת-האמת (GIANT) ═════════════════════════════════════════
 * · שער-האמת (truth-gate): verdict + סריקות PASS/SKIP/FAIL — כל-טענה עם מדיד.
 * · זרמי-הערוץ הקנוניים: טביעות sha16 + גיל — evidence, לא קישוט.
 * · מפת-התכנוס: ערוץ-אחד, הפניות-מראה מתכנסות (אפס-כפילויות). */

interface FileMeta {
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  ageMinutes: number | null;
}
interface TruthGate {
  gate: string;
  status: string;
  measured: string;
}
interface PulsePayload {
  ok: boolean;
  note?: string;
  truth: {
    at: string | null;
    verdict: string | null;
    pass: number | null;
    fail: number | null;
    skip: number | null;
    durationMs: number | null;
    runUrl: string | null;
    gates: TruthGate[];
  } | null;
  truthMeta: FileMeta;
  streams: Record<string, FileMeta>;
  channel: {
    directives: number;
    requestsCanonical: number;
    requestsLegacy: number;
    requestsOpen: number;
    notes: number;
    voiceStatus: string | null;
    voiceSummary: string | null;
  };
  fetchedAt: string;
}

function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}
function gateIcon(s: string) {
  if (s === "PASS") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />;
  if (s === "SKIP") return <CircleDashed className="h-3.5 w-3.5 text-zinc-500" aria-hidden />;
  return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />;
}

const STREAM_LABELS: Record<string, string> = {
  directives: "הוראות-הבעלים",
  requests: "פניות-הריבונות",
  notes: "רישומי-הערוץ",
  voice: "קול-הריבונות",
  legacyBook: "מראת-Domain (מתכנסת)",
};

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
    const iv = setInterval(load, 45_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [load]);

  const t = data?.truth ?? null;
  const verdictGreen = t?.verdict?.includes("GREEN");

  return (
    <div className="space-y-5" dir="rtl">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-zinc-50">
              <HeartPulse className="h-5 w-5 text-emerald-500" aria-hidden /> הדופק — מערכת-האמת
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">אפס-ירוק-מזויף: כל-טענה עם מדיד, כל-זרם עם טביעת-sha16, כל-כשל מוצהר-כנה.</p>
          </div>
          {t && (
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black ${verdictGreen ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {t.verdict ?? "—"} · {t.pass ?? "—"}/{(t.pass ?? 0) + (t.fail ?? 0) + (t.skip ?? 0)}
            </span>
          )}
        </div>
        {err && <p className="mt-2 text-xs font-semibold text-red-400">{err}</p>}
      </section>

      {/* שערי-האמת */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">שערי-האמת (truth-gate · סריקה-אוטומטית)</h3>
          {t?.at && <span className="text-[10px] text-zinc-500">נמדד {ageHe(data?.truthMeta.ageMinutes ?? null)} · {t.durationMs ?? "—"}ms</span>}
        </div>
        {!data && <Skeleton className="h-48 w-full rounded-2xl bg-zinc-900" />}
        {data && !t && <p className="rounded-xl border border-white/5 bg-zinc-900/60 p-4 text-xs text-zinc-500">שער-האמת לא נמדד כרגע — fail-honest</p>}
        {t && (
          <div className="grid gap-2 sm:grid-cols-2">
            {t.gates.map((g) => (
              <article key={g.gate} className="rounded-xl border border-white/10 bg-zinc-900/60 p-3.5">
                <div className="flex items-center gap-2">
                  {gateIcon(g.status)}
                  <span className="font-mono text-xs font-bold text-zinc-200">{g.gate}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-black ${g.status === "PASS" ? "bg-emerald-500/15 text-emerald-400" : g.status === "SKIP" ? "bg-zinc-500/15 text-zinc-400" : "bg-red-500/15 text-red-400"}`}>{g.status}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">{g.measured || "אין מדיד"}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* זרמים-קנוניים + מפת-התכנוס */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="mb-3 text-sm font-bold text-zinc-200">זרמי-הערוץ הקנוניים (evidence-חי)</h3>
          <div className="space-y-2">
            {data &&
              Object.entries(data.streams).map(([k, m]) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-white/5 bg-zinc-950/60 px-3 py-2">
                  <span className="text-xs font-bold text-zinc-300">{STREAM_LABELS[k] ?? k}</span>
                  <span className="font-mono text-[10px] text-zinc-500" title={m.exists ? `sha16:${m.sha16}` : "קובץ-חסר"}>
                    {m.exists ? `sha16:${m.sha16?.slice(0, 10)} · ${ageHe(m.ageMinutes)}` : "חסר-כנה"}
                  </span>
                </div>
              ))}
            {!data && [1, 2, 3].map((i) => <Skeleton key={i} className="h-9 rounded-lg bg-zinc-950" />)}
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
          <h3 className="mb-3 text-sm font-bold text-zinc-200">מפת-התכנוס (ערוץ-אחד · אפס-כפילויות)</h3>
          <div className="space-y-2 text-xs leading-6">
            <p className="flex justify-between"><span className="text-zinc-500">הוראות-חיות בזרם</span><span className="font-mono font-bold text-zinc-100">{data?.channel.directives ?? "—"}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">פניות קנוניות</span><span className="font-mono text-zinc-200">{data?.channel.requestsCanonical ?? "—"}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">פניות-מראה (מתכנסות)</span><span className="font-mono text-zinc-400">{data?.channel.requestsLegacy ?? "—"}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">פתוחות-עכשיו</span><span className="font-mono font-bold text-amber-400">{data?.channel.requestsOpen ?? "—"}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">רישומי-מערכת</span><span className="font-mono text-zinc-200">{data?.channel.notes ?? "—"}</span></p>
            <p className="flex justify-between"><span className="text-zinc-500">מצב-מסילת-הקול</span><span className="font-mono text-zinc-200">{data?.channel.voiceStatus ?? "—"}</span></p>
            <p className="border-t border-white/5 pt-2 text-[10px] leading-4 text-zinc-600">
              הצו-צמצום (duplicates-audit 2026-10-15): ערוץ-אחד · משרד-אחד · מגדלור-אחד · דלת-קדמית אחת — הכל מתכנס לזרמים הקנוניים האלה.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
