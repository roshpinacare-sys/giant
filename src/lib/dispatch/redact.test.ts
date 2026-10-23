// redact.test.ts — zero-plaintext-secrets logging primitive (directive §3, §7B: key isolation).
// Logs must never carry key material: any sensitive key (by name, case-insensitive, any depth)
// is replaced with a fixed marker. Deterministic, offline, cycle-safe, depth-guarded.
/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { REDACTED_MARKER, isSensitiveKey, redactForLog } from "./redact";

describe("isSensitiveKey — name-based classification", () => {
  test("flags key material, tokens and credentials (case-insensitive)", () => {
    for (const k of [
      "wif",
      "WIF",
      "token",
      "accessToken",
      "SECRET",
      "user_password",
      "passPhrase",
      "privateKey",
      "private_key",
      "seedPhrase",
      "mnemonic",
      "Authorization",
      "api_key",
      "sessionToken",
      "credentialMode_x", // contains 'credential'
    ]) {
      expect(isSensitiveKey(k)).toBe(true);
    }
  });

  test("allows ordinary operational keys", () => {
    for (const k of [
      "account",
      "opsToday",
      "custody",
      "status",
      "port",
      "verdict",
      "reason",
      "hash",
      "prevHash",
      "payloadHash",
      "seq",
      "kind",
    ]) {
      expect(isSensitiveKey(k)).toBe(false);
    }
  });

  test("empty/whitespace keys are sensitive (fail-closed default)", () => {
    expect(isSensitiveKey("")).toBe(true);
    expect(isSensitiveKey("   ")).toBe(true);
  });
});

describe("redactForLog — deep redaction", () => {
  test("flattens sensitive keys at top level", () => {
    const out = redactForLog({
      account: "headcorner",
      wif: "5JdeC9P7……never-shown",
      token: "ghp_xxx",
    }) as Record<string, unknown>;
    expect(out["account"]).toBe("headcorner");
    expect(out["wif"]).toBe(REDACTED_MARKER);
    expect(out["token"]).toBe(REDACTED_MARKER);
  });

  test("redacts at any depth, preserving structure", () => {
    const out = redactForLog({
      engine: {
        port: 3040,
        auth: { private_key: "xxx", note: "ok" },
      },
      list: [{ secret: "s", n: 1 }, 2, "three"],
    }) as Record<string, unknown>;
    const engine = out["engine"] as Record<string, unknown>;
    expect(engine["port"]).toBe(3040);
    const auth = engine["auth"] as Record<string, unknown>;
    expect(auth["private_key"]).toBe(REDACTED_MARKER);
    expect(auth["note"]).toBe("ok");
    const list = out["list"] as Array<Record<string, unknown>>;
    expect(list[0]!["secret"]).toBe(REDACTED_MARKER);
    expect(list[0]!["n"]).toBe(1);
    expect(list[1] as unknown).toBe(2);
    expect(list[2] as unknown).toBe("three");
  });

  test("never mutates the input object (purity)", () => {
    const input = { a: 1, secret: "s", nested: { token: "t" } };
    const snapshot = JSON.stringify(input);
    redactForLog(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test("deterministic: same input → identical JSON output (x50)", () => {
    const input = { wif: "a", nested: { password: "b", ok: true } };
    const first = JSON.stringify(redactForLog(input));
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(redactForLog(input))).toBe(first);
    }
  });

  test("cycle-safe: self-referencing object → cycle marker, no throw", () => {
    const a: Record<string, unknown> = { name: "a" };
    a["self"] = a;
    const out = redactForLog(a) as Record<string, unknown>;
    expect(out["name"]).toBe("a");
    expect(out["self"]).toBe("[CYCLE]");
  });

  test("depth guard: beyond max depth → truncation marker (no stack blowup)", () => {
    let deep: Record<string, unknown> = { leaf: "x", seed: "s" };
    for (let i = 0; i < 64; i++) deep = { child: deep };
    const out = redactForLog(deep, 8) as Record<string, unknown>;
    // walk 8 levels down; the 9th is truncated
    let cursor: Record<string, unknown> = out;
    for (let i = 0; i < 8; i++) {
      cursor = cursor["child"] as Record<string, unknown>;
    }
    expect(cursor as unknown).toBe("[TRUNCATED]");
  });

  test("primitives pass through unchanged", () => {
    expect(redactForLog(null)).toBeNull();
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog("plain")).toBe("plain");
    expect(redactForLog(true)).toBe(true);
  });

  test("frozen input is handled without mutation attempts", () => {
    const frozen = Object.freeze({ wif: "x", ok: 1 });
    const out = redactForLog(frozen) as Record<string, unknown>;
    expect(out["wif"]).toBe(REDACTED_MARKER);
    expect(out["ok"]).toBe(1);
  });
});
