"use client";

import { useEffect, useState } from "react";
import { GiantsView } from "@/components/giant/GiantsView";
import { ChannelView } from "@/components/giant/ChannelView";
import { DexView } from "@/components/giant/DexView";
import { WalletView } from "@/components/giant/WalletView";
import { DeskView } from "@/components/giant/DeskView";
import { LedgerView } from "@/components/giant/LedgerView";
import { ProductsView } from "@/components/giant/ProductsView";
import { OfficeView } from "@/components/giant/OfficeView";

/* ═══ GIANT — מערכת-האמת של הריבונות ═════════════════════════════════════
 * הפלטפורמה-המאוחדת · ערוץ-אחד · אפס-כפילויות · תקן-ענקים (R360/#42):
 * · ליגת-הענקים = הדלת-הראשית: כל-מי-שמייצר-היום-ב-DeFi מולנו, נמדד-חי (R75).
 * · הערוץ = הדלת-הראשית-לבעלים: בעלים ↔ ריבונות, זרמי-גיט קנוניים, קומיט-ישיר.
 * · הדקס = מרכז-הכובד: שטח-מסחר על מצב-המנוע מהגיט (נרות · ווליום-כנות).
 * · הארנק = 20 חשבונות-אמת · השולחן = מנדט+equity · הרישום = כל-ההחלטות.
 * · המוצרים = קטלוג-אמת · המשרד-החי = המשרד-היחיד.
 * מפתח-מנהל (headcorner) פותח-הכל. הכל נמדד-חי מהגיט; אפס-ירוק-מזויף. */

type ViewId = "giants" | "channel" | "dex" | "wallet" | "desk" | "ledger" | "products" | "office";

const NAV: Array<{ id: ViewId; label: string; he: string }> = [
  { id: "giants", label: "ליגת-הענקים", he: "כל-מי-שמייצר-היום ב-DeFi מולנו · משטחי-הצי" },
  { id: "channel", label: "הערוץ", he: "הדלת-הראשית: בעלים ↔ ריבונות" },
  { id: "dex", label: "הדקס", he: "שטח-מסחר: נרות · ווליום · pools" },
  { id: "wallet", label: "הארנק", he: "20 חשבונות-אמת מהמנוע" },
  { id: "desk", label: "השולחן", he: "מנדט · equity · אסטרטגיות" },
  { id: "ledger", label: "הרישום", he: "כל-ההחלטות · חיפוש" },
  { id: "products", label: "המוצרים", he: "קטלוג-אמת · סטטוסים-כנים" },
  { id: "office", label: "המשרד-החי", he: "המשרד-היחיד של הריבונות" },
];

export default function Home() {
  const [view, setView] = useState<ViewId>("giants");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const active = NAV.find((n) => n.id === view);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      {/* ═══ ראש-המערכת ═══ */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/90 backdrop-blur" dir="rtl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 font-black text-zinc-950" aria-hidden>G</span>
            <div>
              <h1 className="text-base font-black leading-5">GIANT <span className="text-amber-500">·</span> מערכת-האמת</h1>
              <p className="hidden text-[10px] leading-3 text-zinc-500 sm:block">הפלטפורמה-המאוחדת של הריבונות · ערוץ-אחד · אפס-כפילויות</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold text-emerald-400 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              ריבונות חיה · 24/7
            </span>
            <span className="font-mono text-xs text-zinc-500" aria-label="שעון-המערכת">{clock}</span>
          </div>
        </div>
      </header>

      {/* ═══ גוף: ניווט-צד (מחשב) + תוכן ═══ */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-5 px-4 py-5" dir="rtl">
        <nav aria-label="מודולי-המערכת" className="hidden w-60 shrink-0 flex-col gap-1 md:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={`rounded-xl border px-4 py-2.5 text-right transition ${
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
            <b className="text-zinc-400">מפתח-מנהל (headcorner)</b> פותח-הכל: הערוץ, עמדת-המפעיל והניהול.
            המערכת לעולם אינה גמורה — האוטונומיה בודקת, מתקנת, בונה, משפרת, פורצת דרך.
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="mb-3 md:hidden" dir="rtl">
            <p className="text-xs font-bold text-zinc-300">{active?.label}</p>
            <p className="text-[10px] text-zinc-500">{active?.he}</p>
          </div>
          {view === "giants" && <GiantsView />}
          {view === "channel" && <ChannelView />}
          {view === "dex" && <DexView />}
          {view === "wallet" && <WalletView />}
          {view === "desk" && <DeskView />}
          {view === "ledger" && <LedgerView />}
          {view === "products" && <ProductsView />}
          {view === "office" && <OfficeView />}
        </main>
      </div>

      {/* ═══ ניווט-תחתון (נייד) — גליל-אופקי ═══ */}
      <nav
        aria-label="מודולי-המערכת (נייד)"
        className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-white/10 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        dir="rtl"
      >
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            aria-current={view === n.id ? "page" : undefined}
            className={`min-h-[44px] flex-1 whitespace-nowrap px-3 py-2 text-center text-xs font-bold transition ${view === n.id ? "text-amber-500" : "text-zinc-500"}`}
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
          <a className="transition-colors hover:text-amber-500" href="https://roshpinacare-sys.github.io/Domain/marketing/" target="_blank" rel="noreferrer">המוצרים</a>
          <a className="transition-colors hover:text-amber-500" href="https://roshpinacare-sys.github.io/Pulse/sovereign.html" target="_blank" rel="noreferrer">המשטח-הסטטי</a>
          <a className="transition-colors hover:text-amber-500" href="https://github.com/roshpinacare-sys" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
