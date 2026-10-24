/* ═══ issue-forge · verify.ts — the real gate: bun test tests/ + bun run lint ═══
 * GREEN = tests exit 0 AND lint exit 0. The one honest exception: when `bun test
 * tests/` finds NO test files at all (vacuous — nothing to run), that is recorded
 * as a vacuous pass, never as fabricated green. Full output is captured for the
 * ledger and the PR proof.
 */
import { sh } from "./forge.ts";

export interface GatePart {
  exit: number;
  output: string;
  pass: boolean;
  vacuous?: boolean;
}

export interface GateResult {
  green: boolean;
  tests: GatePart;
  lint: GatePart;
}

/** pure classification of one `bun test` run — exported for the offline selftest */
export function interpretTestsResult(code: number, output: string): { pass: boolean; vacuous: boolean } {
  if (code === 0) return { pass: true, vacuous: false };
  const noMatch = /did not match any test files/.test(output);
  const failures = /\b\d+ fail\b/.test(output) || /error:/i.test(output);
  if (noMatch && !failures) return { pass: true, vacuous: true };
  return { pass: false, vacuous: false };
}

async function runTests(repoRoot: string): Promise<GatePart> {
  const r = await sh("bun", ["test", "tests/"], repoRoot, 240_000);
  const cls = interpretTestsResult(r.code, r.out);
  return { exit: r.code, output: r.out.slice(-6000), pass: cls.pass, vacuous: cls.vacuous };
}

async function runLint(repoRoot: string): Promise<GatePart> {
  const r = await sh("bun", ["run", "lint"], repoRoot, 420_000);
  return { exit: r.code, output: r.out.slice(-6000), pass: r.code === 0 };
}

export async function runGate(repoRoot: string): Promise<GateResult> {
  const tests = await runTests(repoRoot);
  const lint = await runLint(repoRoot);
  return { green: tests.pass && lint.pass, tests, lint };
}

export function gateProof(g: GateResult): string {
  const testLine = g.tests.vacuous
    ? `tests: VACUOUS-PASS (no test files under tests/ — honestly recorded) exit=${g.tests.exit}`
    : `tests: ${g.tests.pass ? "PASS" : "FAIL"} exit=${g.tests.exit}`;
  return [
    testLine,
    g.tests.output.split("\n").slice(-8).join("\n"),
    `lint: ${g.lint.pass ? "PASS" : "FAIL"} exit=${g.lint.exit}`,
    g.lint.output.split("\n").slice(-6).join("\n"),
  ].join("\n");
}
