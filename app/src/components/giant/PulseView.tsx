"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Recipe } from "./Recipe";
import { AnimatedNumber } from "./AnimatedNumber";
import { CheckCircle2, CircleDashed, HeartPulse, ShieldCheck, XCircle, Ship } from "lucide-react";

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

interface FleetRow {
  name: string;
  pushedAt: string | null;
  ageMinutes: number | null;
  archived: boolean;
  isPrivate: boolean;
  language: string | null;
}
interface FleetPayload {
  ok: boolean;
  note?: string;
  total: number | null;
  repos: FleetRow[];
  pushedLast24h: number | null;
  fetchedAt: string;
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
  const [fleet, setFleet] = useState<FleetPayload | null>(null);
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

  const loadFleet = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/fleet", { cache: "no-store" });
      setFleet((await res.json()) as FleetPayload);
    } catch {
      /* הצי יציג-כשל-כנה בתוכו */
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const tf = setTimeout(loadFleet, 0);
    const iv = setInterval(load, 45_000);
    const ivf = setInterval(loadFleet, 180_000);
    return () => {
      clearTimeout(t0);
      clearTimeout(tf);
      clearInterval(iv);
      clearInterval(ivf);
    };
  }, [load, loadFleet]);

  const t = data?.truth ?? null;
  const verdictGreen = t?.verdict?.includes("GREEN");

  return (
    <div className="space-y-5" dir="rtl">
      <Recipe
        sources={[
          "Domain/truth/latest.json (שער-האמת · סריקות PASS/SKIP/FAIL)",
          "Pulse/state/sovereign-channel/{directives,requests,notes}.jsonl + voice.json (טביעות-sha16)",
          "GitHub API orgs/roshpinacare-sys/repos (הצי-החי · PAT שרת-בלבד)",
        ]}
        measuredAt={data?.fetchedAt ?? null}
        failNote="חוזה-כשל: אפס-ירוק-מזויף — כל-זרם עם טביעת-sha16, כל-חוסר מוצהר 'חסר-כנה'."
      />
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
      {/* הצי-החי — האימפריה על-הגיט */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Ship className="h-4 w-4 text-amber-500" aria-hidden /> הצי-החי · האימפריה על-הגיט
          </h3>
          {fleet?.ok ? (
            <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-400">
              <span className="font-mono"><AnimatedNumber value={fleet.total} format={(n) => String(Math.round(n))} className="text-zinc-100" /> ריפו</span>
              <span className="font-mono text-emerald-400"><AnimatedNumber value={fleet.pushedLast24h} format={(n) => String(Math.round(n))} /> נדחפו ב-24ש׳</span>
            </div>
          ) : (
            fleet && <span className="text-[10px] font-semibold text-red-400">{fleet.note ?? "לא נמדד"}</span>
          )}
        </div>
        {!fleet && <Skeleton className="h-40 w-full rounded-xl bg-zinc-900" />}
        {fleet && (
          <div className="grid max-h-96 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {fleet.repos.map((r) => {
              const fresh = (r.ageMinutes ?? Infinity) <= 180;
              const warm = (r.ageMinutes ?? Infinity) <= 1440;
              return (
                <div
                  key={r.name}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${r.archived ? "border-white/5 bg-zinc-950/40 opacity-50" : fresh ? "border-emerald-600/25 bg-emerald-500/[0.04]" : warm ? "border-white/5 bg-zinc-950/60" : "border-white/5 bg-zinc-950/60"}`}
                  title={r.pushedAt ? `נדחף ${new Date(r.pushedAt).toLocaleString("he-IL")}` : "—"}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.archived ? "bg-zinc-700" : fresh ? "animate-pulse bg-emerald-500" : warm ? "bg-amber-500" : "bg-zinc-600"}`} aria-hidden />
                    <span className="truncate font-mono text-[11px] font-bold text-zinc-200">{r.name}</span>
                    {r.isPrivate && <span className="shrink-0 rounded bg-zinc-800 px-1 text-[8px] font-bold text-zinc-500">private</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-500">{ageHe(r.ageMinutes)}</span>
                </div>
              );
            })}
          </div>
        )}
        {fleet?.ok && (
          <p className="mt-2 text-[10px] leading-4 text-zinc-600">מדוד-חי מ-GitHub-org · ירוק-מהבהב = נדחף ב-3-שעות-אחרונות · עמום = ארכיון · כל-השאר עם גיל-מדיד אמיתי.</p>
        )}
      </section>
    </div>
  );
}
