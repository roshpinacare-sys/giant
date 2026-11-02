/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/anchor.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * parseAnchorMessage is the pure export and is fully captured; anchorStatus/performAnchor are live git/network paths and are only referenced, never invoked (no side effects in tests).
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/anchor";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/anchor.ts (forge characterization batch-1)", () => {
  test("parseAnchorMessage null", () => {
    expect(canon(mod.parseAnchorMessage(null))).toBe("{\"at\":null,\"lineageHead\":null}");
  });
  test("parseAnchorMessage full message", () => {
    expect(canon(mod.parseAnchorMessage("lineage 00112233445566778899aabbccddeeff00112233 at 2026-11-02T10:00:00Z ok"))).toBe("{\"at\":\"2026-11-02T10:00:00Z\",\"lineageHead\":\"00112233445566778899aabbccddeeff00112233\"}");
  });
  test("parseAnchorMessage no anchors", () => {
    expect(canon(mod.parseAnchorMessage("no anchors here"))).toBe("{\"at\":null,\"lineageHead\":null}");
  });
  test("parseAnchorMessage malformed anchors", () => {
    expect(canon(mod.parseAnchorMessage("lineage zzzz at nope"))).toBe("{\"at\":null,\"lineageHead\":null}");
  });
  test("live exports referenced (not invoked — no side effects)", () => {
    expect(typeof mod.anchorStatus).toBe("function");
    expect(typeof mod.performAnchor).toBe("function");
  });
});
