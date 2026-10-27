/* ═══ issue-forge · index.ts — headless HTTP shell (port 3046 · loopback only) ═══
 * GET  /health → {ok, uptimeMs, lastCycle}
 * GET  /state  → {claims, lastFindings, ledgerTail}
 * POST /cycle  → one bounded cycle (audit → issues → claim → author → verify → ship)
 *
 * Loop mode: FORGE_INTERVAL_MS set → setInterval single-flight loop (clamped to
 * ≥30s); otherwise idle — manual/external cron triggers POST /cycle.
 * EADDRINUSE → log + exit 1 honestly. The server never blocks on listen errors.
 */
import {
  appendLedger,
  CLAIM_LOCK,
  PORT,
  readLedgerTail,
  readLock,
  redact,
  REPO_ROOT,
  STALE_LOCK_MS,
} from "./forge.ts";
import { CycleVerdict, runCycle } from "./cycle.ts";

const startedAt = Date.now();
let lastCycle: { at: string; cycle: number; verdict: string; ok: boolean } | null = null;
let lastFindings: CycleVerdict["findings"] = [];
let cycleRunning = false;

async function runCycleTracked(): Promise<CycleVerdict> {
  if (cycleRunning) {
    return {
      ok: false,
      cycle: 0,
      verdict: "busy",
      audit: { todo: 0, testgap: 0, ledger: 0 },
      issuesCreated: [],
      findings: [],
      detail: "a cycle is already running in this process",
    };
  }
  cycleRunning = true;
  try {
    const v = await runCycle(REPO_ROOT);
    lastCycle = { at: new Date().toISOString(), cycle: v.cycle, verdict: v.verdict, ok: v.ok };
    if (v.findings.length > 0) lastFindings = v.findings;
    return v;
  } catch (e) {
    const detail = redact(e instanceof Error ? e.message : String(e));
    appendLedger({ cycle: 0, phase: "cycle", issue: null, verdict: "crash", detail: detail.slice(0, 500) });
    return { ok: false, cycle: 0, verdict: "crash", audit: { todo: 0, testgap: 0, ledger: 0 }, issuesCreated: [], findings: lastFindings, detail };
  } finally {
    cycleRunning = false;
  }
}

function json(x: unknown, status = 200): Response {
  return new Response(redact(JSON.stringify(x, null, 2)), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function claimsSnapshot(): { lockHeld: boolean; holder: { pid: number; ts: number } | null; staleAfterMs: number } {
  const holder = readLock(CLAIM_LOCK);
  return { lockHeld: holder !== null, holder, staleAfterMs: STALE_LOCK_MS };
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 255, // a cycle can take minutes (lint gate) — keep the socket alive
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, uptimeMs: Date.now() - startedAt, lastCycle });
    }
    if (req.method === "GET" && url.pathname === "/state") {
      return json({ claims: claimsSnapshot(), lastFindings, ledgerTail: readLedgerTail(20) });
    }
    if (req.method === "POST" && url.pathname === "/cycle") {
      const v = await runCycleTracked();
      return json(v);
    }
    return new Response("not-found (issue-forge: /health /state /cycle)\n", { status: 404 });
  },
});

/* loop mode — otherwise idle, waiting for POST /cycle */
const intervalRaw = Number(process.env.FORGE_INTERVAL_MS ?? "");
if (Number.isFinite(intervalRaw) && intervalRaw > 0) {
  const interval = Math.max(30_000, intervalRaw);
  console.info(`[issue-forge] loop mode: every ${interval}ms (single-flight guarded by claim.lock)`);
  setInterval(() => {
    void runCycleTracked().then((v) => {
      console.info(`[issue-forge] cycle ${v.cycle}: ${v.verdict} — ${v.detail.slice(0, 160)}`);
    });
  }, interval);
}

console.info(`[issue-forge] listening on http://127.0.0.1:${PORT} — repo root: ${REPO_ROOT}`);
console.info("[issue-forge] §9 loop: AUDIT → ISSUES → CLAIM → AUTHOR → VERIFY → SHIP → LEDGER (single-flight, honest)");
