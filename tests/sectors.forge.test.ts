/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/sectors.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * SECTOR_DEFS is the pure constant truth table (captured). The fs/db-driven sector measurements are only referenced, never invoked (no side effects in tests).
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/sectors";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/sectors.ts (forge characterization batch-1)", () => {
  test("SECTOR_DEFS truth table captured", () => {
    expect(canon(mod.SECTOR_DEFS)).toBe("[{\"base\":\"SC-CONSOLE\",\"description\":\"השרשרת-המאומתת · עמודים-מוצפנים · המערכת-שהוכחה\",\"name\":\"קונסולה\",\"poolUsds\":9000,\"sort\":20,\"system\":\"Console\",\"tokens\":10000},{\"base\":\"SC-DOMAIN\",\"description\":\"worldbeat + office3d · ספריית-התלת-ממד של האחוזה\",\"name\":\"דומיין\",\"poolUsds\":6000,\"sort\":21,\"system\":\"Domain\",\"tokens\":10000},{\"base\":\"SC-ROSH\",\"description\":\"מערכת-הווב הפנימית · מכונת-הבנייה-החיה\",\"name\":\"ראש-פינה\",\"poolUsds\":4500,\"sort\":22,\"system\":\"roshpina\",\"tokens\":10000},{\"base\":\"SC-FLEET\",\"description\":\"כלכלת-הסוכנים · היסוד: נפח-מסחר-אמיתי שנמדד\",\"name\":\"הצי\",\"poolUsds\":3000,\"sort\":23,\"system\":\"Fleet\",\"tokens\":10000}]");
  });
  test("sector bases unique and canonical", () => {
    expect(mod.SECTOR_DEFS.map((d) => d.base)).toEqual(["SC-CONSOLE","SC-DOMAIN","SC-ROSH","SC-FLEET"]);
    expect(new Set(mod.SECTOR_DEFS.map((d) => d.base)).size).toBe(mod.SECTOR_DEFS.length);
  });
  test("every sector def structurally honest (10_000 tokens, positive pool)", () => {
    for (const d of mod.SECTOR_DEFS) {
      expect(d.tokens).toBe(10000);
      expect(d.poolUsds).toBeGreaterThan(0);
      expect(typeof d.sort).toBe("number");
    }
  });
});
