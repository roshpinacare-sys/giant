/**
 * gear-gate — GAP-2 auditor of the canary volume gearbox (SAOS-GEAR-GATE/1)
 * ════════════════════════════════════════════════════════════════════════════════════════
 * G77-f owner directive §4: "shift trade volume limits from Canary Gear 1 to Gears 2 & 3
 * based STRICTLY on green test receipts."
 *
 * Authority split (measured, honest):
 *   • The gear TABLE of record lives in saos-dex grids/state/policy-gears.json
 *     (SAOS-POLICY-GEARS/1) — "the table lives in git; the CODE only reads the table".
 *   • The ROAD lives in saos-dex grids/policy.mjs `recordLadderReceipt` (R329/R330).
 *   • THIS module is the giant-side INDEPENDENT evaluator: it replays the exact same
 *     receipt law over a measured receipt stream and emits per-gear verdicts with the
 *     EXACT missing evidence. It mutates nothing, invents no caps, and fails closed to
 *     gear 1 on any malformed input — a hold is a lawful outcome, not a failure.
 *
 * The replayed law (verbatim semantics of saos-dex recordLadderReceipt, R329):
 *   verdict containing ACTED and not FAILED/HALTED = green → streak++
 *   verdict containing FAILED or HALTED            = red   → streak=0, gear=1 (instant)
 *   anything else (AT-TARGET / STASIS / …)         = neutral → no change
 *   upshift when streak >= next gear row's require.greenStreak (one gear per receipt)
 *
 * Zero dependencies, zero clock, zero network — deterministic by construction.
 */

export const GEAR_GATE_PROTOCOL = "SAOS-GEAR-GATE/1";

export interface GearRowCaps {
  maxNotionalPerOpSbd: number;
  maxCycleNotionalSbd: number;
}

export interface GearRow {
  gear: number;
  require: { greenStreak: number };
  laneOverrides: { grid: GearRowCaps } & Record<string, unknown>;
}

export interface GearTable {
  protocol: string;
  gears: GearRow[];
  kelly?: { enabled: boolean; [k: string]: unknown } | null;
  state?: {
    gear?: number;
    greenStreak?: number;
    lastVerdict?: string | null;
    history?: Array<{ at: string; kind: string; verdict: string; gear: number; greenStreak: number }>;
    [k: string]: unknown;
  } | null;
  [k: string]: unknown;
}

export interface GearReceipt {
  at: string;
  kind: string;
  verdict: string;
}

export type VerdictClass = "green" | "red" | "neutral";

export interface GearGateRowVerdict {
  gear: number;
  earned: boolean;
  requireGreenStreak: number;
  caps: (GearRowCaps & { kellyTightened: boolean }) | null;
  /** EXACT missing evidence — empty when earned. A hold always lists what is missing. */
  missingEvidence: string[];
}

export interface ReplayStep extends GearReceipt {
  classification: VerdictClass;
  greenStreak: number;
  gear: number;
}

export interface GearGateResult {
  law: typeof GEAR_GATE_PROTOCOL;
  /** PROMOTED = measured receipts earned the top reachable gear; HELD = insufficient evidence. */
  verdict: "PROMOTED" | "HELD";
  gear: number;
  greenStreak: number;
  perGear: GearGateRowVerdict[];
  /** The last row (by require.greenStreak) whose evidence is fully green. */
  topEarnedGear: number;
  replay: ReplayStep[];
  /** Cross-checks, discrepancies and fail-closed reasons — honest, never silent. */
  why: string[];
  /** True when the input table failed validation and gear 1 was forced (fail-closed). */
  failClosed: boolean;
}

/** R329 classification — verbatim: /ACTED/ && !/FAILED|HALTED/ green; /FAILED|HALTED/ red; else neutral. */
export function classifyVerdict(verdict: string): VerdictClass {
  const v = String(verdict ?? "");
  if (/FAILED|HALTED/.test(v)) return "red";
  if (/ACTED/.test(v)) return "green";
  return "neutral";
}

/**
 * Chronological replay of the receipt law from a cold start (gear 1, streak 0).
 * Receipts are consumed in the order given — ordering is the CALLER's measured duty
 * (the evaluator never silently reorders evidence).
 */
export function replayReceipts(
  receipts: readonly GearReceipt[],
  table?: GearTable | null,
): { gear: number; greenStreak: number; steps: ReplayStep[] } {
  const gears = validGears(table);
  const sorted = gears ? [...gears].sort((a, b) => a.require.greenStreak - b.require.greenStreak) : null;
  let gear = 1;
  let streak = 0;
  const steps: ReplayStep[] = [];
  for (const r of receipts) {
    const c = classifyVerdict(r.verdict);
    if (c === "red") {
      streak = 0;
      gear = 1;
    } else if (c === "green") {
      streak += 1;
      // one gear per receipt, top = table end
      const next = sorted?.find((row) => row.require.greenStreak > 0 && streak >= row.require.greenStreak && row.gear > gear);
      if (next) gear = next.gear;
    } // neutral: no change
    steps.push({ ...r, classification: c, greenStreak: streak, gear });
  }
  return { gear, greenStreak: streak, steps };
}

/**
 * Walk the git-written gearbox history (newest first) and derive the current green streak.
 * The law is replayed transparently: green counts, red stops, neutral neither grows nor
 * resets (a neutral tail sits transparently on top of the green run).
 */
export function streakFromHistory(
  history: ReadonlyArray<{ at: string; kind: string; verdict: string; gear: number; greenStreak: number }>,
): number {
  let n = 0;
  for (const h of history ?? []) {
    const c = classifyVerdict(h.verdict);
    if (c === "red") break;
    if (c === "green") n += 1;
    // neutral: continue — transparent to the streak
  }
  return n;
}

/** R330: effective caps = min(gear row, kelly) on money caps only; kelly never loosens. */
export function effectiveCaps(
  row: GearRow,
  kelly: { enabled: boolean; cap: number } | null | undefined,
): GearRowCaps & { kellyTightened: boolean } {
  const caps = { ...row.laneOverrides.grid, kellyTightened: false };
  if (!kelly || kelly.enabled !== true || !(typeof kelly.cap === "number" && Number.isFinite(kelly.cap) && kelly.cap > 0)) {
    return caps;
  }
  const base = caps.maxNotionalPerOpSbd;
  if (!(typeof base === "number" && Number.isFinite(base) && base > 0)) return caps;
  const cap = Math.max(0, Math.min(base, kelly.cap));
  if (cap >= base) return caps;
  const factor = cap / base;
  const out: GearRowCaps & { kellyTightened: boolean } = {
    maxNotionalPerOpSbd: cap,
    maxCycleNotionalSbd: typeof caps.maxCycleNotionalSbd === "number" && Number.isFinite(caps.maxCycleNotionalSbd) ? Math.max(1, Math.floor(caps.maxCycleNotionalSbd * factor + 1e-9)) : caps.maxCycleNotionalSbd,
    kellyTightened: true,
  };
  return out;
}

function validGears(table: GearTable | null | undefined): GearRow[] | null {
  if (!table || typeof table !== "object") return null;
  if (table.protocol !== "SAOS-POLICY-GEARS/1") return null;
  const gears = Array.isArray(table.gears) ? table.gears : null;
  if (!gears || gears.length === 0) return null;
  for (const g of gears) {
    if (!g || typeof g !== "object") return null;
    if (typeof g.gear !== "number" || !Number.isFinite(g.gear)) return null;
    if (!g.require || typeof g.require.greenStreak !== "number" || !Number.isFinite(g.require.greenStreak)) return null;
    if (!g.laneOverrides || typeof g.laneOverrides !== "object") return null;
  }
  return gears as GearRow[];
}

/**
 * THE GATE — evaluate whether measured receipts earn a gear promotion.
 * Fail-closed: malformed table → HELD at gear 1 with the reason in `why` (never invents caps,
 * never promotes from broken evidence). An honest HELD lists the EXACT missing evidence per gear.
 */
export function evaluateGearGate(
  table: GearTable | null | undefined,
  receipts: readonly GearReceipt[],
  opts: { kelly?: { enabled: boolean; cap: number } | null } = {},
): GearGateResult {
  const why: string[] = [];
  const gears = validGears(table);
  if (!gears) {
    return {
      law: GEAR_GATE_PROTOCOL,
      verdict: "HELD",
      gear: 1,
      greenStreak: 0,
      perGear: [],
      topEarnedGear: 1,
      replay: [],
      why: [`fail-closed: gear table ${table ? `protocol '${(table as { protocol?: string }).protocol ?? "?"}'` : "missing/unreadable"} is not a valid ${"SAOS-POLICY-GEARS/1"} table — gear 1 forced (most conservative row)`],
      failClosed: true,
    };
  }
  if (!gears.some((g) => g.gear === 1)) {
    why.push("table carries no gear-1 row — evaluated against gear 1 baseline anyway (fail-closed conservative)");
  }

  const { gear, greenStreak, steps } = replayReceipts(receipts, table);

  // Cross-check against the git-written state/history when present (honest discrepancy reporting).
  const st = table?.state ?? null;
  if (st) {
    if (typeof st.gear === "number" && st.gear !== gear) {
      why.push(`cross-check: replayed gear ${gear} != git state gear ${st.gear} (the road is the saos-dex writer; this evaluator is read-only)`);
    }
    if (typeof st.greenStreak === "number" && st.greenStreak !== greenStreak) {
      why.push(`cross-check: replayed greenStreak ${greenStreak} != git state greenStreak ${st.greenStreak} — the receipt stream measured here is not the exact stream the road recorded`);
    }
    if (Array.isArray(st.history)) {
      const derived = streakFromHistory(st.history);
      if (derived !== greenStreak) {
        why.push(`cross-check: history-tail green streak ${derived} != replayed streak ${greenStreak} (history window is 20 entries; receipts may reach further back)`);
      }
    }
  }

  const sorted = [...gears].sort((a, b) => a.require.greenStreak - b.require.greenStreak);
  const kelly = opts.kelly ?? (table?.kelly as { enabled: boolean; cap?: number } | null | undefined) ?? null;
  const kellyCap = kelly && kelly.enabled === true && typeof (kelly as { cap?: number }).cap === "number" ? { enabled: true, cap: (kelly as { cap: number }).cap } : null;
  if (kellyCap) {
    why.push(`R330 kelly governor present (cap ${kellyCap.cap} SBD) — effective per-op cap = min(gear row, kelly); kelly tightens only`);
  }

  const perGear: GearGateRowVerdict[] = sorted.map((row) => {
    const earned = greenStreak >= row.require.greenStreak && (row.gear === 1 || gear >= row.gear);
    const capsRow = kellyCap ? effectiveCaps(row, kellyCap) : { ...row.laneOverrides.grid, kellyTightened: false };
    const missing: string[] = [];
    if (!earned) {
      const need = row.require.greenStreak - greenStreak;
      missing.push(
        `greenStreak ${greenStreak}/${row.require.greenStreak} — ${need} more consecutive green verdict${need === 1 ? "" : "s"} required (e.g. ARMY-ACTED/LADDER-ACTED)`,
      );
      if (gear < row.gear) missing.push(`replay sits in gear ${gear}; row ${row.gear} unlocks only after the streak requirement above is met on the live road`);
    }
    return {
      gear: row.gear,
      earned,
      requireGreenStreak: row.require.greenStreak,
      caps: capsRow,
      missingEvidence: missing,
    };
  });

  const topEarned = perGear.filter((g) => g.earned).reduce((acc, g) => Math.max(acc, g.gear), 1);
  return {
    law: GEAR_GATE_PROTOCOL,
    verdict: topEarned >= gear && gear > 1 ? "PROMOTED" : "HELD",
    gear,
    greenStreak,
    perGear,
    topEarnedGear: topEarned,
    replay: steps,
    why,
    failClosed: false,
  };
}
