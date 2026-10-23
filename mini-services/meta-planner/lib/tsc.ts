/**
 * tsc.ts — ingesting measured tsc evidence into the agenda (v2, Thread 3).
 *
 * The convergence-lane handed the planner measured evidence: "576 pre-existing
 * tsc errors in giant" (SWARM_STATE.md, wave 19.79). This module turns such
 * evidence — `tsc --noEmit --pretty false` output — into canonical evidence
 * documents the ingest pipeline can convert into IssueContracts.
 *
 * Determinism: the parser is a pure function — same text ⇒ same items, sorted.
 * §7B: messages can embed source lines; every downstream consumer re-redacts.
 * Zero dependencies.
 */

/** One measured tsc error. */
export interface TscError {
  file: string;
  line: number;
  col: number;
  code: string; // TS2345 etc.
  message: string;
}

/**
 * Canonical evidence document (schema meta-planner/evidence@1) — the handover
 * format between lanes: measured facts, no interpretation.
 */
export interface EvidenceDoc {
  schema: "meta-planner/evidence@1";
  /** who measured this and when-kind-of-context (no wall clock required) */
  source: string;
  items: EvidenceItem[];
}

export interface EvidenceItem {
  file: string;
  line: number;
  message: string;
  kind?: "tsc-error" | "stranded-work" | "type-debt";
  /** free-form provenance kept verbatim (already redacted by producer) */
  detail?: string;
}

// `src/lib/x.ts(12,34): error TS2345: Argument of type ...`
const TSC_LINE_RE =
  /^([^(]+)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

/** Parse `tsc --noEmit --pretty false` output. Malformed lines are skipped silently-by-design (they carry no measured error). */
export function parseTscOutput(text: string): TscError[] {
  const out: TscError[] = [];
  for (const line of text.split("\n")) {
    const m = TSC_LINE_RE.exec(line.trim());
    if (!m) continue;
    out.push({
      file: m[1].trim(),
      line: Number(m[2]),
      col: Number(m[3]),
      code: m[4],
      message: m[5].trim(),
    });
  }
  out.sort(
    (a, b) =>
      a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.col - b.col || (a.code < b.code ? -1 : 1),
  );
  return out;
}

/** Build a canonical evidence document from parsed tsc errors. */
export function evidenceFromTsc(errors: TscError[], source: string): EvidenceDoc {
  return {
    schema: "meta-planner/evidence@1",
    source,
    items: errors.map((e) => ({
      file: e.file,
      line: e.line,
      message: `${e.code}: ${e.message}`,
      kind: "tsc-error" as const,
    })),
  };
}
