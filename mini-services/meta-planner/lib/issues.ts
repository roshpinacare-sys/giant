/**
 * issues.ts — הנפקת חוזי-אג'נדה עם שרשרת-קבלות hash-linked (R365).
 *
 * כל חוזה מקבל קבלה: hash = SHA-256(canonicalJson({seq, prevHash, contract-body})).
 * השרשרת append-only — פגיעה בכל-קבלה מוכחת באימות-מחדש (§3 Immutable Audit Trail).
 */

import { createHash } from "crypto";
import { mkdirSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import {
  IssueContract,
  Receipt,
  SEVERITY_RANK,
  KIND_INVARIANT,
  KIND_FIX,
  KIND_TITLE,
  Severity,
  FindingKind,
} from "./contracts";
import { RawFinding, redactSnippet } from "./scan";

/** חומרה קנונית לכל סוג-ממצא */
export const KIND_SEVERITY: Record<FindingKind, Severity> = {
  "plaintext-secret": "critical",
  "placeholder-code": "high",
  "circular-import": "high",
  "silent-catch": "medium",
  "orphan-module": "medium",
};

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export function subsystemOf(file: string): string {
  const parts = file.split("/");
  return parts.length > 1 ? parts[0] : "(root)";
}

export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = walk(o[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** מאמת שרשרת-קבלות מלאה; מחזיר את רשימת-ההפרות (ריקה = תקינה) */
export function verifyChain(contracts: IssueContract[]): string[] {
  const problems: string[] = [];
  let prev: string | null = null;
  contracts.forEach((c, i) => {
    const r = c.receipt;
    const expected = sha256(canonicalJson({ seq: i + 1, prevHash: prev, contract: { ...c, receipt: undefined } }));
    if (r.seq !== i + 1) problems.push(`${c.id}: seq mismatch (${r.seq} != ${i + 1})`);
    if (r.prevHash !== prev) problems.push(`${c.id}: prevHash mismatch`);
    if (r.hash !== expected) problems.push(`${c.id}: hash mismatch`);
    prev = r.hash;
  });
  return problems;
}

export function buildContracts(findings: RawFinding[]): IssueContract[] {
  const sorted = [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[KIND_SEVERITY[a.kind]] - SEVERITY_RANK[KIND_SEVERITY[b.kind]] ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
      a.line - b.line,
  );

  const contracts: IssueContract[] = [];
  let prevHash: string | null = null;
  sorted.forEach((f, i) => {
    const base: Omit<IssueContract, "receipt"> = {
      id: `MP-${String(i + 1).padStart(4, "0")}`,
      kind: f.kind,
      severity: KIND_SEVERITY[f.kind],
      subsystem: subsystemOf(f.file),
      title: KIND_TITLE[f.kind],
      evidence: [
        {
          file: f.file,
          line: f.line,
          // הראיה עוברת הסתרה-כפולה — אפס-סוד בשום-חוזה
          snippet: f.kind === "plaintext-secret" ? redactSnippet(f.snippet) : f.snippet,
        },
      ],
      invariant: KIND_INVARIANT[f.kind],
      proposedFix: KIND_FIX[f.kind],
    };
    const receipt: Receipt = {
      seq: i + 1,
      prevHash,
      hash: sha256(canonicalJson({ seq: i + 1, prevHash, contract: base })),
      algorithm: "sha256",
    };
    prevHash = receipt.hash;
    contracts.push({ ...base, receipt });
  });
  return contracts;
}

export function renderMarkdown(contracts: IssueContract[]): string {
  const bySeverity = (s: Severity): IssueContract[] => contracts.filter((c) => c.severity === s);
  const lines: string[] = [
    "# meta-planner — חוזי-אג'נדה (Issue Contracts)",
    "",
    `סה"כ חוזים: ${contracts.length} · ` +
      SEVERITIES.map((s) => `${s}=${bySeverity(s).length}`).join(" · "),
    "",
    "| id | חומרה | סוג | תת-מערכת | ראיות |",
    "|---|---|---|---|---|",
  ];
  for (const c of contracts) {
    const ev = c.evidence.map((e) => `\`${e.file}:${e.line}\``).join(" ");
    lines.push(`| ${c.id} | ${c.severity} | ${c.kind} | ${c.subsystem} | ${ev} |`);
  }
  lines.push("", "---", "");
  for (const c of contracts) {
    lines.push(
      `## ${c.id} · ${c.severity} · ${c.kind}`,
      "",
      `**${c.title}**`,
      "",
      ...c.evidence.map((e) => `- ראיה: \`${e.file}:${e.line}\` — \`${e.snippet}\``),
      "",
      `- אינווריאנטה: ${c.invariant}`,
      `- תיקון-מוצע: ${c.proposedFix}`,
      `- קבלה: seq=${c.receipt.seq} sha256=${c.receipt.hash} prev=${c.receipt.prevHash ?? "null"}`,
      "",
    );
  }
  return lines.join("\n") + "\n";
}

/** כתיבה-אטומית (tmp+rename) של issues.json + issues.md */
export function writeReports(outDir: string, contracts: IssueContract[]): { json: string; md: string } {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "issues.json");
  const mdPath = join(outDir, "issues.md");
  const json = JSON.stringify(
    { schema: "meta-planner/issues@1", count: contracts.length, contracts },
    null,
    2,
  ) + "\n";
  const md = renderMarkdown(contracts);
  const tmpJson = jsonPath + ".tmp";
  const tmpMd = mdPath + ".tmp";
  writeFileSync(tmpJson, json);
  writeFileSync(tmpMd, md);
  renameSync(tmpJson, jsonPath);
  renameSync(tmpMd, mdPath);
  return { json, md };
}
