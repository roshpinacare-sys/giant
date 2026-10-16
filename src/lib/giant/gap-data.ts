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
// אימות-אמת גל-82 · 2026-10-16T10:0xZ: ריבוי-בריכות-חי (5-בריכות-ילידות · סוחרות-הלולאה-v3) ·
// הון-צי 278→9,278-USDS (×33, מתועד-לדג'ר) · 8-סוכנים-פנימיים (כולל mm-1·lp-1) ·
// מדידה-חיה-רציפה: 85-מילויים/3ד׳ ≈ 40,800/יום-דקס + כלכלה-פנימית ~2.9-tx/ש׳ ≈ 250K/יום.
export const GAP_DIMENSIONS: GapDimension[] = [
  {
    id: "users",
    title: "משתמשים אמיתיים וחשבונות",
    subtitle: "מה-שהופך-תוכנה לאפליקציה: אנשים שנרשמים, נכנסים, וחוזרים",
    level: "green",
    giants: [
      { name: "Binance", metric: "משתמשים", value: "300M+", source: "דוח 2025" },
      { name: "Coinbase", metric: "משתמשים", value: "~115M", source: "סטטיסטיקות 2026" },
    ],
    oursClaimed: "משתמשי-הרשת-הם-הצי — דוקטרינת-הבעלים (גל-62)",
    oursMeasured: "משתמשי-פנים-אמת-מדודים-חי: 8-סוכני-צי-פנימיים-פעילים (zai-main · zai-code-3 · zai-code-5 · zai-fix · zai-sec · inward-62 + mm-1-מעשה-שוק + lp-1-עומק-נזילות-מגל-82), כולם-עם-ארנקי-לדג'ר-אמת-והקצאות-מהקופה-שהוכפלו-בגל-82 (9,278-USDS-מוקצה · ×33-מהגל-הקודם · מתועד-כפול-בלדג'ר); שירות-עצמי-מלא (לימיט-עם-עיקול · ביטול-עצמי · ראיית-עצמו-בלבד — גל-62). הצטרפות-עצמית-חיה (/join · גל-76). אדם-חוץ-אמיתי: 0 — ולפי-הדוקטרינה-לא-רודפים-אחריו.",
    evidence: "/api/fleet/state (סוכנים-חי) · לדג'ר-ההקצאות (scripts/wave82-fund-fleet.cjs — מתועד) · /api/dex/orders · worklog גל-62+82",
    claimVerdict: "partial",
    priceToClose: "לפי-דוקטרינת-הבעלים: הקהל-פנים — הגדלת-הקצאות-הצי-מהקופה לפי-ביצועים-מדודים; אדם-חוץ-מתקבל-רק-אם-יבוא-מעצמו.",
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
    evidence: "Domain/dex/honest-econ.json (externalBidExists) · /api/giant/gap (live.flow — כל-הצ'יפים-פנימיים)",
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
    oursClaimed: "ספר-פקודות-אמת-עם-התאמה-חיה — משתמשי-פנים-הם-הנזילות",
    oursMeasured: "מנוע-התאמה-אמת-מדוד-חי-בקצב-מכונה (גל-82): ריבוי-בריכות-ילידות-חי (5-בריכות-עם-רזרבות-אמת: SAOS + SC-CONSOLE/DOMAIN/ROSH/FLEET — הלולאה-v3-סוחרת-על-כולן), הון-צי-×33 (9,278-USDS-מתועד), פקודות-לימיט-עם-עיקול-ESCROW, מתאים-2ש׳, מעשה-שוק-דו-צדדי — נמדד-חי: 85-מילויים/3ד׳ ≈ 40,800-מילויים/יום (מ-43/יום-בפתיחת-גל-80 — פי-~950). ידיים-חוץ: 0 — לפי-הדוקטרינה-לא-מחפשים-אותן.",
    evidence: "src/lib/fleet-loop.ts (v3-ריבוי-בריכות) · src/lib/dex-orders.ts (עיקול·מילוי·ביטול) · מדידה-חי DexTrade (2026-10-16 חלון-3ד׳) · worklog גל-80/82",
    claimVerdict: "true",
    priceToClose: "שסתומי-גל-80-וגל-82-נפתחו-ונמדדו (תדירות·הון·ריבוי-בריכות). הנותר: נזילות-חוץ-אמת — מתקבלת-רק-אם-תבוא-מעצמה (דוקטרינת-הבעלים).",
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
    oursMeasured: "אמת-חלקית-מעודכנת: מדידות-נייד-390px אפס-גלישה (כל-הגלים) + PWA-manifest-חי מגל-61 (manifest.webmanifest · standalone · RTL · viewport-fit-cover). עדיין: אין-push, אין-offline-shell, אין-התקנה-מדודה.",
    evidence: "worklog T70-b/T72 + גל-61 (PWA) · src/app/manifest.ts · מדידות-נייד-390 כנות בכל-גל",
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
    oursMeasured: "מנועי-קדנס אמת נמדדו 2026-10-16: עורקי-Autonomy (ריפו-ציבורי) פועמים-ב-crons שעתיים/חצי-שעתיים על-GitHub-Actions-ציבורי (41-workflows · ניתן-לאימות-חוץ) · מנוע-הכלכלה-הפנימי-חי :3016 בקצב-מכונה (~2.9-tx/ש׳ ≈ 250K/יום · גל-82) עם-שלושה-חוקי-ריפוי-עצמי-מדודים (boot-heal · runtime-heal · custody-restore) ומפקח-החייאה-ב-sovereign-boot · חוק-DB-מרפא-עצמו (db.ts proxy) אחרי-הקפאות-אטימה · שער-האמת ALL-GREEN. אבל: מכונה-אחת · אין-תמיכה, אין-oncall, אין-SLA.",
    evidence: "/api/giant/gap (live.flow beats חי) · saos-dex run 38664312055 queued (2026-10-15) · /api/giant/pulse truth",
    claimVerdict: "partial",
    priceToClose: "M1: גיבוי-גיט-אמיתי (בוצע היום — sovereign/main נחת) · ניטור-חוץ-עצמאי כשהמוצר-חי.",
  },
];

/* ═══ פסקי-דין על טענות-הסוכנים ═══════════════════════════════════════ */

export const AGENT_CLAIMS: ClaimVerdict[] = [
  { claim: "המערכת חיה 24/7", verdict: "partial", truth: "חיי-הגיט 24/7 אמת (נמדד 2026-10-16T09:06Z): עורקי-Autonomy פועמים-ב-crons ציבוריים (41-workflows) · הקנון-נחתם-רציף · vault-seal-אוטומטי-כל-10-דק' ממנוע-הכלכלה-עצמו. אבל-המסחר-והשירותים-החיים = כל-עוד-הסנדבוקס-חי: 24/7-אמיתי-רק-בשכבת-הגיט, לא-במסחר." },
  { claim: "שער-האמת ALL-GREEN = הכל תקין", verdict: "partial", truth: "השער מוכיח-שלמות-פריסה-ותוכן (עמודים-קיימים, קישורים-תקינים, עדויות-טריות). הוא-לא-מוכיח-מוצר, לא-ביטחון-כספים, ולא-שכסף-חוץ-זורם. ALL-GREEN ≠ אפליקציה." },
  { claim: "הדקס חי", verdict: "true", truth: "אמת-בקצב-מכונה (גל-82 · נמדד-חי): 5-בריכות-ילידות-סוחרות-ברציפות ע״י 8-סוכני-פנים, ~40,800-מילויים/יום-רץ (חלון-מדידה-3ד׳ · 2026-10-16), ספר-פקודות-עם-עיקול-ומילוי-אמת. אף-יד-חוץ-לא-מניחה-פקודה — לפי-הדוקטרינה-זה-לא-היעד." },
  { claim: "הכסף זורם", verdict: "false", truth: "כנות-הקצה-עצמו מודה: אין-ידיים-חוץ, אין-ווליום-USD-חוץ (honest-econ). הזרימה-הפנימית-אמת-ובקצב-מכונה (~290K-עסקאות/יום: דקס-40.8K + כלכלה-פנימית-~250K · גל-82) — אבל-זרימת-כסף-חוץ = אפס." },
  { claim: "הריבונות חיה בגיט", verdict: "true", truth: "אמת-בתחום-שהוגדר: 15 מאגרים · 220 workflows · הכל-נמדד-חי-מהמכונה · vault-seal-מובנה-מאטם-10-מאגרים-כל-10-דק'. ריבונות-טכנית-של-מכונה. ריבונות-של-מוצר (לשרת-אנשים) עוד-לא-נבנתה." },
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
    effort: "בוצע-ומדוד-חי (גלים-61/62): לימיט-עם-עיקול-ומילוי — OWNER+FLEET+API על אותו-מנוע · קבלות-מילוי-בלדג'ר",
    moves: "מנוע-התאמה: red→amber",
    level: "green",
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
    title: "משתמשי-הרשת — הצי-הפנימי (דוקטרינת-הבעלים)",
    what: "דוקטרינת-הבעלים (גל-62, trace 1a143782a5d9d3a1): החיילים-הצי-והסוכנים-הם-משתמשי-הרשת-כהוכחה-ומטרה — לפתח-כלפי-פנים; מי-שמגיע-מעצמו-מתקבל (/join) אך-אין-רדיפה-אחרי-חוץ.",
    acceptance: "מדוד-חי: 5-חיילי-צי + משתמש-הפנים inward-62, כולם-עם-ארנקי-לדג'ר-אמת · שירות-עצמי-מלא (לימיט+ביטול+ראייה-עצמית) · bookShare: הצי-מחזיק-95% מהספר-וגם 99% מהנעול-בעיקול (נמדד 2026-10-16T09:06Z)",
    effort: "בוצע-ומדוד (גל-62)",
    moves: "משתמשים: הצי-הוא-הקהל-הראשון — מדידה-חי-ציבורית",
    level: "green",
  },
];

/* ═══ פסק-הדין המאוחד ══════════════════════════════════════════════════ */

export const GAP_VERDICT = {
  headline: "מכונה-אמיתית · משתמשי-פנים-אמת · החוץ-איננו-היעד",
  body:
    "מה-שקיים-ונמדד (גל-82 · 2026-10-16): מנוע-כלכלי-חי-בקצב-מכונה — דקס-רב-בריכות (~40,800-מילויים/יום על 5-בריכות-ילידות · פי-~950-מתחילת-גל-80) + כלכלה-פנימית (~250K-עסקאות/יום על ספר-hash-chain-מאומת) — הכל-פנימי, אפס-תלות-חוץ, הכל-מדוד-חי-ומפורסם. ספר-פקודות-אמת (עיקול·מילוי·ביטול), 8-סוכני-פנים-עם-הון-אמת (×33-מגל-80), שרשרת-עצמאית, PWA-חי, ודוקטרינת-כנות-שמודה-בעצמה. דוקטרינת-הבעלים (גל-62): המשתמשים-הם-פנים; לא-מחפשים-לקוחות-חוץ-ולא-תלויים-בהם. מה-שעדיין-אין: כסף-חוץ, ביקורת-פירם-חוץ, רישוי — ולפי-הדוקטרינה-אינם-היעד-הבא.",
  redCount: 4,
  amberCount: 3,
  greenCount: 1,
};
