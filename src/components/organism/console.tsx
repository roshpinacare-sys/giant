"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrganismPayload, LivePage, FeedMeta, RepoScan, EstateRow, WorkOrder, RecruitRole, TokenRow } from "@/lib/organism/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, ExternalLink, HeartPulse, ShieldCheck, Sparkles, Globe, Users, AlertTriangle } from "lucide-react";
import SovereignChannel from "@/components/sovereign/channel-panel";

/* ------------------------------- formatting ------------------------------- */

function fmtAge(min: number | null | undefined): string {
  if (min === null || min === undefined) return "אין נתון";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  const h = min / 60;
  if (h < 48) return `${Math.round(h * 10) / 10} ש׳`;
  return `${Math.round(h / 24)} ימים`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "אין נתון";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", { hour12: false });
}

function num(n: number | null | undefined, suffix = ""): string {
  return n === null || n === undefined ? "אין נתון" : `${n}${suffix}`;
}

function trunc(s: string | null | undefined, n = 140): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/* --------------------------------- badges --------------------------------- */

function VerdictBadge({ v }: { v: string | null | undefined }) {
  const s = (v ?? "").toUpperCase();
  const ok = s.startsWith("PASS") || s === "GREEN" || s === "OK";
  const bad = s === "FAIL" || s === "RED" || s.startsWith("FAIL");
  return (
    <Badge className={ok ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : bad ? "bg-red-500/15 text-red-300 border-red-500/40" : "bg-amber-500/15 text-amber-300 border-amber-500/40"}>
      {v ?? "אין נתון"}
    </Badge>
  );
}

function AgeChip({ minutes, staleAfter = 180 }: { minutes: number | null | undefined; staleAfter?: number }) {
  const stale = minutes === null || minutes === undefined || minutes > staleAfter;
  return (
    <Badge variant="outline" className={stale ? "border-amber-500/40 text-amber-300" : "border-emerald-500/40 text-emerald-300"}>
      {fmtAge(minutes)}
    </Badge>
  );
}

function Sha16({ v }: { v: string | null }) {
  return (
    <code dir="ltr" className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[11px] text-zinc-300">
      {v ? `sha256:${v}` : "—"}
    </code>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span>אין נתון חי — מוצהר בכנות ({what})</span>
    </div>
  );
}

/* --------------------------------- fetcher -------------------------------- */

function useOrganism() {
  const [data, setData] = useState<OrganismPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/organism", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ? `API ${res.status}: ${body.detail}` : `API ${res.status}`);
      }
      setData((await res.json()) as OrganismPayload);
      setError(null);
      setRefreshedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 90_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  return { data, error, loading, refreshedAt, reload: load };
}

/* -------------------------------- sections -------------------------------- */

function OfficeTab({ d }: { d: OrganismPayload }) {
  const ci = d.office.ci;
  const st = d.office.state;
  const hb = d.office.heartbeat;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base text-zinc-100">
            <span>בניית-המשרד (office-ci)</span>
            <VerdictBadge v={ci?.overall ?? null} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-300">
          {ci ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ci.checks ?? {}).map(([k, v]) => (
                  <Badge
                    key={k}
                    variant="outline"
                    className={v === "pass" ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}
                  >
                    {k}: {v}
                  </Badge>
                ))}
              </div>
              {ci.reason && <p className="text-xs text-zinc-400">{ci.reason}</p>}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <AgeChip minutes={ci.ageMinutes} staleAfter={120} />
                <span dir="ltr">{fmtTime(ci.at)}</span>
                {ci.runUrl && (
                  <a className="inline-flex items-center gap-1 text-emerald-400 hover:underline" href={ci.runUrl} target="_blank" rel="noreferrer">
                    הרצה <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </>
          ) : (
            <Missing what="FleetHQ/receipts/office-ci/verdict.json" />
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <HeartPulse className="h-4 w-4 text-emerald-400" aria-hidden /> מצב-הצוות החי
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          {st ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={st.connected ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}>
                  {st.connected ? "מחובר" : "מנותק"}
                </Badge>
                {st.backend && <Badge variant="outline" className="border-zinc-600 text-zinc-300">{st.backend}</Badge>}
                {st.agents !== null && <Badge variant="outline" className="border-zinc-600 text-zinc-300">{st.agents} סוכנים</Badge>}
              </div>
              {st.statusHe && <p>{st.statusHe}</p>}
              <p className="text-xs text-zinc-500">
                נתפס {fmtTime(st.capturedAt)} · לפני {fmtAge(st.capturedAt ? Math.round((Date.now() - Date.parse(st.capturedAt)) / 60000) : null)}
              </p>
            </>
          ) : (
            <Missing what="FleetHQ/receipts/office-state-mirror.json" />
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">קיר-המשימות של הצוות (מראה-זיכרון)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          {d.office.crewMirror ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-zinc-600 text-zinc-200">סה״כ {d.office.crewMirror.tasksTotal ?? "—"}</Badge>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">הושלמו {d.office.crewMirror.done ?? "—"}</Badge>
                <Badge variant="outline" className="border-zinc-600 text-zinc-300">בביצוע {d.office.crewMirror.doing ?? "—"}</Badge>
                <Badge variant="outline" className="border-zinc-600 text-zinc-300">לביצוע {d.office.crewMirror.todo ?? "—"}</Badge>
                {(d.office.crewMirror.blocked ?? 0) > 0 && (
                  <Badge variant="outline" className="border-red-500/40 text-red-300">חסומות {d.office.crewMirror.blocked}</Badge>
                )}
                {d.office.crewMirror.rescued !== null && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-300">חולצו {d.office.crewMirror.rescued}</Badge>
                )}
              </div>
              {d.office.crewMirror.goal && <p className="text-xs text-zinc-400">יעד: {trunc(d.office.crewMirror.goal, 160)}</p>}
              <p className="text-xs text-zinc-500">נשמר {fmtTime(d.office.crewMirror.savedAt)}</p>
            </>
          ) : (
            <Missing what="FleetHQ/receipts/office-state-mirror.json" />
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">פעימת-האורגניזם (keeper)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          {hb ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-zinc-600 text-zinc-200">tick #{hb.tickCount ?? "אין נתון"}</Badge>
                <VerdictBadge v={hb.status === "ok" ? "PASS" : "FAIL"} />
              </div>
              <p className="text-xs text-zinc-500">
                פעימה אחרונה: {fmtTime(hb.lastTick)} · לפני {fmtAge(hb.lastTick ? Math.round((Date.now() - Date.parse(hb.lastTick)) / 60000) : null)}
              </p>
            </>
          ) : (
            <Missing what="Sandbox/state/network-state.json" />
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">צעדי-הערך הבאים (מהמנוע)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          {d.growth.potential && d.growth.potential.topActions.length > 0 ? (
            <ul className="list-inside list-disc space-y-1">
              {d.growth.potential.topActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : (
            <Missing what="top_actions ב-potential.json" />
          )}
          <Separator className="bg-zinc-800" />
          <p className="text-xs text-zinc-400">
            פוטנציאל נמדד: {fmtTime(d.growth.potential?.measuredAt)} · דלתא: {d.growth.potential?.delta.join(" · ") || "—"} · אסימון: {num(d.growth.potential?.tokenDaysLeft, " ימים")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function WorldCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-zinc-100">{title}</CardTitle>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-zinc-300">{children}</CardContent>
    </Card>
  );
}

function WorldsTab({ d }: { d: OrganismPayload }) {
  const flow = d.truth.flow;
  const tokens = d.truth.tokens;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <WorldCard title="עולם-המשרד" subtitle="מה שרץ עכשיו — צוות, פעימות, בנייה">
          <ul className="space-y-1.5">
            <li>סוכנים: {num(d.office.state?.agents)}</li>
            <li>חיבור: {d.office.state?.connected === null || d.office.state === null ? "אין נתון" : d.office.state.connected ? "חי" : "מנותק"}</li>
            <li>פעימה: tick #{d.office.heartbeat?.tickCount ?? "אין נתון"}</li>
            <li>בנייה: {d.office.ci?.overall ?? "אין נתון"}</li>
          </ul>
          <a className="inline-flex items-center gap-1 text-emerald-400 hover:underline" href="https://roshpinacare-sys.github.io/FleetHQ/" target="_blank" rel="noreferrer">
            חלון-המשרד הציבורי <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </WorldCard>

        <WorldCard title="עולם-העסקים" subtitle="אמת-טוקנים מדודה (מטא-דאטה בלבד — G9)">
          {tokens && tokens.rows.length > 0 ? (
            <ul className="space-y-1.5">
              {tokens.rows.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <code dir="ltr" className="text-xs text-zinc-300">{t.name}</code>
                  <Badge variant="outline" className={t.state === "ALIVE" ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}>
                    {t.state} · {num(t.days, "י׳")}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Missing what="Sandbox/ops/TOKEN-TRUTH.md" />
          )}
        </WorldCard>

        <WorldCard title="העולם-המקביל" subtitle="מה שנשכח — יתומים, רוחות, הזדקנויות (מפת-זרימה)">
          {flow ? (
            <ul className="space-y-1.5">
              <li>יתומים: {num(flow.orphans)}</li>
              <li>רוחות-רפאים: {num(flow.ghosts)}</li>
              <li>מזדקנים: {num(flow.stale)}</li>
              <li>התראות: {num(flow.alerts)}</li>
              <li className="text-xs text-zinc-500">נמדד {fmtTime(flow.generatedAt)}</li>
            </ul>
          ) : (
            <Missing what="Sandbox/ops/flow/flow-map.json" />
          )}
          <a className="inline-flex items-center gap-1 text-emerald-400 hover:underline" href="https://roshpinacare-sys.github.io/FleetHQ/potential.html" target="_blank" rel="noreferrer">
            לוח-הפוטנציאל הציבורי <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </WorldCard>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">חדר 3D חי — רינדור ישיר מה-Pages הציבורי</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <iframe
              src="https://roshpinacare-sys.github.io/Domain/office3d/"
              title="חדר המשרד 3D החי"
              loading="lazy"
              className="h-[420px] w-full bg-zinc-950"
            />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>המקור נטען ישירות מהדומיין הציבורי — אם המסגרת ריקה, זו כנות ולא תיאטרון:</span>
            <a className="inline-flex items-center gap-1 text-emerald-400 hover:underline" href="https://roshpinacare-sys.github.io/Domain/office3d/" target="_blank" rel="noreferrer">
              פתיחה בלשונית נפרדת <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            <span>·</span>
            <a className="inline-flex items-center gap-1 text-emerald-400 hover:underline" href="https://roshpinacare-sys.github.io/Domain/office3d/growth/" target="_blank" rel="noreferrer">
              חדר-הצמיחה <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RecruitTab({ d }: { d: OrganismPayload }) {
  const roles: RecruitRole[] = d.recruit?.roles ?? [];
  const orders: WorkOrder[] = d.growth.workOrders ?? [];
  return (
    <div className="space-y-4">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Users className="h-4 w-4 text-emerald-400" aria-hidden /> תפקידי-גיוס פתוחים ({roles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {roles.length > 0 ? (
            <ScrollArea className="max-h-96">
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((r) => (
                  <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="font-medium text-zinc-100">{r.titleHe}</p>
                    {r.titleEn && <p dir="ltr" className="text-xs text-zinc-500">{r.titleEn}</p>}
                    {r.openedBy && <p className="mt-2 text-xs text-zinc-400"><span className="text-zinc-500">נפתח-עקב: </span>{trunc(r.openedBy, 180)}</p>}
                    {r.contract && <p className="mt-1 text-xs text-zinc-400"><span className="text-zinc-500">חוזה: </span>{trunc(r.contract, 180)}</p>}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Missing what="Domain/agents/recruitment.json" />
          )}
          <p className="mt-3 text-xs text-zinc-500">מקור: Domain/agents/recruitment.json · נמדד {fmtTime(d.recruit?.at)}</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden /> פקודות-עבודה אמיתיות ({orders.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.length > 0 ? (
            orders.map((o) => (
              <div key={o.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-100">{o.title}</p>
                  <Badge variant="outline" className="border-zinc-600 text-zinc-300">{o.status}</Badge>
                </div>
                {o.repo && <p dir="ltr" className="mt-1 text-xs text-zinc-500">{o.repo}</p>}
                {o.evidence && <p className="mt-1 text-xs text-zinc-400">עדות: {trunc(o.evidence, 200)}</p>}
                {o.firstStep && <p className="mt-1 text-xs text-emerald-300/90">קבלה (definition-of-done): {trunc(o.firstStep, 200)}</p>}
              </div>
            ))
          ) : (
            <Missing what="Sandbox/ops/office/work-orders.json" />
          )}
          <p className="text-xs text-zinc-500">מקור: Sandbox/ops/office/work-orders.json · נמדד {fmtTime(d.growth.workOrdersAt)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TruthTab({ d }: { d: OrganismPayload }) {
  const kp = d.truth.keyProof;
  const ig = d.truth.integrity;
  return (
    <div className="space-y-4">
      <Card className="border-emerald-900/60 bg-emerald-950/20">
        <CardContent className="pt-4 text-sm leading-relaxed text-emerald-100/90">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            {d.selftest.contract}
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">אימות-חי של הדפים הציבוריים (fetch עכשיו + sha256)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-80">
            <div className="space-y-2">
              {d.live.map((p: LivePage) => (
                <div key={p.url} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
                  <a dir="ltr" href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-300 hover:text-emerald-300">
                    {p.label} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={p.status === 200 ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}>
                      HTTP {p.status ?? "—"}
                    </Badge>
                    <Sha16 v={p.sha16} />
                    <span className="text-zinc-500">{p.bytes !== null ? `${(p.bytes / 1024).toFixed(1)}KB` : "—"}</span>
                    {p.marker && (
                      <Badge variant="outline" className={p.markerOk ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}>
                        {p.markerOk ? "סמן נמצא" : "סמן חסר"}
                      </Badge>
                    )}
                    {p.error && <span className="text-red-300">{p.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-100">הוכחת-מפתחות (ספירות בלבד — לעולם לא חומר)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            {kp ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-red-500/40 text-red-300">DEAD {kp.dead ?? "—"}</Badge>
                  <Badge variant="outline" className={kp.aliveAlert ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}>ALIVE-ALERT {kp.aliveAlert ?? "—"}</Badge>
                  <Badge variant="outline" className="border-zinc-600 text-zinc-300">UNKNOWN {kp.unknown ?? "—"}</Badge>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-300">לא-ניתן-לבדיקה-בשרשרת {kp.notChainTestable ?? "—"}</Badge>
                  <Badge variant="outline" className={kp.incident ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}>תקרית: {kp.incident ? "כן" : "לא"}</Badge>
                </div>
                <p className="text-xs text-zinc-500">נמדד {fmtTime(kp.generatedAt)}</p>
              </>
            ) : (
              <Missing what="Sandbox/proof/out/KEY-PROOF-LATEST.json (summary)" />
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-100">עורק-היושרה (integrity-guard)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            {ig ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <VerdictBadge v={ig.overall} />
                  <Badge variant="outline" className="border-zinc-600 text-zinc-300">מקורות {ig.sources ?? "—"}</Badge>
                  <Badge variant="outline" className="border-zinc-600 text-zinc-300">אומתו {ig.verified ?? "—"}</Badge>
                  <Badge variant="outline" className={ig.findings ? "border-amber-500/40 text-amber-300" : "border-emerald-500/40 text-emerald-300"}>ממצאים {ig.findings ?? "—"}</Badge>
                  {Object.entries(ig.counts ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="border-zinc-600 text-zinc-300">{k} {v}</Badge>
                  ))}
                </div>
                <p className="text-xs text-zinc-500">נמדד {fmtTime(ig.at)}</p>
                {ig.runUrl && (
                  <a className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline" href={ig.runUrl} target="_blank" rel="noreferrer">
                    הרצה <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </>
            ) : (
              <Missing what="Sandbox/ops/integrity/verdict.json" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">selftest — כל מקור מקומי: קיום, גודל, sha256, גיל</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72">
            <div className="space-y-1.5">
              {d.selftest.feeds.map((f: FeedMeta) => (
                <div key={f.path} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-950/60 px-3 py-1.5 text-xs">
                  <code dir="ltr" className="text-zinc-300">{f.path}</code>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={f.exists ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}>
                      {f.exists ? "קיים" : "חסר"}
                    </Badge>
                    <span className="text-zinc-500">{f.bytes !== null ? `${f.bytes}B` : "—"}</span>
                    <Sha16 v={f.sha16} />
                    <AgeChip minutes={f.ageMinutes} staleAfter={360} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function NetworkTab({ d }: { d: OrganismPayload }) {
  const clones: RepoScan[] = d.node.clones;
  const rows: EstateRow[] = d.growth.potential?.rows ?? [];
  return (
    <div className="space-y-4">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Globe className="h-4 w-4 text-emerald-400" aria-hidden /> האחזות המקומיות בצומת זה ({clones.length})
          </CardTitle>
          <p className="text-xs text-zinc-500">refs: {d.node.refsSource} · dir: <code dir="ltr">{d.node.estateDir}</code></p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <div className="space-y-1.5">
              {clones.map((c) => (
                <div key={c.repo} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-950/60 px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">{c.repo}</span>
                    {c.branch && <Badge variant="outline" className="border-zinc-700 text-zinc-400">{c.branch}</Badge>}
                    {c.headShort && <code dir="ltr" className="text-zinc-500">{c.headShort}</code>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-zinc-400">
                    <span>{c.ageHours !== null ? `לפני ${c.ageHours} ש׳` : "אין נתון"}</span>
                    {c.dirty !== null && c.dirty > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-300">dirty {c.dirty}</Badge>}
                    {c.behind !== null && c.behind > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-300">מאחור {c.behind}</Badge>}
                    {c.ahead !== null && c.ahead > 0 && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">לפנים {c.ahead}</Badge>}
                    {c.error && <span className="text-red-300">{c.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-zinc-100">הרשת הנמדדת — {rows.length} מאגרים (מהמנוע, חי)</CardTitle>
          <p className="text-xs text-zinc-500">מקור: Sandbox/ops/office/potential.json · נמדד {fmtTime(d.growth.potential?.measuredAt)}</p>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <ScrollArea className="max-h-96">
              <div className="space-y-1.5">
                {rows.map((r) => (
                  <div key={r.repo} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-950/60 px-3 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-200">{r.repo}</span>
                      <Badge variant="outline" className={r.status === "FRESH" ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}>
                        {r.status}
                      </Badge>
                      {r.archived && <Badge variant="outline" className="border-red-500/40 text-red-300">ארכיון</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-zinc-400">
                      <span>דחיפה: {r.pushAgeH !== null ? `${r.pushAgeH} ש׳` : "—"}</span>
                      <Badge variant="outline" className={(r.reds48h ?? 0) > 0 ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}>
                        אדומים-48ש {r.reds48h ?? "—"}
                      </Badge>
                      {(r.openIssues ?? 0) > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-300">issues {r.openIssues}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Missing what="potential.json estate.rows" />
          )}
          {d.growth.potential?.notScanned && (
            <p className="mt-3 text-xs text-amber-300/90">לא-נסרק (מוצהר בכנות): {d.growth.potential.notScanned}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------- shell --------------------------------- */

export default function OrganismConsole() {
  const { data, error, loading, refreshedAt, reload } = useOrganism();
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString("he-IL", { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">מפקדת-האורגניזם</h1>
            <p className="text-xs text-zinc-500">חדר-משרד ריבוני · מחובר לרשת ולריבונות · אין זיופים — כל ערך נמדד עם מקור</p>
          </div>
          <div className="flex items-center gap-2">
            <span dir="ltr" className="hidden font-mono text-xs text-zinc-500 sm:inline">{now}</span>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">צומת: zai-sandbox</Badge>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800" onClick={reload} aria-label="רענון">
              <RefreshCw className="h-4 w-4" aria-hidden /> רענון
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {/* THE ONE CHANNEL — the owner's direct door; always live, independent of other feeds */}
        <section className="mb-8" aria-label="ערוץ ריבוני">
          <SovereignChannel />
        </section>

        <Separator className="mb-8 bg-zinc-800" />

        {loading && !data && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl bg-zinc-900" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <span>כשל כנה בקבלת נתוני-האורגניזם: {error} — לא מוצג דבר מדומה.</span>
          </div>
        )}

        {data && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>נמדד: {fmtTime(data.at)}</span>
              <span>·</span>
              <span>רענון-אוטומטי כל 90 שניות</span>
              {data.errors.length > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300">{data.errors.length} מקורות חסרים (מוצהר)</Badge>
              )}
            </div>

            <Tabs defaultValue="office" className="gap-4">
              <TabsList className="flex-wrap bg-zinc-900">
                <TabsTrigger value="office">המשרד</TabsTrigger>
                <TabsTrigger value="worlds">העולמות</TabsTrigger>
                <TabsTrigger value="recruit">גיוס עובדים</TabsTrigger>
                <TabsTrigger value="truth">אין-זיופים</TabsTrigger>
                <TabsTrigger value="network">הרשת</TabsTrigger>
              </TabsList>
              <TabsContent value="office"><OfficeTab d={data} /></TabsContent>
              <TabsContent value="worlds"><WorldsTab d={data} /></TabsContent>
              <TabsContent value="recruit"><RecruitTab d={data} /></TabsContent>
              <TabsContent value="truth"><TruthTab d={data} /></TabsContent>
              <TabsContent value="network"><NetworkTab d={data} /></TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-zinc-500">
          <span>אורגניזם ריבוני רב-גוף · מרחב-מחיה: git · אפס-תלות בצומת זה</span>
          <div className="flex flex-wrap items-center gap-3">
            <a className="inline-flex items-center gap-1 hover:text-emerald-300" href="https://roshpinacare-sys.github.io/FleetHQ/" target="_blank" rel="noreferrer">
              FleetHQ <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            <a className="inline-flex items-center gap-1 hover:text-emerald-300" href="https://roshpinacare-sys.github.io/Domain/" target="_blank" rel="noreferrer">
              Domain <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            <a className="inline-flex items-center gap-1 hover:text-emerald-300" href="https://roshpinacare-sys.github.io/Domain/office3d/" target="_blank" rel="noreferrer">
              חדר 3D <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
