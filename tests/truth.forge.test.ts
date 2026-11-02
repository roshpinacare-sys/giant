/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/giant/truth.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * fileMeta is captured against a real temp file (deterministic sha16 of known content). loadTruth is asserted for the honest Shape contract (fail-honest base payload when estate files are absent).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as mod from "../src/lib/giant/truth";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/giant/truth.ts (forge characterization batch-1)", () => {
  test("constants captured", () => {
    expect(mod.MU).toBe(1000);
    expect(typeof mod.ESTATE_ROOT).toBe("string");
    expect(mod.ESTATE_ROOT.length > 0).toBe(true);
    expect(true).toBe(true);
  });
  test("fileMeta on real temp file (sha16 deterministic)", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "forge-truth-"));
    try {
      const f = path.join(tmp, "probe.txt");
      writeFileSync(f, "saos-forge-probe-content-2026-11-02");
      const meta = mod.fileMeta(f);
      expect(meta.exists).toBe(true);
      expect(meta.sha16).toBe("5079210759a4bafe");
      expect(meta.path).toBe(f);
      expect(meta.ageMinutes !== null && meta.ageMinutes >= 0).toBe(true);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
  test("fileMeta missing file (honest absent)", () => {
    expect(canon(mod.fileMeta("/nonexistent-saos-forge-xyz"))).toBe("{\"ageMinutes\":null,\"exists\":false,\"path\":\"/nonexistent-saos-forge-xyz\",\"sha16\":null}");
  });
  test("loadTruth fail-honest shape when estate files absent", () => {
    const t = mod.loadTruth();
    expect(typeof t.fetchedAt).toBe("string");
    expect(isNaN(Date.parse(t.fetchedAt))).toBe(false);
    expect(Array.isArray(t.realMoney.lines)).toBe(true);
    expect(typeof t.ok).toBe("boolean");
    expect(t.note === undefined || typeof t.note === "string").toBe(true);
  });
});
