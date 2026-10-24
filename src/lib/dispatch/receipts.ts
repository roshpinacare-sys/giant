// receipts.ts — immutable hash-linked audit receipts (Thread 1, wave 19.79, directive §3/§12.3).
//
// Every state mutation in the canonical trunk MUST produce a receipt; receipts form an
// append-only chain: each receipt's prevHash is its parent's hash; genesis links to
// GENESIS_PREV_HASH. verifyChain() is the fail-closed auditor: any seq gap, broken link,
// genesis violation, or recomputed-hash mismatch fails closed at the exact offending index.
//
// Deterministic: hashing covers (seq|ts|kind|payloadHash|prevHash) — no wall clock inside
// the kernel; callers own timestamps. Zero dependencies beyond node:crypto.
import { createHash } from "node:crypto";

export const GENESIS_PREV_HASH: string = "0".repeat(64);

export interface Receipt {
  readonly seq: number;
  readonly ts: string;
  readonly kind: string;
  readonly payloadHash: string;
  readonly prevHash: string;
  readonly hash: string;
}

export interface SealInput {
  readonly ts: string;
  readonly kind: string;
  readonly payloadHash: string;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function canonicalReceiptString(
  seq: number,
  ts: string,
  kind: string,
  payloadHash: string,
  prevHash: string,
): string {
  return `${seq}|${ts}|${kind}|${payloadHash}|${prevHash}`;
}

/**
 * Seal a new receipt onto the chain. `prev === null` mints a genesis receipt (seq 1,
 * prevHash = GENESIS_PREV_HASH). Throws on a malformed parent (fail-closed by default):
 * the parent's seq must be a positive integer, so a corrupt parent can never silently
 * extend the chain.
 */
export function sealReceipt(prev: Receipt | null, next: SealInput): Receipt {
  const seq = prev === null ? 1 : prev.seq + 1;
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`parent-seq-invalid: ${String(prev?.seq)}`);
  }
  const prevHash = prev === null ? GENESIS_PREV_HASH : prev.hash;
  const hash = sha256Hex(
    canonicalReceiptString(seq, next.ts, next.kind, next.payloadHash, prevHash),
  );
  return Object.freeze({
    seq,
    ts: next.ts,
    kind: next.kind,
    payloadHash: next.payloadHash,
    prevHash,
    hash,
  });
}

export interface ChainVerdict {
  readonly ok: boolean;
  readonly brokenAt?: number;
  readonly reason?: string;
}

/**
 * Fail-closed chain verification:
 *  1. seq continuity — receipts[i].seq === i + 1 (no gaps, no forks).
 *  2. genesis anchorage — first prevHash must equal GENESIS_PREV_HASH.
 *  3. link integrity — prevHash must equal the parent's hash.
 *  4. hash integrity — stored hash must equal the recomputed canonical hash.
 * The first violation fails closed at its exact index; a valid chain returns { ok: true }.
 */
export function verifyChain(receipts: readonly Receipt[]): ChainVerdict {
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;

    if (r.seq !== i + 1) {
      return Object.freeze({
        ok: false,
        brokenAt: i,
        reason: `seq-discontinuity: expected ${i + 1}, got ${String(r.seq)}`,
      });
    }
    if (i === 0 && r.prevHash !== GENESIS_PREV_HASH) {
      return Object.freeze({
        ok: false,
        brokenAt: 0,
        reason: "genesis-prev-hash-violation: first receipt does not anchor to genesis",
      });
    }
    if (i > 0 && r.prevHash !== receipts[i - 1]!.hash) {
      return Object.freeze({
        ok: false,
        brokenAt: i,
        reason: `prev-hash-link-broken: receipt ${i} does not link to its parent`,
      });
    }
    const recomputed = sha256Hex(
      canonicalReceiptString(r.seq, r.ts, r.kind, r.payloadHash, r.prevHash),
    );
    if (recomputed !== r.hash) {
      return Object.freeze({
        ok: false,
        brokenAt: i,
        reason: `receipt-hash-mismatch: recomputed ${recomputed.slice(0, 12)}… ≠ stored ${r.hash.slice(0, 12)}…`,
      });
    }
  }
  return Object.freeze({ ok: true });
}
