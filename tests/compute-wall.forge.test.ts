/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/compute-wall.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * measureComputeWall performs a REAL network measurement of the Autonomy ledger/journal; the suite asserts the honest Shape contract (field presence + types), never specific values, because values are environment truth.
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/compute-wall";

describe("src/lib/compute-wall.ts (forge characterization batch-1)", () => {
  test("measureComputeWall returns the honest ComputeWallState shape", async () => {
    const st = await mod.measureComputeWall(3000);
    expect(Object.keys(st).sort()).toEqual(["canaryConclusion","errors","he","lastCanaryAttempt","lastJournalEvent","lastJournalTs","measuredAt","parkedAt","parkedCount","sinceLastProbeS","walled"]);
    expect(typeof st.measuredAt).toBe("string");
    expect(isNaN(Date.parse(st.measuredAt))).toBe(false);
    expect(Array.isArray(st.errors)).toBe(true);
    expect(typeof st.he).toBe("string");
    expect(st.he.length > 0).toBe(true);
    expect(["boolean", "object"]).toContain(typeof st.walled);
  });
});
