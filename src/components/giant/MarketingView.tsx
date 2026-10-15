"use client";

/* ═══ MarketingView — משטח-השיווק החי של Adsmarket (גל-11) ═══════════════════
 * מנדט-הבעלים (גל-10): "צריך דברים שיהיו מה שכתוב שיהיה".
 * החוק הזה במלואו: הדלת קוראת את 9 קבצי-ערכת-השיווק **מהריפו-עצמו מילה-במילה** —
 * המרנדר למטה מצייר את מה-שהגיע (כותרות/פסקאות/טבלאות/רשימות/ציטוטים/קוד),
 * ולא-מחליף, לא-מסכם, לא-מעצב-מחדש. כשל-מקור = כרטיס-כשל-כנה.
 * ראיה-מוצגת-על-הדלת: נתיב-המקור · בייטים-נמדדים · זמן-מדידה · תקרת-חיתוך-מוצהרת. */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, Megaphone, RefreshCw, ShieldCheck } from "lucide-react";
import type { MarketingFile, MarketingPayload } from "@/lib/giant/marketing-types";

/* ── מרנדר-ורבטימי זעיר: markdown → JSX (מצייר, לא-מפרש) ─────────────────── */

/** inline: **bold** · `code` — שני-התגים-היחידים שהערכה משתמשת-בהם-בשכיחות */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${keyBase}-b${i}`} className="font-bold text-zinc-100">{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={`${keyBase}-c${i}`} className="rounded bg-zinc-800/80 px-1 py-0.5 font-mono text-[0.85em] text-amber-300">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** רשימת-שורות גולמית → בלוקים (טבלה/רשימה/ציטוט/קוד/פסקה) — מצייר-מה-שיש */
function MdBlocks({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    /* code fence */
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { buf.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(
        <pre key={k++} className="overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-3 font-mono text-[11px] leading-5 text-zinc-300">
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    /* table */
    if (isTableLine(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      blocks.push(
        <div key={k++} className="max-h-72 overflow-auto rounded-lg border border-white/10">
          <table className="w-full border-collapse text-right text-[11px] leading-5">
            <thead className="bg-zinc-900/90">
              <tr>{head.map((c, ci) => <th key={ci} className="border-b border-white/10 px-2.5 py-2 font-bold text-amber-300">{inline(c, `th${k}-${ci}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-zinc-900/40">
                  {r.map((c, ci) => <td key={ci} className="border-b border-white/5 px-2.5 py-1.5 align-top text-zinc-300">{inline(c, `td${k}-${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    /* blockquote */
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      blocks.push(
        <blockquote key={k++} className="rounded-lg border-r-2 border-amber-500/60 bg-amber-500/[0.06] px-3 py-2 text-[12px] leading-6 text-amber-200/90">
          {inline(buf.join(" "), `q${k}`)}
        </blockquote>,
      );
      continue;
    }

    /* list */
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={k++} className="list-disc space-y-1 pr-5 text-[12px] leading-6 text-zinc-300">
          {items.map((it, ii) => <li key={ii}>{inline(it, `li${k}-${ii}`)}</li>)}
        </ul>,
      );
      continue;
    }

    /* paragraph (שורות-רצופות-עד-שורה-ריקה) */
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !isTableLine(lines[i]) && !lines[i].trim().startsWith(">") && !lines[i].trim().startsWith("```") && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={k++} className="text-[12px] leading-6 text-zinc-300">{inline(buf.join(" "), `p${k}`)}</p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}

/* ── הדלת ──────────────────────────────────────────────────────────────────── */

const SRC_URL = (file: string) => `https://github.com/roshpinacare-sys/Adsmarket/blob/main/${file}`;

const fmtBytes = (b: number | null) => (typeof b === "number" ? `${(b / 1024).toFixed(1)}KB` : "—");
const fmtClock = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return "—"; }
};

export function MarketingView() {
  const [data, setData] = useState<MarketingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string>("README.md");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/giant/marketing${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = (await res.json()) as MarketingPayload & { error?: string };
      if (j.error) setErr(j.error);
      else setData(j);
    } catch {
      setErr("המדידה נכשלה — הדלת מציגה-כשל-כנה (אפס-טקסט-מצויר)");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const files: MarketingFile[] = data?.files ?? [];
  const active = files.find((f) => f.file === sel) ?? files[0] ?? null;
  const okCount = files.filter((f) => f.ok).length;

  return (
    <section aria-label="משטח-השיווק החי של Adsmarket" className="space-y-4" dir="rtl">
      {/* כותרת-הדלת + עיקרון-הברזל (ורבטימי מהמקור) */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-l from-amber-950/20 via-zinc-950 to-zinc-950 p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-20 left-1/3 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500/90">
              <Megaphone className="h-3.5 w-3.5" aria-hidden />
              Adsmarket · ערכת-השיווק הרשמית של רשת SAOS
            </p>
            <h2 className="mt-2 text-xl font-black leading-tight sm:text-3xl">
              המשטח-השיווק-<span className="text-amber-500">החי</span>
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400">
              {data?.note ?? "כל-הטקסט-נקרא-חי-מהריפו — מילה-במילה, אפס-סינתזה"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                data?.ok && okCount === files.length ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300" : data?.ok ? "border-amber-500/25 bg-amber-500/5 text-amber-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
              title={`קבצים-נמדדו-חי: ${okCount}/${files.length} · ${fmtClock(data?.fetchedAt ?? null)}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${data?.ok ? "g-breathe bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
              {okCount}/{files.length} קבצים-חיים
            </span>
            <button
              onClick={() => void load(true)}
              disabled={loading}
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 text-[11px] font-bold text-zinc-300 transition hover:border-amber-600/40 hover:text-amber-400 disabled:opacity-50"
              aria-label="מדוד-מחדש-מהמקור"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              מדוד-מחדש
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-xs font-bold text-red-300" role="alert">
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-3" aria-busy="true" aria-label="טוען-את-הערכה-מהמקור">
          <div className="flex gap-2 overflow-hidden">
            {[...Array(6)].map((_, i) => <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-zinc-900" />)}
          </div>
          <div className="h-6 w-2/3 animate-pulse rounded bg-zinc-900" />
          <div className="h-40 animate-pulse rounded-xl bg-zinc-900/70" />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* מדף-הקבצים (ראיה-על-כל-כרטיס) */}
          <nav aria-label="קבצי-הערכה" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" dir="rtl">
            {files.map((f) => {
              const isActive = active?.file === f.file;
              return (
                <button
                  key={f.file}
                  onClick={() => setSel(f.file)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex min-h-[44px] shrink-0 items-start gap-2 rounded-xl border px-3 py-2 text-right transition-all duration-200 lg:w-full ${
                    isActive
                      ? "border-amber-600/45 bg-amber-500/[0.07] text-zinc-100"
                      : "border-white/5 bg-zinc-900/40 text-zinc-400 hover:border-white/15 hover:bg-zinc-900/70 hover:text-zinc-200"
                  }`}
                  title={`${f.file} · ${fmtBytes(f.bytes)} · ${f.ok ? `נמדד-חי ${fmtClock(f.fetchedAt)}` : "כשל-כנה"}`}
                >
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${f.ok ? "g-breathe bg-emerald-400" : "bg-red-400"}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold leading-4">{f.he}</span>
                    <span className="mt-0.5 block font-mono text-[9px] leading-3 text-zinc-500">{f.file} · {fmtBytes(f.bytes)}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* הפאנל-הורבטימי */}
          <div className="min-w-0 space-y-4">
            {active ? (
              active.ok ? (
                <article className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 sm:p-6">
                  <header className="mb-4 border-b border-white/5 pb-4">
                    <h3 className="text-base font-black leading-6 text-zinc-100 sm:text-lg">{active.headline ?? active.he}</h3>
                    {active.quote && (
                      <p className="mt-2 rounded-lg border-r-2 border-amber-500/60 bg-amber-500/[0.06] px-3 py-2 text-[12px] leading-6 text-amber-200/90">
                        {active.quote}
                      </p>
                    )}
                    {/* ראיה-מוצגת: מקור · גודל-נמדד · זמן-מדידה · קישור-למקור */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1 rounded-md border border-white/5 bg-zinc-900 px-2 py-1 font-mono">
                        <FileText className="h-3 w-3" aria-hidden />
                        roshpinacare-sys/Adsmarket/main/{active.file}
                      </span>
                      <span className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 font-bold text-emerald-300">
                        verbatim · אפס-עריכה
                      </span>
                      <span className="rounded-md border border-white/5 bg-zinc-900 px-2 py-1 font-mono">נמדד {fmtClock(active.fetchedAt)}</span>
                      <a
                        href={SRC_URL(active.file)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-[24px] items-center gap-1 rounded-md border border-white/5 bg-zinc-900 px-2 py-1 font-bold text-zinc-400 transition hover:border-amber-600/40 hover:text-amber-400"
                        aria-label={`פתח את המקור ${active.file} בגיטהאב`}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        המקור-בגיט
                      </a>
                      {active.note && <span className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 font-bold text-amber-300">{active.note}</span>}
                    </div>
                  </header>
                  <div className="max-h-[68vh] space-y-4 overflow-y-auto pl-1" dir="auto">
                    {active.sections.map((s, si) => (
                      <div key={si} className="space-y-2">
                        {s.h && (
                          <h4 className="flex items-start gap-2 pt-1 text-sm font-black text-zinc-100">
                            <span className="mt-1.5 h-1 w-3 shrink-0 rounded bg-amber-500/70" aria-hidden />
                            <span dir="auto">{s.h}</span>
                          </h4>
                        )}
                        <MdBlocks text={s.text} />
                      </div>
                    ))}
                    {active.sections.length === 0 && (
                      <p className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 p-4 text-xs text-zinc-400">
                        הקובץ-נמדד-חי אך-אין-בו-סעיפי-גוף-להצגה ({fmtBytes(active.bytes)}).
                      </p>
                    )}
                  </div>
                </article>
              ) : (
                <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-6 text-center" role="alert">
                  <ShieldCheck className="mx-auto h-6 w-6 text-red-400" aria-hidden />
                  <p className="mt-2 text-sm font-black text-red-300">כשל-מקור כנה · {active.file}</p>
                  <p className="mt-1 text-xs text-zinc-400">{active.note}</p>
                  <p className="mt-3 text-[10px] text-zinc-500">הדלת מציגה-את-הכשל ולא מציירת-טקסט — זה החוק.</p>
                </div>
              )
            ) : (
              <p className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 p-4 text-xs text-zinc-400">אין-קבצים-בערכה — כשל-כנה.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
