// sovereign-mesh/pcp.ts — PCP RFC 6887 wire codec (MAP opcode), pure core.
// The gateway lane (sovereign-local-rpc-gateway, saos-control-center) owns
// STUN/NAT-PMP-builders/SSDP; PCP was unclaimed — this module owns it.
// Layout (RFC 6887 §7 + §11.1):
//   Request header (24B): Ver(1)=2 | Op(1) | Rsvd(2) | Requested Lifetime(4) | Client IP(16)
//   MAP payload   (36B): Mapping Nonce(12) | Protocol(1) | Rsvd(3) | Internal Port(2)
//                        | Suggested External Port(2) | Suggested External IP(16)
//   Response header (28B): Ver(1)=2 | R|Op(1) | Result Code(1) | Rsvd(1) | Lifetime(4) | Epoch(4) | Client IP(16)
//   MAP response payload (36B): Nonce(12) | Protocol(1) | Rsvd(3) | Internal Port(2)
//                        | Assigned External Port(2) | Assigned External IP(16)

import { isIPv4 } from "node:net";

export const PCP_VERSION = 2;
export const PCP_OPCODE_BASE = 0; // ANNOUNCE
export const PCP_OPCODE_MAP = 1;
export const PCP_OPCODE_PEER = 2;
export const PCP_RESPONSE_BIT = 0x80;
export const PCP_RESULT_SUCCESS = 0;
export const PCP_MAP_REQUEST_LEN = 60;
export const PCP_MAP_RESPONSE_LEN = 64;

function ipToBytes(ip: string): Buffer {
  if (!isIPv4(ip)) throw new Error(`pcp: only IPv4 literals accepted, got ${JSON.stringify(ip)}`);
  const b = Buffer.alloc(16);
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) {
    throw new Error(`pcp: malformed IPv4 ${JSON.stringify(ip)}`);
  }
  b[12] = o[0]; b[13] = o[1]; b[14] = o[2]; b[15] = o[3]; // IPv4-mapped ::ffff:a.b.c.d
  return b;
}

function bytesToIp(b: Buffer, off: number): string {
  // An all-zero v4-mapped tail is "unspecified"; anything else must be v4-mapped form.
  const prefixZero = b.slice(off, off + 12).every((x) => x === 0);
  if (!prefixZero) throw new Error("pcp: external IP is not IPv4-mapped form");
  return `${b[off + 12]}.${b[off + 13]}.${b[off + 14]}.${b[off + 15]}`;
}

export interface PcpMapRequestOpts {
  lifetimeSec: number;
  clientIp: string;
  nonce: Buffer; // 12 bytes
  protocol: number; // 6 TCP / 17 UDP
  internalPort: number;
  suggestedExternalPort: number; // 0 = server chooses
  suggestedExternalIp: string; // "0.0.0.0" = server chooses
}

export function buildPcpMapRequest(o: PcpMapRequestOpts): Buffer {
  if (o.nonce.length !== 12) throw new Error("pcp: mapping nonce must be exactly 12 bytes");
  if (!Number.isInteger(o.lifetimeSec) || o.lifetimeSec <= 0 || o.lifetimeSec > 0xffffffff) {
    throw new Error("pcp: lifetimeSec out of range");
  }
  if (o.protocol !== 6 && o.protocol !== 17) throw new Error("pcp: protocol must be 6 (TCP) or 17 (UDP)");
  if (!Number.isInteger(o.internalPort) || o.internalPort < 0 || o.internalPort > 65535) throw new Error("pcp: internalPort out of range");
  if (!Number.isInteger(o.suggestedExternalPort) || o.suggestedExternalPort < 0 || o.suggestedExternalPort > 65535) {
    throw new Error("pcp: suggestedExternalPort out of range");
  }
  const buf = Buffer.alloc(PCP_MAP_REQUEST_LEN);
  buf[0] = PCP_VERSION;
  buf[1] = PCP_OPCODE_MAP;
  buf.writeUInt32BE(o.lifetimeSec, 4);
  ipToBytes(o.clientIp).copy(buf, 8);
  o.nonce.copy(buf, 24);
  buf[36] = o.protocol;
  buf.writeUInt16BE(o.internalPort, 40);
  buf.writeUInt16BE(o.suggestedExternalPort, 42);
  ipToBytes(o.suggestedExternalIp).copy(buf, 44);
  return buf;
}

export interface PcpMapResponseOpts {
  lifetimeSec: number;
  epochSec: number;
  clientIp: string;
  nonce: Buffer;
  protocol: number;
  internalPort: number;
  assignedExternalPort: number;
  assignedExternalIp: string;
  result?: number; // default SUCCESS
}

export function buildPcpMapResponse(o: PcpMapResponseOpts): Buffer {
  if (o.nonce.length !== 12) throw new Error("pcp: mapping nonce must be exactly 12 bytes");
  const buf = Buffer.alloc(PCP_MAP_RESPONSE_LEN);
  buf[0] = PCP_VERSION;
  buf[1] = PCP_OPCODE_MAP | PCP_RESPONSE_BIT;
  buf[2] = o.result ?? PCP_RESULT_SUCCESS;
  buf.writeUInt32BE(o.lifetimeSec, 4);
  buf.writeUInt32BE(o.epochSec, 8);
  ipToBytes(o.clientIp).copy(buf, 12);
  o.nonce.copy(buf, 28);
  buf[40] = o.protocol;
  buf.writeUInt16BE(o.internalPort, 44);
  buf.writeUInt16BE(o.assignedExternalPort, 46);
  ipToBytes(o.assignedExternalIp).copy(buf, 48);
  return buf;
}

export type PcpParseResult =
  | {
      ok: true;
      op: number;
      result: number;
      lifetimeSec: number;
      epochSec: number;
      assignedExternalPort: number;
      assignedExternalIp: string;
    }
  | { ok: false; reason: string; result?: number };

/**
 * Parse a PCP MAP response. Fail-closed laws:
 * - version must be 2, response bit must be set, buffer must be exactly 64B
 * - if `expectedNonce` given: the server MUST echo it byte-exact (RFC 6887 §11.1) — mismatch refused
 * - if `requestedLifetimeSec` given: a server granting MORE than requested is refused (clamp law)
 */
export function parsePcpResponse(buf: Buffer, expectedNonce?: Buffer, requestedLifetimeSec?: number): PcpParseResult {
  if (buf.length !== PCP_MAP_RESPONSE_LEN) return { ok: false, reason: `pcp: response must be ${PCP_MAP_RESPONSE_LEN}B, got ${buf.length}` };
  if (buf[0] !== PCP_VERSION) return { ok: false, reason: `pcp: unknown version ${buf[0]}` };
  if ((buf[1] & PCP_RESPONSE_BIT) === 0) return { ok: false, reason: "pcp: not a response (R bit clear)" };
  const result = buf[2];
  if (result !== PCP_RESULT_SUCCESS) return { ok: false, reason: `pcp: server result code ${result}`, result };
  if (expectedNonce && !buf.slice(28, 40).equals(expectedNonce)) return { ok: false, reason: "pcp: mapping nonce echo mismatch", result };
  const lifetimeSec = buf.readUInt32BE(4);
  if (requestedLifetimeSec !== undefined && lifetimeSec > requestedLifetimeSec) {
    return { ok: false, reason: `pcp: lifetime inflation ${lifetimeSec} > requested ${requestedLifetimeSec}`, result };
  }
  let assignedExternalIp: string;
  try {
    assignedExternalIp = bytesToIp(buf, 48);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "pcp: bad external ip", result };
  }
  return {
    ok: true,
    op: buf[1] & ~PCP_RESPONSE_BIT,
    result,
    lifetimeSec,
    epochSec: buf.readUInt32BE(8),
    assignedExternalPort: buf.readUInt16BE(46),
    assignedExternalIp,
  };
}
