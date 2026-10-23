/**
 * issues.ts — הנפקת חוזי-אג'נדה עם שרשרת-קבלות hash-linked (R365, v2).
 *
 * v2 (Thread 3, גל-התיאום):
 *  - קבלות נושאות payloadHash — תואם-ממשק לקבלות ה-dispatch-kernel של הקנון
 *    (src/lib/dispatch/receipts.ts: seq|ts|kind|payloadHash|prevHash) — שרשראות
 *    חוצות-תת-מערכות ניתנות לאימות-צליבה (§3 Immutable Audit Trail).
 *  - contractsFromEvidence: צבירת ראיות-נמדדות (מסורות-יד מ-lane אחר) לחוזים —
 *    שגיאות-tsc מקובצות לקובץ-אחד-לחוזה (תקרת-ראיות דטרמיניסטית), עבודה-זרוקה
 *    חוזה-לפריט. אפס-סוד: כל-הודעת-ראיה עוברת הסתרה (§7B).
 *
 * כל חוזה מקבל קבלה: hash = SHA-256(canonicalJson({seq, prevHash, payloadHash, contract-body})).
 * השרשרת append-only — פגיעה בכל-קבלה מוכחת באימות-מחדש.
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
import { EvidenceDoc, EvidenceItem } from "./tsc";

/** חומרה קנונית לכל סוג-ממצא */
export const KIND_SEVERITY: Record<FindingKind, Severity> = {
  "plaintext-secret": "critical",
  "placeholder-code": "high",
  "circular-import": "high",
  "stranded-work": "high",
  "silent-catch": "medium",
  "orphan-module": "medium",
  "type-debt": "medium",
  "tsc-error": "medium",
};

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

/** תקרת-ראיות לחוזה-מקובץ (קבועה-קנונית — דטרמיניזם) */
export const EVIDENCE_CAP = 12;

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

type ContractBody = Omit<IssueContract, "receipt">;

/** חולייה-אחת: גוף-חוזה → קבלה עם payloadHash (תואם-ממשק ל-kernel) */
function sealBody(prevHash: string | null, seq: number, body: ContractBody): Receipt {
  const payloadHash = sha256(canonicalJson(body));
  return {
    seq,
    prevHash,
    payloadHash,
    hash: sha256(canonicalJson({ seq, prevHash, payloadHash, contract: body })),
    algorithm: "sha256",
  };
}

/** מאמת שרשרת-קבלות מלאה; מחזיר את רשימת-ההפרות (ריקה = תקינה) */
export function verifyChain(contracts: IssueContract[]): string[] {
  const problems: string[] = [];
  let prev: string | null = null;
  contracts.forEach((c, i) => {
    const r = c.receipt;
    const body: ContractBody = { ...c, receipt: undefined };
    const payloadHash = sha256(canonicalJson(body));
    const expected = sha256(canonicalJson({ seq: i + 1, prevHash: prev, payloadHash, contract: body }));
    if (r.seq !== i + 1) problems.push(`${c.id}: seq mismatch (${r.seq} != ${i + 1})`);
    if (r.prevHash !== prev) problems.push(`${c.id}: prevHash mismatch`);
    if (r.payloadHash !== payloadHash) problems.push(`${c.id}: payloadHash mismatch`);
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
    const body: ContractBody = {
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
    const receipt = sealBody(prevHash, i + 1, body);
    prevHash = receipt.hash;
    contracts.push({ ...body, receipt });
  });
  return contracts;
}

// ─── v2: צבירת-ראיות (evidence → contracts) ─────────────────────────────────

/**
 * חוזים מראיות-נמדדות (schema meta-planner/evidence@1):
 *  - tsc-error: מקובצים לקובץ — חוזה-אחד-לקובץ עם תקרת-ראיות EVIDENCE_CAP;
 *  - stranded-work: חוזה-לפריט (כל-ענף-זרוק מועמד-חילוץ עצמאי);
 *  - כל-יתר הסוגים: חוזה-לפריט.
 * סדר-קנון: severity ← kind ← file ← line. הודעות מוסתרות תמיד (§7B).
 */
export function contractsFromEvidence(doc: EvidenceDoc): IssueContract[] {
  type Group = { kind: FindingKind; file: string; items: EvidenceItem[] };
  const perFile = new Map<string, Group>(); // ל-tsc-error
  const singles: Group[] = [];

  for (const it of doc.items) {
    const kind: FindingKind = it.kind ?? "tsc-error";
    if (kind === "tsc-error") {
      const g = perFile.get(it.file) ?? { kind, file: it.file, items: [] };
      g.items.push(it);
      perFile.set(it.file, g);
    } else {
      singles.push({ kind, file: it.file, items: [it] });
    }
  }

  const groups: Group[] = [
    ...[...perFile.values()].sort((a, b) => (a.file < b.file ? -1 : 1)),
    ...singles.sort(
      (a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0),
    ),
  ].sort(
    (a, b) => SEVERITY_RANK[KIND_SEVERITY[a.kind]] - SEVERITY_RANK[KIND_SEVERITY[b.kind]],
  );

  const contracts: IssueContract[] = [];
  let prevHash: string | null = null;
  groups.forEach((g, i) => {
    const shown = g.items.slice(0, EVIDENCE_CAP);
    const body: ContractBody = {
      id: `MP-${String(i + 1).padStart(4, "0")}`,
      kind: g.kind,
      severity: KIND_SEVERITY[g.kind],
      subsystem: subsystemOf(g.file),
      title:
        g.kind === "tsc-error"
          ? `${KIND_TITLE["tsc-error"]} — ${g.items.length} ב-${g.file}`
          : KIND_TITLE[g.kind],
      evidence: shown.map((it) => ({
        file: it.file,
        line: it.line,
        snippet: redactSnippet(it.message),
      })),
      invariant: KIND_INVARIANT[g.kind],
      proposedFix: KIND_FIX[g.kind],
    };
    const receipt = sealBody(prevHash, i + 1, body);
    prevHash = receipt.hash;
    contracts.push({ ...body, receipt });
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
      `- קבלה: seq=${c.receipt.seq} sha256=${c.receipt.hash} payload=${c.receipt.payloadHash.slice(0, 12)} prev=${c.receipt.prevHash ?? "null"}`,
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
    { schema: "meta-planner/issues@2", count: contracts.length, contracts },
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
