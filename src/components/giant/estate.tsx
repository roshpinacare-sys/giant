"use client";

// giant · האחוזה — מפת-האמת של האחוזה כולה: מה-קיים, מה-תקין, מה-מאוחד, ולמה-קרה-מה-שקרה.
// זו-תשובת-המערכת-הקבועה להוראת-הבעלים: "תראה מה כל הסוכנים עשו — ותאחד לממשק אחד".

import { Building2, FileWarning, GitBranch, Landmark, Server, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface RepoRow {
  name: string;
  role: string;
  what: string;
  truth: string;
  status: "system" | "source" | "mirror" | "archive" | "infra";
}

const REPOS: RepoRow[] = [
  {
    name: "giant · המערכת הזאת",
    role: "הממשק המאוחד",
    what: "ערוץ-הריבון + לדג'ר-האמת + קורא-ארכיון + בורסת SAOS (אמת-בלבד) + שער-headcorner",
    truth: "כל-מספר-על-המסך נגזר-מהלדג'ר או-ממקור-חוץ-חי (Binance)",
    status: "system",
  },
  {
    name: "Console",
    role: "הקונסולה-הציבורית של SAOS",
    what: "12+ עמודי-HTML מעוצבים (wallet/deposits/giants/defi) + שרשרת-אימות אמיתית עם עדי-קישור (Steem/Z-Chain/Optimism/Base)",
    truth: "מקור-האמת של המטבע: אספקת SAOS 126,682 · תקרה 21,000,000 · מנט-100K",
    status: "source",
  },
  {
    name: "Domain",
    role: "מראת-Console",
    what: "שיקוף-של-Console + פעימות-worldbeat",
    truth: "לא-מוצר-נפרד — מראה. לא-יבנה-שום-דבר-חדש-שם",
    status: "mirror",
  },
  {
    name: "FleetHQ",
    role: "מטה-הצי",
    what: "המשרד: CI ירוק (#240), מנועי-החלטה, ספון-הצוות",
    truth: "תשתית-פנימית — לא-ממשק-משתמש",
    status: "infra",
  },
  {
    name: "saos-dex",
    role: "ארכיון-מנוע-הדקס-ההיסטורי",
    what: "LIQUIDITY_STRATEGY + dex-beat (3600-טיקים) + תיעוד-החלטות",
    truth: "הנפחים-שם היו מבוימים (sweep-fills) — הוחלף-במנוע-האמת-כאן",
    status: "archive",
  },
  {
    name: "roshpina",
    role: "מאגר-ידע SAOS",
    what: "תיק-תיעוד: תדריכים, תיק-המטבע, דוחות-יומיים",
    truth: "תיעוד בלבד",
    status: "archive",
  },
];

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
};

export function EstateView() {
  return (
    <div className="space-y-4">
      {/* פסק-הדין */}
      <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/60 to-[#0d1312] p-5">
        <div className="flex items-start gap-3">
          <Landmark className="mt-1 h-6 w-6 shrink-0 text-emerald-400" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-black text-white">האחדה — החלטה-מבוצעת (15.10.2026)</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">
              ממשק-אחד: <strong className="text-emerald-300">giant</strong>. שאר-הריפו-ים אינם-ממשקים —
              מקורות-אמת (Console), תשתית (FleetHQ), מראה (Domain) ותיעוד (saos-dex, roshpina).
              המטבע-האמיתי אחד: <strong className="text-emerald-300">SAOS</strong> — מנופק 126,682 מתוך
              תקרה 21,000,000, כפי-שרשום-בשרשרת-Console; הבריכה-SAOS/USDS-מוזנת-מהקופה-ברשומות-לדג'ר-גלויות.
              <span className="text-zinc-400"> אין-עוד-נפחים-מבוימים: הארנה-תיבנה-מעסקאות-אמת-של-הבעלים-והצי.</span>
            </p>
          </div>
        </div>
      </section>

      {/* מפת-הריפו-ים */}
      <section className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
          <GitBranch className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          האחוזה · 6 ריפו-ים — מה-כל-אחד באמת
        </h3>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {REPOS.map((r) => {
            const s = STATUS_STYLE[r.status];
            return (
              <div key={r.name} className="rounded-xl border border-white/5 bg-[#0b0f0e] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold text-white" dir="ltr">
                    {r.status === "system" ? (
                      <Building2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Server className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                    )}
                    {r.name}
                  </span>
                  <Badge className={s.cls}>{s.label}</Badge>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{r.what}</p>
                <p className="mt-1 text-[11px] text-emerald-400/80">אמת: {r.truth}</p>
              </div>
            );
          })}
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
