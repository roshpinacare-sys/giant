/**
 * index.ts — כניסת-CLI של meta-planner (R365, v2).
 *
 * שימוש:
 *   bun index.ts [targetDir] [--ignore <name>…] [--out <dir>] [--fail-on <severity>]
 *   bun index.ts ingest <evidence.json> [--out <dir>] [--fail-on <severity>]
 *
 * scan   — סריקה-סטטית דטרמיניסטית של מאגר (6 כללים) → חוזים.
 * ingest — צבירת ראיות-נמדדות (schema meta-planner/evidence@1 — מסירת-יד בין-lanes,
 *          למשל פלט `tsc --noEmit --pretty false` שעובד evidenceFromTsc) → חוזים.
 *
 * fail-closed: exit 1 אם קיים ממצא בחומרה ≥ --fail-on (ברירת-מחדל high);
 * exit 2 על קלט-פגום/שרשרת-שבורה. אפס-סודות בפלט (§7B).
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import { scanTarget } from "./lib/scan";
import { buildContracts, contractsFromEvidence, verifyChain, writeReports } from "./lib/issues";
import { SEVERITY_RANK, Severity } from "./lib/contracts";
import { EvidenceDoc } from "./lib/tsc";

export interface CliResult {
  code: number;
  scanned: number;
  findings: number;
  contracts: number;
  outDir: string;
  summaryLine: string;
}

export function parseArgs(argv: string[]): {
  mode: "scan" | "ingest";
  target: string;
  ignore: string[];
  out: string;
  failOn: Severity;
} {
  const rest = argv.length > 0 && (argv[0] === "scan" || argv[0] === "ingest") ? argv.slice(1) : argv;
  const mode: "scan" | "ingest" = argv.length > 0 && argv[0] === "ingest" ? "ingest" : "scan";
  let target = ".";
  const ignore: string[] = [];
  let out = "state";
  let failOn: Severity = "high";
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => (i + 1 < rest.length ? rest[++i] : undefined);
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
  return { mode, target, ignore, out, failOn };
}

/** fail-closed: מסמך-ראיות פגום = exit 2, לא שערושיים */
export function readEvidenceDoc(path: string): EvidenceDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`evidence unreadable: ${String(e).slice(0, 80)}`);
  }
  const d = parsed as Partial<EvidenceDoc>;
  if (!d || d.schema !== "meta-planner/evidence@1") {
    throw new Error(`evidence schema mismatch: expected meta-planner/evidence@1, got ${String(d?.schema)}`);
  }
  if (!Array.isArray(d.items)) throw new Error("evidence.items missing");
  for (const it of d.items) {
    if (typeof it?.file !== "string" || !Number.isInteger(it?.line) || typeof it?.message !== "string") {
      throw new Error("evidence.item malformed (file/line/message required)");
    }
  }
  return { schema: "meta-planner/evidence@1", source: String(d.source ?? "(unspecified)"), items: d.items };
}

function finish(
  contracts: ReturnType<typeof buildContracts>,
  scanned: number,
  findings: number,
  outDir: string,
  out: string,
  failOn: Severity,
): CliResult {
  const chainProblems = verifyChain(contracts);
  if (chainProblems.length > 0) {
    // שרשרת-פנימית שבורה = פגם-מנוע — fail-closed מיידי
    console.error("META-PLANNER-FAIL: receipt chain broken —", chainProblems.join("; "));
    return {
      code: 2,
      scanned,
      findings,
      contracts: contracts.length,
      outDir,
      summaryLine: `META-PLANNER-FAIL: chain integrity (${chainProblems.length} breaks)`,
    };
  }
  writeReports(outDir, contracts);
  const breach = contracts.filter((c) => SEVERITY_RANK[c.severity] <= SEVERITY_RANK[failOn]);
  const code = breach.length > 0 ? 1 : 0;
  const summaryLine =
    `META-PLANNER: scanned=${scanned} findings=${findings} ` +
    `contracts=${contracts.length} failOn=${failOn} breach=${breach.length} out=${out}`;

  console.log(summaryLine);
  for (const c of contracts.slice(0, 20)) {
    console.log(`  ${c.id} [${c.severity}] ${c.kind} — ${c.evidence.map((e) => `${e.file}:${e.line}`).join(" ")}`);
  }
  if (contracts.length > 20) console.log(`  … +${contracts.length - 20} more (מלא ב-${join(out, "issues.md")})`);

  return { code, scanned, findings, contracts: contracts.length, outDir, summaryLine };
}

export function runCli(argv: string[], cwd: string): CliResult {
  const { mode, target, ignore, out, failOn } = parseArgs(argv);
  const outDir = resolve(cwd, out);

  if (mode === "ingest") {
    const evidencePath = resolve(cwd, target);
    let doc: EvidenceDoc;
    try {
      doc = readEvidenceDoc(evidencePath);
    } catch (e) {
      console.error(`META-PLANNER-FAIL: ${String(e).slice(0, 160)}`);
      return {
        code: 2,
        scanned: 0,
        findings: 0,
        contracts: 0,
        outDir,
        summaryLine: `META-PLANNER-FAIL: evidence rejected (${target})`,
      };
    }
    const contracts = contractsFromEvidence(doc);
    const res = finish(contracts, doc.items.length, doc.items.length, outDir, out, failOn);
    console.log(`  source=${doc.source}`);
    return res;
  }

  const root = resolve(cwd, target);
  const result = scanTarget(root, { ignore });
  const contracts = buildContracts(result.findings);
  return finish(contracts, result.files.length, result.findings.length, outDir, out, failOn);
}

// הרצה-ישירה בלבד כשזה נקודת-הכניסה הראשית (לא כמודול-מבחן)
if (import.meta.main) {
  const res = runCli(process.argv.slice(2), process.cwd());
  process.exit(res.code);
}
