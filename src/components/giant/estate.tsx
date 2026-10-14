"use client";

// giant · האחוזה — מפת-האמת-החיה: מדידת-דיסק-אמת-בזמן-ריצה, לדג'ר-חי, ולמה-קרה-מה-שקרה.
// העדכון-מ-Task-46: המפה-כבר-לא-סטטית — כל-ריפו נמדד-חי (קבצים/בייטים/עודכן) דרך /api/estate/state.

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  FileWarning,
  GitBranch,
  Landmark,
  RefreshCw,
  Server,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface RepoRow {
  name: string;
  role: string;
  what: string;
  status: "system" | "source" | "mirror" | "archive" | "infra" | "charter";
  disk: {
    exists: boolean;
    files: number;
    bytes: number;
    lastModified: string | null;
    truncated: boolean;
  };
}

interface EstateState {
  ok: boolean;
  measuredAt: string;
  head: string | null;
  repos: RepoRow[];
  live: {
    saosIssued: number;
    saosCap: number;
    pairs: number;
    trades24h: number;
    vol24h: number;
    fleetActive: number;
    fleetAgents: number;
    ledgerRows: number;
    messages: number;
  };
  error?: string;
}

const ROOT_CAUSES = [
  {
    t: "סשנים-מתים",
    d: "כל-סוכן-מת-באמצע-ההקשר. הממשיך-קורא-worklog ובונה-מחדש במקום-להמשיך — כך-נולדו-5-ממשקים-מקבילים.",
  },
  {
    t: "אין-מפרט-מוצר-קפוא",
    d: "כל-סוכן-פירש 'בורסה/פלטפורמה' לבד. האמנה (lanes G-0..G-4) נולדה-רק-אתמול — מאוחר-מדי.",
  },
  {
    t: "ברירת-מחדל: דף-נחיתה",
    d: "כש-סשן-לא-מספיק-למוצר-שלם, הוא-מפיק-קליפה-יפה-עם-מספרים-מומצאים. זה-בדיוק-מה-שראית.",
  },
  {
    t: "אין-מסד-אמת-משותף",
    d: "כל-מערכת-המציאה-מספרי-מטבע-משלה: 100K, 126,682, 21M, נפחים-בדויים. מעכשיו: מספר-אחד-מהלדג'ר.",
  },
];

const BLISS_METHOD = [
  "בנה-קודם-את-הכלי (מנוע, לא דפים) — כל-פריים-פונקציה-טהורה של-הזמן",
  "הדבר-האמיתי במקום-שהוא-נמדד — תמונת-ה-Bliss האמיתית, צלילי-ה-XP האמיתיים → אצלנו: הלדג'ר-האמיתי, מחירי-Binance-האמיתיים",
  "יד-אחת-כותבת-את-כל-הפרומפטים לפני-הרצה — אצלנו: מפרט-אחד-קפוא לפני-קוד",
  "רישום-כנה של מה-לא-עבד — ה-README מתעד-כישלונות-בלי-לקשט. כך-גם-worklog",
  "המשך-מרשומות-אחרי-קריסה — לא-בנייה-מחדש. ה-DB+git הם-הזיכרון",
];

const STATUS_STYLE: Record<RepoRow["status"], { label: string; cls: string }> = {
  system: { label: "המערכת", cls: "bg-emerald-500/15 text-emerald-300" },
  source: { label: "מקור-אמת", cls: "bg-amber-500/15 text-amber-300" },
  mirror: { label: "מראה-בלבד", cls: "bg-zinc-500/15 text-zinc-400" },
  archive: { label: "ארכיון", cls: "bg-zinc-500/15 text-zinc-400" },
  infra: { label: "תשתית", cls: "bg-sky-500/10 text-sky-300" },
  charter: { label: "אמנות", cls: "bg-violet-500/10 text-violet-300" },
};

const heNum = new Intl.NumberFormat("he-IL");

function fmtNum(n: number): string {
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

export function EstateView() {
  const [state, setState] = useState<EstateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/estate/state", { cache: "no-store" });
      const data = (await res.json()) as EstateState;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "נכשלה-מדידת-האחוזה");
      setState(data);
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
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* פסק-הדין — עם-מספרים-חיים-מה-API */}
      <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/60 to-[#0d1312] p-5">
        <div className="flex items-start gap-3">
          <Landmark className="mt-1 h-6 w-6 shrink-0 text-emerald-400" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white">האחדה — החלטה-מבוצעת · ומדודה-חי</h2>
            {state ? (
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                ממשק-אחד: <strong className="text-emerald-300">giant</strong>. שאר-הריפו-ים אינם-ממשקים —
                מקורות-אמת, תשתית, מראה וארכיון (בדיוק-למטה, עם-מדידות-דיסק-אמת).
                המטבע-האמיתי אחד: <strong className="text-emerald-300">SAOS</strong> — מנופק-כרגע{" "}
                <strong className="text-emerald-300 tabular-nums">{fmtNum(state.live.saosIssued)}</strong>{" "}
                מתוך-תקרה{" "}
                <strong className="text-emerald-300 tabular-nums">{fmtNum(state.live.saosCap)}</strong>,
                לפי-שרשרת-Console; נפח-24h{" "}
                <strong className="tabular-nums text-zinc-100">{fmtNum(state.live.vol24h)} USDS</strong>{" "}
                מ-{fmtNum(state.live.trades24h)} עסקאות-אמת של-הבעלים-והצי
                ({fmtNum(state.live.fleetActive)}/{fmtNum(state.live.fleetAgents)} סוכנים-פעילים).
                <span className="text-zinc-400"> אין-עוד-נפחים-מבוימים: כל-מספר-כאן-מהלדג'ר.</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-red-300">{error ?? "המדידה-נכשלה"}</p>
            )}
            {state?.head && (
              <span className="mt-2 inline-block rounded-lg bg-black/40 px-2 py-1 font-mono text-[11px] text-zinc-400" dir="ltr">
                <GitBranch className="me-1.5 inline h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {state.head}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* מפת-הריפו-ים — מדידה-חיה-מהדיסק */}
      <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <GitBranch className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            האחוזה · מפת-אמת-חיה — נמדד-בזמן-ריצה
          </h3>
          <div className="flex items-center gap-2">
            {state && (
              <span className="text-[11px] text-zinc-500 tabular-nums">
                נמדד: {fmtTime(state.measuredAt)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-white/10 bg-transparent text-zinc-300 hover:bg-white/5 hover:text-white"
              onClick={() => void load()}
              disabled={refreshing}
              aria-label="מדידה-מחדש"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden="true" />
              מדוד-שוב
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {(state?.repos ?? []).map((r) => {
            const s = STATUS_STYLE[r.status];
            return (
              <div key={r.name} className="rounded-xl border border-white/5 bg-[#0b0f0e] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-bold text-white">
                    {r.status === "system" ? (
                      <Building2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Server className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                    )}
                    <span className="truncate">{r.name}</span>
                  </span>
                  <Badge className={cn("shrink-0", s.cls)}>{s.label}</Badge>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{r.what}</p>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-[11px] tabular-nums">
                  <span className="text-emerald-400/80">
                    {r.disk.exists
                      ? `${heNum.format(r.disk.files)} קבצים · ${fmtBytes(r.disk.bytes)}`
                      : "לא-נמצא-בדיסק — מדווח-כנה"}
                    {r.disk.truncated ? " (מוגבל-לתקרת-מדידה)" : ""}
                  </span>
                  <span className="text-zinc-600">עודכן: {fmtTime(r.disk.lastModified)}</span>
                </div>
              </div>
            );
          })}
          {!state && (
            <div className="col-span-full rounded-xl border border-white/5 bg-[#0b0f0e] p-6 text-center text-sm text-zinc-500">
              המדידה-החיה-אינה-זמינה-כרגע — מדווח-כנה, בלי-המצאת-מספרים.
            </div>
          )}
        </div>
      </section>

      {/* למה-קרה מה שקרה */}
      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-200">
          <FileWarning className="h-4 w-4 text-amber-400" aria-hidden="true" />
          למה-קרה-מה-שקרה · 4 שורשי-התסבוכת (בכנות)
        </h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ROOT_CAUSES.map((c, i) => (
            <div key={c.t} className="rounded-xl border border-white/5 bg-[#0b0f0e] p-3.5">
              <div className="text-sm font-bold text-zinc-100">
                {i + 1}. {c.t}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* שיטת-העבודה שנלקחה מ-BLISS */}
      <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <Wrench className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          שיטת-העבודה · 5 לקחים-שיושמו (מתיקיית bliss-making-of)
        </h3>
        <ul className="space-y-1.5">
          {BLISS_METHOD.map((m) => (
            <li key={m.slice(0, 24)} className="flex gap-2 text-sm text-zinc-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="leading-relaxed">{m}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
