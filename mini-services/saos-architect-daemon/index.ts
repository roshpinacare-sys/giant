/* ═══ saos-architect-daemon · index.ts — the Chief Sovereign Architect ══════
 * The always-on executive of the giant trunk (MASTER DIRECTIVE §1 + §4):
 *   · beat loop: every ARCHITECT_BEAT_MS (default 30min, floor 30s) one
 *     bounded cycle — AUDIT → SELECT → CURE → VERIFY → LAND → RECEIPT
 *   · POST /cycle — one cycle on demand (same single-flight)
 *   · GET /health — liveness + last verdict; GET /status — full receipts state
 *   · CLI --once — a single provable cycle, exit code = verdict honesty
 * EADDRINUSE → honest exit 1. Loopback only. Fail-honest everywhere.
 */
import { createHash, timingSafeEqual } from "crypto";
import { readFileSync } from "node:fs";
import { PORT, runCycle, statusReport, CycleVerdict } from "./cycle.ts";
import { denyIfPublic } from "../lib/vault-auth.ts"; // גל-80 · חוק-הסף-הריבוני (§1 lockdown, trace 1a173c3929f5d23d)

/* ═══ Task S1 · operator gate (deny-by-default §1) ═══════════════════════
 * POST /cycle is an owner-level mutation (audit→select→cure→verify→land→
 * receipt — it may commit+push the giant trunk). Mirror of the dex engine
 * operator gate (saos-dex src/lib/operator-auth.ts): header x-saos-operator
 * must equal env SAOS_ADMIN_TOKEN, sha256 digests compared timing-safe.
 * FAIL-CLOSED: token unset/empty → every HTTP mutation 403.
 * The internal beat loop calls oneCycle() in-process — NOT affected by this
 * HTTP gate. Read-only /health + /status stay open (transparency by design). */
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
function operatorOk(req: Request): boolean {
  const expected = adminToken();
  if (!expected) return false; // fail-closed — gate stays shut without a token
  const given = (req.headers.get("x-saos-operator") ?? "").trim();
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  try { return timingSafeEqual(a, b); } catch { return false; }
}

const startedAt = Date.now();
let lastCycle: CycleVerdict | null = null;
let cycleRunning = false;

async function oneCycle(): Promise<CycleVerdict> {
  if (cycleRunning) {
    return { ok: false, verdict: "lock-held", beforeErrors: -1, afterErrors: -1, detail: "cycle already running in this process" };
  }
  cycleRunning = true;
  try {
    lastCycle = runCycle();
    return lastCycle;
  } finally {
    cycleRunning = false;
  }
}

function health() {
  return {
    ok: true,
    service: "saos-architect-daemon",
    role: "Chief Sovereign Architect — giant trunk executive",
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    lastCycle: lastCycle ? { verdict: lastCycle.verdict, ok: lastCycle.ok, cureId: lastCycle.cureId, errors: `${lastCycle.beforeErrors}→${lastCycle.afterErrors}`, pushed: lastCycle.pushed, at: new Date().toISOString() } : null,
  };
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json(health());
    if (url.pathname === "/status") return Response.json({ ...health(), status: statusReport() });
    if (url.pathname === "/cycle" && req.method === "POST") {
      // Task S1 deny-by-default §1: owner mutation requires the operator token (403, fail-closed)
      if (!operatorOk(req)) {
        console.warn(`[saos-architect-daemon] DENY ${req.method} ${url.pathname} — unauthenticated mutation (Task S1, x-saos-operator required)`);
        return new Response(JSON.stringify({ ok: false, error: "forbidden", law: "deny-by-default/1", note: "send header x-saos-operator matching SAOS_ADMIN_TOKEN" }), { status: 403, headers: { "content-type": "application/json" } });
      }
      const deny = denyIfPublic(req, "saos-architect-daemon"); // גל-80 · מוטציה-ציבורית בלי-טוקן → 403 (defense-in-depth under S1 gate)
      if (deny) return deny;
      const v = await oneCycle();
      return Response.json({ ...v }, { status: v.ok ? 200 : (v.verdict === "lock-held" ? 409 : 500) });
    }
    return new Response("not-found", { status: 404 });
  },
  error() {
    return new Response("internal", { status: 500 });
  },
});

console.log(`[saos-architect-daemon] executive live on :${PORT} (pid ${process.pid}) — audit→select→cure→verify→land→receipt`);

if (process.argv.includes("--once")) {
  const v = await oneCycle();
  console.log(`[saos-architect-daemon] once: ${JSON.stringify(v)}`);
  server.stop(true);
  process.exit(v.ok ? 0 : 1);
}

const beatRaw = Number(process.env.ARCHITECT_BEAT_MS ?? 30 * 60 * 1000);
const beat = Math.max(30_000, beatRaw);
setInterval(() => {
  oneCycle()
    .then((v) => console.log(`[saos-architect-daemon] beat: ${v.verdict}${v.cureId ? ` (${v.cureId})` : ""}${v.beforeErrors >= 0 ? ` tsc ${v.beforeErrors}→${v.afterErrors}` : ""}${v.pushed === false ? ` push-unverified: ${v.detail ?? ""}` : ""}`))
    .catch((e) => console.log(`[saos-architect-daemon] beat-error: ${String(e).slice(0, 200)}`));
}, beat);
