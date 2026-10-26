/**
 * trade-receipt-bridge.ts — G76-Q · §7 PROOF OF PERFORMANCE bridge
 * (trace 1a178852b7fbcb25, 2026-10-26).
 *
 *  ═══════════════════════════════════════════════════════════════════
 *  THE W48 DECLARED SEAM: the estate trading plane (saos-engine
 *  army-grid ops on the Steem internal market — army.requote rows with
 *  REAL txids, measured live 2026-10-26) → the fleet-economy intake
 *  (state/ext-flows.jsonl schema, measured 2026-10-26) + a hash-linked
 *  signed batch receipt in the swarm's ONE receipt language.
 *  ═══════════════════════════════════════════════════════════════════
 *
 * LAWS (every one test-locked):
 *  · EVIDENCE-DRIVEN PARSING — the parser accepts the MEASURED row
 *    shapes (army.requote / army.verdict), rejects everything else
 *    fail-closed with reasons; a requote row without a txid can never
 *    enter (no invented provenance).
 *  · NO-INVENTED-VALUES — quote-only ops carry no USD evidence, so the
 *    bridge's flowRows stay honestly empty; a row bridges into
 *    ext-flows ONLY with a finite, positive, measured amountUsd. The
 *    economy's seq-chain, routing law and caps remain the economy's own
 *    laws (G76-d owns fleet-economy state/**) — this core only
 *    normalizes and proves.
 *  · ONE RECEIPT LANGUAGE — the batch receipt is guardReceipt
 *    (SHA-256(prevHash ‖ at ‖ payload-canonical)); chains verify with
 *    the shared verifyReceiptChain; tamper → brokenAt exact.
 *  · DETERMINISM — no clock, no RNG: `at` is injected, windows derive
 *    from row timestamps. Same inputs ⇒ byte-identical receipt.
 *  · HONEST-EMPTY — a zero-op day still mints a TRUTHFUL receipt
 *    (measured.ops: 0); the proof is that the measurement happened.
 */

import { guardReceipt, type GuardReceipt } from "./swallow-guard";

/** The measured fleet-economy ext-flows intake schema (2026-10-26). */
export interface ExtFlowRow {
  readonly ref: string;
  readonly venue: string;
  readonly kind: string;
  readonly amountUsd: number;
  readonly txid: string;
  readonly note: string;
  readonly ts: number;
  readonly takenAt: number;
  readonly agent: string;
}

/** A parsed, txid-pinned trading-plane op receipt. */
export interface ArmyOpRow {
  readonly kind: "op";
  readonly account: string;
  readonly txid: string;
  readonly label: string;
  readonly ops: number;
  readonly creates: number;
  readonly cancels: number;
  readonly rcPct: number | null;
  readonly at: string;
}

/** A parsed verdict row (provenance evidence, not an op). */
export interface ArmyVerdictRow {
  readonly kind: "verdict";
  readonly account: string;
  readonly verdict: string;
  readonly at: string;
}

export type ParsedArmyRow = ArmyOpRow | ArmyVerdictRow;

export interface Rejection {
  readonly index: number;
  readonly reason: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isHexTxid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8,64}$/i.test(v);

const isIsoAt = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));

/** EVIDENCE-DRIVEN, fail-closed parsing of army-grid event rows. */
export function parseArmyRows(rows: readonly unknown[]): {
  ops: ArmyOpRow[];
  verdicts: ArmyVerdictRow[];
  rejected: Rejection[];
} {
  const ops: ArmyOpRow[] = [];
  const verdicts: ArmyVerdictRow[] = [];
  const rejected: Rejection[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!isObj(r)) {
      rejected.push({ index: i, reason: "not-an-object" });
      continue;
    }
    const type = r.type;
    const at = r.at;
    const account = r.account;
    if (type === "army.requote") {
      if (!isHexTxid(r.txid)) {
        rejected.push({ index: i, reason: "requote-without-txid (no invented provenance)" });
        continue;
      }
      if (typeof account !== "string" || !account) {
        rejected.push({ index: i, reason: "requote-without-account" });
        continue;
      }
      if (!isIsoAt(at)) {
        rejected.push({ index: i, reason: "requote-without-timestamp" });
        continue;
      }
      const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
      ops.push({
        kind: "op",
        account,
        txid: r.txid,
        label: typeof r.label === "string" ? r.label : "unknown",
        ops: num(r.ops, 0),
        creates: num(r.creates, 0),
        cancels: num(r.cancels, 0),
        rcPct: typeof r.rcPct === "number" && Number.isFinite(r.rcPct) ? r.rcPct : null,
        at,
      });
      continue;
    }
    if (type === "army.verdict") {
      if (typeof account !== "string" || !account || typeof r.verdict !== "string" || !isIsoAt(at)) {
        rejected.push({ index: i, reason: "verdict-row-malformed" });
        continue;
      }
      verdicts.push({ kind: "verdict", account, verdict: r.verdict, at });
      continue;
    }
    rejected.push({ index: i, reason: `unrecognized-type:${String(type)}` });
  }
  return { ops, verdicts, rejected };
}

/** Back-compat alias (op-only view) — verdicts stay available via parseArmyRows. */
export function parseArmyOps(
  rows: readonly unknown[],
): { ops: ArmyOpRow[]; verdicts: ArmyVerdictRow[]; rejected: Rejection[] } {
  return parseArmyRows(rows);
}

/** Measurable-USD evidence carrier (produced by pnl lanes only). */
export interface PnlEvidenceRow {
  readonly kind: "pnl";
  readonly ref: string;
  readonly venue: string;
  readonly amountUsd: number;
  readonly txid: string;
  readonly note: string;
  readonly ts: number;
  readonly agent: string;
  readonly account: string;
}

/**
 * NO-INVENTED-VALUES: only rows carrying finite, positive, measured USD
 * evidence become ext-flow rows. Quote-only ops bridge as PROOF receipts
 * with flowRows honestly empty — never with fabricated amounts.
 */
export function toExtFlowRows(
  rows: readonly unknown[],
): ExtFlowRow[] {
  const out: ExtFlowRow[] = [];
  for (const r of rows) {
    if (!isObj(r) || r.kind !== "pnl") continue;
    const amount = r.amountUsd;
    const ref = r.ref;
    const venue = r.venue;
    const txid = r.txid;
    const ts = r.ts;
    const agent = r.agent;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
    if (typeof ref !== "string" || !ref) continue;
    if (typeof venue !== "string" || !venue) continue;
    if (typeof txid !== "string" || !txid) continue;
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (typeof agent !== "string" || !agent) continue;
    out.push({
      ref,
      venue,
      kind: "pnl",
      amountUsd: amount,
      txid,
      note: typeof r.note === "string" ? r.note : "",
      ts,
      takenAt: ts,
      agent,
    });
  }
  return out;
}

/** The signed PROOF-OF-PERFORMANCE batch (SAOS-TRADE-RECEIPT-BRIDGE/1). */
export interface TradeReceiptBatch {
  readonly kind: "SAOS-TRADE-RECEIPT-BRIDGE/1";
  readonly measured: {
    readonly ops: number;
    readonly verdicts: number;
    readonly accounts: readonly string[];
    readonly txids: readonly string[];
    readonly creates: number;
    readonly cancels: number;
    readonly flowRows: number;
    readonly flowUsdTotal: number;
    readonly windowFrom: string | null;
    readonly windowTo: string | null;
    readonly rejected: number;
  };
  readonly ops: readonly ArmyOpRow[];
  readonly verdicts: readonly ArmyVerdictRow[];
  readonly flowRows: readonly ExtFlowRow[];
  readonly rejected: readonly Rejection[];
}

export interface BridgedBatch {
  readonly batch: TradeReceiptBatch;
  readonly receipt: GuardReceipt;
}

/**
 * Mint the batch + its hash-linked receipt. Deterministic: `at` injected,
 * windows derived from rows, accounts/txids sorted (canonical, not
 * encounter-order) so equal evidence yields byte-identical receipts.
 */
export function bridgeBatch(
  parsed: readonly ParsedArmyRow[],
  opts: { at: string; prevHash: string | null; rejected?: readonly Rejection[] },
): BridgedBatch {
  const ops = parsed.filter((r): r is ArmyOpRow => r.kind === "op");
  const verdicts = parsed.filter((r): r is ArmyVerdictRow => r.kind === "verdict");
  const flowRows = toExtFlowRows(ops);
  const accounts = [...new Set([...ops, ...verdicts].map((r) => r.account))].sort();
  const txids = [...new Set(ops.map((r) => r.txid))].sort();
  const times = [...ops, ...verdicts].map((r) => r.at).sort();
  const rejected = opts.rejected ?? [];
  const batch: TradeReceiptBatch = {
    kind: "SAOS-TRADE-RECEIPT-BRIDGE/1",
    measured: {
      ops: ops.length,
      verdicts: verdicts.length,
      accounts,
      txids,
      creates: ops.reduce((s, r) => s + r.creates, 0),
      cancels: ops.reduce((s, r) => s + r.cancels, 0),
      flowRows: flowRows.length,
      flowUsdTotal: flowRows.reduce((s, r) => s + r.amountUsd, 0),
      windowFrom: times[0] ?? null,
      windowTo: times[times.length - 1] ?? null,
      rejected: rejected.length,
    },
    ops,
    verdicts,
    flowRows,
    rejected,
  };
  const receipt = guardReceipt(opts.prevHash, batch, opts.at);
  return { batch, receipt };
}

/** Alias so consumers verify with the swarm's single verify entry point. */
export { verifyReceiptChain } from "./swallow-guard";
