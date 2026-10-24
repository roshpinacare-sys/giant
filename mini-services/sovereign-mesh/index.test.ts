// sovereign-mesh — TDD suite (RED first, per claim mini-services/sovereign-mesh)
// Deterministic, offline, zero network. Injected clocks only. Seeded jitter only.
// Golden facts: RFC-cited constants (PCP RFC 6887, NAT-PMP RFC 6886) + roundtrip
// properties + CPython zlib.crc32 as an independent oracle where hashing is tested.
import { describe, test, expect } from "bun:test";
import { createIdentity, MeshRegistry } from "./mesh";
import { planProbes, createSession, verdict, type ProbeEvent } from "./holepunch";
import { buildPcpMapRequest, parsePcpResponse, buildPcpMapResponse, PCP_OPCODE_MAP, PCP_RESULT_SUCCESS } from "./pcp";
import { pmpRetryPlan, parsePmpResponse, PMP_RESULT, classifyPmpResult } from "./pmp-client";

// ── mesh.ts: identity + registry ────────────────────────────────────────────
describe("mesh identity", () => {
  test("same seed → same nodeId (deterministic ed25519)", () => {
    const a = createIdentity("seed-alpha-001");
    const b = createIdentity("seed-alpha-001");
    expect(a.nodeId).toBe(b.nodeId);
    expect(a.nodeId).toHaveLength(64); // sha256 hex
  });
  test("different seeds → different nodeIds", () => {
    const a = createIdentity("seed-alpha-001");
    const b = createIdentity("seed-beta-002");
    expect(a.nodeId).not.toBe(b.nodeId);
  });
  test("nodeId is sha256 of the raw public key", () => {
    const id = createIdentity("seed-sha-check");
    // sha256(pubRaw32) — recomputed here via node:crypto as an independent check
    const { createHash } = require("node:crypto");
    expect(id.nodeId).toBe(createHash("sha256").update(id.publicKeyRaw).digest("hex"));
  });
});

describe("MeshRegistry", () => {
  test("join → alive; expiry removes; announce refreshes lease", () => {
    const reg = new MeshRegistry();
    const id = createIdentity("reg-1");
    reg.join(id.nodeId, ["ledger.read", "dex.quote"], 1000, 10_000);
    expect(reg.alive(2000).map((p) => p.nodeId)).toEqual([id.nodeId]);
    expect(reg.alive(10_500)).toHaveLength(1); // lease 1000..11000
    expect(reg.alive(11_500)).toEqual([]); // expired
  });
  test("lease boundary is exact (1000 + 10000 = 11000, alive at 10999, dead at 11000)", () => {
    const reg = new MeshRegistry();
    const id = createIdentity("reg-boundary");
    reg.join(id.nodeId, [], 1000, 10_000);
    expect(reg.alive(10_999)).toHaveLength(1);
    expect(reg.alive(11_000)).toHaveLength(0);
  });
  test("announce refreshes lease and upgrades capabilities", () => {
    const reg = new MeshRegistry();
    const id = createIdentity("reg-announce");
    reg.join(id.nodeId, ["a"], 1000, 5_000);
    reg.announce(id.nodeId, ["a", "b"], 5_000, 5_000);
    expect(reg.alive(9_000)).toHaveLength(1); // lease now 5000..10000
    const p = reg.get(id.nodeId)!;
    expect(p.capabilities.sort()).toEqual(["a", "b"]);
  });
  test("announce from unknown node is refused (fail-closed join-only)", () => {
    const reg = new MeshRegistry();
    expect(reg.announce("unknown-node", ["x"], 1000, 5_000)).toBe(false);
  });
  test("quorum requires k alive peers; capability filter", () => {
    const reg = new MeshRegistry();
    const a = createIdentity("q-a");
    const b = createIdentity("q-b");
    const c = createIdentity("q-c");
    reg.join(a.nodeId, ["mesh.route"], 0, 60_000);
    reg.join(b.nodeId, ["mesh.route"], 0, 60_000);
    const cPeer = reg.join(c.nodeId, ["other"], 0, 60_000);
    expect(reg.quorum(3, 1000)).toBe(true);
    expect(reg.quorum(4, 1000)).toBe(false);
    expect(reg.withCapability("mesh.route", 1000).map((p) => p.nodeId).sort()).toEqual([a.nodeId, b.nodeId].sort());
    cPeer.leaseUntil = 500; // expired
    expect(reg.alive(1000)).toHaveLength(2);
  });
});

// ── holepunch.ts: deterministic sequencer ───────────────────────────────────
describe("holepunch probe plan", () => {
  test("same seed → identical schedule; different seed → different", () => {
    const p1 = planProbes({ seed: 42, count: 6, baseMs: 100, jitterMs: 50, startAt: 0 });
    const p2 = planProbes({ seed: 42, count: 6, baseMs: 100, jitterMs: 50, startAt: 0 });
    const p3 = planProbes({ seed: 43, count: 6, baseMs: 100, jitterMs: 50, startAt: 0 });
    expect(p1).toEqual(p2);
    expect(p1.map((x) => x.at)).not.toEqual(p3.map((x) => x.at));
  });
  test("schedule is monotonically non-decreasing and within jitter bounds", () => {
    const p = planProbes({ seed: 7, count: 10, baseMs: 200, jitterMs: 100, startAt: 5 });
    for (let i = 1; i < p.length; i++) expect(p[i].at).toBeGreaterThanOrEqual(p[i - 1].at);
    for (let i = 0; i < p.length; i++) {
      const nominal = 5 + i * 200;
      expect(p[i].at).toBeGreaterThanOrEqual(nominal); // jitter never negative (floor at nominal)
      expect(p[i].at).toBeLessThanOrEqual(nominal + 100);
    }
  });
});

describe("holepunch session", () => {
  test("pending → open when peer probe received before deadline", () => {
    const s = createSession({ role: "initiator", peerMapped: "10.0.0.9:51820", startAt: 0, deadlineMs: 10_000 });
    expect(verdict(s, 100)).toBe("pending");
    const ev: ProbeEvent = { from: "peer", at: 300 };
    s.onEvent(ev);
    expect(verdict(s, 400)).toBe("open");
  });
  test("refused when all planned probes sent and none received", () => {
    const s = createSession({ role: "initiator", peerMapped: "10.0.0.9:51820", startAt: 0, deadlineMs: 1_000, maxProbes: 3 });
    s.markSent(0); s.markSent(1); s.markSent(2);
    expect(verdict(s, 1_500)).toBe("refused");
  });
  test("expired past deadline with probes still pending", () => {
    const s = createSession({ role: "responder", peerMapped: "10.0.0.4:40000", startAt: 0, deadlineMs: 1_000, maxProbes: 5 });
    expect(verdict(s, 2_000)).toBe("expired");
  });
  test("two-sided composition: both sides open through a simulated lossy channel", () => {
    // deterministic fake channel: delivers every 2nd probe, latency 20ms
    const mk = (role: "initiator" | "responder") =>
      createSession({ role, peerMapped: role === "initiator" ? "10.0.0.2:1111" : "10.0.0.1:2222", startAt: 0, deadlineMs: 30_000, maxProbes: 8 });
    const A = mk("initiator");
    const B = mk("responder");
    const planA = planProbes({ seed: 99, count: 8, baseMs: 50, jitterMs: 10, startAt: 0 });
    const planB = planProbes({ seed: 98, count: 8, baseMs: 50, jitterMs: 10, startAt: 0 });
    let t = 0;
    for (let i = 0; i < 8 && verdict(A, t) === "pending" && verdict(B, t) === "pending"; i++) {
      t = Math.min(planA[i].at, planB[i].at) + 20;
      if (i % 2 === 0) { A.onEvent({ from: "peer", at: t }); B.onEvent({ from: "peer", at: t }); }
      A.markSent(i); B.markSent(i);
    }
    expect(verdict(A, t)).toBe("open");
    expect(verdict(B, t)).toBe("open");
  });
});

// ── pcp.ts: RFC 6887 wire codec ─────────────────────────────────────────────
describe("PCP MAP codec (RFC 6887)", () => {
  test("MAP request bytes: ver=2 op=1 lifetime and client ip at spec offsets", () => {
    const req = buildPcpMapRequest({
      lifetimeSec: 3600,
      clientIp: "192.168.1.50",
      nonce: Buffer.alloc(12, 0xab),
      protocol: 17, // UDP
      internalPort: 51820,
      suggestedExternalPort: 51820,
      suggestedExternalIp: "0.0.0.0",
    });
    expect(req.length).toBe(60); // 24 header + 36 map payload
    expect(req[0]).toBe(2); // version
    expect(req[1]).toBe(PCP_OPCODE_MAP); // MAP
    expect(req.readUInt32BE(4)).toBe(3600); // requested lifetime
    expect(req.readUInt32BE(24)).toBe(0xabababab); // nonce echo offset 24 (12B nonce at 24..36)
    expect(req[36]).toBe(17); // protocol
    expect(req.readUInt16BE(40)).toBe(51820); // internal port
    expect(req.readUInt16BE(42)).toBe(51820); // suggested external port
  });
  test("roundtrip: response built then parsed preserves fields", () => {
    const resp = buildPcpMapResponse({
      lifetimeSec: 7200, epochSec: 12345, clientIp: "192.168.1.50",
      nonce: Buffer.alloc(12, 0xcd), protocol: 6, internalPort: 8080,
      assignedExternalPort: 40000, assignedExternalIp: "203.0.113.7",
    });
    const parsed = parsePcpResponse(resp);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.op).toBe(PCP_OPCODE_MAP);
      expect(parsed.result).toBe(PCP_RESULT_SUCCESS);
      expect(parsed.lifetimeSec).toBe(7200);
      expect(parsed.epochSec).toBe(12345);
      expect(parsed.assignedExternalPort).toBe(40000);
      expect(parsed.assignedExternalIp).toBe("203.0.113.7");
    }
  });
  test("nonce echo enforcement: mismatched nonce → error verdict (fail-closed)", () => {
    const nonce = Buffer.alloc(12, 0x11);
    const resp = buildPcpMapResponse({
      lifetimeSec: 60, epochSec: 1, clientIp: "10.0.0.1",
      nonce: Buffer.alloc(12, 0x22), protocol: 17, internalPort: 1,
      assignedExternalPort: 1, assignedExternalIp: "1.2.3.4",
    });
    const parsed = parsePcpResponse(resp, nonce);
    expect(parsed.ok).toBe(false);
  });
  test("server cannot grant more lifetime than requested (clamp law)", () => {
    const req = buildPcpMapRequest({
      lifetimeSec: 120, clientIp: "192.168.1.50", nonce: Buffer.alloc(12, 3),
      protocol: 17, internalPort: 1000, suggestedExternalPort: 0, suggestedExternalIp: "0.0.0.0",
    });
    const greedy = buildPcpMapResponse({
      lifetimeSec: 99_999, epochSec: 5, clientIp: "192.168.1.50",
      nonce: Buffer.alloc(12, 3), protocol: 17, internalPort: 1000,
      assignedExternalPort: 1000, assignedExternalIp: "198.51.100.9",
    });
    const parsed = parsePcpResponse(greedy, Buffer.alloc(12, 3), 120);
    expect(parsed.ok).toBe(false); // lifetime inflation refused
  });
});

// ── pmp-client.ts: RFC 6886 client plan + response parse ───────────────────
describe("NAT-PMP retry plan", () => {
  test("deterministic, doubling backoff, capped at 9000ms, jitter-bounded", () => {
    const a = pmpRetryPlan({ attempts: 9, baseMs: 250, capMs: 9000, seed: 5, startAt: 0 });
    const b = pmpRetryPlan({ attempts: 9, baseMs: 250, capMs: 9000, seed: 5, startAt: 0 });
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i].at).toBeGreaterThanOrEqual(a[i - 1].at);
    // nominal backoff 250,500,1000,2000,4000,8000,9000(cap),9000,9000
    const nominal = [250, 500, 1000, 2000, 4000, 8000, 9000, 9000, 9000];
    for (let i = 0; i < a.length; i++) {
      expect(a[i].at).toBeGreaterThanOrEqual(nominal[i]);
      expect(a[i].at).toBeLessThanOrEqual(nominal[i] * 1.2); // ≤ +20% jitter
    }
  });
});

describe("NAT-PMP response parse", () => {
  test("public-address response parses ip", () => {
    const buf = Buffer.alloc(12);
    buf[0] = 0; buf[1] = 128 + 1; // response bit set by server convention (op|0x80) — some gateways echo plain op; parser accepts both
    buf.writeUInt16BE(0, 2); // result 0
    buf.writeUInt32BE(777, 4); // epoch
    buf.writeUInt32BE(0xc0a80101, 8); // 192.168.1.1
    const r = parsePmpResponse(buf);
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "public-address") { expect(r.ip).toBe("192.168.1.1"); }
  });
  test("map response parses ports + lifetime; result classified", () => {
    const buf = Buffer.alloc(16);
    buf[0] = 0; buf[1] = 2;
    buf.writeUInt16BE(0, 2);
    buf.writeUInt32BE(42, 4);
    buf.writeUInt16BE(51820, 8);
    buf.writeUInt16BE(51821, 10);
    buf.writeUInt32BE(7200, 12);
    const r = parsePmpResponse(buf);
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "map") {
      expect(r.internalPort).toBe(51820);
      expect(r.externalPort).toBe(51821);
      expect(r.lifetimeSec).toBe(7200);
      expect(classifyPmpResult(r.result)).toBe("ok");
    }
  });
  test("every documented result code maps; unknown codes fail-closed", () => {
    expect(classifyPmpResult(PMP_RESULT.SUCCESS)).toBe("ok");
    expect(classifyPmpResult(PMP_RESULT.NOT_AUTHORIZED)).toBe("refused");
    expect(classifyPmpResult(PMP_RESULT.NETWORK_FAILURE)).toBe("retryable");
    expect(classifyPmpResult(PMP_RESULT.OUT_OF_RESOURCES)).toBe("retryable");
    expect(classifyPmpResult(PMP_RESULT.UNSUPPORTED_OPCODE)).toBe("permanent");
    expect(classifyPmpResult(PMP_RESULT.UNSUPPORTED_VERSION)).toBe("permanent");
    expect(classifyPmpResult(199)).toBe("unknown-fail");
  });
  test("truncated response refused (fail-closed, no guesses)", () => {
    expect(parsePmpResponse(Buffer.alloc(6)).ok).toBe(false);
  });
});
