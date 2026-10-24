/* ═══ issue-forge · auditors.ts — deterministic evidence producers ══════════════
 * Three auditors, all pure filesystem READERS — zero randomness, zero network,
 * zero writes:
 *  · todo-auditor    — TODO/FIXME/XXX/STUB markers in every .ts/.tsx under src/ (debt evidence;
 *                      findings are NEVER auto-fixed by deletion)
 *  · testgap-auditor — exported functions in src/lib (all .ts) with no referencing
 *                      test file under tests/ / *.test.ts / *selftest*
 *  · ledger-auditor  — READ-ONLY anomaly scan of the fleet-economy ledger
 *                      (malformed JSON lines, duplicate consecutive hashes).
 *                      This loop never writes to that ledger.
 */
import fs from "node:fs";
import path from "node:path";

import {
  FLEET_LEDGER_REL,
  Finding,
  findingHash,
  subsystemFor,
} from "./forge.ts";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  "state", ".turbo", ".vercel", "storage", "quarantine",
]);

export function walkFiles(
  root: string,
  opts: { exts: string[]; subdir?: string; nameMustContain?: string[] },
): string[] {
  const out: string[] = [];
  const base = opts.subdir ? path.join(root, opts.subdir) : root;
  const visit = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) visit(p);
        continue;
      }
      if (!e.isFile()) continue;
      if (opts.exts.length && !opts.exts.some((x) => e.name.endsWith(x))) continue;
      if (opts.nameMustContain?.length && !opts.nameMustContain.some((x) => e.name.includes(x))) continue;
      out.push(p);
    }
  };
  visit(base);
  return out.sort();
}

/* ── 1 · todo-auditor: markers = debt evidence ────────────────────────────── */
const MARKER_GLOBAL = /\b(?:TODO|FIXME|XXX|STUB)\b/g;
const MARKER_LINE = /\b(?:TODO|FIXME|XXX|STUB)\b/;

export function auditTodos(root: string): Finding[] {
  const files = walkFiles(root, { exts: [".ts", ".tsx"], subdir: "src" });
  const findings: Finding[] = [];
  for (const abs of files) {
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const matches = content.match(MARKER_GLOBAL);
    if (!matches || matches.length === 0) continue;
    const rel = path.relative(root, abs);
    const lines = content.split("\n");
    const samples: string[] = [];
    for (let i = 0; i < lines.length && samples.length < 3; i++) {
      if (MARKER_LINE.test(lines[i])) samples.push(`L${i + 1}:${lines[i].trim().slice(0, 110)}`);
    }
    findings.push({
      kind: "todo",
      subsystem: subsystemFor(rel),
      target: rel,
      count: matches.length,
      detail: `${matches.length} marker(s) in ${rel} — e.g. ${samples.join(" · ")}`,
      hash: findingHash("todo", rel),
    });
  }
  return findings.sort((a, b) => b.count - a.count);
}

/* ── 2 · testgap-auditor: exported functions without any referencing test ─── */
export function exportedFunctionNames(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of content.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b|\()/g)) {
    names.add(m[1]);
  }
  return [...names];
}

function testCorpus(root: string): string {
  const testFiles = [
    ...walkFiles(root, { exts: [], subdir: "tests" }),
    ...walkFiles(root, { exts: [".ts", ".tsx", ".mjs"], nameMustContain: [".test.", "selftest"] }),
  ];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const f of testFiles) {
    if (seen.has(f)) continue;
    seen.add(f);
    try {
      parts.push(fs.readFileSync(f, "utf8"));
    } catch {
      /* unreadable test file — skip honestly */
    }
  }
  return parts.join("\n");
}

export function auditTestGaps(root: string): Finding[] {
  const libFiles = walkFiles(root, { exts: [".ts"], subdir: path.join("src", "lib") });
  const corpus = testCorpus(root);
  const findings: Finding[] = [];
  for (const abs of libFiles) {
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const fns = exportedFunctionNames(content);
    if (fns.length === 0) continue;
    const untested = fns.filter((fn) => !corpus.includes(fn));
    if (untested.length === 0) continue;
    const rel = path.relative(root, abs);
    findings.push({
      kind: "testgap",
      subsystem: subsystemFor(rel),
      target: rel,
      count: untested.length,
      detail: `${untested.length}/${fns.length} exported function(s) with no referencing test file: ${untested.slice(0, 12).join(", ")}`,
      hash: findingHash("testgap", rel),
    });
  }
  return findings.sort((a, b) => b.count - a.count);
}

/** first untested exported function of one file — Mode A's preferred probe target */
export function firstUntestedFunction(root: string, relFile: string): string | null {
  let content: string;
  try {
    content = fs.readFileSync(path.join(root, relFile), "utf8");
  } catch {
    return null;
  }
  const corpus = testCorpus(root);
  for (const fn of exportedFunctionNames(content)) {
    if (!corpus.includes(fn)) return fn;
  }
  return null;
}

/* ── 3 · ledger-auditor: READ-ONLY anomaly scan of the fleet-economy ledger ─ */
export type LedgerAnomalyKind = "malformed-json" | "duplicate-consecutive-hash";

export interface LedgerAnomaly {
  line: number;
  problem: LedgerAnomalyKind;
  detail: string;
}

export function auditLedgerFile(
  ledgerPath: string,
): { findings: Finding[]; anomalies: LedgerAnomaly[]; lines: number } {
  const anomalies: LedgerAnomaly[] = [];
  let raw = "";
  try {
    raw = fs.readFileSync(ledgerPath, "utf8");
  } catch {
    return { findings: [], anomalies, lines: 0 }; // ledger absent — nothing measured here, honestly
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let prevHash: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    let obj: { h?: unknown } | null = null;
    try {
      obj = JSON.parse(lines[i]) as { h?: unknown };
    } catch {
      anomalies.push({ line: i + 1, problem: "malformed-json", detail: lines[i].slice(0, 80) });
      prevHash = null;
      continue;
    }
    const h = typeof obj?.h === "string" ? obj.h : null;
    if (h && prevHash && h === prevHash) {
      anomalies.push({ line: i + 1, problem: "duplicate-consecutive-hash", detail: `h=${h}` });
    }
    prevHash = h;
  }
  const findings: Finding[] =
    anomalies.length === 0
      ? []
      : [
          {
            kind: "ledger",
            subsystem: "ledger",
            target: FLEET_LEDGER_REL,
            count: anomalies.length,
            detail:
              anomalies
                .slice(0, 6)
                .map((a) => `L${a.line} ${a.problem} (${a.detail})`)
                .join(" · ") + (anomalies.length > 6 ? ` · +${anomalies.length - 6} more` : ""),
            hash: findingHash("ledger", FLEET_LEDGER_REL),
          },
        ];
  return { findings, anomalies, lines: lines.length };
}
