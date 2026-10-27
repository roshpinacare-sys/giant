// AMM micro-yield accrual — hash-linked treasury record (house settlement law §2).
// Every accrual record is sha256-linked to its predecessor: any rewrite of the
// yield history is detectable, and the treasury's self-financed income becomes
// immutable proof of the system paying for itself.
import { createHash } from "node:crypto";
export interface YieldSource {
  source: string;            // "amm-spread" | "micro-arb" | "orderbook-match" | ...
  microUnits: number;        // integer µ-units (house settlement unit) — no floats on money
  measuredAtIso: string;
}
export interface AccrualRecord {
  seq: number;
  atIso: string;
  source: string;
  microUnits: number;
  h: string;                 // sha256 over (seq|atIso|source|microUnits|prevH)
  prevH: string;
}
export interface AccrualState {
  records: AccrualRecord[];
  totalMicroUnits: number;
  headH: string;
}
export const GENESIS_H = "0".repeat(64);
function recordH(r: Omit<AccrualRecord, "h">): string {
  return createHash("sha256").update(`${r.seq}|${r.atIso}|${r.source}|${r.microUnits}|${r.prevH}`).digest("hex");
}
export function accrue(state: AccrualState, ys: YieldSource, nowIso: string): AccrualState {
  if (!Number.isInteger(ys.microUnits) || ys.microUnits <= 0)
    throw new TypeError("microUnits must be a positive integer (no float money)");
  if (!ys.source) throw new TypeError("source required");
  const prevH = state.records.length ? state.records[state.records.length - 1].h : GENESIS_H;
  const seq = state.records.length ? state.records[state.records.length - 1].seq + 1 : 1;
  const base = { seq, atIso: nowIso, source: ys.source, microUnits: ys.microUnits, prevH };
  const rec: AccrualRecord = { ...base, h: recordH(base) };
  return { records: [...state.records, rec], totalMicroUnits: state.totalMicroUnits + ys.microUnits, headH: rec.h };
}
export function verifyAccrual(state: AccrualState): { ok: boolean; brokenAt?: number } {
  let prevH = GENESIS_H;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    const base = { seq: r.seq, atIso: r.atIso, source: r.source, microUnits: r.microUnits, prevH };
    if (r.prevH !== prevH || r.h !== recordH(base)) return { ok: false, brokenAt: r.seq };
    if (r.seq !== i + 1) return { ok: false, brokenAt: r.seq };
    prevH = r.h;
  }
  return { ok: true };
}
