/**
 * receipts.ts — hash-chained append-only receipt ledger (prevHash + sha256).
 * Tamper-evident by construction; one flipped byte breaks verification.
 */
import { createHash } from "node:crypto";

export interface Receipt {
  seq: number;
  ts: string;
  kind: string;
  organ: string;
  verdict: string;
  detail?: string;
  prevHash: string;
  hash: string;
}

const GENESIS = "genesis";

function digest(r: Omit<Receipt, "hash">): string {
  const canonical = JSON.stringify({
    seq: r.seq, ts: r.ts, kind: r.kind, organ: r.organ,
    verdict: r.verdict, detail: r.detail ?? null, prevHash: r.prevHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export class ReceiptChain {
  private receipts: Receipt[] = [];

  append(r: { kind: string; organ: string; verdict: string; detail?: string; ts?: string }): Receipt {
    const prev = this.receipts[this.receipts.length - 1];
    const base = {
      seq: this.receipts.length + 1,
      ts: r.ts ?? new Date().toISOString(),
      kind: r.kind, organ: r.organ, verdict: r.verdict,
      detail: r.detail,
      prevHash: prev ? prev.hash : GENESIS,
    };
    const receipt: Receipt = { ...base, hash: digest(base) };
    this.receipts.push(receipt);
    return receipt;
  }

  all(): Receipt[] {
    return this.receipts.map((r) => ({ ...r }));
  }

  tail(n: number): Receipt[] {
    return this.all().slice(-n);
  }

  /** Adopt a persisted chain (append-only load; refuses tampered history). */
  adopt(receipts: Receipt[]): boolean {
    if (!verifyChain(receipts)) return false;
    this.receipts = receipts.map((r) => ({ ...r }));
    return true;
  }
}

export function verifyChain(receipts: Receipt[]): boolean {
  let prev = GENESIS;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (r.seq !== i + 1) return false;
    if (r.prevHash !== prev) return false;
    if (digest(r) !== r.hash) return false;
    prev = r.hash;
  }
  return true;
}
