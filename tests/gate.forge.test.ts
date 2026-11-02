/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/markets/gate.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/markets/gate";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/markets/gate.ts (forge characterization batch-1)", () => {
  test("makeFence + valid intent ok", () => {
    const fence = mod.makeFence();
    expect(canon(mod.gateTradeIntent(fence, { base: "XTEC", qty: 10, priceMu: 100, actor: "soldier-1", side: "buy" }))).toBe("{\"ok\":true}");
    expect(fence.blocked).toBe(0);
  });
  test("gateTradeIntent rule captures", () => {
    const fence = mod.makeFence();
    expect(canon(mod.gateTradeIntent(fence, { base: "bad", qty: 10, priceMu: 100, actor: "a", side: "buy" }))).toBe("{\"detail\":\"base נדרה [A-Z]{2,8}: bad\",\"ok\":false,\"rule\":\"G3-sym\"}");
    expect(canon(mod.gateTradeIntent(fence, { base: "XTEC", qty: 0, priceMu: 100, actor: "a", side: "buy" }))).toBe("{\"detail\":\"qty שלם 1..MAX: 0\",\"ok\":false,\"rule\":\"G2/G4-qty\"}");
    expect(canon(mod.gateTradeIntent(fence, { base: "XTEC", qty: 1, priceMu: 1.5, actor: "a", side: "buy" }))).toBe("{\"detail\":\"priceMu שלם 1..MAX: 1.5\",\"ok\":false,\"rule\":\"G2/G4-price\"}");
    expect(canon(mod.gateTradeIntent(fence, { base: "XTEC", qty: 1, priceMu: 1, actor: "Bad Actor", side: "buy" }))).toBe("{\"detail\":\"actor נדרה ^[a-z0-9-]{1,32}$: Bad Actor\",\"ok\":false,\"rule\":\"G3-actor\"}");
    expect(canon(mod.gateTradeIntent(fence, { base: "XTEC", qty: 1, priceMu: 1, actor: "a", side: "hold" }))).toBe("{\"detail\":\"side נדרה buy|sell: hold\",\"ok\":false,\"rule\":\"G2-side\"}");
    expect(fence.blocked).toBe(5);
  });
  test("FORBIDDEN_GLOBALS captured", () => {
    expect(mod.FORBIDDEN_GLOBALS).toEqual(["eval","Function","fetch","XMLHttpRequest","WebSocket","importScripts"]);
  });
  test("assertAllIntegers captures", () => {
    expect(mod.assertAllIntegers({ a: 1, b: [1, 2.5], c: { d: NaN } })).toEqual(["$.b[1]=2.5","$.c.d=NaN"]);
    expect(mod.assertAllIntegers({ a: 1, b: [1, 2], c: { d: 3 } })).toEqual([]);
  });
  test("canonicalJson sorts keys deterministically", () => {
    expect(mod.canonicalJson({ b: 1, a: [2, 1] })).toBe("{\"a\":[2,1],\"b\":1}");
    expect(mod.canonicalJson({ z: { y: 1, x: 2 } })).toBe("{\"z\":{\"x\":2,\"y\":1}}");
    expect(mod.canonicalJson({ b: 1, a: [2, 1] })).toBe(mod.canonicalJson({ a: [2, 1], b: 1 }));
  });
});
