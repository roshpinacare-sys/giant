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
    level: "amber",
    giants: [
      { name: "Binance", metric: "משתמשים", value: "300M+", source: "דוח 2025" },
      { name: "Coinbase", metric: "משתמשים", value: "~115M", source: "סטטיסטיקות 2026" },
    ],
    oursClaimed: "מערכת-חיה 24/7 עם מודולים-מאוחדים",
    oursMeasured: "מ-T74 יש-אימות-אמיתי-ריבוני (scrypt-מקומי · סשנים-בבסיס · אפס-תלות-חוץ) והצי נרשם-בעצמו בתור-הלקוח-הראשון (מסע-רישום→כניסה→פקודה→קבלה מאומת-דפדפן). עדיין: 0-אדם-חוץ. החשבונות הם-הצי-עצמו (dogfooding).",
    evidence: "src/lib/sovereign-auth.ts · /api/auth/* (register/login/logout/me) · prisma: User+Session · חשבונות-צי מאומתים-מול-registry.json",
    claimVerdict: "partial",
    priceToClose: "בוצע-חלקית (M2-לצי). לסגירה-מלאה: אדם-חוץ-ראשון = M6.",
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
    level: "amber",
    giants: [
      { name: "Binance", metric: "מסחר-שנתי", value: "$34T · מנוע-התאמה-ייעודי", source: "דוח 2025" },
      { name: "Uniswap", metric: "נזילות-חוץ", value: "TVL-חי מ-DefiLlama", source: "API חי" },
    ],
    oursClaimed: "מנוע-דקס חי · פקודות-פתוחות · ספר-הפקודות-החוץ (Kraken)",
    oursMeasured: "מ-T74 יש-ספר-פקודות-פנימי-אמיתי: חשבונות-הצי מציבים-פקודות-מגבלה ומתמלאים-מול-פקודות-מנוחה-אמיתיות-של-חשבונות-אחרים (price-time priority · מילויים-חלקיים · קבלות). מ-T75 המנוע-מחויב-קאסטודיה: נעילת-יתרה-בהצבה · התיישבות-שני-הצדדים-בעסקה-אטומית · פקודת-מנוחה-בלי-נעול אינה-בת-התאמה. מנוע-השרשרת-ממשיך-בספר-שלו. עדיין: אף-יד-חוץ לא מניחה-פקודה.",
    evidence: "Domain/dex/state.json (מנוע-השרשרת) · /api/giant/customer-orders (matching+נעילות-בעסקה-אטומית) · lib/giant/custody.ts (lockForOrder/releaseResidual) · giants.json — saosExternalBid.exists נמדד",
    claimVerdict: "partial",
    priceToClose: "הספר-הפנימי-בוצע (T74). לסגירה: חיבור-למנוע-השרשרת-ומשתתפי-חוץ = M4/M6.",
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
    oursMeasured: "מ-T75 יש-פנקס-קאסטודיה-פנימי-אמיתי לחשבונות-הצי: מאזני-אמת (cashMu/assetSat) · נעילות-לפקודות · התיישבות-מילויים · פנקס-תנועות-שסכומו-מתמטית = המאזן. כנות: זו-מסגרת-אימון (paper) — אפס-נכסי-לקוחות-אמיתיים, אפס-מפתחות-שרשרת-חוץ, אפס-ביטוח. מפתח-STEEM-חי בכספת נשאר-משמורת-עצמית-בלבד.",
    evidence: "prisma schema: User.cashMu/assetSat + LedgerEntry + TradeOrder.reserved* · lib/giant/custody.ts (GENESIS/LOCK/TRADE/UNLOCK) · STEEM_ACTIVE_WIF בכספת saos-dex (נמדד T66)",
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
    what: "אימות-ריבוני מלא (scrypt-מקומי · סשנים-בבסיס · קוקי-HttpOnly · אפס-תלות-חוץ) + נתוני-משתמש-פרטיים. הצי נרשם-בעצמו בתור-הלקוח-הראשון.",
    acceptance: "אדם-שני נרשם-בעצמו, נכנס, ורואה-נתונים-שרק-הוא-רואה · אין-דפים-מזויפים-אחרי-יציאה",
    effort: "בוצע-לצי 2026-10-15 (dogfooding) · אדם-חוץ = M6",
    moves: "משתמשים: red→amber",
    level: "amber",
  },
  {
    id: "M3",
    title: "פקודה אמיתית ראשונה",
    what: "בוצע-פנימית (T74+T75): ספר-פקודות-פנימי-ריבוני — משתמש-מציב-מהמסך, המנוע-הפנימי ממלא-מול-פקודות-מנוחה-אמיתיות (price-time · מילויים-חלקיים), קבלה-append-only-בבסיס; ומ-T75 גם-קאסטודיה-מלאה: נעילת-יתרה-בהצבה, התיישבות-שני-הצדדים-בעסקה-אחת, פנקס-תנועות, ביטול-עם-שחרור. חיבור-למנוע-השרשרת-עוד-לא.",
    acceptance: "פקודה-מהמסך → מילוי-מתועד → קבלה-בארנק-של-המשתמש · דחייה-מקבלת-סיבה-אמיתית · ביטול-משחרר-את-הנעול",
    effort: "בוצע-פנימית 2026-10-15 (T74-מילויים · T75-קאסטודיה) · חיבור-שרשרת = M4",
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
  headline: "מכונה אמיתית · מוצר בדרך — הצי-כבר-הלקוח",
  body:
    "מה-שקיים-ונמדד: מנוע-כלכלי-חי-על-תאום-ציבורי, שרשרת-עצמאית-שצומחת-בכל-דופק, שער-אמת-חיצוני-לאימות, אימות-ריבוני-מלא-עם-חשבונות-אמת (הצי-נרשם-בעצמו כלקוח-ראשון — T74), ספר-פקודות-פנימי-עם-מילויים-אמיתיים-בין-חשבונות (T74), ופנקס-קאסטודיה-פנימי-עם-נעילות-יתרה-התיישבות-ופנקס-תנועות (T75 — paper, כנה). דוקטרינת-כנות-שמודה-בעצמה. מה-שלא-קיים: אדם-חוץ, כסף-חוץ, ביקורת-חוץ, רישיון. מפת-האיחוד M1..M6 ממשיכה-מהצי-אל-העולם — וכל-צעד-בה מקבל-קריטריון-קבלה-מדיד.",
  redCount: 5,
  amberCount: 3,
  greenCount: 0,
};
