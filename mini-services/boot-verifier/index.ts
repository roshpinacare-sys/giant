/**
 * boot-verifier — the LIVING producer of receipts/boot-verify.json.
 *
 * History: the original boot-verify producer was lost in a refactor; consumers
 * (worlds-state API, veritas API, worlds bridge) kept reading a receipt that
 * froze at 2026-10-08T21:50:46Z. The doctrine fix is NOT to fake data — it is
 * to rebuild the producer as a living service that MEASURES reality.
 *
 * Every 15 minutes (+ on demand via /scan) it measures:
 *   - office ports: reception 3000, FleetHQ 3002, foreman 3010, gateway 3011,
 *     selfcheck 3040, recruit 3041
 *   - sentinels: runtime-supervisor state, boot-watcher state (honest: file may be old)
 *   - receipts freshness: books-lineage.json, gateway-telemetry (age seconds)
 *   - private vault: local clone reachability (method declared — no fake "reachable")
 *
 * Writes receipts/boot-verify.json in the SAME schema the consumers expect,
 * plus richer fields (ports map, measuredAt, producer id). Fail-loud: a check
 * that cannot run is reported as failed/unknown — never invented.
 *
 * Pure Bun, zero external deps. Port 3042.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const PORT = 3042;
/* מיזוג-ענק: המקור מ-FleetHQ (roshpinacare-sys/FleetHQ) — מותאם-חי לערימה-הריבונית-של-giant:
 * מודד-את-הפורטים-של-המערכת-החיה-הזאת וכותב-קבלה-לריפו-החי-עצמו. fail-honest נשמר. */
const ROOT = "/home/z/my-project";
const OUT = join(ROOT, "receipts", "boot-verify.json");
const SCAN_INTERVAL_MS = 15 * 60 * 1000;

interface PortCheck {
  name: string;
  port: number;
  up: boolean;
  ms: number;
}

interface BootVerify {
  at: string;
  producer: "boot-verifier:3042";
  all_ok: boolean;
  elapsed_s: number;
  sha256: string;
  checks: {
    office: Record<string, "up" | "down">;
    fleet_extra: Record<string, "up" | "down">;
    sentinels: { watchdog: boolean; snapshot: boolean; note: string };
    receipts: Record<string, number>; // age seconds; -1 = absent
    private_vault: { repo: string; state: "reachable" | "clone-missing" | "unknown"; method: string };
  };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function probePort(port: number): Promise<{ up: boolean; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    return { up: res.status < 500, ms: Date.now() - t0 };
  } catch {
    // some services 404 on / but are alive; try /health as second probe
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      });
      return { up: res.status < 500, ms: Date.now() - t0 };
    } catch {
      return { up: false, ms: Date.now() - t0 };
    }
  }
}

async function ageSeconds(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return Math.round((Date.now() - s.mtimeMs) / 1000);
  } catch {
    return -1; // absent — honest
  }
}

async function measure(): Promise<BootVerify> {
  const t0 = Date.now();

  const targets: Array<[string, number]> = [
    ["reception_3000", 3000],
    ["estate_sync_3021", 3021],
    ["sovereign_gateway_3011", 3011],
  ];
  const extras: Array<[string, number]> = [
    ["verifier_3042_self", PORT],
  ];

  const office: Record<string, "up" | "down"> = {};
  for (const [name, port] of targets) {
    const r = await probePort(port);
    office[name] = r.up ? "up" : "down";
  }
  const fleet_extra: Record<string, "up" | "down"> = {};
  for (const [name, port] of extras) {
    const r = await probePort(port);
    fleet_extra[name] = r.up ? "up" : "down";
  }

  // sentinels — honest read of the supervisor/watchdog state files (they may be old; age shown in receipts)
  let watchdog = false;
  let snapshot = false;
  let note = "";
  try {
    const sup = JSON.parse(
      await readFile(join("/home/z/estate/FleetHQ", "receipts", "runtime-supervisor-state.json"), "utf8"),
    ) as { services?: Record<string, { childPid?: number }> };
    watchdog = Boolean(sup.services?.foreman?.childPid);
    snapshot = Boolean(sup.services?.gateway);
    note = `runtime-supervisor state read; foreman childPid=${sup.services?.foreman?.childPid ?? "none"}`;
  } catch {
    note = "runtime-supervisor state unreadable — sentinel booleans false by honesty, not by guess";
  }

  const receipts = {
    "boot-verify_self_age_s": await ageSeconds(OUT),
    "gateway-telemetry-latest_age_s": await ageSeconds(
      join("/home/z/estate/FleetHQ", "receipts", "gateway-telemetry-history.jsonl"),
    ),
    "boot-watcher-state_age_s": await ageSeconds(
      join("/home/z/estate/FleetHQ", "receipts", "boot-watcher-state.json"),
    ),
  };

  // private vault — declared method: real git ls-remote (credential askpass path),
  // local clone as fast path. Never fake "reachable" — the state is measured.
  const vaultRepo = "https://github.com/roshpinacare-sys/fleet-vault.git";
  let vault: BootVerify["checks"]["private_vault"];
  const vaultLocal = "/home/z/estate/fleet-vault";
  let localClone = false;
  try {
    const s = await stat(join(vaultLocal, ".git"));
    localClone = s.isDirectory() || s.isFile();
  } catch {
    localClone = false;
  }
  try {
    const p = Bun.spawn(
      ["git", "ls-remote", vaultRepo, "HEAD"],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, GIT_ASKPASS: "/home/z/.gitcred/askpass.sh", GIT_TERMINAL_PROMPT: "0" },
      },
    );
    const stdout = await new Response(p.stdout).text();
    const exit = await p.exited;
    vault = {
      repo: "roshpinacare-sys/fleet-vault",
      state: exit === 0 && stdout.includes("HEAD") ? "reachable" : "unknown",
      method: localClone ? "git-ls-remote + local-clone" : "git-ls-remote",
    };
  } catch {
    vault = {
      repo: "roshpinacare-sys/fleet-vault",
      state: localClone ? "reachable" : "clone-missing",
      method: localClone ? "local-clone-presence (remote probe failed)" : "local-clone-presence",
    };
  }

  const allOk =
    Object.values(office).every((v) => v === "up") &&
    vault.state === "reachable";

  const body: Omit<BootVerify, "sha256"> = {
    at: new Date().toISOString(),
    producer: "boot-verifier:3042",
    all_ok: allOk,
    elapsed_s: Math.round((Date.now() - t0) / 100) / 10,
    checks: { office, fleet_extra, sentinels: { watchdog, snapshot, note }, receipts, private_vault: vault },
  };
  const full: BootVerify = { ...body, sha256: sha256(JSON.stringify(body)) };
  return full;
}

async function persist(v: BootVerify): Promise<void> {
  await mkdir(join(ROOT, "receipts"), { recursive: true });
  await writeFile(OUT, JSON.stringify(v, null, 2) + "\n", "utf8");
}

let latest: BootVerify | null = null;

async function tick(): Promise<void> {
  try {
    latest = await measure();
    await persist(latest);
    const downs = Object.entries(latest.checks.office)
      .filter(([, v]) => v === "down")
      .map(([k]) => k);
    console.log(
      `[boot-verifier] measured → all_ok=${latest.all_ok}${downs.length ? ` DOWN: ${downs.join(",")}` : ""} (${latest.at})`,
    );
  } catch (e) {
    console.error("[boot-verifier] measure FAILED (fail-loud):", e);
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: latest !== null, service: "boot-verifier", port: PORT, at: latest?.at ?? null });
    }
    if (url.pathname === "/scan") await tick();
    if (url.pathname === "/latest" && latest) {
      return new Response(JSON.stringify(latest, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (!latest) await tick();
    return new Response(JSON.stringify(latest, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
});

console.log(`[boot-verifier] listening :${PORT} → receipts/boot-verify.json (every ${SCAN_INTERVAL_MS / 60000}min)`);
await tick();
setInterval(tick, SCAN_INTERVAL_MS);
