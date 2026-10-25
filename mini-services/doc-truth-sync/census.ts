/* census.ts — deterministic documentation staleness classifier.
 *
 * Pure core: NO network, NO filesystem, NO clock of its own — every function
 * takes an injected clock ISO. The collector layer (collect.ts) does the real
 * git I/O; this layer only decides, deterministically, so any census is
 * reproducible byte-for-byte from the same fact list.
 *
 * Statuses:
 *  · LIVE      — last commit within dormantAfterDays of the clock.
 *  · AUTOMATED — older than the threshold, but its last author is a DECLARED
 *                automator identity (KNOWN_AUTOMATORS below — an explicit,
 *                versioned, reviewable list; nothing is inferred heuristically).
 *                These files are bot-owned churn surfaces: census CONSUMERS
 *                must not hand-refresh them; the owning automation does.
 *  · DORMANT   — everything else. This is the owner's "dormant" list.
 */
import { sha256Hex, canonicalJson, isIsoZ } from "./receipts.ts";

export interface FileFact {
  readonly path: string;
  readonly lastCommitIso: string;
  readonly author: string;
}

export type CensusStatus = "LIVE" | "AUTOMATED" | "DORMANT";

export interface CensusRow {
  readonly path: string;
  readonly lastCommitIso: string;
  readonly author: string;
  readonly ageDays: number;
  readonly status: CensusStatus;
}

export interface CensusSummary {
  readonly total: number;
  readonly live: number;
  readonly automated: number;
  readonly dormant: number;
  readonly dormantSharePpm: number;
}

/** Declared automator identities observed in the fleet's repos (duplicates-audit
 * + SWARM_STATE receipts, 2026-10-24 census). Explicit law, not a guess. */
export const KNOWN_AUTOMATORS: ReadonlySet<string> = new Set([
  "liveness-host",
  "fleet-runner",
  "moment-watch",
  "office-worldbeat",
  "network-census",
  "vault-sync",
  "seal-host",
  "swarm-runner",
]);

const DAY_MS = 86_400_000;

export function classifyFile(
  fact: FileFact,
  clockIso: string,
  dormantAfterDays: number,
): CensusRow {
  if (!isIsoZ(clockIso)) throw new Error(`census: clock iso must be ISO-8601 Z, got "${clockIso}"`);
  if (!isIsoZ(fact.lastCommitIso)) throw new Error(`census: fact iso must be ISO-8601 Z, got "${fact.lastCommitIso}" for ${fact.path}`);
  if (!Number.isInteger(dormantAfterDays) || dormantAfterDays < 1) {
    throw new Error(`census: dormantAfterDays must be an integer >= 1, got ${dormantAfterDays}`);
  }
  if (fact.path.length === 0) throw new Error("census: fact path must be non-empty");
  const age = Math.floor((Date.parse(clockIso) - Date.parse(fact.lastCommitIso)) / DAY_MS);
  if (age < 0) throw new Error(`census: clock-before-commit for ${fact.path} (clock ${clockIso} < commit ${fact.lastCommitIso}) — injected-clock violation`);
  const base = {
    path: fact.path,
    lastCommitIso: fact.lastCommitIso,
    author: fact.author,
    ageDays: age,
  };
  if (age <= dormantAfterDays) return { ...base, status: "LIVE" };
  if (KNOWN_AUTOMATORS.has(fact.author)) return { ...base, status: "AUTOMATED" };
  return { ...base, status: "DORMANT" };
}

export function buildCensus(
  facts: readonly FileFact[],
  clockIso: string,
  dormantAfterDays: number,
): { rows: CensusRow[]; summary: CensusSummary } {
  const seen = new Set<string>();
  for (const f of facts) {
    if (seen.has(f.path)) throw new Error(`census: duplicate path ${f.path}`);
    seen.add(f.path);
  }
  const rows = facts
    .map((f) => classifyFile(f, clockIso, dormantAfterDays))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const live = rows.filter((r) => r.status === "LIVE").length;
  const automated = rows.filter((r) => r.status === "AUTOMATED").length;
  const dormant = rows.filter((r) => r.status === "DORMANT").length;
  const summary: CensusSummary = {
    total: rows.length,
    live,
    automated,
    dormant,
    dormantSharePpm: rows.length === 0 ? 0 : Math.round((dormant / rows.length) * 1_000_000),
  };
  return { rows, summary };
}

/** Stable digest over the census rows (canonical JSON, sorted by construction). */
export function payloadHashOfCensus(rows: readonly CensusRow[]): string {
  return sha256Hex(canonicalJson(rows));
}
