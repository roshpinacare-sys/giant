"use client";

/* ═══ האחוזה · מפקד-האחוזה (GIANT · census) ════════════════════════════════
 * מקור: /api/organism (engine.ts — assembleOrganism). כל-ספרה מדידה-חיה:
 * · סריקת-גיט של האחוזה (clones: branch/head/dirty/ahead/behind/age).
 * · מפת-הזרימה (flow): התראות · רפאים · יתומים · מיושנים.
 * · הזמנות-עבודה (work-orders) · אמת-מפתח (סיכומים בלבד) · שלמות · מטבעות.
 * · ה-prober-של-Pages-החיים (status+sha16 לכל-עמוד).
 * כנות: טעינה=שלדים · ריק=״לא נמדד״ · כשל=באנר-אדום עם-השגיאה עצמה. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, GitBranch, Landmark, RefreshCw } from "lucide-react";

interface RepoScan {
  repo: string;
  branch: string | null;
  headShort: string | null;
  subject: string | null;
  ageHours: number | null;
  dirty: number | null;
  ahead: number | null;
  behind: number | null;
  error: string | null;
}

interface LivePage {
  url: string;
  label: string;
  status: number | null;
  error: string | null;
}

interface WorkOrder {
  id: string;
  title: string;
  repo: string | null;
  status: string;
  evidence: string | null;
}

interface EstateRow {
  repo: string;
  reds48h: number | null;
  openIssues: number | null;
}

interface FlowState {
  generatedAt: string | null;
  orphans: number | null;
  ghosts: number | null;
  stale: number | null;
  alerts: number | null;
}

interface OrganismPayload {
  at: string;
  node: { refsSource: string; clones: RepoScan[] };
  growth: {
    potential: { workOrdersOpen: number | null; rows: EstateRow[] } | null;
    workOrders: WorkOrder[];
    workOrdersAt: string | null;
  };
  truth: {
    keyProof: { dead: number | null; aliveAlert: number | null; incident: boolean | null } | null;
    integrity: { overall: string | null; findings: number | null; sources: number | null; verified: number | null } | null;
    tokens: { rows: unknown[] } | null;
    flow: FlowState | null;
  };
  live: LivePage[];
  errors: string[];
}

const POLL_MS = 60_000;

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function ageHe(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} ד׳`;
  if (hours < 48) return `${Math.round(hours)} ש׳`;
  return `${Math.round(hours / 24)} ימים`;
}

/* שבב-מצב ריפו — כנות-ראשונה: שגיאה/אחוריים/מטונף/מקדים/נקי */
function repoChip(r: RepoScan) {
  if (r.error) return <span className="rounded-sm border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">שגיאה</span>;
  if (r.behind !== null && r.behind > 0)
    return <span className="rounded-sm border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-red-400">אחוריים {r.behind}</span>;
  if (r.dirty !== null && r.dirty > 0)
    return <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-500">מטונף {r.dirty}</span>;
  if (r.ahead !== null && r.ahead > 0)
    return <span className="rounded-sm border border-white/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-400">מקדים {r.ahead}</span>;
  return <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] text-emerald-500">נקי</span>;
}

function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "amber" | "red" | "green";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-500"
      : tone === "red"
        ? "text-red-500"
        : tone === "green"
          ? "text-emerald-500"
          : "text-zinc-100";
  return (
    <div className="rounded-md border border-white/10 bg-zinc-900/40 px-3 py-2.5">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-mono text-2xl tabular-nums ${toneCls}`}>{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-zinc-600" title={sub}>
        {sub}
      </div>
    </div>
  );
}

function sumField(rows: EstateRow[] | undefined, f: "reds48h" | "openIssues"): number | null {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((acc, r) => acc + (r[f] ?? 0), 0);
}

export function EstateView() {
  const [data, setData] = useState<OrganismPayload | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setBusy(true);
    try {
      const res = await fetch("/api/organism", { cache: "no-store", signal: ac.signal });
      const j = (await res.json()) as OrganismPayload & { error?: string; detail?: string };
      if (!alive.current) return;
      if (!res.ok || j.error) {
        setErr(j.detail ? `${j.error}: ${j.detail}` : `organism ${res.status}`);
        setData(null);
      } else {
        setData(j);
        setErr("");
      }
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setErr(e instanceof Error ? e.message.slice(0, 200) : "organism-fetch-failed");
      setData(null);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
      acRef.current?.abort();
    };
  }, [load]);

  /* ---------- נגזרות-מדידה בלבד (אפס-מספרים-מצוירים) ---------- */
  const clones = data?.node.clones ?? [];
  const reposTotal = data ? clones.length : null;
  const stale24h = data ? clones.filter((c) => c.ageHours !== null && c.ageHours > 24).length : null;
  const dirtyRepos = data ? clones.filter((c) => c.dirty !== null && c.dirty > 0).length : null;
  const behindRepos = data ? clones.filter((c) => c.behind !== null && c.behind > 0).length : null;
  const liveOk = data ? data.live.filter((l) => l.status === 200).length : null;
  const liveTotal = data ? data.live.length : null;
  const reds48h = sumField(data?.growth.potential?.rows, "reds48h");
  const issuesOpen = sumField(data?.growth.potential?.rows, "openIssues");
  const woCount = data ? (data.growth.workOrdersAt === null ? null : data.growth.workOrders.length) : null;
  const flow = data?.truth.flow ?? null;
  const integrity = data?.truth.integrity ?? null;
  const keyProof = data?.truth.keyProof ?? null;
  const tokensCount = data?.truth.tokens ? data.truth.tokens.rows.length : null;

  return (
    <section dir="rtl" className="space-y-4" aria-label="האחוזה — מפקד-האחוזה">
      {/* כותרת */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-amber-500" aria-hidden />
          <h2 className="text-lg font-semibold text-zinc-100">האחוזה</h2>
          <span className="text-xs text-zinc-500">מפקד-האחוזה: הגיט · הזרימה · העבודות · העמודים-החיים</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
          {data && (
            <span className="font-mono" dir="ltr">
              census {new Date(data.at).toISOString().slice(11, 19)}Z
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 text-zinc-400 hover:border-amber-500/40 hover:text-amber-500"
            aria-label="רענן מפקד"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} aria-hidden />
            רענן
          </button>
        </div>
      </header>

      {/* כשל = באנר-אדום כנה עם-השגיאה-עצמה */}
      {err && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <div>
            <div className="font-medium">מפקד-האחוזה: מדידה-נכשלה</div>
            <div className="mt-0.5 font-mono text-xs text-red-400/90" dir="ltr">
              {err}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500">fail-honest: אין-נתונים-מצוירים — רק-השגיאה-האמיתית</div>
          </div>
        </div>
      )}

      {/* שורת-KPI */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {reposTotal === null ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-md border border-white/10" />)
        ) : (
          <>
            <Kpi label="ריפואים" value={fmtInt(reposTotal)} sub={data?.node.refsSource ?? ""} tone="amber" />
            <Kpi
              label="עמודים-חיים"
              value={`${liveOk}/${liveTotal}`}
              sub={liveTotal !== null && liveOk !== null && liveOk < liveTotal ? "יש-עמודים-לא-חיים" : "Pages-חיים (status 200)"}
              tone={liveOk !== null && liveTotal !== null && liveOk === liveTotal ? "green" : "red"}
            />
            <Kpi
              label="מוזנחים-24ש׳"
              value={fmtInt(stale24h ?? 0)}
              sub="עדכון-אחרון מעל 24 שעות"
              tone={stale24h !== null && stale24h > 0 ? "red" : "neutral"}
            />
            <Kpi
              label="תקלות-48ש׳"
              value={reds48h === null ? "—" : fmtInt(reds48h)}
              sub={reds48h === null ? "לא נמדד" : "סכום-אדומים בריפואים"}
              tone={reds48h !== null && reds48h > 0 ? "red" : "neutral"}
            />
            <Kpi
              label="נושאים-פתוחים"
              value={issuesOpen === null ? "—" : fmtInt(issuesOpen)}
              sub={issuesOpen === null ? "לא נמדד" : "סכום-issues בריפואים"}
              tone="neutral"
            />
            <Kpi
              label="הזמנות-עבודה"
              value={woCount === null ? "—" : fmtInt(woCount)}
              sub={woCount === null ? "לא נמדד" : "פתוחות במשרד"}
              tone={woCount !== null && woCount > 0 ? "amber" : "neutral"}
            />
          </>
        )}
      </div>

      {/* טבלת-הריפואים */}
      <div className="rounded-md border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <GitBranch className="h-4 w-4 text-amber-500" aria-hidden />
            סריקת-הגיט
          </div>
          <div className="flex gap-2 font-mono text-[10px] tabular-nums text-zinc-600">
            {dirtyRepos !== null && <span>מטונף {dirtyRepos}</span>}
            {behindRepos !== null && <span>· אחוריים {behindRepos}</span>}
          </div>
        </div>
        {reposTotal === null ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : clones.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">לא נמדד — אין-ריפואים-בסריקה</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="text-right text-[11px] text-zinc-500 [&>th]:border-b [&>th]:border-white/10 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>ריפו</th>
                  <th>ענף</th>
                  <th>HEAD</th>
                  <th>עדכון-אחרון</th>
                  <th className="tabular-nums">שינויים</th>
                  <th className="tabular-nums">קדימה/אחורה</th>
                  <th>מצב</th>
                </tr>
              </thead>
              <tbody>
                {clones.map((r) => (
                  <tr key={r.repo} className="border-b border-white/5 text-zinc-300 transition-colors last:border-0 hover:bg-white/5">
                    <td className="max-w-[220px] truncate px-3 py-2 font-medium text-zinc-100" title={r.subject ?? r.repo}>
                      {r.repo}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-400" dir="ltr">
                      {r.branch ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500" dir="ltr">
                      {r.headShort ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-zinc-400">{ageHe(r.ageHours)}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{r.dirty === null ? "—" : r.dirty}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums" dir="ltr">
                      {r.ahead === null && r.behind === null ? "—" : `+${r.ahead ?? 0} / -${r.behind ?? 0}`}
                    </td>
                    <td className="px-3 py-2">{repoChip(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* מפת-הזרימה + אמת */}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-white/10 p-3">
          <div className="mb-2 text-sm font-medium text-zinc-200">מפת-הזרימה</div>
          {flow === null ? (
            <div className="text-sm text-zinc-500">לא נמדד</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-sm border px-2 py-1 font-mono text-xs tabular-nums ${flow.alerts ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-white/10 text-zinc-400"}`}>
                התראות {flow.alerts ?? "—"}
              </span>
              <span className={`rounded-sm border px-2 py-1 font-mono text-xs tabular-nums ${flow.ghosts ? "border-amber-500/40 text-amber-500" : "border-white/10 text-zinc-400"}`}>
                רפאים {flow.ghosts ?? "—"}
              </span>
              <span className={`rounded-sm border px-2 py-1 font-mono text-xs tabular-nums ${flow.orphans ? "border-amber-500/40 text-amber-500" : "border-white/10 text-zinc-400"}`}>
                יתומים {flow.orphans ?? "—"}
              </span>
              <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-xs tabular-nums text-zinc-400">מיושן {flow.stale ?? "—"}</span>
              <span className="w-full text-[10px] text-zinc-600">
                {flow.generatedAt ? `נמדד לפני ${ageHe((Date.now() - Date.parse(flow.generatedAt)) / 3600000)}` : "ללא-תאריך-מדידה"}
              </span>
            </div>
          )}
          <div className="mt-2 border-t border-white/5 pt-2">
            <div className="mb-1.5 text-[11px] text-zinc-500">אמת-הריבונות</div>
            <div className="flex flex-wrap gap-2">
              {integrity === null ? (
                <span className="text-xs text-zinc-500">שלמות: לא נמדד</span>
              ) : (
                <span
                  className={`rounded-sm border px-2 py-1 font-mono text-xs ${
                    integrity.overall === "GREEN"
                      ? "border-emerald-500/40 text-emerald-500"
                      : integrity.overall === "PASS"
                        ? "border-emerald-500/40 text-emerald-500"
                        : "border-amber-500/40 text-amber-500"
                  }`}
                >
                  שלמות {integrity.overall ?? "—"} · ממצאים {integrity.findings ?? "—"}
                </span>
              )}
              {keyProof === null ? (
                <span className="text-xs text-zinc-500">מפתח-הוכחה: לא נמדד</span>
              ) : (
                <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-xs tabular-nums text-zinc-400">
                  מפתחות-מתים {keyProof.dead ?? "—"} · התראות {keyProof.aliveAlert ?? "—"}
                </span>
              )}
              <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-xs tabular-nums text-zinc-400">
                מטבעות-אמת {tokensCount === null ? "לא נמדד" : tokensCount}
              </span>
            </div>
          </div>
        </div>

        {/* הזמנות-עבודה */}
        <div className="rounded-md border border-white/10 p-3">
          <div className="mb-2 text-sm font-medium text-zinc-200">הזמנות-עבודה</div>
          {woCount === null ? (
            <div className="text-sm text-zinc-500">לא נמדד</div>
          ) : woCount === 0 ? (
            <div className="text-sm text-zinc-500">אין-הזמנות-ברשימה (נמדד)</div>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {data?.growth.workOrders.map((w) => (
                <li key={w.id} className="rounded-sm border border-white/5 bg-zinc-900/40 px-2 py-1.5 hover:border-amber-500/20">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-amber-500/90" dir="ltr">
                      {w.id}
                    </span>
                    <span className="shrink-0 rounded-sm border border-white/10 px-1 py-0.5 text-[9px] text-zinc-500">{w.status}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-200" title={w.title}>
                    {w.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-600">
                    {w.repo && <span className="truncate font-mono" dir="ltr">{w.repo}</span>}
                    {w.evidence && w.evidence.startsWith("http") && (
                      <a
                        href={w.evidence}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-amber-500/80 underline-offset-2 hover:underline"
                        dir="ltr"
                      >
                        ראיה ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ה-prober-של-Pages-החיים */}
      <div className="rounded-md border border-white/10 p-3">
        <div className="mb-2 text-sm font-medium text-zinc-200">עמודים-חיים (Pages prober)</div>
        {liveTotal === null || liveTotal === 0 ? (
          <div className="text-sm text-zinc-500">לא נמדד</div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.live ?? []).map((l) => (
              <div
                key={l.url}
                title={l.error ?? `${l.status} · ${l.url}`}
                className={`flex items-center justify-between gap-2 rounded-sm border px-2 py-1 text-xs ${
                  l.status === 200 ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/40 bg-red-500/10"
                }`}
              >
                <span className="truncate text-zinc-300">{l.label}</span>
                <span className={`shrink-0 font-mono tabular-nums ${l.status === 200 ? "text-emerald-500" : "text-red-400"}`}>
                  {l.status ?? (l.error ? "ERR" : "—")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
