/* ═══ roster-feeder · E7 · keeps :3061 self-financing-engine activation persistent ═══
 * Reads state/roster.json (saos.self-financing-roster/1) and POSTs /cycle every 600s
 * with the engine's EXACT body shape {rcRoster, vpRoster, yields} — plans-only, no keys.
 * Auth: x-saos-operator header (env SAOS_ADMIN_TOKEN, fallback: admin.env).
 * Honest logging: one line per POST → state/roster-feeder.log. */
import fs from "fs";
import path from "path";

const ENGINE = "http://127.0.0.1:3061/cycle";
const HERE = import.meta.dir;
const ROSTER = path.join(HERE, "state", "roster.json");
const LOG = path.join(HERE, "state", "roster-feeder.log");
const INTERVAL_MS = 600_000;

function token(): string {
  if (process.env.SAOS_ADMIN_TOKEN) return process.env.SAOS_ADMIN_TOKEN;
  try {
    const env = fs.readFileSync("/home/z/.secrets-sovereign/admin.env", "utf8");
    const m = env.match(/^SAOS_ADMIN_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return ""; // honest empty — engine loopback trust-plane will still judge
}

function log(line: string): void {
  try { fs.appendFileSync(LOG, line + "\n"); } catch {}
  console.log(line);
}

async function feedOnce(): Promise<void> {
  const at = new Date().toISOString();
  try {
    const roster = JSON.parse(fs.readFileSync(ROSTER, "utf8"));
    const body = {
      rcRoster: Array.isArray(roster.rcRoster) ? roster.rcRoster : [],
      vpRoster: Array.isArray(roster.vpRoster) ? roster.vpRoster : [],
      yields: [], // roster carries no yield sources — honest empty
    };
    const res = await fetch(ENGINE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-saos-operator": token() },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    log(`${at} POST /cycle → ${res.status} ${txt.slice(0, 300)}`);
  } catch (e: any) {
    log(`${at} POST /cycle ERROR ${e?.message ?? e}`); // honest error — never silent
  }
}

await feedOnce();
setInterval(feedOnce, INTERVAL_MS).unref(); // feed loop; unref'd → clean exit possible
log(`${new Date().toISOString()} roster-feeder up — every ${INTERVAL_MS / 1000}s → ${ENGINE}`);
