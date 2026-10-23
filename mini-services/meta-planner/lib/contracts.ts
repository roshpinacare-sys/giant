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
  | "silent-catch";

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
};

export const KIND_TITLE: Record<FindingKind, string> = {
  "orphan-module": "מודול-יתום מחוץ לגרף-הייבוא הקנוני",
  "circular-import": "ייבוא-מעגלי בגרף-התלויות",
  "placeholder-code": "קוד-שלד (סמני-השהיה / מימוש-חסר) במערכת-הקנון",
  "plaintext-secret": "סוד בטקסט-גלוי בקוד-המקור",
  "silent-catch": "תפיסת-שגיאות שותקת (הפרת fail-closed)",
};
