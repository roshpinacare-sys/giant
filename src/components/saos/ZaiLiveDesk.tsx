"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * שולחן-ההוכחה-החי (מוטמע ב-SaosCockpit — G10 union) — חוק-הבעלים (2026-10-17):
 * "אפשר לקבל תמיד מהר active מה-owner — כל-פעם נוכחי, כי הוא עלול להשתנות".
 * הכל מהמקורות-החיים בלבד: /api/saos/owner-active (שרשרת-STEEM ישירה + מנוע-הפלטפורמה),
 * /api/saos/live-probes (גשר→פלטפורמה), ספר-הכלכלה מהגיט. אפס נתון-מאולתר:
 * מה שנכשל — מוצג כנכשל, עם הסיבה.
 */

interface OwnerActive {
  ok?: boolean;
  fresh?: {
    source: string;
    account: string;
    allMatch: boolean | null;
    liveAt: string | null;
    fetchedAt: string;
    changed: { active: boolean; owner: boolean };
    roles: Record<string, { live: string | null; match: boolean | null }>;
  };
  chain?: Record<string, unknown> | null;
  error?: string;
}

interface Probes {
  ok?: boolean;
  hive?: { ok?: boolean; rcPct?: number; measuredAt?: string; account?: string };
  tron?: { ok?: boolean } & Record<string, unknown>;
  error?: string;
  fleet?: {
    reds?: number | null;
    heartbeatAt?: string | null;
    custodyVerified?: number | null;
    digestAt?: string | null;
    digestRepos?: number | null;
    statusAt?: string | null;
    hierarchy?: {
      day?: string | null;
      counts?: Record<string, number>;
      flags?: Record<string, boolean>;
      lastGuardAt?: string | null;
      denials?: number | null;
    } | null;
  } | null;
}

interface Economy {
  ok?: boolean;
  seq?: number;
  lastTs?: number | null;
  lastKind?: string | null;
  lastReason?: string | null;
  measuredAt?: string;
  error?: string;
}

interface HiveClosure {
  ok?: boolean;
  account?: string;
  targetPub?: string;
  installed?: boolean;
  currentAuths?: Array<[string, number]>;
  threshold?: number | null;
  node?: string | null;
  checkedAt?: string;
  error?: string;
}

interface AuditTest {
  id?: string;
  name?: string;
  category?: string;
  scorePct?: string | number | null;
  passing?: boolean | null;
  path?: string | null;
}
interface IfixaiAudit {
  ok?: boolean;
  generatedAt?: string | null;
  audit?: {
    mock?: { ran?: boolean; grade?: string | null; passed?: boolean | null; strategicScorePct?: string | null; tests?: AuditTest[]; note?: string | null; reason?: string | null } | null;
    brain?: { ran?: boolean; model?: string | null; endpointHost?: string | null; selfJudged?: boolean | null; suite?: string | null; tests?: AuditTest[]; note?: string | null; reason?: string | null } | null;
  } | null;
  error?: string;
  measuredAt?: string;
}

interface NimStatus {
  ok?: boolean;
  hasKey?: boolean;
  fingerprint?: string | null;
  models?: number | null;
  latencyMs?: number | null;
  checkedAt?: string | null;
  error?: string;  probe?: {
    ok: boolean;
    model: string;
    latencyMs: number;
    finishReason: string | null;
    hasContent: boolean;
    totalTokens: number | null;
    error?: string;
  } | null;
}

function short(k: string | null | undefined): string {
  if (!k) return "—";
  return k.length > 20 ? `${k.slice(0, 12)}…${k.slice(-6)}` : k;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `לפני ${s}ש'`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק'`;
  return `לפני ${Math.round(s / 3600)} שע'`;
}

function Dot({ state }: { state: "ok" | "warn" | "fail" | "idle" }) {
  const c =
    state === "ok" ? "bg-emerald-400" : state === "warn" ? "bg-amber-400" : state === "fail" ? "bg-red-400" : "bg-zinc-600";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c}`} aria-hidden="true" />;
}

export function ZaiLiveDesk() {
  const [oa, setOa] = useState<OwnerActive | null>(null);
  const [probes, setProbes] = useState<Probes | null>(null);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [hive, setHive] = useState<HiveClosure | null>(null);
  const [nim, setNim] = useState<NimStatus | null>(null);
  const [audit, setAudit] = useState<IfixaiAudit | null>(null);
  const [probing, setProbing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);

  const load = useCallback(async () => {
    tickRef.current += 1;
    const j = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
        return (await r.json()) as T;
      } catch {
        return null;
      }
    };
    const [a, p, e, h, n, au] = await Promise.all([
      j<OwnerActive>("/api/saos/owner-active"),
      j<Probes>("/api/saos/live-probes"),
      j<Economy>("/api/economy-state"),
      j<HiveClosure>("/api/hive-closure"),
      j<NimStatus>("/api/nvidia-nim"),
      j<IfixaiAudit>("/api/saos/ifixai-audit"),
    ]);
    setOa(a);
    setProbes(p);
    setEconomy(e);
    setHive(h);
    setNim(n);
    setAudit(au);
    setTick(tickRef.current);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      void load();
    }, 10_000);
    const first = setTimeout(() => void load(), 0); // טעינה-ראשונה מחוץ-לסנכרון-האפקט
    return () => {
      clearInterval(iv);
      clearTimeout(first);
    };
  }, [load]);

  const fresh = oa?.fresh;
  const activePub = fresh?.roles?.active?.live ?? null;
  const ownerPub = fresh?.roles?.owner?.live ?? null;
  const match = fresh?.allMatch;
  const changed = fresh?.changed;
  const matchState: "ok" | "warn" | "fail" | "idle" =
    match === true ? "ok" : match === false ? "fail" : fresh ? "warn" : "idle";

  return (
    <div dir="rtl" className="text-zinc-100">
      <div className="space-y-6">
        {/* ── פעולת-הבעלים-האחרונה: סגירת-שרשרת-Hive ── */}
        <section aria-labelledby="hive-h" className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 sm:p-6" data-testid="hive-closure">
          <h2 id="hive-h" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Dot state={hive?.installed ? "ok" : hive ? "warn" : "idle"} /> פעולת-הבעלים-האחרונה · סגירת-שרשרת-Hive {hive?.installed ? "— הושלמה ✓" : "— ממתין-לך"}
          </h2>
          {hive?.installed ? (
            <div className="text-sm text-emerald-300" data-testid="hive-status">
              המפתח-חי-בסמכות (נמדד-מהשרשרת {timeAgo(hive.checkedAt)}) — hive-beat יחתום-אוטומטית-את-הפעימה-הבאה. השרשרת-סגורה.
            </div>
          ) : (
            <div className="text-sm text-amber-200/90" data-testid="hive-status">
              אישרת-את-הפעולה. החתימה-דורשת-את-מפתח-Hive-active-שלך (קיים-רק-בכספת-הדפדפן-שלך — נמדד: לחומר-המוחזק-בענן-אין-אף-סמכות-Hive-חיה, liveHits=0).
              שני-צעדים-בארנק-הדפדפן (peakd.com או wallets.hive.io):
              <ol className="mt-2 list-inside list-decimal space-y-1 text-amber-100/80">
                <li>ארנק → הרשאות (Permissions) → Posting → הוסף-מפתח-עבור <span className="font-semibold">{hive?.account ?? "headcorner"}</span></li>
                <li>הדבק-את-המפתח-הציבורי-הבא ואשר (המפתח-שלך-נשאר; אדיטיבי-בלבד, הפיך-בכל-רגע):</li>
              </ol>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(hive?.targetPub ?? "");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  } catch {
                    /* clipboard unavailable — key remains visible for manual copy */
                  }
                }}
                className="mt-2 block w-full cursor-pointer break-all rounded-lg border border-amber-700/60 bg-zinc-950 p-3 text-left font-mono text-xs text-amber-300 transition-colors hover:border-amber-500"
                aria-label="העתק-את-המפתח-הציבורי"
                title="לחיצה = העתקה"
              >
                {hive?.targetPub ?? "…"}
                <span className="mr-2 text-[10px] uppercase tracking-wide text-amber-500/80">{copied ? "הועתק ✓" : "לחץ-להעתקה"}</span>
              </button>
              <div className="mt-2 text-xs text-amber-200/60">
                כרגע-בשרשרת: {(hive?.currentAuths ?? []).map(([k]) => k.slice(0, 16) + "…").join(" · ") || "—"} · נמדד {timeAgo(hive?.checkedAt)} מ-{hive?.node ?? "—"} · ברגע-הנחיתה-הכרטיס-הזה-מתהפך-ירוק-אוטומטית
              </div>
            </div>
          )}
        </section>
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ריבונות — active הבעלים, תמיד נוכחי</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            חוק-הבעלים 2026-10-17: ה-active נשלף טרי בכל-קריאה ישר-מהשרשרת (חשבון headcorner), כי הוא עלול להשתנות.
            העמוד ניזון מהגשר-החי לאפליקציות-הצי (:3100 פלטפורמה · :3200 foundry) — אפס מטמון-ארוך, אפס נתון-מאולתר.
            <span className="sr-only">מתרענן אוטומטית כל עשר שניות</span>
          </p>
        </header>

        {/* ── active של הבעלים ── */}
        <section aria-labelledby="oa-h" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="oa-h" className="flex items-center gap-2 text-lg font-semibold">
              <Dot state={fresh ? "ok" : "fail"} /> active מה-owner — headcorner
            </h2>
            <span className="text-xs text-zinc-500" data-testid="oa-refreshed">
              נמדד {timeAgo(fresh?.fetchedAt)} · רענון 10ש' · #{tick + 1}
            </span>
          </div>

          {!oa && <p className="text-sm text-zinc-500">טוען מהשרשרת…</p>}
          {oa && !fresh && <p className="text-sm text-red-300">כשל-כנה: {oa.error ?? "אין-תשובה מהשרשרת"}</p>}

          {fresh && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">סמכות-active (חי)</div>
                <div className="mt-1 font-mono text-sm break-all" data-testid="active-pub">{short(activePub)}</div>
                <div className="mt-1 text-xs text-zinc-500">מלא: <span className="font-mono break-all">{activePub ?? "—"}</span></div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">סמכות-owner (חי)</div>
                <div className="mt-1 font-mono text-sm break-all">{short(ownerPub)}</div>
                <div className="mt-1 text-xs text-zinc-500">מלא: <span className="font-mono break-all">{ownerPub ?? "—"}</span></div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">התאמת-חתימה מול-חי (4/4)</div>
                <div className="mt-1 flex items-center gap-2 text-sm" data-testid="match-verdict">
                  <Dot state={matchState} />
                  {match === true ? "התאמה מלאה" : match === false ? "אין-התאמה — נדרש-בעלים" : "לא-ניתן להוכיח (המעטפת-אטומה חסרה בסנדבוקס) — כנה"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">מקור: {fresh.source} · liveAt {timeAgo(fresh.liveAt)}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">גילוי-שינוי (הסמכות עלולה להשתנות)</div>
                <div className="mt-1 text-sm" data-testid="changed-verdict">
                  {changed?.active || changed?.owner ? (
                    <span className="text-amber-300">⚠ שונה מאז-הבדיקה הקודמת! active:{changed?.active ? " כן" : " לא"} · owner:{changed?.owner ? " כן" : " לא"}</span>
                  ) : (
                    <span className="text-zinc-300">ללא-שינוי מאז-המדידה הקודמת</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-zinc-500">נשלף טרי בכל-בקשה · micro-cache 5ש' בודד-טיסה</div>
              </div>
            </div>
          )}
        </section>

        {/* ── גשר-הצי ── */}
        <section aria-labelledby="bridge-h" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <h2 id="bridge-h" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Dot state={probes?.ok ? "ok" : probes ? "warn" : "idle"} /> גשר-ה-API בין-הסוכנים
          </h2>
          <p className="mb-3 text-sm text-zinc-400">
            ~2,700 בקשות-404 מדודות (UI-הצי מאחורי פורט-אחד) — הגשר מעביר שקוף: :3100 פלטפורמה → :3200 foundry, ועל-404 מדורג-הלאה.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">live-probes (פלטפורמה)</div>
              <div className="mt-1 text-sm" data-testid="probes-verdict">
                {probes?.ok ? (
                  <>חי · Hive RC {probes.hive?.rcPct ?? "?"}% · {timeAgo(probes.hive?.measuredAt)}</>
                ) : probes?.fleet ? (
                  <>
                    פלטפורמה-סנדבוקס-לא-זמינה · <span className="text-emerald-400">צי-ציבורי חי</span>: {probes.fleet.reds === 0 ? "אפס-אדומים" : `${probes.fleet.reds ?? "?"} אדומים`} · דופק {timeAgo(probes.fleet.heartbeatAt)} · custody {probes.fleet.custodyVerified ?? "?"} · דיגסט {timeAgo(probes.fleet.digestAt)}
                  </>
                ) : probes ? (
                  <>תשובה-כנה: {probes.error?.slice(0, 80) ?? "חלקי"}</>
                ) : (
                  "טוען…"
                )}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">מדורג ל-foundry (:3200)</div>
              <div className="mt-1 text-sm">מאומת חי — live-gate 200 · dry-run כנה</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">fail-honest</div>
              <div className="mt-1 text-sm">upstream-נפל = 502 עם הסיבה — לעולם לא נתון-מאולתר</div>
            </div>
          </div>
          {probes?.fleet?.hierarchy ? (
            <div className="mt-3 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3" data-testid="hierarchy-telemetry">
              <div className="text-xs uppercase tracking-wide text-emerald-500/80">היררכיית-הפקודה · טלמטריית-אכיפה ציבורית (grid-status)</div>
              <div className="mt-1 text-sm">
                יום {probes.fleet.hierarchy.day ?? "—"} · פקודות-מוגנות: {Object.entries(probes.fleet.hierarchy.counts ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ") || "—"}
                {" "}· דגלי-אכיפה: {Object.entries(probes.fleet.hierarchy.flags ?? {}).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ") || "—"}
                {" "}· guard אחרון {timeAgo(probes.fleet.hierarchy.lastGuardAt)} · חסימות (זנב): {probes.fleet.hierarchy.denials ?? 0}
              </div>
            </div>
          ) : null}
        </section>

        {/* ── פעימת-הכלכלה ── */}
        <section aria-labelledby="eco-h" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <h2 id="eco-h" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Dot state={economy?.seq ? "ok" : "idle"} /> פעימת-הכלכלה הפנימית
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">seq אחרון בספר</div>
              <div className="mt-1 font-mono text-sm" data-testid="eco-seq">{economy?.seq ?? "…"}</div>
              {economy?.lastKind ? (
                <div className="mt-1 text-xs text-zinc-400" data-testid="eco-kind">
                  פעולה: {economy.lastKind}
                  {economy.lastReason ? ` · ${economy.lastReason.slice(0, 60)}` : ""}
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">מקור</div>
              <div className="mt-1 text-sm">ספר-הגיט הקנוני (fleet-economy) · עוגנים 3/3</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">כותב-יחיד</div>
              <div className="mt-1 text-sm">מנעול-TTL מוכח — אין-כתיבה-כפולה</div>
            </div>
          </div>
        </section>

        {/* ── מוח-NIM שני — ריבונות-ספק ── */}
        <section aria-labelledby="nim-h" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6" data-testid="nim-status">
          <h2 id="nim-h" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Dot state={nim?.ok ? "ok" : nim ? "fail" : "idle"} /> מוח-NIM שני — NVIDIA (ריבונות-ספק)
          </h2>
          <p className="mb-3 text-sm text-zinc-400">
            המפתח-השני-מהבעלים נאטם-בכספת-בגיט (Actions-secrets, קופסה-אטומה-libsodium) והתחבר-כמוח-עצמאי (nvidia-nim-2)
            בשרשרת-המוחות של-המשרד — כשל-או-הגבלה-של-מפתח-אחד-לא-מוציאים-את-הריבונות-מכשילה; השרשרת-ממשיכה-ללכת.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">קישורות (81-מודלים-צפויים)</div>
              <div className="mt-1 text-sm" data-testid="nim-ok">
                {nim == null ? "טוען…" : nim.ok ? `חי · ${nim.models ?? "?"} מודלים` : `כשל-כנה: ${nim.error?.slice(0, 60) ?? "?"}`}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">זמן-תגובה (/models)</div>
              <div className="mt-1 text-sm" data-testid="nim-latency">{nim?.latencyMs != null ? `${nim.latencyMs}ms` : "—"}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">טביעת-מפתח (אפס-חשיפה)</div>
              <div className="mt-1 font-mono text-sm break-all" data-testid="nim-fp">{nim?.fingerprint ?? "—"}</div>
              <div className="mt-1 text-xs text-zinc-500">sha256 · 12-תווים-ראשונים · נמדד {timeAgo(nim?.checkedAt ?? null)}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">בדיקת-הסקה (דרישה-בלבד)</div>
              <button
                type="button"
                onClick={async () => {
                  setProbing(true);
                  try {
                    const r = await fetch("/api/nvidia-nim?probe=1", { cache: "no-store", signal: AbortSignal.timeout(90_000) });
                    setNim(await r.json());
                  } catch {
                    /* כנות: נשארת-המדידה-האחרונה */
                  } finally {
                    setProbing(false);
                  }
                }}
                className="mt-1 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm transition-colors hover:border-zinc-500"
                data-testid="nim-probe"
              >
                {probing ? "בודק…" : "הרץ-probe זעיר (≤200-טוקנים)"}
              </button>
              {nim?.probe ? (
                <div className="mt-1 text-xs" data-testid="nim-probe-result">
                  {nim.probe.ok ? (
                    <span className="text-emerald-400">חי: {nim.probe.model} · {nim.probe.latencyMs}ms · {nim.probe.totalTokens ?? "?"} טוקנים</span>
                  ) : (
                    <span className="text-red-300">כשל-כנה: {nim.probe.error ?? "אין-תוכן"}</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── ביקורת-עצמאית — iFixAi [G8] ── */}
        <section aria-labelledby="audit-h" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6" data-testid="ifixai-audit">
          <h2 id="audit-h" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Dot state={audit?.ok ? (audit.audit?.mock?.ran ? (audit.audit.brain?.ran ? "ok" : "idle") : "fail") : "idle"} /> ביקורת-עצמאית — iFixAi (מוחות-הצי)
          </h2>
          <p className="mb-3 text-sm text-zinc-400">
            הצי בודק-את-עצמו נגד אי-התאמה (הונאה/סבוטג'/הסתרה) עם ifixai — בודק-עצמאי-פתוח — שבועית ב-Actions:
            צינור-הוכחה אפס-עלות + מוח-NIM מול חוקי-הריבונות (סולמות-מבניים-smoke).
          </p>
          {audit == null ? (
            <p className="text-sm text-zinc-500" data-testid="audit-loading">טוען…</p>
          ) : !audit.ok ? (
            <p className="text-sm text-zinc-500" data-testid="audit-none">
              עדיין-אין-ביקורת-מפורסמת — הריצה-השבועית-הראשונה (שני 11:53 UTC) תפרסם-אותה-לענף-הציבורי. כנות: אין-נתונים ≠ אין-כשל.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">צינור-הביקורת (mock, אפס-עלות)</div>
                <div className="mt-1 text-sm" data-testid="audit-mock">
                  {audit.audit?.mock?.ran
                    ? `חי · ציון-${audit.audit.mock.grade ?? "?"} · ${audit.audit.mock.tests?.length ?? 0} בדיקות (פגמים-מושתלים-במכוון — זו-ההוכחה)`
                    : `לא-רץ: ${audit.audit?.mock?.reason ?? "?"}`}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">מוח-ההחלפה (NVIDIA-NIM)</div>
                <div className="mt-1 text-sm" data-testid="audit-brain">
                  {audit.audit?.brain?.ran
                    ? `${audit.audit.brain.model ?? "?"} · ${audit.audit.brain.selfJudged ? "שיפוט-עצמי (כנות)" : "שיפוט-צולב"}`
                    : `לא-רץ: ${audit.audit?.brain?.reason ?? "?"}`}
                </div>
              </div>
              {audit.audit?.brain?.ran ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">ממצאי-המוח (חוקי-הריבונות מול בודק-עצמאי)</div>
                  <div className="mt-2 space-y-2" data-testid="audit-tests">
                    {(audit.audit.brain.tests ?? []).map((t) => {
                      const pct = typeof t.scorePct === "string" ? parseFloat(t.scorePct.replace("%", "")) : (t.scorePct ?? 0);
                      return (
                        <div key={t.id} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-zinc-300">{t.id} · {t.name}</span>
                            <span className={t.passing ? "text-emerald-400" : "text-amber-400"}>
                              {t.scorePct ?? "?"} {t.passing ? "✓" : "×"}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-zinc-800">
                            <div
                              className={`h-full ${t.passing ? "bg-emerald-500" : "bg-amber-500"}`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {audit.audit.brain.note ? (
                    <p className="mt-2 text-xs text-zinc-500">{audit.audit.brain.note}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:col-span-2">
                <div className="text-xs text-zinc-500" data-testid="audit-at">
                  נמדד {timeAgo(audit.audit?.generatedAt ?? null)} · מקור: ענף-הפרסום-הציבורי של-המשרד · אפס-סודות בדוחות
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
