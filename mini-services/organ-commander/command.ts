/**
 * command.ts — deterministic ranked planner. Pure function: truth + cooldowns →
 * command plan. No I/O, no clock reads (now is injected), no randomness.
 */
import type { Truth } from "./truth";

export type CommandKind = "revive" | "port-conflict" | "forge-cycle" | "runner-once" | "noop";
export interface Command {
  kind: CommandKind;
  organ: string;
  priority: number;
  reason: string;
  /** dependency: execute only when this organ is already alive */
  after?: string;
}

/** Liquidity chain dependency order (P0): the exchange feeds everything. */
const REVIVE_ORDER = ["dex-node", "soldier-army", "dex-economy-bridge"] as const;
const P = { revive: 0, portConflict: 10, forgeCycle: 20, runnerOnce: 30, noop: 99 } as const;

export function planNext(truth: Truth, cooldowns: Record<string, number>, now: number): Command[] {
  const cmds: Command[] = [];

  // P0 — revive the liquidity chain in dependency order.
  for (let i = 0; i < REVIVE_ORDER.length; i++) {
    const organ = REVIVE_ORDER[i];
    const p = truth.organs.find((o) => o.organ === organ);
    if (!p || p.alive) continue;
    if ((cooldowns[organ] ?? 0) > now) continue; // cooldown law: no spawn spray
    const after = i === 0 ? undefined : REVIVE_ORDER[i - 1];
    cmds.push({
      kind: "revive", organ, priority: P.revive,
      reason: p.detail.slice(0, 80) || "port dead",
      after,
    });
  }

  // P1 — forge occupied by the wrong owner: diagnose, never spawn-spam.
  const forge = truth.organs.find((o) => o.organ === "issue-forge");
  if (forge && forge.alive && forge.wrongOwner) {
    cmds.push({ kind: "port-conflict", organ: "issue-forge", priority: P.portConflict, reason: "port 3046 held by local-gates-host — cure is the my-project port move (§8)" });
  } else if (forge && forge.alive && !forge.wrongOwner) {
    const idle = truth.forgeIdleMs ?? 0;
    if (truth.feedClaimable > 0 || (truth.forgeIdleMs !== undefined && idle > 30 * 60_000)) {
      cmds.push({ kind: "forge-cycle", organ: "issue-forge", priority: P.forgeCycle, reason: `forge alive — fire cycle (feed=${truth.feedClaimable}, idleMin=${Math.round(idle / 60_000)})` });
    }
  }

  // P2 — claimable contracts feed → fire the fixer runner once.
  if (truth.feedClaimable > 0) {
    cmds.push({ kind: "runner-once", organ: "issue-to-pr", priority: P.runnerOnce, reason: `${truth.feedClaimable} claimable contract(s) in meta-planner feed` });
  }

  cmds.sort((a, b) => a.priority - b.priority);
  if (cmds.length === 0) {
    return [{ kind: "noop", organ: "all", priority: P.noop, reason: "all organs alive · feed empty · nothing to command (honest no-op)" }];
  }
  return cmds;
}
