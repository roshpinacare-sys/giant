/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/dispatch/redact.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/dispatch/redact";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/dispatch/redact.ts (forge characterization batch-1)", () => {
  test("REDACTED_MARKER captured", () => {
    expect(mod.REDACTED_MARKER).toBe("[REDACTED]");
  });
  test("isSensitiveKey captures (fail-closed on blank)", () => {
    expect(mod.isSensitiveKey("password")).toBe(true);
    expect(mod.isSensitiveKey("WIF")).toBe(true);
    expect(mod.isSensitiveKey("api-key")).toBe(true);
    expect(mod.isSensitiveKey("totalUsd")).toBe(false);
    expect(mod.isSensitiveKey("")).toBe(true);
    expect(mod.isSensitiveKey("ownerKey")).toBe(false);
  });
  test("redactForLog deep-redacts sensitive keys, preserves others", () => {
    expect(canon(mod.redactForLog({ user: "a", ownerKey: "xyz", nested: { seed: 1, ok: 2 } }))).toBe("{\"nested\":{\"ok\":2,\"seed\":\"[REDACTED]\"},\"ownerKey\":\"xyz\",\"user\":\"a\"}");
    expect(canon(mod.redactForLog([1, "two", { three: 3 }]))).toBe("[1,\"two\",{\"three\":3}]");
    expect(canon(mod.redactForLog("plain"))).toBe("\"plain\"");
  });
  test("redactForLog breaks cycles and truncates depth", () => {
    const cyc: Record<string, unknown> = {}; cyc.self = cyc;
    expect(canon(mod.redactForLog(cyc))).toBe("{\"self\":\"[CYCLE]\"}");
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } };
    expect(canon(mod.redactForLog(deep, 3))).toBe("{\"a\":{\"b\":{\"c\":\"[TRUNCATED]\"}}}");
  });
});
