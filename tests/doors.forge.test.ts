/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/dispatch/doors.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/dispatch/doors";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/dispatch/doors.ts (forge characterization batch-1)", () => {
  test("ENGINE_WHITELIST captured", () => {
    expect([...mod.ENGINE_WHITELIST].sort()).toEqual(["army-grid","cycle-status","exec-status","fills","finance-digest","fleet","health","hyper","live","payouts","social","status","weave","yield"]);
  });
  test("ENGINE_DOMAIN_SEALED_PATHS captured", () => {
    expect([...mod.ENGINE_DOMAIN_SEALED_PATHS].sort()).toEqual(["adopt-credential","cycle","disperse","redeploy"]);
  });
  test("resolveDoor guard verdicts captured", () => {
    expect(canon(mod.resolveDoor("GET", []))).toBe("{\"port\":3100,\"reason\":\"static-first-match\",\"verdict\":\"static\"}");
    expect(canon(mod.resolveDoor("POST", ["no-such-door"]))).toBe("{\"port\":3100,\"reason\":\"static-first-match\",\"verdict\":\"static\"}");
    expect(canon(mod.resolveDoor("BREW", ["no-such-door"]))).toBe("{\"port\":3100,\"reason\":\"static-first-match\",\"verdict\":\"static\"}");
  });
  test("DOORS table frozen and captured (methods canon)", () => {
    expect(Object.isFrozen(mod.DOORS)).toBe(true);
    expect(canon(mod.DOORS.map((d) => ("engine" in d ? "engine" : "static")))).toBe("[\"engine\",\"static\",\"static\"]");
  });
  test("dispatchTableHash deterministic", () => {
    expect(mod.dispatchTableHash()).toBe("7b32e45d29153e29d65702113587e1d0411b0f1618afedb9039a2c3f7451ba88");
    expect(mod.dispatchTableHash()).toBe("7b32e45d29153e29d65702113587e1d0411b0f1618afedb9039a2c3f7451ba88");
  });
});
