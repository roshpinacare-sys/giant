"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { OverviewView } from "@/components/giant/OverviewView";
import { MachineView } from "@/components/giant/MachineView";
import { DexView } from "@/components/giant/DexView";
import { GiantsView } from "@/components/giant/LeagueView";
import { ChannelView } from "@/components/giant/ChannelView";
import { WalletView } from "@/components/giant/WalletView";
import { DeskView } from "@/components/giant/DeskView";
import { LedgerView } from "@/components/giant/LedgerView";
import { ProductsView } from "@/components/giant/ProductsView";
import { PulseView } from "@/components/giant/PulseView";
import { OfficeHqView } from "@/components/giant/OfficeHqView";
import { EstateView } from "@/components/giant/EstateView";
import { CapabilityView } from "@/components/giant/CapabilityView";
import { SovereigntyView } from "@/components/giant/SovereigntyView";
import { EmpireView } from "@/components/giant/EmpireView";
import { TrustView } from "@/components/giant/TrustView";
import { TickerTape } from "@/components/giant/TickerTape";
import { GiantPalette } from "@/components/giant/GiantPalette";
import {
  Activity, ArrowLeftRight, Banknote, Boxes, Building2, Command, Compass,
  Gauge, GitBranch, Landmark, Network, Package, Radio, ScrollText, ShieldCheck, Trophy, Wallet,
  type LucideIcon,
} from "lucide-react";

/* ═══ GIANT — הממשק-המאוחד של כל-הצי (T60 · גל-הקראפט) ══════════════
 * מה-מי:
 *  · הסקירה — מה-זה, מי-מי, ואיך-הכל-מחובר (שכבת-ההקשר שהבעלים ביקש)
 *  · מכונת-האמת (anatomy-grade: האובייקט=ההסבר) · הדקס + ספר-הפקודות-החוץ (Kraken חי)
 *  · ליגת-הענקים (DefiLlama חי) · הערוץ-האחד + שער-headcorner + קול-הריבונות-מדבר (TTS אמיתי)
 *  · מאגר-היכולות (תבנית awesome-dsh-plugin: כרטיסי-יכולת נסרקים-ונבדקים-חי)
 *  · המשרד-החי התלת-מימדי + קונסולת-מפעיל · דופק-אמת · האחוזה · ארנק/שולחן/רישום/מוצרים
 *  · Ctrl+K פלטת-פקודה · סרט-מחירים חי · ContextBar לכל-מודול
 *  · T60-קראפט (DNA: designspells/60fps/supahero/godly): אורורה-חיה · גרגר-סרט · ספוטלייט-מצביע · ספקולר · CountUp
 *  · הריבונות (T61): ההגשה-הסופית של הרעיון — הריבונות חיה בגיט; הסנדבוקס נמחק, הממשק רק מציג; כל-התיקיות · הצי · הענקים · הלקחים נמדדים-מהמכונה
 *  · האימפריה + האמון (T63-a · המיזוג-האמיתי עם הענק-האח): מפת-החיבור-המלא (39 ריפו × תפקיד × דלת-חיה) + מפת-האמון של הצי (חשיפה-לא-פסק-דין · file:line לכל-ממצא)
 * משטח-אחד-לכל-יכולת · ערוץ-אחד · אפס-כפילויות · הכל נמדד-חי מהגיט. */

type ViewId =
  | "sovereignty" | "empire" | "trust" | "overview" | "machine" | "dex" | "league" | "channel" | "wallet"
  | "desk" | "ledger" | "products" | "pulse" | "office" | "estate" | "capabilities";

interface NavEntry {
  id: ViewId;
  label: string;
  ctx: string;   /* מה-רואים-כאן (שורת-ההקשר) */
  src: string;   /* מאיפה-הנתונים (הוכחת-מקור) */
  icon: LucideIcon;
}

/* סדר-הפתיחה (T59): הסקירה דלת-ההקשר; הכסף מיד אחריה; הערוץ הדלת-הראשית. */
const NAV: NavEntry[] = [
  { id: "sovereignty", label: "ריבונות", ctx: "מה חי, מה מחובר, מה שרד — ההגשה הסופית של הרעיון", src: "סריקת-גיט חיה · FLEET-GRAPH · agent-registry · giants.json", icon: GitBranch },
  { id: "empire", label: "אימפריה", ctx: "כל הספרים על מסך-אחד — 39 ריפו × תפקיד × דלת-חיה · המיזוג-האמיתי עם הענק-האח", src: "GitHub-Search חי · trust-cache · empire-map קאנוני", icon: Network },
  { id: "trust", label: "אמון", ctx: "מפת-האמון של הצי — חשיפה-לא-פסק-דין · file:line לכל-ממצא", src: "saos-trust-check@0.1.0 · עץ-גיט חי · 30 redLines", icon: ShieldCheck },
  { id: "overview", label: "הסקירה", ctx: "מה-המערכת-הזאת, מי-מי, ואיך-הכל-מחובר — במספרים-חיים", src: "דופק + דקס + אחוזה · ריענון 60ש׳", icon: Compass },
  { id: "machine", label: "המכונה", ctx: "מנוע-הדקס כמכונה-חיה · האובייקט-הוא-ההסבר (anatomy)", src: "Domain/dex/state.json · טביעת-sha16", icon: Gauge },
  { id: "dex", label: "הדקס", ctx: "הכסף: נרות · קופות · אמת-ההיצע · ספר-הפקודות-החוץ", src: "Kraken חי + המנוע מהגיט", icon: ArrowLeftRight },
  { id: "league", label: "ליגת-הענקים", ctx: "השוואה-כנה מול-ענקי-ה-DeFi של-העולם", src: "DefiLlama API חי", icon: Trophy },
  { id: "channel", label: "הערוץ", ctx: "הדלת-הראשית שלך מול-הריבונות · שער-המנהל פותח-הכל", src: "Pulse/sovereign-channel · append-only", icon: Radio },
  { id: "wallet", label: "הארנק", ctx: "חשבונות-אמת מהמנוע · יחידות-אנוש", src: "המנוע מהגיט · mu÷1000", icon: Wallet },
  { id: "desk", label: "השולחן", ctx: "המנדט · ה-equity · האסטרטגיות", src: "Domain/dex/honest-econ", icon: Banknote },
  { id: "ledger", label: "הרישום", ctx: "כל-ההחלטות-הרשומות · חיפוש", src: "מנוע-הרישום מהגיט", icon: ScrollText },
  { id: "products", label: "המוצרים", ctx: "קטלוג-אמת · קבלות · מדידות", src: "products.json הקנוני", icon: Package },
  { id: "pulse", label: "הדופק", ctx: "מערכת-האמת · שערי-truth · טביעות-sha16", src: "Pulse/giant הקנוני", icon: Activity },
  { id: "office", label: "המשרד-החי", ctx: "הצוות-בתלת-מימד · קונסולת-מפעיל", src: "FleetHQ/office · דמויות-GLB חיות", icon: Building2 },
  { id: "estate", label: "האחוזה", ctx: "מפקד-הגיט · בריאות-הספרים · פוטנציאל", src: "/api/organism · 39 ספרים", icon: Landmark },
  { id: "capabilities", label: "מאגר-היכולות", ctx: "כל-מה-שהמערכת-יודעת-לעשות · נבדק-חי עכשיו", src: "סריקת-קוד + פרובת-200 חיה", icon: Boxes },
];

interface TruthChip {
  verdict: string | null;
  ageMinutes: number | null;
}

export default function Home() {
  const [view, setView] = useState<ViewId>("overview");
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

  /* פלטת-הפקודה: ניווט + פעולות (action:* מפורש לעמודה-הנכונה) */
  const onPaletteNavigate = useCallback((id: string) => {
    if (id === "action:refresh-pulse") setView("pulse");
    else if (id === "action:gate.open" || id === "action:sovereign.ask") setView("channel");
    else if (NAV.some((n) => n.id === id)) setView(id as ViewId);
  }, []);

  /* ניווט-מהסקירה: מזהי-מודול-תקינים-בלבד (הסקירה עצמה שולחת אחד-מ-16) */
  const navigate = useCallback((id: string) => {
    if (NAV.some((n) => n.id === id)) setView(id as ViewId);
  }, []);

  const active = NAV.find((n) => n.id === view);
  const ActiveIcon = active?.icon ?? Compass;
  const truthGreen = truth?.verdict?.includes("GREEN") ?? false;

  return (
    <div className="relative flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      {/* אורורה-חיה + גרגר-סרט (T60) — מאחורי-הכל, לא-לוחצים-עליהם */}
      <div aria-hidden className="g-aur a1" />
      <div aria-hidden className="g-aur a2" />
      <div aria-hidden className="g-aur a3" />
      <div aria-hidden className="giant-grain" />

      <GiantPalette onNavigate={onPaletteNavigate} />

      {/* ═══ ראש-המערכת ═══ */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-zinc-950/85 backdrop-blur-xl" dir="rtl">
        <div className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 font-black text-lg text-zinc-950 shadow-lg shadow-amber-600/20" aria-hidden>G</span>
            <div>
              <h1 className="text-lg font-black leading-6 tracking-tight">
                <span className="giant-wordmark giant-wordmark-anim text-xl">GIANT</span>
                <span className="mx-2 text-amber-600/60">·</span>
                <span className="text-zinc-100">הממשק-המאוחד</span>
              </h1>
              <p className="hidden text-[10px] leading-3 text-zinc-500 sm:block">
                מיזוג-5-הסוכנים · 16 מודולים · הכל-נמדד-חי · אפס-כפילויות
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {truth && (
              <span
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:flex ${truthGreen ? "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-400" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}
                title={truth.verdict ? `truth-gate: ${truth.verdict}` : "truth-gate לא נמדד"}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                truth-gate: {truth.verdict ?? "לא-נמדד"}
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1 text-[10px] font-bold text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
              ריבונות חיה · 24/7
            </span>
            <button
              onClick={() => window.dispatchEvent(new Event("giant-palette:open"))}
              className="hidden min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 text-[10px] font-bold text-zinc-400 transition hover:border-amber-600/40 hover:text-amber-400 sm:flex"
              aria-label="פתח פלטת-פקודה (Ctrl+K)"
              title="פלטת-פקודה · Ctrl+K"
            >
              <Command className="h-3 w-3" aria-hidden />
              Ctrl+K
            </button>
            <span className="hidden font-mono text-xs tabular-nums text-zinc-500 md:inline" aria-label="שעון-המערכת">{clock}</span>
          </div>
        </div>
        {/* סרט-המחירים החי (Kraken→Binance→CoinGecko) */}
        <div className="relative z-10">
          <TickerTape />
        </div>
      </header>

      {/* ═══ גוף: ניווט-צד (מחשב) + ContextBar + תוכן ═══ */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 gap-5 px-4 py-5" dir="rtl">
        <nav aria-label="מודולי-המערכת" className="hidden w-64 shrink-0 flex-col gap-1 md:flex">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                aria-current={on ? "page" : undefined}
                className={`giant-lift flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-right ${
                  on
                    ? "border-amber-600/50 bg-amber-500/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-white/[0.05] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${on ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.05] text-zinc-500"}`} aria-hidden>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold leading-5 ${on ? "text-amber-200" : "text-zinc-300"}`}>{n.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] leading-4 text-zinc-500">{n.ctx}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-4 rounded-xl border border-amber-600/20 bg-amber-500/[0.04] p-4 text-[10px] leading-5 text-zinc-400">
            <b className="text-amber-300">מפתח-מנהל (headcorner)</b> פותח-הכל: הכרעות · הוראות · קונסולת-מפעיל · קול-הריבונות-המדבר.
            מנדט-הבעלים: אין-חוקים-מעכבים — עושים-הכל, מדידה-קודמת-לכל-טענה.
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-28 md:pb-4">
          {/* ContextBar — שורת-ההקשר: מה-רואים + מאיפה-הנתונים (לכל-מודול, תמיד) */}
          <motion.section
            key={`ctx-${view}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mb-4 rounded-2xl border border-white/[0.07] bg-gradient-to-l from-amber-500/[0.07] via-white/[0.03] to-transparent p-4 backdrop-blur-xl giant-spec"
            dir="rtl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400" aria-hidden>
                <ActiveIcon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black leading-5 text-zinc-100">
                  {active?.label}
                  <span className="mx-1.5 text-zinc-600">·</span>
                  <span className="font-normal text-zinc-400">{active?.ctx}</span>
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">
                  מקור-הנתונים: <span className="text-zinc-400">{active?.src}</span>
                  <span className="mx-1.5 text-zinc-700">|</span>
                  Ctrl+K לניווט-מהיר-בין-כל-16-המודולים
                </p>
              </div>
            </div>
          </motion.section>

          <motion.div
            key={view}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {view === "sovereignty" && <SovereigntyView />}
            {view === "empire" && <EmpireView onNavigate={navigate} />}
            {view === "trust" && <TrustView />}
            {view === "overview" && <OverviewView onNavigate={navigate} />}
            {view === "machine" && <MachineView />}
            {view === "dex" && <DexView />}
            {view === "league" && <GiantsView />}
            {view === "channel" && <ChannelView />}
            {view === "wallet" && <WalletView />}
            {view === "desk" && <DeskView />}
            {view === "ledger" && <LedgerView />}
            {view === "products" && <ProductsView />}
            {view === "pulse" && <PulseView />}
            {view === "office" && <OfficeHqView />}
            {view === "estate" && <EstateView />}
            {view === "capabilities" && <CapabilityView />}
          </motion.div>
        </main>
      </div>

      {/* ═══ ניווט-תחתון (נייד): כל-16-המודולים בגלילה-אופקית (נגזר-מ-NAV) ═══ */}
      <nav
        aria-label="מודולי-המערכת (נייד)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        dir="rtl"
      >
        <div className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
                  on
                    ? "border-amber-600/50 bg-amber-500/[0.12] text-amber-300"
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-500"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ═══ תחתית-המערכת (דביקה) ═══ */}
      <footer className="relative z-10 mt-auto hidden h-9 shrink-0 items-center justify-between border-t border-white/[0.08] bg-zinc-950/90 px-4 text-[11px] text-zinc-500 backdrop-blur-xl md:flex" dir="rtl">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">מפקדת הצי</span>
          <span className="hidden sm:inline">· הריבונות מפעילה-הכל; הגיט הוא שכבת-הקיום; המערכת מתפתחת לנצח</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">T63-a · 16 מודולים · מיזוג-הענק-האח (אימפריה+אמון) · TTS-חי · ספר-פקודות-חוץ · מאגר-יכולות · R360 · R74</span>
        </div>
      </footer>
    </div>
  );
}
