// saos self-financing engine (:3061) — the system paying for itself, per owner
// ULTIMATE directive §1: zero operator funding. Three deterministic engines
// (RC rebalance plan · curation harvest plan · AMM yield accrual) + honest
// census of all-soldier activation (§2). Plans only — broadcast stays key-custody.
import { planRcRebalance, type SoldierRc, type SoldierVp, type YieldSource } from "./rc-plan.ts";
import { planCurationHarvest } from "./curation-harvest.ts";
import { accrue, verifyAccrual, type AccrualState } from "./yield-accrual.ts";
export { planRcRebalance, planCurationHarvest, accrue, verifyAccrual };
export type { AccrualState, SoldierRc, SoldierVp, YieldSource };
const PORT = Number(process.env.PORT ?? 3061);
export interface EngineState {
  startedAtIso: string; cycles: number; lastCycleIso: string | null;
  rc: ReturnType<typeof planRcRebalance> | null;
  harvest: ReturnType<typeof planCurationHarvest> | null;
  yields: AccrualState;
  activation: { rosterSize: number; activeCount: number; activationPct: number; blockers: string[] };
}
export const state: EngineState = {
  startedAtIso: new Date().toISOString(), cycles: 0, lastCycleIso: null,
  rc: null, harvest: null, yields: { records: [], totalMicroUnits: 0, headH: "0".repeat(64) },
  activation: { rosterSize: 0, activeCount: 0, activationPct: 0, blockers: ["no-roster-measured"] },
};
export function cycle(rcRoster: SoldierRc[], vpRoster: SoldierVp[], sources: YieldSource[], nowMs: number = Date.now()): EngineState {
  state.rc = planRcRebalance(rcRoster.length ? rcRoster : [{ account: "solo-soldier", rcPct: 100, delegationInVests: 0, targetFloorPct: 25, ceilingPct: 90 }], new Date(nowMs).toISOString());
  state.harvest = planCurationHarvest(vpRoster.length ? vpRoster : [{ account: "solo-soldier", vpPct: 100, regenPctPerDay: 20, voteValueUsd: 0, lastVoteIso: null }], nowMs);
  for (const ys of sources) state.yields = accrue(state.yields, ys, new Date(nowMs).toISOString());
  // §2 all-soldier activation census: an account is ACTIVE iff it holds any plan role this cycle
  const names = new Set([...rcRoster.map(r => r.account), ...vpRoster.map(v => v.account)]);
  const active = new Set([...(state.rc?.transfers ?? []).flatMap(t => [t.from, t.to]), ...(state.harvest?.entries ?? []).map(e => e.account)].filter(a => names.has(a)));
  const blockers: string[] = [];
  if (!rcRoster.length) blockers.push("rc-roster-empty");
  if (!vpRoster.length) blockers.push("vp-roster-empty");
  state.activation = { rosterSize: names.size, activeCount: active.size, activationPct: names.size ? Math.round(active.size / names.size * 100) : 0, blockers };
  state.cycles += 1; state.lastCycleIso = new Date(nowMs).toISOString();
  return state;
}
if (import.meta.main) {
  const v = verifyAccrual(state.yields);
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/state") {
        return Response.json({ ...state, yieldsHeadValid: verifyAccrual(state.yields).ok });
      }
      if (url.pathname === "/cycle" && req.method === "POST") {
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        cycle(body.rcRoster ?? [], body.vpRoster ?? [], body.yields ?? []);
        return Response.json({ ok: true, cycles: state.cycles, activation: state.activation });
      }
      return new Response("self-financing-engine: GET /state · POST /cycle\n", { status: 200 });
    },
  });
  console.log(`[self-financing-engine] listening :${PORT} — rail ${v.ok ? "GENESIS" : "INVALID"}`);
}
