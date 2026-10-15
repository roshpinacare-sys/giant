"use client";

// giant · מסך-המיזוג-הגדול — הדגל: מערכת-אחת · חמישה-סוכנים · חוק-אמת-אחד
// הכל-חי: מדידות-דיסק אמת, לדג'ר, צי, וההסכם-נקרא-חי-מהגיט-בכל-פתיחה.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  GitBranch,
  Landmark,
  Loader2,
  MessagesSquare,
  Network,
  Orbit,
  Palette,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownView } from "@/components/giant/markdown";
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

/* count-up (60fps.design לקח: המספרים-האמיתיים-הם-העיצוב — והם-נכנסים-חיים) */
function useCountUp(target: number, durationMs = 900): number {
  const [val, setVal] = useState(() => (Number.isFinite(target) ? 0 : target));
  useEffect(() => {
    if (!Number.isFinite(target)) return; // ערך-לא-מספרי: המסך-יציג "—" דרך-fmtNum
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

function AnimatedNumber({ value, suffix }: { value: number; suffix?: string }) {
  const v = useCountUp(value);
  return (
    <span className="tabular-nums">
      {fmtNum(v)}
      {suffix ? (
        <span className="ms-1 text-[0.6em] font-semibold text-zinc-400">{suffix}</span>
      ) : null}
    </span>
  );
}

/* ------------------------------- טיפוסים ------------------------------- */

interface EstateRepo {
  name: string;
  role: string;
  status: "system" | "source" | "mirror" | "archive" | "infra" | "charter";
  what: string;
  disk: { exists: boolean; files: number; bytes: number; lastModified: string | null; truncated: boolean };
}

interface EstateState {
  ok: boolean;
  measuredAt: string;
  head: string | null;
  repos: EstateRepo[];
  live: {
    saosIssued: number;
    saosCap: number;
    saosUnissued: number;
    pairs: number;
    trades24h: number;
    vol24h: number;
    fleetAgents: number;
    fleetActive: number;
    ledgerRows: number;
    messages: number;
  };
  error?: string;
}

interface FleetAgentRow {
  agentId: string;
  name: string;
  active: boolean;
  allocationUsds: number;
  balanceUsds: number;
  vol24h: number;
  trades24h: number;
  lastTradeAt: string | null;
}

interface FleetState {
  fleetVol24h: number;
  fleetTrades24h: number;
  totalAllocated: number;
  agents: FleetAgentRow[];
}

// חוק-המסך (משימה-51): אפס-טענות-סוכנים-קשיחות.
// "הטוב-שהביא-כל-אחד" מוצג-כטענה→הוכחה-נמדדת-חיה מ-/api/merge/truth
// (דיסק · grep · DB · git-log) — וכל-הוכחה מקשרת-למסך-החי-שבו-הדבר-באמת-חי.

interface LawRow { n: number; name: string; body: string }
interface LaneProof { metric: string; value: string; how: string; ok: boolean }
interface Lane { id: string; lane: string; who: string; claim: string; view: string; proofs: LaneProof[]; ok: boolean }
interface Identity { name: string; commits: number; repos: string[] }

interface TruthState {
  ok: boolean;
  measuredAt: string;
  agreement: { ok: boolean; repo: string; path: string };
  laws: LawRow[];
  identities: Identity[];
  lanes: Lane[];
}

const STATUS_LABEL: Record<EstateRepo["status"], { label: string; cls: string }> = {
  system: { label: "המערכת", cls: "bg-emerald-500/15 text-emerald-400" },
  source: { label: "מקור-אמת", cls: "bg-amber-500/15 text-amber-400" },
  mirror: { label: "מראה-בלבד", cls: "bg-zinc-500/15 text-zinc-400" },
  archive: { label: "ארכיון", cls: "bg-zinc-500/15 text-zinc-400" },
  infra: { label: "תשתית", cls: "bg-cyan-500/10 text-cyan-300" },
  charter: { label: "אמנות", cls: "bg-violet-500/10 text-violet-300" },
};

export interface MergeViewProps {
  onNavigate?: (view: string) => void;
}

export function MergeView({ onNavigate }: MergeViewProps) {
  const [estate, setEstate] = useState<EstateState | null>(null);
  const [fleet, setFleet] = useState<FleetState | null>(null);
  const [truth, setTruth] = useState<TruthState | null>(null);
  const [agreement, setAgreement] = useState<string | null>(null);
  const [agreeMeta, setAgreeMeta] = useState<{ repo: string; path: string } | null>(null);
  const [designSrc, setDesignSrc] = useState<string | null>(null);
  const [designMeta, setDesignMeta] = useState<{ repo: string; path: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [estateRes, fleetRes, agreeRes, designRes, truthRes] = await Promise.all([
        fetch("/api/estate/state", { cache: "no-store" }),
        fetch("/api/fleet/state", { cache: "no-store" }),
        fetch(
          "/api/git/content?repo=Sandbox&path=giant%2FMERGE-AGREEMENT.md",
          { cache: "no-store" },
        ),
        fetch(
          "/api/git/content?repo=Sandbox&path=giant%2FDESIGN-SOURCES.md",
          { cache: "no-store" },
        ),
        fetch("/api/merge/truth", { cache: "no-store" }),
      ]);
      const estateData = (await estateRes.json()) as EstateState;
      if (!estateRes.ok || !estateData.ok) {
        throw new Error(estateData.error ?? "נכשלה-מדידת-האחוזה");
      }
      setEstate(estateData);
      if (fleetRes.ok) {
        setFleet((await fleetRes.json()) as FleetState);
      }
      if (agreeRes.ok) {
        const a = (await agreeRes.json()) as {
          ok: boolean;
          content?: string;
          repo?: string;
          path?: string;
        };
        if (a.ok && a.content) {
          setAgreement(a.content);
          setAgreeMeta({ repo: a.repo ?? "Sandbox", path: a.path ?? "giant/MERGE-AGREEMENT.md" });
        }
      }
      if (designRes.ok) {
        const d = (await designRes.json()) as {
          ok: boolean;
          content?: string;
          repo?: string;
          path?: string;
        };
        if (d.ok && d.content) {
          setDesignSrc(d.content);
          setDesignMeta({ repo: d.repo ?? "Sandbox", path: d.path ?? "giant/DESIGN-SOURCES.md" });
        }
      }
      if (truthRes.ok) {
        const t = (await truthRes.json()) as TruthState;
        if (t.ok) setTruth(t);
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
      <div className="space-y-4" aria-busy="true" aria-label="טוען את מסך-המיזוג">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
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
        <p className="text-sm text-red-300">{error ?? "המדידה-נכשלה"}</p>
        <Button size="lg" className="mt-4 h-11 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void load()}>
          נסה שוב
        </Button>
      </div>
    );
  }

  const totalFiles = estate.repos.reduce((s, r) => s + r.disk.files, 0);
  const totalBytes = estate.repos.reduce((s, r) => s + r.disk.bytes, 0);
  const issuedPct = Math.min(100, (estate.live.saosIssued / estate.live.saosCap) * 100);

  const stats: Array<{
    label: string;
    num?: number;
    suffix?: string;
    str?: string;
    sub?: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      label: "SAOS מנופק",
      num: estate.live.saosIssued,
      sub: `מתוך ${fmtNum(estate.live.saosCap)} · ${issuedPct.toFixed(2)}%`,
      icon: Landmark,
    },
    {
      label: "נפח-24h אמת",
      num: estate.live.vol24h,
      suffix: "USDS",
      sub: `${fmtNum(estate.live.trades24h)} עסקאות אמת`,
      icon: TrendingUp,
    },
    {
      label: "הצי",
      str: `${fmtNum(estate.live.fleetActive)}/${fmtNum(estate.live.fleetAgents)}`,
      sub: fleet ? `${fmtNum(fleet.totalAllocated)} USDS תקציב-אמת` : undefined,
      icon: Bot,
    },
    {
      label: "לדג'ר-האמת",
      num: estate.live.ledgerRows,
      sub: "רישומי-משמרת",
      icon: ScrollText,
    },
    {
      label: "ערוץ-הריבון",
      num: estate.live.messages,
      sub: "הודעות-רשומות",
      icon: MessagesSquare,
    },
    {
      label: "האחוזה-נמדדה",
      num: totalFiles,
      sub: `קבצים · ${fmtBytes(totalBytes)} ב-${fmtNum(estate.repos.length)} ריפו-ים`,
      icon: Network,
    },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      {/* ======== הרואה: המיזוג הגדול ======== */}
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
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-amber-300 text-lg font-black text-emerald-950 shadow-lg shadow-emerald-500/20"
                aria-hidden="true"
              >
                G
              </span>
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
                המיזוג-הגדול
              </h2>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                מדידה-חיה
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              מערכת-אחת · זהויות-אמת-מ-git-log · חוק-אמת-אחד. הטוב-שהביא-כל-אחד-מוצג-כאן-רק-אם-הוא-נמדד —
              כל-טענה-עם-הוכחה-חיה, וכל-הוכחה-מקשרת-למסך-החי-שבו-הדבר-באמת-חי, לפי{" "}
              <button
                className="font-semibold text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 hover:text-emerald-200"
                onClick={() => setAgreeOpen(true)}
              >
                הסכם-המיזוג
              </button>
              .
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            {estate.head && (
              <span className="max-w-full truncate rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400" dir="ltr">
                <GitBranch className="me-1.5 inline h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {estate.head}
              </span>
            )}
            <span className="text-[11px] text-zinc-500 tabular-nums">
              נמדד: {fmtTime(estate.measuredAt)}
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "ops", label: "למרכז-ההפעלה", icon: Orbit },
                { id: "skills", label: "למרכז-היכולות", icon: Sparkles },
                { id: "dex", label: "לבורסה", icon: TrendingUp },
                { id: "estate", label: "למפת-האמת", icon: Network },
                { id: "ledger", label: "ללדג'ר", icon: ScrollText },
                { id: "channel", label: "לערוץ", icon: MessagesSquare },
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

      {/* ======== פס-המדידות-החי ======== */}
      <section aria-label="מדידות-חיות">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
              className="card-lift rounded-xl border border-white/5 bg-[#0b100f] p-3.5 hover:border-emerald-500/30"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <s.icon className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {s.label}
              </div>
              <div className="mt-1.5 text-xl font-bold leading-tight text-white sm:text-2xl">
                {s.num != null ? <AnimatedNumber value={s.num} suffix={s.suffix} /> : s.str}
              </div>
              {s.sub && <div className="mt-1 truncate text-[10px] text-zinc-500">{s.sub}</div>}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ======== המיזוג-האמיתי · טענה→הוכחה-נמדדת ======== */}
      <section aria-label="המיזוג-האמיתי-הוכחות-נמדדות">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            המיזוג-האמיתי · כל-טענה-עם-הוכחה-נמדדת
          </h3>
          {truth ? (
            <span className="text-[11px] text-zinc-500 tabular-nums">
              נמדד: {fmtTime(truth.measuredAt)} · דיסק · grep · DB · git-log
            </span>
          ) : (
            <span className="text-[11px] text-amber-400/80">המדידה-טרם-זמינה — מדווח-בכנות, בלי-המצאה</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(truth?.lanes ?? []).map((lane, i) => {
            const allOk = lane.proofs.every((p) => p.ok);
            return (
              <motion.div
                key={lane.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
                className={cn(
                  "flex flex-col rounded-xl border bg-[#0b100f] p-4 transition-colors",
                  allOk ? "border-emerald-500/25 hover:border-emerald-500/40" : "border-amber-500/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{lane.lane}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{lane.claim}</div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      allOk ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400",
                    )}
                  >
                    {allOk ? "הוכח" : "חריגה"}
                  </span>
                </div>
                <ul className="mt-3 flex-1 space-y-2">
                  {lane.proofs.map((p) => (
                    <li key={p.metric} className="flex items-start gap-2 text-[11px]">
                      {p.ok ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="text-zinc-300">{p.metric}: </span>
                        <span className="font-semibold tabular-nums text-white" dir="ltr">{p.value}</span>
                        <span className="block truncate font-mono text-[9px] text-zinc-600" dir="ltr">{p.how}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  className="mt-3 h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                  variant="outline"
                  onClick={() => onNavigate?.(lane.view)}
                >
                  ראה-את-זה-חי במסך-האמת
                </Button>
              </motion.div>
            );
          })}
          {truth && truth.lanes.length === 0 && (
            <div className="col-span-full rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-5 text-center text-sm text-amber-300">
              אף-הוכחה-לא-נמדדה — לא-נציג-טענות-בלי-מדידה.
            </div>
          )}
        </div>
      </section>

      {/* ======== זהויות-העבודה-האמת · מgit-log ======== */}
      {truth && truth.identities.length > 0 && (
        <section aria-label="זהויות-העבודה-האמת" className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Users className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            זהויות-העבודה-האמת · מ-git-log-חי-על-פני-כל-תיקיות-הגיט
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {truth.identities.map((idn) => (
              <span
                key={idn.name}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px]"
              >
                <span className="truncate font-mono text-zinc-300" dir="ltr">{idn.name}</span>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 font-mono text-[10px] font-semibold text-emerald-400 tabular-nums" dir="ltr">
                  {fmtNum(idn.commits)}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">
            עוד-מה-12-המובילות — הרשימה-המלאה-חיה-במרכז-ההפעלה. אפס-רשימה-מקודדת: כל-זהות-נמדדה-מהיסטוריית-הקומיטים-בזמן-הקריאה.
          </p>
        </section>
      )}

      {/* ======== קונסטלציית-הסוכנים ======== */}
      <section aria-label="קונסטלציית-הסוכנים">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Bot className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            הצי-בשוק · מספרים-נמדדים-בלבד
          </h3>
          {fleet && (
            <span className="text-[11px] text-zinc-500 tabular-nums">
              נפח-צי-24h: {fmtNum(fleet.fleetVol24h)} USDS · {fmtNum(fleet.fleetTrades24h)} עסקאות
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {fleet?.agents.map((a, i) => {
            return (
              <motion.div
                key={a.agentId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
                className="rounded-xl border border-white/5 bg-[#0b100f] p-4 transition-colors hover:border-emerald-500/25"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 font-mono text-[10px] font-bold text-emerald-400" aria-hidden="true">
                      {a.agentId.slice(-2).toUpperCase()}
                    </span>
                    <span className="truncate font-mono text-sm font-bold text-white" dir="ltr">
                      {a.agentId}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-500">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        a.active ? "bg-emerald-400" : "bg-zinc-600",
                      )}
                      aria-hidden="true"
                    />
                    {a.active ? "פעיל" : "מושהה"}
                  </span>
                </div>
                <div className="mt-1.5 text-[11px] font-semibold text-emerald-300">חבר-צי · תקציב-אמת-מהקופה</div>
                <p className="mt-1 min-h-[3em] text-xs leading-relaxed text-zinc-400">
                  המספרים-למטה-נמדדים-מהלדג'ר-בזמן-אמת — אין-טענות-יכולת, רק-עובדות-מוצמדות-לזהות (חוק-11).
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-white/5 pt-2.5 text-[11px] tabular-nums">
                  <span className="text-zinc-500">
                    תקציב: <span className="font-semibold text-zinc-200">{fmtNum(a.allocationUsds)}</span>
                  </span>
                  <span className="text-zinc-500">
                    יתרה: <span className="font-semibold text-zinc-200">{fmtNum(a.balanceUsds)}</span>
                  </span>
                  <span className="text-zinc-500">
                    נפח-24h: <span className="font-semibold text-emerald-400">{fmtNum(a.vol24h)}</span>
                  </span>
                  <span className="text-zinc-500">
                    עסקאות: <span className="font-semibold text-zinc-200">{fmtNum(a.trades24h)}</span>
                  </span>
                </div>
                <div className="mt-1.5 text-[10px] text-zinc-600">
                  עסקה-אחרונה: {a.lastTradeAt ? fmtTime(a.lastTradeAt) : "—"}
                </div>
              </motion.div>
            );
          })}
          {!fleet && (
            <div className="col-span-full rounded-xl border border-white/5 bg-[#0b100f] p-6 text-center text-sm text-zinc-500">
              מצב-הצי-אינו-זמין-כרגע — מדווח-כנה, בלי-המצאה.
            </div>
          )}
        </div>
      </section>

      {/* ======== החוקים · נקראים-חי-מהסכם ======== */}
      <section aria-label="החוקים-מההסכם" className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <Landmark className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            החוקים · נקראים-חי-מהסכם-המיזוג (מקור-אחד-בלבד)
          </h3>
          {truth?.agreement.ok ? (
            <span className="font-mono text-[10px] text-zinc-500" dir="ltr">
              {truth.agreement.repo}/{truth.agreement.path}
            </span>
          ) : null}
        </div>
        {truth && truth.laws.length > 0 ? (
          <ol className="space-y-1.5">
            {truth.laws.map((law) => (
              <li
                key={law.n}
                className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-[#0b100f] px-3 py-2"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-[10px] font-bold text-emerald-400 tabular-nums">
                  {law.n}
                </span>
                <span className="min-w-0 text-xs leading-relaxed">
                  <span className="font-semibold text-emerald-300">{law.name}</span>
                  <span className="text-zinc-400"> — {law.body}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2.5 text-xs text-amber-300">
            ההסכם-לא-נמצא-בגיט — לא-נציג-חוקים-בלי-מקור-חי. כנות-עד-שהמקור-יחזור.
          </p>
        )}
        <p className="mt-2 text-[10px] text-zinc-600">
          הנוסח-המחייב — בהסכם-המיזוג-למטה, נקרא-חי-מהגיט-בכל-פתיחה; שינוי-נוסח-בגיט = שינוי-במסך.
        </p>
      </section>

      {/* ======== האחוזה-נמדדת-חי ======== */}
      <section aria-label="האחוזה-נמדדת" className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Network className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          האחוזה-במספרים · מדידת-דיסק-אמת (לא-סיפורים)
        </h3>
        <div className="space-y-1.5">
          {estate.repos.map((r) => {
            const s = STATUS_LABEL[r.status];
            return (
              <div
                key={r.dir}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#0b100f] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">{r.name}</span>
                    <Badge className={cn("shrink-0 px-1.5 py-0 text-[10px]", s.cls)}>{s.label}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">{r.role} · {r.what}</p>
                </div>
                <div className="shrink-0 text-end text-[11px] tabular-nums text-zinc-400" dir="ltr">
                  <div>
                    <span className="font-semibold text-zinc-200">{fmtNum(r.disk.files)}</span> files
                  </div>
                  <div>{fmtBytes(r.disk.bytes)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ======== הסכם-המיזוג · נקרא-חי-מהגיט ======== */}
      <section aria-label="הסכם-המיזוג" className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#0b100f]">
        <button
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start transition-colors hover:bg-white/[0.03]"
          onClick={() => setAgreeOpen((v) => !v)}
          aria-expanded={agreeOpen}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span className="truncate text-sm font-bold text-white">הסכם-המיזוג הגדול · חוזה-הצוות</span>
            {agreeMeta && (
              <Badge variant="outline" className="shrink-0 font-mono text-[10px] text-zinc-500" dir="ltr">
                git:{agreeMeta.repo}/{agreeMeta.path}
              </Badge>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
            {agreement ? "נקרא-חי-מהגיט" : "הקריאה-נכשלה"}
            {agreeOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
        </button>
        {agreeOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div
              className="max-h-[70vh] overflow-y-auto border-t border-white/5 px-4 py-2 text-zinc-300 [&_a]:text-emerald-300 [&_code]:text-emerald-300 [&_div.border]:border-white/10 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_hr]:border-white/10 [&_li]:text-zinc-300 [&_ol]:text-zinc-300 [&_p]:text-zinc-300 [&_strong]:text-white [&_table]:text-zinc-300 [&_td]:text-zinc-300 [&_th]:bg-white/5 [&_th]:text-zinc-200 [&_ul]:text-zinc-300"
              dir="rtl"
            >
              {agreement ? (
                <MarkdownView content={agreement} />
              ) : (
                <p className="py-6 text-center text-sm text-zinc-500">
                  קריאת-ההסכם-מהגיט-נכשלה — מדווח-כנה. ההסכם-עצמו-נחתם-בגיט-ושמור-ב-Sandbox/giant.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </section>

      {/* ======== מקורות-העיצוב · נשמרים-חי-מהגיט ("שומרים" — הוראת-הבעלים) ======== */}
      <section aria-label="מקורות-העיצוב" className="overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0b100f]">
        <button
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start transition-colors hover:bg-white/[0.03]"
          onClick={() => setDesignOpen((v) => !v)}
          aria-expanded={designOpen}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Palette className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <span className="truncate text-sm font-bold text-white">מקורות-העיצוב · עשרת-הרפרנסים של הבעלים</span>
            {designMeta && (
              <Badge variant="outline" className="shrink-0 font-mono text-[10px] text-zinc-500" dir="ltr">
                git:{designMeta.repo}/{designMeta.path}
              </Badge>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
            {designSrc ? "נשמר-בגיט · נקרא-חי" : "הקריאה-נכשלה"}
            {designOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
        </button>
        {designOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div
              className="max-h-[70vh] overflow-y-auto border-t border-white/5 px-4 py-2 text-zinc-300 [&_a]:text-emerald-300 [&_code]:text-emerald-300 [&_div.border]:border-white/10 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_hr]:border-white/10 [&_li]:text-zinc-300 [&_ol]:text-zinc-300 [&_p]:text-zinc-300 [&_strong]:text-white [&_table]:text-zinc-300 [&_td]:text-zinc-300 [&_th]:bg-white/5 [&_th]:text-zinc-200 [&_ul]:text-zinc-300"
              dir="rtl"
            >
              {designSrc ? (
                <MarkdownView content={designSrc} />
              ) : (
                <p className="py-6 text-center text-sm text-zinc-500">
                  קריאת-מסמך-מקורות-העיצוב-מהגיט-נכשלה — מדווח-כנה. המסמך-עצמו-נחתם-בגיט-ושמור-ב-Sandbox/giant.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </section>

      {/* סרגל-אמת-תחתון */}
      <p className="flex items-center gap-1.5 px-1 text-[10px] text-zinc-600">
        <ArrowDownUp className="h-3 w-3" aria-hidden="true" />
        חוק-המסך: כל-מספר-כאן נמדד-חי (דיסק · לדג'ר · DB) — נמדד-אחרון {fmtTime(estate.measuredAt)}
        {refreshing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      </p>
    </div>
  );
}
