// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL-PROFIT-NODE :3024 — שירות-הוכחת-הרווח-החוץ (חי)
//   · מריץ את מנוע-המדידה (saos-dex/grids/external-profit.mjs --measure) כל 10 דק'
//   · מריץ את פעימת-האצירה (saos-dex/grids/curate-beat.mjs --loop 24)
//   · משרת: /health · /summary (רווח-חוץ-מדוד) · /selfdeposit · /evidence
// אפס-סודות: קריאת-קבצי-מצב-ציבוריים בלבד; המפתחות נשארים בסביבת-הבן-תהליך.
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = 3024;
const DEX = "/home/z/estate/saos-dex";
const STATE = join(DEX, "grids", "state");
const bootedAt = Date.now();
let cycles = 0, lastCycleAt = 0, lastCycleErr = "", curateProc = null;

function readJson(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

function runEngine() {
  const c = spawn("node", ["grids/external-profit.mjs", "--measure"], { cwd: DEX, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  c.stdout.on("data", (d) => (out += d));
  c.stderr.on("data", (d) => (err += d));
  c.on("exit", (code) => {
    cycles++; lastCycleAt = Date.now();
    lastCycleErr = code === 0 ? "" : err.slice(-200);
    if (out.trim()) console.log("[engine]", out.trim().split("\n").pop());
    try { writeSnapshot(); } catch (e) { console.error("[snapshot]", String(e?.message ?? e).slice(0, 80)); }
  });
}

/* snapshot-ציבורי: מוטמע ל-giant.git (האיטום-האוטומטי מכניס אותו לענן)
 * והדפים שולפים אותו חי מ-raw.githubusercontent. אפס-סודות: מצב-ציבורי בלבד. */
function writeSnapshot() {
  const xp = readJson(join(STATE, "external-profit-public.json"));
  if (!xp) return;
  let curateTail: unknown[] = [];
  try {
    const lines = readFileSync(join(STATE, "curate-receipts.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    curateTail = lines.slice(-3).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { }
  const sd = readJson(join(STATE, "self-deposit-public.json"));
  const snap = {
    schema: "SAOS-EXTERNAL-PROFIT-SNAPSHOT/1",
    bakedAt: new Date().toISOString(),
    externalProfit: xp,
    curateTail,
    selfDeposit: sd ? { measuredUsd24h: sd.dailyProfit?.measuredUsd24h ?? null, parts: sd.dailyProfit?.parts ?? [], dividendLane: sd.dividendLane ?? null, verdict: sd.verdict ?? null, at: sd.at } : null,
    service: { port: PORT, cycles, lastCycleAt: lastCycleAt ? new Date(lastCycleAt).toISOString() : null, lastCycleErr },
  };
  const dir = "/home/z/my-project/mini-services/external-profit-node/state";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "external-profit-public.json"), JSON.stringify(snap, null, 1) + "\n");
}

runEngine();
setInterval(runEngine, 10 * 60e3);

curateProc = spawn("node", ["grids/curate-beat.mjs", "--loop", "24"], { cwd: DEX, stdio: ["ignore", "pipe", "pipe"] });
curateProc.stdout.on("data", (d) => console.log("[curate]", String(d).trim()));
curateProc.stderr.on("data", (d) => console.error("[curate]", String(d).trim()));

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/health") {
      const fresh = lastCycleAt && Date.now() - lastCycleAt < 31 * 60e3;
      return Response.json({
        ok: fresh, service: "external-profit-node", port: PORT,
        uptimeS: Math.round((Date.now() - bootedAt) / 1000),
        cycles, lastCycleAt: lastCycleAt ? new Date(lastCycleAt).toISOString() : null,
        lastCycleErr, curateAlive: curateProc?.exitCode === null,
      });
    }
    if (u.pathname === "/summary") {
      const xp = readJson(join(STATE, "external-profit-public.json"));
      if (!xp) return Response.json({ ok: false, why: "no public json yet (honest)" }, { status: 503 });
      return Response.json({ ok: true, ...xp });
    }
    if (u.pathname === "/selfdeposit") {
      const sd = readJson(join(STATE, "self-deposit-public.json"));
      if (!sd) return Response.json({ ok: false, why: "no self-deposit public json" }, { status: 503 });
      return Response.json({
        ok: true, at: sd.at, measuredUsd24h: sd.dailyProfit?.measuredUsd24h ?? null,
        parts: sd.dailyProfit?.parts ?? [], externalProfit: sd.externalProfit ?? null,
        dividendLane: sd.dividendLane ?? null, verdict: sd.verdict ?? null,
      });
    }
    if (u.pathname === "/evidence") {
      try {
        const lines = readFileSync(join(STATE, "external-profit.jsonl"), "utf8").trim().split("\n").filter(Boolean);
        const tail = lines.slice(-Number(u.searchParams.get("n") ?? 20)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        return Response.json({ ok: true, total: lines.length, tail });
      } catch { return Response.json({ ok: true, total: 0, tail: [] }); }
    }
    return new Response("external-profit-node :3024\n/health /summary /selfdeposit /evidence\n", { status: 404 });
  },
});
console.log(`[external-profit-node] live on :${PORT} · engine every 10min · curate every 24h`);
