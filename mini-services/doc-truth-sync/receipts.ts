/* receipts.ts — SAOS-DOC-TRUTH/1 hash-chained receipts (fleet law: every state
 * change leaves a cryptographically verifiable trail).
 *
 * Laws (fail-closed, zero deps, node:crypto only):
 *  · hash binds an EXPLICIT field list {seq,iso,kind,payloadHash,prev} — never
 *    the whole object (optional fields must never silently enter the hash input;
 *    this is the canonical-JSON + explicit-fields law proven in the swap engine).
 *  · appendReceipt is immutable — the input chain is never mutated.
 *  · verifyChain recomputes every hash and walks the prev linkage; any seam
 *    fails closed with an honest reason. Empty chains are refused (nothing to
 *    verify is not a verification).
 */
import { createHash } from "node:crypto";

export const ZERO_HASH = "0".repeat(64);

export interface DocTruthReceipt {
  readonly seq: number;
  readonly iso: string;
  readonly kind: string;
  readonly payloadHash: string;
  readonly prev: string;
  readonly hash: string;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Deterministic canonical JSON: object keys sorted recursively, zero whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) as string;
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`);
  return `{${parts.join(",")}}`;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

export function isIsoZ(iso: string): boolean {
  return ISO_RE.test(iso) && !Number.isNaN(Date.parse(iso));
}

/** The ONLY hash input — an explicit field list, never the whole receipt object. */
function hashReceiptFields(fields: {
  seq: number;
  iso: string;
  kind: string;
  payloadHash: string;
  prev: string;
}): string {
  return sha256Hex(canonicalJson(fields));
}

export function genesisReceipt(iso: string, kind: string, payload: unknown): DocTruthReceipt {
  if (!isIsoZ(iso)) throw new Error(`receipts: genesis iso must be ISO-8601 Z format, got "${iso}"`);
  if (kind.length === 0) throw new Error("receipts: kind must be non-empty");
  const payloadHash = sha256Hex(canonicalJson(payload));
  const base = { seq: 1, iso, kind, payloadHash, prev: ZERO_HASH };
  return { ...base, hash: hashReceiptFields(base) };
}

/** Returns a NEW chain (immutable append). Throws if the previous chain is unverified. */
export function appendReceipt(
  chain: readonly DocTruthReceipt[],
  iso: string,
  kind: string,
  payload: unknown,
): DocTruthReceipt[] {
  const verdict = verifyChain(chain);
  if (!verdict.ok) throw new Error(`receipts: refusing to append to an unverified chain: ${verdict.reason}`);
  if (!isIsoZ(iso)) throw new Error(`receipts: append iso must be ISO-8601 Z format, got "${iso}"`);
  if (kind.length === 0) throw new Error("receipts: kind must be non-empty");
  const tail = chain[chain.length - 1];
  const payloadHash = sha256Hex(canonicalJson(payload));
  const base = { seq: tail.seq + 1, iso, kind, payloadHash, prev: tail.hash };
  return [...chain, { ...base, hash: hashReceiptFields(base) }];
}

export function verifyChain(chain: readonly DocTruthReceipt[]): { ok: boolean; reason?: string } {
  if (chain.length === 0) return { ok: false, reason: "empty-chain" };
  let prev: DocTruthReceipt | null = null;
  for (const r of chain) {
    if (!isIsoZ(r.iso)) return { ok: false, reason: `bad-iso:${r.seq}` };
    if (r.kind.length === 0) return { ok: false, reason: `bad-kind:${r.seq}` };
    if (!HEX64_RE.test(r.payloadHash)) return { ok: false, reason: `bad-payloadHash:${r.seq}` };
    if (!HEX64_RE.test(r.prev)) return { ok: false, reason: `bad-prev:${r.seq}` };
    if (!HEX64_RE.test(r.hash)) return { ok: false, reason: `bad-hash:${r.seq}` };
    if (prev === null) {
      if (r.seq !== 1) return { ok: false, reason: `genesis-seq:${r.seq}` };
      if (r.prev !== ZERO_HASH) return { ok: false, reason: `genesis-prev:${r.seq}` };
    } else {
      if (r.seq !== prev.seq + 1) return { ok: false, reason: `seq-break:${prev.seq}->${r.seq}` };
      if (r.prev !== prev.hash) return { ok: false, reason: `prev-break:${r.seq}` };
    }
    const expected = hashReceiptFields({ seq: r.seq, iso: r.iso, kind: r.kind, payloadHash: r.payloadHash, prev: r.prev });
    if (expected !== r.hash) return { ok: false, reason: `hash-mismatch:${r.seq}` };
    prev = r;
  }
  return { ok: true };
}
