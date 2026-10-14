"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Network, RefreshCw, ShieldCheck, Landmark, Package, Cable } from "lucide-react";
import { Recipe } from "@/components/giant/Recipe";

/* ═══ EmpireView — מפת-החיבור-המלא של האימפריה (גל-7) ══════════════════════
 * מנדט-הבעלים: "יש המון חומר אבל כלום לא מחובר · אני עוד לא רואה רבע ·
 * מחברים את הריבונות להפעלה מלאה מכל תיקיות הגיט".
 * התשובה: כל-הספרים על מסך-אחד — תפקיד · קבוצה · הדלת-החיה-שלהם · דחיפה ·
 * סריקה · קישור-גיט. כשל = "—" ו"לא מופה" כנה. אפס-המצאת-חיבורים.
 * חוקי-עיצוב גל-6: g-card · g-rise · g-scroll · Recipe (חוק-prompt-motion). */

interface EmpireRow {
  name: string;
  url: string;
  group: string;
  role: string | null;
  module: string | null;
  evidence: string | null;
  ageMinutes: number | null;
  archived: boolean;
  isPrivate: boolean;
  description: string | null;
  files: number | null;
  signalCount: number | null;
  redLineCount: number | null;
  scannedAt: string | null;
  alive24h: boolean;
}

interface EmpirePayload {
  ok: boolean;
  note?: string;
  summary: {
    total: number; alive24h: number; connected: number; mapped: number; unmapped: number;
    scanned: number; unscanned: number; signals: number; redLines: number;
    groups: Record<string, number>;
  } | null;
  rows: EmpireRow[];
  measuredAt: string;
}

const GROUP_ORDER = ["ליבה-מחוברת", "תשתית-הפעלה", "מוצרים-ריבוניים", "ממתיני-חיווט", "חזית-פומבית", "ארכיון-ושחזור", "לא-מופה"];

const GROUP_STYLE: Record<string, string> = {
  "ליבה-מחוברת": "text-amber-400 border-amber-500/30 bg-amber-500/[0.06]",
  "תשתית-הפעלה": "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.05]",
  "מוצרים-ריבוניים": "text-fuchsia-400 border-fuchsia-500/25 bg-fuchsia-500/[0.05]",
  "ממתיני-חיווט": "text-orange-400 border-orange-500/25 bg-orange-500/[0.05]",
  "חזית-פומבית": "text-teal-400 border-teal-500/25 bg-teal-500/[0.05]",
  "ארכיון-ושחזור": "text-zinc-400 border-zinc-600/40 bg-zinc-500/[0.05]",
  "לא-מופה": "text-red-400 border-red-500/25 bg-red-500/[0.05]",
};

const GROUP_HEADLINE: Record<string, string> = {
  "ליבה-מחוברת": "מזינים-ישירות את מודולי-הממשק-החי",
  "תשתית-הפעלה": "ההנעה-העצמאית-מהגיט — בלי-סנדבוקס",
  "מוצרים-ריבוניים": "תוצרת-עומדת-בפני-עצמה",
  "ממתיני-חיווט": "יש-חומר — אין-עדיין-דלת-חיה (כנות)",
  "חזית-פומבית": "הדלת-שלנו-אל-העולם",
  "ארכיון-ושחזור": "זיכרון-ארוך · מראות-שחזור",
  "לא-מופה": "ספר-שלא-הובן-עדיין — כנה",
};

const MODULE_LABEL: Record<string, string> = {
  machine: "המכונה", dex: "הדקס", league: "ליגת-הענקים", channel: "הערוץ",
  wallet: "הארנק", desk: "השולחן", ledger: "הרישום", products: "המוצרים",
  pulse: "הדופק", office: "המשרד-החי", estate: "האחוזה", trust: "האמון",
};

const fmtInt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
const fmtAge = (m: number | null) => {
  if (typeof m !== "number" || !Number.isFinite(m)) return "—";
  if (m < 60) return `${m} דק`;
  if (m < 1440) return `${Math.round(m / 60)} ש׳`;
  return `${Math.round(m / 1440)} ימ׳`;
};

export function EmpireView({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [data, setData] = useState<EmpirePayload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/giant/empire", { cache: "no-store" });
      setData((await r.json()) as EmpirePayload);
    } catch {
      setData({ ok: false, note: "מפת-האימפריה לא נמדדה — כשל-כנה", summary: null, rows: [], measuredAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const s = data?.summary ?? null;
  const rows = data?.rows ?? [];

  /* שרדנות (חוק-הבעלים: "אתם תכף מתים… הריבונות חייבת למקסם את עצמה") */
  const survival = [
    { k: "Autonomy", v: "המוח-הריבוני על דקות-ציבור — דוחף 24/7 בלי-סנדבוקס" },
    { k: "Pulse", v: "מפקד-אוכלוסין כל-30 דק על GitHub Actions" },
    { k: "sovereign-runner-kit", v: "המכשיר שלנו הוא המנוע · GitHub ספר-בלבד" },
    { k: "sovereign-lighthouse", v: "זיכרון-חוץ-מכונה — ממשיך-גם-אחרי-מוות-של-סביבה" },
  ];

  /* היתרון-המדוד מול הענקים (כל-שורה עם-ראיה-נמדדת) */
  const advantages = [
    { k: "מפת-אמון מדודה על כל-הקוד", v: `${fmtInt(s?.scanned)} סריקות · ${fmtInt(s?.signals)} סימנים · ${fmtInt(s?.redLines)} קווים-אדומים — file:line, אצל-הענקים זה סגור` },
    { k: "ערוץ-בעלים באינטגריות-קריפטו", v: "כל-הודעה עם root sha256 · פלטפורמות-הענקים ערוץ-סגור-בלי-הוכחה" },
    { k: "מסחר-אמת על שרשרת חיה", v: "גריד STEEM real:true · מילויים עם txid — לא ספר-סימולציה" },
    { k: "נוטריון-הוכחות חוצה-שרשרת", v: "saos-jummper על ETH-mainnet ב-~$0.10 · TruthRail gas 0x0" },
    { k: "המערכת מסבירה את עצמה", v: "מכונת-האמת האיזומטרית · מתכוני-מקור בכל-פאנל" },
  ];

  return (
    <section aria-label="מפת-החיבור-המלא של האימפריה" className="flex flex-col gap-4" dir="rtl">
      {/* כותרת + מדידה */}
      <div className="g-rise flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Network className="h-5 w-5 text-amber-500" aria-hidden />
          <h2 className="text-lg font-black">החיבור-המלא · {fmtInt(s?.total)} ספרים × תפקידם × דלתם</h2>
        </div>
        <button
          onClick={load}
          disabled={busy}
          className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 transition hover:border-amber-600/40 hover:text-amber-400 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
          מדוד-מחדש
        </button>
      </div>

      {!data && <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-6 text-sm text-zinc-400">נמדד…</div>}

      {data && !data.ok && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {data.note ?? "מפת-האימפריה לא נמדדה (כשל-כנה)"}
        </div>
      )}

      {data && s && (
        <>
          {/* מספרי-החיבור */}
          <div className="g-rise-1 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="ספרים-חיים" value={`${fmtInt(s.alive24h)}/${fmtInt(s.total)}`} sub="נדחפו-ב-24ש׳" tone="green" />
            <Kpi label="מחוברים-למודול-חי" value={fmtInt(s.connected)} sub="יש-דלת-בממשק" tone="amber" />
            <Kpi label="תשתית-הפעלה" value={fmtInt(s.groups["תשתית-הפעלה"] ?? 0)} sub="ריצה-עצמאית-מהגיט" tone="emerald" />
            <Kpi label="מוצרים-ריבוניים" value={fmtInt(s.groups["מוצרים-ריבוניים"] ?? 0)} sub="עומדים-בפני-עצמם" tone="fuchsia" />
            <Kpi label="ממתיני-חיווט" value={fmtInt(s.groups["ממתיני-חיווט"] ?? 0)} sub="כנה — בלי-דלת-עדיין" tone="orange" />
            <Kpi label="לא-מופה" value={fmtInt(s.unmapped)} sub="כנה — דורש-גל-עתיד" tone="red" />
          </div>

          {/* שרדנות: איך הריבונות ממשיכה בלי-הסנדבוקס */}
          <div className="g-rise-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
              <h3 className="text-sm font-black text-emerald-300">איך הריבונות ממשיכה בלי הסנדבוקס הזה</h3>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">חוק-הבעלים · הגיט הוא שכבת-הקיום</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {survival.map((x) => (
                <div key={x.k} className="g-card rounded-xl border border-white/5 bg-zinc-950/50 px-3.5 py-2.5">
                  <b className="block font-mono text-xs text-emerald-300">{x.k}</b>
                  <span className="block text-[11px] leading-4 text-zinc-400">{x.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* היתרון-המדוד מול-הענקים */}
          <div className="g-rise-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-amber-400" aria-hidden />
              <h3 className="text-sm font-black text-amber-300">היתרון-המדוד מול הענקים</h3>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">כל-שורה עם-ראיה</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {advantages.map((x) => (
                <div key={x.k} className="g-card rounded-xl border border-white/5 bg-zinc-950/50 px-3.5 py-2.5">
                  <b className="block text-xs text-amber-200">{x.k}</b>
                  <span className="block text-[11px] leading-4 text-zinc-400">{x.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* המפה — קבוצות × שורות */}
          <div className="g-rise-3 flex flex-col gap-4">
            {GROUP_ORDER.filter((g) => rows.some((r) => r.group === g)).map((g) => (
              <div key={g} className="rounded-2xl border border-white/10 bg-zinc-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${GROUP_STYLE[g]}`}>{g}</span>
                    <span className="text-[11px] text-zinc-500">{GROUP_HEADLINE[g]}</span>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500">{fmtInt(s.groups[g] ?? rows.filter((r) => r.group === g).length)} ספרים</span>
                </div>
                <div className="g-scroll max-h-96 divide-y divide-white/5 overflow-y-auto">
                  {rows.filter((r) => r.group === g).map((r) => (
                    <div key={r.name} className="flex flex-col gap-1.5 px-4 py-3 transition hover:bg-white/[0.02] sm:flex-row sm:items-start sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-[13px] font-bold text-zinc-100 transition hover:text-amber-400" title="פתח-בגיט">
                            {r.name}
                            <ExternalLink className="h-3 w-3 text-zinc-500" aria-hidden />
                          </a>
                          {r.isPrivate && <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">פרטי</span>}
                          {r.archived && <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">ארכיון</span>}
                          <span className={`h-1.5 w-1.5 rounded-full ${r.alive24h ? "g-breathe bg-emerald-400" : "bg-zinc-600"}`} title={r.alive24h ? "נדחף-ב-24ש׳ — חי" : "לא נדחף-ב-24ש׳"} aria-hidden />
                          <span className="font-mono text-[10px] text-zinc-500">{fmtAge(r.ageMinutes)}</span>
                          {r.files != null && <span className="font-mono text-[10px] text-zinc-600">· {fmtInt(r.files)} קבצים</span>}
                          {r.signalCount != null && (r.signalCount > 0 || (r.redLineCount ?? 0) > 0) && (
                            <span className="font-mono text-[10px] text-zinc-600">· סריקה: {fmtInt(r.signalCount)} סימנים / {fmtInt(r.redLineCount)} אדומים</span>
                          )}
                          {r.scannedAt === null && <span className="text-[10px] font-bold text-red-400/80">· לא נסרק (כנה)</span>}
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-zinc-300">{r.role ?? <span className="text-red-400/90">לא מופה — כנה (דורש גל-עתיד)</span>}</p>
                        {r.evidence && <p className="mt-0.5 text-[10px] leading-4 text-zinc-600">ראיה: {r.evidence}</p>}
                      </div>
                      {r.module && (
                        <button
                          onClick={() => onNavigate?.(r.module as string)}
                          className="flex min-h-[36px] shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-600/30 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] font-black text-amber-400 transition hover:-translate-y-0.5 hover:border-amber-500/60 hover:bg-amber-500/10"
                          title={`עבור-למודול-החי-שהספר מזין`}
                        >
                          <Cable className="h-3 w-3" aria-hidden />
                          {MODULE_LABEL[r.module] ?? r.module}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Recipe (חוק-prompt-motion: המתכון-מאחורי-הפאנל) */}
          <Recipe
            sources={[
              "הצי-החי: /api/giant/fleet — GitHub Search API · org:roshpinacare-sys · מטמון 120ש׳",
              "הסריקות: saos-trust-check@0.1.0 · קריאה-זולה מ-db/trust-cache.json (בלי-רשת)",
              "המיפוי: src/lib/giant/empire-map.ts — הקנון מהתוכן-שנאסף-בשיחה (גלים 41–47), כל-שורה עם-ראיה",
              "חוזה-כשל: ריפו-בלי-מיפוי = ״לא מופה״ · כשל-צי = כנה · אפס-המצאת-חיבורים",
            ]}
            measuredAt={data.measuredAt}
          />
        </>
      )}
    </section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "green" | "amber" | "emerald" | "fuchsia" | "orange" | "red" }) {
  const tones: Record<string, string> = {
    green: "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/[0.06] text-amber-300",
    emerald: "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300",
    fuchsia: "border-fuchsia-500/25 bg-fuchsia-500/[0.05] text-fuchsia-300",
    orange: "border-orange-500/25 bg-orange-500/[0.05] text-orange-300",
    red: "border-red-500/25 bg-red-500/[0.05] text-red-300",
  };
  return (
    <div className={`g-card rounded-xl border p-3.5 ${tones[tone]}`}>
      <p className="text-[10px] font-bold text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-black leading-6">{value}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{sub}</p>
    </div>
  );
}
