// Roster from the LIVE book — the all-soldier census measured from truth, not config.
// Owner directive §2: "ALL soldier accounts registered in Saosmartwallet and
// saos-control-center MUST be activated at 100% capacity." The book IS the registry:
// every distinct account that ever moved value is a soldier node. Handles are
// pseudonymized via acct-h-<sha8> per the house identity law; the mapping stays
// behind custody. Treasury service-tax (2.5% → כספת) = measured self-financing income.
import { createHash } from "node:crypto";
export interface BookRecord { seq?: number; kind?: string; from?: string; to?: string; asset?: string; amount?: number; ts?: number; [k: string]: unknown }
export interface SoldierCensusEntry {
  pseudonym: string;           // acct-h-<sha8 first 8>
  records: number;             // activity volume
  inflowMicroUnits: number;    // measured inflow (µ-units of the asset's smallest declared unit ×1e6 for USDS-like)
  lastSeenTs: number | null;
  activeInWindow: boolean;     // active within the census window (default 6h)
}
export interface BookCensus {
  censusAtIso: string; windowHours: number;
  rosterSize: number; activeCount: number; activationPct: number;
  soldiers: SoldierCensusEntry[];
  treasuryTaxMicroUnits: number;   // measured self-financing income (§1 proof)
  treasuryTaxAsset: string;
  blockers: string[];
}
export const WINDOW_HOURS_DEFAULT = 6;
export function pseudonymOf(handle: string): string {
  return "acct-h-" + createHash("sha256").update(handle).digest("hex").slice(0, 8);
}
export function censusFromBook(records: BookRecord[], nowMs: number = Date.now(), windowHours: number = WINDOW_HOURS_DEFAULT): BookCensus {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  const blockers: string[] = [];
  if (!records.length) blockers.push("book-empty");
  const windowMs = windowHours * 3600_000;
  const now = nowMs;
  const map = new Map<string, { recs: number; inflow: number; last: number | null }>();
  let taxMicro = 0; let taxAsset = "";
  for (const r of records) {
    const amt = r.amount;
    const from = typeof r.from === "string" ? r.from : undefined;
    const to = typeof r.to === "string" ? r.to : undefined;
    if (from) {
      const e = map.get(from) ?? { recs: 0, inflow: 0, last: null };
      e.recs++;
      if (typeof r.ts === "number") e.last = Math.max(e.last ?? 0, r.ts); // sending value IS activity
      map.set(from, e);
    }
    if (to) {
      const e = map.get(to) ?? { recs: 0, inflow: 0, last: null };
      e.recs++;
      if (typeof amt === "number" && Number.isFinite(amt) && amt > 0) e.inflow += Math.round(amt * 1_000_000);
      if (typeof r.ts === "number") e.last = Math.max(e.last ?? 0, r.ts);
      map.set(to, e);
    }
    if (r.kind === "tax" && to === "treasury" && typeof amt === "number" && amt > 0) {
      taxMicro += Math.round(amt * 1_000_000); taxAsset = typeof r.asset === "string" ? r.asset : taxAsset;
    }
  }
  const soldiers: SoldierCensusEntry[] = [...map.entries()].map(([handle, e]) => ({
    pseudonym: pseudonymOf(handle),
    records: e.recs,
    inflowMicroUnits: e.inflow,
    lastSeenTs: e.last,
    activeInWindow: e.last !== null && now - e.last <= windowMs,
  })).sort((a, b) => b.records - a.records);
  const activeCount = soldiers.filter(s => s.activeInWindow).length;
  if (soldiers.length && activeCount === 0) blockers.push("no-recent-activity-in-window");
  return {
    censusAtIso: new Date(now).toISOString(), windowHours,
    rosterSize: soldiers.length, activeCount, activationPct: soldiers.length ? Math.round(activeCount / soldiers.length * 100) : 0,
    soldiers, treasuryTaxMicroUnits: taxMicro, treasuryTaxAsset: taxAsset, blockers,
  };
}
