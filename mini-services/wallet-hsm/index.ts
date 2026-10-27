/**
 * wallet-hsm — Saosmartwallet production HSM signing runtime (task 36-d)
 * ======================================================================
 * TRANSITION: prototype → ACTIVE production signing organ of the sovereign
 * fleet, deployed on sovereign-runner-kit.
 *
 * LAWS (all fail-closed, all pinned by index.test.ts):
 *  • Bind 127.0.0.1 ONLY. The sandbox gateway can reach any local port from
 *    the public internet (measured, trace 1a173c3929f5d23d) — so binding is
 *    necessary but NOT sufficient.
 *  • DENY-BY-DEFAULT: EVERY route except GET /health requires the vault token
 *    (x-vault-token or Authorization: Bearer), constant-time compared
 *    (sha256 + timingSafeEqual) — semantics mirrored from giant's vault-auth
 *    (commit 69144ce), applied STRICTER: not just gateway-borne mutations.
 *  • No token configured ⇒ SEALED mode: /sign returns 503 forever. The
 *    service never self-mints and never opens.
 *  • WALLET_HSM_SEALED=1 kill switch forces sealed regardless of everything.
 *  • Keys live in the @saos/vault AES-256-GCM envelope store; /sign unseals
 *    via withKey (buffer zero-filled after the callback), signs with the
 *    zero-dep vector-pinned secp256k1 (src/secp256k1.ts), and NEVER returns
 *    or logs key material. Logs carry names, codes, and fingerprints only.
 *  • Ephemeral vault master (no SAOS_VAULT_MASTER_KEY) ⇒ the on-disk store is
 *    per-boot scratch: it is wiped and re-sealed at every boot from live env.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { openVault } from "./src/vault";

import {
  HEX64,
  OWNER_KEYS_NEVER_HOT,
  buildRoster,
  loadEnvFile,
  modeOf,
  resolveToken,
  SECRETS_FILE,
  soldierWifsPresent,
} from "./src/config";
import { sealRoster, vaultId, type KeyManager, type KeyView } from "./src/keymgr";
import { signDigest, pubFingerprint, derivePublicKey } from "./src/secp256k1";

const SERVICE = "wallet-hsm";
const VERSION = "1.0.0";
const HOST = "127.0.0.1"; // loopback ONLY — deny external (mission law)
const DEFAULT_PORT = 3062;

export interface AppOptions {
  port: number;
  /** Production boot: state/ next to index.ts. Tests: fresh tmp dir. */
  stateDir: string;
  envSource?: Record<string, string | undefined>;
  /** Parsed owner secrets file. Production: loadEnvFile(SECRETS_FILE). Tests: {}. */
  envFile?: Record<string, string>;
  /** Local 0600 token file (fleet operator-token law). Tests: null. */
  tokenFile?: string | null;
  log?: (line: string) => void;
}

export interface AppHandle {
  host: string;
  port: number;
  mode: "sealed" | "armed";
  modeReason: string;
  token: string | null;
  tokenSource: string;
  stop: () => void;
}

export interface AppState {
  mode: "sealed" | "armed";
  reason: string;
  startedAt: number;
  keys: KeyManager;
  denyCount: number;
  signCount: number;
  tokenFingerprint: string;
  roster: ReturnType<typeof buildRoster>;
  soldiersProvisioned: boolean;
}

// ── token check (mirror of giant vault-auth 69144ce verifyVaultToken) ──────
export function verifyToken(req: Request, expected: string | null): boolean {
  if (!expected) return false; // no vault = absolute refusal (fail-closed)
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const given = (req.headers.get("x-vault-token") || bearer || "").trim();
  if (!given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Picks the vault master: envSource → process env → fresh ephemeral (never logged). */
function pickMaster(envSource: Record<string, string | undefined>): { hex: string; persistent: boolean } {
  const fromEnvSource = (envSource.SAOS_VAULT_MASTER_KEY ?? "").trim();
  if (HEX64.test(fromEnvSource)) return { hex: fromEnvSource, persistent: true };
  const fromProcess = (process.env.SAOS_VAULT_MASTER_KEY ?? "").trim();
  if (HEX64.test(fromProcess)) return { hex: fromProcess, persistent: true };
  return { hex: randomBytes(32).toString("hex"), persistent: false }; // ephemeral per-boot scratch
}

export async function startApp(opts: AppOptions): Promise<AppHandle> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const envSource = opts.envSource ?? process.env;
  const envFile = opts.envFile ?? loadEnvFile(SECRETS_FILE);

  const tokenRes = resolveToken(envSource, { envFile, tokenFile: opts.tokenFile ?? null });
  const killSwitch = envSource.WALLET_HSM_SEALED === "1";
  const roster = buildRoster(envSource);
  const soldiers = soldierWifsPresent(envSource, envFile);

  // vault: ephemeral master wipes the scratch store each boot (re-sealed below)
  const master = pickMaster(envSource);
  if (!master.persistent) {
    fs.rmSync(path.join(opts.stateDir, "keys.enc"), { force: true });
  }
  const prevMaster = process.env.SAOS_VAULT_MASTER_KEY;
  let vault;
  try {
    process.env.SAOS_VAULT_MASTER_KEY = master.hex;
    vault = await openVault({ dir: opts.stateDir }); // fail-closed: bad master ⇒ boot aborts
  } finally {
    if (prevMaster === undefined) delete process.env.SAOS_VAULT_MASTER_KEY;
    else process.env.SAOS_VAULT_MASTER_KEY = prevMaster;
  }

  const keys = await sealRoster(vault, roster, { ...envFile, ...envSource });
  const { mode, reason } = modeOf({ killSwitch, token: tokenRes.token, loadedCount: keys.loadedCount() });

  const state: AppState = {
    mode,
    reason,
    startedAt: Date.now(),
    keys,
    denyCount: 0,
    signCount: 0,
    tokenFingerprint: tokenRes.token ? createHash("sha256").update(tokenRes.token).digest("hex").slice(0, 16) : "none",
    roster,
    soldiersProvisioned: soldiers,
  };

  const deny = (req: Request, why: string): Response => {
    state.denyCount++;
    log(`DENY ${req.method} ${new URL(req.url).pathname} — ${why} (fail-closed, deny-by-default/1)`);
    return json({ ok: false, error: "vault-token-required", law: "deny-by-default/1" }, 403);
  };

  const health = (): Response =>
    json(
      {
        service: SERVICE,
        version: VERSION,
        status: state.mode,
        statusReason: state.reason,
        uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
        bootedAt: new Date(state.startedAt).toISOString(),
        loopbackOnly: true,
        host: HOST,
        port: opts.port,
        authLaw: "vault-auth deny-by-default/1 (x-vault-token|bearer, constant-time)",
        signEnabled: state.mode === "armed",
        tokenConfigured: tokenRes.token !== null,
        tokenSource: tokenRes.source,
        tokenFingerprint: state.tokenFingerprint,
        keysLoaded: state.keys.loadedCount(),
        keys: state.keys.views().map(({ fingerprint, ...v }) => v), // /health: no fingerprints, no secrets
        denyCount: state.denyCount,
        signCount: state.signCount,
      },
      200,
    );

  const pubkeys = (): Response =>
    json(
      {
        ok: true,
        status: state.mode,
        keys: state.keys.views(), // fingerprints only (public data); material never leaves the vault
        ownerKeysNeverHot: OWNER_KEYS_NEVER_HOT,
        soldierWifs: {
          provisioned: state.soldiersProvisioned,
          note: state.soldiersProvisioned
            ? "soldier WIF env names present in the roster source"
            : "no soldier WIF env names present in the roster source — reported honestly, never fabricated",
        },
      },
      200,
    );

  const sign = async (req: Request): Promise<Response> => {
    if (state.mode === "sealed") {
      log(`SIGN-REFUSED ${new URL(req.url).pathname} — mode=sealed reason=${state.reason} (fail-closed/1)`);
      return json({ ok: false, error: "sealed", reason: state.reason, law: "fail-closed/1" }, 503);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "bad-json" }, 400);
    }
    const b = body as { account?: unknown; txDigestHex?: unknown; authority?: unknown; chain?: unknown };
    if (typeof b?.account !== "string" || b.account.length === 0 || b.account.length > 64) {
      return json({ ok: false, error: "bad-account" }, 400);
    }
    if (typeof b?.txDigestHex !== "string" || !HEX64.test(b.txDigestHex)) {
      return json({ ok: false, error: "bad-digest", expect: "64 hex chars = sha256 tx digest" }, 400);
    }
    const chain = b.chain === undefined ? "steem" : b.chain;
    if (chain !== "steem" && chain !== "hive") {
      return json({ ok: false, error: "bad-chain", expect: "steem|hive" }, 400);
    }
    const authority = b.authority === undefined ? "active" : b.authority;
    if (typeof authority !== "string" || authority.length === 0 || authority.length > 32) {
      return json({ ok: false, error: "bad-authority" }, 400);
    }
    const entry = state.keys.findLoaded(chain, b.account, authority);
    if (!entry) {
      const known = state.keys.views().some((k) => k.account === b.account && k.chain === chain);
      const status = known ? 503 : 404;
      const err = known ? "key-not-loaded" : "unknown-account";
      log(`SIGN-REFUSED ${chain}/${b.account}/${authority} — ${err}`);
      return json({ ok: false, error: err, law: "fail-closed/1" }, status);
    }
    const digest = Buffer.from(b.txDigestHex, "hex");
    const id = vaultId(entry);
    const t0 = Date.now();
    try {
      // Everything touching the unsealed material happens INSIDE withKey;
      // the buffer is zero-filled by withKey as soon as the callback settles.
      const { signature, pub } = await state.keys.vault.withKey(id, (k) => {
        const signature = signDigest(k.material, digest);
        const pub = pubFingerprint(derivePublicKey(k.material));
        return { signature, pub };
      });
      const response = {
        ok: true,
        account: b.account,
        chain,
        authority,
        vaultId: id,
        algorithm: "ecdsa-secp256k1-rfc6979/low-s/compact-65",
        signature: signature.compact.toString("hex"),
        recid: signature.recid,
        r: signature.r.toString(16).padStart(64, "0"),
        s: signature.s.toString(16).padStart(64, "0"),
        pubFingerprint: pub,
      };
      state.signCount++;
      log(`SIGN ${id} digest-fp=${createHash("sha256").update(digest).digest("hex").slice(0, 16)} dur=${Date.now() - t0}ms status=200`);
      return json(response, 200);
    } catch (e) {
      const code = (e as { code?: string; name?: string })?.name ?? "ERROR";
      log(`SIGN-FAILED ${id} — ${code} (no content echoed)`);
      return json({ ok: false, error: "sign-failed", code }, 500);
    } finally {
      digest.fill(0); // zeroize the digest buffer after use
    }
  };

  const server = Bun.serve({
    port: opts.port,
    hostname: HOST,
    fetch: async (req) => {
      const t0 = Date.now();
      try {
        const url = new URL(req.url);
        const p = url.pathname;
        if (p === "/health" && req.method === "GET") return health(); // the ONLY token-free route
        if (!verifyToken(req, tokenRes.token)) return deny(req, "missing-or-wrong-vault-token");
        if (p === "/pubkeys" && req.method === "GET") return pubkeys();
        if (p === "/sign" && req.method === "POST") return await sign(req);
        if ((p === "/pubkeys" && req.method !== "GET") || (p === "/sign" && req.method !== "POST")) {
          return json({ ok: false, error: "method-not-allowed" }, 405);
        }
        log(`MISS ${req.method} ${p} status=404`);
        return json({ ok: false, error: "not-found" }, 404);
      } catch (e) {
        const name = (e as { name?: string })?.name ?? "ERROR";
        log(`ERROR ${req.method} ${new URL(req.url).pathname} — ${name} (no content echoed) dur=${Date.now() - t0}ms`);
        return json({ ok: false, error: "internal" }, 500);
      }
    },
  });

  log(
    `wallet-hsm ${VERSION} ${mode.toUpperCase()} (reason=${reason}) on http://${server.hostname}:${server.port} — ` +
      `keys=${keys.loadedCount()}/${roster.length} token=${tokenRes.source} fingerprint=${state.tokenFingerprint} deny-by-default/1`,
  );

  return {
    host: server.hostname,
    port: server.port,
    mode,
    modeReason: reason,
    token: tokenRes.token,
    tokenSource: tokenRes.source,
    stop: () => server.stop(true),
  };
}

// ── production boot (sovereign-runner-kit) ─────────────────────────────────
if (import.meta.main) {
  const stateDir = path.resolve(import.meta.dir, "state");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  startApp({
    port: Number(process.env.WALLET_HSM_PORT ?? DEFAULT_PORT),
    stateDir,
    tokenFile: path.join(stateDir, "operator-token"), // local 0600 token file (fleet operator-token law)
  }).catch((e) => {
    // fail-closed: a boot that cannot prove its laws must not half-open
    console.error(`wallet-hsm boot refused (fail-closed): ${e instanceof Error ? e.name : "ERROR"}`);
    process.exit(1);
  });
}
