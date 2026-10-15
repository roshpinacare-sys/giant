"use client";

/* ═══ SovereigntyView · ההגשה-הסופית של הרעיון (T61) ════════════════════════
 * הבעלים: "הסנדבוקס נמחק — לא בונים עליו את הממשק, אלא מחברים את הריבונות
 * להפעלה מלאה מכל תיקיות הגיט; הגשה סופית של הרעיון."
 * מסך-אחד שמוכיח את הרעיון כולו: הריבונות חיה בגיט — הממשק הזה רק מציג.
 * · מקור-אחד: GET /api/giant/sovereignty (סריקת-גיט חיה מהמכונה) · ריענון 60ש׳.
 * · fail-honest: ערוץ-לא-עולה = באנר-אדום-ענבר + מדידה-חוזרת בעוד 15 שניות.
 * · אפס-המצאה בטעינה: שלדים בלבד · כל-מספר מה-payload · כשלי-חלקים מוצגים.
 * קראפט T60: CountUp · Spotlight · Reveal (craft.tsx) · זכוכית · ענבר/אמרלד/רוז. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  Check,
  GitBranch,
  KeyRound,
  Landmark,
  Lightbulb,
  RefreshCw,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, Reveal, Spotlight } from "@/components/giant/craft";
import type {
  AgentIdentity,
  AgentSource,
  ArchaeologyEntry,
  FleetNode,
  GiantFamily,
  Lesson,
  RepoInfo,
  SovereigntyAudit,
  SovereigntyPayload,
} from "@/lib/giant/sovereignty-types";
import type { GatePayload } from "@/lib/giant/gate-types";

const POLL_MS = 60_000;
const RETRY_MS = 15_000; /* הבאנר מבטיח "מדידה-חוזרת בעוד 15 שניות" — הקוד מקיים */

/* ─── עזרי-תצוגה: הגנה-מלאה על-מספרים ותאריכים (אפס-קריסה · אפס-זיוף) ─── */
function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fmtInt(n: number | null): string {
  return isFiniteNum(n) ? n.toLocaleString("en-US") : "—";
}

const usdCompact: Intl.NumberFormat | null = (() => {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    });
  } catch {
    return null;
  }
})();

function fmtUsd(v: number | null): string {
  if (!isFiniteNum(v)) return "—";
  if (usdCompact) {
    try {
      return usdCompact.format(v);
    } catch {
      /* נופל-למטה למעצב-הידני */
    }
  }
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function safeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("he-IL");
}

function safeDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/* רימוט → host/path בלבד לתצוגה (הטוקנים כבר מוסרים-בשרת) */
function remoteHost(remote: string | null): string | null {
  if (!remote) return null;
  try {
    const u = new URL(remote);
    return `${u.host}${u.pathname.replace(/\.git$/, "")}`;
  } catch {
    return remote.replace(/^https?:\/\//, "").slice(0, 60);
  }
}

const VIS_HE: Record<string, string> = { public: "פומבי", private: "פרטי" };

/* ─── רכיבי-עזר ─── */
function SectionHead({
  kicker,
  title,
  side,
}: {
  kicker: string;
  title: string;
  side?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">{kicker}</p>
        <h3 className="mt-0.5 text-lg font-black leading-7 text-zinc-100 sm:text-xl">{title}</h3>
      </div>
      {side}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | null }) {
  return (
    <Spotlight className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl">
      <p className="text-[10px] font-bold leading-4 text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums text-amber-300 sm:text-3xl">
        {isFiniteNum(value) ? (
          <CountUp target={value} format={fmtInt} />
        ) : (
          <span className="text-zinc-600" title="לא נמדד במדידה-הזאת">—</span>
        )}
      </p>
    </Spotlight>
  );
}

function RepoCard({ repo }: { repo: RepoInfo }) {
  const host = remoteHost(repo.remote ?? null);
  const survives = repo.hasRemote && repo.dirtyCount === 0;
  return (
    <Spotlight className="flex h-full min-w-0 flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm font-bold text-zinc-100" dir="ltr" title={repo.path}>
          {repo.name}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
            survives
              ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
              : repo.hasRemote
                ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-400"
                : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
          }`}
        >
          {survives ? "שרד" : repo.hasRemote ? "דיפוק" : "בלי-רימוט"}
        </span>
      </div>
      <p className="text-[11px] leading-5 text-zinc-400">{repo.role}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
        <span className="font-mono" dir="ltr">
          <GitBranch className="ml-1 inline h-3 w-3" aria-hidden />
          {repo.branch}
        </span>
        <span className="font-mono tabular-nums">{fmtInt(repo.commitCount)} קומיטים</span>
        <span className={`font-mono tabular-nums ${repo.dirtyCount > 0 ? "text-rose-400" : "text-emerald-500"}`}>
          {repo.dirtyCount > 0 ? `דיפוק: ${fmtInt(repo.dirtyCount)} קבצים` : "נקי"}
        </span>
      </div>
      <p
        className="truncate text-[10px] text-zinc-500"
        title={`${repo.lastSha} · ${repo.lastDate} · ${repo.lastSubject}`}
      >
        <span className="font-mono text-amber-400/80" dir="ltr">{repo.lastSha}</span>
        {" · "}
        {safeDate(repo.lastDate) ?? "—"} · {repo.lastSubject}
      </p>
      <div className="mt-auto border-t border-white/[0.05] pt-2 text-[10px]">
        {host ? (
          <span className="block truncate font-mono text-zinc-400" dir="ltr" title={repo.remote ?? undefined}>
            {host}
          </span>
        ) : (
          <span className="font-bold text-rose-400">מקומי בלבד — ימות עם הסנדבוקס</span>
        )}
      </div>
      {repo.wired.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {repo.wired.map((w) => (
            <span
              key={w}
              className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-zinc-400"
              dir="ltr"
            >
              {w}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] font-bold leading-4 text-rose-400/90">{repo.wiredNote}</p>
      )}
    </Spotlight>
  );
}

function NodeChip({ node }: { node: FleetNode }) {
  const alive = node.status === "alive";
  return (
    <span
      title={`${node.id} · ${node.role} · ${node.status}${node.local ? " · קיים-על-המכונה" : ""}`}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
        node.local
          ? "border-amber-500/40 bg-amber-500/[0.06] text-amber-300"
          : "border-white/[0.08] bg-white/[0.03] text-zinc-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${alive ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden />
      <span className="truncate font-mono" dir="ltr">{node.id}</span>
      <span className="shrink-0 font-normal text-zinc-500">{VIS_HE[node.vis] ?? node.vis}</span>
      {node.local && (
        <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[8px] text-amber-300">מקומי</span>
      )}
    </span>
  );
}

function IdentityCard({ identity }: { identity: AgentIdentity }) {
  const keysInvolved = /signing|custody/i.test(identity.keyMode);
  return (
    <Spotlight className="flex h-full flex-col gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-bold text-zinc-200" dir="ltr">
          {identity.agentId}
        </span>
        <span
          title={keysInvolved ? "מפתחות-מעורבים" : "keyless — אין-מפתחות"}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
            keysInvolved
              ? "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
              : "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
          }`}
          dir="ltr"
        >
          {identity.keyMode}
        </span>
      </div>
      <p className="text-[11px] leading-5 text-zinc-400">{identity.role}</p>
      {identity.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {identity.capabilities.map((c, i) => (
            <span
              key={`${c}#${i}`}
              className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-zinc-400"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <span className="mt-auto truncate font-mono text-[9px] text-zinc-600" dir="ltr" title={identity.source}>
        {identity.source}
      </span>
    </Spotlight>
  );
}

function LessonCard({ lesson, index }: { lesson: Lesson; index: number }) {
  return (
    <Reveal delay={Math.min(index * 0.04, 0.2)}>
      <article className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-black text-zinc-100">{lesson.title}</h4>
          {safeDate(lesson.date) && <span className="text-[10px] text-zinc-600">{safeDate(lesson.date)}</span>}
        </div>
        <p className="mt-1 text-[11px] leading-6 text-zinc-400">{lesson.what}</p>
        <p className="mt-2 rounded-lg border-r-2 border-amber-500/60 bg-amber-500/[0.05] px-3 py-2 text-[11px] leading-6 text-amber-200/90">
          <b className="font-black">החוק:</b> {lesson.rule}
        </p>
        <p className="mt-1.5 truncate font-mono text-[9px] text-rose-100/30" dir="ltr" title={lesson.source}>
          {lesson.source}
        </p>
      </article>
    </Reveal>
  );
}

/* ─── T62 · ביקורת-חיות-הצי: קבלת-הביקורת מול דיאל-TCP-חי — שתי-מישורי-מדידה ─── */

const FRESHNESS_LABELS: Record<string, string> = {
  DomainStatusMin: "Domain/status",
  truthLatestMin: "truth/latest",
  fleetGraphMin: "FLEET-GRAPH",
  pulseNetworkMin: "Pulse/network",
};

function FleetAuditSection({ audit }: { audit: SovereigntyAudit | null }) {
  const receipt = audit?.receipt ?? null;
  const ports = audit?.ports ?? [];
  const aliveByPort = new Map<number, boolean>();
  for (const s of receipt?.liveServices ?? []) aliveByPort.set(s.port, s.alive);
  const dialDisagrees = ports.some((p) => {
    const r = aliveByPort.get(p.port);
    return r !== undefined && r !== p.alive;
  });
  const services = receipt?.liveServices ?? [];
  const beats = receipt?.remotePlane.beats ?? [];
  const waves = receipt?.siblingGiants.waves ?? [];
  const freshness: [string, number | null][] = receipt
    ? Object.entries(receipt.localFreshnessAfterSync ?? {})
    : [];

  return (
    <Reveal>
      <section
        id="fleet-audit"
        className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
      >
        <SectionHead
          kicker="T62 · הבעלים: רובם סנדבוקסים מתים — לבחון את כולם"
          title="ביקורת-חיות-הצי"
          side={
            audit ? (
              <span
                className="font-mono text-[9px] text-zinc-600"
                dir="ltr"
                title="sha16 של קובץ-הקבלה FLEET-AUDIT.json"
              >
                {audit.receiptSha16 ?? "—"}
              </span>
            ) : undefined
          }
        />
        {!audit ? (
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs leading-6 text-zinc-400">
            ביקורת-הצי לא נמדדה במדידה-הזאת — קובץ-הקבלה לא נקרא; לא-מצויר, לא-מומצא.
          </p>
        ) : (
          <div className="min-w-0 space-y-4">
            {/* פס-פסק-הדין-של-הקבלה */}
            {receipt?.verdict ? (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2.5 text-sm font-black leading-6 text-amber-200">
                {receipt.verdict}
              </p>
            ) : (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2.5 text-xs leading-6 text-zinc-400">
                קובץ-הקבלה לא נקרא במדידה-הזאת — מוצגת-רק-מדידת-הדיאל-החיה.
              </p>
            )}

            {/* שני-המישורים זה-לצד-זה — גריד-1-עמודה-מפורש-בנייד (הלקח-מ-T61) */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* a · מישור-החיים-כאן */}
              <Spotlight className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 backdrop-blur-xl">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  <Activity className="h-3.5 w-3.5 shrink-0 text-amber-500/60" aria-hidden />
                  מישור-החיים-כאן · השירותים-בקבלה
                </p>
                <div className="mt-2 divide-y divide-white/5">
                  {services.map((s) => (
                    <div key={`${s.name}:${s.port}`} className="min-w-0 py-1.5">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                              s.alive
                                ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                                : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                            }`}
                          >
                            {s.alive ? "חי" : "לא-חי"}
                          </span>
                          <span className="truncate text-[11px] font-bold text-zinc-200" title={s.name}>
                            {s.name}
                          </span>
                        </span>
                        <span
                          className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-amber-300/90"
                          dir="ltr"
                        >
                          :{s.port}
                        </span>
                      </div>
                      {s.evidence && (
                        <p className="mt-0.5 truncate text-[9px] text-zinc-600" dir="auto" title={s.evidence}>
                          {s.evidence}
                        </p>
                      )}
                    </div>
                  ))}
                  {services.length === 0 && (
                    <p className="py-1.5 text-[10px] text-zinc-600">אין-רשימת-שירותים בקבלה — לא-מומצא</p>
                  )}
                </div>
                <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-500">בדיקת-TCP עכשיו:</span>
                    {ports.map((p) => (
                      <span
                        key={p.port}
                        title={`dial 127.0.0.1:${p.port} · 800ms`}
                        dir="ltr"
                        className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tabular-nums ${
                          p.alive
                            ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                        }`}
                      >
                        :{p.port} {p.alive ? "פתוח" : "סגור"}
                      </span>
                    ))}
                    {ports.length === 0 && (
                      <span className="text-[10px] text-zinc-600">הדיאל-לא-רץ — לא-מומצא</span>
                    )}
                  </div>
                  {dialDisagrees && (
                    <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-2 py-1 text-[10px] font-bold leading-4 text-amber-300">
                      תלתק-בקבלה vs דיאל-חי — מוצגות-שתי-המדידות
                    </p>
                  )}
                </div>
              </Spotlight>

              {/* b · מישור-הגיט-החוץ-מכונה */}
              <Spotlight className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 backdrop-blur-xl">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-amber-500/60" aria-hidden />
                  מישור-הגיט-החוץ-מכונה
                </p>
                {receipt ? (
                  <>
                    <p className="mt-2 text-[11px] leading-5 text-zinc-400">{receipt.remotePlane.doctrine}</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-right text-xs">
                        <thead className="text-[10px] uppercase text-zinc-500">
                          <tr>
                            <th className="px-2 py-1.5">ריפו</th>
                            <th className="px-2 py-1.5">דפיקת-הרימוט-האחרונה</th>
                            <th className="px-2 py-1.5">הפער-שסונכרן</th>
                            <th className="px-2 py-1.5">נושא</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beats.map((b) => (
                            <tr key={b.repo} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                              <td className="px-2 py-2 font-mono font-bold text-zinc-200" dir="ltr">
                                {b.repo}
                              </td>
                              <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">
                                {safeTime(b.remoteLast) ?? "—"}
                              </td>
                              <td className="px-2 py-2 font-mono tabular-nums text-amber-300">
                                +{fmtInt(b.aheadBefore)} קומיטים היו-קדימה
                              </td>
                              <td className="max-w-[220px] px-2 py-2">
                                <span className="block truncate text-zinc-400" title={b.subject}>
                                  {b.subject}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {beats.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-2 py-3 text-center text-zinc-500">
                                אין-דפיקות-רימוט בקבלה — לא-מומצא
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[11px] font-black leading-5 text-emerald-400">
                      {receipt.remotePlane.externalLoopVerdict}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[10px] leading-5 text-zinc-600">
                    מישור-הגיט לא נמדד בקבלה — לא-מצויר, לא-מומצא.
                  </p>
                )}
              </Spotlight>
            </div>

            {/* הטיפול-שבוצע */}
            {receipt && receipt.treatment.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  הטיפול-שבוצע
                </p>
                <ol className="mt-2 space-y-1.5">
                  {receipt.treatment.map((t, i) => (
                    <li
                      key={`${i}-${t.slice(0, 24)}`}
                      className="flex items-start gap-2 text-[10px] leading-5 text-zinc-400"
                    >
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" aria-hidden />
                      <span className="shrink-0 font-mono text-amber-500/80" dir="ltr">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 break-words" dir="auto">
                        {t}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* הענק-האח · גלי-העבודה-המקבילים */}
            {receipt && (
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  הענק-האח · גלי-העבודה-המקבילים
                </p>
                <div className="mt-2 space-y-1">
                  {waves.map((w) => (
                    <div key={w.wave} className="flex items-baseline gap-2 text-[11px] leading-5">
                      <span className="shrink-0 font-mono text-[10px] font-black text-amber-400" dir="ltr">
                        wave {w.wave}
                      </span>
                      <span className="min-w-0 truncate text-zinc-300" title={w.subject}>
                        {w.subject}
                      </span>
                    </div>
                  ))}
                  {waves.length === 0 && <p className="text-[10px] text-zinc-600">אין-גלים בקבלה — לא-מומצא</p>}
                </div>
                {receipt.siblingGiants.evidence && (
                  <p
                    className="mt-1 truncate font-mono text-[9px] text-zinc-600"
                    dir="ltr"
                    title={receipt.siblingGiants.evidence}
                  >
                    {receipt.siblingGiants.evidence}
                  </p>
                )}
                {receipt.siblingGiants.verdict && (
                  <p className="mt-2 border-r-2 border-amber-500/60 pr-3 text-[11px] font-bold leading-5 text-amber-200/90">
                    {receipt.siblingGiants.verdict}
                  </p>
                )}
              </div>
            )}

            {/* UNPROBABLE — עמוד-התווך-של-אפס-זיופים, בולט-במכוון */}
            {receipt && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.06] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black text-rose-300">
                    UNPROBABLE
                  </span>
                  <span className="font-mono text-xl font-black tabular-nums text-rose-300">
                    {fmtInt(receipt.unprobable.count)}
                  </span>
                  <span className="text-[10px] font-bold text-rose-200/80">
                    צמתים-שלא-ניתן-לבדוק-מהמכונה-הזאת
                  </span>
                </div>
                <p className="mt-2 break-words text-[11px] leading-5 text-zinc-300">{receipt.unprobable.note}</p>
                <p className="mt-2 border-r-2 border-rose-500/60 pr-3 text-[11px] font-black leading-5 text-rose-200">
                  החוק: {receipt.unprobable.law}
                </p>
              </div>
            )}

            {/* טריות-המקומי-אחרי-הסנכרון */}
            {receipt && (
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  טריות-המקומי-אחרי-הסנכרון
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {freshness.map(([k, v]) => (
                    <span
                      key={k}
                      title={`${k} · דקות-מאז-עדכון-אחרון`}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                        !isFiniteNum(v)
                          ? "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                          : v > 60
                            ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-400"
                            : "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                      }`}
                    >
                      {FRESHNESS_LABELS[k] ?? k}{" "}
                      <span className="font-mono tabular-nums" dir="ltr">
                        {isFiniteNum(v) ? `${fmtInt(v)} דקות` : "—"}
                      </span>
                    </span>
                  ))}
                  {freshness.length === 0 && (
                    <p className="text-[10px] text-zinc-600">טריות-לא-נמדדה בקבלה — לא-מומצא</p>
                  )}
                </div>
              </div>
            )}

            {/* גיל-הקבלה + שיטת-המדידה-שלה */}
            <p className="truncate text-[10px] leading-5 text-zinc-600" title={receipt?.probe ?? undefined}>
              קבלת-הביקורת בת{" "}
              <span className="font-mono tabular-nums text-zinc-400">
                {isFiniteNum(audit.receiptAgeMin) ? `${fmtInt(audit.receiptAgeMin)} דקות` : "—"}
              </span>
              {receipt?.probe && <> · מדידת-הקבלה: {receipt.probe}</>}
            </p>
          </div>
        )}
      </section>
    </Reveal>
  );
}

/* ─── T64 · השער: מפתח-המפעיל אומת ביט-מול-ביט מול השרשרת-החיה ונאטם ─── */

function GateSection() {
  const [gate, setGate] = useState<GatePayload | null>(null);
  const [gateErr, setGateErr] = useState("");
  const [gateBusy, setGateBusy] = useState(false);
  const alive = useRef(true);
  const acRef = useRef<AbortController | null>(null);

  const loadGate = useCallback(async () => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setGateBusy(true);
    try {
      const res = await fetch("/api/giant/gate", { cache: "no-store", signal: ac.signal });
      const j = (await res.json()) as GatePayload & { error?: string };
      if (!alive.current) return;
      if (!res.ok || j.ok === false || j.error) {
        setGateErr(j.error ?? `ערוץ-השער השיב HTTP ${res.status}`);
        setGate(null);
      } else {
        setGate(j);
        setGateErr("");
      }
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setGateErr(e instanceof Error ? e.message.slice(0, 200) : "מדידת-השער נכשלה");
      setGate(null);
    } finally {
      if (alive.current) setGateBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void loadGate();
    const iv = setInterval(() => void loadGate(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(iv);
      acRef.current?.abort();
    };
  }, [loadGate]);

  const receipt = gate?.receipt ?? null;
  const actions = receipt?.actions ?? null;
  const door = gate?.door ?? null;
  const open = gate?.gateOpen ?? false;
  const matches = receipt?.matchesByAccountRole ?? [];

  return (
    <Reveal>
      <section
        id="gate"
        className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
      >
        <SectionHead
          kicker="T64 · הוראת-הבעלים: וודא שגם פותח את השער — מפתח עדיין לא מאומת"
          title="השער"
          side={
            gateBusy ? (
              <RefreshCw className="h-4 w-4 animate-spin text-amber-500/60" aria-hidden />
            ) : (
              <KeyRound className={`h-4 w-4 ${open ? "text-emerald-400" : "text-amber-500/60"}`} aria-hidden />
            )
          }
        />

        {gateErr && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4 text-[11px] leading-6 text-rose-200">
            <b className="font-black">ערוץ-השער לא נמדד:</b> {gateErr} — מדידה-חוזרת בעוד רגע.
          </div>
        )}

        {!gateErr && (
          <>
            {/* פס-פסק-הדין */}
            <div
              className={`mb-3 rounded-xl border p-4 ${
                open
                  ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                  : "border-amber-500/30 bg-amber-500/[0.06]"
              }`}
            >
              <p className={`text-sm font-black ${open ? "text-emerald-300" : "text-amber-300"}`}>
                {open
                  ? "השער פתוח — המפתח אומת ביט-מול-ביט מול השרשרת-החיה, ונאטם (sealed-box) לכספת-המנוע"
                  : "השער סגור — לא כל-שרשרת-העדות הושלמה; לא מצויר, לא ממוצא"}
              </p>
              {receipt?.verdict && (
                <p className="mt-1 font-mono text-[10px] text-zinc-400" dir="ltr">
                  {receipt.verdict}
                </p>
              )}
            </div>

            {receipt ? (
              <>
                {/* שני-המישורים */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* מישור-הזיהוי כאן */}
                  <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                    <h4 className="mb-2 text-xs font-black text-zinc-100">מישור-הזיהוי — כאן, מול השרשרת-החיה</h4>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-300">
                        {receipt.source?.candidatesTested ?? "—"} מועמדים נבדקו
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-300">
                        {(receipt.target?.accounts ?? []).map((a) => `@${a}`).join(" · ") || "—"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] text-zinc-400" dir="ltr">
                        {(receipt.target?.roles ?? []).join("/")}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                          (receipt.matchesCount ?? 0) > 0
                            ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                        }`}
                      >
                        {receipt.matchesCount ?? 0} התאמות מלאות
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {matches.map((m, i) => (
                        <li key={`${m.file}#${i}`} className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="font-mono text-zinc-300" dir="ltr">
                            {m.file}
                          </span>
                          <span className="text-zinc-600">{m.at}</span>
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.07] px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400" dir="ltr">
                            {m.match}
                          </span>
                        </li>
                      ))}
                      {matches.length === 0 && (
                        <li className="text-[10px] text-zinc-500">אף מועמד לא התאים — כנה, לא מזויף</li>
                      )}
                    </ul>
                    <p className="mt-2 truncate font-mono text-[9px] text-zinc-600" dir="ltr" title={receipt.target?.rpc ?? ""}>
                      {receipt.target?.rpc ?? ""} · condenser_api.get_accounts
                    </p>
                    {isFiniteNum(gate?.receiptAgeMin ?? null) && (
                      <p className="mt-1 text-[9px] text-zinc-600">
                        הקבלה בת {fmtInt(gate?.receiptAgeMin ?? null)} דקות
                      </p>
                    )}
                  </div>

                  {/* מישור-החימוש ב-Actions */}
                  <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                    <h4 className="mb-2 text-xs font-black text-zinc-100">מישור-החימוש — GitHub Actions + הכספת</h4>
                    <ul className="space-y-1.5">
                      {(actions?.runs ?? []).map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span
                            className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                              r.conclusion === "success"
                                ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                                : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                            }`}
                            dir="ltr"
                          >
                            {r.conclusion === "success" ? "armed" : r.conclusion}
                          </span>
                          <span className="font-mono text-zinc-500" dir="ltr">
                            #{r.id} @{r.headSha?.slice(0, 7)}
                          </span>
                          {(r.verdict || r.cause) && (
                            <span className="min-w-0 break-words text-zinc-500">{r.verdict ?? r.cause}</span>
                          )}
                        </li>
                      ))}
                      {(actions?.runs ?? []).length === 0 && (
                        <li className="text-[10px] text-zinc-500">אין-ריצות-חימוש מתועדות בקבלה</li>
                      )}
                    </ul>
                    {actions?.vault && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.07] px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                          נאטם לכספת
                        </span>
                        <span className="font-mono text-[10px] text-zinc-300" dir="ltr">
                          {actions.vault.secret} @ {actions.vault.repo}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-600" dir="ltr">
                          {actions.vault.updatedAt}
                        </span>
                      </div>
                    )}
                    {actions?.gridIgnition && (
                      <p className="mt-2 rounded-lg border-r-2 border-amber-500/60 bg-amber-500/[0.05] px-3 py-2 text-[10px] leading-5 text-amber-200/90">
                        <b className="font-black">הצתת-הגריד (מהקבלה):</b> {actions.gridIgnition.note}
                        {gate?.barriers && gate.barriers.economicActive === gate.barriers.economicTotal && (
                          <span className="mt-1 block font-black text-emerald-300">
                            ← מיושן: המדידה-החיה למעלה מראה את-המצב-בפועל — החסמים פתוחים ({gate.barriers.economicActive}/{gate.barriers.economicTotal} כלכליים).
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* מדידת-הדלת החיה */}
                {door && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px]">
                    <span className="text-zinc-600">הדלת-בקאנון:</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-zinc-400" dir="ltr">
                      {door.workflowSha ?? "—"}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-bold ${
                        door.rosterEnvPassed
                          ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                          : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                      }`}
                    >
                      FLEET_ROSTER_MAP {door.rosterEnvPassed ? "עובר" : "חסר"}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-bold ${
                        door.fleetAccountPassed
                          ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                          : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                      }`}
                    >
                      FLEET_ACCOUNT {door.fleetAccountPassed ? "עובר" : "חסר"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-zinc-400" dir="ltr">
                      secret: {door.secretSource ?? "—"}
                    </span>
                  </div>
                )}

                {/* T66 · החסמים-הכלכליים — מדידת-חי של מצב-workflows במנוע-הדקס */}
                {gate?.barriers && (
                  <div
                    className={`mt-3 rounded-xl border p-4 ${
                      gate.barriers.economicActive === gate.barriers.economicTotal && gate.barriers.active === gate.barriers.total
                        ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                        : gate.barriers.economicActive === 0 && gate.barriers.active === 0
                          ? "border-rose-500/30 bg-rose-500/[0.06]"
                          : "border-amber-500/30 bg-amber-500/[0.06]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-zinc-100">
                        החסמים-הכלכליים — מדידת-חי של מצב-המנוע
                      </h4>
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold ${
                          gate.barriers.economicActive === gate.barriers.economicTotal && gate.barriers.active === gate.barriers.total
                            ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                            : "border-amber-500/30 bg-amber-500/[0.07] text-amber-400"
                        }`}
                        dir="ltr"
                      >
                        {gate.barriers.active}/{gate.barriers.total} active · econ {gate.barriers.economicActive}/{gate.barriers.economicTotal}
                      </span>
                    </div>
                    <p className={`mt-1 text-[11px] font-black ${gate.barriers.economicActive === gate.barriers.economicTotal ? "text-emerald-300" : "text-amber-300"}`}>
                      {gate.barriers.economicActive === gate.barriers.economicTotal
                        ? "כל-החסמים-הכלכליים פתוחים — הגריד, הדופק, מנוע-השוק והגשר זורמים (הוראת-הבעלים T66)"
                        : "חסמים-כלכליים עדיין סגורים — המדידה-החיה למטה היא האמת, לא-סיפור"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {gate.barriers.workflows.map((w) => (
                        <span
                          key={w.path}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] ${
                            w.state === "active"
                              ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                              : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                          }`}
                          dir="ltr"
                          title={w.economic ? "מנוע-הזרימה-הכלכלית" : "תשתית/שומרים"}
                        >
                          {w.path}
                          <b className="font-black">{w.state}</b>
                          {w.economic && <span className="text-amber-500">◆</span>}
                        </span>
                      ))}
                    </div>
                    {/* T67 · הוכחת-זרימה — ריצות-מוצלחות-אחרונות על-המכונה-האמיתית (התאום-הציבורי) */}
                    {gate.barriers.flow && (
                      <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
                        <p className="text-[10px] font-black text-zinc-300">
                          הזרימה-עצמה — ריצות-אחרונות על-המכונה ({gate.barriers.flow.repo}):
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {gate.barriers.flow.beats.map((b) => {
                            const ageMin = b.lastSuccessAt
                              ? Math.floor((Date.now() - Date.parse(b.lastSuccessAt)) / 60_000)
                              : null;
                            const fresh = ageMin !== null && ageMin <= 150;
                            const age =
                              ageMin === null
                                ? "אין-הצלחה-מדודה"
                                : ageMin < 60
                                  ? `לפני ${ageMin} דק'`
                                  : `לפני ${(ageMin / 60).toFixed(1)} ש'`;
                            return (
                              <span
                                key={b.workflow}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] ${
                                  fresh
                                    ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                                    : "border-amber-500/30 bg-amber-500/[0.07] text-amber-400"
                                }`}
                                dir="ltr"
                                title={`ריצה-אחרונה: ${b.event} · סיום: ${b.conclusion}`}
                              >
                                {b.workflow}
                                <b className="font-black">{b.conclusion}</b>
                                <span className="text-zinc-400">{age}</span>
                              </span>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[9px] leading-4 text-zinc-500">
                          המכונה-האמיתית היא התאום-הציבורי (R71 · קדנס-שעתי) — העתק-המקור ב-saos-dex הוא גיבוי-dispatch
                          בלבד והריצה-שנשלחה-ממתינה-למכסת-ריפו-פרטי (כנה). המצב-על-השרשרת מתקדם: הסנאפשוט
                          נחתם-על-ידי-הדופק-עצמו.
                        </p>
                      </div>
                    )}
                    <p className="mt-2 text-[9px] leading-4 text-zinc-500">
                      נמדד-חי מה-API בכל-בקשה ({gate.barriers.repo}) · ◆ = מנוע-הזרימה-הכלכלית ·
                      הריצות עצמן נשלטות-על-ידי ה-cron-של-המנוע בקאנון — כאן נמדד רק שהשער-הכלכלי פתוח.
                    </p>
                  </div>
                )}

                {/* תיקוני-הדלת */}
                {(actions?.commits ?? []).length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] font-black text-zinc-400">תיקוני-הדלת שהוזרקו לקאנון:</p>
                    <ul className="space-y-1">
                      {(actions?.commits ?? []).map((c) => (
                        <li key={c.sha} className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-[10px]">
                          <span className="font-mono font-bold text-amber-400" dir="ltr">
                            {c.sha.slice(0, 7)}
                          </span>
                          <span className="min-w-0 break-words text-zinc-400">{c.fix}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[9px] leading-5 text-zinc-500">
                  <b className="font-black text-zinc-400">החוק (P0-1):</b> אף ערך-מפתח לא נכתב לדיסק, ללוג, לקבלה או לממשק —
                  רק פסקי-דין, שמות-קבצים ועובדות-שרשרת פומביות. אטימת-ה-WIF מתבצעת ב-Actions בלבד (sealed-box מול
                  מפתח-הציבורי של כספת-המנוע).
                </p>

                {(gate?.errors?.length ?? 0) > 0 && (
                  <div className="mt-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 text-[10px] text-rose-200">
                    {(gate?.errors ?? []).map((e, i) => (
                      <p key={i} className="break-words">
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              !gateErr && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-[11px] text-amber-200">
                  הקבלה לא נמדדה — לא-מצויר, לא-מומצא.
                </div>
              )
            )}
          </>
        )}
      </section>
    </Reveal>
  );
}

/* ═══ המסך ═══ */
export function SovereigntyView() {
  const [data, setData] = useState<SovereigntyPayload | null>(null);
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
      const res = await fetch("/api/giant/sovereignty", { cache: "no-store", signal: ac.signal });
      const j = (await res.json()) as SovereigntyPayload & { error?: string };
      if (!alive.current) return;
      if (!res.ok || j.ok === false || j.error || !Array.isArray(j.repos)) {
        setErr(j.error ?? `ערוץ-הריבונות השיב HTTP ${res.status}`);
        setData(null);
      } else {
        setData(j);
        setErr("");
      }
    } catch (e) {
      if (!alive.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setErr(e instanceof Error ? e.message.slice(0, 200) : "המדידה-נכשלה");
      setData(null);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const iv = setInterval(() => void load(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(iv);
      acRef.current?.abort();
    };
  }, [load]);

  /* fail-honest: הבאנר מבטיח מדידה-חוזרת בעוד 15 שניות — ומדידה-חוזרת באמת */
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => void load(), RETRY_MS);
    return () => clearTimeout(t);
  }, [err, load]);

  /* ---------- נגזרות-מדידה בלבד (אפס-מספרים-מצוירים) ---------- */
  const repos: RepoInfo[] = data?.repos ?? [];
  const fleet = data?.fleet ?? null;
  const nodes: FleetNode[] = fleet?.nodes ?? [];
  const sources: AgentSource[] = data?.agents?.sources ?? [];
  const identities: AgentIdentity[] = data?.agents?.identities ?? [];
  const families: GiantFamily[] = data?.giants?.families ?? [];
  const lessons: Lesson[] = data?.lessons ?? [];
  const archaeology: ArchaeologyEntry[] = data?.archaeology ?? [];
  const ours = data?.giants?.ours ?? null;
  const measuredAt = safeTime(data?.at);
  const payloadErrors: string[] = data?.errors ?? [];
  const survivedCount = repos.filter((r) => r.hasRemote && r.dirtyCount === 0).length;
  const dirtyReposCount = repos.filter((r) => r.hasRemote && r.dirtyCount > 0).length;
  const noRemoteCount = repos.filter((r) => !r.hasRemote).length;
  const agentsTotal = isFiniteNum(data?.agents?.total) ? (data?.agents?.total as number) : null;
  const giantsFamilies = data?.giants ? families.length : null;

  /* ─── מצב-כשל: הערוץ-עוד-לא-עולה — באנר-אדום-ענבר + ניסיון-חוזר ─── */
  if (err && !data) {
    return (
      <div className="space-y-5" dir="rtl">
        <section
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-gradient-to-l from-rose-500/[0.08] via-amber-500/[0.06] to-transparent p-6 backdrop-blur-xl"
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400"
              aria-hidden
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-black leading-6 text-rose-200">
                ערוץ-הריבונות עוד לא עולה — מדידה חוזרת בעוד 15 שניות
              </h3>
              <p className="mt-1 break-all font-mono text-[10px] leading-5 text-rose-300/70" dir="ltr">
                {err}
              </p>
              <button
                onClick={() => void load()}
                disabled={busy}
                className="mt-3 flex min-h-[36px] items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 text-xs font-bold text-amber-300 transition hover:bg-amber-500/[0.14] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
                מדוד-עכשיו
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ─── מצב-טעינה: שלדים בלבד — אפס-נתונים-מצוירים ─── */
  if (!data) {
    return (
      <div className="space-y-5" dir="rtl" aria-busy="true">
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-6 backdrop-blur-xl">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="mt-4 h-12 w-2/3" />
          <Skeleton className="mt-4 h-4 max-w-xl" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        </section>
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
        <p className="text-center text-[10px] text-zinc-600">
          מודד את-המכונה — אפס-נתונים-מצוירים עד-שהמדידה-חוזרת
        </p>
      </div>
    );
  }

  /* ─── ההגשה-המלאה ─── */
  const fs = fleet?.summary;
  return (
    <div className="space-y-5" dir="rtl">
      {/* 1 · גיבור: הרעיון-האחד, סוף-סוף-נאמר */}
      <Reveal>
        <section
          id="sovereignty-hero"
          className="giant-spec relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-bl from-zinc-900 via-zinc-900/60 to-zinc-950 p-6 sm:p-8"
        >
          <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-amber-600/10 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 -right-10 h-44 w-44 rounded-full bg-emerald-600/[0.06] blur-3xl" aria-hidden />
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">
              ההגשה-הסופית · הרעיון-האחד · אפס-סימולציה
            </p>
            <h2 className="mt-2 font-black leading-[1.08] tracking-tight">
              <span className="giant-wordmark text-4xl sm:text-6xl">הריבונות חיה בגיט</span>
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
              הסנדבוקס נמחק — הממשק הזה רק מציג. מתחת: כל תיקיות הגיט, כל הצי, ההשוואה מול הענקים, והלקחים.
              הכל נמדד עכשיו, מהמכונה האמיתית.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="ריפו-מקומיים" value={isFiniteNum(data.localRepoCount) ? data.localRepoCount : null} />
              <Kpi label="צמתים-חיים · צי-הגיט" value={fs && isFiniteNum(fs.live) ? fs.live : null} />
              <Kpi label="סוכנים-בצי" value={agentsTotal} />
              <Kpi label="משפחות-ענקים-נמדדות" value={giantsFamilies} />
              <Kpi label="משימות-בארכיון" value={archaeology.length} />
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
              נמדד {measuredAt ?? "—"}
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-zinc-600" dir="ltr">/api/giant/sovereignty</span>
              {payloadErrors.length > 0 && (
                <span className="text-amber-400/80">· כשלי-חלקים: {payloadErrors.length} (מפורטים-למטה)</span>
              )}
            </p>
          </div>
        </section>
      </Reveal>

      {/* כשלי-חלקים-מדווחים-מהשרת — כנות-מלאה, לא-בולעים */}
      {payloadErrors.length > 0 && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-3 text-[11px] leading-5 text-amber-200/80">
          <b className="font-black">כשלי-חלקים-מדווחים-מהשרת (השאר-נמדד-ומוצג):</b>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {payloadErrors.map((e, i) => (
              <li key={`${i}-${e.slice(0, 16)}`} className="font-mono text-[10px]" dir="auto">
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2 · מבחן-ההישרדות — ההנחיה-של-הבעלים עצמו, עשויה-אור */}
      <Reveal>
        <section
          id="survival"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
        >
          <SectionHead
            kicker="הבעלים-נגד-הסנדבוקס · מה-שורד-מחיקה"
            title="מבחן-ההישרדות"
            side={
              <span className="text-[10px] text-zinc-500">
                <span className="font-bold text-emerald-400">{survivedCount}</span> שרדו ·{" "}
                <span className="font-bold text-amber-400">{dirtyReposCount}</span> דיפוק ·{" "}
                <span className="font-bold text-rose-400">{noRemoteCount}</span> בלי-רימוט
              </span>
            }
          />
          <div className="flex flex-wrap gap-2">
            {repos.map((r) => {
              const survives = r.hasRemote && r.dirtyCount === 0;
              const cls = survives
                ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
                : r.hasRemote
                  ? "border-amber-500/35 bg-amber-500/[0.06] text-amber-300"
                  : "border-rose-500/35 bg-rose-500/[0.06] text-rose-300";
              const txt = survives
                ? "שרד"
                : r.hasRemote
                  ? `דיפוק: ${fmtInt(r.dirtyCount)} קבצים — יאבדו במחיקה`
                  : "בלי רימוט — ימות עם הסנדבוקס";
              return (
                <span
                  key={r.path}
                  title={r.path}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold ${cls}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      survives ? "bg-emerald-400" : r.hasRemote ? "bg-amber-400" : "bg-rose-400"
                    }`}
                    aria-hidden
                  />
                  <span className="font-mono" dir="ltr">{r.name}</span>
                  <span className="font-normal opacity-90">· {txt}</span>
                </span>
              );
            })}
            {repos.length === 0 && <p className="text-xs text-zinc-500">אף-ריפו לא נמדד — אפס-המצאה</p>}
          </div>
          {data.survival?.verdict && (
            <p className="mt-3 border-r-2 border-amber-500/60 pr-3 text-sm font-black leading-6 text-zinc-100">
              {data.survival.verdict}
            </p>
          )}
        </section>
      </Reveal>

      {/* 3 · צי-הריפו — כל-תיקיות-הגיט, כרטיס-לכל-אחת */}
      <Reveal>
        <section
          id="repos"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
        >
          <SectionHead
            kicker="כל-תיקיות-הגיט · נמדדו-עכשיו-מהמכונה"
            title="צי-הריפו-המקומי"
            side={
              <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                {repos.length} ריפו
                {isFiniteNum(data.endpoints?.files) ? ` · ${fmtInt(data.endpoints.files)} נקודות-קצה` : ""}
              </span>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((r) => (
              <RepoCard key={r.path} repo={r} />
            ))}
          </div>
          {data.endpoints?.note && (
            <p className="mt-2 text-[10px] leading-5 text-zinc-600">{data.endpoints.note}</p>
          )}
        </section>
      </Reveal>

      {/* 4 · מפת-הצי — צמתים · קשתות · חיים · חמושים */}
      <Reveal>
        <section
          id="fleet-graph"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
        >
          <SectionHead
            kicker="FLEET-GRAPH · מפת-הצי-הקנונית"
            title="צי-הסוכנים-והמשטחים"
            side={
              fs ? (
                <span className="font-mono text-[10px] tabular-nums text-zinc-500" dir="ltr">
                  {fmtInt(fs.nodes)}n · {fmtInt(fs.edges)}e
                </span>
              ) : undefined
            }
          />
          {fs ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {[
                  { he: "צמתים", v: fmtInt(fs.nodes) },
                  { he: "קשתות", v: fmtInt(fs.edges) },
                  { he: "חיים", v: fmtInt(fs.live) },
                  { he: "חמושים", v: fmtInt(fs.armed) },
                  { he: "ריפו-פעילים-24ש׳", v: String(fs.reposActive24h ?? "—") },
                ].map((c) => (
                  <span
                    key={c.he}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-zinc-400"
                  >
                    {c.he} <span className="font-mono font-bold tabular-nums text-amber-300">{c.v}</span>
                  </span>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-1.5">
                  {nodes.map((n) => (
                    <NodeChip key={n.id} node={n} />
                  ))}
                </div>
                {nodes.length === 0 && (
                  <p className="text-xs text-zinc-500">מפת-הצי לא החזירה-צמתים — אפס-המצאה</p>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs leading-6 text-zinc-400">
              מפת-הצי לא נמדדה במדידה-הזאת — לא-מצוירת, לא-מומצאת.
            </p>
          )}
        </section>
      </Reveal>

      {/* 5 · מפקד-הסוכנים — הבעלים צדק */}
      <Reveal>
        <section
          id="agents"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
        >
          <SectionHead
            kicker="agent-registry · ספירה-לפי-מקור-אמת"
            title="מפקד-הסוכנים"
            side={
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Users className="h-3.5 w-3.5 text-amber-500/60" aria-hidden />
                {sources.length} מקורות · {identities.length} זהויות
              </span>
            }
          />
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <p className="text-[10px] text-zinc-500">סוכנים-אמת (סכום-המקורות-האמיתיים-בלבד)</p>
              <p className="font-mono text-5xl font-black tabular-nums text-amber-300 sm:text-6xl">
                {isFiniteNum(agentsTotal) ? (
                  <CountUp target={agentsTotal} format={fmtInt} />
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </p>
            </div>
            <p className="max-w-md text-[11px] leading-6 text-zinc-500">
              הבעלים צדק — הרבה יותר מ6 סוכנים. הנה הספירה האמיתית לפי מקור.
            </p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-xs">
              <thead className="text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-2">מקור</th>
                  <th className="px-2 py-2">ספירה</th>
                  <th className="px-2 py-2">אמת?</th>
                  <th className="px-2 py-2">נתיב-הוכחה</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={`${s.path}::${s.name}`} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-2 py-2 font-bold text-zinc-200">{s.name}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-amber-300">{fmtInt(s.count)}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                          s.real
                            ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/[0.07] text-rose-400"
                        }`}
                      >
                        {s.real ? "אמת" : "סינתטי-לא-נספר"}
                      </span>
                    </td>
                    <td className="max-w-[240px] px-2 py-2">
                      <span
                        className="block truncate font-mono text-[10px] text-zinc-500"
                        dir="ltr"
                        title={s.path}
                      >
                        {s.path}
                      </span>
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-zinc-500">
                      אין-מקורות-ספירה — לא-נמדד
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {identities.map((idn) => (
              <IdentityCard key={`${idn.source}::${idn.agentId}`} identity={idn} />
            ))}
          </div>
          {identities.length === 0 && (
            <p className="mt-2 text-[10px] text-zinc-600">אין-זהויות-סוכן-מדודות במדידה-הזאת</p>
          )}
        </section>
      </Reveal>

      {/* 5.5 · ביקורת-חיות-הצי (T62) — קבלת-הביקורת מול דיאל-TCP-חי, שתי-מישורי-מדידה */}
      <FleetAuditSection audit={data.audit ?? null} />

      {/* 5.7 · השער (T64) — המפתח אומת ביט-מול-ביט מול השרשרת-החיה ונאטם לכספת-המנוע */}
      <GateSection />

      {/* 6 · ההשוואה מול הענקים — נמדדה, לא סיפור */}
      <Reveal>
        <section
          id="giants"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
        >
          <SectionHead
            kicker="DefiLlama · נמדד-keyless · ממוין-כפי-שנמסר"
            title="ההשוואה מול הענקים — נמדדה, לא סיפור"
            side={<Landmark className="h-4 w-4 text-amber-500/60" aria-hidden />}
          />
          {data.giants ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-right text-xs">
                  <thead className="text-[10px] uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-2">משפחה</th>
                      <th className="px-2 py-2">טיר</th>
                      <th className="px-2 py-2">עמלות-24ש׳</th>
                      <th className="px-2 py-2">ווליום-24ש׳</th>
                    </tr>
                  </thead>
                  <tbody>
                    {families.map((f) => (
                      <tr key={f.id} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                        <td className="px-2 py-2 font-bold text-zinc-200">{f.name}</td>
                        <td className="px-2 py-2">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold text-zinc-400">
                            {f.tier}
                          </span>
                        </td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{fmtUsd(f.fees24h)}</td>
                        <td className="px-2 py-2 font-mono font-semibold tabular-nums text-zinc-100">
                          {fmtUsd(f.vol24h)}
                        </td>
                      </tr>
                    ))}
                    {ours && (
                      <tr className="border-t-2 border-amber-600/50 bg-amber-500/[0.05]" title={ours.note}>
                        <td className="px-2 py-2 font-black text-amber-300">
                          {ours.name}
                          <span className="mr-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] text-amber-300">
                            אנחנו
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[10px] text-zinc-500">—</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-amber-300/80">{fmtUsd(ours.fees24h)}</td>
                        <td className="px-2 py-2 font-mono font-bold tabular-nums text-amber-300">
                          {fmtUsd(ours.vol24h)}
                        </td>
                      </tr>
                    )}
                    {families.length === 0 && !ours && (
                      <tr>
                        <td colSpan={4} className="px-2 py-3 text-center text-zinc-500">
                          הליגה לא נמדדה — אפס-המצאה
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {ours && <p className="mt-2 text-[11px] leading-5 text-amber-200/80">{ours.note}</p>}
              <p className="mt-2 text-[10px] leading-5 text-zinc-600">
                שיטת-המדידה: <span dir="auto">{data.giants.method}</span>
                {data.giants.publishedAt && safeDate(data.giants.publishedAt) && (
                  <span> · פורסם {safeDate(data.giants.publishedAt)}</span>
                )}
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs leading-6 text-zinc-400">
              ספר-הענקים לא נמדד במדידה-הזאת — לא-מצויר, לא-מומצא.
            </p>
          )}
        </section>
      </Reveal>

      {/* 7 · הלקחים — הלמידה מהכשלים, עשויה-חוק */}
      <Reveal>
        <section id="lessons">
          <SectionHead
            kicker="הלמידה-מהכשלים · מהעבר-לחוק"
            title="הלקחים"
            side={
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500/60" aria-hidden />
                {lessons.length} חוקים-נולדו-מכשלים
              </span>
            }
          />
          <div className="space-y-2.5">
            {lessons.map((l, i) => (
              <LessonCard key={`${l.date}::${l.title}`} lesson={l} index={i} />
            ))}
            {lessons.length === 0 && (
              <p className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 text-xs text-zinc-500">
                אין-לקחים-מדודים במדידה-הזאת — לא-מצוירים
              </p>
            )}
          </div>
        </section>
      </Reveal>

      {/* 8 · ארכיון-השיחה */}
      <Reveal>
        <section
          id="archaeology"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5"
        >
          <SectionHead
            kicker="הארכאולוגיה-של-הבנייה · T51→T61"
            title="ארכיון-השיחה"
            side={
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Archive className="h-3.5 w-3.5 text-amber-500/60" aria-hidden />
                {archaeology.length} משימות-מתועדות
              </span>
            }
          />
          <div className="max-h-64 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {archaeology.map((a) => (
                <p key={a.task} className="flex items-baseline gap-2 text-[11px] leading-5" title={a.summary}>
                  <span className="shrink-0 font-mono text-[10px] font-bold text-amber-400" dir="ltr">
                    {a.task}
                  </span>
                  <span className="truncate text-zinc-400">{a.summary}</span>
                </p>
              ))}
              {archaeology.length === 0 && (
                <p className="text-xs text-zinc-500">הארכיון לא נמדד — אפס-המצאה</p>
              )}
            </div>
          </div>
        </section>
      </Reveal>

      {/* 9 · שורת-האמת של-העמוד */}
      <Reveal>
        <p className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-center text-[11px] leading-6 text-zinc-500">
          כל המספרים בעמוד הזה נמדדו מהמכונה ברגע הטעינה — sha16{" "}
          <span className="font-mono text-zinc-400" dir="ltr">{data.sha16 || "—"}</span>. אפס-סימולציה.
        </p>
      </Reveal>
    </div>
  );
}
