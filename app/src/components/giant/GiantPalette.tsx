"use client";

/* ═══ פלטת-הפקודה · Ctrl+K (GIANT) ═════════════════════════════════════════
 * מנוע: cmdk דרך רכיבי shadcn CommandDialog (Dialog+cmdk).
 * · קיצור גלובלי אחד: Ctrl/Cmd+K מציג-מסתיר; "/" פותח כשלא-בתוך-שדה-קלט.
 * · (א) מודולים — 11 מזהי-מערכת עם תוויות עבריות+אנגליות (חיפוש-דו-לשוני).
 * · (ב) פעולות — מחרוזות-פעולה "action:*" שהמתזמן מפרש.
 * · (ג) זרמי-אמת — הנתיבים הקנוניים האמיתיים; העתקה-ללוח עם טוסט-כנה.
 * אפס-זיופים: הרשימה סטטית-מוצהרת; הנתיבים מהקוד השרת (lib/sovereign/channel.ts). */

import { useCallback, useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  Banknote,
  Building2,
  ClipboardCopy,
  Coffee,
  Gauge,
  Landmark,
  Network,
  Package,
  Radio,
  ScrollText,
  Sparkles,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

interface ModuleEntry {
  id: string;
  he: string;
  desc: string;
  en: string;
  icon: React.ReactNode;
}

const MODULES: ModuleEntry[] = [
  { id: "dex", he: "הדקס", desc: "מרכז-הכובד: נרות · ליגה · ווליום", en: "dex exchange trading candles", icon: <Landmark aria-hidden /> },
  { id: "channel", he: "הערוץ-הריבוני", desc: "הערוץ-היחיד: הוראות · פניות · רישומים", en: "channel sovereign gate", icon: <Radio aria-hidden /> },
  { id: "wallet", he: "הארנק", desc: "משמורת · ספרים · יחידות-אנוש", en: "wallet custody books", icon: <Wallet aria-hidden /> },
  { id: "desk", he: "השולחן", desc: "שולחן-המסחר · ספר-הזמנות", en: "desk orderbook trading", icon: <Banknote aria-hidden /> },
  { id: "ledger", he: "הרישום", desc: "רישום-האמת · מילויים · גבהים", en: "ledger fills height", icon: <ScrollText aria-hidden /> },
  { id: "products", he: "המוצרים", desc: "מפת-המוצרים · רישומי-נכסים", en: "products assets map", icon: <Package aria-hidden /> },
  { id: "pulse", he: "הדופק", desc: "שער-האמת · זרמי-הערוץ", en: "pulse truth gate streams", icon: <Activity aria-hidden /> },
  { id: "office", he: "המשרד-החי", desc: "הצוות · הלב · הפעימות", en: "office live crew agents", icon: <Building2 aria-hidden /> },
  { id: "league", he: "ליגת-הענקים", desc: "מול-הענקים: Uniswap · דוקטרינת-כנות", en: "league giants uniswap", icon: <Users aria-hidden /> },
  { id: "machine", he: "מכונת-האמת", desc: "מכונת-האמת · מדידות", en: "machine truth engine", icon: <Gauge aria-hidden /> },
  { id: "estate", he: "האחוזה", desc: "מפקד-האחוזה: הגיט · הזרימה · העבודות", en: "estate git census repos", icon: <Building2 aria-hidden /> },
  { id: "empire", he: "החיבור", desc: "מפת-האימפריה: כל-הספרים × תפקידם × דלתם", en: "empire connection map repos roles wiring", icon: <Network aria-hidden /> },
  { id: "trust", he: "האמון", desc: "מפת-האמון: סריקה-מדודה של כל-הספרים", en: "trust scan fleet simulation audit", icon: <ShieldCheck aria-hidden /> },
];

interface ActionEntry {
  id: string;
  he: string;
  desc: string;
  en: string;
  icon: React.ReactNode;
}

/* מחרוזות-פעולה "action:*" — המתזמן מפרש (רענון-דופק/פתיחת-שער/שאילת-ריבונות). */
const ACTIONS: ActionEntry[] = [
  { id: "action:refresh-pulse", he: "רענן-דופק", desc: "מדידת-דופק עכשיו", en: "refresh pulse reload", icon: <Activity aria-hidden /> },
  { id: "action:gate.open", he: "פתח-שער", desc: "פתיחת-שער-הערוץ הריבוני", en: "open gate channel", icon: <Coffee aria-hidden /> },
  { id: "action:sovereign.ask", he: "שאל-את-הריבונות", desc: "קול-הריבונות · שאילתה מדודה", en: "ask sovereign voice", icon: <Sparkles aria-hidden /> },
];

interface StreamEntry {
  path: string;
  he: string;
  en: string;
}

/* זרמי-אמת קנוניים — הנתיבים האמיתיים (lib/sovereign/channel.ts · engine.ts · routes). */
const STREAMS: StreamEntry[] = [
  { path: "/home/z/estate/Domain/dex/state.json", he: "מצב-הדקס", en: "dex state", },
  { path: "/home/z/estate/Domain/truth/latest.json", he: "שער-האמת", en: "truth latest", },
  { path: "/home/z/estate/Pulse/state/sovereign-channel/directives.jsonl", he: "הוראות-הבעלים", en: "directives", },
  { path: "/home/z/estate/Pulse/state/sovereign-channel/requests.jsonl", he: "פניות-הריבונות", en: "requests", },
  { path: "/home/z/estate/Pulse/state/sovereign-channel/notes.jsonl", he: "רישומי-הערוץ", en: "notes", },
  { path: "/home/z/estate/Pulse/state/sovereign-channel/voice.json", he: "קול-הריבונות", en: "voice", },
  { path: "/home/z/estate/FleetHQ/office/state/office-state.json", he: "מצב-המשרד", en: "office state", },
];

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function GiantPalette({ onNavigate }: { onNavigate: (viewId: string) => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  /* מאזין-גלובלי אחד — נרשם-בעצמו בהרכבה, מנוקה בפירוק. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* פתיחה-תוכנתית (כפתור "עוד" בנייד, פעולות-מעטפת): אירוע-חלון מותאם */
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("giant-palette:open", open);
    return () => window.removeEventListener("giant-palette:open", open);
  }, []);

  const run = useCallback(
    (id: string) => {
      setOpen(false);
      onNavigate(id);
    },
    [onNavigate]
  );

  const copyStream = useCallback(
    async (p: string) => {
      try {
        await navigator.clipboard.writeText(p);
        toast({
          title: "הנתיב הועתק",
          description: p,
        });
        setOpen(false);
      } catch {
        toast({
          variant: "destructive",
          title: "ההעתקה-נכשלה",
          description: "הדפדפן מנע גישה-ללוח (clipboard) — אין-העתקה-שקרית",
        });
      }
    },
    [toast]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="פלטת-הפקודה · GIANT"
      description={'חפשו מודול, פעולה או זרם-אמת (Ctrl+K · "/")'}
      className="border-white/10 bg-zinc-950 sm:max-w-xl"
    >
      <CommandInput placeholder="חפשו מודול · פעולה · זרם-אמת…" className="font-sans" />
      <CommandList>
        <CommandEmpty>אין-תוצאות — אין-להמציא</CommandEmpty>

        <CommandGroup heading="א׳ · מודולים">
          {MODULES.map((m) => (
            <CommandItem
              key={m.id}
              value={`${m.he} ${m.id} ${m.desc}`}
              keywords={[m.en, m.id]}
              onSelect={() => run(m.id)}
              className="gap-3 aria-selected:bg-amber-500/10 aria-selected:text-amber-200"
            >
              <span className="text-amber-500">{m.icon}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{m.he}</span>
                <span className="truncate text-xs text-zinc-500">{m.desc}</span>
              </span>
              <CommandShortcut className="font-mono text-[10px] tracking-normal" dir="ltr">
                {m.id}
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="ב׳ · פעולות">
          {ACTIONS.map((a) => (
            <CommandItem
              key={a.id}
              value={`${a.he} ${a.desc}`}
              keywords={[a.en, a.id]}
              onSelect={() => run(a.id)}
              className="gap-3 aria-selected:bg-amber-500/10 aria-selected:text-amber-200"
            >
              <span className="text-amber-500">{a.icon}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{a.he}</span>
                <span className="truncate text-xs text-zinc-500">{a.desc}</span>
              </span>
              <CommandShortcut className="font-mono text-[10px] tracking-normal" dir="ltr">
                {a.id}
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="ג׳ · זרמי-אמת (העתקת-נתיב)">
          {STREAMS.map((st) => (
            <CommandItem
              key={st.path}
              value={`${st.he} ${st.path}`}
              keywords={[st.en, "stream", "זרם"]}
              onSelect={() => void copyStream(st.path)}
              className="gap-3 aria-selected:bg-amber-500/10 aria-selected:text-amber-200"
            >
              <ClipboardCopy className="shrink-0 text-zinc-500" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{st.he}</span>
                <span className="truncate font-mono text-xs text-zinc-500" dir="ltr">
                  {st.path}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-white/10 px-3 py-2 text-[10px] text-zinc-600">
        GIANT · Ctrl+K מציג-מסתיר · ״/״ פותח · Esc סוגר · הנתיבים-מהקוד-השרת — אין-זיופים
      </div>
    </CommandDialog>
  );
}
