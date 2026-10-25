/**
 * receipts.ts — sha256 hash-chained work receipts for the issue-to-PR runner.
 *
 * Every state change the runner performs (select / fix / gate / land / abort)
 * lands on this chain. sig = sha256(prev.sig + canonical(payload)) — any
 * tampering with a historical field breaks every subsequent link (verify).
 *
 * Zero new dependencies: node:crypto sha256 only.
 */

import { createHash } from "node:crypto";

export interface WorkReceipt {
  at: string;
  item: string;
  action: "select" | "fix" | "gate" | "land" | "abort";
  proof: Record<string, unknown>;
  prev: string;
  sig: string;
}

export interface ReceiptPayload {
  at: string;
  item: string;
  action: WorkReceipt["action"];
  proof: Record<string, unknown>;
}

/** Deterministic JSON: sorted keys, stable separators. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export class ReceiptChain {
  private receipts: WorkReceipt[] = [];

  constructor(private genesis: string) {}

  /** Append a receipt; returns the stored (frozen-shape) receipt. */
  append(payload: ReceiptPayload): WorkReceipt {
    const prev = this.receipts.length === 0 ? this.genesis : this.receipts[this.receipts.length - 1].sig;
    const sig = sha256(prev + "\n" + canonicalJson(payload));
    const receipt: WorkReceipt = { ...payload, prev, sig };
    this.receipts.push(receipt);
    return receipt;
  }

  all(): WorkReceipt[] {
    return this.receipts;
  }

  /** Full-chain verification: every link must hash-derive from its prev. */
  verify(): { ok: boolean; count: number; brokenAt?: number } {
    let prev = this.genesis;
    for (let i = 0; i < this.receipts.length; i++) {
      const r = this.receipts[i];
      const expected = sha256(prev + "\n" + canonicalJson({ at: r.at, item: r.item, action: r.action, proof: r.proof }));
      if (r.prev !== prev || r.sig !== expected) {
        return { ok: false, count: this.receipts.length, brokenAt: i };
      }
      prev = r.sig;
    }
    return { ok: true, count: this.receipts.length };
  }
}
