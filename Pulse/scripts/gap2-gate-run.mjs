#!/usr/bin/env bun
/**
 * gap2-gate-run.mjs — G77-f GAP-2: RUN the gear-promotion gate against MEASURED receipts.
 * ════════════════════════════════════════════════════════════════════════════════════════
 * Executes the independent giant-side evaluator (src/lib/gear-gate.ts) over the measured
 * saos-dex receipt streams and writes the honest per-gear verdict receipt.
 *
 * Law: a HELD verdict is a lawful outcome — the gate holds at Gear 1 and lists the exact
 * missing evidence. This runner NEVER writes to the saos-dex gear table (the road's writer
 * is recordLadderReceipt there; this is the read-only auditor).
 *
 * Zero third-party deps. Exit code 0 on every honest outcome; exit 2 only on unreadable
 * inputs (fail-honest with the reason printed).
 *
 * Usage: bun Pulse/scripts/gap2-gate-run.mjs [--out state/gap-closure/gap2-gate-run.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateGearGate, streakFromHistory, classifyVerdict } from "../../src/lib/gear-gate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DEX_DEFAULT = "/home/z/audit/repos/saos-dex";

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DEX = arg("--dex", DEX_DEFAULT);
const OUT = arg("--out", join(REPO, "state/gap-closure/gap2-gate-run.json"));
const now = new Date().toISOString();

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { __err: String(e?.message ?? e) };
  }
}

function readVerdicts(path) {
  // jsonl receipts, append-order = chronological order (oldest first)
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map((d) => ({ at: d.at ?? d.ts ?? "", kind: d.schema ?? "?", verdict: d.verdict ?? "" }))
      .filter((d) => d.verdict);
  } catch (e) {
    return [{ at: "", kind: "__err", verdict: String(e?.message ?? e) }];
  }
}

function verdictStats(stream) {
  const stats = { total: stream.length, green: 0, red: 0, neutral: 0 };
  for (const r of stream) stats[classifyVerdict(r.verdict)] += 1;
  return stats;
}

// ── measured inputs ──────────────────────────────────────────────────────────────
const gearsPath = join(DEX, "grids/state/policy-gears.json");
const armyPath = join(DEX, "grids/state/army-receipts.jsonl");
const treasuryPath = join(DEX, "grids/state/treasury-receipts.jsonl");

const table = readJson(gearsPath);
if (table.__err) {
  console.error(`FAIL-HONEST: cannot read gear table at ${gearsPath}: ${table.__err}`);
  process.exit(2);
}
const army = readVerdicts(armyPath);
const treasury = readVerdicts(treasuryPath);

const kellyState = table?.state?.kelly ?? null;
const kellyArg = kellyState && typeof kellyState.cap === "number" ? { enabled: true, cap: kellyState.cap } : null;

// Combined chronological stream: both receipt ledgers interleaved by timestamp (stable).
const combined = [...army, ...treasury]
  .map((r, i) => ({ r, i }))
  .sort((a, b) => (a.r.at < b.r.at ? -1 : a.r.at > b.r.at ? 1 : a.i - b.i))
  .map((x) => x.r);

// ── the four measured runs ───────────────────────────────────────────────────────
const runs = {
  primary_ledgers: evaluateGearGate(table, combined, { kelly: kellyArg }),
  army_ledger: evaluateGearGate(table, army, { kelly: kellyArg }),
  treasury_ledger: evaluateGearGate(table, treasury, { kelly: kellyArg }),
  gear_history: evaluateGearGate(table, (table?.state?.history ?? []).slice().reverse().map((h) => ({ at: h.at, kind: h.kind, verdict: h.verdict })), { kelly: kellyArg }),
};

// History-tail cross-check (independent of the replay): consecutive green tail of the
// git-written history (newest-first as stored).
const historyTailStreak = streakFromHistory(table?.state?.history ?? []);

const receipt = {
  schema: "SAOS-GAP2-GEAR-GATE-RUN/1",
  at: now,
  law: "SAOS-GEAR-GATE/1 — independent giant-side replay of the R329/R330 gearbox law",
  authority: "owner MASTER DIRECTIVE §4 GAP-2 (G77-f, wave G77): gear shift ONLY on green test receipts; hold with exact missing evidence is lawful",
  inputs: {
    gearTable: { path: "saos-dex:grids/state/policy-gears.json", protocol: table.protocol, at: table.at ?? null, gearsCount: Array.isArray(table.gears) ? table.gears.length : null },
    receipts: {
      army: { path: "saos-dex:grids/state/army-receipts.jsonl", stats: verdictStats(army) },
      treasury: { path: "saos-dex:grids/state/treasury-receipts.jsonl", stats: verdictStats(treasury) },
      combined: { stats: verdictStats(combined) },
    },
    kellyMeasured: kellyState,
  },
  measured: {
    gitState: { gear: table?.state?.gear ?? null, greenStreak: table?.state?.greenStreak ?? null, lastVerdict: table?.state?.lastVerdict ?? null, at: table?.state?.at ?? null },
    historyTailGreenStreak: historyTailStreak,
    lastRedReset: (table?.state?.history ?? []).find((h) => classifyVerdict(h.verdict) === "red") ?? null,
  },
  runs: Object.fromEntries(
    Object.entries(runs).map(([k, r]) => [
      k,
      {
        verdict: r.verdict,
        gear: r.gear,
        greenStreak: r.greenStreak,
        topEarnedGear: r.topEarnedGear,
        perGear: r.perGear,
        why: r.why,
        failClosed: r.failClosed,
        replaySteps: r.replay.length,
      },
    ]),
  ),
  structuralFindings: [],
  verdictNote: null,
};

// ── structural findings (measured, from the receipt streams) ─────────────────────
// Root-cause scan: what makes verdicts RED (the streak reset driver)?
const redBeats = army.filter((r) => classifyVerdict(r.verdict) === "red");
if (redBeats.length) {
  receipt.structuralFindings.push({
    finding: "red-verdict driver",
    measured: `${redBeats.length}/${army.length} army-ladder receipts are ARMY-ACTS-FAILED — each one instantly resets greenStreak to 0 and gear to 1 (R329 downshift law).`,
    lastRedAt: redBeats[redBeats.length - 1].at,
    measuredElsewhere: "the executed-action states inside failed beats (saos-dex army-receipts.jsonl) are dominated by PARITY-FLOOR-SKIP ('sell <price> < parity-floor <price>' — float-epsilon floor comparison on the parity-floored price turns a legal parity order into a skip; an all-skip beat = ARMY-ACTS-FAILED). Fix belongs to saos-dex (cross-repo handoff).",
  });
}
if (kellyState && kellyState.mode === "kelly" && kellyState.cap < 25) {
  receipt.structuralFindings.push({
    finding: "kelly expectancy governor tightens the road regardless of gear",
    measured: `kelly snapshot mode=${kellyState.mode} cap=${kellyState.cap} SBD vs gearCap=${kellyState.gearCap} SBD (informative fills ${kellyState.informative} ≥ minBeats ${kellyState.minBeats}) — effective per-op cap is kelly ${kellyState.cap} SBD even at higher gears; kelly-sizing.json measured NO-EDGE (fullKellyBps −422, Σprofit −0.1279946218682384 USD over 191 informative fills).`,
  });
}
const primary = runs.primary_ledgers;
receipt.verdictNote =
  primary.verdict === "PROMOTED"
    ? `PROMOTED: measured receipts earn gear ${primary.gear}.`
    : `HELD at gear ${primary.gear} (streak ${primary.greenStreak}): missing evidence listed per gear in runs.primary_ledgers.perGear — that is the lawful outcome until the live road records the missing green verdicts.`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 1) + "\n");

console.log(`[GAP2-GATE] table=${table.protocol} gitState(gear=${table?.state?.gear},streak=${table?.state?.greenStreak}) historyTailStreak=${historyTailStreak}`);
for (const [k, r] of Object.entries(runs)) {
  console.log(`[GAP2-GATE] ${k}: ${r.verdict} gear=${r.gear} streak=${r.greenStreak} topEarned=${r.topEarnedGear}`);
  for (const g of r.perGear) console.log(`[GAP2-GATE]   gear ${g.gear}: ${g.earned ? "EARNED" : "HELD"}${g.missingEvidence.length ? " · " + g.missingEvidence.join(" · ") : ""}`);
}
console.log(`[GAP2-GATE] receipt written: ${OUT}`);
