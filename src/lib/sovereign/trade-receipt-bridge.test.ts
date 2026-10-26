/**
 * trade-receipt-bridge.test.ts — G76-Q · §7 PROOF OF PERFORMANCE LAWS.
 *
 * The bridge is the seam between the estate trading plane (army-grid op
 * receipts, txid-pinned, measured live) and the fleet-economy intake
 * (state/ext-flows.jsonl schema, measured 2026-10-26: ref/venue/kind/
 * amountUsd/txid/note/ts/takenAt/agent — plain rows, no seq/h). These
 * tests pin its fail-closed parsing, its NO-INVENTED-VALUES law, and the
 * hash-linked batch receipt in the swarm's ONE receipt language.
 * The economy's own seq-chain and caps stay the economy's laws (G76-d).
 */
import { describe, expect, test } from "bun:test";
import {
  bridgeBatch,
  parseArmyOps,
  toExtFlowRows,
  type ArmyOpRow,
} from "./trade-receipt-bridge";
import { verifyReceiptChain } from "./swallow-guard";

const REQUOTE = {
  type: "army.requote",
  at: "2026-10-26T14:29:44.634Z",
  account: "wic",
  label: "front-create",
  ops: 2,
  cancels: 0,
  creates: 2,
  txid: "449e66d52098b0e2eb7cf1a1a26930995bb831ec",
  rcPct: 69.7,
  opsToday: 2,
  equilibriumOpsPerDay: 370,
  bestAsk: 0.10241704219582139,
  bestBid: 0.10206164523372117,
};

const VERDICT = {
  type: "army.verdict",
  at: "2026-10-26T14:28:53.583Z",
  account: "woq",
  verdict: "GOVERNOR-ACCUMULATING",
};

describe("parseArmyOps", () => {
  test("parses a live-shaped requote row (evidence-driven, no invented fields)", () => {
    const { ops, rejected } = parseArmyOps([REQUOTE, VERDICT]);
    expect(rejected).toEqual([]);
    expect(ops).toHaveLength(1);
    const op = ops[0] as ArmyOpRow;
    expect(op.account).toBe("wic");
    expect(op.txid).toBe("449e66d52098b0e2eb7cf1a1a26930995bb831ec");
    expect(op.creates).toBe(2);
    expect(op.at).toBe("2026-10-26T14:29:44.634Z");
  });

  test("verdict rows are measured as verdicts (provenance), not ops", () => {
    const { ops, rejected } = parseArmyOps([VERDICT]);
    expect(ops).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  test("fail-closed: a requote row without txid is REJECTED, never invented", () => {
    const broken = { ...REQUOTE, txid: undefined };
    const { ops, rejected } = parseArmyOps([broken]);
    expect(ops).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.reason)).toContain("txid");
  });

  test("fail-closed: malformed rows (null, arrays, wrong types) rejected with reasons", () => {
    const { rejected } = parseArmyOps([null, 42, [], "row", { type: "army.requote" }]);
    expect(rejected.length).toBe(5);
  });

  test("deterministic: same rows → same parsed output, byte-for-byte", () => {
    expect(JSON.stringify(parseArmyOps([REQUOTE, VERDICT]))).toBe(
      JSON.stringify(parseArmyOps([REQUOTE, VERDICT])),
    );
  });
});

describe("toExtFlowRows — NO-INVENTED-VALUES law", () => {
  test("quote-only ops carry NO USD evidence → flowRows stay honestly empty", () => {
    const { ops } = parseArmyOps([REQUOTE]);
    expect(toExtFlowRows(ops)).toEqual([]);
  });

  test("a realized-USD row (pnl evidence) bridges into the measured ext-flow schema", () => {
    const pnlOp = {
      kind: "pnl" as const,
      ref: "t589-pnl-001",
      venue: "steem-internal-market",
      amountUsd: 12.5,
      txid: "aa77",
      note: "realized SBD→USD measured",
      ts: 1793032000000,
      agent: "saos-engine:army-grid",
      account: "cashmachine",
    };
    const rows = toExtFlowRows([pnlOp as unknown as ArmyOpRow]);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.kind).toBe("pnl");
    expect(r.amountUsd).toBe(12.5);
    expect(r.ref).toBe("t589-pnl-001");
    expect(r.takenAt).toBe(1793032000000);
    expect(Object.keys(r).sort()).toEqual(
      // the MEASURED ext-flows schema carries ts AND takenAt (live rows 2026-10-26)
      ["agent", "amountUsd", "kind", "note", "ref", "takenAt", "ts", "txid", "venue"].sort(),
    );
    expect(r.ts).toBe(1793032000000);
  });

  test("fail-closed: non-finite or non-positive amounts never bridge", () => {
    const bad = [
      { kind: "pnl", ref: "x", venue: "v", amountUsd: Number.NaN, txid: "t", ts: 1, agent: "a", account: "c" },
      { kind: "pnl", ref: "y", venue: "v", amountUsd: -3, txid: "t", ts: 1, agent: "a", account: "c" },
    ] as unknown as ArmyOpRow[];
    expect(toExtFlowRows(bad)).toEqual([]);
  });
});

describe("bridgeBatch — the signed PROOF OF PERFORMANCE", () => {
  test("mints a hash-linked receipt over the measured batch (deterministic)", () => {
    const parsed = parseArmyOps([REQUOTE, VERDICT]);
    const a = bridgeBatch([...parsed.ops, ...parsed.verdicts], { at: "2026-10-26T15:00:00.000Z", prevHash: null });
    const b = bridgeBatch([...parsed.ops, ...parsed.verdicts], { at: "2026-10-26T15:00:00.000Z", prevHash: null });
    expect(a.receipt.hash).toBe(b.receipt.hash);
    expect(a.receipt.prevHash).toBeNull();
    expect(a.batch.kind).toBe("SAOS-TRADE-RECEIPT-BRIDGE/1");
    expect(a.batch.measured.ops).toBe(1);
    expect(a.batch.measured.verdicts).toBe(1);
    expect(a.batch.measured.accounts).toEqual(["wic", "woq"]);
    expect(a.batch.measured.flowRows).toBe(0);
  });

  test("chains: second batch stamps the first (verifyReceiptChain ok)", () => {
    const { ops } = parseArmyOps([REQUOTE]);
    const first = bridgeBatch(ops, { at: "2026-10-26T15:00:00.000Z", prevHash: null });
    const second = bridgeBatch(ops, {
      at: "2026-10-26T15:05:00.000Z",
      prevHash: first.receipt.hash,
    });
    const v = verifyReceiptChain([first.receipt, second.receipt]);
    expect(v.ok).toBe(true);
    expect(v.verified).toBe(2);
  });

  test("tamper → brokenAt exact (fail-closed auditability)", () => {
    const { ops } = parseArmyOps([REQUOTE]);
    const first = bridgeBatch(ops, { at: "2026-10-26T15:00:00.000Z", prevHash: null });
    const second = bridgeBatch(ops, {
      at: "2026-10-26T15:05:00.000Z",
      prevHash: first.receipt.hash,
    });
    // GuardReceipt.payload is typed `unknown` (ONE receipt language); bind it
    // to the record shape before spreading (TS2698 — spread needs an object).
    const payload = first.receipt.payload as Record<string, unknown>;
    const forged = {
      ...first.receipt,
      payload: { ...payload, measured: { ops: 999 } },
    };
    const v = verifyReceiptChain([forged, second.receipt]);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(0);
  });

  test("honest-empty day: zero ops still mint a truthful receipt (ops:0)", () => {
    const { ops } = parseArmyOps([]);
    const { batch } = bridgeBatch(ops, { at: "2026-10-26T15:00:00.000Z", prevHash: null });
    expect(batch.measured.ops).toBe(0);
    expect(batch.measured.accounts).toEqual([]);
    expect(batch.measured.txids).toEqual([]);
  });

  test("window derivation comes from ROW timestamps, never the wall clock", () => {
    const parsed = parseArmyOps([VERDICT, REQUOTE]);
    const { batch } = bridgeBatch([...parsed.ops, ...parsed.verdicts], { at: "2026-10-26T15:00:00.000Z", prevHash: null });
    expect(batch.measured.windowFrom).toBe("2026-10-26T14:28:53.583Z");
    expect(batch.measured.windowTo).toBe("2026-10-26T14:29:44.634Z");
  });
});
