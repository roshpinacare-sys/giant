// sovereign-mesh/mesh.ts — local peer registry: deterministic ed25519 node
// identity + capability-announcing registry with lease liveness (injected clock).
// Pure core, zero deps, zero I/O, zero Date.now (injected `now` only — the
// fleet's state-clock law for deterministic cores).
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

// PKCS8 DER wrapper for an Ed25519 private key whose raw seed is `seed`:
// SEQUENCE { INTEGER 0, SEQUENCE { OID 1.3.101.112 }, OCTET STRING { seed } }
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface MeshIdentity {
  nodeId: string; // sha256 hex of the raw 32-byte ed25519 public key
  publicKeyRaw: Buffer; // 32 bytes
  privateKeyDer: Buffer; // pkcs8 (only ever held locally, never announced)
}

export function createIdentity(seed: string): MeshIdentity {
  // Deterministic: the seed IS the ed25519 private key material (32 bytes via sha256).
  const seedBuf = createHash("sha256").update(`sovereign-mesh-identity\0${seed}`).digest();
  const pk = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seedBuf]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(pk);
  const pubRaw = pub.export({ format: "der", type: "spki" }).slice(-32) as Buffer;
  const nodeId = createHash("sha256").update(pubRaw).digest("hex");
  return { nodeId, publicKeyRaw: pubRaw, privateKeyDer: pk.export({ format: "der", type: "pkcs8" }) as Buffer };
}

export interface MeshPeer {
  nodeId: string;
  capabilities: string[];
  joinedAt: number; // ms, injected clock
  leaseUntil: number; // ms, injected clock; expired ⇔ now >= leaseUntil
}

const MAX_PEERS = 512; // registry bound: fail-closed, no unbounded memory growth
const MAX_CAPS = 16;

export class MeshRegistry {
  private peers = new Map<string, MeshPeer>();

  join(nodeId: string, capabilities: string[], now: number, leaseMs: number): MeshPeer {
    if (!Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw new Error("mesh: join requires finite now and positive leaseMs");
    }
    if (this.peers.size >= MAX_PEERS && !this.peers.has(nodeId)) {
      this.evictExpired(now);
      if (this.peers.size >= MAX_PEERS) throw new Error("mesh: registry full");
    }
    const caps = [...new Set(capabilities)].slice(0, MAX_CAPS).sort();
    const existing = this.peers.get(nodeId);
    const peer: MeshPeer = existing
      ? { nodeId, capabilities: caps, joinedAt: existing.joinedAt, leaseUntil: now + leaseMs }
      : { nodeId, capabilities: caps, joinedAt: now, leaseUntil: now + leaseMs };
    this.peers.set(nodeId, peer);
    return peer;
  }

  /** Refresh lease + upgrade capabilities for a KNOWN node. Unknown nodes are refused (join-only law). */
  announce(nodeId: string, capabilities: string[], now: number, leaseMs: number): boolean {
    const existing = this.peers.get(nodeId);
    if (!existing) return false;
    if (now >= existing.leaseUntil) return false; // expired membership cannot self-announce; must re-join
    this.peers.set(nodeId, this.join(nodeId, capabilities, now, leaseMs));
    return true;
  }

  /** Peers with a live lease at `now` (expiry is exact: alive(now) ⇔ now < leaseUntil). */
  alive(now: number): MeshPeer[] {
    const out: MeshPeer[] = [];
    for (const p of this.peers.values()) if (now < p.leaseUntil) out.push(p);
    return out.sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1));
  }

  withCapability(capability: string, now: number): MeshPeer[] {
    return this.alive(now).filter((p) => p.capabilities.includes(capability));
  }

  quorum(k: number, now: number): boolean {
    return this.alive(now).length >= k;
  }

  get(nodeId: string): MeshPeer | undefined {
    return this.peers.get(nodeId);
  }

  size(): number {
    return this.peers.size;
  }

  private evictExpired(now: number): void {
    for (const [id, p] of this.peers) if (now >= p.leaseUntil) this.peers.delete(id);
  }
}
