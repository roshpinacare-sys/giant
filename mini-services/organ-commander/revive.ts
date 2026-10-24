/**
 * revive.ts — port-first spawn plans. NEVER duplicates a live organ:
 * the port probe is the authority (measured law from saos-dex-node G92).
 * Spawns are detached (unref) — the commander may die, organs survive.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface SpawnPlan {
  organ: string;
  cmd: string[];
  cwd: string;
  env: Record<string, string>;
  log: string;
  port: number;
  /** directories that must exist before spawn (db dirs, log dirs) */
  mkDirs?: string[];
}

export const GIANT_ROOT = "/home/z/audit/repos/giant";
const BUN = "/usr/local/bin/bun";
const LOG_ROOT = "/home/z/audit/architect";

const PLANS: Record<string, SpawnPlan> = {
  "dex-node": {
    organ: "dex-node",
    cmd: [BUN, "mini-services/saos-dex-node/index.ts"],
    cwd: GIANT_ROOT, env: {}, port: 3010,
    log: `${LOG_ROOT}/dex-node.log`,
    mkDirs: ["/home/z/my-project/repos/saos-dex/db"],
  },
  "soldier-army": {
    organ: "soldier-army",
    cmd: [BUN, "mini-services/soldier-army/index.ts"],
    cwd: GIANT_ROOT, env: {}, port: 3018,
    log: `${LOG_ROOT}/soldier-army.log`,
  },
  "dex-economy-bridge": {
    organ: "dex-economy-bridge",
    cmd: [BUN, "mini-services/dex-economy-bridge/index.ts"],
    cwd: GIANT_ROOT,
    env: { BRIDGE_DEX_DB: "/home/z/my-project/repos/saos-dex/db/dex.db" },
    port: 3017,
    log: `${LOG_ROOT}/dex-economy-bridge.log`,
  },
  "issue-forge": {
    organ: "issue-forge",
    cmd: [BUN, "mini-services/issue-forge/index.ts"],
    cwd: GIANT_ROOT, env: {}, port: 3046,
    log: `${LOG_ROOT}/issue-forge.log`,
  },
};

export function revivePlan(organ: string): SpawnPlan {
  const plan = PLANS[organ];
  if (!plan) throw new Error(`no revive plan for organ: ${organ}`);
  return { ...plan, cmd: [...plan.cmd], env: { ...plan.env }, mkDirs: plan.mkDirs ? [...plan.mkDirs] : undefined };
}

export interface ReviveIo {
  aliveCheck: (port: number) => Promise<boolean>;
  spawn: (plan: SpawnPlan) => number;
}

export interface ReviveResult { spawned: boolean; reason: string; }

export async function executeRevive(plan: SpawnPlan, io: ReviveIo): Promise<ReviveResult> {
  if (await io.aliveCheck(plan.port)) {
    return { spawned: false, reason: `port ${plan.port} already alive — port-first authority, zero duplicates` };
  }
  for (const dir of plan.mkDirs ?? []) mkdirSync(dir, { recursive: true });
  mkdirSync(dirname(plan.log), { recursive: true });
  io.spawn(plan);
  return { spawned: true, reason: `spawned pid for port ${plan.port} (detached, log ${plan.log})` };
}
