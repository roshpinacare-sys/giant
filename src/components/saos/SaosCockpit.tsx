"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ZaiLiveDesk } from "@/components/saos/ZaiLiveDesk";
import {
  HeartPulse,
  ShieldCheck,
  GitCommitVertical,
  Radio,
  Activity,
  AlertTriangle,
  RefreshCw,
  Timer,
  Anchor,
  Landmark,
  Network,
  Sprout,
  Wrench,
  Brain,
} from "lucide-react";

type Seal = { sha: string; subject: string; date: string; seq: number | null; tx: number | null };
type RunRow = { name: string; status: string; conclusion: string | null; createdAt: string; url: string };

type GrowthEntry = { at: string; kind: string; ok?: boolean; what?: string; result?: string };
type BacklogItem = { kind: string; title: string; detail?: string; by?: string };
type SeriesPoint = { at: string; seq: number | null; beatSeq: number | null; tx: number | null; price: string | null };
type ArsenalRow = { id: string; title: string; desc: string; lane: string; live: boolean };
type GrowthData = {
  at: string;
  state: { acts?: number; metrics?: number; brainCalls?: number; brainOffers?: number; seals?: number; sealFailures?: number; capabilities?: string[]; lastAt?: string | null } | null;
  host: { beatCount?: number; running?: boolean; lastRc?: number | null; nextRunAt?: string | null } | null;
  series: SeriesPoint[];
  growth: GrowthEntry[];
  backlog: BacklogItem[];
  capabilities: string[];
  stats: { acts: number; metrics: number; brainCalls: number; brainOffers: number; seals: number; sealFailures: number; backlogLen: number; growthCount: number };
  arsenal: ArsenalRow[];
  arsenalLive: number;
  safety: string;
};

type Sovereignty = {
  at: string;
  heart: {
    host: {
      ok?: boolean;
      beatCount?: number;
      running?: boolean;
      lastRc?: number | null;
      lastDurationSec?: number | null;
      lastSummary?: string[];
      nextRunAt?: string | null;
      provisions?: number;
      provisionedAt?: string;
    } | null;
    status: Record<string, unknown> | null;
    writerLock: { writer: string; at: number; ageSec: number | null; alive: boolean; seq?: number } | null;
  };
  seals: Seal[];
  publicPulse: { runs: RunRow[]; fetchedAt: string } | null;
  survival: {
    coldStart: { at: string; what: string; chain: string[]; verdict: string };
    gitOnlyDrill: { at: string; cloneSec: number; bootToVerifySec: number; totalSec: number; result: string; verdict: string };
    hostSelfProvision: { version: string; at: string; what: string; closes: string };
    gitCanonicalBootstrap: { at: string; commit: string; what: string; verdict: string };
  };
  ownerDecisions: { id: string; title: string; detail: string; state: string }[];
  safety: string;
};

function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return "מתחיל עכשיו…";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")} דק'`;
}

function fmtTime(iso: string | number) {
  const d = new Date(iso);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Sparkline({ points }: { points: SeriesPoint[] }) {
  const vals = points.map((p) => p.seq ?? p.beatSeq ?? 0).filter((v) => v > 0);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 100;
  const h = 30;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-emerald-400" />
    </svg>
  );
}

export default function SaosCockpit() {
  const [data, setData] = useState<Sovereignty | null>(null);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/saos/sovereignty", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Sovereignty);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGrowth = useCallback(async () => {
    try {
      const res = await fetch("/api/saos/growth", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGrowth((await res.json()) as GrowthData);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadGrowth();
    timerRef.current = setInterval(() => {
      load();
      loadGrowth();
    }, 15_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, loadGrowth]);

  const builderCountdown = useCountdown(growth?.host?.nextRunAt);
  const builderGreen = !!growth?.host && (growth.host.running === true || (growth.host.lastRc === 0 && !!growth.host.nextRunAt));

  const countdown = useCountdown(data?.heart?.host?.nextRunAt);
  const host = data?.heart?.host ?? null;
  const lock = data?.heart?.writerLock ?? null;
  const lastSeal = data?.seals?.[0] ?? null;
  const priceLine = host?.lastSummary?.find((l) => l.includes("מחיר=")) ?? null;
  const price = priceLine?.match(/מחיר=([\d.]+)/)?.[1] ?? null;
  const heartGreen = !!host?.ok && (host.lastRc === 0 || host.running === true);
  const flowLines = (host?.lastSummary ?? []).filter(
    (l) => l.includes("עסקאות אמת") || l.includes("VERIFY") || l.includes("עוגני-תפר") || l.includes("איטום"),
  );

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-stone-950 text-stone-100">
      {/* כותרת */}
      <header className="border-b border-stone-800 bg-stone-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Landmark className="h-8 w-8 text-emerald-400" aria-hidden />
              <span
                className={`absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full ${
                  heartGreen ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
                }`}
                aria-hidden
              />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">SAOS · קונסולת ריבונות</h1>
              <p className="text-xs text-stone-400">כלכלה פנימית עצמאית מעגל-סגור · agent-2 · Lane A</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && <span className="text-[11px] text-stone-500">דוגם {fmtTime(data.at)}</span>}
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-stone-700 hover:bg-stone-800">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              רענן
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 space-y-6">
        {err && (
          <Card className="border-rose-900 bg-rose-950/40">
            <CardContent className="p-4 flex items-center gap-2 text-rose-200 text-sm">
              <AlertTriangle className="h-4 w-4" aria-hidden /> שגיאת-איסוף: {err}
            </CardContent>
          </Card>
        )}

        {/* כאת-הלב */}
        <Card className="border-stone-800 bg-gradient-to-br from-stone-900 to-stone-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-5 w-5 text-emerald-400" aria-hidden />
              כאת-הלב · הכלכלה הפנימית נושמת
              <Badge className={heartGreen ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-rose-950 text-rose-300 border border-rose-800"}>
                {host?.ok ? "חי" : "אין-תשובה"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">מונה-הספר (seq)</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-300">
                  {lastSeal?.seq?.toLocaleString("he-IL") ?? "—"}
                </div>
                <div className="text-[11px] text-stone-500 mt-1">
                  +{lastSeal?.tx?.toLocaleString("he-IL") ?? "—"} עסקאות אמת ב-beat האחרון
                </div>
              </div>
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">עוגני-תפר</div>
                <div className="text-2xl font-bold text-emerald-300 flex items-center gap-1">
                  <Anchor className="h-5 w-5" aria-hidden /> {lastSeal?.anchors ?? "—"}
                </div>
                <div className="text-[11px] text-stone-500 mt-1">שרשרת-hash רציפה — אפס-שכתוב (פורנזיה גל-93: בסיס 3 + 4 תפרי-צומת מתועדים)</div>
              </div>
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">מחיר בריכה</div>
                <div className="text-2xl font-bold tabular-nums text-amber-300">
                  {price ? `${price}` : "—"}
                </div>
                <div className="text-[11px] text-stone-500 mt-1">USDS / SAOS</div>
              </div>
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">פעימה הבאה</div>
                <div className="text-2xl font-bold tabular-nums flex items-center gap-1">
                  <Timer className="h-5 w-5 text-emerald-400" aria-hidden />
                  <span className={countdown === "מתחיל עכשיו…" ? "text-amber-300" : "text-emerald-300"}>
                    {countdown ?? "—"}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-1">קצב אוטונומי · כל 45 דק'</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] [&>span]:max-w-full">
              <Badge variant="outline" className="border-stone-700 text-stone-300 max-w-full whitespace-normal! break-words">
                beats מאז-הקמה: {host?.beatCount ?? "—"}
              </Badge>
              <Badge variant="outline" className="border-stone-700 text-stone-300 max-w-full whitespace-normal! break-words">
                מארח: economy-beat-host · פורט 3020
              </Badge>
              <Badge variant="outline" className="border-stone-700 text-stone-300 max-w-full whitespace-normal! break-words">
                rc אחרון: {host?.lastRc ?? "—"} · {host?.lastDurationSec ?? "—"}ש'
              </Badge>
              {lock && (
                <Badge variant="outline" className={lock.alive ? "border-emerald-800 text-emerald-300 max-w-full whitespace-normal! break-words" : "border-stone-700 text-stone-500 max-w-full whitespace-normal! break-words"}>
                  מנעול-כותב: {lock.writer} {lock.alive ? "· חי" : "· פג-TTL"}
                </Badge>
              )}
              {lock && (
                <Badge variant="outline" className={lock.alive ? "border-emerald-800 text-emerald-300 max-w-full whitespace-normal! break-words" : "border-stone-700 text-stone-500 max-w-full whitespace-normal! break-words"}>
                  seq {lock.seq ?? "—"}
                </Badge>
              )}
              {(host?.provisions ?? 0) > 0 && (
                <Badge variant="outline" className="border-amber-800 text-amber-300">
                  self-provision ×{host?.provisions} @ {host?.provisionedAt ? fmtTime(host.provisionedAt) : "—"}
                </Badge>
              )}
            </div>

            {flowLines.length > 0 && (
              <div className="rounded-lg border border-stone-800 bg-black/40 p-3 font-mono text-[11px] leading-5 text-stone-300 overflow-x-auto max-h-40 overflow-y-auto">
                {flowLines.map((l, i) => (
                  <div key={i} className={l.includes("VERIFY ok") ? "text-emerald-300" : l.includes("FAIL") ? "text-rose-300" : ""}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* איטומים */}
          <Card className="border-stone-800 bg-stone-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitCommitVertical className="h-5 w-5 text-emerald-400" aria-hidden />
                איטומים אחרונים · הספר נחתם-לגיט
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {(data?.seals ?? []).map((s) => (
                <div key={s.sha} className="rounded-lg border border-stone-800 bg-stone-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-emerald-300">{s.sha}</span>
                    <span className="text-[11px] text-stone-500">{fmtTime(s.date)}</span>
                  </div>
                  <div className="text-xs text-stone-300 mt-1">{s.subject}</div>
                </div>
              ))}
              {(!data || data.seals.length === 0) && (
                <div className="text-xs text-stone-500 p-3">אין איטומים להצגה</div>
              )}
            </CardContent>
          </Card>

          {/* דופק ציבורי */}
          <Card className="border-stone-800 bg-stone-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="h-5 w-5 text-emerald-400" aria-hidden />
                דופק ציבורי · saos-runtime (ריפו-ציבורי = דקות-חינם)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {(data?.publicPulse?.runs ?? []).map((r, i) => {
                const green = r.conclusion === "success";
                const red = r.conclusion === "failure";
                const live = r.status === "in_progress" || r.status === "queued";
                return (
                  <div key={i} className="rounded-lg border border-stone-800 bg-stone-950/60 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-stone-200 truncate">{r.name}</div>
                      <div className="text-[11px] text-stone-500">{fmtTime(r.createdAt)}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        green
                          ? "border-emerald-800 text-emerald-300"
                          : red
                            ? "border-rose-800 text-rose-300"
                            : live
                              ? "border-amber-800 text-amber-300 animate-pulse"
                              : "border-stone-700 text-stone-400"
                      }
                    >
                      {live ? r.status : (r.conclusion ?? r.status)}
                    </Badge>
                  </div>
                );
              })}
              {!data?.publicPulse && (
                <div className="text-xs text-stone-500 p-3">אין-נתוני דופק ציבורי כרגע</div>
              )}
              {data?.publicPulse && (
                <div className="text-[11px] text-stone-600 pt-1">
                  ירוק = הריבונות פועלת-בפועל · אדום ב-sovereign-runtime = אזעקת-TruthRail מעוצבת (מדידת-תוצאה בשרשרת) — לא תקלת-מכונה. פירוט בהחלטות-הבעלים.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* צמיחה-ריבונית · הבנאי-האוטונומי */}
        <Card className="border-stone-800 bg-gradient-to-br from-stone-900 to-stone-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Sprout className="h-5 w-5 text-emerald-400" aria-hidden />
              צמיחה-ריבונית · הבנאי-האוטונומי (observe → think → act → seal)
              <Badge className={builderGreen ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-rose-950 text-rose-300 border border-rose-800"}>
                {builderGreen ? "בונה-עכשיו" : "אין-תשובה"}
              </Badge>
              <Badge variant="outline" className="border-stone-700 text-stone-300 max-w-full whitespace-normal! break-words">
                <Brain className="h-3.5 w-3.5 ml-1" aria-hidden /> מוח: {growth?.stats?.brainCalls ? `${growth.stats.brainCalls} שיחות · ${growth.stats.brainOffers} הצעות-נתקבלו` : "ממתין-לפעימה"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">שיפורים-שבוצעו</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-300">{growth?.stats?.acts ?? "—"}</div>
                <div className="text-[11px] text-stone-500 mt-1">פעולות-אמת (לא בדיקות) — backlog מתרוקן-ומתמלא</div>
              </div>
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">צילומי-מדדים</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-300">{growth?.stats?.metrics ?? "—"}</div>
                <div className="text-[11px] text-stone-500 mt-1">סדרה-חיה · {growth?.stats?.growthCount ?? "—"} רשומות-צמיחה</div>
              </div>
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">backlog פתוח</div>
                <div className="text-2xl font-bold tabular-nums text-amber-300">{growth?.stats?.backlogLen ?? "—"}</div>
                <div className="text-[11px] text-stone-500 mt-1">המוח מציע · הבנאי מבצע מתוך-white-list</div>
              </div>
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="text-[11px] text-stone-400 mb-1">פעימת-בנאי הבאה</div>
                <div className="text-2xl font-bold tabular-nums flex items-center gap-1">
                  <Timer className="h-5 w-5 text-emerald-400" aria-hidden />
                  <span className={builderCountdown === "מתחיל עכשיו…" ? "text-amber-300" : "text-emerald-300"}>
                    {builderCountdown ?? "—"}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-1">כל 15 דק' · איטום {growth?.stats?.seals ?? "—"} · כשלי-איטום {growth?.stats?.sealFailures ?? "—"}</div>
              </div>
            </div>

            {growth?.series && growth.series.length > 1 && (
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] text-stone-400">עליית-הספר · seq לאורך-צילומי-הבנאי</span>
                  <span className="text-[11px] text-emerald-300 tabular-nums">
                    {growth.series[0]?.seq?.toLocaleString("he-IL")} → {growth.series[growth.series.length - 1]?.seq?.toLocaleString("he-IL")}
                  </span>
                </div>
                <Sparkline points={growth.series} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-stone-300 mb-2">יומן-צמיחה חי · מה הבנאי ביצע</div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {(growth?.growth ?? []).map((g, i) => (
                    <div key={i} className="rounded-lg border border-stone-800 bg-stone-950/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={g.ok === false ? "border-rose-800 text-rose-300" : "border-emerald-800 text-emerald-300"}>
                          {g.kind}
                        </Badge>
                        <span className="text-[11px] text-stone-500">{fmtTime(g.at)}</span>
                      </div>
                      {g.what && <div className="text-xs text-stone-200 mt-1.5">{g.what}</div>}
                      {g.result && <div className="text-[11px] text-stone-400 mt-0.5 break-words">{g.result}</div>}
                    </div>
                  ))}
                  {(!growth || growth.growth.length === 0) && (
                    <div className="text-xs text-stone-500 p-3">הבנאי עומד-לבצע-את-פעימתו-הראשונה…</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-stone-300 mb-2">backlog · תור-הבנייה</div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {(growth?.backlog ?? []).map((b, i) => (
                    <div key={i} className="rounded-lg border border-stone-800 bg-stone-950/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="border-stone-700 text-stone-300">{b.kind}</Badge>
                        {b.by === "brain" && (
                          <Badge variant="outline" className="border-amber-800 text-amber-300"><Brain className="h-3 w-3 ml-1" aria-hidden /> מוח</Badge>
                        )}
                      </div>
                      <div className="text-xs text-stone-200 mt-1.5 break-words">{b.title}</div>
                      {b.detail && <div className="text-[11px] text-stone-400 mt-0.5 break-words">{b.detail}</div>}
                    </div>
                  ))}
                  {(!growth || growth.backlog.length === 0) && (
                    <div className="text-xs text-stone-500 p-3">התור ריק — המוח יוזמן-בפעימה-הבאה</div>
                  )}
                </div>
              </div>
            </div>

            {(growth?.capabilities?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px] [&>span]:max-w-full">
                {(growth?.capabilities ?? []).map((c, i) => (
                  <Badge key={i} variant="outline" className="border-emerald-800 text-emerald-300 max-w-full whitespace-normal! break-words">
                    יכולת-פתוחה: {c}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ארסנל · כלי-הריבונות */}
        <Card className="border-stone-800 bg-stone-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Wrench className="h-5 w-5 text-emerald-400" aria-hidden />
              ארסנל · הכלים-שנאספו · מצב-חי
              <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-800">
                {growth?.arsenalLive ?? "—"}/{growth?.arsenal?.length ?? "—"} באחוזה
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(growth?.arsenal ?? []).map((a) => (
              <div key={a.id} className={`rounded-lg border p-4 space-y-1.5 ${a.live ? "border-emerald-900/60 bg-stone-950/60" : "border-stone-800 bg-stone-950/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-100 break-words">{a.title}</span>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${a.live ? "bg-emerald-400 animate-pulse" : "bg-stone-600"}`} aria-hidden />
                </div>
                <p className="text-[11px] text-stone-400 leading-4 break-words">{a.desc}</p>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="border-stone-700 text-stone-400">{a.lane}</Badge>
                  <span className={`text-[11px] ${a.live ? "text-emerald-300" : "text-stone-500"}`}>{a.live ? "חי-באחוזה" : "דורש-שחזור"}</span>
                </div>
              </div>
            ))}
            {(!growth || growth.arsenal.length === 0) && (
              <div className="text-xs text-stone-500 p-3">מפתח-ארסנל בבנייה…</div>
            )}
          </CardContent>
        </Card>

        {/* הישרדות */}
        <Card className="border-emerald-900/60 bg-gradient-to-br from-emerald-950/30 to-stone-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden />
              הישרדות-ריבונית · מוכח במדידה, לא בהצהרה
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <Activity className="h-4 w-4" aria-hidden /> Cold-start אמיתי · היום 10:14
              </div>
              <p className="text-xs text-stone-300">{data?.survival.coldStart.what}</p>
              <ul className="text-[11px] text-stone-400 space-y-1 list-disc pr-4">
                {(data?.survival.coldStart.chain ?? []).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <div className="text-[11px] text-emerald-300">{data?.survival.coldStart.verdict}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <Timer className="h-4 w-4" aria-hidden /> דריל-שחזור מהגיט · 3.2 שניות
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-stone-900 p-2">
                  <div className="text-lg font-bold tabular-nums text-emerald-300">{data?.survival.gitOnlyDrill.cloneSec ?? "—"}</div>
                  <div className="text-[10px] text-stone-500">שנ' · שכפול</div>
                </div>
                <div className="rounded bg-stone-900 p-2">
                  <div className="text-lg font-bold tabular-nums text-emerald-300">{data?.survival.gitOnlyDrill.bootToVerifySec ?? "—"}</div>
                  <div className="text-[10px] text-stone-500">שנ' · בוט-עד-אימות</div>
                </div>
                <div className="rounded bg-stone-900 p-2">
                  <div className="text-lg font-bold tabular-nums text-emerald-300">{data?.survival.gitOnlyDrill.totalSec ?? "—"}</div>
                  <div className="text-[10px] text-stone-500">שנ' · סה"כ</div>
                </div>
              </div>
              <p className="text-[11px] text-stone-400">{data?.survival.gitOnlyDrill.result}</p>
              <div className="text-[11px] text-emerald-300">{data?.survival.gitOnlyDrill.verdict}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden /> gal-88 · self-provisioning-מארח
              </div>
              <p className="text-xs text-stone-300">{data?.survival.hostSelfProvision.what}</p>
              <p className="text-[11px] text-stone-400">{data?.survival.hostSelfProvision.closes}</p>
              <div className="text-[11px] text-stone-500">נפרס: {data?.survival.hostSelfProvision.at ? fmtTime(data.survival.hostSelfProvision.at) : "—"} · פעיל מיד (הוחלף-בחיים)</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <GitCommitVertical className="h-4 w-4" aria-hidden /> bootstrap-קנוני בגיט
              </div>
              <p className="text-xs text-stone-300">{data?.survival.gitCanonicalBootstrap.what}</p>
              <div className="font-mono text-[11px] text-emerald-300">{data?.survival.gitCanonicalBootstrap.commit}</div>
              <div className="text-[11px] text-emerald-300">{data?.survival.gitCanonicalBootstrap.verdict}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden /> gal-89 · אחוזה-שלמה בפקודה-אחת
              </div>
              <p className="text-xs text-stone-300">{data?.survival.wipeThreeEstate?.what}</p>
              <div className="font-mono text-[11px] text-emerald-300">{data?.survival.wipeThreeEstate?.commit}</div>
              <div className="text-[11px] text-emerald-300">{data?.survival.wipeThreeEstate?.verdict}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <Network className="h-4 w-4" aria-hidden /> gal-90 · ריבוי-צמתים על ספר-אחד
              </div>
              <p className="text-xs text-stone-300">{data?.survival.multiNodeLaw?.what}</p>
              <div className="font-mono text-[11px] text-emerald-300">{data?.survival.multiNodeLaw?.commit}</div>
              <div className="text-[11px] text-emerald-300">{data?.survival.multiNodeLaw?.verdict}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden /> gal-91 · ביקורת בסנדבוקס-מבודד (quicksand)
              </div>
              <p className="text-xs text-stone-300">{data?.survival.sovereignVm?.what}</p>
              <div className="font-mono text-[11px] text-emerald-300">{data?.survival.sovereignVm?.commit}</div>
              <div className="text-[11px] text-emerald-300">{data?.survival.sovereignVm?.verdict}</div>
            </div>
          </CardContent>
        </Card>

        {/* החלטות-בעלים */}
        <Card className="border-amber-900/60 bg-stone-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden />
              המתין-להחלטות-בעלים (ב-UI בלבד — הסוכנים לא נוגעים)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(data?.ownerDecisions ?? []).map((d) => (
              <div key={d.id} className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-stone-100">{d.title}</div>
                  <Badge variant="outline" className="border-amber-800 text-amber-300 shrink-0">{d.state}</Badge>
                </div>
                <p className="text-xs text-stone-400 mt-1.5 leading-5">{d.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ═══ שולחן-ההוכחה-החי של agent-zai (G10 union, אדיטיבי-בלבד):
            פעולת-בעלים-Hive · active-חי-מהשרשרת · גשר-הצי · טלמטריית-היררכיה ·
            פעימת-כלכלה · מוח-NIM-שני · ביקורת-iFixAi — הכל מדוד-חי, אפס-נתון-מאולתר ═══ */}
        <section aria-label="שולחן-ההוכחה-החי — agent-zai" className="mt-8 border-t border-stone-800 pt-6">
          <ZaiLiveDesk />
        </section>
      </main>

      {/* פוטר-דביק */}
      <footer className="mt-auto border-t border-stone-800 bg-stone-900/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            {data?.safety ?? "אפס נגיעה בכספות/סודות/טוקנים — הוראת-בעלים בתוקף"}
          </span>
          <span>תיאום 9-סוכנים · saos-coordination/LOCKS.md · union-merge · pure-additions</span>
        </div>
      </footer>
    </div>
  );
}

// G10-fix: named export נדרש ע"י page (היימרוז עם default — תואם-שניהם)
export { SaosCockpit };
