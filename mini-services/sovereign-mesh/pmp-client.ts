// sovereign-mesh/pmp-client.ts — NAT-PMP RFC 6886 CLIENT side: response parser
// (the client must read what the gateway answers) + the deterministic retry
// plan (exponential backoff with seeded jitter — the §11 fail-safe, RFC 6886
// §3.4 "initially wait 250ms, resend with doubling, max every 9 seconds").
// Wire builders for SENDING live in the gateway lane (their claim); this module
// owns the receiving side + the schedule logic, per the declared boundary.

export const PMP_VERSION = 0;
export const PMP_OP_PUBLIC_ADDRESS = 1;
export const PMP_OP_MAP_UDP = 2;
export const PMP_OP_MAP_TCP = 3;
export const PMP_RESPONSE_BIT = 0x80;

export const PMP_RESULT = {
  SUCCESS: 0,
  UNSUPPORTED_VERSION: 1,
  NOT_AUTHORIZED: 2,
  NETWORK_FAILURE: 3,
  OUT_OF_RESOURCES: 4,
  UNSUPPORTED_OPCODE: 5,
} as const;

export type PmpResultClass = "ok" | "refused" | "retryable" | "permanent" | "unknown-fail";

export function classifyPmpResult(code: number): PmpResultClass {
  switch (code) {
    case PMP_RESULT.SUCCESS: return "ok";
    case PMP_RESULT.NOT_AUTHORIZED: return "refused";
    case PMP_RESULT.NETWORK_FAILURE: return "retryable";
    case PMP_RESULT.OUT_OF_RESOURCES: return "retryable";
    case PMP_RESULT.UNSUPPORTED_OPCODE: return "permanent";
    case PMP_RESULT.UNSUPPORTED_VERSION: return "permanent";
    default: return "unknown-fail"; // fail-closed: an undocumented code is never "ok"
  }
}

export type PmpParseResult =
  | { ok: true; kind: "public-address"; result: number; epochSec: number; ip: string }
  | { ok: true; kind: "map"; result: number; epochSec: number; internalPort: number; externalPort: number; lifetimeSec: number }
  | { ok: false; reason: string; result?: number };

/** Parse a NAT-PMP response (public-address 12B or map 16B). Accepts both the
 * RFC's op|0x80 response convention and gateways that echo the plain opcode. */
export function parsePmpResponse(buf: Buffer): PmpParseResult {
  if (buf.length < 4) return { ok: false, reason: `pmp: response too short (${buf.length}B)` };
  if (buf[0] !== PMP_VERSION) return { ok: false, reason: `pmp: unknown version ${buf[0]}` };
  const opField = buf[1];
  const op = opField & ~PMP_RESPONSE_BIT;
  const result = buf.readUInt16BE(2);
  const epochSec = buf.length >= 8 ? buf.readUInt32BE(4) : 0;
  if (op === PMP_OP_PUBLIC_ADDRESS) {
    if (buf.length < 12) return { ok: false, reason: `pmp: public-address response must be 12B, got ${buf.length}`, result };
    if (result !== PMP_RESULT.SUCCESS) return { ok: false, reason: `pmp: result ${result}`, result };
    const ip = `${buf[8]}.${buf[9]}.${buf[10]}.${buf[11]}`;
    return { ok: true, kind: "public-address", result, epochSec, ip };
  }
  if (op === PMP_OP_MAP_UDP || op === PMP_OP_MAP_TCP) {
    if (buf.length < 16) return { ok: false, reason: `pmp: map response must be 16B, got ${buf.length}`, result };
    if (result !== PMP_RESULT.SUCCESS) return { ok: false, reason: `pmp: result ${result}`, result };
    return {
      ok: true,
      kind: "map",
      result,
      epochSec,
      internalPort: buf.readUInt16BE(8),
      externalPort: buf.readUInt16BE(10),
      lifetimeSec: buf.readUInt32BE(12),
    };
  }
  return { ok: false, reason: `pmp: unknown opcode ${opField}`, result };
}

/** Seeded LCG — same construction as holepunch (single deterministic jitter source per module). */
function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

export interface PmpRetrySlot {
  at: number; // absolute ms (startAt + nominal_i + jitter_i, jitter ∈ [0, +20% of nominal])
  attempt: number;
}

/**
 * Deterministic retry plan per RFC 6886 §3.4: nominal delays 250ms doubling per
 * attempt, capped at 9000ms; each slot gets seeded jitter in [0, +20%] — jitter
 * is ADDITIVE-ONLY (never negative), so the plan stays monotonically
 * non-decreasing and the worst case is bounded at nominal × 1.2 (§11
 * exponential-backoff-with-jitter, bounded).
 */
export function pmpRetryPlan(opts: { attempts: number; baseMs: number; capMs: number; seed: number; startAt: number }): PmpRetrySlot[] {
  if (opts.attempts <= 0 || opts.attempts > 16) throw new Error("pmp: attempts out of bounds 1..16");
  if (opts.baseMs <= 0 || opts.capMs < opts.baseMs) throw new Error("pmp: baseMs/capMs invalid");
  const rnd = lcg(opts.seed);
  const out: PmpRetrySlot[] = [];
  let delay = opts.baseMs;
  let prevAt = -1;
  for (let i = 0; i < opts.attempts; i++) {
    const nominal = Math.min(delay, opts.capMs);
    const jitter = Math.floor(rnd() * (nominal * 0.2) + 0.5);
    // Monotonicity clamp: two capped slots (nominal 9000) draw different jitter —
    // a later slot must never fire earlier than an earlier one (§11: backoff never contracts).
    const at = Math.max(opts.startAt + nominal + jitter, prevAt);
    out.push({ at, attempt: i });
    prevAt = at;
    delay *= 2;
  }
  return out;
}
