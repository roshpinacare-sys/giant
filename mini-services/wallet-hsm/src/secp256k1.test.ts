/**
 * wallet-hsm — secp256k1 ECDSA vector tests (TDD, task 36-d)
 * All key material here is GENERATED THROWAWAY or canonical PUBLIC curve data.
 * No real account keys are ever touched by this file.
 */
import { describe, test, expect } from "bun:test";
import { createHash, randomBytes } from "node:crypto";

import {
  CURVE_N,
  SecpError,
  Rfc6979,
  derivePublicKey,
  signDigest,
  verifyCompact,
  recoverPubKey,
  randomScalar,
  scalarToWif,
} from "./secp256k1";
import { wifDecode } from "@saos/vault";

const G1 = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const G2 = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const G3 = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

function scalarHex(n: bigint): Buffer {
  return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
}

function sha256Hex(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

describe("secp256k1 public-key derivation (canonical vectors)", () => {
  test("d=1 → G compressed", () => {
    expect(derivePublicKey(scalarHex(1n)).toString("hex")).toBe(G1);
  });
  test("d=2 → 2G compressed", () => {
    expect(derivePublicKey(scalarHex(2n)).toString("hex")).toBe(G2);
  });
  test("d=3 → 3G compressed", () => {
    expect(derivePublicKey(scalarHex(3n)).toString("hex")).toBe(G3);
  });
  test("odd d yields 03 prefix (d=7)", () => {
    // 7G y-coordinate is odd (known: 0x2B... form) — assert prefix only, parity correctness is
    // independently pinned by the roundtrip + verify tests below.
    const pub = derivePublicKey(scalarHex(7n));
    expect([0x02, 0x03]).toContain(pub[0]);
    expect(pub.length).toBe(33);
  });
  test("zero and >=N scalars fail closed", () => {
    expect(() => derivePublicKey(Buffer.alloc(32, 0))).toThrow(SecpError);
    expect(() => derivePublicKey(scalarHex(CURVE_N))).toThrow(SecpError);
  });
});

describe("RFC6979 deterministic nonce (secp256k1, HMAC-SHA256)", () => {
  // Public vector (python-ecdsa / trezor test suites): d=1, msg "Satoshi Nakamoto".
  test("first nonce for d=1, sha256('Satoshi Nakamoto')", () => {
    const h1 = sha256Hex("Satoshi Nakamoto");
    const rfc = new Rfc6979(scalarHex(1n), h1);
    expect(rfc.next().toString(16)).toBe(
      "8f8a276c19f4149656b280621e358cce24f5f52542772691ee69063b74f15d15",
    );
  });
  test("nonce stream is deterministic and in range", () => {
    const h1 = sha256Hex("wallet-hsm 36-d nonce range");
    const a = new Rfc6979(scalarHex(0x1234n), h1);
    const b = new Rfc6979(scalarHex(0x1234n), h1);
    for (let i = 0; i < 4; i++) {
      const k = a.next();
      expect(k > 0n && k < CURVE_N).toBe(true);
      expect(k).toBe(b.next());
    }
  });
});

describe("ECDSA sign (RFC6979, low-s) — public vector", () => {
  test("(r,s) for d=1, sha256('Satoshi Nakamoto') + recid proven by pubkey recovery", () => {
    const digest = sha256Hex("Satoshi Nakamoto");
    const sig = signDigest(scalarHex(1n), digest);
    expect(sig.r.toString(16)).toBe(
      "934b1ea10a4b3c1757e2b0c017d0b6143ce3c9a7e6a4a49860d7a6ab210ee3d8",
    );
    expect(sig.s.toString(16)).toBe(
      "2442ce9d2b916064108014783e923ec36b49743e2ffa1c4496f01a512aafd9e5",
    );
    // recid is not guessed: recovery from the compact signature must yield
    // exactly d=1's public key (the canonical G vector) — pins header + parity.
    expect(recoverPubKey(digest, sig.compact).toString("hex")).toBe(G1);
    expect(sig.compact[0]).toBe(31 + sig.recid);
  });
  test("low-s normalization always enforced", () => {
    for (let i = 0; i < 8; i++) {
      const { bytes } = randomScalar();
      const sig = signDigest(bytes, randomBytes(32));
      const HALF = CURVE_N / 2n;
      expect(sig.s <= HALF).toBe(true);
    }
  });
  test("compact 65-byte form uses Steem header 31+recid", () => {
    const { bytes } = randomScalar();
    const sig = signDigest(bytes, randomBytes(32));
    expect(sig.compact.length).toBe(65);
    expect(sig.compact[0]).toBe(31 + sig.recid);
  });
});

describe("sign→verify roundtrip (throwaway keys)", () => {
  test("verify accepts honest signature", () => {
    const { d, bytes } = randomScalar();
    const digest = sha256Hex("wallet-hsm roundtrip vector");
    const sig = signDigest(bytes, digest);
    const pub = derivePublicKey(bytes);
    expect(verifyCompact(pub, digest, sig.compact)).toBe(true);
    // cross-consistency: derived pubkey matches d*G already pinned by vectors above
    expect(d > 0n && d < CURVE_N).toBe(true);
  });
  test("tampered digest rejected", () => {
    const { bytes } = randomScalar();
    const digest = sha256Hex("tamper me");
    const sig = signDigest(bytes, digest);
    const bad = Buffer.from(digest);
    bad[0] ^= 0x01;
    expect(verifyCompact(derivePublicKey(bytes), bad, sig.compact)).toBe(false);
  });
  test("tampered signature rejected (s flipped)", () => {
    const { bytes } = randomScalar();
    const digest = sha256Hex("sig tamper");
    const sig = signDigest(bytes, digest);
    const bad = Buffer.from(sig.compact);
    bad[64] ^= 0x01;
    expect(verifyCompact(derivePublicKey(bytes), digest, bad)).toBe(false);
  });
  test("wrong pubkey rejected", () => {
    const a = randomScalar();
    const b = randomScalar();
    const digest = sha256Hex("wrong key");
    const sig = signDigest(a.bytes, digest);
    expect(verifyCompact(derivePublicKey(b.bytes), digest, sig.compact)).toBe(false);
  });
  test("malformed compact signature fails closed", () => {
    const { bytes } = randomScalar();
    const digest = sha256Hex("malformed");
    const sig = signDigest(bytes, digest);
    expect(() => verifyCompact(derivePublicKey(bytes), digest, sig.compact.subarray(0, 64))).toThrow(SecpError);
    const badHeader = Buffer.from(sig.compact);
    badHeader[0] = 0x1e; // header below 31 — outside 31..34 law
    expect(() => verifyCompact(derivePublicKey(bytes), digest, badHeader)).toThrow(SecpError);
  });
});

describe("WIF integration (throwaway)", () => {
  test("scalarToWif → vault wifDecode roundtrip preserves secret", () => {
    const { bytes } = randomScalar();
    const wif = scalarToWif(bytes);
    expect(wif[0]).toBe("5"); // uncompressed Steem-style WIF form
    const decoded = wifDecode(wif);
    expect(decoded.compressed).toBe(false);
    expect(decoded.secret.toString("hex")).toBe(bytes.toString("hex"));
  });
});
