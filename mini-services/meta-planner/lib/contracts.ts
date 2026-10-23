/**
 * contracts.ts — סכימת חוזי-האג'נדה של meta-planner (R365, Thread 3, צו-הנחיה 34).
 *
 * כל ממצא ארכיטקטוני מונפק כ-IssueContract מובנה שה-swarms יכולים לצרוך
 * (JSON/MD) — עם קבלה hash-linked (SHA-256, prevHash) לשרשרת-ביקורת
 * append-only בהתאם לחוזה §3 (אכשרות-קריפטוגרפית, Immutable Audit Trail).
 *
 * דטרמיניזם: אין חותמות-זמן בשדות-הזהות — אותו-קלט מניב אותם חוזים בדיוק.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingKind =
  | "orphan-module"
  | "circular-import"
  | "placeholder-code"
  | "plaintext-secret"
  | "silent-catch"
  | "type-debt"
  | "tsc-error"
  | "stranded-work";

export interface Evidence {
  /** נתיב יחסי-ממקור-הסריקה, מופרד ב-/ */
  file: string;
  /** שורה 1-based */
  line: number;
  /** קטע-קוד מקוצר (מוסתר אם מכיל סוד) */
  snippet: string;
}

export interface Receipt {
  seq: number;
  prevHash: string | null;
  /** SHA-256 of the contract body — kernel-interop (dispatch/receipts.ts chain family) */
  payloadHash: string;
  hash: string;
  algorithm: "sha256";
}

export interface IssueContract {
  /** MP-0001… בסדר-ממוין דטרמיניסטי */
  id: string;
  kind: FindingKind;
  severity: Severity;
  /** תת-מערכת = תיקיית-הבן-העליונה של ראשית-הראיות */
  subsystem: string;
  title: string;
  evidence: Evidence[];
  /** אינווריאנטה-קנונית שהופרה (מצוטטת מצו-ההנחיה) */
  invariant: string;
  /** תיקון מוצע — חסר-שבירה, ניתן-לביצוע ע"י instance אחר */
  proposedFix: string;
  receipt: Receipt;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const KIND_INVARIANT: Record<FindingKind, string> = {
  "orphan-module":
    "§7A Canonical Trunk — אין מודולים יתומים במערכת-המאוחדת; כל-יחידה קנונית נגישה מגרף-הייבוא.",
  "circular-import":
    "§7A Deterministic Dispatch — אין ייבוא-מעגלי; גרף-התלויות DAG וקובע-סדר-אתחול.",
  "placeholder-code":
    "§12 Zero Technical Debt — אפס-סמני-שלד, אפס-השהיה, אפס-return מדומה; כל-מימוש מלא-ומנוסה.",
  "plaintext-secret":
    "§7B Key Isolation — אפס-סודות בטקסט-גלוי; חומר-מפתח אך-ורק בכספת AES-256-GCM.",
  "silent-catch":
    "§3 Fail-Closed Execution — אף-שגיאה לא נבלעת בשקט; כל-תפוס מסלק/מדווח/נכשל-גלוי.",
  "type-debt":
    "§12 Zero Technical Debt — אף-דיכוי-טיפוסים (סמני ts-ignore / ts-expect-error / ts-nocheck בסימן-ה-@); האמת-הסטטית של הקנון נשארת מופעלת.",
  "tsc-error":
    "§12 Definition of Done — הגזע-הקנוני מתקמפל נקי; אף-שגיאת-tsc לא נשארת ב-giant.",
  "stranded-work":
    "§10 Coordination — עבודת-סוכן שנזרקה לא נעלמת: כל-ענף/PR שנסגרו מתמזגים, משוחזרים או מאורכבים עם-קבלה מפורשת.",
};

export const KIND_FIX: Record<FindingKind, string> = {
  "orphan-module":
    "חבר את המודול לנקודת-כניסה קנונית או העברו לארכיון-מנודה (Zip/Project-files) לפי חוזה-ההתכנסות.",
  "circular-import":
    "משוך את הטיפוסים/הקבועים המשותפים למודול-עזר תחתון וקטע את המעגל; הימנע מצדדי-אפקט בטעינה.",
  "placeholder-code":
    "ממש את ההתנהגות הנדרשת במלואה (עם מבחנים) או הסר את הקוד — אסור למסור שלד לקנון.",
  "plaintext-secret":
    "הסר את הסוד מהמאגר (סיבוב-מפתח חובה — הוא נחשף), הזרם דרך משתנה-סביבה/כספת AES-256-GCM.",
  "silent-catch":
    "החלף בטיפול-גלוי: rethrow מטופל, fail-closed מדווח, או רישום-ביקורת מובנה — אל תבלע-שקט.",
  "type-debt":
    "תקן את הטיפוס בשורש (הצר/מתג או מבנה-מתאים) והוסף מבחן; אם-הדיכוי-חוקי במקרה-קצה מוכח — החלף ב-cast מבחין-טיפוסים עם נימוק בשורה.",
  "tsc-error":
    "תקן את שגיאת-הטיפוס בשורש (AST/type-level) והרץ tsc --noEmit עד-אפס; אין-דיכוי, אין-הימנעות.",
  "stranded-work":
    "שחזר את הענף (הוא קיים ב-git), rebase על הקנון, הרץ את סוויטת-המבחנים במלואה, והנחת ב-main — או ארכב עם קבלה מפורשת שמסבירה מדוע העבודה נגנזת.",
};

export const KIND_TITLE: Record<FindingKind, string> = {
  "orphan-module": "מודול-יתום מחוץ לגרף-הייבוא הקנוני",
  "circular-import": "ייבוא-מעגלי בגרף-התלויות",
  "placeholder-code": "קוד-שלד (סמני-השהיה / מימוש-חסר) במערכת-הקנון",
  "plaintext-secret": "סוד בטקסט-גלוי בקוד-המקור",
  "silent-catch": "תפיסת-שגיאות שותקת (הפרת fail-closed)",
  "type-debt": "דיכוי-טיפוסים מפורש (סמני ts-ignore / ts-expect-error / ts-nocheck בסימן-ה-@)",
  "tsc-error": "שגיאת-קימפול tsc בגזע-הקנון (ראיה-מסורה מ-lane אחר / נמדדה-מקומית)",
  "stranded-work": "עבודת-סוכן שנסגרה בלי-מיזוג (PR סגור/ענף-מנותק) — מועמד-חילוץ",
};
