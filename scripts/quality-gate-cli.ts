/**
 * quality-gate-cli.ts — רץ-דק-ללולאת-המגן (§5 במחזור-החי). כל-ההחלטות
 * בליבה-הנבדקת quality-gate.ts — ה-bash מודד, מזרים, ומבצע.
 * ═════════════════════════════════════════════════════════════════════════════
 * stdin JSON — החוזה-הכפול (נתפס-חי 18:07Z: המגן-שלח-שטוח, ה-CLI-דרש-עוטף,
 * כל-מחזור-מת skip — §6 מתה-במים-החיים; מאז: שתי-הצורות-מניבות-את-אותו-דין):
 *   { mode:"scan", ...LandingChange-שטוח }                       → ScanDecision
 *   { mode:"scan", change: LandingChange }                       → ScanDecision
 *   { mode:"receipt", payload: unknown, at: string, prevHash }   → GuardReceipt
 * כלל-אמת: אין-המצאה — קלט-שגוי = יציאת-כשל-כנה (fail-closed), אף-חריגה-לא-בורחת.
 */
import { readFileSync } from "node:fs";
import {
  scanLanding,
  verdictReceipt,
  type LandingChange,
} from "../src/lib/sovereign/quality-gate";
import type { GuardReceipt } from "../src/lib/sovereign/swallow-guard";

interface Input {
  mode: "scan" | "receipt";
  change?: Partial<LandingChange>;
  pathsAdded?: unknown;
  pathsModified?: unknown;
  pathsDeleted?: unknown;
  addedLines?: unknown;
  payload?: unknown;
  at?: string;
  prevHash?: string | null;
}

/** הליבה-הטהורה-של-ה-CLI: מחרוזת-קלט → מחרוזת-פלט. אף-קריאה-ל-process, אפס-שעון. */
export function runGateCli(raw: string): string {
  let input: Input;
  try {
    input = JSON.parse(raw) as Input;
  } catch {
    return JSON.stringify({ fatal: "stdin-not-json" });
  }

  if (input.mode === "scan") {
    // חוזה-כפול: עוטף-מקונן (change) או-שטוח (שדות-הנחיתה-ישירות-על-השורש).
    // אף-שדה-שטוח-לא-הוגדר ⇒ אין-נחיתה-בכלל ⇒ fatal-כנה (לא-אובייקט-רפה-truthy).
    const hasFlat = input.pathsAdded !== undefined || input.pathsModified !== undefined || input.pathsDeleted !== undefined || input.addedLines !== undefined;
    const c = (input.change ?? (hasFlat ? {
      pathsAdded: input.pathsAdded,
      pathsModified: input.pathsModified,
      pathsDeleted: input.pathsDeleted,
      addedLines: input.addedLines,
    } : undefined)) as Partial<LandingChange> | undefined;
    if (!c || typeof c !== "object") return JSON.stringify({ fatal: "scan-needs-change" });
    if (!Array.isArray(c.pathsDeleted) || !Array.isArray(c.addedLines)) {
      return JSON.stringify({ fatal: "change-must-carry-pathsDeleted-and-addedLines" });
    }
    return JSON.stringify(
      scanLanding(c as LandingChange),
    );
  }

  if (input.mode === "receipt") {
    if (typeof input.at !== "string" || input.at === "") return JSON.stringify({ fatal: "receipt-needs-at" });
    const receipt: GuardReceipt = verdictReceipt(
      input.prevHash ?? null,
      input.payload ?? null,
      input.at,
    );
    return JSON.stringify(receipt);
  }

  return JSON.stringify({ fatal: "mode-must-be-scan-or-receipt" });
}

function main(): never {
  let raw: string;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    process.stdout.write(JSON.stringify({ fatal: "stdin-unreadable" }) + "\n");
    process.exit(1);
  }
  const out = runGateCli(raw);
  const fatal = out.includes('"fatal"');
  process.stdout.write(out + "\n");
  process.exit(fatal ? 1 : 0);
}

if (import.meta.main) main();
