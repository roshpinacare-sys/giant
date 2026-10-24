// receipts.test.ts — fail-closed hash-linked receipt chain (directive §3, §12.3).
// Immutable audit trail: every state mutation produces a hash-linked receipt; a broken
// link, gap, or tampered hash MUST fail closed. Offline + deterministic (fixed timestamps).
/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import {
  GENESIS_PREV_HASH,
  sealReceipt,
  sha256Hex,
  verifyChain,
  type Receipt,
} from "./receipts";

const T0 = "2026-10-23T15:00:00.000Z";

function buildChain(n: number, tsStart = T0): Receipt[] {
  let prev: Receipt | null = null;
  const out: Receipt[] = [];
  for (let i = 1; i <= n; i++) {
    prev = sealReceipt(prev, {
      ts: new Date(Date.parse(tsStart) + i * 1000).toISOString(),
      kind: "state-mutation",
      payloadHash: sha256Hex(`payload-${i}`),
    });
    out.push(prev);
  }
  return out;
}

describe("sha256Hex — deterministic primitive", () => {
  test("known vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("sealReceipt — canonical construction", () => {
  test("genesis receipt: seq 1, prevHash = GENESIS_PREV_HASH", () => {
    const r = sealReceipt(null, { ts: T0, kind: "boot", payloadHash: "aa" });
    expect(r.seq).toBe(1);
    expect(r.prevHash).toBe(GENESIS_PREV_HASH);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("child receipt links to parent hash and increments seq", () => {
    const g = sealReceipt(null, { ts: T0, kind: "boot", payloadHash: "aa" });
    const c = sealReceipt(g, { ts: T0, kind: "op", payloadHash: "bb" });
    expect(c.seq).toBe(2);
    expect(c.prevHash).toBe(g.hash);
  });

  test("same inputs → identical receipt (deterministic)", () => {
    const a = sealReceipt(null, { ts: T0, kind: "boot", payloadHash: "aa" });
    const b = sealReceipt(null, { ts: T0, kind: "boot", payloadHash: "aa" });
    expect(a).toEqual(b);
  });

  test("different payload → different hash (tamper-evident)", () => {
    const a = sealReceipt(null, { ts: T0, kind: "boot", payloadHash: "aa" });
    const b = sealReceipt(null, { ts: T0, kind: "boot", payloadHash: "ab" });
    expect(a.hash).not.toBe(b.hash);
  });

  test("rejects non-integer or non-positive seq continuation", () => {
    const bad = { seq: 1.5, ts: T0, kind: "boot", payloadHash: "aa", prevHash: GENESIS_PREV_HASH, hash: "ff" } as unknown as Receipt;
    expect(() =>
      sealReceipt(bad, { ts: T0, kind: "op", payloadHash: "bb" }),
    ).toThrow();
  });
});

describe("verifyChain — fail-closed auditor", () => {
  test("empty chain → ok (vacuous truth)", () => {
    expect(verifyChain([]).ok).toBe(true);
  });

  test("valid chains of 1..7 → ok", () => {
    for (const n of [1, 2, 3, 5, 7]) {
      const res = verifyChain(buildChain(n));
      expect(res.ok).toBe(true);
      expect(res.brokenAt).toBeUndefined();
    }
  });

  test("tampered payloadHash → fail closed at exact index", () => {
    const chain = buildChain(5);
    const victim = { ...chain[3]!, payloadHash: "deadbeef" };
    const doctored = [
      chain[0]!,
      chain[1]!,
      chain[2]!,
      victim,
      chain[4]!,
    ] as Receipt[];
    const res = verifyChain(doctored);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(3);
    expect(res.reason).toMatch(/hash-mismatch/);
  });

  test("seq gap → fail closed at gap", () => {
    const chain = buildChain(4);
    const gapped = [chain[0]!, chain[2]!] as Receipt[];
    const res = verifyChain(gapped);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(1);
    expect(res.reason).toMatch(/seq/);
  });

  test("broken prev-link → fail closed at the lying receipt", () => {
    const chain = buildChain(3);
    const liar = { ...chain[2]!, prevHash: GENESIS_PREV_HASH };
    const res = verifyChain([chain[0]!, chain[1]!, liar]);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(2);
    expect(res.reason).toMatch(/prev/);
  });

  test("genesis violation (prevHash ≠ GENESIS at seq 1) → fail closed at 0", () => {
    const chain = buildChain(2);
    const orphan = { ...chain[0]!, prevHash: "f".repeat(64) };
    const res = verifyChain([orphan, chain[1]!]);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(0);
    expect(res.reason).toMatch(/genesis/);
  });

  test("verifier is deterministic across repeated runs", () => {
    const chain = buildChain(6);
    const a = verifyChain(chain);
    const b = verifyChain(chain);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  test("full re-seal of a valid chain reproduces byte-identical hashes", () => {
    const chain = buildChain(4);
    const rebuilt = buildChain(4);
    expect(rebuilt).toEqual(chain);
  });
});
