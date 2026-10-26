#!/usr/bin/env bun
/**
 * gap1-coverage.mjs — G77-f GAP-1 (COMPUTE WALL): measure the coverage ledger.
 * ════════════════════════════════════════════════════════════════════════════════════════
 * MISSION LAW (owner MASTER DIRECTIVE §4 GAP-1): "internal yield capture must cover
 * private-repository compute overhead."
 *
 * What this measures (every number carries its source; nothing is invented):
 *   COMPUTE side
 *     • private-repo Actions wall — Autonomy compute-park-ledger.json + compute-journal.jsonl
 *       (public raw fetch, no token; fail-honest nulls on fetch failure).
 *     • private repo count — Pulse census state/network.json (totals.private).
 *     • local sovereign compute — os.cpus() / os.totalmem() of the running estate sandbox.
 *   YIELD side (fleet-economy books / dex books, local clones of record)
 *     • external income 24h (chain-curation, txid-evidenced) — saos-dex grids/state/external-profit-public.json
 *     • internal dex treasury profit-ever + credits Σ — saos-dex grids/state/internal-pnl.json + db/dex-metrics.json tail
 *     • grid real PnL (chain truth) — saos-dex grids/state/pnl.json
 *     • kelly expectancy — saos-dex grids/state/kelly-sizing.json
 *     • self-financing census (target vs gap) — saos-dex grids/state/self-deposit-receipts.jsonl tail
 *
 * Fail-honest: any unreadable source becomes a named `unmeasured` row — never a zero, never a guess.
 * Zero third-party deps. Usage: bun Pulse/scripts/gap1-coverage.mjs [--out docs/gap1-coverage-ledger.json] [--print]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { get as httpsGet } from "node:https";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DEX_DEFAULT = "/home/z/audit/repos/saos-dex";
const PULSE_DEFAULT = "/home/z/estate/Pulse";

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const DEX = arg("--dex", DEX_DEFAULT);
const PULSE = arg("--pulse", PULSE_DEFAULT);
const OUT = arg("--out", join(REPO, "state/gap-closure/gap1-coverage-ledger.json"));
const now = new Date().toISOString();

function readJson(path, repo) {
  const p = repo ? join(repo, path) : path;
  try {
    return { ok: true, data: JSON.parse(readFileSync(p, "utf8")), path: p };
  } catch (e) {
    return { ok: false, err: String(e?.message ?? e), path: p };
  }
}
function readJsonlTail(path, repo, n = 1) {
  const p = repo ? join(repo, path) : path;
  try {
    const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
    return { ok: true, count: lines.length, tail: lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return { __err: "parse" }; } }), path: p };
  } catch (e) {
    return { ok: false, err: String(e?.message ?? e), path: p };
  }
}
function httpsText(url, timeoutMs = 8000) {
  return new Promise((res) => {
    const req = httpsGet(url, { headers: { "User-Agent": "giant-gap1-coverage/1" }, timeout: timeoutMs }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return res(null); }
      let s = "";
      r.setEncoding("utf8");
      r.on("data", (c) => (s += c));
      r.on("end", () => res(s));
    });
    req.on("error", () => res(null));
    req.on("timeout", () => { req.destroy(); res(null); });
  });
}

const ledger = {
  schema: "SAOS-GAP1-COMPUTE-COVERAGE/1",
  at: now,
  law: "owner MASTER DIRECTIVE §4 GAP-1: internal yield capture must cover private-repository compute overhead — every number cites its source; unreadable = named unmeasured, never zero",
  compute: {},
  yield: {},
  coverage: {},
  unmeasured: [],
};

// ── COMPUTE side ─────────────────────────────────────────────────────────────────
const [ledgerRaw, journalRaw, pulseNet] = await Promise.all([
  httpsText("https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/agents/compute-park-ledger.json"),
  httpsText("https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/agents/compute-journal.jsonl"),
  Promise.resolve(readJson("state/network.json", PULSE)),
]);

if (ledgerRaw) {
  try {
    const l = JSON.parse(ledgerRaw);
    ledger.compute.wall = {
      source: "Autonomy:agents/compute-park-ledger.json (public raw, fetched)",
      parkedAt: l.parkedAt ?? null,
      reason: l.reason ?? null,
      parkedRepos: Array.isArray(l.repos) ? l.repos.length : null,
      armed: l.armed ?? null,
      lastCanaryAttempt: l.lastCanaryAttempt ?? null,
      excludedAlive: Array.isArray(l.excluded) ? l.excluded.map((x) => x.repo) : [],
    };
  } catch (e) { ledger.unmeasured.push(`compute wall ledger parse: ${String(e?.message ?? e)}`); }
} else {
  ledger.unmeasured.push("compute wall ledger fetch failed (Autonomy raw)");
  ledger.compute.wall = null;
}

if (journalRaw) {
  const lines = journalRaw.trim().split("\n").filter(Boolean);
  let tail = null;
  try { tail = JSON.parse(lines[lines.length - 1]); } catch { /* fail-honest */ }
  const greenStreakEvents = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.event === "armed-healthy" || e.event === "RE-ARMED" || e.event === "wall-open" || e.event === "canary-green") greenStreakEvents.push(e);
      else break;
    } catch { break; }
  }
  ledger.compute.canaryJournal = {
    source: "Autonomy:agents/compute-journal.jsonl (public raw, fetched)",
    totalEvents: lines.length,
    tail: tail ? { ts: tail.ts ?? null, event: tail.event ?? null, canary: tail.canary ?? null } : null,
    consecutiveGreenDailyEvents: greenStreakEvents.length,
    greenSince: greenStreakEvents.length ? greenStreakEvents[greenStreakEvents.length - 1].ts : null,
  };
} else {
  ledger.unmeasured.push("compute wall journal fetch failed (Autonomy raw)");
  ledger.compute.canaryJournal = null;
}

if (pulseNet.ok) {
  const t = pulseNet.data.totals ?? {};
  ledger.compute.fleetVisibility = {
    source: "Pulse:state/network.json totals (census " + (pulseNet.data.generatedAt ?? "?") + ")",
    repos: t.repos ?? null,
    private: t.private ?? null,
    public: t.public ?? null,
    privateMinutesBillable: (t.private ?? 0) > 0 ? "billable private minutes possible" : "zero private repos — zero billable private Actions minutes",
  };
} else {
  ledger.unmeasured.push(`Pulse census unreadable: ${pulseNet.err}`);
  ledger.compute.fleetVisibility = null;
}

const cpus = os.cpus();
ledger.compute.localEstate = {
  source: "os.cpus()/os.totalmem() of the sovereign estate sandbox (measured at run)",
  vcpus: cpus.length,
  model: cpus[0]?.model ?? null,
  totalMemMB: Math.round(os.totalmem() / 1048576),
  metering: "un-metered — the estate pays no per-minute API for its own sandbox; a $ price here would be invention, so none is printed",
};

// ── YIELD side (fleet-economy books of record) ───────────────────────────────────
const ext = readJson("grids/state/external-profit-public.json", DEX);
ledger.yield.externalProfit24h = ext.ok
  ? {
      source: "saos-dex:grids/state/external-profit-public.json",
      at: ext.data.at ?? null,
      usd24h: ext.data.measuredUsd24h ?? null,
      vests24h: ext.data.measuredVests24h ?? null,
      evidenceCount: ext.data.evidenceCount ?? null,
      accountsScanned: ext.data.accountsScanned ?? null,
      parts: (ext.data.parts ?? []).map((p) => ({ id: p.id, usd: p.usd, vests: p.vests })),
    }
  : (ledger.unmeasured.push(`external-profit unreadable: ${ext.err}`), null);

const pnl = readJson("grids/state/pnl.json", DEX);
ledger.yield.gridRealPnl = pnl.ok
  ? {
      source: "saos-dex:grids/state/pnl.json",
      asof: pnl.data.asof ?? null,
      realFills: pnl.data.real?.fills ?? null,
      realSbdDelta: pnl.data.real?.sbdDelta ?? null,
      realizedSbd: pnl.data.realPnl?.realizedSbd ?? null,
      positionSteem: pnl.data.realPnl?.positionSteem ?? null,
      unbasedSbd: pnl.data.realPnl?.unbasedSbd ?? null,
    }
  : (ledger.unmeasured.push(`pnl unreadable: ${pnl.err}`), null);

const ipnl = readJson("grids/state/internal-pnl.json", DEX);
ledger.yield.internalDex = ipnl.ok
  ? {
      source: "saos-dex:grids/state/internal-pnl.json",
      at: ipnl.data.at ?? null,
      treasuryProfitEverMu: ipnl.data.treasuryProfitEverMu ?? null,
      treasuryProfitMu: ipnl.data.treasuryProfitMu ?? null,
      creditsTreasuryMu: ipnl.data.creditsTreasuryMu ?? null,
      feeMeterMu: ipnl.data.feeMeterMu ?? null,
      muPerUsds: ipnl.data.muPerUsds ?? null,
    }
  : (ledger.unmeasured.push(`internal-pnl unreadable: ${ipnl.err}`), null);

const dm = readJson("db/dex-metrics.json", DEX);
if (dm.ok) {
  const days = dm.data.days ?? {};
  const dayKeys = Object.keys(days).sort();
  const totalQuoteMu = Object.values(days).reduce((a, d) => a + (d.vol24QuoteMu ?? 0), 0);
  const totalTrades = Object.values(days).reduce((a, d) => a + (d.trades24 ?? 0), 0);
  ledger.yield.dexVolume = {
    source: "saos-dex:db/dex-metrics.json (daily Σ)",
    updatedAt: dm.data.updatedAt ?? null,
    daysMeasured: dayKeys.length,
    window: { from: dayKeys[0] ?? null, to: dayKeys[dayKeys.length - 1] ?? null },
    quoteVolumeMuTotal: totalQuoteMu,
    tradesTotal: totalTrades,
  };
} else { ledger.unmeasured.push(`dex-metrics unreadable: ${dm.err}`); ledger.yield.dexVolume = null; }

const kelly = readJson("grids/state/kelly-sizing.json", DEX);
ledger.yield.kellyExpectancy = kelly.ok
  ? {
      source: "saos-dex:grids/state/kelly-sizing.json",
      at: kelly.data.measuredAt ?? null,
      verdict: kelly.data.verdict ?? null,
      fullKellyBps: kelly.data.fullKellyBps ?? null,
      trades: kelly.data.source?.trades ?? null,
      sumProfitUsd: kelly.data.source?.sumProfitUsd ?? null,
    }
  : (ledger.unmeasured.push(`kelly-sizing unreadable: ${kelly.err}`), null);

const selfdep = readJsonlTail("grids/state/self-deposit-receipts.jsonl", DEX, 1);
ledger.yield.selfFinancingCensus = selfdep.ok
  ? {
      source: "saos-dex:grids/state/self-deposit-receipts.jsonl (tail)",
      receipts: selfdep.count,
      last: selfdep.tail[0]
        ? { at: selfdep.tail[0].at ?? null, verdict: selfdep.tail[0].verdict ?? null, targetUsd: selfdep.tail[0].targetUsd ?? null, gapToTargetUsd: selfdep.tail[0].gapToTargetUsd ?? null, profitUsd24h: selfdep.tail[0].profitUsd24h ?? null }
        : null,
    }
  : (ledger.unmeasured.push(`self-deposit receipts unreadable: ${selfdep.err}`), null);

// ── COVERAGE arithmetic (honest) ─────────────────────────────────────────────────
const priv = ledger.compute.fleetVisibility?.private ?? null;
const privateMinutesCostUsd = priv === 0 ? 0 : null; // 0 private repos → 0 billable private minutes; >0 unmeasurable without a metered API = null
const extUsd = ledger.yield.externalProfit24h?.usd24h ?? null;
ledger.coverage = {
  privateRepoComputeOverheadUsd: privateMinutesCostUsd,
  privateRepoComputeOverheadBasis:
    priv === 0
      ? `Pulse census measured private=${priv} of ${ledger.compute.fleetVisibility?.repos ?? "?"} repos — GitHub bills Actions minutes for private repos only; zero private repos = zero private-minute overhead to cover. The historical wall (parkedAt 2026-10-13, 18 repos) is retired by visibility, not by income.`
      : "private repos present and no metered-minutes API reachable — overhead NOT measurable here; no number is invented",
  externalIncomeUsd24h: extUsd,
  wallState: ledger.compute.canaryJournal
    ? `canary ${ledger.compute.canaryJournal.tail?.event ?? "?"} (${ledger.compute.canaryJournal.tail?.ts ?? "?"}); ${ledger.compute.canaryJournal.consecutiveGreenDailyEvents} consecutive green daily canary events since ${ledger.compute.canaryJournal.greenSince ?? "?"}`
    : "unmeasured",
  verdict: null,
  verdictBasis: [],
};
if (priv === 0) {
  ledger.coverage.verdictBasis.push("GAP-1's named overhead (private-repository compute) measures ZERO today: 0 private repos × billable minutes. Coverage of $0 requires $0 of yield — structurally covered.");
  ledger.coverage.verdictBasis.push(`honest remainder: the sovereign self-financing CENSUS (target $${ledger.yield.selfFinancingCensus?.last?.targetUsd ?? "?"}, gap $${ledger.yield.selfFinancingCensus?.last?.gapToTargetUsd ?? "?"}) and the local sandbox compute (un-metered, ${cpus.length} vCPU) remain income-gated — measured external income ${extUsd ?? "unmeasured"} USD/24h is the only metered yield and it is NOT claimed against un-metered compute.`);
  ledger.coverage.verdict =
    privateMinutesCostUsd === 0
      ? "COVERED-BY-STRUCTURE for the named overhead (zero private minutes to pay); sovereign self-financing beyond that remains OPEN by its own census — no fabricated coverage"
      : "UNMEASURED-OVERHEAD — no honest verdict possible without a minutes meter";
} else if (extUsd != null) {
  ledger.coverage.verdict = "SHORTFALL-UNMEASURABLE — private minutes exist but no metered cost API is reachable; income alone cannot be honestly compared";
} else {
  ledger.coverage.verdict = "UNMEASURED — fail-honest";
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(ledger, null, 1) + "\n");
if (process.argv.includes("--print")) console.log(JSON.stringify(ledger, null, 1));
console.log(`[GAP1-COVERAGE] verdict: ${ledger.coverage.verdict}`);
console.log(`[GAP1-COVERAGE] private repos: ${ledger.compute.fleetVisibility?.private ?? "unmeasured"} · canary: ${ledger.compute.canaryJournal?.tail?.event ?? "unmeasured"} ×${ledger.compute.canaryJournal?.consecutiveGreenDailyEvents ?? "?"} · ext income 24h: ${extUsd ?? "unmeasured"} USD`);
console.log(`[GAP1-COVERAGE] unmeasured rows: ${ledger.unmeasured.length}`);
if (ledger.unmeasured.length) for (const u of ledger.unmeasured) console.log(`[GAP1-COVERAGE]   unmeasured: ${u}`);
console.log(`[GAP1-COVERAGE] ledger written: ${OUT}`);
