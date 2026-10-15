// giant · מרכז-ההפעלה — חיבור-הריבונות להפעלה-מלאה-מכל-תיקיות-הגיט
// הבעלים (trace 1a13ca3f1160b6d1): "מחברים את הריבונות להפעלה מלאה מכל תיקיות הגיט"
//   · "יש לנו הרבה יותר מ-6 סוכנים" · "המון חומר אבל כלום לא מחובר — מוודאים חיבור".
// כל-מספר-כאן נמדד-חי: גילוי-דיסק (estate/state) + מפקד-git (fleet/roster). אפס-סימולציה.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronUp,
  CircleDot,
  GitBranch,
  Landmark,
  Loader2,
  Network,
  Orbit,
  Radio,
  ShieldCheck,
  User,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const heNum = new Intl.NumberFormat("he-IL");

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return heNum.format(Math.round(n * 100) / 100);
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* ------------------------------- טיפוסים ------------------------------- */

interface GitMeta {
  remote: string | null;
  branch: string | null;
  headHash: string | null;
  headShort: string | null;
  headSubject: string | null;
  lastCommitAt: string | null;
  commitCount: number;
  authors: Array<{ name: string; commits: number }>;
  authorCount: number;
  error: string | null;
}

interface EstateRepo {
  name: string;
  dir: string;
  role: string;
  status: string;
  what: string;
  disk: { exists: boolean; files: number; bytes: number; lastModified: string | null; truncated: boolean };
  generation: "system" | "live" | "archive";
  git: GitMeta | null;
}

interface EstateState {
  ok: boolean;
  measuredAt: string;
  repos: EstateRepo[];
  generations: { system: number; live: number; archive: number };
  gitFoldersTotal: number;
  commitCount: number;
  error?: string;
}

interface RosterEntry {
  name: string;
  family: "owner" | "zai" | "organ" | "automation";
  commits: number;
  repos: string[];
  fleet?: {
    active: boolean;
    allocationUsds: number;
    balanceUsds: number;
    vol24h: number;
    trades24h: number;
  };
}

interface RosterState {
  ok: boolean;
  measuredAt: string;
  reposScanned: number;
  commitsTotal: number;
  identitiesTotal: number;
  families: {
    owner: { label: string; count: number; top: RosterEntry[] };
    zai: { label: string; count: number; top: RosterEntry[] };
    organ: { label: string; count: number; top: RosterEntry[] };
    automation: { label: string; count: number; top: RosterEntry[] };
  };
  error?: string;
}

const GEN_LABEL: Record<EstateRepo["generation"], { label: string; cls: string }> = {
  system: { label: "המערכת", cls: "bg-emerald-500/15 text-emerald-300" },
  live: { label: "דור-חי", cls: "bg-emerald-500/10 text-emerald-300" },
  archive: { label: "דור-קודם", cls: "bg-zinc-500/15 text-zinc-400" },
};

const FAMILY_ICON = {
  owner: User,
  zai: Bot,
  organ: Landmark,
  automation: Workflow,
} as const;

export interface OpsViewProps {
  onNavigate?: (view: string) => void;
}

export function OpsView({ onNavigate }: OpsViewProps) {
  const [estate, setEstate] = useState<EstateState | null>(null);
  const [roster, setRoster] = useState<RosterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [estateRes, rosterRes] = await Promise.all([
        fetch("/api/estate/state", { cache: "no-store" }),
        fetch("/api/fleet/roster", { cache: "no-store" }),
      ]);
      const estateData = (await estateRes.json()) as EstateState;
      if (!estateRes.ok || !estateData.ok) {
        throw new Error(estateData.error ?? "נכשל-גילוי-תיקיות-הגיט");
      }
      setEstate(estateData);
      if (rosterRes.ok) {
        setRoster((await rosterRes.json()) as RosterState);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאת-רשת");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="טוען את מרכז-ההפעלה">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !estate) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-6 text-center">
        <p className="text-sm text-red-300">{error ?? "הגילוי-נכשל"}</p>
        <Button size="lg" className="mt-4 h-11 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void load()}>
          נסה שוב
        </Button>
      </div>
    );
  }

  const liveRepos = estate.repos.filter((r) => r.generation !== "archive");
  const archiveRepos = estate.repos.filter((r) => r.generation === "archive");
  const liveFiles = liveRepos.reduce((s, r) => s + r.disk.files, 0);
  const liveBytes = liveRepos.reduce((s, r) => s + r.disk.bytes, 0);
  const identities = roster?.identitiesTotal ?? null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ======== הרואה: מרכז-ההפעלה ======== */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/70 via-[#0c1412] to-[#0a0e0d] p-5 sm:p-7"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -start-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-amber-300 text-emerald-950 shadow-lg shadow-emerald-500/20"
                aria-hidden="true"
              >
                <Orbit className="h-5 w-5" />
              </span>
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">מרכז-ההפעלה</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                מחובר-חי
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              הריבונות מחוברת-להפעלה-מלאה מכל-תיקיות-הגיט:{" "}
              <span className="font-bold text-white">{fmtNum(estate.gitFoldersTotal)} תיקיות-גיט</span>{" "}
              נסרקות-חי בכל-ביקור, {" "}
              <span className="font-bold text-white">
                {identities != null ? `${fmtNum(identities)} זהויות-עבודה` : "מפקד-זהויות"}
              </span>{" "}
              מgit-אמת — לא עוד חומר-מפוזר, אלא מערכת-אחת-מחוברת.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            {estate.repos.find((r) => r.generation === "system")?.git?.headShort && (
              <span className="max-w-full truncate rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400" dir="ltr">
                <GitBranch className="me-1.5 inline h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {estate.repos.find((r) => r.generation === "system")?.git?.headShort}
              </span>
            )}
            <span className="text-[11px] text-zinc-500 tabular-nums">
              נמדד: {fmtTime(estate.measuredAt)}
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "merge", label: "למיזוג", icon: Network },
                { id: "dex", label: "לבורסה", icon: CircleDot },
                { id: "estate", label: "למפת-האמת", icon: Landmark },
              ].map((b) => (
                <Button
                  key={b.id}
                  size="sm"
                  variant="outline"
                  className="h-9 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                  onClick={() => onNavigate?.(b.id)}
                >
                  <b.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {b.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ======== פס-הגילוי ======== */}
      <section aria-label="פס-הגילוי">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "תיקיות-גיט-נסרקות", num: estate.gitFoldersTotal, sub: `${estate.generations.live} דור-חי · ${estate.generations.archive} דור-קודם` },
            { label: "קומיטים-בהיסטוריה", num: estate.commitCount, sub: "ספירת-git-אמת מכל-הריפו-ים" },
            { label: "זהויות-עבודה", num: identities, sub: roster ? "מgit-log אמת · יותר-מ-6-סוכנים" : "המפקד-אינו-זמין" },
            { label: "הדור-החי-נמדד", num: liveFiles, sub: `קבצים · ${fmtBytes(liveBytes)}` },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
              className="card-lift rounded-xl border border-white/5 bg-[#0b100f] p-3.5 hover:border-emerald-500/30"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Orbit className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {s.label}
              </div>
              <div className="mt-1.5 text-xl font-bold tabular-nums leading-tight text-white sm:text-2xl">
                {s.num != null ? fmtNum(s.num) : "—"}
              </div>
              <div className="mt-1 truncate text-[10px] text-zinc-500">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ======== מפקד-הסוכנים-האמיתי ======== */}
      <section aria-label="מפקד-הסוכנים">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Bot className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            הסוכנים-האמיתיים · מפקד-git-מלא (הרבה-יותר-מ-6)
          </h3>
          {roster && (
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {fmtNum(roster.commitsTotal)} קומיטים ב-{fmtNum(roster.reposScanned)} ריפו-ים
            </span>
          )}
        </div>
        {!roster ? (
          <div className="rounded-xl border border-white/5 bg-[#0b100f] p-6 text-center text-sm text-zinc-500">
            מפקד-הסוכנים-אינו-זמין-כרגע — מדווח-כנה, בלי-המצאה.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(["owner", "zai", "organ", "automation"] as const).map((fam, i) => {
                const data = roster.families[fam];
                const Icon = FAMILY_ICON[fam];
                return (
                  <motion.div
                    key={fam}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
                    className="card-lift rounded-xl border border-white/5 bg-[#0b100f] p-4 hover:border-emerald-500/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <Icon className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        {data.label}
                      </span>
                    </div>
                    <div className="mt-1.5 text-2xl font-black tabular-nums text-white">{fmtNum(data.count)}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">זהויות-git אמת</div>
                  </motion.div>
                );
              })}
            </div>

            {/* סוכני-Z.ai — המפקדה-המלאה */}
            <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-[#0b100f] p-4">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                  <Radio className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  משפחת-Z.ai · {fmtNum(roster.families.zai.count)} סוכנים-בהיסטוריית-הגיט
                </h4>
                <span className="text-[10px] text-zinc-500">עם-תג-צי = תקציב-ונפח-אמת-מהלדג'ר</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {roster.families.zai.top.map((a, i) => (
                  <motion.div
                    key={a.name}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.4), ease: "easeOut" }}
                    className="card-lift rounded-xl border border-white/5 bg-[#0e1413] p-3 hover:border-emerald-500/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-bold text-white" dir="ltr">
                        {a.name}
                      </span>
                      {a.fleet && (
                        <Badge className={cn("shrink-0 gap-1 px-1.5 py-0 text-[9px]", a.fleet.active ? "bg-emerald-600 text-white" : "bg-zinc-700 text-zinc-300")}>
                          צי-{a.fleet.active ? "פעיל" : "מושהה"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] tabular-nums text-zinc-400">
                      <span>
                        <span className="font-bold text-emerald-300">{fmtNum(a.commits)}</span> קומיטים
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className="truncate">{a.repos.length} ריפו-ים</span>
                    </div>
                    {a.fleet && (
                      <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-zinc-500">
                        <span>תקציב: <span className="font-semibold text-zinc-200">{fmtNum(a.fleet.allocationUsds)}</span></span>
                        <span>יתרה: <span className="font-semibold text-zinc-200">{fmtNum(a.fleet.balanceUsds)}</span></span>
                        <span>נפח-24h: <span className="font-semibold text-emerald-400">{fmtNum(a.fleet.vol24h)}</span></span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
              {roster.families.zai.count > roster.families.zai.top.length && (
                <p className="mt-2 text-[10px] text-zinc-600">
                  מוצגים {roster.families.zai.top.length} מתוך {roster.families.zai.count} — המפקד-המלא-חי-ב-API.
                </p>
              )}
            </div>

            {/* איברים-ואוטומציה — שורות-תמצית */}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(["organ", "automation"] as const).map((fam) => {
                const data = roster.families[fam];
                const Icon = FAMILY_ICON[fam];
                return (
                  <div key={fam} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                      <Icon className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      {data.label} · {fmtNum(data.count)}
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {data.top.map((a) => (
                        <span
                          key={a.name}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-[#0b100f] px-2 py-0.5 text-[10px] text-zinc-300"
                          dir="ltr"
                        >
                          <span className="truncate font-mono">{a.name}</span>
                          <span className="shrink-0 tabular-nums text-emerald-400/80">{fmtNum(a.commits)}</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-600">
                      איברי-הריבונות-והאוטומציה הם-הידיים-השוטפות: מדידות, שערים, הגנות, קצבים — הכל-רשום-בגיט.
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ======== כל-תיקיות-הגיט ======== */}
      <section aria-label="כל-תיקיות-הגיט">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <GitBranch className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            כל-תיקיות-הגיט · נסרקות-חי בכל-ביקור
          </h3>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {fmtNum(estate.gitFoldersTotal)} תיקיות · {fmtNum(estate.commitCount)} קומיטים
          </span>
        </div>
        <div className="space-y-1.5">
          {liveRepos.map((r, i) => (
            <RepoRow key={r.dir} repo={r} index={i} />
          ))}
        </div>

        {/* דור-קודם — מקופל-כברירת-מחדל */}
        <div className="mt-2 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
          <button
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/[0.03]"
            onClick={() => setArchiveOpen((v) => !v)}
            aria-expanded={archiveOpen}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Archive className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="truncate text-sm font-bold text-zinc-200">
                הדור-הקודם (t35) · עדות-הישרדות — "סנדבוקס-שנמחק שעוזב"
              </span>
              <Badge className="shrink-0 bg-zinc-500/15 text-zinc-400">{archiveRepos.length}</Badge>
            </span>
            <span className="shrink-0 text-[11px] text-zinc-500">
              {archiveOpen ? "מוצג" : "מקופל"}
              {archiveOpen ? <ChevronUp className="ms-1 inline h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="ms-1 inline h-3.5 w-3.5" aria-hidden="true" />}
            </span>
          </button>
          {archiveOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="space-y-1.5 border-t border-white/5 p-3">
                {archiveRepos.map((r, i) => (
                  <RepoRow key={r.dir} repo={r} index={i} dim />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ======== מפת-החיבורים ======== */}
      <section aria-label="מפת-החיבורים" className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Workflow className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          מפת-החיבורים · מה-כל-ריפו-מזין-למערכת-ומי-עובד-עליו
        </h3>
        <p className="mb-2.5 text-[11px] text-zinc-500">
          לא עוד חומר-מפוזר: כל-תיקייה-מחוברת-לתפקיד-המוצהר-שלה ולעובדים-האמיתיים-עליה (מgit-אמת).
        </p>
        <div className="space-y-1.5">
          {liveRepos.map((r) => {
            const top = r.git?.authors.slice(0, 3) ?? [];
            return (
              <div key={`map-${r.dir}`} className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#0b100f] px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{r.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{r.what}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
                  {top.map((a) => (
                    <span key={a.name} className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[9px] text-zinc-400" dir="ltr">
                      {a.name.length > 18 ? `${a.name.slice(0, 17)}…` : a.name}
                    </span>
                  ))}
                </span>
                <span className="shrink-0 text-end text-[10px] tabular-nums text-zinc-500" dir="ltr">
                  {r.git ? `${fmtNum(r.git.commitCount)} commits` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* סרגל-אמת-תחתון */}
      <p className="flex items-center gap-1.5 px-1 text-[10px] text-zinc-600">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        חוק-המסך: כל-תיקייה-וכל-זהות נמדדות-חי-מהדיסק-ומgit-log — נמדד-אחרון {fmtTime(estate.measuredAt)}
        {refreshing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      </p>
    </div>
  );
}

/* ------------------------------- שורת-ריפו ------------------------------- */

function RepoRow({ repo, index, dim = false }: { repo: EstateRepo; index: number; dim?: boolean }) {
  const gen = GEN_LABEL[repo.generation];
  const git = repo.git;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3), ease: "easeOut" }}
      className={cn(
        "card-lift rounded-xl border p-3",
        dim ? "border-white/5 bg-[#0b100f]/60" : "border-white/5 bg-[#0b100f] hover:border-emerald-500/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-sm font-bold text-white">{repo.name}</span>
        <Badge className={cn("shrink-0 px-1.5 py-0 text-[10px]", gen.cls)}>{gen.label}</Badge>
        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-zinc-500">
          {repo.role}
        </Badge>
        {git?.remote && (
          <Badge variant="outline" className="hidden max-w-[220px] shrink-0 truncate font-mono text-[9px] text-zinc-600 sm:inline-flex" dir="ltr">
            {git.remote.replace("https://", "").replace("git@github.com:", "github:")}
          </Badge>
        )}
        {git?.error && (
          <Badge variant="outline" className="shrink-0 border-red-500/30 px-1.5 py-0 text-[9px] text-red-300">
            git-שגיאה
          </Badge>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] text-zinc-500">{repo.what}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tabular-nums text-zinc-500">
        <span dir="ltr">
          {git?.headShort ? (
            <>
              <GitBranch className="me-1 inline h-3 w-3" aria-hidden="true" />
              {git.headShort}
              {git.headSubject ? <span className="text-zinc-600"> · {git.headSubject.slice(0, 50)}</span> : null}
            </>
          ) : (
            "אין-גיט"
          )}
        </span>
        <span>
          <span className="font-semibold text-zinc-300">{fmtNum(git?.commitCount ?? 0)}</span> commits
        </span>
        <span>
          <span className="font-semibold text-emerald-400/90">{fmtNum(git?.authorCount ?? 0)}</span> עובדים
        </span>
        <span>
          <span className="font-semibold text-zinc-300">{fmtNum(repo.disk.files)}</span> files · {fmtBytes(repo.disk.bytes)}
        </span>
        {repo.disk.truncated && <span className="text-amber-400/80">מדידה-מוגבלת</span>}
        <span className="text-zinc-600">קומיט-אחרון: {fmtTime(git?.lastCommitAt ?? null)}</span>
      </div>
    </motion.div>
  );
}
