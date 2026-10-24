/**
 * swallow-guard-cli.ts — רץ-דק-ללולאת-המגן (כל-ההחלטות-בליבה-הנבדקת swallow-guard.ts).
 * ═════════════════════════════════════════════════════════════════════════════
 * stdin JSON:  { mode:"measure"|"receipt",
 *                tree?: Record<path,blobSha>,       // המדידה של ה-bash (origin/main)
 *                baseline?: Record<path,blobSha>,   // המאומץ-האחרון
 *                adopted?: Record<path,blobSha>,    // מקורות-שחזור
 *                payload?: unknown, at?: string, prevHash?: string|null }
 * stdout JSON: measure → {swallows, alerts, plan, errors}
 *              receipt → GuardReceipt
 * כלל-אמת: ה-bash אינו-מחליט-דבר — הוא-מודד, מזרים, ומבצע-את-התוכנית.
 */
import { readFileSync } from "node:fs";
import {
  detectSwallows,
  rescuePlan,
  guardReceipt,
  type Swallow,
  type ContentAlert,
  type RescueAction,
  type GuardReceipt,
} from "../src/lib/sovereign/swallow-guard";

interface Input {
  mode: "measure" | "receipt";
  tree?: Record<string, string>;
  baseline?: Record<string, string>;
  adopted?: Record<string, string>;
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

if (input.mode === "receipt") {
  if (typeof input.at !== "string" || input.at === "") fail("receipt-needs-at");
  const receipt: GuardReceipt = guardReceipt(
    input.prevHash ?? null,
    input.payload ?? null,
    input.at,
  );
  process.stdout.write(JSON.stringify(receipt) + "\n");
  process.exit(0);
}

if (input.mode === "measure") {
  if (!input.tree) fail("measure-needs-tree");
  const { swallows, alerts }: { swallows: readonly Swallow[]; alerts: readonly ContentAlert[] } = detectSwallows(
    input.tree,
    input.baseline,
  );
  let plan: readonly RescueAction[] = [];
  let planError: string | null = null;
  if (swallows.length > 0) {
    try {
      plan = rescuePlan(swallows, input.adopted ?? {});
    } catch (e) {
      planError = e instanceof Error ? e.message : String(e);
    }
  }
  process.stdout.write(
    JSON.stringify({ swallows, alerts, plan, planError }) + "\n",
  );
  process.exit(0);
}

fail("mode-must-be-measure-or-receipt");
