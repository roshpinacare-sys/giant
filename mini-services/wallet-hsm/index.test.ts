/**
 * wallet-hsm — service TDD suite (task 36-d, bun:test)
 * ALL key material here is GENERATED THROWAWAY (randomScalar at module load).
 * Tests never read /home/z/.secrets — envFile/tokenFile are stubbed to {} / null.
 */
import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openVault, wifDecode } from "./src/vault";
import { randomScalar, scalarToWif, derivePublicKey, verifyCompact } from "./src/secp256k1";
import { startApp, type AppHandle } from "./index";

// ── throwaway material (never real) ────────────────────────────────────────
const TEST_SCALAR = randomScalar();
const TEST_WIF = scalarToWif(TEST_SCALAR.bytes);
const TEST_TOKEN = "hsm-test-token-" + randomBytes(16).toString("hex");
const TEST_MASTER = randomBytes(32).toString("hex"); // throwaway vault master

function testEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    WALLET_HSM_TEST_WIF: TEST_WIF,
    VAULT_TOKEN: TEST_TOKEN,
    SAOS_VAULT_MASTER_KEY: TEST_MASTER,
    ...extra,
  };
}

async function boot(opts: {
  env?: Record<string, string>;
  tokenFile?: string | null;
}): Promise<AppHandle & { lines: string[] }> {
  const lines: string[] = [];
  const h = await startApp({
    port: 0, // ephemeral — never collide with the live :3062 service
    stateDir: mkdtempSync(join(tmpdir(), "wallet-hsm-test-")),
    envSource: opts.env ?? testEnv(),
    envFile: {}, // tests NEVER read the real secrets file
    tokenFile: opts.tokenFile ?? null,
    log: (l) => lines.push(l),
  });
  return { ...h, lines, stop: h.stop };
}

function get(h: AppHandle, path: string, token?: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${h.port}${path}`, {
    headers: token ? { "x-vault-token": token } : {},
  });
}

function post(h: AppHandle, path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${h.port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-vault-token": token } : {}) },
    body: JSON.stringify(body),
  });
}

const stopped: AppHandle[] = [];
afterAll(() => {
  for (const s of stopped) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
});

// ── 1. envelope roundtrip (generated throwaway key) ────────────────────────
describe("envelope vault roundtrip (@saos/vault via file: dep)", () => {
  test("seal → withKey roundtrip, zeroize after, redaction at rest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wallet-hsm-env-"));
    const prev = process.env.SAOS_VAULT_MASTER_KEY;
    process.env.SAOS_VAULT_MASTER_KEY = randomBytes(32).toString("hex");
    try {
      const vault = await openVault({ dir });
      await vault.sealKey({ id: "test/wif", type: "secp256k1-wif", material: TEST_WIF });

      let rawRef: Buffer | null = null;
      let copy: Buffer;
      const pub = await vault.withKey("test/wif", (k) => {
        copy = Buffer.from(k.material); // intact copy for later assertions
        rawRef = k.material; // same object withKey will zeroize
        return derivePublicKey(k.material);
      });
      // withKey zeroize law: the unsealed buffer is zero-filled after the callback settles
      expect(rawRef!.every((b) => b === 0)).toBe(true);
      // roundtrip: the copy still proves the envelope held the right secret
      expect(pub.toString("hex")).toBe(derivePublicKey(copy!).toString("hex"));
      expect(wifDecode(TEST_WIF).secret.toString("hex")).toBe(copy!.toString("hex"));

      // redaction: the at-rest store never contains the WIF string
      const store = await Bun.file(join(dir, "keys.enc")).text();
      expect(store).not.toContain(TEST_WIF);
      expect(store).not.toContain(copy!.toString("hex"));
    } finally {
      process.env.SAOS_VAULT_MASTER_KEY = prev;
    }
  });
});

// ── 2. armed service: sign-verify with throwaway WIF via env override ──────
describe("armed service (WALLET_HSM_TEST_WIF override)", () => {
  let h!: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    h = await boot({});
    stopped.push(h);
  });

  test("binds loopback only, mode armed", () => {
    expect(h.host).toBe("127.0.0.1");
    expect(h.mode).toBe("armed");
  });

  test("health: armed, zero secrets in body", async () => {
    const res = await get(h, "/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("armed");
    expect(body.signEnabled).toBe(true);
    expect(body.loopbackOnly).toBe(true);
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.tokenConfigured).toBe(true);
    // zero secrets: no WIF, no scalar hex, no token anywhere in the body
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(TEST_WIF);
    expect(raw).not.toContain(TEST_SCALAR.bytes.toString("hex"));
    expect(raw).not.toContain(TEST_TOKEN);
  });

  test("pubkeys (token): fingerprints only, sha256[:16] of compressed pubkey", async () => {
    const res = await get(h, "/pubkeys", TEST_TOKEN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    const active = body.keys.find((k) => k.authority === "active");
    expect(active?.loaded).toBe(true);
    const expected = createHash("sha256")
      .update(derivePublicKey(TEST_SCALAR.bytes))
      .digest("hex")
      .slice(0, 16);
    expect(active?.fingerprint).toBe(expected);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(TEST_WIF);
    expect(raw).not.toContain(TEST_TOKEN);
  });

  test("sign → verify roundtrip over HTTP with throwaway WIF", async () => {
    const digest = createHash("sha256").update("wallet-hsm live-fire digest", "utf8").digest();
    const res = await post(
      h,
      "/sign",
      { account: "test-account", txDigestHex: digest.toString("hex") },
      TEST_TOKEN,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signature: string;
      recid: number;
      algorithm: string;
    };
    expect(body.algorithm).toContain("ecdsa-secp256k1");
    const sig = Buffer.from(body.signature, "hex");
    expect(sig.length).toBe(65);
    expect(sig[0]).toBe(31 + body.recid);
    expect(verifyCompact(derivePublicKey(TEST_SCALAR.bytes), digest, sig)).toBe(true);
    const tampered = Buffer.from(digest);
    tampered[0] ^= 1;
    expect(verifyCompact(derivePublicKey(TEST_SCALAR.bytes), tampered, sig)).toBe(false);
  });

  test("sign: 403 without token; 403 with wrong token", async () => {
    const digest = randomBytes(32).toString("hex");
    expect((await post(h, "/sign", { account: "test-account", txDigestHex: digest })).status).toBe(403);
    expect(
      (await post(h, "/sign", { account: "test-account", txDigestHex: digest }, "wrong-token")).status,
    ).toBe(403);
    expect((await get(h, "/pubkeys")).status).toBe(403);
    expect((await get(h, "/pubkeys", "wrong-token")).status).toBe(403);
  });

  test("sign: 403 body carries the deny-by-default law marker", async () => {
    const res = await post(h, "/sign", { account: "test-account", txDigestHex: randomBytes(32).toString("hex") });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("vault-token-required");
    expect(body.law).toBe("deny-by-default/1");
  });

  test("sign: 400 malformed digest, 404 unknown account", async () => {
    expect(
      (await post(h, "/sign", { account: "test-account", txDigestHex: "zz" }, TEST_TOKEN)).status,
    ).toBe(400);
    expect(
      (await post(h, "/sign", { account: "no-such", txDigestHex: randomBytes(32).toString("hex") }, TEST_TOKEN))
        .status,
    ).toBe(404);
  });

  test("logs carry zero secret material (canary scan)", () => {
    const joined = h.lines.join("\n");
    expect(joined).not.toContain(TEST_WIF);
    expect(joined).not.toContain(TEST_SCALAR.bytes.toString("hex"));
    expect(joined).not.toContain(TEST_TOKEN);
    expect(joined).toContain("DENY"); // the 403s above were loudly logged
  });
});

// ── 3. sealed mode: kill switch ⇒ /sign 503 ────────────────────────────────
describe("sealed mode (WALLET_HSM_SEALED=1 kill switch)", () => {
  let h!: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    h = await boot({ env: testEnv({ WALLET_HSM_SEALED: "1" }) });
    stopped.push(h);
  });

  test("health reports sealed, signEnabled false", async () => {
    const res = await get(h, "/health");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("sealed");
    expect(body.signEnabled).toBe(false);
  });

  test("sign with VALID token still 503 (fail-closed, never open)", async () => {
    const res = await post(
      h,
      "/sign",
      { account: "test-account", txDigestHex: randomBytes(32).toString("hex") },
      TEST_TOKEN,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("sealed");
    expect(body.law).toBe("fail-closed/1");
  });

  test("pubkeys with token still served (status sealed, fingerprints only)", async () => {
    const res = await get(h, "/pubkeys", TEST_TOKEN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("sealed");
  });
});

// ── 4. sealed mode: no token configured ⇒ deny everything but /health ─────
describe("sealed mode (no token configured — fail-closed, never open)", () => {
  let h!: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    h = await boot({ env: { WALLET_HSM_TEST_WIF: TEST_WIF }, tokenFile: null });
    stopped.push(h);
  });

  test("health reports sealed + tokenConfigured false", async () => {
    const res = await get(h, "/health");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("sealed");
    expect(body.tokenConfigured).toBe(false);
  });

  test("any token on /pubkeys or /sign is denied (no expected token exists)", async () => {
    expect((await get(h, "/pubkeys", "any-guess")).status).toBe(403);
    expect(
      (
        await post(h, "/sign", { account: "test-account", txDigestHex: randomBytes(32).toString("hex") }, "any-guess")
      ).status,
    ).toBe(403);
  });
});

// ── 5. bearer fallback + unknown route ─────────────────────────────────────
describe("token semantics mirror giant vault-auth (69144ce)", () => {
  let h!: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    h = await boot({});
    stopped.push(h);
  });

  test("Authorization: Bearer accepted as fallback", async () => {
    const res = await fetch(`http://127.0.0.1:${h.port}/pubkeys`, {
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
  });

  test("unknown route with valid token → 404, without token → 403", async () => {
    expect((await get(h, "/nope", TEST_TOKEN)).status).toBe(404);
    expect((await get(h, "/nope")).status).toBe(403);
  });
});
