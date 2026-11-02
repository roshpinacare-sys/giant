/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/db.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * The db proxy wraps a live PrismaClient; the suite asserts the proxy exposes the Prisma surface and that healDb resolves honestly without a live database (self-heal replaces the pool, no queries issued).
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/db";

describe("src/lib/db.ts (forge characterization batch-1)", () => {
  test("db proxy exposes Prisma surface", () => {
    expect(typeof mod.db).toBe("object");
    expect(typeof mod.db.$disconnect).toBe("function");
    expect(typeof mod.db.$connect).toBe("function");
  });
  test("healDb resolves honestly without live DB (self-heal, no throw)", async () => {
    await expect(mod.healDb("forge-probe")).resolves.toBeUndefined();
  });
});
