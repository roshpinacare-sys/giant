// G78-e · feat/giant-execution-ledger-receipts · deterministic zero-dep tests for
// the SAOS-EXECUTION-LEDGER-LIVE-RECEIPTS/1 validator (live-receipts.ts).
//
// Two classes, per house convention:
//   1. synthetic valid/invalid docs (injected clocks — no sleeps, no network);
//   2. the REAL landed giant ledger (state/execution/execution-state.json) —
//      the landed artifact itself must validate, or the suite is RED. This is
//      the machine-enforced guard against fabricated receipt rows.
//
// Lineage: accessor suite (execution-accessor.test.ts) is 28/28 — this file
// extends the same defi-convergence suite, it never weakens it.

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  LIVE_RECEIPTS_SCHEMA,
  DEFAULT_RECEIPTS_STALE_AFTER_HOURS,
  validateReceiptRow,
  validateLiveReceipts,
  isStaleReceipts,
  readLiveReceipts,
  type LiveReceiptRow,
} from "./live-receipts.ts";
import { validateExecutionState } from "./execution-accessor.ts";

const T0 = new Date("2026-10-27T13:00:00.000Z").getTime();

function row(over: Partial<LiveReceiptRow> = {}): LiveReceiptRow {
  return {
    at: "2026-10-27T12:37:28.229Z",
    kind: "soldier-army.order.latest-ok",
    actor: "gal",
    resource: "SAOS/USDS",
    amount: '{"side":"sell","price":1028,"amount":10000,"postOnly":true}',
    proofRef: "giant:mini-services/soldier-army/state/actions.jsonl#L1064 sha256:14a6160303bf0db9",
    outcome: "ok",
    source: "soldier-army engine live log (append-only, sem gal-16)",
    ...over,
  };
}

function section(rows: LiveReceiptRow[] = [row()], over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: LIVE_RECEIPTS_SCHEMA,
    at: new Date(T0 - 3600_000).toISOString(),
    generator: "test-generator (measured)",
    law: "every row carries a measured proofRef · zero fabricated rows",
    receipts: rows,
    countsByKind: rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] || 0) + 1;
      return acc;
    }, {}),
    totalReceipts: rows.length,
    ...over,
  };
}

function repoRoot(): string {
  // walk up from this test file to the giant checkout root (has package.json)
  let dir = import.meta.dir;
  for (let i = 0; i < 12; i++) {
    try {
      if (readFileSync(join(dir, "package.json"), "utf8").includes('"dev"')) return dir;
    } catch { /* keep walking */ }
    dir = join(dir, "..");
  }
  throw new Error("giant repo root not found from " + import.meta.dir);
}

describe("validateReceiptRow", () => {
  test("accepts a fully-measured row", () => {
    expect(validateReceiptRow(row()).valid).toBe(true);
  });

  test("rejects any missing/empty measured field", () => {
    for (const key of ["at", "kind", "actor", "resource", "amount", "proofRef", "outcome", "source"] as const) {
      const bad: any = row();
      delete bad[key];
      const v = validateReceiptRow(bad);
      expect(v.valid).toBe(false);
      expect(v.reason).toContain(key);
    }
  });

  test("rejects non-ISO `at` and non-object input", () => {
    expect(validateReceiptRow(row({ at: "yesterday" })).valid).toBe(false);
    expect(validateReceiptRow(null).valid).toBe(false);
    expect(validateReceiptRow([row()]).valid).toBe(false);
  });

  test("a row without a proofRef is not a receipt (zero-fabrication law)", () => {
    expect(validateReceiptRow(row({ proofRef: "" })).valid).toBe(false);
  });
});

describe("validateLiveReceipts", () => {
  test("accepts a well-formed section with counts parity", () => {
    const v = validateLiveReceipts(section());
    expect(v.valid).toBe(true);
    expect(v.rowsChecked).toBe(1);
  });

  test("rejects schema drift", () => {
    expect(validateLiveReceipts(section([row()], { schema: "OTHER/9" })).valid).toBe(false);
  });

  test("rejects counts drift (summary must never diverge from rows)", () => {
    expect(validateLiveReceipts(section([row()], { countsByKind: { "soldier-army.order.latest-ok": 2 } })).valid).toBe(false);
    expect(
      validateLiveReceipts(section([row(), row({ kind: "x.y" })], { countsByKind: { "soldier-army.order.latest-ok": 1 } })).valid,
    ).toBe(false);
  });

  test("rejects totalReceipts drift", () => {
    expect(validateLiveReceipts(section([row()], { totalReceipts: 5 })).valid).toBe(false);
  });

  test("rejects one bad row among good ones (fail-closed, names the index)", () => {
    const v = validateLiveReceipts(section([row(), row({ proofRef: "" })]));
    expect(v.valid).toBe(false);
    expect(v.reason).toContain("receipts[1]");
  });
});

describe("receipts staleness law (48h default)", () => {
  test("fresh within the window", () => {
    expect(isStaleReceipts(section() as any, T0)).toBe(false);
  });

  test("stale past the window and exactly at the boundary", () => {
    const old = section([row()], { at: new Date(T0 - 49 * 3600_000).toISOString() });
    expect(isStaleReceipts(old as any, T0)).toBe(true);
    const boundary = section([row()], { at: new Date(T0 - DEFAULT_RECEIPTS_STALE_AFTER_HOURS * 3600_000).toISOString() });
    expect(isStaleReceipts(boundary as any, T0)).toBe(true);
  });

  test("readLiveReceipts reports staleness honestly (section retained)", () => {
    const doc = { liveReceipts: section([row()], { at: new Date(T0 - 96 * 3600_000).toISOString() }) };
    const r = readLiveReceipts(doc, T0);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("re-harvest");
    expect(r.section).not.toBeNull();
  });
});

describe("readLiveReceipts — pre-G78-e ledgers", () => {
  test("a ledger without the section reports honestly (not fabricated as empty)", () => {
    const r = readLiveReceipts({ schema: "SAOS-EXECUTION-LEDGER/1", liveReceipts: undefined }, T0);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("no liveReceipts section");
  });
});

describe("the REAL landed giant ledger (state/execution/execution-state.json)", () => {
  const doc = JSON.parse(readFileSync(join(repoRoot(), "state", "execution", "execution-state.json"), "utf8"));

  test("carries a valid liveReceipts section", () => {
    const r = readLiveReceipts(doc);
    expect(r.valid).toBe(true);
    expect((r.rowsChecked ?? 0) > 0).toBe(true);
  });

  test("every receipt row has a concrete proofRef and a measured source", () => {
    const s = readLiveReceipts(doc).section!;
    for (const row of s.receipts) {
      expect(row.proofRef.length).toBeGreaterThan(8);
      expect(row.source.length).toBeGreaterThan(3);
      expect(Number.isNaN(Date.parse(row.at))).toBe(false);
    }
  });

  test("the soldier-army engine receipts are line+sha256-proofed and the file still verifies them", () => {
    const s = readLiveReceipts(doc).section!;
    const engineRows = s.receipts.filter((r) => r.kind.startsWith("soldier-army.") && r.proofRef.includes("#L"));
    expect(engineRows.length).toBeGreaterThan(0);
    const lines = readFileSync(join(repoRoot(), "mini-services", "soldier-army", "state", "actions.jsonl"), "utf8").split("\n");
    for (const r of engineRows) {
      const m = r.proofRef.match(/#L(\d+) sha256:([0-9a-f]{16})/);
      expect(m).not.toBeNull();
      const lineNo = Number(m![1]);
      const line = lines[lineNo - 1];
      // append-only log: the proofed line must still exist and hash-match
      expect(line).toBeTruthy();
      const parsed = JSON.parse(line);
      expect(new Date(parsed.ts).toISOString()).toBe(r.at);
      expect(createHash("sha256").update(line, "utf8").digest("hex").slice(0, 16)).toBe(m![2]);
    }
  });

  test("curation receipts carry on-chain txids (VOTED-LIVE evidence)", () => {
    const s = readLiveReceipts(doc).section!;
    const curation = s.receipts.filter((r) => r.kind.includes("curation"));
    expect(curation.length).toBeGreaterThan(0);
    for (const r of curation) expect(/txid [0-9a-f]{16,}/.test(r.proofRef)).toBe(true);
  });

  test("fleet-economy treasury receipts carry seq+hash ledger proofs", () => {
    const s = readLiveReceipts(doc).section!;
    const fe = s.receipts.filter((r) => r.kind.startsWith("fleet-economy.treasury."));
    expect(fe.length).toBeGreaterThan(0);
    for (const r of fe) expect(r.proofRef).toContain("fleet-economy@main");
  });

  test("countsByKind matches the receipts array exactly (no decoration)", () => {
    const s = readLiveReceipts(doc).section!;
    expect(validateLiveReceipts(s).valid).toBe(true);
  });

  test("the ledger still passes the canonical accessor schema (open-key law intact)", () => {
    expect(validateExecutionState(doc).valid).toBe(true);
  });
});
