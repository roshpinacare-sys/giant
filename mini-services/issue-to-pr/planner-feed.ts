/**
 * planner-feed.ts — fail-closed reader for meta-planner's contracts feed
 * (schema `meta-planner/issues@2`, produced by mini-services/meta-planner).
 *
 * Laws:
 *  - A malformed or drifted feed THROWS (never silently yields empty work).
 *  - Ranking is deterministic: severity tier desc, then id asc.
 *  - Selection never fabricates work: null means "nothing claimable".
 */

import { readFileSync } from "node:fs";

export interface Evidence {
  file: string;
  line: number;
  snippet: string;
}

export interface Contract {
  id: string;
  kind: string;
  severity: "critical" | "high" | "medium" | "low";
  subsystem: string;
  title: string;
  evidence: Evidence[];
  invariant: string;
}

export interface Feed {
  schema: string;
  count: number;
  contracts: Contract[];
}

export const FEED_SCHEMA = "meta-planner/issues@2";

const SEVERITY_RANK: Record<Contract["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Parse+validate a feed file. Throws on any schema violation (fail-closed). */
export function loadFeed(path: string): Feed {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<Feed>;
  if (parsed.schema !== FEED_SCHEMA) {
    throw new Error(`feed-schema-drift: expected ${FEED_SCHEMA}, got ${String(parsed.schema)}`);
  }
  if (!Array.isArray(parsed.contracts)) {
    throw new Error("feed-shape: contracts is not an array");
  }
  if (typeof parsed.count !== "number" || parsed.count !== parsed.contracts.length) {
    throw new Error(`feed-count-drift: declared ${String(parsed.count)} ≠ actual ${parsed.contracts.length}`);
  }
  for (const c of parsed.contracts) {
    if (!c || typeof c.id !== "string" || typeof c.kind !== "string" || !c.evidence) {
      throw new Error(`feed-contract-malformed: ${JSON.stringify(c).slice(0, 120)}`);
    }
  }
  return { schema: parsed.schema, count: parsed.count, contracts: parsed.contracts as Contract[] };
}

/** Deterministic order: severity tier desc, id asc. Pure (no mutation). */
export function rank(contracts: Contract[]): Contract[] {
  return [...contracts].sort((a, b) => {
    const tier = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (tier !== 0) return tier;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

/** Ranked feed → first item the runner can actually claim (or null). */
export function rankFeed(feed: Feed): Contract[] {
  return rank(feed.contracts);
}

// ── fixer contract + selection ──────────────────────────────────────────────

export interface FixSnapshot {
  /** Opaque bytes/files the fixer captured BEFORE mutating anything. */
  [key: string]: unknown;
}

export interface FixResult {
  changed: boolean;
  proof: Record<string, unknown>;
  snapshot?: FixSnapshot;
}

/**
 * A fixer claims deterministic, mechanically-safe work items.
 * Laws: applicable() is pure; apply() captures a snapshot first;
 * revert() restores the snapshot byte-identically (fail-closed gate).
 */
export interface Fixer {
  name: string;
  /** Which contract kinds this fixer owns. */
  kinds: string[];
  /** Repo-level applicability probe (e.g. trunk cures) — pure read. */
  applicable?(repoRoot: string): boolean;
  /** Pure preview of the change (no mutation) — null when not applicable. */
  plan?(repoRoot: string): { addDevDeps: string[]; after: unknown } | null;
  claims(contract: Contract, repoRoot: string): boolean;
  apply(repoRoot: string, contract: Contract, opts?: { install?: boolean }): Promise<FixResult> | FixResult;
  revert?(repoRoot: string, snapshot: FixSnapshot): void;
}

/** Highest-ranked feed item that has an applicable fixer — or null (honest). */
export function selectWork(
  feed: Feed,
  io: { fixers: Fixer[] },
  repoRoot = process.cwd(),
): { contract: Contract; fixer: Fixer } | null {
  for (const contract of rankFeed(feed)) {
    for (const fixer of io.fixers) {
      if (!fixer.kinds.includes(contract.kind)) continue;
      if (fixer.applicable && !fixer.applicable(repoRoot)) continue;
      if (!fixer.claims(contract, repoRoot)) continue;
      return { contract, fixer };
    }
  }
  return null;
}
