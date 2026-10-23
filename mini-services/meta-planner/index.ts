/**
 * index.ts — כניסת-CLI של meta-planner (R365).
 *
 * שימוש:
 *   bun index.ts [targetDir] [--ignore <name>…] [--out <dir>] [--fail-on <severity>]
 *
 * fail-closed: exit 1 אם קיים ממצא בחומרה ≥ --fail-on (ברירת-מחדל high).
 * אפס-סודות בפלט: ראיות-סוד מוסתרות תמיד (§7B).
 */

import { join, resolve } from "path";
import { scanTarget } from "./lib/scan";
import { buildContracts, verifyChain, writeReports } from "./lib/issues";
import { SEVERITY_RANK, Severity } from "./lib/contracts";

export interface CliResult {
  code: number;
  scanned: number;
  findings: number;
  contracts: number;
  outDir: string;
  summaryLine: string;
}

export function parseArgs(argv: string[]): {
  target: string;
  ignore: string[];
  out: string;
  failOn: Severity;
} {
  let target = ".";
  const ignore: string[] = [];
  let out = "state";
  let failOn: Severity = "high";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i + 1 < argv.length ? argv[++i] : undefined);
    if (a === "--ignore") {
      const v = next();
      if (v !== undefined) ignore.push(v);
    } else if (a === "--out") {
      const v = next();
      if (v !== undefined) out = v;
    } else if (a === "--fail-on") {
      const v = next();
      if (v !== undefined) failOn = v as Severity;
    } else if (!a.startsWith("--")) {
      target = a;
    }
  }
  return { target, ignore, out, failOn };
}

export function runCli(argv: string[], cwd: string): CliResult {
  const { target, ignore, out, failOn } = parseArgs(argv);
  const root = resolve(cwd, target);
  const outDir = resolve(cwd, out);

  const result = scanTarget(root, { ignore });
  const contracts = buildContracts(result.findings);
  const chainProblems = verifyChain(contracts);
  if (chainProblems.length > 0) {
    // שרשרת-פנימית שבורה = פגם-מנוע — fail-closed מיידי
    console.error("META-PLANNER-FAIL: receipt chain broken —", chainProblems.join("; "));
    return {
      code: 2,
      scanned: result.files.length,
      findings: result.findings.length,
      contracts: contracts.length,
      outDir,
      summaryLine: `META-PLANNER-FAIL: chain integrity (${chainProblems.length} breaks)`,
    };
  }
  const written = writeReports(outDir, contracts);
  void written;
  const breach = contracts.filter((c) => SEVERITY_RANK[c.severity] <= SEVERITY_RANK[failOn]);
  const code = breach.length > 0 ? 1 : 0;
  const summaryLine =
    `META-PLANNER: scanned=${result.files.length} findings=${result.findings.length} ` +
    `contracts=${contracts.length} failOn=${failOn} breach=${breach.length} out=${out}`;

  console.log(summaryLine);
  for (const c of contracts.slice(0, 20)) {
    console.log(`  ${c.id} [${c.severity}] ${c.kind} — ${c.evidence.map((e) => `${e.file}:${e.line}`).join(" ")}`);
  }
  if (contracts.length > 20) console.log(`  … +${contracts.length - 20} more (מלא ב-${join(out, "issues.md")})`);

  return { code, scanned: result.files.length, findings: result.findings.length, contracts: contracts.length, outDir, summaryLine };
}

// הרצה-ישירה בלבד כשזה נקודת-הכניסה הראשית (לא כמודול-מבחן)
if (import.meta.main) {
  const res = runCli(process.argv.slice(2), process.cwd());
  process.exit(res.code);
}
