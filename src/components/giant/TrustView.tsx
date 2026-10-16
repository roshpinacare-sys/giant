"use client";

/* ═══ מפת-האמון של הצי (GIANT wave-5) ═════════════════════════════════════
 * מתודולוגיה נלמדת משני-מקורות שהבעלים הצביע-עליהם:
 * · awesome-dsh-plugin (dsh-trust-check): המדידה היא חשיפה לעולם לא פסק-דין;
 *   "לא נבדק" לעולם לא מתחפש ל"נקי"; ראיה = file:line; הסקאנר לא מריץ-קוד.
 * · skillry/opus-5-5: הצהרה-מול-תוצר זה-מול-זה + הראיה-המדויקת להעתקה חופשית
 *   + קטגוריות-מסופרות.
 * כנות: טעינה=שלדים · ריק="לא נמדד" · כשל=באנר עם-השגיאה-עצמה. אפס-סימולציה. */

import { useCallback, useEffect, useState } from "react";
import { Recipe } from "@/components/giant/Recipe";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check, Copy, ScanSearch, ShieldCheck, TriangleAlert } from "lucide-react";

interface TrustSignal {
  rule: string;
  path: string;
}
interface DeepScan {
  at: string;
  files: number;
  bytes: number;
  hits: Array<{ rule: string; file: string; line: number }>;
  note: string | null;
}
interface TrustRow {
  name: string;
  pushedAt: string | null;
  description: string | null;
  mode: "tree" | "unscanned";
  scannedAt: string | null;
  ageMinutes: number | null;
  files: number | null;
  capabilities: string[];
  signals: TrustSignal[];
  redLines: TrustSignal[];
  deep: DeepScan | null;
  error: string | null;
}
interface TrustPayload {
  ok: boolean;
  note?: string;
  scanner: string;
  summary: {
    total: number | null;
    scanned: number;
    unscanned: number;
    signals: number;
    redLines: number;
    capCombos: Array<{ combo: string; count: number }>;
  };
  rows: TrustRow[];
  measuredAt: string;
}

const HE_CAP: Record<string, string> = {
  api: "API",
  front: "ממשק",
  db: "בסיס-נתונים",
  workflows: "אוטומציה",
  docs: "תיעוד",
  tests: "בדיקות",
  scripts: "סקריפטים",
};
const HE_RULE: Record<string, string> = {
  "mock-path": "נתיב-mock",
  "fake-path": "נתיב-fake",
  "simulate-path": "נתיב-סימולציה",
  "placeholder-path": "נתיב-placeholder",
  "stub-path": "נתיב-stub",
  "sample-path": "נתיב-sample/demo",
  "todo-path": "נתיב-טיוטה",
  "secrets-file-present": "קובץ-סודות-פוטנציאלי",
  "keyfile-present": "קובץ-מפתח-פוטנציאלי",
  "SIM-RANDOM": "Math.random בקוד",
  "SIM-MARKER": "סימן-סימולציה בקוד",
  "PLAIN-HTTP": "http גלוי (לא-localhost)",
  "SECRET-SHAPED": "מבנה-סוד זוהה (ללא תוכן)",
};

function ageHe(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}

function ComboHe(combo: string): string {
  if (combo === "עץ-ריק-נמדד") return combo;
  return combo
    .split("+")
    .map((c) => HE_CAP[c] ?? c)
    .join("+");
}

function RowCard({ row, onDeep, deepBusy }: { row: TrustRow; onDeep: (name: string) => void; deepBusy: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const flagged = row.signals.length + row.redLines.length;
  const unscanned = row.mode === "unscanned";

  const evidence = `# ראית-אמון · ${row.name} · scanner saos-trust-check\nmode=${row.mode} scannedAt=${row.scannedAt ?? "—"} files=${row.files ?? "—"}\ncapabilities=${row.capabilities.join(",") || "—"}\nsignals=${row.signals.map((s) => `${s.rule}:${s.path}`).join("\n  ") || "—"}\nredLines=${row.redLines.map((s) => `${s.rule}:${s.path}`).join("\n  ") || "—"}${row.error ? `\nerror=${row.error}` : ""}`;

  const copyEvidence = async () => {
    try {
      await navigator.clipboard.writeText(evidence);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* חסימת-clipboard — כנה, ללא-הצגת-הצלחה-שקרית */
    }
  };

  return (
    <div className={`rounded-xl border ${unscanned ? "border-amber-600/30 bg-amber-500/[0.03]" : flagged > 0 ? "border-white/10 bg-zinc-900/40" : "border-white/5 bg-zinc-900/40"}`} dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 px-3 py-2 text-right"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <b className="truncate text-sm font-bold text-zinc-100">{row.name}</b>
            {row.mode === "tree" ? (
              <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-bold text-emerald-400">נסרק</span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                <TriangleAlert className="h-2.5 w-2.5" aria-hidden /> לא נבדק
              </span>
            )}
            {row.redLines.length > 0 && (
              <span className="shrink-0 rounded-full border border-rose-500/30 bg-rose-500/5 px-2 py-0.5 text-[9px] font-bold text-rose-400">{row.redLines.length} קווים-אדומים</span>
            )}
            {row.signals.length > 0 && (
              <span className="shrink-0 rounded-full border border-white/10 bg-zinc-950 px-2 py-0.5 text-[9px] font-bold text-zinc-400">{row.signals.length} סימנים</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
            {row.capabilities.length > 0 ? row.capabilities.map((c) => HE_CAP[c] ?? c).join(" · ") : row.mode === "tree" ? "אף-יכולת-נמדדה (עץ-ריק/תיעוד-בלבד)" : row.error ?? "לא נבדק"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-zinc-600">
          {row.files !== null ? `${row.files.toLocaleString("en-US")} קבצים` : "—"} · {ageHe(row.ageMinutes)}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/5 px-3 py-3">
          {/* skillry: הצהרה-מול-מדידה, זה-מול-זה */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/5 bg-zinc-950/60 p-2.5">
              <p className="mb-1 text-[9px] font-black text-zinc-500">מה-הספר-מצהיר (GitHub description)</p>
              <p className="break-words text-[11px] leading-4 text-zinc-400">{row.description ?? "— (אין-הצהרה)"}</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-zinc-950/60 p-2.5">
              <p className="mb-1 text-[9px] font-black text-zinc-500">מה-המדידה-מצאה (עץ-הגיט האמיתי)</p>
              <p className="break-words text-[11px] leading-4 text-zinc-300">
                {row.mode === "tree"
                  ? `${(row.files ?? 0).toLocaleString("en-US")} קבצים · יכולות: ${row.capabilities.length > 0 ? row.capabilities.map((c) => HE_CAP[c] ?? c).join(" · ") : "אף-אחת"}`
                  : `לא נבדק — ${row.error ?? "כשל-כנה"}`}
              </p>
            </div>
          </div>

          {row.redLines.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-black text-rose-400">
                <TriangleAlert className="h-3 w-3" aria-hidden /> קווים-אדומים (שמות-נתיבים בלבד — תוכן-סודות לעולם לא נקרא)
              </p>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-2">
                {row.redLines.map((s, i) => (
                  <li key={i} className="break-all font-mono text-[10px] leading-4 text-rose-300/90">
                    {HE_RULE[s.rule] ?? s.rule} · {s.path}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {row.signals.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-black text-zinc-400">סימנים-שנמדדו בנתיבים (חשיפה — לא פסק-דין)</p>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-white/5 bg-zinc-950/60 p-2">
                {row.signals.map((s, i) => (
                  <li key={i} className="break-all font-mono text-[10px] leading-4 text-zinc-400">
                    <span className="text-zinc-600">{HE_RULE[s.rule] ?? s.rule}</span> · {s.path}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {row.deep && (
            <div className="rounded-lg border border-white/5 bg-zinc-950/60 p-2.5">
              <p className="mb-1 text-[10px] font-black text-zinc-400">סריקת-תוכן נקודתית (file:line · ללא-תוכן-שורות)</p>
              {row.deep.note ? (
                <p className="text-[11px] text-amber-400">{row.deep.note}</p>
              ) : (
                <p className="text-[10px] text-zinc-500">
                  נקראו {row.deep.files} קבצים ({row.deep.bytes.toLocaleString("en-US")} בתים) · ממצאים: {row.deep.hits.length}
                </p>
              )}
              {row.deep.hits.length > 0 && (
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                  {row.deep.hits.map((h, i) => (
                    <li key={i} className="break-all font-mono text-[10px] leading-4 text-amber-300/90">
                      {HE_RULE[h.rule] ?? h.rule} · {h.file}:{h.line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onDeep(row.name)}
              disabled={deepBusy || unscanned}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-600/30 bg-amber-500/5 px-3 text-[11px] font-bold text-amber-400 transition hover:border-amber-600/60 disabled:opacity-40"
            >
              <ScanSearch className="h-3.5 w-3.5" aria-hidden />
              סריקת-תוכן נקודתית
            </button>
            <button
              type="button"
              onClick={copyEvidence}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-950 px-3 text-[11px] font-bold text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "הועתק" : "העתק-ראיה-מדויקת"}
            </button>
            {row.scannedAt && (
              <span className="font-mono text-[10px] text-zinc-600">
                נסרק {ageHe(row.ageMinutes)} · {row.scannedAt.slice(11, 19)} UTC
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TrustView() {
  const [data, setData] = useState<TrustPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deepBusy, setDeepBusy] = useState(false);
  const [showOnly, setShowOnly] = useState<"all" | "flagged" | "unscanned">("all");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/giant/trust${force ? "?force=1" : ""}`, { cache: "no-store" });
      const d = (await res.json()) as TrustPayload;
      if (!d.ok) setErr(d.note ?? "המדידה נכשלה");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "השרת לא הגיב");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const onDeep = useCallback(
    async (name: string) => {
      setDeepBusy(true);
      try {
        const res = await fetch(`/api/giant/trust?deep=${encodeURIComponent(name)}`, { cache: "no-store" });
        const d = (await res.json()) as { ok: boolean; scan?: DeepScan; note?: string };
        setData((prev) =>
          prev
            ? { ...prev, rows: prev.rows.map((r) => (r.name === name ? { ...r, deep: d.scan ?? { at: new Date().toISOString(), files: 0, bytes: 0, hits: [], note: d.note ?? "לא נבדק" } } : r)) }
            : prev,
        );
      } catch {
        /* כשל-רשת נקודתי — הסריקה-הכללית נשארת-פתוחה */
      } finally {
        setDeepBusy(false);
      }
    },
    [],
  );

  const s = data?.summary;
  const rows = (data?.rows ?? []).filter((r) =>
    showOnly === "all" ? true : showOnly === "unscanned" ? r.mode === "unscanned" : r.signals.length + r.redLines.length > 0,
  );

  return (
    <div className="space-y-4" dir="rtl">
      {/* ראש-המודול */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black">
            <ShieldCheck className="h-5 w-5 text-amber-500" aria-hidden />
            מפת-האמון של הצי
          </h2>
          <p className="text-[11px] leading-4 text-zinc-500">
            סריקה-מדודה של כל-ספר-באימפריה: יכולות · סימנים · קווים-אדומים — <b className="text-zinc-400">חשיפה, לעולם לא פסק-דין</b>; "לא נבדק" לעולם לא מתחפש ל"נקי" (דפוס dsh-trust-check).
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 text-[11px] font-bold text-zinc-300 transition hover:border-amber-600/40 hover:text-amber-400 disabled:opacity-40"
        >
          <ScanSearch className="h-3.5 w-3.5" aria-hidden />
          סריקה-חוזרת מלאה
        </button>
      </div>

      {/* כשל-כנה */}
      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.05] p-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
          <p className="text-[11px] leading-4 text-rose-300">{err} — מפת-האמון לא נמדדה (כשל-כנה, אין-נתוני-תחליף).</p>
        </div>
      )}

      {/* פס-מדידה */}
      {!data && loading && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "ספרים-בצי", v: s.total !== null ? s.total.toLocaleString("en-US") : "—", sub: `${s.scanned} נסרקו · ${s.unscanned} לא-נבדקו` },
            { k: "סימנים-שנמדדו", v: s.signals.toLocaleString("en-US"), sub: "חשיפה — לא פסק-דין" },
            { k: "קווים-אדומים", v: s.redLines.toLocaleString("en-US"), sub: "שמות-נתיבים בלבד" },
            { k: "גיל-הסריקה", v: ageHe(data?.measuredAt ? Math.round((Date.now() - Date.parse(data.measuredAt)) / 60_000) : null), sub: data?.scanner ?? "—" },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-white/5 bg-zinc-900/40 p-3">
              <p className="text-[10px] font-bold text-zinc-500">{c.k}</p>
              <p className="mt-0.5 text-xl font-black text-zinc-100">{c.v}</p>
              <p className="text-[9px] leading-3 text-zinc-600">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* קטגוריות-מסופרות (דפוס skillry) */}
      {s && s.capCombos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.capCombos.slice(0, 10).map((c) => (
            <span key={c.combo} className="rounded-full border border-white/10 bg-zinc-900/60 px-2.5 py-1 text-[10px] font-bold text-zinc-300">
              {ComboHe(c.combo)} <span className="text-amber-500">{c.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* מסנן */}
      {data && (
        <div className="flex gap-1.5">
          {(
            [
              { id: "all", he: "הכל" },
              { id: "flagged", he: "עם-סימנים" },
              { id: "unscanned", he: "לא-נבדקו" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setShowOnly(f.id)}
              aria-pressed={showOnly === f.id}
              className={`min-h-[32px] rounded-lg border px-3 text-[11px] font-bold transition ${
                showOnly === f.id ? "border-amber-600/40 bg-amber-500/[0.06] text-amber-400" : "border-white/5 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f.he}
            </button>
          ))}
        </div>
      )}

      {/* שורות-הצי */}
      <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
        {data && rows.length === 0 && <p className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-center text-[11px] text-zinc-500">אין-שורות-בסינון-הזה (לא "נקי" — פשוט אין-התאמה).</p>}
        {rows.map((r) => (
          <RowCard key={r.name} row={r} onDeep={onDeep} deepBusy={deepBusy} />
        ))}
      </div>

      {/* המתכון-מאחורי-הפאנל (חוק prompt-motion) */}
      <Recipe
        sources={[
          "GET /repos/roshpinacare-sys/{repo}/git/trees/{branch}?recursive=1 — עץ-הגיט האמיתי (קריאה-בלבד, אפס-ריצת-קוד)",
          "GET /repos/.../contents/{path} — deep-scan נקודתי: ≤12 קבצים × ≤24KB, מדווח file:line בלבד",
          "רשימת-הצי: /api/giant/fleet (GitHub Search, org:roshpinacare-sys)",
          "מטמון: db/trust-cache.json — ספר נסרק מחדש רק כשנדחף אחרי-הסריקה שלו (RECHECK, דפוס-dsh)",
        ]}
        measuredAt={data?.measuredAt ?? null}
        failNote="חוזה-כשל: ספר-שלא-נסרק מוצג ״לא נבדק״ עם-השגיאה-עצמה — לעולם לא ריק-כהוכחת-ניקיון; תוכן-קבצי-סודות לעולם לא נקרא ולא מדווח."
      />
    </div>
  );
}
