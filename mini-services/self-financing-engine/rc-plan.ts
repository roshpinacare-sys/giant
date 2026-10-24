// RC (Resource Credit) delegation rebalancing plan — deterministic, zero-dep.
// Owner directive §1: "Dynamic Resource Credit (RC) delegation and automated
// cross-soldier asset rebalancing inside saos-control-center."
// Law: plans only — no broadcast, no signing (keys stay in vaults / owner custody).
export interface SoldierRc {
  account: string;           // stable pseudonym or lawful handle
  rcPct: number;             // measured Resource Credit, 0..100
  delegationInVests: number; // measured incoming delegation (VESTS units)
  targetFloorPct: number;    // operational floor below which the soldier starves (default 25)
  ceilingPct: number;        // hoarding ceiling above which RC is wasted idle (default 90)
}
export interface RcTransfer {
  from: string; to: string; vests: number;
}
export interface RcPlan {
  generatedAt: string;       // ISO instant (injected clock)
  donors: string[];          // accounts above ceiling
  needy: string[];           // accounts below floor
  transfers: RcTransfer[];
  conservedVests: number;    // total moved (zero-sum check)
  unresolvable: string[];    // needy with no donor coverage (honest, never hidden)
}
const DEF_FLOOR = 25, DEF_CEIL = 90;
export function planRcRebalance(roster: SoldierRc[], now: string = new Date().toISOString()): RcPlan {
  if (!Number.isFinite(roster.length) || roster.length === 0)
    throw new TypeError("roster must be a non-empty array");
  const seen = new Set<string>();
  for (const s of roster) {
    if (!s.account || seen.has(s.account)) throw new TypeError(`bad or duplicate account: ${s.account}`);
    seen.add(s.account);
    if (!(s.rcPct >= 0 && s.rcPct <= 100)) throw new RangeError(`rcPct out of range for ${s.account}`);
  }
  const floorOf = (s: SoldierRc) => s.targetFloorPct ?? DEF_FLOOR;
  const ceilOf = (s: SoldierRc) => s.ceilingPct ?? DEF_CEIL;
  // donation capacity = amount above ceiling; need = amount below floor
  const donors = roster.filter(s => s.rcPct > ceilOf(s)).sort((a, b) => b.rcPct - a.rcPct);
  const needy = roster.filter(s => s.rcPct < floorOf(s)).sort((a, b) => a.rcPct - b.rcPct);
  const transfers: RcTransfer[] = [];
  const unresolvable: string[] = [];
  // capacity is a fraction of the surplus (never drain a donor to the floor — keep them ≥ ceiling)
  const capacityOf = (s: SoldierRc) => Math.max(0, (s.rcPct - ceilOf(s)) / 100) * s.delegationInVests * 0.5;
  const deficitOf = (s: SoldierRc) => ((floorOf(s) - s.rcPct) / 100) * s.delegationInVests * 0.5;
  const cap = new Map(donors.map(d => [d.account, capacityOf(d)]));
  for (const n of needy) {
    let need = deficitOf(n);
    for (const d of donors) {
      if (need <= 0) break;
      const avail = cap.get(d.account) ?? 0;
      if (avail <= 0) continue;
      const give = Math.min(avail, need);
      cap.set(d.account, avail - give);
      need -= give;
      transfers.push({ from: d.account, to: n.account, vests: Math.floor(give) });
    }
    if (need > 0) unresolvable.push(n.account); // honest: deficit cannot be covered this cycle
  }
  const conservedVests = transfers.reduce((a, t) => a + t.vests, 0);
  return { generatedAt: now, donors: donors.map(d => d.account), needy: needy.map(n => n.account), transfers, conservedVests, unresolvable };
}
