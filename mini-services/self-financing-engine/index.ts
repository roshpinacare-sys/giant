// saos self-financing engine (:3061) — the system paying for itself, per owner
// ULTIMATE directive §1: zero operator funding. Three deterministic engines
// (RC rebalance plan · curation harvest plan · AMM yield accrual) + honest
// census of all-soldier activation (§2). Plans only — broadcast stays key-custody.
import { planRcRebalance, type SoldierRc, type SoldierVp, type YieldSource } from "./rc-plan.ts";
import { planCurationHarvest } from "./curation-harvest.ts";
import { accrue, verifyAccrual, type AccrualState } from "./yield-accrual.ts";
import { denyIfPublic } from "../lib/vault-auth.ts"; // גל-80 · חוק-הסף-הריבוני (§1 lockdown, trace 1a173c3929f5d23d)
import { createHash, timingSafeEqual } from "crypto";
import { readFileSync } from "node:fs";

/* token custody (Task S1): env SAOS_ADMIN_TOKEN first, then the owner-scoped
 * 0600 secrets file — file-based custody per mesh.sh law (the office dev
 * supervisor respawns organ slots with its own env, which carries no token;
 * the secret file survives every respawn). Token material is never logged. */
const ADMIN_TOKEN_FILE = "/home/z/.secrets-sovereign/admin.env";
function adminToken(): string {
  const env = (process.env.SAOS_ADMIN_TOKEN ?? "").trim();
  if (env) return env;
  try {
    for (const line of readFileSync(ADMIN_TOKEN_FILE, "utf8").split("\n")) {
      const m = line.match(/^SAOS_ADMIN_TOKEN=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch { /* absent — fail-closed */ }
  return "";
}
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
  /* ═══ Task S1 · operator gate (deny-by-default §1) ═══════════════════
   * POST /cycle runs the harvest/fund planning cycle — an owner mutation.
   * Mirror of the dex engine operator gate (saos-dex src/lib/operator-auth.ts):
   * header x-saos-operator must equal env SAOS_ADMIN_TOKEN (sha256 digests,
   * timing-safe). FAIL-CLOSED: token unset/empty → every HTTP mutation 403.
   * This organ binds all interfaces, so the loopback-only vault-auth plane is
   * NOT sufficient here — the token gate is the actual seal. */
  const operatorOk = (req: Request): boolean => {
    const expected = adminToken();
    if (!expected) return false; // fail-closed — gate stays shut without a token
    const given = (req.headers.get("x-saos-operator") ?? "").trim();
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(expected).digest();
    try { return timingSafeEqual(a, b); } catch { return false; }
  };
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/state") {
        return Response.json({ ...state, yieldsHeadValid: verifyAccrual(state.yields).ok });
      }
      if (url.pathname === "/cycle" && req.method === "POST") {
        // Task S1 deny-by-default §1: owner mutation requires the operator token (403, fail-closed)
        if (!operatorOk(req)) {
          console.warn(`[self-financing-engine] DENY ${req.method} ${url.pathname} — unauthenticated mutation (Task S1, x-saos-operator required)`);
          return new Response(JSON.stringify({ ok: false, error: "forbidden", law: "deny-by-default/1", note: "send header x-saos-operator matching SAOS_ADMIN_TOKEN" }), { status: 403, headers: { "content-type": "application/json" } });
        }
        const deny = denyIfPublic(req, "self-financing-engine"); // גל-80 · מוטציה-ציבורית בלי-טוקן → 403 (defense-in-depth under S1 gate)
        if (deny) return deny;
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
