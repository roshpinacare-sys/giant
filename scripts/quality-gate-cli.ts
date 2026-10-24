/**
 * quality-gate-cli.ts — רץ-דק-ללולאת-המגן (§5 במחזור-החי). כל-ההחלטות
 * בליבה-הנבדקת quality-gate.ts — ה-bash מודד, מזרים, ומבצע.
 * ═════════════════════════════════════════════════════════════════════════════
 * stdin JSON:
 *   { mode:"scan",    change: LandingChange }                    → ScanDecision
 *   { mode:"receipt", payload: unknown, at: string, prevHash }    → GuardReceipt
 * כלל-אמת: אין-המצאה — קלט-שגוי = יציאת-כשל-כנה (fail-closed).
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
  change?: LandingChange;
  payload?: unknown;
  at?: string;
  prevHash?: string | null;
}

function fail(msg: string): never {
  process.stdout.write(JSON.stringify({ fatal: msg }) + "\n");
  process.exit(1);
}

let raw: string;
try {
  raw = readFileSync(0, "utf8");
} catch {
  fail("stdin-unreadable");
}
let input: Input;
try {
  input = JSON.parse(raw) as Input;
} catch {
  fail("stdin-not-json");
}

if (input.mode === "scan") {
  if (!input.change || typeof input.change !== "object") fail("scan-needs-change");
  if (!Array.isArray(input.change.pathsDeleted) || !Array.isArray(input.change.addedLines)) {
    fail("change-must-carry-pathsDeleted-and-addedLines");
  }
  process.stdout.write(
    JSON.stringify(scanLanding(input.change)) + "\n",
  );
  process.exit(0);
}

if (input.mode === "receipt") {
  if (typeof input.at !== "string" || input.at === "") fail("receipt-needs-at");
  const receipt: GuardReceipt = verdictReceipt(
    input.prevHash ?? null,
    input.payload ?? null,
    input.at,
  );
  process.stdout.write(JSON.stringify(receipt) + "\n");
  process.exit(0);
}

fail("mode-must-be-scan-or-receipt");
