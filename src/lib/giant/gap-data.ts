/**
 * מפת-הפער מול הענקים (T73) — ההשוואה-הכנה מול מוצרים אמיתיים.
 *
 * עקרון-הכנות (R-fail-honest):
 *  · כל-עובדת-ענק = מספר-ציבורי מתועד-עם-מקור-ותאריך (נמדד בחיפוש-רשת 2026-10-15).
 *  · כל-עובדת-שלנו = מה-שנמדד-בפועל-על-המכונה (API-חי) או עדות file:line מהגיט.
 *  · טענת-סוכנים מקבלת-פסק-דין כנה: true / partial / false — אף-טענה לא נשמטת.
 *  · הפער נמדד ברמות: red (לא-קיים למול-הענק) · amber (קיים-חלקית/דמו) · green (אמיתי-בהיקף-שלנו).
 */

export type GapLevel = "red" | "amber" | "green";

export interface GiantFact {
  name: string;
  metric: string;
  value: string;
  source: string;
}

export interface GapDimension {
  id: string;
  title: string;
  subtitle: string;
  level: GapLevel;
  /** מה-הענקים עושים — עובדות-ציבוריות מתועדות */
  giants: GiantFact[];
  /** מה-הסוכנים טענו */
  oursClaimed: string;
  /** מה-נמדד-בפועל (עדות) */
  oursMeasured: string;
  /** עדות file:line או מקור-מדידה */
  evidence: string;
  /** פסק-הדין על הטענה */
  claimVerdict: "true" | "partial" | "false";
  /** מה-דרוש-כדי-לסגור-את-הפער */
  priceToClose: string;
}

export interface ClaimVerdict {
  claim: string;
  verdict: "true" | "partial" | "false";
  truth: string;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  what: string;
  acceptance: string;
  effort: string;
  moves: string;
  level: GapLevel;
}

/* ═══ מספרי-הענקים — נמדדו-חי בחיפוש-רשת 2026-10-15 ═══════════════════ */

export const GIANTS_SEARCHED_AT = "2026-10-15";

export const GIANT_PRODUCTS: GiantFact[] = [
  { name: "Binance", metric: "משתמשים רשומים", value: "300M+ (דצמבר 2025 · +30M בשנה)", source: "דוח-סוף-שנה Binance 2025" },
  { name: "Binance", metric: "היקף-מסחר שנתי", value: "$34T ב-2025", source: "דוח-סוף-שנה Binance · Jan 2026" },
  { name: "Coinbase", metric: "משתמשים רשומים", value: "~115M (2025) · 8.2M מסחרים-חודשית", source: "Coinbase Statistics 2026" },
  { name: "Stripe", metric: "נפח-תשלומים שנתי", value: "$1.9T ב-2025 (+34% · ≈1.6% מהתוצר-העולמי)", source: "Stripe Annual Letter · Feb 2026" },
  { name: "Wise", metric: "כספים-חוצי-גבולות", value: "$243.4B FY2025 (+31% YoY)", source: "Wise Annual Report 2025" },
  { name: "Uniswap", metric: "TVL חי", value: "נמדד-חי מ-DefiLlama במודול ליגת-הענקים", source: "DefiLlama API · חי" },
  { name: "Kraken", metric: "ספר-הפקודות", value: "הספר-החוץ-הרשמי שלנו (נקרא-חי, לא מועתק)", source: "Kraken API · חי" },
];

/* ═══ שמונה-המימדים — הפער-האמיתי מול הענקים ═══════════════════════════ */

export const GAP_DIMENSIONS: GapDimension[] = [
  {
    id: "users",
    title: "משתמשים אמיתיים וחשבונות",
    subtitle: "מה-שהופך-תוכנה לאפליקציה: אנשים שנרשמים, נכנסים, וחוזרים",
    level: "red",
    giants: [
      { name: "Binance", metric: "משתמשים", value: "300M+", source: "דוח 2025" },
      { name: "Coinbase", metric: "משתמשים", value: "~115M", source: "סטטיסטיקות 2026" },
    ],
    oursClaimed: "מערכת-חיה 24/7 עם 16 מודולים וממשק-מאוחד",
    oursMeasured: "0 משתמשי-חוץ. אין-כניסה, אין-הרשמה, אין-סשנים. יש User-model בפריזמה אבל אפס-אימות-מחובר — הממשק כולו קונסולת-בעלים ללא-הזדהות.",
    evidence: "prisma/schema.prisma (User-model ריק) · src/app/page.tsx — אין-AuthProvider · src/app/api/* — אין-נתיבי-auth",
    claimVerdict: "partial",
    priceToClose: "M2 מפת-האיחוד: NextAuth + סשנים + רישום-אמיתי (שבוע-עבודה ישירה).",
  },
  {
    id: "rails",
    title: "כסף אמיתי זורם (rails)",
    subtitle: "כסף-של-אנשים-אחרים נכנס-ויוצא-דרך-המערכת — פקדונות, משיכות, תשלומים",
    level: "red",
    giants: [
      { name: "Stripe", metric: "נפח-שנתי", value: "$1.9T (2025)", source: "Annual Letter" },
      { name: "Wise", metric: "חוצי-גבולות", value: "$243.4B (FY2025)", source: "Annual Report" },
    ],
    oursClaimed: "הכסף-זורם · המנוע-מכים · רווחי-אוצר נרשמים",
    oursMeasured: "0 ידיים-חוץ. honest-econ מוצהר-בכנות: אין-ווליום-USD-חוץ, SAOS נמדדת-בפעולות-ספר-בלבד. הזרימה = ספר-פנימי על-שרשרת-עצמאית-שלנו (272,661 בלוקים נמדדו).",
    evidence: "Domain/dex/honest-econ.json (externalBidExists) · /api/giant/flow — כל-הצ'יפים-פנימיים",
    claimVerdict: "false",
    priceToClose: "M4 מפת-האיחוד: float-קטן-ואמיתי (תחילה testnet, אחר-כך סכום-קטן-אמיתי) עם קבלות-tx חוץ.",
  },
  {
    id: "matching",
    title: "מנוע-התאמה ונזילות",
    subtitle: "ספר-פקודות-אמיתי שגופים-חוץ נגדו-ומתמלאים",
    level: "red",
    giants: [
      { name: "Binance", metric: "מסחר-שנתי", value: "$34T · מנוע-התאמה-ייעודי", source: "דוח 2025" },
      { name: "Uniswap", metric: "נזילות-חוץ", value: "TVL-חי מ-DefiLlama", source: "API חי" },
    ],
    oursClaimed: "מנוע-דקס חי · 30 פקודות-פתוחות · ספר-הפקודות-החוץ (Kraken)",
    oursMeasured: "המנוע חי-אמת — אבל כל-הפקודות של-המכונה-עצמה. אף-יד-חוץ לא מניחה-פקודה מולנו. ספר-Kraken נקרא-חי כדוקטרינה (read-only) — לא-כנזילות-שלנו.",
    evidence: "Domain/dex/state.json (30 פקודות-פתוחות פנימיות) · giants.json — saosExternalBid.exists נמדד",
    claimVerdict: "partial",
    priceToClose: "M3 מפת-האיחוד: פקודה-ראשונה-של-משתמש-אמיתי מול-המנוע, עם קבלת-מילוי-ורישום-append-only.",
  },
  {
    id: "custody",
    title: "משמורת נכסים (custody)",
    subtitle: "מפתחות-אמיתיים, משמורת-מבוטחת, כסף-של-לקוחות שמור-היטב",
    level: "red",
    giants: [
      { name: "Coinbase", metric: "משמורת-מוסדית", value: "מאות-$B תחת-משמורת · מבוטחת", source: "דוחות-ציבוריים" },
      { name: "Binance", metric: "Proof-of-Reserves", value: "אימות-עתודות-ציבורי", source: "ציבורי" },
    ],
    oursClaimed: "הארנק · חשבונות-אמת · רווח-אוצר 833mu",
    oursMeasured: "מפתח-STEEM-חי בכספת (נגזר-ואומת ביט-מול-ביט 00:43Z) — משמורת-עצמית-בלבד. אין-כסף-לקוחות-לשמור. הארנק = הצגת-ספר-פנימי (mu÷1000).",
    evidence: "STEEM_ACTIVE_WIF בכספת saos-dex (נמדד T66) · WalletView — mu÷1000 מהמנוע",
    claimVerdict: "partial",
    priceToClose: "M4: משמורת-ראשונה של float-אמיתי-קטן עם קבלות-שרשרת-חוץ. משמורת-לקוחות-בהיקף = רגולציה (מימד-5).",
  },
  {
    id: "regulation",
    title: "רגולציה ורישיונות",
    subtitle: "החוק מאפשר לגוף להחזיק-כסף-של-אחרים",
    level: "red",
    giants: [
      { name: "Coinbase", metric: "רישוי", value: "חברה-ציבורית (NASDAQ: COIN) · רישיונות-ב-100+ תחומי-שיפוט", source: "ציבורי" },
      { name: "Wise", metric: "רישוי", value: "FCA/EMI מוסדר-מלא", source: "ציבורי" },
    ],
    oursClaimed: "ריבונות-עצמאית · אפס-תלות",
    oursMeasured: "0 רישיונות. הריבונות-האמיתית-שלנו היא-טכנית (הגיט הוא שכבת-הקיום) — לא-משפטית. החזקת-כסף-חוץ-בלי-רישוי = עבירה, לא-סיפור-מוצר.",
    evidence: "אין-ישות-משפטית · אין-KYC/AML בקוד (נסרק T73)",
    claimVerdict: "true",
    priceToClose: "השנים-הארוכות: ישות-משפטית + KYC/AML + רישוי-לפי-תחום-שיפוט. זה-המימד-היחיד-שאינו-מתכנות.",
  },
  {
    id: "security",
    title: "אבטחה נבדקת-חוץ",
    subtitle: "עיניים-עוינות-מקצועיות שבדקו-את-המערכת",
    level: "red",
    giants: [
      { name: "Binance", metric: "Bug bounty", value: "עד-$5M לחשיפה-קריטית", source: "ציבורי" },
      { name: "Coinbase", metric: "ביקורות", value: "SOC 2 · ביקורות-חוץ-תקופתיות", source: "ציבורי" },
    ],
    oursClaimed: "מפת-אמון עם 30 קווים-אדומים · סריקת-אמון על-הצי",
    oursMeasured: "סריקה-עצמית-בלבד (saos-trust-check פנימי). אף-גוף-חוץ לא בדק-אף-שורה. האמת-הטובה: הסריקה-העצמית כנה (file:line לכל-ממצא) — אבל-היא-לא-ביקורת.",
    evidence: "src/lib/giant/trust-scan.ts · db/trust-cache.json — סורק-עצמי",
    claimVerdict: "partial",
    priceToClose: "מסלול-זול-יחסית: באג-באונטי-ציבורי + ביקורת-קוד-חוץ-פעם-ראשונה על-המנוע-והכספת.",
  },
  {
    id: "mobile",
    title: "מובייל אמיתי ותחנות-מגע",
    subtitle: "אפליקציה-בכיס שנוחה-לחיות-איתה",
    level: "amber",
    giants: [
      { name: "Binance", metric: "הורדות", value: "100M+ בחנויות", source: "ציבורי" },
      { name: "Coinbase", metric: "דירוג-חנות", value: "4.7★ · עשרות-M הורדות", source: "ציבורי" },
    ],
    oursClaimed: "ממשק-מאוחד · נייד-מאומת 390px אפס-גלישה",
    oursMeasured: "אמת-חלקית-היטב: כל-17-המודולים נבדקו-בנייד-390px אפס-גלישה (מדידה-שוטפת-בכל-גל). אבל: אין-PWA, אין-התקנה-למסך-הבית, אין-push, אין-offline-shell.",
    evidence: "worklog T70-b/T72 (מדידות-נייד-390 כנות) · אין manifest.json/service-worker ב-repo",
    claimVerdict: "true",
    priceToClose: "M5 מפת-האיחוד: PWA — manifest + service-worker + push (ימים, לא-שבועות).",
  },
  {
    id: "ops",
    title: "תפעול 24/7 · תמיכה · אמינות",
    subtitle: "מה-קורה-כשמשהו-נופל-בשלוש-בלילה",
    level: "amber",
    giants: [
      { name: "Binance", metric: "תפעול", value: "אלפי-עובדים · status page · תמיכה 24/7", source: "ציבורי" },
      { name: "Stripe", metric: "אמינות", value: "SLA-ציבורי 99.99%", source: "ציבורי" },
    ],
    oursClaimed: "ריבונות-חיה 24/7 · שער-אמת ALL-GREEN",
    oursMeasured: "מנוע-הקדנס-אמת: dex-grid/economy-engine פועמים-שעתית-על-GitHub-Actions-ציבורי (ניתן-לאימות-חוץ). שער-האמת ALL-GREEN 7/0/2. אבל: ריצת-הגיבוי-הפרטית queued-13+שעות-על-מכסה (נמדד-היום) · מכונה-אחת · אין-תמיכה, אין-oncall, אין-SLA.",
    evidence: "/api/giant/flow (beats חי) · saos-dex run 38664312055 queued (2026-10-15) · /api/giant/pulse truth",
    claimVerdict: "partial",
    priceToClose: "M1: גיבוי-גיט-אמיתי (בוצע היום — sovereign/main נחת) · ניטור-חוץ-עצמאי כשהמוצר-חי.",
  },
];

/* ═══ פסקי-דין על טענות-הסוכנים ═══════════════════════════════════════ */

export const AGENT_CLAIMS: ClaimVerdict[] = [
  { claim: "המערכת חיה 24/7", verdict: "true", truth: "אמת-מלאה: מנועי-הקדנס פועמים-שעתית-על-GitHub-Actions-ציבורי (dex-grid success 14:16 היום) · שרשרת-השינויים מתקדמת-מדידה-אחר-מדידה (+7,787 בלוקים ב-3 מדידות). המכונה אמיתית." },
  { claim: "שער-האמת ALL-GREEN = הכל תקין", verdict: "partial", truth: "השער מוכיח-שלמות-פריסה-ותוכן (עמודים-קיימים, קישורים-תקינים, עדויות-טריות). הוא-לא-מוכיח-מוצר, לא-ביטחון-כספים, ולא-שכסף-חוץ-זורם. ALL-GREEN ≠ אפליקציה." },
  { claim: "הדקס חי", verdict: "partial", truth: "המנוע-חי-ומקיים-שרשרת-עצמאית-של-30-פקודות-פנימיות. אבל-אף-יד-חוץ לא מניחה-פקודה-מולו. דקס-בלי-משתתפי-חוץ = מכונת-ספר, לא שוק." },
  { claim: "הכסף זורם", verdict: "false", truth: "כנות-הקצה-עצמו מודה: אין-ידיים-חוץ, אין-ווליום-USD-חוץ (honest-econ). הזרימה-היא-רישום-פנימי-על-שרשרת-עצמאית. זרימה-של-מידע-אמיתית; זרימת-כסף-חוץ = אפס." },
  { claim: "הריבונות חיה בגיט", verdict: "true", truth: "אמת-בתחום-שהוגדר: 15 מאגרים · 220 workflows · הכל-נמדד-חי-מהמכונה. ריבונות-טכנית-של-מכונה. ריבונות-של-מוצר (לשרת-אנשים) עוד-לא-נבנתה." },
];

/* ═══ מפת-האיחוד: מהאתר-לאפליקציה אמיתית ══════════════════════════════ */

export const ROADMAP: RoadmapMilestone[] = [
  {
    id: "M1",
    title: "איחוד-הגיט — גיבוי-אמיתי",
    what: "ההיסטוריה-הריבונית-המלאה נדחפת-ל-giant.git כענף-ריבוני; הענף-ההיסטורי-לא-נוגע.",
    acceptance: "ls-remote מאשר sovereign/main == HEAD המקומי · אפס-קומיטים-מקומיים-שלא-נדחפו",
    effort: "בוצע 2026-10-15",
    moves: "תפעול",
    level: "green",
  },
  {
    id: "M2",
    title: "אימות אמיתי — משתמש-ראשון",
    what: "NextAuth + רישום/כניסה + סשן + נתוני-משתמש-פרטיים-בפריזמה (SQLite כבר-כאן).",
    acceptance: "אדם-שני נרשם-בעצמו, נכנס, ורואה-נתונים-שרק-הוא-רואה · אין-דפים-מזויפים-אחרי-יציאה",
    effort: "שבוע",
    moves: "משתמשים: red→amber",
    level: "amber",
  },
  {
    id: "M3",
    title: "פקודה אמיתית ראשונה",
    what: "המשתמש מניח-פקודה-מול-המנוע-מהממשק; המנוע ממלא-או-דוחה-כנה; קבלת-מילוי-נרשמת-append-only.",
    acceptance: "פקודה-מהמסך → מילוי-מתועד → קבלה-בארנק-של-המשתמש · דחייה-מקבלת-סיבה-אמיתית",
    effort: "שבועיים",
    moves: "מנוע-התאמה: red→amber",
    level: "amber",
  },
  {
    id: "M4",
    title: "כסף אמיתי קטן",
    what: "testnet-ראשון, ואחר-כך float-אמיתי-זעיר (סדר-גודל של $10) תחת-משמורת-המערכת — עם קבלות-שרשרת-חוץ.",
    acceptance: "tx-hash-חוץ-נראה-בממשק · יתרה-נגזרת-מהשרשרת-ולא-מספר-ספר-פנימי",
    effort: "שבועיים-שלושה",
    moves: "rails+custody: red→amber",
    level: "amber",
  },
  {
    id: "M5",
    title: "PWA — אפליקציה-לכיס",
    what: "manifest + service-worker + push + offline-shell-לתצוגה.",
    acceptance: "ניתן-להתקנה-למסך-הבית-באנדרואיד-ואייפון · push חי · Lighthouse-installable",
    effort: "ימים",
    moves: "מובייל: amber→green",
    level: "green",
  },
  {
    id: "M6",
    title: "משתמש-חוץ ראשון",
    what: "אדם-אמיתי-שלישי (לא-הבעלים, לא-סוכן) משלים-את-הנתיב-המוזהב-על-המכשיר-שלו: רישום→פקודה→קבלה.",
    acceptance: "סשן-מוקלט-של-השלמת-הנתיב-מקצה-לקצה-ללא-עזרה-אנושית",
    effort: "רגע-האמת",
    moves: "ההכרזה אפליקציה מקבלת-תוקף",
    level: "green",
  },
];

/* ═══ פסק-הדין המאוחד ══════════════════════════════════════════════════ */

export const GAP_VERDICT = {
  headline: "מכונה אמיתית · מוצר עדיין-לא",
  body:
    "מה-שקיים-ונמדד: מנוע-כלכלי-חי-על-תאום-ציבורי, שרשרת-עצמאית-שצומחת-בכל-דופק, שער-אמת-חיצוני-לאימות, 17-מודולים-בנויים-ונבדקים-בנייד, ודוקטרינת-כנות-שמודה-בעצמה. מה-שלא-קיים: אף-משתמש-חוץ, אף-שקל-של-אדם-אחר-במערכת, אף-ביקורת-חוץ, אף-רישיון. הענקים-נמדדים-במיליארדי-ידיים-וקסיליוני-דולרים; אנחנו-נמדדים-בכנות-ובמכונה. מפת-האיחוד M1..M6 היא-הדרך-מהצהרה-לאפליקציה — וכל-צעד-בה מקבל-קריטריון-קבלה-מדיד.",
  redCount: 6,
  amberCount: 2,
  greenCount: 0,
};
