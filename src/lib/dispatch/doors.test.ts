// doors.test.ts — deterministic contracts for the door-dispatch kernel (Thread 1, wave 19.79).
// Directive §7A: giant = sole canonical registry; dispatch routes through a single deterministic
// state machine. Fail-closed: any method/path outside the GET whitelist on the engine domain is
// SEALED (never forwarded). All tests offline + deterministic (no clock, no network, no RNG).
/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import {
  DOORS,
  ENGINE_DOMAIN_SEALED_PATHS,
  ENGINE_WHITELIST,
  dispatchTableHash,
  resolveDoor,
  type DispatchVerdict,
} from "./doors";
import { sha256Hex } from "./receipts";

describe("DOORS — canonical graded ladder (frozen)", () => {
  test("ladder order and ports are exactly {3040-engine, 3100, 3200}", () => {
    expect(DOORS.map((d) => d.port)).toEqual([3040, 3100, 3200]);
    expect(DOORS[0]?.engine).toBe(true);
    expect(DOORS[0]?.prefix).toBe("");
    expect(DOORS[1]?.engine).toBeUndefined();
    expect(DOORS[2]?.engine).toBeUndefined();
  });

  test("DOORS is deeply frozen — mutation attempts throw", () => {
    expect(Object.isFrozen(DOORS)).toBe(true);
    expect(() => {
      (DOORS as unknown as { pop: () => unknown }).pop!();
    }).toThrow();
    expect(() => {
      "use strict";
      (DOORS[0] as unknown as { port: number }).port = 9999;
    }).toThrow();
  });

  test("engine whitelist contains exactly the 14 audited truth paths", () => {
    expect([...ENGINE_WHITELIST].sort()).toEqual(
      [
        "army-grid",
        "cycle-status",
        "exec-status",
        "finance-digest",
        "fills",
        "fleet",
        "health",
        "hyper",
        "live",
        "payouts",
        "social",
        "status",
        "weave",
        "yield",
      ].sort(),
    );
    expect(Object.isFrozen(ENGINE_WHITELIST)).toBe(true);
  });

  test("sealed engine write paths are exactly the 4 governance verbs", () => {
    expect([...ENGINE_DOMAIN_SEALED_PATHS].sort()).toEqual(
      ["adopt-credential", "cycle", "disperse", "redeploy"].sort(),
    );
    expect(Object.isFrozen(ENGINE_DOMAIN_SEALED_PATHS)).toBe(true);
  });

  test("dispatchTableHash is stable, 64-hex, and content-addressed", () => {
    const a = dispatchTableHash();
    const b = dispatchTableHash();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("dispatchTableHash changes if the table semantics change", () => {
    // Deterministic divergence proof: hash of a doctored copy differs.
    const doctored = DOORS.map((d) =>
      d.port === 3200 ? { ...d, port: 3201 } : d,
    );
    const canon = (doors: typeof DOORS): string =>
      doors
        .map(
          (d) =>
            `${d.port}|${d.prefix}|${d.engine ? 1 : 0}|${
              "whitelist" in d && d.whitelist
                ? [...d.whitelist].sort().join(",")
                : ""
            }|${
              "sealedPaths" in d && d.sealedPaths
                ? [...d.sealedPaths].sort().join(",")
                : ""
            }`,
        )
        .join(";");
    // cross-check the kernel hash matches the SHA-256 of its own canonical form
    expect(dispatchTableHash()).toBe(sha256Hex(canon(DOORS)));
    expect(dispatchTableHash()).not.toBe(sha256Hex(canon(doctored as typeof DOORS)));
  });
});

describe("resolveDoor — single deterministic state machine", () => {
  test("GET on whitelisted engine truth path → engine door 3040", () => {
    for (const p of ["status", "health", "fleet", "cycle-status"]) {
      const v = resolveDoor("GET", [p]);
      expect(v.verdict).toBe("engine");
      expect(v.port).toBe(3040);
      expect(v.reason).toBe("engine-truth-get");
    }
  });

  test("deeper engine reads still route by first segment", () => {
    const v = resolveDoor("GET", ["health", "detail", "x"]);
    expect(v.verdict).toBe("engine");
    expect(v.port).toBe(3040);
  });

  test("CASE-SENSITIVE whitelist: 'STATUS' is NOT engine truth", () => {
    const v = resolveDoor("GET", ["STATUS"]);
    expect(v.verdict).not.toBe("engine");
  });

  test("any non-GET on whitelisted path → FAIL-CLOSED (grip preserved)", () => {
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
      const v = resolveDoor(m, ["status"]);
      expect(v.verdict).toBe("fail-closed");
      expect(v.reason).toBe("engine-domain-method-not-allowed");
      expect(v.port).toBe(3040);
    }
  });

  test("governance write verbs are sealed even under GET", () => {
    for (const p of ["redeploy", "cycle", "adopt-credential", "disperse"]) {
      const v = resolveDoor("GET", [p]);
      expect(v.verdict).toBe("fail-closed");
      expect(v.reason).toBe("engine-domain-path-sealed");
    }
  });

  test("POST on sealed governance verb → fail-closed with method reason", () => {
    const v = resolveDoor("POST", ["redeploy"]);
    expect(v.verdict).toBe("fail-closed");
    expect(v.reason).toBe("engine-domain-method-not-allowed");
  });

  test("non-engine domain falls through the static ladder in graded order", () => {
    const v = resolveDoor("GET", ["anything", "else"]);
    expect(v.verdict).toBe("static");
    expect(v.port).toBe(3100);
    expect(v.reason).toBe("static-first-match");
  });

  test("empty segments → static door 3100 (never engine)", () => {
    const v = resolveDoor("GET", []);
    expect(v.verdict).toBe("static");
    expect(v.port).toBe(3100);
    const w = resolveDoor("POST", []);
    expect(w.verdict).toBe("static");
    expect(w.port).toBe(3100);
  });

  test("determinism: identical inputs → deep-equal verdicts (x100)", () => {
    const inputs: Array<[string, string[]]> = [
      ["GET", ["status"]],
      ["POST", ["status"]],
      ["GET", ["redeploy"]],
      ["GET", ["unknown"]],
      ["GET", []],
    ];
    for (const [m, seg] of inputs) {
      const first: DispatchVerdict = resolveDoor(m, seg);
      for (let i = 0; i < 100; i++) {
        expect(resolveDoor(m, seg)).toEqual(first);
      }
    }
  });

  test("purity: input arrays are not mutated by resolution", () => {
    const seg = ["status"];
    const snapshot = [...seg];
    resolveDoor("GET", seg);
    expect(seg).toEqual(snapshot);
  });
});
