/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/markets/prng.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/markets/prng";

describe("src/lib/markets/prng.ts (forge characterization batch-1)", () => {
  test("GENESIS_SEED captured", () => {
    expect(mod.GENESIS_SEED).toBe("c6e021a64b40db1c023c3e094de1d9cc132ebec65ff4c8cf51a7766dee69c20a");
  });
  test("sha256hex captured", () => {
    expect(mod.sha256hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(mod.sha256hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(mod.sha256hex("saos-markets-genesis-2026-10-14")).toBe("c6e021a64b40db1c023c3e094de1d9cc132ebec65ff4c8cf51a7766dee69c20a");
  });
  test("makeStream deterministic draws (same seed+id replay)", () => {
    const a = mod.makeStream(mod.GENESIS_SEED, "probe:one");
    expect([a.int(1000), a.int(1000), a.signed(100), a.chance(500), a.next()]).toEqual([821,464,-81,false,1501827824]);
    const b = mod.makeStream(mod.GENESIS_SEED, "probe:one");
    expect([b.int(1000), b.int(1000), b.signed(100), b.chance(500), b.next()]).toEqual([821,464,-81,false,1501827824]);
  });
  test("makeStream different streamId diverges", () => {
    const c = mod.makeStream(mod.GENESIS_SEED, "probe:two");
    expect([c.int(1000), c.int(1000)]).toEqual([512,156]);
    expect([c.int(1000)]).not.toEqual([512]);
  });
  test("makeStream custom 16-hex seed", () => {
    const s = mod.makeStream("aaaaaaaaaaaaaaaa", "x");
    expect([s.int(7), s.int(7)]).toEqual([1,2]);
  });
  test("makeStream rejects bad seedHex (honest throw)", () => {
    expect(() => mod.makeStream("short", "x")).toThrow();
  });
});
