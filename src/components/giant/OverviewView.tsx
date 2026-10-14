"use client";

/* ═══ Overview — סקירת-המערכת של GIANT (Task 1-a) ═══════════════════════════
 * התשובה-על-התלונה "יפה-אבל-לא-ברור-מה-אני-רואה":
 *  · סעיף-1 HERO — מה-זה GIANT: הריבונות · SAOS · הדקס · הצי · הגיט (5 שורות-עם-אייקון).
 *  · סעיף-2 מפה-חיה — איך-הכל-מתחבר: הבעלים → הערוץ → הריבונות → {דקס, גיט, משרד},
 *    כל-צומת-לחיץ, נקודת-LIVE לפי-גיל-הזרם-האמיתי (ירוק <15 ד׳ · ענבר <60 ד׳ · אפור מיושן/לא-נמדד).
 *  · סעיף-3 רצועת-מדדים — 6 מספרים-חיים (mu÷1000 = יחידות-אנוש).
 *  · סעיף-4 מסע-ההיכרות — 4 דלתות-מודרכות.
 * אפס-זיופים: כל-מספר מ-payload אמיתי (pulse/dex/organism/market); חסר = מוצהר-חסר. */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, Spotlight } from "@/components/giant/craft";
import {
  ArrowLeft,
  ArrowLeftRight,
  Bot,
  Coins,
  Crown,
  Gauge,
  GitBranch,
  Landmark,
  Radio,
  Users,
} from "lucide-react";

/* ─── טיפוסי-payload (מראה-אמת של-הראוטים; לא-המצאה) ─── */
interface FileMeta {
  exists?: boolean;
  bytes?: number | null;
  sha16?: string | null;
  ageMinutes?: number | null;
}
interface PulsePayload {
  truth?: { verdict?: string | null; pass?: number | null; fail?: number | null } | null;
  truthMeta?: FileMeta | null;
  streams?: Record<string, FileMeta> | null;
  channel?: { directives?: number | null; requestsCanonical?: number | null; notes?: number | null } | null;
}
interface DexPayload {
  savedAt?: string | null;
  height?: number | null;
  supply?: {
    totalSaosMu?: number | null;
    totalSaosHuman?: number | null;
    capSaosHuman?: number | null;
    genesisMintSaosHuman?: number | null;
    pctOfCap?: number | null;
  } | null;
  metrics?: Array<{ fills?: number | null }> | null;
  truth?: { realMoney?: { totalUsd?: number | null } | null } | null;
  truthMeta?: { saosLive?: FileMeta | null; honestEcon?: FileMeta | null } | null;
}
interface OrganismPayload {
  node?: { clones?: Array<Record<string, unknown>> | null } | null;
  office?: {
    state?: { connected?: boolean | null; agents?: number | null } | null;
    heartbeat?: { status?: string | null; lastTick?: string | null } | null;
  } | null;
  truth?: { integrity?: { overall?: string | null } | null } | null;
  growth?: { workOrders?: Array<{ status?: string | null }> | null } | null;
}
interface MarketPayload {
  source?: string | null;
  coins?: Array<{ symbol?: string; priceUsd?: number | null }> | null;
}

/* ─── עזרי-תצוגה ─── */
const PANEL = "rounded-2xl border border-white/[0.07] bg-white/[0.035] backdrop-blur-xl";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500";
const POLL_MS = 60_000;
const STYLE_ID = "giant-overview-flow";

const fmtInt = (n: number): string => n.toLocaleString("en-US");
const fmtBook = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const fmtUsd = (n: number): string => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function ageMinutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}

type Fresh = "green" | "amber" | "zinc";

/* חוק-הטריות: ירוק <15 ד׳ · ענבר <60 ד׳ · אפור = מיושן/לא-נמדד */
function freshOf(min: number | null | undefined): Fresh {
  if (min === null || min === undefined || !Number.isFinite(min)) return "zinc";
  if (min < 15) return "green";
  if (min < 60) return "amber";
  return "zinc";
}

const FRESH_DOT: Record<Fresh, string> = {
  green: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]",
  amber: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.75)]",
  zinc: "bg-zinc-600",
};

/* מפתח-התנועה מוזרק-פעם-אחת (לפי-מזהה — אידמפוטנטי); נוקה בפירוק.
 * כיוון-הזרימה: RTL — מהבעלים (ימין) אל-המערכת (שמאל), ומלמעלה-למטה בין-השורות. */
function useFlowStyle(): void {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.textContent = `
@keyframes giant-flow-x { from { right: 0; opacity: 0; } 12% { opacity: 1; } 85% { opacity: 1; } to { right: calc(100% - 6px); opacity: 0; } }
@keyframes giant-flow-y { from { top: -2px; opacity: 0; } 20% { opacity: 1; } 85% { opacity: 1; } to { top: calc(100% - 4px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .giant-flow-dot { animation: none !important; opacity: 0.45; } }`;
    document.head.appendChild(tag);
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);
}

/* מחבר-אופקי: קו-גרדיאנט עם נקודת-נתונים נעה ימין→שמאל (RTL) */
function HConnector({ className = "" }: { className?: string }): React.ReactElement {
  return (
    <div className={`relative h-px min-w-8 flex-1 bg-gradient-to-l from-amber-500/40 via-white/10 to-white/5 ${className}`}>
      <span
        className="giant-flow-dot absolute top-[-2.5px] h-1.5 w-1.5 rounded-full bg-amber-400/90 [animation:giant-flow-x_2.6s_linear_infinite]"
        aria-hidden
      />
    </div>
  );
}

/* מחבר-אנכי: קו-נשפך-למטה עם נקודת-נתונים (הורה → צאצא) */
function VConnector({ className = "", delay = 0 }: { className?: string; delay?: number }): React.ReactElement {
  return (
    <div className={`relative mx-auto h-5 w-px shrink-0 bg-gradient-to-b from-amber-500/40 to-white/10 ${className}`}>
      <span
        className="giant-flow-dot absolute -left-[2.5px] h-1.5 w-1.5 rounded-full bg-amber-400/90 [animation:giant-flow-y_2.2s_linear_infinite]"
        style={delay ? { animationDelay: `${delay}s` } : undefined}
        aria-hidden
      />
    </div>
  );
}

/* ─── צומת-מפה: כרטיס-זכוכית לחיץ עם נקודת-LIVE ─── */
function MapNode({
  icon,
  name,
  desc,
  meta,
  ageMin,
  onClick,
  youAreHere = false,
}: {
  icon: React.ReactNode;
  name: string;
  desc: string;
  meta?: React.ReactNode;
  ageMin: number | null;
  onClick: () => void;
  youAreHere?: boolean;
}): React.ReactElement {
  const fresh = freshOf(ageMin);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`עבור-אל: ${name}`}
      className={`group relative w-full max-w-xs cursor-pointer p-4 text-right transition ${PANEL} hover:border-amber-600/40 hover:bg-white/[0.05]`}
    >
      {youAreHere && (
        <span className="absolute -top-2 right-3 rounded-full border border-amber-600/40 bg-zinc-950 px-2 py-0.5 text-[9px] font-black text-amber-400">
          אתה-כאן
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-black text-zinc-100">
          <span className="text-amber-500">{icon}</span>
          {name}
        </span>
        <span
          className="flex shrink-0 items-center gap-1.5"
          title={fresh === "zinc" ? "זרם-מיושן או לא-נמדד — מוצהר-בכנות" : `גיל-הזרם: ${ageHe(ageMin)}`}
        >
          <span className={`h-2 w-2 rounded-full ${FRESH_DOT[fresh]} ${fresh !== "zinc" ? "animate-pulse" : ""}`} aria-hidden />
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">{ageHe(ageMin)}</span>
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-zinc-400">{desc}</p>
      {meta !== undefined && meta !== null && <div className="mt-1.5 text-[10px] leading-4 text-zinc-500">{meta}</div>}
    </button>
  );
}

/* ─── כרטיס-מדד: שלד-טעינה / ערך-אמיתי / "לא-נמדד" כנה · chip=תוכן-מותאם (שער-האמת)
 * T60: numeric=מונה-חי (CountUp) · Spotlight=זוהר-עוקב-מצביע · giant-spec=קו-עליון-ספקולרי ─── */
function KpiCard({
  label,
  value,
  numeric,
  chip,
  sub,
  failed,
}: {
  label: string;
  value: string | null;
  numeric?: { target: number; format: (n: number) => string };
  chip?: React.ReactNode;
  sub?: React.ReactNode;
  failed: boolean;
}): React.ReactElement {
  const body =
    chip !== undefined ? (
      chip
    ) : numeric !== undefined ? (
      <CountUp target={numeric.target} format={numeric.format} className="font-mono text-xl font-bold tabular-nums text-zinc-50" />
    ) : value !== null ? (
      <span className="font-mono text-xl font-bold tabular-nums text-zinc-50" dir="ltr">
        {value}
      </span>
    ) : failed ? (
      <span className="text-xs font-bold text-rose-400">לא-נמדד</span>
    ) : (
      <Skeleton className="h-7 w-24" />
    );
  return (
    <Spotlight className={`giant-spec p-5 transition hover:border-white/[0.12] ${PANEL}`}>
      <p className={LABEL}>{label}</p>
      <div className="mt-1.5 min-h-[30px]">
        {body}
      </div>
      {sub !== undefined && sub !== null && <p className="mt-1 text-[10px] leading-4 text-zinc-500">{sub}</p>}
    </Spotlight>
  );
}

/* ─── הרכיב ─── */
export function OverviewView({ onNavigate }: { onNavigate?: (viewId: string) => void }) {
  useFlowStyle();

  const [pulse, setPulse] = useState<PulsePayload | null>(null);
  const [dex, setDex] = useState<DexPayload | null>(null);
  const [org, setOrg] = useState<OrganismPayload | null>(null);
  const [mkt, setMkt] = useState<MarketPayload | null>(null);
  const [errs, setErrs] = useState<{ pulse: string | null; dex: string | null; org: string | null; mkt: string | null }>({
    pulse: null,
    dex: null,
    org: null,
    mkt: null,
  });

  /* דגימה-כל-דקה · AbortController לכל-בקשה · ניקוי-מלא בפירוק */
  useEffect(() => {
    const ctrls = new Set<AbortController>();
    let alive = true;
    const get = async <T,>(url: string, set: (v: T) => void, fail: (msg: string | null) => void): Promise<void> => {
      const ac = new AbortController();
      ctrls.add(ac);
      try {
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as T;
        if (!alive) return;
        set(d);
        fail(null);
      } catch (e) {
        if (!alive || (e instanceof Error && e.name === "AbortError")) return;
        fail(e instanceof Error ? e.message : "שגיאה");
      } finally {
        ctrls.delete(ac);
      }
    };
    const loadAll = (): void => {
      void get<PulsePayload>("/api/giant/pulse", setPulse, (m) => setErrs((p) => ({ ...p, pulse: m })));
      void get<DexPayload>("/api/giant/dex", setDex, (m) => setErrs((p) => ({ ...p, dex: m })));
      void get<OrganismPayload>("/api/organism", setOrg, (m) => setErrs((p) => ({ ...p, org: m })));
      void get<MarketPayload>("/api/giant/market", setMkt, (m) => setErrs((p) => ({ ...p, mkt: m })));
    };
    loadAll();
    const iv = setInterval(loadAll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
      ctrls.forEach((c) => c.abort());
    };
  }, []);

  /* ─── מספרים-חיים (כל-ערך מ-payload; mu÷1000 = יחידות-אנוש) ─── */
  const bookMu = dex?.supply?.totalSaosMu ?? null;
  const bookHuman =
    bookMu !== null ? bookMu / 1000 : dex?.supply?.totalSaosHuman != null ? dex.supply.totalSaosHuman : null;
  const cap = dex?.supply?.capSaosHuman ?? null;
  /* הערה: ה-payload מדווח כבר-באחוזים (0.882 = 0.882% מהתקרה) — אין-הכפלה */
  const pctOfCap = dex?.supply?.pctOfCap ?? null;
  const height = dex?.height ?? null;
  const fillsToday = dex?.metrics?.[0]?.fills ?? null;
  const verdict = pulse?.truth?.verdict ?? null;
  const verdictGreen = verdict?.includes("GREEN") ?? false;
  const verdictRed = verdict?.includes("FAIL") || verdict?.includes("RED") ? true : false;
  const money = dex?.truth?.realMoney?.totalUsd ?? null;
  const btc = mkt?.coins?.find((c) => c.symbol === "BTC")?.priceUsd ?? null;
  const agents = org?.office?.state?.agents ?? null;
  const sha16 = pulse?.truthMeta?.sha16 ?? null;
  const clones = org?.node?.clones ?? null;
  const clonesCount = clones ? clones.length : null;
  const workOrdersOpen = org?.growth?.workOrders?.filter((w) => w?.status === "open").length ?? null;

  /* ─── גילי-זרמים אמיתיים (לנקודות-ה-LIVE) ─── */
  const nums = (arr: Array<number | null | undefined>): number[] => arr.filter((v): v is number => typeof v === "number");
  const streamAges = nums(Object.values(pulse?.streams ?? {}).map((s) => s?.ageMinutes));
  const minStreamAge = streamAges.length ? Math.min(...streamAges) : null;
  const channelAges = nums([
    pulse?.streams?.directives?.ageMinutes,
    pulse?.streams?.requests?.ageMinutes,
    pulse?.streams?.notes?.ageMinutes,
  ]);
  const channelAge = channelAges.length ? Math.min(...channelAges) : null;
  const truthAge = pulse?.truthMeta?.ageMinutes ?? null;
  const dexAge =
    dex?.savedAt != null
      ? ageMinutesSince(dex.savedAt)
      : (dex?.truthMeta?.saosLive?.ageMinutes ?? dex?.truthMeta?.honestEcon?.ageMinutes ?? null);
  const officeAge = ageMinutesSince(org?.office?.heartbeat?.lastTick);

  const nav = (id: string): void => onNavigate?.(id);

  const failures: Array<{ url: string; err: string }> = [
    { url: "/api/giant/pulse", err: errs.pulse ?? "" },
    { url: "/api/giant/dex", err: errs.dex ?? "" },
    { url: "/api/organism", err: errs.org ?? "" },
    { url: "/api/giant/market", err: errs.mkt ?? "" },
  ].filter((f) => f.err !== "");

  const heroRows: Array<{ icon: React.ReactNode; term: string; def: string; view: string; evidence: React.ReactNode }> = [
    {
      icon: <Bot className="h-4 w-4" aria-hidden />,
      term: "הריבונות",
      def: "הגוף-המנהל שפועל 24/7",
      view: "machine",
      evidence: org?.office?.heartbeat?.status ? <span dir="ltr">heartbeat: {org.office.heartbeat.status}</span> : null,
    },
    {
      icon: <Coins className="h-4 w-4" aria-hidden />,
      term: "SAOS",
      def: "המטבע-שלה",
      view: "wallet",
      evidence:
        bookHuman !== null ? (
          <span dir="ltr" className="font-mono tabular-nums">
            {fmtBook(bookHuman)} SAOS
          </span>
        ) : null,
    },
    {
      icon: <ArrowLeftRight className="h-4 w-4" aria-hidden />,
      term: "הדקס",
      def: "מנוע-המסחר-האמיתי שלה",
      view: "dex",
      evidence:
        height !== null ? (
          <span dir="ltr" className="font-mono tabular-nums">
            height {fmtInt(height)}
          </span>
        ) : null,
    },
    {
      icon: <Users className="h-4 w-4" aria-hidden />,
      term: "הצי",
      def: "הסוכנים שלה",
      view: "office",
      evidence: agents !== null ? <span dir="ltr" className="font-mono tabular-nums">{fmtInt(agents)} agents</span> : null,
    },
    {
      icon: <GitBranch className="h-4 w-4" aria-hidden />,
      term: "הגיט",
      def: "שכבת-הקיום · כל-זרם-מטובע-sha16",
      view: "pulse",
      evidence: sha16 ? (
        <span dir="ltr" className="font-mono tabular-nums">
          sha16 {sha16}
        </span>
      ) : null,
    },
  ];

  const tour: Array<{ id: string; icon: React.ReactNode; title: string; l1: string; l2: string }> = [
    { id: "channel", icon: <Radio className="h-4 w-4" aria-hidden />, title: "הערוץ", l1: "הדלת-הראשית שלך מול הריבונות", l2: "שער-המנהל פותח-אותה" },
    { id: "dex", icon: <Landmark className="h-4 w-4" aria-hidden />, title: "הדקס", l1: "הכסף: נרות · קופות", l2: "אמת-ההיצע מול-התקרה" },
    { id: "machine", icon: <Gauge className="h-4 w-4" aria-hidden />, title: "המכונה", l1: "מנוע-הדקס כמכונה-חיה", l2: "האובייקט-הוא-ההסבר" },
    { id: "office", icon: <Users className="h-4 w-4" aria-hidden />, title: "המשרד-החי", l1: "הצוות בתלת-ממד", l2: "קונסולת-מפעיל" },
  ];

  const fade = (i: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: "easeOut" as const, delay: i * 0.05 },
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* כרזת-כשל-כנה: מקורות-חסרים */}
      {failures.length > 0 && (
        <motion.section {...fade(0)} className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] p-4">
          <p className="text-xs font-black text-rose-400">מקורות-נתונים-חסרים — מוצג-רק-מה-נמדד:</p>
          <ul className="mt-1.5 space-y-1">
            {failures.map((f) => (
              <li key={f.url} className="text-[11px] text-rose-300/90">
                <span className="font-mono" dir="ltr">
                  {f.url}
                </span>{" "}
                · <span dir="ltr">{f.err}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* ═══ סעיף-1 · HERO: מה-אני-רואה-כאן ═══ */}
      <motion.section {...fade(1)} className={`p-6 transition hover:border-white/[0.12] ${PANEL}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={LABEL}>סקירת-המערכת · מה-אני-רואה-כאן</p>
            <h1 className="mt-1 text-5xl font-black leading-none tracking-tight md:text-6xl">
              <span className="bg-gradient-to-l from-amber-300 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                GIANT
              </span>
            </h1>
          </div>
          <p className="max-w-md text-xs leading-5 text-zinc-400">
            הממשק-המאוחד של הריבונות — משטח-אחד לכל-היכולות. הכל נמדד-חי עכשיו מהזרמים-הקנוניים; חסר = מוצהר-חסר ·
            אפס-המצאה · אפס-סימולציה. התעדכון-כל-דקה.
          </p>
        </div>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          {heroRows.map((r) => (
            <button
              key={r.term}
              type="button"
              onClick={() => nav(r.view)}
              title={`עבור-אל: ${r.term}`}
              className="cursor-pointer rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-right transition hover:border-amber-600/40 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2 text-sm font-black text-zinc-100">
                <span className="text-amber-500">{r.icon}</span>
                <span>{r.term}</span>
                <span className="font-normal text-zinc-600">=</span>
                <span className="text-[11px] font-semibold leading-4 text-zinc-300">{r.def}</span>
              </div>
              <div className="mt-1.5 min-h-[16px] text-[10px] font-bold text-zinc-500">
                {r.evidence !== null ? r.evidence : pulse === null && org === null && dex === null ? <Skeleton className="h-3.5 w-20" /> : null}
              </div>
            </button>
          ))}
        </div>
      </motion.section>

      {/* ═══ סעיף-2 · מפת-המערכת-החיה ═══ */}
      <motion.section {...fade(2)} className={`p-6 transition hover:border-white/[0.12] ${PANEL}`}>
        <p className={LABEL}>המפה-החיה · איך-הכל-מתחבר</p>
        <h2 className="mt-1 text-lg font-black text-zinc-50">מפת-המערכת-החיה</h2>
        <p className="mt-1 text-[11px] leading-4 text-zinc-500">
          כל-צומת-לחיץ · נקודת-ה-LIVE היא גיל-הזרם-האמיתי: <span className="text-emerald-400">ירוק טרי (&lt;15 ד׳)</span> ·{" "}
          <span className="text-amber-400">ענבר (&lt;60 ד׳)</span> · <span className="text-zinc-400">אפור מיושן/לא-נמדד</span>
        </p>

        {/* שורה-1: הבעלים → הערוץ (הדלת-האחת) */}
        <div className="mt-6 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-0">
          <MapNode
            icon={<Crown className="h-4 w-4" aria-hidden />}
            name="הבעלים"
            desc="אתה. הדלת-היחידה-שלך-אל-הכל היא הערוץ"
            ageMin={null}
            youAreHere
            onClick={() => nav("channel")}
          />
          <HConnector className="hidden md:flex" />
          <VConnector className="md:hidden" />
          <MapNode
            icon={<Radio className="h-4 w-4" aria-hidden />}
            name="הערוץ"
            desc="הדלת-האחת: הוראות · פניות · קול-הריבונות"
            ageMin={channelAge}
            meta={
              pulse?.channel ? (
                <span>
                  {pulse.channel.directives != null ? `${fmtInt(pulse.channel.directives)} הוראות · ` : ""}
                  {pulse.channel.notes != null ? `${fmtInt(pulse.channel.notes)} רישומים` : ""}
                </span>
              ) : undefined
            }
            onClick={() => nav("channel")}
          />
        </div>

        {/* מחבר-בין-שורות: הערוץ מוביל-אל-הריבונות */}
        <VConnector className="h-6" />

        {/* שורה-2: הריבונות במרכז → שלושה-איברים */}
        <div className="flex flex-col items-center">
          <MapNode
            icon={<Bot className="h-4 w-4" aria-hidden />}
            name="הריבונות"
            desc="הגוף-המנהל: מפעיל-את-כל-האיברים 24/7"
            ageMin={truthAge}
            meta={
              verdict ? (
                <span className={verdictGreen ? "font-bold text-emerald-400" : verdictRed ? "font-bold text-rose-400" : "text-zinc-400"}>
                  truth-gate: <span dir="ltr">{verdict}</span>
                  {pulse?.truth?.pass != null ? ` · ${fmtInt(pulse.truth.pass)} PASS` : ""}
                </span>
              ) : undefined
            }
            onClick={() => nav("machine")}
          />
          <VConnector />
          <div className="relative hidden h-px w-2/3 bg-gradient-to-l from-white/5 via-white/20 to-white/5 md:block" aria-hidden />
          <div className="grid w-full gap-3 md:grid-cols-3 md:gap-4">
            <div className="flex flex-col items-center">
              <VConnector className="hidden md:flex" />
              <MapNode
                icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
                name="מנוע-הדקס"
                desc="הכסף: ספר · קופות · מילויים"
                ageMin={dexAge}
                meta={fillsToday != null ? <span className="font-mono tabular-nums">{fmtInt(fillsToday)} מילויים-היום</span> : undefined}
                onClick={() => nav("dex")}
              />
            </div>
            <div className="flex flex-col items-center">
              <VConnector className="hidden md:flex" delay={0.7} />
              <MapNode
                icon={<GitBranch className="h-4 w-4" aria-hidden />}
                name="זרמי-הגיט"
                desc="שכבת-הקיום: כל-זרם-עם-sha16"
                ageMin={minStreamAge}
                meta={clonesCount != null ? <span className="font-mono tabular-nums">{fmtInt(clonesCount)} ספרים-חיים</span> : undefined}
                onClick={() => nav("pulse")}
              />
            </div>
            <div className="flex flex-col items-center">
              <VConnector className="hidden md:flex" delay={1.4} />
              <MapNode
                icon={<Users className="h-4 w-4" aria-hidden />}
                name="המשרד-החי"
                desc="הסוכנים · הלב · הפעימות"
                ageMin={officeAge}
                meta={
                  agents != null ? (
                    <span className="font-mono tabular-nums">
                      {fmtInt(agents)} סוכנים{workOrdersOpen != null ? ` · ${fmtInt(workOrdersOpen)} הזמנות-עבודה` : ""}
                    </span>
                  ) : undefined
                }
                onClick={() => nav("office")}
              />
            </div>
          </div>
        </div>
      </motion.section>

      {/* ═══ סעיף-3 · רצועת-המדדים-החיים ═══ */}
      <motion.section {...fade(3)}>
        <p className={`${LABEL} mb-2`}>המספרים-החיים · נמדדו-עכשיו</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="ספר-הסאוס"
            value={bookHuman !== null ? fmtBook(bookHuman) : null}
            numeric={bookHuman !== null ? { target: bookHuman, format: fmtBook } : undefined}
            failed={errs.dex !== ""}
            sub="SAOS יחידות-אנוש (mu÷1000)"
          />
          <KpiCard
            label="אחוז-מהתקרה"
            value={pctOfCap !== null ? `${pctOfCap.toFixed(3)}%` : null}
            numeric={pctOfCap !== null ? { target: pctOfCap, format: (n) => `${n.toFixed(3)}%` } : undefined}
            failed={errs.dex !== ""}
            sub={cap !== null ? <>מתוך תקרה <span dir="ltr" className="font-mono tabular-nums">{fmtInt(cap)}</span></> : null}
          />
          <KpiCard
            label="גובה-המנוע"
            value={height !== null ? fmtInt(height) : null}
            numeric={height !== null ? { target: height, format: fmtInt } : undefined}
            failed={errs.dex !== ""}
            sub={fillsToday != null ? <>מילויים-היום <span dir="ltr" className="font-mono tabular-nums">{fmtInt(fillsToday)}</span></> : null}
          />
          <KpiCard
            label="שער-האמת"
            value={null}
            failed={errs.pulse !== ""}
            chip={
              verdict ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${
                    verdictGreen
                      ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400"
                      : verdictRed
                        ? "border-rose-500/25 bg-rose-500/5 text-rose-400"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                  title={`truth-gate: ${verdict}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${verdictGreen ? "animate-pulse bg-emerald-400" : verdictRed ? "bg-rose-400" : "bg-zinc-500"}`} aria-hidden />
                  <span dir="ltr">{verdict}</span>
                </span>
              ) : errs.pulse !== "" ? (
                <span className="text-xs font-bold text-rose-400">לא-נמדד</span>
              ) : (
                <Skeleton className="h-7 w-24" />
              )
            }
            sub={
              pulse?.truth?.pass != null ? (
                <span dir="ltr" className="font-mono tabular-nums">
                  {fmtInt(pulse.truth.pass)} PASS{pulse.truth.fail != null ? ` · ${fmtInt(pulse.truth.fail)} FAIL` : ""}
                </span>
              ) : null
            }
          />
          <KpiCard
            label="כסף-חוץ-אמיתי"
            value={money !== null ? fmtUsd(money) : null}
            numeric={money !== null ? { target: money, format: fmtUsd } : undefined}
            failed={errs.dex !== ""}
            sub="מדידת-RPC-ציבורי · מחוץ-לספר"
          />
          {btc !== null ? (
            <KpiCard label="BTC" value={fmtUsd(btc)} numeric={{ target: btc, format: fmtUsd }} failed={errs.mkt !== ""} sub={mkt?.source ? <>מקור: <span dir="ltr">{mkt.source}</span></> : null} />
          ) : null}
        </div>
        {/* שבריר-כנה: אין-BTC → הכרטיס-מושמט; ורק-אם-השוק-נכשל-לגמרי מצהירים */}
        {btc === null && errs.mkt !== "" && <p className="mt-2 text-[11px] text-rose-400">BTC: לא-נמדד — הכרטיס-הושמט-בכנות</p>}
      </motion.section>

      {/* ═══ סעיף-4 · מסע-ההיכרות ═══ */}
      <motion.section {...fade(4)}>
        <p className={`${LABEL} mb-2`}>מסע-ההיכרות · ארבע-דלתות</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tour.map((t) => (
            <Spotlight key={t.id} className={`giant-lift flex flex-col p-5 transition hover:border-white/[0.12] ${PANEL}`}>
              <div className="flex items-center gap-2">
                <span className="text-amber-500">{t.icon}</span>
                <h3 className="text-sm font-black text-zinc-50">{t.title}</h3>
              </div>
              <div className="mt-2 flex-1 space-y-0.5 text-[11px] leading-5 text-zinc-400">
                <p>{t.l1}</p>
                <p>{t.l2}</p>
              </div>
              <button
                type="button"
                onClick={() => nav(t.id)}
                className="mt-4 inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-500/[0.06] px-3 text-xs font-black text-amber-400 transition hover:bg-amber-500/15"
              >
                עבור
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Spotlight>
          ))}
        </div>
      </motion.section>

      {/* מקורות-האמת */}
      <p className="px-1 text-[10px] leading-5 text-zinc-600">
        מקורות-האמת של-הסקירה:{" "}
        <span className="font-mono" dir="ltr">
          /api/giant/pulse · /api/giant/dex · /api/organism · /api/giant/market
        </span>{" "}
        — דגימה-כל-דקה · חסר = מוצהר-חסר · אין-מספר-שלא-נמדד.
      </p>
    </div>
  );
}
