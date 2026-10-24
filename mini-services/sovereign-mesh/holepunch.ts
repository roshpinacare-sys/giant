// sovereign-mesh/holepunch.ts — deterministic dual-peer hole-punch ORCHESTRATOR.
// Pure state machine: probe scheduling with seeded jitter (§11 exponential
// backoff-with-jitter law lives in pmp-client; here: fixed-interval probes with
// deterministic per-session jitter), injected clock, transport-agnostic events.
// The gateway lane (sovereign-local-rpc-gateway) owns the wire codecs; this
// module owns WHO probes WHEN and WHEN the punch is open/refused/expired.

export type PunchRole = "initiator" | "responder";
export type PunchVerdict = "pending" | "open" | "refused" | "expired";

export interface ProbeEvent {
  from: "peer" | "self";
  at: number; // injected clock ms
}

/** Seeded LCG — deterministic jitter source (x = (a*x + c) mod 2^32). */
function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000; // [0,1)
  };
}

export interface ProbeSlot {
  at: number; // absolute ms (startAt + i*baseMs + jitter, jitter ∈ [0, jitterMs])
  index: number;
}

/**
 * Deterministic probe schedule: probe i fires at startAt + i*baseMs + jitter_i,
 * jitter_i ∈ [0, jitterMs] from the seed. Monotonically non-decreasing because
 * baseMs ≥ jitterMs is enforced (a later slot can never fire earlier than an
 * earlier slot's worst case… enforced structurally: baseMs must be ≥ jitterMs).
 */
export function planProbes(opts: {
  seed: number;
  count: number;
  baseMs: number;
  jitterMs: number;
  startAt: number;
}): ProbeSlot[] {
  if (opts.baseMs < opts.jitterMs) throw new Error("holepunch: baseMs must be >= jitterMs (schedule monotonicity)");
  if (opts.count <= 0 || opts.count > 64) throw new Error("holepunch: count out of bounds 1..64");
  const rnd = lcg(opts.seed);
  const out: ProbeSlot[] = [];
  let prevAt = -1;
  for (let i = 0; i < opts.count; i++) {
    const at = opts.startAt + i * opts.baseMs + Math.floor(rnd() * (opts.jitterMs + 1));
    out.push({ at: Math.max(at, prevAt), index: i });
    prevAt = out[i].at;
  }
  return out;
}

export interface HolePunchSession {
  role: PunchRole;
  peerMapped: string; // "ip:port" of the peer's NAT-mapped address (from rendezvous)
  startAt: number;
  deadlineMs: number;
  maxProbes: number;
  sentCount: number;
  lastPeerEventAt: number | null;
  openedAt: number | null;
  onEvent(ev: ProbeEvent): void;
  markSent(at: number): void;
}

export function createSession(opts: {
  role: PunchRole;
  peerMapped: string;
  startAt: number;
  deadlineMs: number;
  maxProbes?: number;
}): HolePunchSession {
  if (opts.deadlineMs <= 0) throw new Error("holepunch: deadlineMs must be positive");
  const maxProbes = opts.maxProbes ?? 8;
  const s: HolePunchSession = {
    role: opts.role,
    peerMapped: opts.peerMapped,
    startAt: opts.startAt,
    deadlineMs: opts.deadlineMs,
    maxProbes,
    sentCount: 0,
    lastPeerEventAt: null,
    openedAt: null,
    onEvent(ev: ProbeEvent) {
      if (ev.from === "peer" && s.openedAt === null) {
        s.lastPeerEventAt = ev.at;
        s.openedAt = ev.at; // first received peer probe = the path is open (both sides fire; receipt proves the map)
      }
    },
    markSent(at: number) {
      if (s.openedAt !== null) return;
      if (at < s.startAt) throw new Error("holepunch: probe sent before session start");
      s.sentCount += 1;
    },
  };
  return s;
}

/**
 * Verdict (fail-closed):
 * - open    — at least one peer probe RECEIVED (the NAT mapping lets the peer through)
 * - refused — every planned probe was SENT, none received, deadline not passed
 * - expired — deadline passed without receipt
 * - pending — still within the plan
 */
export function verdict(s: HolePunchSession, now: number): PunchVerdict {
  if (s.openedAt !== null) return "open";
  if (s.sentCount >= s.maxProbes) return "refused";
  if (now >= s.startAt + s.deadlineMs) return "expired";
  return "pending";
}
