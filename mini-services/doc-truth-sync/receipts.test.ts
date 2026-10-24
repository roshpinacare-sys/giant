import { describe, expect, test } from "bun:test";
import {
  ZERO_HASH,
  appendReceipt,
  canonicalJson,
  genesisReceipt,
  sha256Hex,
  verifyChain,
  type DocTruthReceipt,
} from "./receipts.ts";

const T0 = "2026-10-24T18:00:00Z";
const T1 = "2026-10-24T18:05:00Z";
const T2 = "2026-10-24T18:10:00Z";

describe("doc-truth receipts — SAOS-DOC-TRUTH/1 hash chain", () => {
  test("sha256Hex matches the RFC 6234 vector for 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("canonicalJson sorts keys and emits zero whitespace", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: { m: [1, 2], k: "v" }, a: true })).toBe(
      '{"a":true,"z":{"k":"v","m":[1,2]}}',
    );
    expect(canonicalJson("plain")).toBe('"plain"');
  });

  test("genesis receipt: seq 1, prev ZERO_HASH, hash is 64 hex chars", () => {
    const g = genesisReceipt(T0, "census.run", { total: 3 });
    expect(g.seq).toBe(1);
    expect(g.prev).toBe(ZERO_HASH);
    expect(g.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(g.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(g.kind).toBe("census.run");
  });

  test("hash law: explicit field list only — seq/iso/kind/payloadHash/prev", () => {
    const g = genesisReceipt(T0, "census.run", { a: 1 });
    const altIso = genesisReceipt(T1, "census.run", { a: 1 });
    expect(altIso.hash).not.toBe(g.hash);
    const altKind = genesisReceipt(T0, "other.kind", { a: 1 });
    expect(altKind.hash).not.toBe(g.hash);
  });

  test("appendReceipt is immutable: input chain untouched, returns new chain with linkage", () => {
    const g = genesisReceipt(T0, "census.run", { a: 1 });
    const frozen: readonly DocTruthReceipt[] = [g];
    const next = appendReceipt(frozen, T1, "isolation.build", { b: 2 });
    expect(frozen).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1].seq).toBe(2);
    expect(next[1].prev).toBe(g.hash);
    expect(next[1].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("verifyChain accepts a freshly generated chain", () => {
    const chain = appendReceipt(
      appendReceipt([genesisReceipt(T0, "census.run", { a: 1 })], T1, "isolation.build", { b: 2 }),
      T2,
      "receipt.land",
      { c: 3 },
    );
    const verdict = verifyChain(chain);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  test("verifyChain fails closed on empty chain", () => {
    expect(verifyChain([]).ok).toBe(false);
  });

  test("verifyChain rejects genesis whose prev is not ZERO_HASH", () => {
    const g = genesisReceipt(T0, "census.run", { a: 1 });
    const forged: DocTruthReceipt = { ...g, prev: "f".repeat(64) };
    const v = verifyChain([forged]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("genesis-prev");
  });

  test("verifyChain rejects tampered payloadHash", () => {
    const g = genesisReceipt(T0, "census.run", { a: 1 });
    const chain = appendReceipt([g], T1, "isolation.build", { b: 2 });
    const tampered: DocTruthReceipt = {
      ...chain[1],
      payloadHash: sha256Hex("tampered"),
    };
    const v = verifyChain([chain[0], tampered]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("hash-mismatch");
  });

  test("verifyChain rejects broken prev linkage", () => {
    const g = genesisReceipt(T0, "census.run", { a: 1 });
    const chain = appendReceipt([g], T1, "isolation.build", { b: 2 });
    const reLinked: DocTruthReceipt = { ...chain[1], prev: ZERO_HASH };
    const v = verifyChain([chain[0], reLinked]);
    expect(v.ok).toBe(false);
  });

  test("verifyChain rejects seq skip", () => {
    const g = genesisReceipt(T0, "census.run", { a: 1 });
    const chain = appendReceipt([g], T1, "isolation.build", { b: 2 });
    const skipped: DocTruthReceipt = { ...chain[1], seq: 5 };
    const v = verifyChain([chain[0], skipped]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("seq");
  });

  test("verifyChain rejects malformed iso timestamps (forged receipt, bypassing constructors)", () => {
    const forged: DocTruthReceipt = {
      seq: 1,
      iso: "2026-10-24 18:00:00",
      kind: "census.run",
      payloadHash: sha256Hex("x"),
      prev: ZERO_HASH,
      hash: "a".repeat(64),
    };
    const v = verifyChain([forged]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("iso");
  });

  test("verifyChain rejects empty kind (forged receipt, bypassing constructors)", () => {
    const forged: DocTruthReceipt = {
      seq: 1,
      iso: T0,
      kind: "",
      payloadHash: sha256Hex("x"),
      prev: ZERO_HASH,
      hash: "b".repeat(64),
    };
    expect(verifyChain([forged]).ok).toBe(false);
  });
});
