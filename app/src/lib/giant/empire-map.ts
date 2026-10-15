/**
 * empire-map.ts — מפת-החיבור הקנונית של האימפריה (גל-7 · "החיבור-המלא").
 *
 * מנדט-הבעלים: "יש לנו המון המון חומר אבל כלום לא מחובר — מחברים את הריבונות
 * להפעלה מלאה מכל תיקיות הגיט… שימוש בתוכן שאספנו בשיחה".
 *
 * כללי-האמת של המפה:
 *  · כל-שורה מגיעה מהתוכן-שנאסף-בשיחה (גלים 41–47): תיאורי-הגיט-המדודים
 *    (trust-cache · saos-trust-check@0.1.0) + מה שנמדד-חי על כל-גל.
 *  · מה שאין-לו-ראיה לחיבור — נכתב "ממתין-חיווט" או "ארכיון" בכנה.
 *    אסור להמציא חיבור. "לא מופה" הוא מצב-לגיטימי ומוצג.
 *  · המפה היא תוספת-ידע-על-המדידה החיה (fleet + trust-cache), לא תחליף לה.
 */

export type EmpireGroup =
  | "ליבה-מחוברת"
  | "תשתית-הפעלה"
  | "מוצרים-ריבוניים"
  | "ממתיני-חיווט"
  | "חזית-פומבית"
  | "ארכיון-ושחזור";

export interface EmpireRole {
  /** תפקיד-הספר במערכת (עברית, שורה-אחת) */
  role: string;
  /** קבוצת-החיבור */
  group: EmpireGroup;
  /** המודול-החי בממשק-המאוחד שהספר מזין (אם-קיים-ומדוד) */
  module:
    | "submission" | "machine" | "dex" | "league" | "channel" | "wallet" | "desk" | "ledger"
    | "products" | "pulse" | "office" | "estate" | "trust" | null;
  /** מקור-הראיה לחיבור (מדוד — גל/מדידה) */
  evidence: string;
}

/* ═══ המפה ═══ — מפתח = שם-הריפו (התאמה-לא-תלוית-רישיות) ═══════════════════ */
export const EMPIRE_MAP: Record<string, EmpireRole> = {
  /* ── ליבה-מחוברת: מזינים-ישירות את מודולי-הממשק-החי ── */
  giant: { role: "הממשק-המאוחד עצמו — הפלטפורמה-האחת שמציגה את כל-הצי", group: "ליבה-מחוברת", module: null, evidence: "המופע-החי · גלים 41–47" },
  Domain: { role: "עוגני-האמת של המשק: dex/state · giants · honest-econ · truth · מוצרים", group: "ליבה-מחוברת", module: "dex", evidence: "APIs חיים קוראים אותו · גלים 42–45" },
  FleetHQ: { role: "חדר-המערכות-החי: סוכנים · משימות · מצב-המשרד", group: "ליבה-מחוברת", module: "office", evidence: "/api/giant/office נמדד ALIVE · גל-44" },
  "saos-dex": { role: "מנוע-הבורסה-הריבונית: ספר-הזמנות דטרמיניסטי + AMM 30bps + ארנק-חיילים", group: "ליבה-מחוברת", module: "dex", evidence: "DexView מציג את משטח-הדקס · T55" },
  steem: { role: "שכבת-השרשרת-האמיתית: מלאי STEEM/SBD אמת · גריד מסחר real:true", group: "ליבה-מחוברת", module: "dex", evidence: "grid ARMED-LIVE נמדד · גל-42" },
  Console: { role: "קונסולת-ה-DEX: dex-beat שעתי · קבלות-ריצות-חיות", group: "ליבה-מחוברת", module: "ledger", evidence: "קבלות-ריצות נמדדו · T55/R363" },
  "saos-desk": { role: "שולחן-המסחר-הריבוני: קבינט-מרובה-סוכנים · ליבת-סיכון דטרמיניסטית (R338)", group: "ליבה-מחוברת", module: "desk", evidence: "DeskView · מופע-התאומים" },
  "saos-owner-channel": { role: "ערוץ-הבעלים-הישיר: פרוטוקול-גיט-ילידי · אינטגריות sha256", group: "ליבה-מחוברת", module: "channel", evidence: "ChannelView רץ על הפרוטוקול · גל-53/T56" },
  Pulse: { role: "איבר-הדופק של הרשת: מפקד-אוכלוסין אוטונומי כל-30 דק על Actions", group: "ליבה-מחוברת", module: "pulse", evidence: "PulseView · גל-44" },
  Autonomy: { role: "המוח-הריבוני על דקות-ציבור: עורקי-החלטה/למידה/צמיחה — רץ 24/7 בלי-סנדבוקס", group: "ליבה-מחוברת", module: "pulse", evidence: "דחיפות-דקה נמדדו · גל-44" },

  /* ── החוברו-בגל-9 (היו-ממתיני-חיווט): דלת-חיה-אחת — /api/giant/books → ההגשה ── */
  "saos-agents": { role: "ליבת-תזמון-סוכנים מדדה-עצמית: גרף-משימות שאי-אפשר-לשקר-לו · FLEET-COORDINATION/1", group: "ליבה-מחוברת", module: "submission", evidence: "/api/giant/books חי · CLAIMS.json נפרסר · פעיל-14.10 (גל-9)" },
  Defi: { role: "בית שכבת-ה-DeFi: דוקטרינה · MISSION-1000 · KPI-נמדד-יום-יום", group: "ליבה-מחוברת", module: "submission", evidence: "/api/giant/books חי · KPI.json נפרסר (גל-9)" },
  Adsmarket: { role: "ערכת-השיווק הרשמית של הרשת: ערוץ-ההפצה וכלל-הראיות", group: "ליבה-מחוברת", module: "submission", evidence: "/api/giant/books חי · 105 קבצים נמדדו (גל-9)" },
  "saos-markets": { role: "עצימות-הצי על הדקס: החלטת-הבעלים 14.10 — הצי עובד על ווליום-הדקס שלנו", group: "ליבה-מחוברת", module: "submission", evidence: "/api/giant/books חי · FLEET-DOCKING נמדד (גל-9)" },

  /* ── תשתית-הפעלה: ההנעה-העצמאית-מהגיט ── */
  "saos-runtime": { role: "מארח-הריצה-הריבוני: Actions-runner heartbeat · clone מנוע-הפרטי", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · trust-cache" },
  "sovereign-runner-kit": { role: "שכבת-הביצוע-במכשיר: המכשיר שלנו הוא המנוע, GitHub ספר-בלבד", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · חוק-שרדנות הבעלים" },
  GridWatch: { role: "בקרת-הצי: מודד בריאות כל-ריפו ו-workflow · מתקן-כשלים-אוטומטית", group: "תשתית-הפעלה", module: "trust", evidence: "תיאור-מדוד · trust-cache" },
  "ops-intake": { role: "צינור-הקליטה-התפעולי: מדידה · תור-עבודות מדודר · מפת-מרחב — כל-30 דק", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · trust-cache" },
  "ops-forge": { role: "סדנת-התפעול: כלי-עבודה ומסילות-הפעלה פנימיות", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · trust-cache" },
  "vault-home": { role: "כספת-המפתחות-החתומה של הצי (AES-256 · PBKDF2-200k) — מפתחות-לא-נוסעים-בקלות", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · trust-cache" },
  "sovereign-lighthouse": { role: "זיכרון-חוץ-מכונה-עצמאי (RTL) — שרדנות-אחרי-מוות-של-סביבה", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · חוק-הבעלים" },
  "sovereign-beacon": { role: "מגדלור-ריבוני: קונסולה-חוץ-מכונה", group: "תשתית-הפעלה", module: null, evidence: "תיאור-מדוד · גל-43" },

  /* ── מוצרים-ריבוניים: תוצרת-עומדת-בפני-עצמה ── */
  roshpina: { role: "פלטפורמת-אמון-וערך: מנוע-עמלים + ארביטרז-עלויות + הגנות", group: "מוצרים-ריבוניים", module: "products", evidence: "קטלוג-המוצרים החי · גל-42" },
  Saosmartwallet: { role: "ארנק-ריבוני: כספת AES-256+Shamir · חתימת-אמת STEEM/BLURT/ETH/SOL", group: "מוצרים-ריבוניים", module: "products", evidence: "קטלוג-המוצרים החי · תיאור-מדוד" },
  "saos-control-center": { role: "מרכז-בקרה: כניסת-WIF-עם-אימות-שרשרת-חי · כספת AES-256-GCM", group: "מוצרים-ריבוניים", module: "products", evidence: "סריקה-מדודה · גל-45" },
  "saos-sovereign-foundry": { role: "עיגון-חוצה-רשתות · ריבונות-אנרגיה · כלכלת-ראיות", group: "מוצרים-ריבוניים", module: "products", evidence: "תיאור-מדוד · trust-cache" },
  "saos-sovereign-platform": { role: "\"הפרויקט-הנבחר\": העותק-הקנוני-העומד-בפני-עצמו של פלטפורמת-העיגון", group: "מוצרים-ריבוניים", module: "products", evidence: "תיאור-מדוד · trust-cache" },
  "saos-jummper": { role: "נוטריון-הוכחות-חוצה-שרשרת: עיגון-טענות על ETH-mainnet ב-~$0.10 עם-עד-חתימה", group: "מוצרים-ריבוניים", module: "products", evidence: "תיאור-מדוד · trust-cache" },
  TruthRail: { role: "שכבת-אימות-חסרת-מפתח לצי: ZERO-rail (gas 0x0) אימות-חי", group: "מוצרים-ריבוניים", module: "trust", evidence: "תיאור-מדוד · trust-cache" },
  negen: { role: "כלי-נגינה לניגון-סט (Web Audio, קובץ-יחיד)", group: "מוצרים-ריבוניים", module: "products", evidence: "תיאור-מדוד · trust-cache" },

  /* ── ממתיני-חיווט: ריק-מגל-9 — כל-ארבעת-הממתינים חוברו-חי להגשה (למעלה) ── */

  /* ── חזית-פומבית ── */
  "roshpinacare-sys.github.io": { role: "דלת-הרשת-הפומבית: אינדקס-חי של האתרים ובריאות-הצי — כל-מספר-נמדד", group: "חזית-פומבית", module: null, evidence: "תיאור-מדוד · גל-43 (חזית-ציבורית)" },

  /* ── ארכיון-ושחזור: זיכרון-ארוך, לא-שער-חי ── */
  Zip: { role: "ארכיון-עבודה היסטורי 136MB", group: "ארכיון-ושחזור", module: null, evidence: "מועמד-פינוי (מדוד) · מראה-אחת + vault-home" },
  "Project-files": { role: "ארכיון-ZIP היסטורי ללא-קוד", group: "ארכיון-ושחזור", module: null, evidence: "מועמד-פינוי (מדוד) · נגיש-ב-vault-home" },
  Sdk: { role: "תמצית-SDK משוחזרת מבסיס anchor-5356dab", group: "ארכיון-ושחזור", module: null, evidence: "מועמד-מיזוג ל-anchor-baseline (מדוד)" },
  "anchor-baseline": { role: "שחזור-בסיס-העיגון האחרון (commit 5356dab)", group: "ארכיון-ושחזור", module: null, evidence: "תיאור-מדוד · trust-cache" },
  Sandbox: { role: "מראת-הענן-החיה של סביבת-הפיתוח (המופע-הזה עצמו)", group: "ארכיון-ושחזור", module: null, evidence: "תיאור-מדוד · גל-45" },
  SovereignConsole: { role: "הקונסולה-הריבונית-החיה: מראת-ענן-מלאה לשחזור-אוטונומי", group: "ארכיון-ושחזור", module: null, evidence: "תיאור-מדוד · trust-cache" },
  "sandbox-private": { role: "מראה-פרטית של סביבת-העבודה", group: "ארכיון-ושחזור", module: null, evidence: "תיאור-מדוד · trust-cache" },
};

/* sanbox (HTTP 409 — לא נסרק כנה, גל-45) מוצג-דרך-המדידה-החיה; אם-הוא-לא-בפליט-הצי
 * הוא פשוט לא-מופיע — ואילו-ריפו-שלא-מופה בכלל מקבלים "לא מופה" כנה ב-View. */

export const EMPIRE_GROUPS: EmpireGroup[] = [
  "ליבה-מחוברת",
  "תשתית-הפעלה",
  "מוצרים-ריבוניים",
  "ממתיני-חיווט",
  "חזית-פומבית",
  "ארכיון-ושחזור",
];

export const GROUP_COLORS: Record<EmpireGroup | "לא-מופה", string> = {
  "ליבה-מחוברת": "text-amber-400 border-amber-500/30 bg-amber-500/5",
  "תשתית-הפעלה": "text-emerald-400 border-emerald-500/25 bg-emerald-500/5",
  "מוצרים-ריבוניים": "text-fuchsia-400 border-fuchsia-500/25 bg-fuchsia-500/5",
  "ממתיני-חיווט": "text-orange-400 border-orange-500/25 bg-orange-500/5",
  "חזית-פומבית": "text-teal-400 border-teal-500/25 bg-teal-500/5",
  "ארכיון-ושחזור": "text-zinc-400 border-zinc-600/40 bg-zinc-500/5",
  "לא-מופה": "text-red-400 border-red-500/25 bg-red-500/5",
};

export function empireRoleFor(name: string): EmpireRole | null {
  return EMPIRE_MAP[name] ?? EMPIRE_MAP[name.toLowerCase()] ?? null;
}
