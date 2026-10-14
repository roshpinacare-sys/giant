"use client";

import { useEffect, useState } from "react";
import { ChannelView } from "@/components/giant/ChannelView";
import { DexView } from "@/components/giant/DexView";
import { PulseView } from "@/components/giant/PulseView";
import { OfficeView } from "@/components/giant/OfficeView";
import { ShieldCheck } from "lucide-react";

/* ═══ GIANT — מערכת-האמת של הריבונות (R360 · trace 1a13bcec79d9da45) ═══════
 * דלת-קדמית-אחת: ערוץ-אחד · דקס-מרכז-כובד · דופק-אמת · משרד-יחיד.
 * הכל נמדד-חי מהגיט (Domain · Pulse · FleetHQ); שער-headcorner פותח-הכל;
 * אפס-כפילויות (צו-הצמצום 2026-10-15); המערכת לעולם אינה גמורה. */

type ViewId = "channel" | "dex" | "pulse" | "office";

const NAV: Array<{ id: ViewId; label: string; he: string }> = [
  { id: "channel", label: "הערוץ", he: "הדלת-הראשית: בעלים ↔ ריבונות" },
  { id: "dex", label: "הדקס", he: "מרכז-הכובד: מטבע · נזילות · ווליום" },
  { id: "pulse", label: "הדופק", he: "מערכת-האמת: שערים · זרמים · טביעות" },
  { id: "office", label: "המשרד-החי", he: "המשרד-היחיד של הריבונות" },
];

interface TruthChip {
  verdict: string | null;
  ageMinutes: number | null;
}

export default function Home() {
  const [view, setView] = useState<ViewId>("channel");
  const [clock, setClock] = useState("");
  const [truth, setTruth] = useState<TruthChip | null>(null);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/giant/pulse", { cache: "no-store" });
        const d = (await res.json()) as { truth?: { verdict: string | null } | null; truthMeta?: { ageMinutes: number | null } };
        if (alive) setTruth({ verdict: d.truth?.verdict ?? null, ageMinutes: d.truthMeta?.ageMinutes ?? null });
      } catch {
        /* הדופק עצמו יציג-כשל-כנה */
      }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const active = NAV.find((n) => n.id === view);
  const truthGreen = truth?.verdict?.includes("GREEN") ?? false;

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      {/* ═══ ראש-המערכת ═══ */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/90 backdrop-blur" dir="rtl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 font-black text-zinc-950" aria-hidden>G</span>
            <div>
              <h1 className="text-base font-black leading-5">
                GIANT <span className="text-amber-500">·</span> מערכת-האמת
              </h1>
              <p className="hidden text-[10px] leading-3 text-zinc-500 sm:block">הפלטפורמה-המאוחדת של הריבונות · ערוץ-אחד · אפס-כפילויות</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {truth && (
              <span
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:flex ${truthGreen ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}
                title={truth.verdict ? `truth-gate: ${truth.verdict}` : "truth-gate לא נמדד"}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                truth-gate: {truth.verdict ?? "לא-נמדד"}
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-[10px] font-bold text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
              ריבונות חיה · 24/7
            </span>
            <span className="hidden font-mono text-xs text-zinc-500 md:inline" aria-label="שעון-המערכת">{clock}</span>
          </div>
        </div>
      </header>

      {/* ═══ גוף: ניווט-צד (מחשב) + תוכן ═══ */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-5 px-4 py-5" dir="rtl">
        <nav aria-label="מודולי-המערכת" className="hidden w-60 shrink-0 flex-col gap-1.5 md:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={`rounded-xl border px-4 py-3 text-right transition ${
                view === n.id
                  ? "border-amber-600/40 bg-amber-500/[0.06] text-zinc-100"
                  : "border-white/5 bg-zinc-900/40 text-zinc-400 hover:border-white/15 hover:text-zinc-200"
              }`}
            >
              <span className="block text-sm font-bold">{n.label}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">{n.he}</span>
            </button>
          ))}
          <div className="mt-4 rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-[10px] leading-5 text-zinc-500">
            <b className="text-zinc-300">מפתח-מנהל (headcorner)</b> פותח-הכל: הכרעות · הוראות · קול-הריבונות.
            המערכת לעולם אינה גמורה — האוטונומיה בודקת, מתקנת, בונה, משפרת, פורצת-דרך.
          </div>
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-[10px] leading-5 text-zinc-600">
            זרמי-האמת: <span className="font-mono text-zinc-500">Domain/dex</span> · <span className="font-mono text-zinc-500">Pulse/sovereign-channel</span> · <span className="font-mono text-zinc-500">FleetHQ/office</span>
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-24 md:pb-4">
          <div className="mb-3 md:hidden" dir="rtl">
            <p className="text-xs font-bold text-zinc-300">{active?.label}</p>
            <p className="text-[10px] text-zinc-500">{active?.he}</p>
          </div>
          {view === "channel" && <ChannelView />}
          {view === "dex" && <DexView />}
          {view === "pulse" && <PulseView />}
          {view === "office" && <OfficeView />}
        </main>
      </div>

      {/* ═══ ניווט-תחתון (נייד) ═══ */}
      <nav
        aria-label="מודולי-המערכת (נייד)"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        dir="rtl"
      >
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            aria-current={view === n.id ? "page" : undefined}
            className={`min-h-[44px] flex-1 py-2 text-center text-xs font-bold transition ${view === n.id ? "text-amber-500" : "text-zinc-500"}`}
          >
            {n.label}
          </button>
        ))}
      </nav>

      {/* ═══ תחתית-המערכת (דביקה) ═══ */}
      <footer className="mt-auto hidden h-9 shrink-0 items-center justify-between border-t border-white/10 bg-zinc-950 px-4 text-[11px] text-zinc-500 md:flex" dir="rtl">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">מפקדת הצי</span>
          <span className="hidden sm:inline">· הריבונות מפעילה-הכל; הגיט הוא שכבת-הקיום; המערכת מתפתחת לנצח</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">SAOS-SOVEREIGN-CHANNEL/1 · R360 · R74</span>
        </div>
      </footer>
    </div>
  );
}
