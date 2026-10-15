/**
 * integrity.ts — קנוניות-ושרשרת-שלמות של-ערוץ-הבעלים
 * ═════════════════════════════════════════════════════════════════════════
 * העתק-מדויק מ-saos-owner-channel/src/integrity.ts — אותו-חוזה, אותם-שורשים.
 * אפס-שינוי-שקט: כל-הודעה נושאת-root (sha256 קנוני); מצב-הערוץ נושא
 * channelRoot מעל-הכל. מי-שמשנה-הודעה-שפורסמה — נתפס-מיד-על-ידי-המאמת.
 */
import { createHash } from "node:crypto";

/** JSON קנוני (מפתחות-ממוינים רקורסיבית) — אותו-אובייקט = אותו-מחרוזת-לנצח */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(canonicalize(obj));
}

function canonicalize(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(canonicalize);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = canonicalize((obj as Record<string, unknown>)[k]);
    return out;
  }
  return obj;
}

export function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
