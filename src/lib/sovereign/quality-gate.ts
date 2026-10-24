/**
 * quality-gate.ts — ליבת-שער-איכות-הנחיתה של giant (§5 MASTER DIRECTIVE · wave 19.85).
 * ═════════════════════════════════════════════════════════════════════════════
 * §5: NO MOCKS, NO STUBS, NO TODOS — אף-נחיתה-לא-עוברת עם הערות-מקום, גופים-
 * מדומים, או-חריגות-לא-מטופלות; 100% אימות-דטרמיניסטי — אין-מיזוג-בלי-ראיית-
 * סוויט-ירוקה. שער-זה הוא-חוק-הדין הטהור שאיבר-הארכיטקט (saos-architect-daemon,
 * סמכות-אחות לפי CAS) צורך-כספריה — האיבר-מבצע, החוק-שופט, ואין-ערבוב.
 *
 * חוקי-השער (בסדר-קבוע, כל-ההפרות-נאספות):
 *  KILL  — מחיקת-נתיב-קנוני (CANONICAL_SET החי, single-source-of-truth מהמגן)
 *          · הפרת-zero-slop בשורות-שנוספו · הוכחה-חסרה · הוכחה-נכשלה
 *  HOLD  — הוכחה-מעוותת (סוויט-שרץ-אפס-טסטים אינו-מוכח-דבר)
 *  MERGE — כל-החוקים-ירוקים
 *
 * פטורים-דטרמיניסטיים-מנועלים (חוק-הפטור-עצמו מנועל-במבחנים):
 *  - קבצי-נעילה/נבנה-אוטומטית/מצב-ריצה: חסיני-סריקה מלאה (bun.lock, dist,
 *    node_modules, state/ — תוכן-נוצר-מכונה, לא-כוונת-מפתח).
 *  - קבצי-מבחן: פטורים-מ-MOCK/STUB-בלבד (אוצר-מילים-לגיטימי-של-בדיקות);
 *    TODO/FIXME/not-implemented נאסרים-גם-שם.
 *
 * דטרמיניזם מלא: אפס-שעון-פנימי, אפס-RNG, אפס-רשת. אפס-תלויות-חוץ-מעבר
 * ל-node:crypto ול-CANONICAL_SET-החי-מ-swallow-guard (שפת-הקנון-האחת).
 * קבלות-דין-hash-linked — אותה-שפה של economy-signed-receipts, dispatch-
 * receipts ו-swallow-guard (מיובאת-משם — אפס-שכפול).
 */
import { guardReceipt, verifyReceiptChain, CANONICAL_SET } from "./swallow-guard";

/** דפוסי-הזבל — רשימה-מפורשת-קפואה, מנועלת-במבחנים. case-חוקי-מפורשים-לכל-דפוס. */
export const SLOP_PATTERNS: readonly { readonly id: string; readonly re: RegExp; readonly testExempt: boolean }[] =
  Object.freeze([
    { id: "TODO", re: /\bTODO\b/, testExempt: false },
    { id: "FIXME", re: /\bFIXME\b/, testExempt: false },
    { id: "XXX", re: /\bXXX\b/, testExempt: false },
    { id: "HACK", re: /\bHACK\b/, testExempt: false },
    { id: "PLACEHOLDER-COMMENT", re: /\/\/\s*placeholder\b|\/\*\s*placeholder\b/i, testExempt: false },
    { id: "STUB", re: /\bstub(?:bed)?\b/i, testExempt: true },
    { id: "MOCK-RETURN", re: /\bmock(?:ed)?\s+(?:return|implementation|response)\b/i, testExempt: true },
    { id: "NOT-IMPLEMENTED", re: /\bnot\s+implemented\b/i, testExempt: false },
    { id: "UNIMPLEMENTED", re: /\bunimplemented\b/i, testExempt: false },
    { id: "TO-BE-DONE", re: /\bto\s+be\s+(?:done|implemented|filled)\b/i, testExempt: false },
  ]);

/** חוק-הפטור-המבני: תוכן-נוצר-מכונה/נעילה/מצב-ריצה אינו-כוונת-מפתח — חסין-סריקה. */
export function isSlopExemptPath(path: string): boolean {
  return (
    /(?:^|\/)(?:bun\.lock|bun\.lockb|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(path) ||
    /(?:^|\/)(?:node_modules|dist|build|\.next|\.turbo|coverage)(?:\/|$)/.test(path) ||
    /^(?:state|db|\.git)\//.test(path) ||
    /(?:^|\/)(?:generated|\.min\.)(?:[./]|$)/.test(path)
  );
}

/** חוק-פטור-המבחנים: אוצר-מילים-של-בדיקות מותר-שם-בלבד (MOCK/STUB — לא-זבל-אחר). */
function isTestPath(path: string): boolean {
  return /\.test\.[jt]sx?$/.test(path) || /\.spec\.[jt]sx?$/.test(path) || /(?:^|\/)__(?:tests|mocks)__\//.test(path) || /(?:^|\/)harness\//.test(path);
}

export interface SlopViolation {
  readonly path: string;
  readonly line: number;
  readonly pattern: string;
  readonly excerpt: string;
}

/** סריקת-אפס-זבל: שורות-שנוספו-בלבד, כל-ההפרות-נאספות, אפס-שקרים-חיוביים-על-קוד-לגיטימי. */
export function zeroSlopScan(
  addedLines: readonly { readonly path: string; readonly lines: readonly string[] }[],
): readonly SlopViolation[] {
  const out: SlopViolation[] = [];
  for (const file of addedLines) {
    if (isSlopExemptPath(file.path)) continue;
    const testPath = isTestPath(file.path);
    file.lines.forEach((raw, i) => {
      for (const p of SLOP_PATTERNS) {
        if (testPath && p.testExempt) continue;
        if (p.re.test(raw)) {
          out.push({
            path: file.path,
            line: i + 1,
            pattern: p.id,
            excerpt: raw.trim().slice(0, 120),
          });
          break; // שורה-אחת = הפרה-אחת (הדפוס-הראשון-בסדר-הקבוע); השורות-הבאות-נשפטות-בפני-עצמן
        }
      }
    });
  }
  return Object.freeze(out);
}

export interface GreenProof {
  readonly suite: string;
  readonly passed: number;
  readonly failed: number;
}

export interface LandingChange {
  readonly pathsAdded: readonly string[];
  readonly pathsModified: readonly string[];
  readonly pathsDeleted: readonly string[];
  readonly addedLines: readonly { readonly path: string; readonly lines: readonly string[] }[];
  readonly greenProof: GreenProof | null;
}

export type LandingVerdict = "MERGE" | "HOLD" | "KILL";

export interface LandingDecision {
  readonly decision: LandingVerdict;
  readonly reasons: readonly string[];
  readonly slop: readonly SlopViolation[];
}

/** פס-הדין: כל-החוקים-בסדר-קבוע, כל-ההפרות-נאספות, fail-closed. טהור-וקפוא-בפלט. */
export function evaluateLanding(change: LandingChange): LandingDecision {
  const reasons: string[] = [];

  // חוק-הקנון: מחיקת-נתיב-קנוני = KILL מיידי-מוכח (המקור-היחיד: CANONICAL_SET-החי)
  const canonicalKills = change.pathsDeleted.filter((p) => CANONICAL_SET.includes(p));
  if (canonicalKills.length > 0) {
    reasons.push(`canonical-path-deletion: ${canonicalKills.join(", ")}`);
  }

  // חוק-אפס-הזבל (§5): כל-הפרה-בשורות-שנוספו = KILL
  const slop = zeroSlopScan(change.addedLines);
  if (slop.length > 0) {
    reasons.push(`zero-slop-violation: ${slop.length} violation(s) — ${slop.map((s) => `${s.path}:${s.line}[${s.pattern}]`).join(" · ")}`);
  }

  // חוק-ההוכחה (§5): אין-מיזוג-בלי-ראיית-סוויט-ירוקה
  const gp = change.greenProof;
  if (gp === null) {
    reasons.push("green-proof-missing: no test evidence attached (100% deterministic verification required)");
  } else if (!Number.isInteger(gp.passed) || !Number.isInteger(gp.failed) || gp.passed < 0 || gp.failed < 0) {
    reasons.push("green-proof-malformed: passed/failed must be non-negative integers");
  } else if (gp.failed > 0) {
    reasons.push(`green-proof-failed: suite '${gp.suite}' reports ${gp.failed} failing test(s)`);
  } else if (gp.passed === 0) {
    reasons.push(`green-proof-empty: suite '${gp.suite}' ran zero tests — proves nothing (fail-closed)`);
  }

  if (reasons.length > 0) {
    const kill = reasons.some((r) => !r.startsWith("green-proof-empty"));
    return Object.freeze({
      decision: kill ? "KILL" : "HOLD",
      reasons: Object.freeze(reasons),
      slop: Object.freeze(slop),
    });
  }
  return Object.freeze({
    decision: "MERGE",
    reasons: Object.freeze(["all-laws-green"]),
    slop: Object.freeze([]),
  });
}

/** פס-סריקת-הלולאה (§5 במחזור-החי): KILL על-זבל/מחיקה-קנונית בלבד — הסריקה
 *  אינה-טוענת-דבר-על-הוכחות (המיזוג-משופט-רק-ב-evaluateLanding המלא, ליד-הארכיטקט).
 *  טהור, דטרמיניסטי, קפוא-בפלט. */
export interface ScanDecision {
  readonly decision: "CLEAN" | "KILL";
  readonly reasons: readonly string[];
  readonly slop: readonly SlopViolation[];
}

export function scanLanding(change: LandingChange): ScanDecision {
  const reasons: string[] = [];
  const canonicalKills = change.pathsDeleted.filter((p) => CANONICAL_SET.includes(p));
  if (canonicalKills.length > 0) {
    reasons.push(`canonical-path-deletion: ${canonicalKills.join(", ")}`);
  }
  const slop = zeroSlopScan(change.addedLines);
  if (slop.length > 0) {
    reasons.push(`zero-slop-violation: ${slop.length} violation(s) — ${slop.map((s) => `${s.path}:${s.line}[${s.pattern}]`).join(" · ")}`);
  }
  if (reasons.length > 0) {
    return Object.freeze({ decision: "KILL" as const, reasons: Object.freeze(reasons), slop: Object.freeze(slop) });
  }
  return Object.freeze({ decision: "CLEAN" as const, reasons: Object.freeze([]), slop: Object.freeze([]) });
}

/** קבלת-דין — אותה-שפה-hash-linked של הלהקה (מיובאת-מהמגן, אפס-שכפול). */
export const verdictReceipt = guardReceipt;

/** אימות-שרשרת-קבלות — אותו-גלאי-זיוף-מדויק. */
export { verifyReceiptChain };
