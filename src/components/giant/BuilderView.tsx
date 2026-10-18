"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  GitCommitHorizontal,
  Hammer,
  ListTodo,
  RefreshCw,
  Sprout,
} from "lucide-react";

/* ═══ הבנאי-הריבוני — משטח-המגע (גל-18 · בניה-ולא-רק-בדיקות) ═══════════════
 * הבנאי חי בריפו fleet-economy (פס-הצי): לופ observe→think→act→seal.
 * המסך מציג את מה שנאטם בגיט בלבד — אפס-סינתזה, אפס-ירוק-מזויף:
 * · מצב-חי: מקור-הנתון (worktree/origin-main/raw) + קומיט-הבנאי-האחרון
 * · מוני-צמיחה: acts / metrics — מה-state הקנוני
 * · תור-הבניה (backlog): מה-הבנאי פתח, איזה-כלי, מתי, מי
 * · יומן-הצמיחה (growth-log): הזנב-החי של מה-נבנה בפועל
 * פעולה-יחידה: רענון-מדוד (הבנאי-עצמו בונה — המסך מציג-אמת). */

interface BacklogItem {
  kind?: string;
  title?: string;
  detail?: string;
  tool?: string;
  at?: string;
  by?: string;
}
interface GrowthRow extends Record<string, unknown> {
  at?: string;
  act?: string;
  kind?: string;
  title?: string;
  [k: string]: unknown;
}
interface BuilderPayload {
  ok: boolean;
  note?: string;
  source: "worktree" | "origin-main" | "raw" | "none";
  state: {
    schema?: string;
    createdAt?: string;
    updatedAt?: string;
    acts?: unknown;
    metrics?: unknown;
    backlog: BacklogItem[];
  } | null;
  growth: GrowthRow[];
  lastCommit: { sha: string; at: string; message: string } | null;
  fetchedAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  worktree: "worktree-מקומי (הטרי)",
  "origin-main": "origin/main אחרי-fetch",
  raw: "raw ציבורי (CDN)",
  none: "לא-נמצא",
};

function agoHe(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} ד׳`;
  const h = Math.floor(m / 60);
  if (h < 48) return `לפני ${h} ש׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function kindBadge(kind?: string) {
  const k = kind ?? "";
  if (k.includes("milestone") || k.includes("milestone-tag"))
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">אבן-דרך</Badge>;
  if (k.includes("open") || k.includes("note-open"))
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">פתוח</Badge>;
  if (k.includes("done") || k.includes("act"))
    return <Badge className="bg-teal-500/15 text-teal-600 border-teal-500/30">נבנה</Badge>;
  return <Badge variant="outline">{k || "רשומה"}</Badge>;
}

export function BuilderView() {
  const [data, setData] = useState<BuilderPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/giant/builder", { cache: "no-store" });
      const d = (await res.json()) as BuilderPayload;
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(() => void load(true), 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [load]);

  const acts = typeof data?.state?.acts === "number" ? data.state.acts : null;
  const metrics = typeof data?.state?.metrics === "number" ? data.state.metrics : null;
  const backlog = data?.state?.backlog ?? [];

  return (
    <div className="space-y-4" dir="rtl">
      {/* כותרת-מצב */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hammer className="h-5 w-5 text-amber-500" aria-hidden />
              הבנאי-הריבוני
              {data?.ok ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                  <Activity className="h-3 w-3 me-1" aria-hidden />
                  חי · פס-בניה-אוטונומי
                </Badge>
              ) : loading ? (
                <Badge variant="outline">נמדד…</Badge>
              ) : (
                <Badge className="bg-red-500/15 text-red-600 border-red-500/30">לא-נמצא</Badge>
              )}
            </CardTitle>
            <button
              onClick={() => void load(true)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors min-h-[44px] md:min-h-0"
              aria-label="רענון מדידת הבנאי"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
              רענון
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            לופ-צמיחה observe→think→act→seal — בנייה-מתמדכת, לא-רק-בדיקות. כל-הנתונים
            מהגיט (מקור: {SOURCE_LABEL[data?.source ?? "none"]}) · נמדד {agoHe(data?.fetchedAt)}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">פעולות-בניה (acts)</div>
              {acts === null ? (
                <Skeleton className="mt-1 h-7 w-14" />
              ) : (
                <div className="mt-1 text-2xl font-bold tabular-nums">{acts}</div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">מדידות (metrics)</div>
              {metrics === null ? (
                <Skeleton className="mt-1 h-7 w-14" />
              ) : (
                <div className="mt-1 text-2xl font-bold tabular-nums">{metrics}</div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">תור-הבניה</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{backlog.length}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">יומן-צמיחה (שורות-חיות)</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{data?.growth?.length ?? 0}</div>
            </div>
          </div>
          {data?.lastCommit && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <GitCommitHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
              <code className="font-mono text-xs">{data.lastCommit.sha}</code>
              <span className="text-muted-foreground">{agoHe(data.lastCommit.at)}</span>
              <span className="truncate" title={data.lastCommit.message}>
                {data.lastCommit.message}
              </span>
            </div>
          )}
          {!data?.ok && !loading && data?.note && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              {data.note}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* תור-הבניה */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4 text-amber-500" aria-hidden />
              תור-הבניה (backlog)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : backlog.length === 0 ? (
              <p className="text-sm text-muted-foreground">התור-ריק — הבנאי-אוכל-את-מה-שהוא-בונה.</p>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {backlog.map((b, i) => (
                  <li key={i} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {kindBadge(b.kind)}
                      <span className="font-medium text-sm">{b.title ?? "ללא-כותרת"}</span>
                      <span className="ms-auto text-xs text-muted-foreground">{agoHe(b.at)}</span>
                    </div>
                    {b.detail && (
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{b.detail}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {b.tool && <span>כלי: <code className="font-mono">{b.tool}</code></span>}
                      {b.by && <span>מאת: {b.by}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* יומן-הצמיחה */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sprout className="h-4 w-4 text-emerald-500" aria-hidden />
              יומן-הצמיחה (growth-log · זנב-חי)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (data?.growth?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">עדיין-לא-נרשמו פעולות-צמיחה.</p>
            ) : (
              <ul className="space-y-1.5 max-h-96 overflow-y-auto font-mono text-xs">
                {data!.growth.map((g, i) => (
                  <li key={i} className="rounded border bg-muted/20 px-2 py-1.5 leading-relaxed break-words">
                    <span className="text-muted-foreground">{g.at ? String(g.at).slice(11, 19) : "—"}</span>
                    {" · "}
                    {JSON.stringify(g).length > 8 ? JSON.stringify(g).slice(0, 220) : "—"}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
