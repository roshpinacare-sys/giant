"use client";

// giant · מסכי-המערכת: לדג'ר-האמת (טבלה-חיה) + ארכיון-התוכן (קטלוג→קורא-אמיתי)

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { MarkdownView } from "@/components/giant/markdown";

const heNum = new Intl.NumberFormat("he-IL");
const heTime = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function ErrorBox({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{message}</span>
        <Button size="lg" className="h-11" onClick={onRetry}>
          נסה שוב
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/* ============================== לדג'ר-האמת ============================== */

interface LedgerRow {
  date: string;
  agent: string;
  content: string;
  sha: string;
  artifacts: string;
  line: number;
}

const PAGE_SIZE = 25;

export function LedgerView() {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [openLine, setOpenLine] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/git/ledger", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; rows?: LedgerRow[]; total?: number; error?: string };
      if (!res.ok || !data.ok || !data.rows) throw new Error(data.error ?? "נכשלה-קריאת-הלדג'ר");
      setRows(data.rows);
      setTotal(data.total ?? data.rows.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאת-רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agents = useMemo(() => {
    if (!rows) return [];
    const set = new Map<string, number>();
    for (const r of rows) set.set(r.agent, (set.get(r.agent) ?? 0) + 1);
    return Array.from(set.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (agent) list = list.filter((r) => r.agent === agent);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.content.toLowerCase().includes(needle) ||
          r.artifacts.toLowerCase().includes(needle) ||
          r.sha.toLowerCase().includes(needle) ||
          r.agent.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, agent, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [q, agent]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-14 rounded-lg" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }
  if (error || !rows) {
    return <ErrorBox title="טעינת-הלדג'ר נכשלה" message={error ?? ""} onRetry={() => void load()} />;
  }

  // סיכום-חי — נגזר-מהשורות-עצמן (אמת-בלבד)
  const maxAgentCount = agents.length > 0 ? agents[0][1] : 0;
  const firstDate = rows.length > 0 ? rows[rows.length - 1].date : null;
  const lastDate = rows.length > 0 ? rows[0].date : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">לדג'ר-האמת</h2>
          <p className="text-sm text-muted-foreground">
            {heNum.format(total)} רישומי-משמרת · פורמט-חוקי: תאריך | סוכן | תוכן | SHA | ארטיפקטים
          </p>
        </div>
        <Button variant="outline" size="lg" className="h-11" onClick={() => void load()} aria-label="רענון-הלדג'ר">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          רענון
        </Button>
      </div>

      {/* סיכום-חי: תרומת-כל-סוכן — נגזר-מהשורות-עצמן */}
      <section aria-label="סיכום-הלדג'ר" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">סך-רישומים</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {heNum.format(total)}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
            {firstDate && lastDate ? `${firstDate} ← ${lastDate}` : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">סוכנים-רושמים</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{heNum.format(agents.length)}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">כל-רישום-עם-SHA-וארטיפקטים</div>
        </Card>
        {agents.slice(0, 2).map(([a, n]) => (
          <Card key={a} className="p-4">
            <div className="truncate text-xs text-muted-foreground font-mono" dir="ltr">{a}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{heNum.format(n)}</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${maxAgentCount > 0 ? Math.max(8, (n / maxAgentCount) * 100) : 0}%` }}
                aria-hidden="true"
              />
            </div>
          </Card>
        ))}
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש-חופשי בתוכן, SHA, ארטיפקטים…"
            aria-label="חיפוש-בלדג'ר"
            className="h-11 ps-9"
          />
        </div>
        <Button
          variant={agent === null ? "default" : "outline"}
          size="lg"
          className="h-11"
          onClick={() => setAgent(null)}
        >
          הכל ({heNum.format(total)})
        </Button>
        {agents.slice(0, 6).map(([a, n]) => (
          <Button
            key={a}
            variant={agent === a ? "default" : "outline"}
            size="lg"
            className="h-11 max-w-52 truncate font-mono text-xs"
            onClick={() => setAgent(agent === a ? null : a)}
          >
            {a} ({n})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-4">
          <p className="py-10 text-center text-sm text-muted-foreground">אין-תוצאות לחיפוש.</p>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-start text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 text-start font-semibold">תאריך</th>
                    <th className="px-3 py-2.5 text-start font-semibold">סוכן</th>
                    <th className="px-3 py-2.5 text-start font-semibold">תוכן-הרישום</th>
                    <th className="px-3 py-2.5 text-start font-semibold">SHA</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.line}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                      onClick={() => setOpenLine(openLine === r.line ? null : r.line)}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{r.date}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{r.agent}</code>
                      </td>
                      <td className={cn("px-3 py-2.5 leading-relaxed", openLine !== r.line && "line-clamp-2")}>
                        {r.content}
                        {openLine === r.line && (
                          <div className="mt-2 rounded-md bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-semibold">ארטיפקטים:</span> {r.artifacts}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">שורה {heNum.format(r.line)} בלדג'ר</p>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <code className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">{r.sha}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {heNum.format(filtered.length)} תוצאות · עמוד {page + 1}/{pageCount}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="lg" className="h-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="עמוד-קודם">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                קודם
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                aria-label="עמוד-הבא"
              >
                הבא
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== ארכיון-התוכן ============================== */

interface CatalogFile {
  repo: string;
  path: string;
  title: string;
  size: number;
  updated: string;
  exists: boolean;
}

interface CatalogSection {
  id: string;
  title: string;
  description: string;
  files: CatalogFile[];
}

interface ContentResult {
  ok: boolean;
  repo: string;
  path: string;
  kind: "markdown" | "json" | "jsonl" | "text";
  content: string;
  truncated: boolean;
  error?: string;
}

export function ArchiveView({ initialSectionId }: { initialSectionId?: string }) {
  const [sections, setSections] = useState<CatalogSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState(initialSectionId ?? null);
  const [selected, setSelected] = useState<CatalogFile | null>(null);
  const [content, setContent] = useState<ContentResult | null>(null);
  const [reading, setReading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/git/catalog", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; sections?: CatalogSection[]; error?: string };
      if (!res.ok || !data.ok || !data.sections) throw new Error(data.error ?? "נכשלה-טעינת-הקטלוג");
      setSections(data.sections);
      setError(null);
      if (!sectionId && data.sections.length > 0) setSectionId(data.sections[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאת-רשת");
    }
  }, [sectionId]);

  useEffect(() => {
    void load();
  }, []);

  const read = useCallback(async (file: CatalogFile) => {
    setSelected(file);
    setReading(true);
    setContent(null);
    try {
      const res = await fetch(
        `/api/git/content?repo=${encodeURIComponent(file.repo)}&path=${encodeURIComponent(file.path)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as ContentResult;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "נכשלה-קריאת-הקובץ");
      setContent(data);
    } catch (err) {
      setContent({
        ok: false,
        repo: file.repo,
        path: file.path,
        kind: "text",
        content: err instanceof Error ? err.message : "שגיאת-רשת",
        truncated: false,
      });
    } finally {
      setReading(false);
    }
  }, []);

  if (error) {
    return <ErrorBox title="טעינת-הקטלוג נכשלה" message={error} onRetry={() => void load()} />;
  }
  if (!sections) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-72 rounded-full" />
        <div className="grid gap-3 md:grid-cols-[280px_1fr]">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  const section = sections.find((s) => s.id === sectionId) ?? sections[0];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">ארכיון-המערכת · קורא-אמיתי</h2>
        <p className="text-sm text-muted-foreground">
          התוכן-הטוב-מכל-התיקיות — {heNum.format(sections.reduce((n, s) => n + s.files.length, 0))} מסמכים
          מ-{heNum.format(sections.length)} מחלקות, נקרא-חי-מהגיט בכל-פתיחה.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="מחלקות-הארכיון">
        {sections.map((s) => (
          <Button
            key={s.id}
            variant={s.id === section?.id ? "default" : "outline"}
            size="lg"
            className="h-11 shrink-0"
            role="tab"
            aria-selected={s.id === section?.id}
            onClick={() => {
              setSectionId(s.id);
              setSelected(null);
              setContent(null);
            }}
          >
            {s.title}
            <Badge variant="secondary" className="ms-1 px-1.5 tabular-nums">
              {s.files.length}
            </Badge>
          </Button>
        ))}
      </div>

      {section && (
        <p className="text-sm text-muted-foreground">{section.description}</p>
      )}

      <div className="grid gap-3 md:grid-cols-[300px_1fr]">
        <Card className="h-fit md:sticky md:top-4">
          <CardContent className="max-h-[62vh] overflow-y-auto p-2">
            {section?.files.map((f) => (
              <button
                key={`${f.repo}:${f.path}`}
                className={cn(
                  "mb-1 flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-start transition-colors hover:bg-muted/60",
                  selected?.path === f.path && selected?.repo === f.repo && "bg-emerald-600/10",
                )}
                onClick={() => void read(f)}
                aria-label={`פתח: ${f.title}`}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.title}</span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" dir="ltr">
                    {f.repo}/{f.path}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtSize(f.size)}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-h-[50vh]">
          <CardContent className="p-4">
            {!selected ? (
              <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileText className="h-8 w-8" aria-hidden="true" />
                <p className="text-sm">בחר מסמך מהרשימה — התוכן-המלא ייקרא חי מהגיט.</p>
              </div>
            ) : reading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : content?.ok ? (
              <div className="min-w-0">
                <div className="mb-4 flex items-center gap-2 flex-wrap border-b pb-3">
                  <h3 className="font-bold">{selected.title}</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {content.repo}/{content.path}
                  </Badge>
                  {content.truncated && (
                    <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-600">
                      קטוע-בתקרה
                    </Badge>
                  )}
                </div>
                {content.kind === "markdown" ? (
                  <MarkdownView content={content.content} />
                ) : content.kind === "jsonl" ? (
                  <div className="space-y-2">
                    {content.content
                      .split("\n")
                      .filter((l) => l.trim())
                      .map((line, i) => {
                        let entry: Record<string, unknown> = {};
                        try {
                          entry = JSON.parse(line) as Record<string, unknown>;
                        } catch {
                          entry = { raw: line };
                        }
                        const ts = String(entry.ts ?? entry.at ?? "");
                        const role = String(entry.role ?? entry.source ?? entry.agent ?? "");
                        const text = String(entry.summary ?? entry.text ?? entry.raw ?? line).slice(0, 600);
                        return (
                          <div key={i} className="rounded-md border bg-muted/30 p-3 text-xs">
                            <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                              {role && <Badge variant="outline" className="px-1 py-0 text-[10px]">{role}</Badge>}
                              {ts && <span className="tabular-nums">{ts}</span>}
                            </div>
                            <p className="mt-1 leading-relaxed whitespace-pre-wrap">{text}</p>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <pre
                    className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed"
                    dir="ltr"
                  >
                    {content.content}
                  </pre>
                )}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{content?.content ?? "—"}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function LoadingDot() {
  return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
}

export { heTime };
