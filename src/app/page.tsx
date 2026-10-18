"use client";

import { useCallback, useEffect, useState } from "react";
import { SubmissionView } from "@/components/giant/SubmissionView";
import { MachineView } from "@/components/giant/MachineView";
import { DexView } from "@/components/giant/DexView";
import { GiantsView } from "@/components/giant/LeagueView";
import { ChannelView } from "@/components/giant/ChannelView";
import { WalletView } from "@/components/giant/WalletView";
import { DeskView } from "@/components/giant/DeskView";
import { CapitalView } from "@/components/giant/CapitalView";
import { LedgerView } from "@/components/giant/LedgerView";
import { ProductsView } from "@/components/giant/ProductsView";
import { PulseView } from "@/components/giant/PulseView";
import { OfficeHqView } from "@/components/giant/OfficeHqView";
import { EstateView } from "@/components/giant/EstateView";
import { EmpireView } from "@/components/giant/EmpireView";
import { TrustView } from "@/components/giant/TrustView";
import { MarketingView } from "@/components/giant/MarketingView";
import { ApiView } from "@/components/giant/ApiView";
import { FleetView } from "@/components/giant/FleetView";
import { GapView } from "@/components/giant/GapView";
import { BuilderView } from "@/components/giant/BuilderView";
import { SaosCockpit } from "@/components/saos/SaosCockpit";
import { TickerTape } from "@/components/giant/TickerTape";
import { GiantPalette } from "@/components/giant/GiantPalette";
import { DOORS, measureAllDoors, type DoorStatusMap } from "@/lib/giant/doors";
import {
  Activity, BookOpen, Building2, Coins, Command, Cog, Crown, GitBranch, Hammer, KeyRound, LineChart, Megaphone, Network,
  Package, Radio, Scale, ScrollText, ShieldCheck, Ship, Trophy, Wallet,
  type LucideIcon,
} from "lucide-react";

/* ═══ GIANT — הממשק-המאוחד של כל-הצי (T58 · מיזוג-5-הסוכנים · גל-6 עיצוב) ═══
 * מה-מי:
 *  · מכונת-האמת (anatomy-grade, חוקי wheresryan22/anatomy: האובייקט=ההסבר)
 *  · הדקס + ליגת-הענקים (DefiLlama חי) — הכסף הוא הפנים (T55)
 *  · הערוץ האחד + שער-headcorner + קול-הריבונות (T53/T56, מנדט-הבעלים: עושה-הכל)
 *  · המשרד-החי התלת-מימדי + קונסולת-מפעיל (FleetHQ ∪ giant/app)
 *  · דופק-אמת · האחוזה (מפקד-הגיט) · ארנק/שולחן/רישום/מוצרים (התאומים)
 *  · Ctrl+K פלטת-פקודה על-כל-המערכת · סרט-מחירים חי (Kraken)
 * גל-6 — חוקי-העיצוב של הענקים (מדוד מ-10 אתרי-רפרנס, docs/design/design-laws.md):
 *  · supahero → hero-חי בדלת-הכניסה (הצהרה + CTA + מספרים-נמדדים)
 *  · godly    → אמביינט: זוהר-ענבר + גרעין-סרט
 *  · 60fps    → מעברי-תצוגה + reduced-motion
 *  · designspells → מיקרו-אינטראקציות: הרמה/נשימה/קו-נשימה
 *  · awwwards → focus-ring, היררכיה, משמעת-רשת
 * משטח-אחד-לכל-יכולת · ערוץ-אחד · אפס-כפילויות · הכל נמדד-חי מהגיט. */

type ViewId =
  | "submission" | "machine" | "dex" | "league" | "gap" | "channel" | "wallet" | "desk" | "api"
  | "fleet"
  | "capital"
  | "ledger" | "products" | "pulse" | "office" | "estate" | "empire" | "trust"
  | "builder"
  | "saos"
  | "marketing";

/* סדר-הפתיחה (T58; גל-9: ההגשה היא דלת-הפתיחה — מנדט-הבעלים "אני עוד לא רואה רבע"). */
const NAV: Array<{ id: ViewId; label: string; he: string; icon: LucideIcon }> = [
  { id: "submission", label: "ההגשה", he: "ההגשה-הסופית: הרעיון המאוחד · הארכיטקטורה · הכלכלה · הלקחים · הענקים", icon: Crown },
  { id: "machine", label: "המכונה", he: "מכונת-האמת: הדקס כמכונה חיה (anatomy)", icon: Cog },
  { id: "dex", label: "הדקס", he: "מרכז-הכובד: נרות · קופות · ווליום", icon: LineChart },
  { id: "league", label: "ליגת-הענקים", he: "DefiLlama חי · השורה-שלנו בכנות", icon: Trophy },
  { id: "gap", label: "מפת-הפער", he: "ההשוואה-הכנה מול-מוצרים-אמתיים · טענות-הסוכנים מול-מה-נמדד · מפת-איחוד M1..M6", icon: Scale },
  { id: "builder", label: "הבנאי", he: "הבנאי-הריבוני-החי: לופ-צמיחה observe→think→act→seal · בניה-מתמדכת, לא-רק-בדיקות · תור-בניה ויומן-צמיחה מהגיט", icon: Hammer },
  { id: "saos", label: "SAOS", he: "קוקפיט-הריבונות של agent-2: כלכלה-חיה · פעימות-עוגנים · צמיחה · ארסנל · ריבוי-צמתים על ספר-אחד (גל-90→93)", icon: Network },
  { id: "channel", label: "הערוץ", he: "הדלת-הראשית: בעלים ↔ ריבונות", icon: Radio },
  { id: "wallet", label: "הארנק", he: "חשבונות-אמת מהמנוע · יחידות-אנוש", icon: Wallet },
  { id: "desk", label: "השולחן", he: "מנדט · equity · אסטרטגיות", icon: ScrollText },
  { id: "api", label: "ה-API", he: "מסילות-מפתחות-אמת: הנפקה-עצמית-לסוכנים-שלנו-ולכל-מחזיק-מפתח · חוק-אחד-לכולם · מגבלות-קצב", icon: KeyRound },
  { id: "fleet", label: "הצי", he: "משתמשי-הרשת-פנים-ראשון: החיילים-הצי-והסוכנים הם-המשתמשים · סוחרים-על-הבריכה-שלנו · ארנק-אמת · הפיתוח-כלפי-פנים", icon: Ship },
  { id: "capital", label: "ההון", he: "מנוע-ההון: מנדט-קידום-חי · תנועות-הון מתקדמות-בשערים-הירוקים · לולאת-תיקון-במקום-סגירה", icon: Coins },
  { id: "ledger", label: "הרישום", he: "כל-ההחלטות · חיפוש", icon: BookOpen },
  { id: "products", label: "המוצרים", he: "קטלוג-אמת · קבלות · מדידות", icon: Package },
  { id: "marketing", label: "השיווק", he: "משטח-Adsmarket-החי: מה-שכתוב-בריפו = מה-שמוצג · אפס-סינתזה", icon: Megaphone },
  { id: "pulse", label: "הדופק", he: "מערכת-האמת: שערים · זרמים · טביעות", icon: Activity },
  { id: "office", label: "המשרד-החי", he: "החדר-התלת-מימדי · קונסולת-מפעיל", icon: Building2 },
  { id: "estate", label: "האחוזה", he: "מפקד-הגיט: 39 ספרים · בריאות · פוטנציאל", icon: GitBranch },
  { id: "empire", label: "החיבור", he: "מפת-האימפריה: כל-הספרים × תפקידם × דלתם — הפעלה-מלאה", icon: Network },
  { id: "trust", label: "האמון", he: "מפת-האמון: סריקה-מדודה של כל-הספרים · אפס-סימולציות בהוכחה", icon: ShieldCheck },
];

interface TruthChip {
  verdict: string | null;
  ageMinutes: number | null;
}

/* מספרי-ה-hero — הכל נמדד-חי (supahero: hero שתופס = מספרים אמיתיים, לא מילים) */
interface HeroStats {
  repos: number | null;          // /api/giant/fleet → total
  pushed24h: number | null;      // /api/giant/fleet → pushedLast24h
  treasuryEverUsds: number | null; // /api/giant/dex → treasuryProfitEver (µ) ÷ 1000 — המצטבר, לא-היומי
}

const HERO_EMPTY: HeroStats = { repos: null, pushed24h: null, treasuryEverUsds: null };

const fmtInt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";

export default function Home() {
  const [view, setView] = useState<ViewId>("submission");
  const [clock, setClock] = useState("");
  const [truth, setTruth] = useState<TruthChip | null>(null);
  const [hero, setHero] = useState<HeroStats>(HERO_EMPTY);
  /* גל-11: ראיה-מוצגת-על-כל-כפתור — מדידה-חיה-של-כל-דלת (ok · ms · זמן) */
  const [doors, setDoors] = useState<DoorStatusMap>({});

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

  /* מספרי-ה-hero: נמדדים-חי, כשל = "—" (אף-מספר-מזויף) */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next: HeroStats = { ...HERO_EMPTY };
      try {
        const r = await fetch("/api/giant/fleet", { cache: "no-store" });
        const d = (await r.json()) as { total?: number | null; pushedLast24h?: number | null };
        next.repos = typeof d.total === "number" ? d.total : null;
        next.pushed24h = typeof d.pushedLast24h === "number" ? d.pushedLast24h : null;
      } catch { /* כנות: "—" */ }
      try {
        const r = await fetch("/api/giant/dex", { cache: "no-store" });
        const d = (await r.json()) as { treasuryProfitEver?: number | null };
        /* יחידות-אמת (חוק-גל-42): 1 = 1000µ — מציגים את המצטבר ביחידות-אנוש */
        next.treasuryEverUsds = typeof d.treasuryProfitEver === "number" ? d.treasuryProfitEver / 1000 : null;
      } catch { /* כנות: "—" */ }
      if (alive) setHero(next);
    };
    load();
    const iv = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  /* ראיה-על-כל-כפתור (גל-11): מדידה-מקבילית של כל-דלת, כל-90ש׳ */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const m = await measureAllDoors();
      if (alive) setDoors(m);
    };
    void load();
    const iv = setInterval(load, 90_000);
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

  /* ניווט-מערכתי-פנימי: דלתות-קוראות-לניווט (למשל דוכן-המסחר → שער-headcorner) */
  useEffect(() => {
    const onNav = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string" && NAV.some((n) => n.id === id)) setView(id as ViewId);
    };
    window.addEventListener("giant-navigate", onNav);
    return () => window.removeEventListener("giant-navigate", onNav);
  }, []);

  const active = NAV.find((n) => n.id === view);
  const truthGreen = truth?.verdict?.includes("GREEN") ?? false;

  /* hero: מספרים-חיים + CTA (supahero) — נמדד-כנה, "—" = לא נמדד */
  const heroChips: Array<{ k: string; v: string; live: boolean }> = [
    { k: "truth-gate", v: truth?.verdict ?? "לא-נמדד", live: truthGreen },
    { k: "רווחי-אוצר-מצטבר", v: hero.treasuryEverUsds != null ? `${fmtInt(hero.treasuryEverUsds)} USDS` : "—", live: hero.treasuryEverUsds != null },
    { k: "ספרים-חיים", v: `${fmtInt(hero.repos)} ריפו · ${fmtInt(hero.pushed24h)} נדחפו/24ש׳`, live: hero.repos != null },
  ];

  return (
    <div className="relative flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      {/* ארט-דיירקשן אמביינט (godly) — שכבת-רקע בלבד */}
      <div aria-hidden className="g-ambient" />

      <GiantPalette onNavigate={onPaletteNavigate} />

      {/* ═══ ראש-המערכת ═══ */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/90 backdrop-blur" dir="rtl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 font-black text-zinc-950 shadow-[0_0_18px_-2px_rgba(245,158,11,0.55)]"
              aria-hidden
            >
              G
            </span>
            <div>
              <h1 className="text-base font-black leading-5">
                GIANT <span className="text-amber-500">·</span> הממשק-המאוחד
              </h1>
              <p className="hidden text-[10px] leading-3 text-zinc-500 sm:block">הפלטפורמה-האחת של הריבונות · מיזוג-כל-הצי · אפס-כפילויות</p>
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
              <span className="g-breathe h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              ריבונות חיה · 24/7
            </span>
            <button
              onClick={() => window.dispatchEvent(new Event("giant-palette:open"))}
              className="hidden min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-2.5 text-[10px] font-bold text-zinc-400 transition hover:border-amber-600/40 hover:text-amber-400 sm:flex"
              aria-label="פתח פלטת-פקודה (Ctrl+K)"
              title="פלטת-פקודה · Ctrl+K"
            >
              <Command className="h-3 w-3" aria-hidden />
              Ctrl+K
            </button>
            <span className="hidden font-mono text-xs text-zinc-500 md:inline" aria-label="שעון-המערכת">{clock}</span>
          </div>
        </div>
        {/* סרט-המחירים החי (Kraken→Binance→CoinGecko) */}
        <TickerTape />
      </header>

      {/* ═══ גוף: ניווט-צד (מחשב) + תוכן ═══ */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 gap-5 px-4 py-5" dir="rtl">
        <nav aria-label="מודולי-המערכת" className="hidden w-60 shrink-0 flex-col gap-1 md:flex">
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive = view === n.id;
            const st = doors[n.id];
            const stTitle = st?.at
              ? `דלת-חיה · ${DOORS.find((d) => d.id === n.id)?.api} · ${st.ok ? "ok" : "כשל-כנה"} · ${st.ms}ms · ${new Date(st.at).toLocaleTimeString("he-IL")}`
              : "טרם-נמדד — המדידה-הראשונה-בעוד-רגע";
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                aria-current={isActive ? "page" : undefined}
                className={`group relative overflow-hidden rounded-xl border px-3.5 py-2.5 text-right transition-all duration-200 ${
                  isActive
                    ? "border-amber-600/45 bg-amber-500/[0.07] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_-12px_rgba(245,158,11,0.25)]"
                    : "border-white/5 bg-zinc-900/40 text-zinc-400 hover:-translate-y-px hover:border-white/15 hover:bg-zinc-900/70 hover:text-zinc-200"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-amber-500" : "text-zinc-500 group-hover:text-zinc-300"}`}
                    aria-hidden
                  />
                  <span className="block text-sm font-bold leading-5">{n.label}</span>
                  {/* ראיה-חיה-על-הכפתור: נקודת-מדידה (ירוק-נושם/אדום/אפור) */}
                  <span
                    title={stTitle}
                    aria-label={`מצב-הדלת: ${stTitle}`}
                    className={`mr-auto h-1.5 w-1.5 shrink-0 rounded-full ${
                      st?.at == null ? "bg-zinc-600" : st.ok ? "g-breathe bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                </span>
                <span className="mt-0.5 block pr-[26px] text-[10px] leading-4 text-zinc-500">{n.he}</span>
                {isActive && <span className="g-active-line absolute bottom-0 right-0 left-0 h-px bg-gradient-to-l from-transparent via-amber-500/70 to-transparent" aria-hidden />}
              </button>
            );
          })}
          <div className="g-card mt-3 rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-[10px] leading-5 text-zinc-500">
            <b className="text-zinc-300">מפתח-מנהל (headcorner)</b> פותח-הכל: הכרעות · הוראות · קונסולת-מפעיל · קול-הריבונות.
            מנדט-הבעלים: אין-חוקים-מעכבים — עושים-הכל, מדידה-קודמת-לכל-טענה.
          </div>
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-[10px] leading-5 text-zinc-600">
            זרמי-האמת: <span className="font-mono text-zinc-500">Domain/dex</span> · <span className="font-mono text-zinc-500">Pulse/sovereign-channel</span> · <span className="font-mono text-zinc-500">FleetHQ/office</span>
            <br />
            חוקי-העיצוב: 10 רפרנסים שנשמרו · <span className="text-zinc-500">5 נמדדו-חי</span> · <span className="text-zinc-500">5 לא-נמדדו (כנה)</span> — <span className="font-mono">docs/design/design-laws.md</span>
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-24 md:pb-4">
          {/* מובייל: כותרת-מודול */}
          <div className="mb-3 md:hidden" dir="rtl">
            <p className="text-xs font-bold text-zinc-300">{active?.label}</p>
            <p className="text-[10px] text-zinc-500">{active?.he}</p>
          </div>

          {/* hero-הכניסה (supahero): רק בדלת — הצהרה + CTA + מספרים-חיים */}
          {view === "machine" && (
            <section
              aria-label="הצהרת-המערכת"
              className="g-rise relative mb-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-l from-amber-950/25 via-zinc-950 to-zinc-950 p-5 sm:p-7"
              dir="rtl"
            >
              <div aria-hidden className="pointer-events-none absolute -top-24 left-1/4 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500/90">
                SAOS · מערכת-הפעלה ריבונית · חיה 24/7
              </p>
              <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-4xl">
                מערכת-<span className="text-amber-500">האמת</span> שלי
              </h2>
              <p className="mt-2 max-w-xl text-xs leading-5 text-zinc-400 sm:text-sm">
                ממשק-אחד לכל-הצי: המכונה מסבירה את הדקס, הדקס סוחר, הערוץ מחבר את הבעלים,
                המשרד חי — וכל-מספר נמדד-חי מהגיט. אפס-סימולציות, אפס-כפילויות.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => setView("channel")}
                  className="group flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-zinc-950 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-500"
                >
                  <ShieldCheck className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden />
                  שער-headcorner — פתח-הכל
                </button>
                <button
                  onClick={() => setView("dex")}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-sm font-bold text-zinc-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-600/40 hover:text-amber-400"
                >
                  <LineChart className="h-4 w-4" aria-hidden />
                  הדקס-החי
                </button>
              </div>
              {/* מספרי-ה-hero: נמדדים-חיים (כשל = "—", אף-מספר-מזויף) */}
              <div className="mt-4 flex flex-wrap gap-2">
                {heroChips.map((c) => (
                  <span
                    key={c.k}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                      c.live ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300" : "border-zinc-700/60 bg-zinc-900/70 text-zinc-400"
                    }`}
                    title={`${c.k} — נמדד-חי מה-API (כשל מוצג "—")`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.live ? "g-breathe bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                    {c.k}: <span className="font-mono">{c.v}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* מעבר-תצוגה (60fps): כניסה-חלקה-פעם-אחת לכל-מודול */}
          <div key={view} className="g-view-in">
            {view === "submission" && <SubmissionView />}
            {view === "machine" && <MachineView />}
            {view === "dex" && <DexView />}
            {view === "league" && <GiantsView />}
            {view === "gap" && <GapView />}
            {view === "builder" && <BuilderView />}
            {view === "saos" && <SaosCockpit />}
            {view === "channel" && <ChannelView />}
            {view === "wallet" && <WalletView />}
            {view === "desk" && <DeskView />}
            {view === "api" && <ApiView />}
            {view === "fleet" && <FleetView />}
            {view === "capital" && <CapitalView />}
            {view === "ledger" && <LedgerView />}
            {view === "products" && <ProductsView />}
            {view === "pulse" && <PulseView />}
            {view === "office" && <OfficeHqView />}
            {view === "estate" && <EstateView />}
            {view === "empire" && <EmpireView onNavigate={(id) => { if (NAV.some((n) => n.id === id)) setView(id as ViewId); }} />}
            {view === "trust" && <TrustView />}
            {view === "marketing" && <MarketingView />}
          </div>
        </main>
      </div>

      {/* ═══ ניווט-תחתון (נייד): 4-ראשונים + פלטת-פקודה ═══ */}
      <nav
        aria-label="מודולי-המערכת (נייד)"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        dir="rtl"
      >
        {NAV.slice(0, 4).map((n) => {
          const Icon = n.icon;
          const isActive = view === n.id;
          const st = doors[n.id];
          return (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-center text-[10px] font-bold transition ${isActive ? "text-amber-500" : "text-zinc-500"}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {n.label}
              {/* ראיה-חיה-על-הכפתור (גל-11) */}
              <span
                aria-label={`מצב-הדלת: ${st?.at ? (st.ok ? "ok" : "כשל-כנה") : "טרם-נמדד"}`}
                title={st?.at ? `${st.ok ? "ok" : "כשל-כנה"} · ${st.ms}ms` : "טרם-נמדד"}
                className={`absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full ${st?.at == null ? "bg-zinc-600" : st.ok ? "g-breathe bg-emerald-400" : "bg-red-400"}`}
              />
            </button>
          );
        })}
        <button
          onClick={() => window.dispatchEvent(new Event("giant-palette:open"))}
          aria-label="כל-המודולים (פלטת-פקודה)"
          className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-center text-[10px] font-bold transition ${
            view !== "machine" && view !== "dex" && view !== "league" && view !== "channel" ? "text-amber-500" : "text-zinc-500"
          }`}
        >
          <Package className="h-4 w-4" aria-hidden />
          עוד
        </button>
      </nav>

      {/* ═══ תחתית-המערכת (דביקה) ═══ */}
      <footer className="relative z-10 mt-auto hidden h-9 shrink-0 items-center justify-between border-t border-white/10 bg-zinc-950 px-4 text-[11px] text-zinc-500 md:flex" dir="rtl">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">מפקדת הצי</span>
          <span className="hidden sm:inline">· הריבונות מפעילה-הכל; הגיט הוא שכבת-הקיום; המערכת מתפתחת לנצח</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">SAOS-SOVEREIGN-CHANNEL/1 · R360 · R74 · T58-merge · גל-11-ראיה-על-כל-כפתור</span>
        </div>
      </footer>
    </div>
  );
}
