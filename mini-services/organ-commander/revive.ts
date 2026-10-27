/**
 * revive.ts — port-first spawn plans. NEVER duplicates a live organ:
 * the port probe is the authority (measured law from saos-dex-node G92).
 * Spawns are detached (unref) — the commander may die, organs survive.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface SpawnPlan {
  organ: string;
  cmd: string[];
  cwd: string;
  env: Record<string, string>;
  log: string;
  port: number;
  /** /proc cmdline tag identifying this organ's process (proc-first authority) */
  tag: string;
  /** directories that must exist before spawn (db dirs, log dirs) */
  mkDirs?: string[];
}

/* G78-i (trace 1a17d85ab0537c95): root DISCOVERY replaces the dead hard-coded
 * /home/z/audit/repos/giant (erased by sandbox reset #7 — every revive spawn
 * died with "cannot change to"). Law: env GIANT_ROOT first, then the estate
 * convention, then g70 legacy, then the audit clone — the first candidate
 * carrying THIS commander's entry is lawful; null = fail-honest fallback to
 * the estate convention (spawn plans record their cwd; nothing spawns from a
 * ghost path without the entry existing — executeRevive port-probes first). */
export function giantRootCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const cands = [env.GIANT_ROOT || null, "/home/z/estate/giant", "/home/z/g70/giant", "/home/z/audit/giant"].filter(Boolean) as string[];
  return [...new Set(cands)];
}
export function discoverCommanderRoot(
  exists: (p: string) => boolean,
  env: Record<string, string | undefined> = process.env,
): string | null {
  for (const root of giantRootCandidates(env)) {
    if (exists(`${root}/mini-services/organ-commander/index.ts`)) return root;
  }
  return null;
}
const _discovered = discoverCommanderRoot((p) => existsSync(p));
export const GIANT_ROOT = _discovered ?? "/home/z/estate/giant";
const BUN = "/usr/local/bin/bun";
const LOG_ROOT = "/home/z/audit/architect";

const PLANS: Record<string, SpawnPlan> = {
  "dex-node": {
    organ: "dex-node",
    tag: "saos-dex-node/index.ts",
    cmd: [BUN, "mini-services/saos-dex-node/index.ts"],
    cwd: GIANT_ROOT, env: {}, port: 3010,
    log: `${LOG_ROOT}/dex-node.log`,
    mkDirs: ["/home/z/my-project/repos/saos-dex/db"],
  },
  "soldier-army": {
    organ: "soldier-army",
    tag: "soldier-army/index.ts",
    cmd: [BUN, "mini-services/soldier-army/index.ts"],
    cwd: GIANT_ROOT, env: {}, port: 3018,
    log: `${LOG_ROOT}/soldier-army.log`,
  },
  "dex-economy-bridge": {
    organ: "dex-economy-bridge",
    tag: "dex-economy-bridge/index.ts",
    cmd: [BUN, "mini-services/dex-economy-bridge/index.ts"],
    cwd: GIANT_ROOT,
    env: { BRIDGE_DEX_DB: "/home/z/my-project/repos/saos-dex/db/dex.db" },
    port: 3017,
    log: `${LOG_ROOT}/dex-economy-bridge.log`,
  },
  "issue-forge": {
    organ: "issue-forge",
    tag: "issue-forge/index.ts",
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
  /** live pids already running this organ's script (measured cure 19.85c:
   * two saos-dex-node wrappers raced the self-clone and corrupted .git) */
  procSiblings?: (tag: string) => number[];
}

export interface ReviveResult { spawned: boolean; reason: string; }

export async function executeRevive(plan: SpawnPlan, io: ReviveIo): Promise<ReviveResult> {
  if (await io.aliveCheck(plan.port)) {
    return { spawned: false, reason: `port ${plan.port} already alive — port-first authority, zero duplicates` };
  }
  const sibs = io.procSiblings ? io.procSiblings(plan.tag) : [];
  if (sibs.length > 0) {
    return { spawned: false, reason: `organ process already running (pid ${sibs[0]}${sibs.length > 1 ? ` +${sibs.length - 1}` : ""}) — proc-first authority, zero duplicates` };
  }
  for (const dir of plan.mkDirs ?? []) mkdirSync(dir, { recursive: true });
  mkdirSync(dirname(plan.log), { recursive: true });
  io.spawn(plan);
  return { spawned: true, reason: `spawned pid for port ${plan.port} (detached, log ${plan.log})` };
}
