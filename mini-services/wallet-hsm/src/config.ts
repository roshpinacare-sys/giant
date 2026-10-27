/**
 * wallet-hsm — configuration law (task 36-d)
 * ==========================================
 * SECRETS LAW: values from the secrets file / env are read into memory only,
 * picked by exact NAME, and never logged, echoed, or copied anywhere.
 * Diagnostics carry NAMES and CODES only.
 */
import fs from "node:fs";

/** Owner-provisioned secrets (0600). Names are public below; values never leave the process. */
export const SECRETS_FILE = "/home/z/.secrets/.env.local";

/** Parses a KEY=VALUE env file. Never logs values. Missing file ⇒ {} (honest absence). */
export function loadEnvFile(filePath: string): Record<string, string> {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.length === 0 || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key.length > 0) out[key] = value;
  }
  return out;
}

export interface RosterEntry {
  account: string;
  chain: "steem" | "hive";
  authority: string;
  /** Env NAME the WIF comes from (never the value). */
  envName: string;
}

/**
 * Key roster law:
 *  • STEEM_ACTIVE_WIF_A → headcorner active (mission mapping).
 *  • The headcorner A/B authority sets (active/posting/memo) load when their
 *    env NAMES exist. The owner key envs (STEEM_OWNER_WIF_*) are DELIBERATELY
 *    NOT in the roster — the owner key is never hot (Saosmartwallet doctrine).
 *  • Soldier WIF env names (STEEM_SOLDIER_*) are ABSENT from the secrets file
 *    (names-only scan, cycle 36) — they are reported not-loaded, never fabricated.
 *  • WALLET_HSM_TEST_WIF replaces the WHOLE roster with one throwaway test key
 *    (tests only; the production boot never sets it).
 */
export function buildRoster(envSource: Record<string, string | undefined>): RosterEntry[] {
  if (envSource.WALLET_HSM_TEST_WIF) {
    return [
      { account: "test-account", chain: "steem", authority: "active", envName: "WALLET_HSM_TEST_WIF" },
    ];
  }
  return [
    { account: "headcorner", chain: "steem", authority: "active", envName: "STEEM_ACTIVE_WIF_A" },
    { account: "headcorner", chain: "steem", authority: "active-b", envName: "STEEM_ACTIVE_WIF_B" },
    { account: "headcorner", chain: "steem", authority: "posting", envName: "STEEM_POSTING_WIF_A" },
    { account: "headcorner", chain: "steem", authority: "posting-b", envName: "STEEM_POSTING_WIF_B" },
    { account: "headcorner", chain: "steem", authority: "memo", envName: "STEEM_MEMO_WIF_A" },
    { account: "headcorner", chain: "steem", authority: "memo-b", envName: "STEEM_MEMO_WIF_B" },
    { account: "headcorner", chain: "hive", authority: "posting-c", envName: "HIVE_HEADCORNER_POSTING_WIF_C" },
  ];
}

/** Owner-key envs that are NEVER loaded — surfaced in /pubkeys as standing law. */
export const OWNER_KEYS_NEVER_HOT = ["STEEM_OWNER_WIF_A", "STEEM_OWNER_WIF_B"];

export const SOLDIER_ENV_PATTERN = /^STEEM_SOLDIER_\d+_(ACTIVE|POSTING|MEMO)_WIF$/;

/** Are any soldier WIF env NAMES present? (names only — no values are read into this decision's output) */
export function soldierWifsPresent(envSource: Record<string, string | undefined>, envFile: Record<string, string>): boolean {
  const names = [...Object.keys(envSource), ...Object.keys(envFile)];
  return names.some((n) => SOLDIER_ENV_PATTERN.test(n));
}

export interface TokenResolution {
  token: string | null;
  /** Where the token came from (NAME only, never the value). */
  source: "env-file" | "process-env" | "local-token-file" | "none";
}

/**
 * Token resolution law (deny-by-default, fail-closed):
 *   1. VAULT_TOKEN from the owner secrets file (mission law: .env.local first),
 *   2. VAULT_TOKEN from the process env,
 *   3. the service's own 0600 local token file (state/operator-token; fleet
 *      operator-token law mirrored from giant vault-auth 69144ce).
 * No token anywhere ⇒ SEALED mode (never self-mints, never opens).
 */
export function resolveToken(
  envSource: Record<string, string | undefined>,
  opts: { envFile?: Record<string, string>; tokenFile?: string | null },
): TokenResolution {
  const fromEnvFile = (opts.envFile?.VAULT_TOKEN ?? "").trim();
  if (fromEnvFile) return { token: fromEnvFile, source: "env-file" };
  const fromEnv = (envSource.VAULT_TOKEN ?? "").trim();
  if (fromEnv) return { token: fromEnv, source: "process-env" };
  if (opts.tokenFile) {
    try {
      const t = fs.readFileSync(opts.tokenFile, "utf8").trim();
      if (t) return { token: t, source: "local-token-file" };
    } catch {
      /* no local token file — honest absence */
    }
  }
  return { token: null, source: "none" };
}

export type HsmMode = "sealed" | "armed";

export function modeOf(opts: {
  killSwitch: boolean;
  token: string | null;
  loadedCount: number;
}): { mode: HsmMode; reason: string } {
  if (opts.killSwitch) return { mode: "sealed", reason: "kill-switch" };
  if (!opts.token) return { mode: "sealed", reason: "no-token-configured" };
  if (opts.loadedCount === 0) return { mode: "sealed", reason: "no-keys-loaded" };
  return { mode: "armed", reason: "token-and-keys" };
}

export const HEX64 = /^[0-9a-fA-F]{64}$/;
