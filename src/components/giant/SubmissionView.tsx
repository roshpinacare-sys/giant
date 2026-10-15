"use client";

/**
 * SubmissionView — ההגשה-הסופית של הרעיון המאוחד (גל-9 · מנדט-הבעלים).
 * התצוגה-של-ההבנה-והתכנון: הרעיון · הארכיטקטורה · הכלכלה · העיצוב · האמון ·
 * לקחי-הכשלים · השוואת-ענקים · ההישג-הרב-תחומי — ובתוכה פאנל-חי של
 * ארבעת-המחוברים (ניזון מ-/api/giant/books — כל-ערך-נמדד, אפס-סימולציות).
 * חוקי-העיצוב (גל-6): הרמת-כרטיסים (designspells) · נשימה · focus-ring
 * (awwwards) · scrollbar-מעוצב · reduced-motion (60fps) · מספרים-אמת.
 */
import { useEffect, useState } from "react";
import { BookOpen, Crown, Landmark, ScrollText, ShieldCheck } from "lucide-react";
import { SUBMISSION, type SubmissionSection } from "@/lib/giant/submission";
import type { BooksPayload } from "@/lib/giant/books-types";

const STATE_STYLES: Record<string, string> = {
  חי: "border-emerald-500/25 bg-emerald-500/5 text-emerald-400",
  בתהליך: "border-amber-500/25 bg-amber-500/5 text-amber-400",
  פתוח: "border-zinc-700 bg-zinc-900 text-zinc-400",
};

function SectionCard({ s }: { s: SubmissionSection }) {
  return (
    <article className="g-card group rounded-2xl border border-white/10 bg-zinc-900/40 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-600/30 hover:shadow-[0_16px_40px_-20px_rgba(245,158,11,0.25)] sm:p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-600/30 bg-amber-500/5 font-black text-amber-500" aria-hidden>
          {s.num}
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-500/80">{s.kicker}</p>
          <h3 className="mt-0.5 text-lg font-black leading-6 sm:text-xl">{s.title}</h3>
        </div>
      </header>
      <div className="mt-3 space-y-2.5 text-[13px] leading-6 text-zinc-300">
        {s.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {s.bullets && s.bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {s.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-xs leading-5 text-zinc-400">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {s.table && (
        <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-white/5 g-scroll" dir="rtl">
          <table className="w-full border-collapse text-right text-[11px]">
            <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
              <tr>
                {s.table.headers.map((h) => (
                  <th key={h} className="border-b border-white/10 px-3 py-2.5 font-black text-amber-500/90">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.table.rows.map((row, ri) => (
                <tr key={ri} className="transition-colors hover:bg-amber-500/[0.04]">
                  {row.map((cell, ci) => (
                    <td key={ci} className={`border-b border-white/5 px-3 py-2.5 align-top leading-5 ${ci === 0 ? "font-bold text-zinc-200" : "text-zinc-400"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function SubmissionView() {
  const [books, setBooks] = useState<BooksPayload | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/giant/books", { cache: "no-store" });
        const d = (await r.json()) as BooksPayload;
        if (alive) setBooks(d);
      } catch {
        /* כנות: הפאנל יראה כשל */
      }
    };
    load();
    const iv = setInterval(load, 90_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="space-y-4" dir="rtl">
      {/* הצהרת-ההגשה */}
      <section aria-label="ההצהרה המאוחדת" className="g-rise relative overflow-hidden rounded-2xl border border-amber-600/25 bg-gradient-to-l from-amber-950/30 via-zinc-950 to-zinc-950 p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-20 left-1/3 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500/90">
          <Crown className="h-3.5 w-3.5" aria-hidden />
          ההגשה-הסופית · גל-9 · מתוך-התוכן-שנאסף-בשיחה
        </p>
        <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-4xl">{SUBMISSION.statement}</h2>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-zinc-300 sm:text-sm">{SUBMISSION.statementSub}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUBMISSION.chips.map((c) => (
            <span
              key={c.k}
              title={c.evidence}
              className="flex min-h-[32px] items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300"
            >
              <span className="g-breathe h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              {c.k}: <span className="font-mono text-emerald-200">{c.v}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-zinc-500">
          כל-שבב-נושא-את-הראיה-שלו (רחף-עליו). מקור-האמת: <span className="font-mono">giant/docs/SUBMISSION.md</span> · המפה: <span className="font-mono">src/lib/giant/empire-map.ts</span>
        </p>
      </section>

      {/* ארבעת-המחוברים — פאנל-חי (גל-9) */}
      <section aria-label="ארבעת-המחוברים" className="g-card rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-black">
            <BookOpen className="h-4 w-4 text-amber-500" aria-hidden />
            ארבעת-המחוברים — פאנל-חי
          </h3>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${books?.ok ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${books?.ok ? "g-breathe bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
            {books ? (books.ok ? "4/4-ספרים-נקראים-חי" : "כשל-כנה") : "טוען-מדידה…"}
          </span>
        </header>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(books?.books ?? Array.from({ length: 4 }, () => null)).map((b, i) => (
            <div key={b?.book ?? i} className="rounded-xl border border-white/5 bg-zinc-950/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-600/25">
              {b ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-bold text-amber-400">{b.book}</p>
                    <span className={`h-1.5 w-1.5 rounded-full ${b.ok ? "g-breathe bg-emerald-400" : "bg-red-400"}`} aria-hidden title={b.ok ? "נמדד-חי" : b.note} />
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-400">{b.role}</p>
                  {b.headline && <p className="mt-2 text-xs font-bold leading-5 text-zinc-200">{b.headline}</p>}
                  <dl className="mt-2 space-y-1">
                    {b.facts.map((f) => (
                      <div key={f.k} className="flex items-start justify-between gap-2 text-[10px] leading-4">
                        <dt className="shrink-0 text-zinc-500">{f.k}</dt>
                        <dd className={`text-left ${f.v === "—" ? "text-zinc-600" : "text-zinc-300"}`} dir="auto">{f.v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <div className="animate-pulse space-y-2" aria-hidden>
                  <div className="h-3 w-24 rounded bg-zinc-800" />
                  <div className="h-2.5 w-full rounded bg-zinc-800/70" />
                  <div className="h-2.5 w-2/3 rounded bg-zinc-800/70" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* הסעיפים */}
      <div className="space-y-4">
        {SUBMISSION.sections.map((s) => (
          <SectionCard key={s.id} s={s} />
        ))}
      </div>

      {/* הדרך-קדימה */}
      <section aria-label="הדרך קדימה" className="g-card rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-base font-black">
          <ScrollText className="h-4 w-4 text-amber-500" aria-hidden />
          הדרך-קדימה — מדוד, בכנות
        </h3>
        <ul className="mt-3 space-y-2">
          {SUBMISSION.roadmap.map((r) => (
            <li key={r.what} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-zinc-950/60 px-3.5 py-2.5">
              <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-black ${STATE_STYLES[r.state] ?? STATE_STYLES["פתוח"]}`}>{r.when}</span>
              <span className="min-w-0 flex-1 text-xs leading-5 text-zinc-300">{r.what}</span>
              <span className={`shrink-0 text-[10px] font-bold ${r.state === "חי" ? "text-emerald-400" : r.state === "בתהליך" ? "text-amber-400" : "text-zinc-500"}`}>{r.state}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-4 text-zinc-500">
          <ShieldCheck className="h-3 w-3 text-emerald-500" aria-hidden />
          כל-סעיף-כאן-מתוך-מדידות-השיחה — העותק-הקנוני-בגיט: giant/docs/SUBMISSION.md · אוצר-האמת:
          <Landmark className="h-3 w-3 text-amber-500" aria-hidden />
          <span className="font-mono">µ-קנון 1 USDS = 1000µ</span>
        </p>
      </section>
    </div>
  );
}
