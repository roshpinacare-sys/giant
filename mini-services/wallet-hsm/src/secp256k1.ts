/**
 * wallet-hsm — zero-dependency secp256k1 ECDSA (task 36-d)
 * ========================================================
 * ECDSA sign/verify over 32-byte digests with deterministic RFC6979 nonces
 * (HMAC-SHA256), low-s normalization, and the 65-byte compact form
 * [31+recid ‖ r ‖ s] — the header convention verified against real chain
 * bytes by Saosmartwallet M0 ("header חתימה = 31+recid", README).
 *
 * WHY HAND-ROLLED, AND WHY THAT IS BOUNDED RISK:
 *   The fleet mini-service law is zero third-party deps + node:crypto only
 *   (vault-auth 69144ce, fx-fixedfloat). packages/crypto's @noble signers are
 *   not usable here without dragging an uninstalled dependency tree into the
 *   HSM runtime. Correctness is therefore PINNED by public test vectors
 *   (src/secp256k1.test.ts): compressed pubkeys for d=1/2/3, the RFC6979
 *   nonce vector (d=1, sha256("Satoshi Nakamoto")), its full (r,s) signature
 *   vector (python-ecdsa / trezor suites), and sign→verify roundtrips with
 *   tamper rejection. No randomness is consumed at signing time — the nonce
 *   is a pure function of (key, digest), so there is no RNG failure mode.
 *
 * SECRETS LAW: callers pass 32-byte scalars in memory; nothing here logs,
 * stores, or transmits key material. BigInt values are immutable in JS —
 * zeroization of derived scalars is best-effort at the vault layer (withKey).
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

/** Field prime p = 2^256 − 2^32 − 977. */
export const CURVE_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
/** Group order n. */
export const CURVE_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = CURVE_N / 2n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

export class SecpError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SecpError";
  }
}

// ── modular arithmetic ─────────────────────────────────────────────────────
function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

function powMod(base: bigint, exp: bigint, m: bigint): bigint {
  let r = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

/** Modular inverse via Fermat (m prime). */
function invMod(a: bigint, m: bigint): bigint {
  return powMod(a, m - 2n, m);
}

// ── Jacobian point arithmetic (a = 0 curve) ────────────────────────────────
interface Jac {
  x: bigint;
  y: bigint;
  z: bigint;
}
const J_ZERO: Jac = { x: 0n, y: 1n, z: 0n };
const J_G: Jac = { x: GX, y: GY, z: 1n };

function jDouble(p: Jac): Jac {
  if (p.z === 0n || p.y === 0n) return J_ZERO;
  const Ysq = (p.y * p.y) % CURVE_P;
  const S = (4n * p.x * Ysq) % CURVE_P;
  const M = (3n * p.x * p.x) % CURVE_P;
  const X3 = mod(M * M - 2n * S, CURVE_P);
  const Y3 = mod(M * (S - X3) - 8n * Ysq * Ysq, CURVE_P);
  const Z3 = mod(2n * p.y * p.z, CURVE_P);
  return { x: X3, y: Y3, z: Z3 };
}

function jAdd(p: Jac, q: Jac): Jac {
  if (p.z === 0n) return q;
  if (q.z === 0n) return p;
  const Z1Z1 = (p.z * p.z) % CURVE_P;
  const Z2Z2 = (q.z * q.z) % CURVE_P;
  const U1 = (p.x * Z2Z2) % CURVE_P;
  const U2 = (q.x * Z1Z1) % CURVE_P;
  const S1 = (p.y * Z2Z2 % CURVE_P * q.z) % CURVE_P;
  const S2 = (q.y * Z1Z1 % CURVE_P * p.z) % CURVE_P;
  if (U1 === U2) {
    return S1 === S2 ? jDouble(p) : J_ZERO;
  }
  const H = mod(U2 - U1, CURVE_P);
  const R = mod(S2 - S1, CURVE_P);
  const H2 = (H * H) % CURVE_P;
  const H3 = (H2 * H) % CURVE_P;
  const U1H2 = (U1 * H2) % CURVE_P;
  const X3 = mod(R * R - H3 - 2n * U1H2, CURVE_P);
  const Y3 = mod(R * (U1H2 - X3) - S1 * H3, CURVE_P);
  const Z3 = mod(H * p.z * q.z, CURVE_P);
  return { x: X3, y: Y3, z: Z3 };
}

function jMul(p: Jac, k: bigint): Jac {
  let r = J_ZERO;
  let a = p;
  for (let i = 255n; i >= 0n; i--) {
    r = jDouble(r);
    if ((k >> i) & 1n) r = jAdd(r, a);
  }
  return r;
}

function jNeg(p: Jac): Jac {
  return { x: p.x, y: mod(-p.y, CURVE_P), z: p.z };
}

function jToAffine(p: Jac): { x: bigint; y: bigint } {
  if (p.z === 0n) throw new SecpError("point at infinity");
  const zinv = invMod(p.z, CURVE_P);
  const zinv2 = (zinv * zinv) % CURVE_P;
  const zinv3 = (zinv2 * zinv) % CURVE_P;
  return { x: (p.x * zinv2) % CURVE_P, y: (p.y * zinv3) % CURVE_P };
}

// ── scalar / byte helpers ──────────────────────────────────────────────────
function scalarFromBytes(bytes: Buffer): bigint {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) {
    throw new SecpError("scalar must be exactly 32 bytes");
  }
  const d = BigInt(`0x${bytes.toString("hex")}`);
  if (d === 0n || d >= CURVE_N) {
    throw new SecpError("scalar out of range (0 < d < n)");
  }
  return d;
}

function be32(v: bigint): Buffer {
  return Buffer.from(v.toString(16).padStart(64, "0"), "hex");
}

function digestToInt(digest: Buffer): bigint {
  if (!Buffer.isBuffer(digest) || digest.length === 0 || digest.length > 32) {
    throw new SecpError("digest must be a 1..32 byte Buffer (32 for tx digests)");
  }
  return BigInt(`0x${digest.toString("hex")}`);
}

/** Generates a cryptographically random in-range scalar (throwaway test keys / WIF minting). */
export function randomScalar(): { d: bigint; bytes: Buffer } {
  for (;;) {
    const bytes = Buffer.from(randomBytes(32));
    const d = BigInt(`0x${bytes.toString("hex")}`);
    if (d > 0n && d < CURVE_N) return { d, bytes };
  }
}

/** Encodes a 32-byte scalar as an uncompressed Steem-style WIF (5…, base58check). */
export function scalarToWif(bytes: Buffer): string {
  const payload = Buffer.concat([Buffer.from([0x80]), bytes]);
  const checksum = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4);
  const full = Buffer.concat([payload, checksum]);
  // base58 by hand (zero-dep law)
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt(`0x${full.toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of full) {
    if (b === 0x00) out = "1" + out;
    else break;
  }
  return out;
}

// ── RFC6979 deterministic nonce ────────────────────────────────────────────
function hmac(key: Buffer, parts: Buffer[]): Buffer {
  const h = createHmac("sha256", key);
  for (const p of parts) h.update(p);
  return h.digest();
}

/**
 * RFC6979 §3.2 nonce stream (q = n, hmacalg = HMAC-SHA256, qlen = 256 bits).
 * Deterministic: signing consumes no RNG.
 */
export class Rfc6979 {
  private K: Buffer;
  private V: Buffer;

  constructor(priv: Buffer, h1: Buffer) {
    this.V = Buffer.alloc(32, 0x01);
    this.K = Buffer.alloc(32, 0x00);
    this.K = hmac(this.K, [this.V, Buffer.from([0x00]), priv, h1]);
    this.V = hmac(this.K, [this.V]);
    this.K = hmac(this.K, [this.V, Buffer.from([0x01]), priv, h1]);
    this.V = hmac(this.K, [this.V]);
  }

  next(): bigint {
    for (;;) {
      this.V = hmac(this.K, [this.V]);
      const k = BigInt(`0x${this.V.toString("hex")}`);
      if (k > 0n && k < CURVE_N) return k;
      this.K = hmac(this.K, [this.V, Buffer.from([0x00])]);
      this.V = hmac(this.K, [this.V]);
    }
  }
}

// ── public API ─────────────────────────────────────────────────────────────

/** Compressed 33-byte public key (02/03 prefix) for a 32-byte secret scalar. */
export function derivePublicKey(secret: Buffer): Buffer {
  const d = scalarFromBytes(secret);
  const pt = jToAffine(jMul(J_G, d));
  const prefix = pt.y % 2n === 0n ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), be32(pt.x)]);
}

export interface EcdsaSig {
  r: bigint;
  s: bigint;
  /** Recovery id 0..3 (parity + x≥n). */
  recid: number;
  /** 65-byte compact: [31+recid ‖ r ‖ s] — Steem wire convention. */
  compact: Buffer;
}

/**
 * Signs a 32-byte digest with a 32-byte secret scalar.
 * RFC6979 deterministic nonce, low-s normalized, fail-closed on bad inputs.
 */
export function signDigest(secret: Buffer, digest: Buffer): EcdsaSig {
  const d = scalarFromBytes(secret);
  const z = digestToInt(digest);
  const rfc = new Rfc6979(secret, Buffer.from(digest));
  for (;;) {
    const k = rfc.next();
    const R = jToAffine(jMul(J_G, k));
    const r = R.x % CURVE_N;
    if (r === 0n) continue;
    let s = mod(invMod(k, CURVE_N) * mod(z + r * d, CURVE_N), CURVE_N);
    if (s === 0n) continue;
    let recid = (R.y % 2n === 1n ? 1 : 0) + (R.x >= CURVE_N ? 2 : 0);
    if (s > HALF_N) {
      s = CURVE_N - s;
      recid ^= 1;
    }
    const compact = Buffer.concat([Buffer.from([31 + recid]), be32(r), be32(s)]);
    return { r, s, recid, compact };
  }
}

/**
 * Verifies a 65-byte compact signature ([31+recid ‖ r ‖ s]) over a digest
 * against a compressed public key. Throws SecpError on malformed encodings,
 * returns false on cryptographic mismatch. Fail-closed either way.
 */
export function verifyCompact(pub33: Buffer, digest: Buffer, sig65: Buffer): boolean {
  if (!Buffer.isBuffer(pub33) || pub33.length !== 33) {
    throw new SecpError("public key must be 33-byte compressed");
  }
  if (!Buffer.isBuffer(sig65) || sig65.length !== 65) {
    throw new SecpError("compact signature must be 65 bytes");
  }
  const header = sig65[0];
  if (header < 31 || header > 34) {
    throw new SecpError("compact signature header must be 31..34 (31+recid)");
  }
  // Recover y from the compressed public key (p ≡ 3 mod 4 ⇒ sqrt = a^((p+1)/4))
  const x = BigInt(`0x${pub33.subarray(1).toString("hex")}`);
  if (x >= CURVE_P) throw new SecpError("public key x out of field range");
  const ySq = mod(x * x * x + 7n, CURVE_P);
  let y = powMod(ySq, (CURVE_P + 1n) / 4n, CURVE_P);
  if ((y * y) % CURVE_P !== ySq) return false; // not on curve
  const wantOdd = pub33[0] === 0x03;
  if ((y % 2n === 1n) !== wantOdd) y = CURVE_P - y;
  if (pub33[0] !== 0x02 && pub33[0] !== 0x03) throw new SecpError("bad compressed prefix");

  const r = BigInt(`0x${sig65.subarray(1, 33).toString("hex")}`);
  const s = BigInt(`0x${sig65.subarray(33, 65).toString("hex")}`);
  if (r === 0n || r >= CURVE_N || s === 0n || s >= CURVE_N) return false;
  const z = digestToInt(digest);

  const w = invMod(s, CURVE_N);
  const u1 = mod(z * w, CURVE_N);
  const u2 = mod(r * w, CURVE_N);
  const Q: Jac = { x, y, z: 1n };
  const Rpt = jAdd(jMul(J_G, u1), jMul(Q, u2));
  if (Rpt.z === 0n) return false;
  const pt = jToAffine(Rpt);
  return pt.x % CURVE_N === r;
}

/**
 * Recovers the compressed public key from a 65-byte compact signature over a
 * digest (the Steem-chain verification convention). Throws SecpError when the
 * encoded point is invalid; the recovered key simply will not match the
 * signer's key when the signature is wrong.
 */
export function recoverPubKey(digest: Buffer, sig65: Buffer): Buffer {
  if (!Buffer.isBuffer(sig65) || sig65.length !== 65) {
    throw new SecpError("compact signature must be 65 bytes");
  }
  const header = sig65[0];
  if (header < 31 || header > 34) {
    throw new SecpError("compact signature header must be 31..34 (31+recid)");
  }
  const recid = header - 31;
  const r = BigInt(`0x${sig65.subarray(1, 33).toString("hex")}`);
  const s = BigInt(`0x${sig65.subarray(33, 65).toString("hex")}`);
  if (r === 0n || r >= CURVE_N || s === 0n || s >= CURVE_N) {
    throw new SecpError("signature scalar out of range");
  }
  const x = r + (recid & 2 ? CURVE_N : 0n);
  if (x >= CURVE_P) throw new SecpError("recovered R.x out of field range");
  const ySq = mod(x * x * x + 7n, CURVE_P);
  let y = powMod(ySq, (CURVE_P + 1n) / 4n, CURVE_P);
  if ((y * y) % CURVE_P !== ySq) throw new SecpError("R point is not on the curve");
  const wantOdd = (recid & 1) === 1;
  if ((y % 2n === 1n) !== wantOdd) y = CURVE_P - y;
  const R: Jac = { x, y, z: 1n };
  const z = digestToInt(digest);
  const rInv = invMod(r, CURVE_N);
  // Q = r⁻¹ (sR − zG)
  const Q = jMul(jAdd(jMul(R, s), jNeg(jMul(J_G, z))), rInv);
  const pt = jToAffine(Q);
  const prefix = pt.y % 2n === 0n ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), be32(pt.x)]);
}

/** sha256 fingerprint of a compressed public key, first 16 hex chars (public data only). */
export function pubFingerprint(pub33: Buffer): string {
  return createHash("sha256").update(pub33).digest("hex").slice(0, 16);
}
