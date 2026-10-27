/**
 * wallet-hsm — key manager (task 36-d)
 * ====================================
 * Seals roster WIFs into the @saos/vault AES-256-GCM envelope store at boot,
 * computes PUBLIC fingerprints only, and signs via vault.withKey (zeroize law).
 * Every failure is reported as a CODE, never as content.
 */
import type { Vault, VaultError } from "@saos/vault";

import { pubFingerprint, derivePublicKey } from "./secp256k1";
import type { RosterEntry } from "./config";

export function vaultId(entry: RosterEntry): string {
  return `${entry.chain}/${entry.account}/${entry.authority}`;
}

export interface KeyView {
  account: string;
  chain: string;
  authority: string;
  envName: string;
  loaded: boolean;
  /** sha256(compressed pubkey)[:16] — public data only, present iff loaded. */
  fingerprint?: string;
  /** Machine-readable refusal/absence code (never content). */
  reason?: string;
}

export interface KeyManager {
  vault: Vault;
  views(): KeyView[];
  /** Sealed entry lookup by chain/account/authority (loaded only). */
  findLoaded(chain: string, account: string, authority: string): RosterEntry | undefined;
  loadedCount(): number;
}

function errorCode(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

/**
 * Seals every roster entry whose WIF env NAME resolves, in-memory only from
 * here on: /sign unseals via withKey, the buffer is zero-filled afterwards.
 */
export async function sealRoster(
  vault: Vault,
  roster: RosterEntry[],
  envSource: Record<string, string | undefined>,
): Promise<KeyManager> {
  const loaded = new Map<string, RosterEntry>();
  const views: KeyView[] = [];

  for (const entry of roster) {
    const id = vaultId(entry);
    const wif = envSource[entry.envName];
    if (typeof wif !== "string" || wif.trim().length === 0) {
      views.push({ account: entry.account, chain: entry.chain, authority: entry.authority, envName: entry.envName, loaded: false, reason: "env-absent" });
      continue;
    }
    try {
      await vault.sealKey({
        id,
        type: "secp256k1-wif",
        material: wif.trim(),
        meta: { chain: entry.chain, account: entry.account, authority: entry.authority, env: entry.envName },
      });
      const fingerprint = await vault.withKey(id, (k) => pubFingerprint(derivePublicKey(k.material)));
      loaded.set(id, entry);
      views.push({ account: entry.account, chain: entry.chain, authority: entry.authority, envName: entry.envName, loaded: true, fingerprint });
    } catch (e) {
      views.push({ account: entry.account, chain: entry.chain, authority: entry.authority, envName: entry.envName, loaded: false, reason: `seal-refused:${errorCode(e)}` });
    }
  }

  return {
    vault,
    views: () => views.map((v) => ({ ...v })),
    findLoaded: (chain, account, authority) =>
      loaded.get(`${chain}/${account}/${authority}`),
    loadedCount: () => loaded.size,
  };
}
