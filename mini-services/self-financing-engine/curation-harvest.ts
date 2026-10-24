// Curation / reward harvesting plan — deterministic voting-power model.
// Owner directive §1: "High-yield automated curation and reward harvesting across Steem/Hive."
// Model: VP regenerates linearly (20%/day on Steem; param injected). Every hour a soldier
// sits at 100% VP, that capacity WASTES. The plan schedules harvest votes at the earliest
// instant VP reaches the efficiency threshold so zero VP decays into waste, and computes
// the harvestable value for the treasury ledger.
export interface SoldierVp {
  account: string;
  vpPct: number;             // measured voting power 0..100
  regenPctPerDay: number;    // measured regen rate (Steem = 20)
  voteValueUsd: number;      // measured full-vote value (price feed × SP)
  lastVoteIso: string | null;
}
export interface HarvestPlanEntry {
  account: string;
  hoursToThreshold: number;  // when to vote next (deterministic from injected clock)
  projectedWasteUsdPerDay: number;
  voteAtIso: string;
}
export interface HarvestPlan {
  generatedAt: string;
  entries: HarvestPlanEntry[];
  dailyWasteIfIdleUsd: number;   // the cost of self-paralysis, measured
  dailyRecoverableUsd: number;   // what the harvest plan claws back
}
export const EFFICIENCY_THRESHOLD_PCT = 95;
export function planCurationHarvest(roster: SoldierVp[], nowMs: number = Date.now()): HarvestPlan {
  const now = new Date(nowMs);
  const entries: HarvestPlanEntry[] = [];
  let waste = 0, recover = 0;
  for (const s of roster) {
    if (!s.account) throw new TypeError("account required");
    if (!(s.vpPct >= 0 && s.vpPct <= 100)) throw new RangeError(`vpPct out of range for ${s.account}`);
    const regenPerHour = s.regenPctPerDay / 24;
    if (s.vpPct >= 100) {
      // fully charged and idle — 100% of daily capacity is wasting right now
      const w = s.voteValueUsd * (s.regenPctPerDay / 100);
      waste += w; recover += w;
      entries.push({ account: s.account, hoursToThreshold: 0, projectedWasteUsdPerDay: w, voteAtIso: new Date(nowMs).toISOString() });
    } else if (s.vpPct >= EFFICIENCY_THRESHOLD_PCT) {
      const w = s.voteValueUsd * (s.regenPctPerDay / 100) * ((s.vpPct - EFFICIENCY_THRESHOLD_PCT) / (100 - EFFICIENCY_THRESHOLD_PCT));
      waste += w;
      entries.push({ account: s.account, hoursToThreshold: 0, projectedWasteUsdPerDay: w, voteAtIso: new Date(nowMs).toISOString() });
      recover += w * 0.8; // near-full: harvest now captures most of the day's capacity
    } else {
      const gap = Math.max(0, EFFICIENCY_THRESHOLD_PCT - s.vpPct);
      const hours = gap / regenPerHour;
      const w = s.voteValueUsd * (s.regenPctPerDay / 100);
      waste += w * (gap / 100); // the fraction of capacity lost while under threshold is capped by regen discipline
      entries.push({ account: s.account, hoursToThreshold: Number(hours.toFixed(3)), projectedWasteUsdPerDay: 0, voteAtIso: new Date(nowMs + hours * 3600_000).toISOString() });
      recover += w * 0.8;
    }
  }
  return { generatedAt: now.toISOString(), entries, dailyWasteIfIdleUsd: Number(waste.toFixed(6)), dailyRecoverableUsd: Number(recover.toFixed(6)) };
}
