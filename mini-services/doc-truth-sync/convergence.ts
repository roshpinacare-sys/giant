/* convergence.ts — legacy-archive isolation manifest (DECISIONS #42 & #43).
 *
 * The owner's law: ONE canonical trunk (roshpinacare-sys/giant). Legacy
 * duplicates are ISOLATED — declared ARCHIVED-LEGACY, never deleted, history
 * never rewritten. The manifest is the machine-checkable form of the
 * duplicates-audit freeze column: idempotent (same artifacts → same
 * manifestHash regardless of generation time) and tamper-evident.
 */
import { sha256Hex, canonicalJson, isIsoZ } from "./receipts.ts";

export interface LegacyArtifact {
  readonly key: string;
  readonly repo: string;
  readonly path?: string;
  readonly description: string;
  readonly supersededBy: string;
  readonly decisionRef: string;
}

export interface IsolationEntry {
  readonly key: string;
  readonly repo: string;
  readonly path: string | null;
  readonly description: string;
  readonly supersededBy: string;
  readonly decisionRef: string;
  readonly status: "ARCHIVED-LEGACY";
}

export interface IsolationManifest {
  readonly version: "SAOS-DOC-TRUTH-ISOLATION/1";
  readonly canonicalTrunk: string;
  readonly entries: readonly IsolationEntry[];
  readonly manifestHash: string;
}

const CANONICAL_TRUNK = "roshpinacare-sys/giant";
/** Exact authority refs this module can vouch for (DECISIONS #42/#43 + the
 * measured duplicates-audit). Anything else fails closed — no fabricated authority. */
const KNOWN_DECISION_REFS: ReadonlySet<string> = new Set([
  "DECISIONS #42 (R360)",
  "DECISIONS #43 (exec38/38-a)",
]);
const AUDIT_REF_RE = /^duplicates-audit-\d{4}-\d{2}-\d{2}$/;

export function buildIsolationManifest(
  artifacts: readonly LegacyArtifact[],
  generatedIso: string,
  canonicalTrunk: string = CANONICAL_TRUNK,
): IsolationManifest {
  if (!isIsoZ(generatedIso)) throw new Error(`convergence: generatedIso must be ISO-8601 Z, got "${generatedIso}"`);
  if (canonicalTrunk !== CANONICAL_TRUNK) {
    throw new Error(`convergence: canonicalTrunk law (DECISIONS #42/#43) requires "${CANONICAL_TRUNK}", got "${canonicalTrunk}"`);
  }
  const seen = new Set<string>();
  const entries: IsolationEntry[] = artifacts.map((a) => {
    if (a.key.length === 0) throw new Error("convergence: artifact key must be non-empty");
    if (seen.has(a.key)) throw new Error(`convergence: duplicate artifact key ${a.key}`);
    seen.add(a.key);
    if (!KNOWN_DECISION_REFS.has(a.decisionRef) && !AUDIT_REF_RE.test(a.decisionRef)) {
      throw new Error(`convergence: artifact ${a.key} has unknown decisionRef "${a.decisionRef}" — no fabricated authority`);
    }
    return {
      key: a.key,
      repo: a.repo,
      path: a.path ?? null,
      description: a.description,
      supersededBy: a.supersededBy,
      decisionRef: a.decisionRef,
      status: "ARCHIVED-LEGACY",
    };
  });
  // Idempotence law: generatedIso must NOT enter the hash input.
  const manifestHash = sha256Hex(canonicalJson({ version: "SAOS-DOC-TRUTH-ISOLATION/1", canonicalTrunk, entries }));
  return { version: "SAOS-DOC-TRUTH-ISOLATION/1", canonicalTrunk, entries, manifestHash };
}

export function verifyIsolationManifest(manifest: IsolationManifest): { ok: boolean; reason?: string } {
  if (manifest.version !== "SAOS-DOC-TRUTH-ISOLATION/1") return { ok: false, reason: "version" };
  if (manifest.canonicalTrunk !== CANONICAL_TRUNK) return { ok: false, reason: "canonicalTrunk" };
  const expected = sha256Hex(canonicalJson({ version: manifest.version, canonicalTrunk: manifest.canonicalTrunk, entries: manifest.entries }));
  if (expected !== manifest.manifestHash) return { ok: false, reason: "manifestHash-mismatch" };
  return { ok: true };
}
