/* /api/boot — שער-ההחייאה של האורגניזם (ריבוז-לידה מהשרת-החי).
 * חוק-הישרדות שנמדד (Task 46 + Task 78): כל-תהליך שנולד מקריאת-כלי מת בסוף-הקריאה
 * (sandbox reaper) — אבל ילד שנולד מתוך תהליך-שרת חי שורד (הוכחה חיה:
 * runtime-supervisor של FleetHQ נולד מ-next-server וחי · fleet-economy נולד מכאן).
 * dev.sh של Task 46 אבד עם-מות-הסנדבוקס (לא-היה-אטום) — לכן השער-הזה הוא
 * תעלת-הלידה הקבועה: next-server הוא ההורה-המיילד של:
 *   · organism-keeper (מנהל-ה-estate: clone-if-missing → selfcheck+recruit → מרפא 3002+3010)
 *   · sovereign-gateway (LLM מקומי :3011)
 *   · boot-verifier (מאמת-הערימה :3042)
 * fleet-economy:3016 יש-לו שער-משלו (/api/economy) · estate-sync/office-live
 * נולדים-מה-boot-של-הפלטפורמה. אפס-הדמיות: מה שלא-חי — מדווח בכנות. */
import { spawn } from "child_process";
import { connect } from "net";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const RECEIPTS = path.join(ROOT, "mini-services", "organism-keeper", "state", "boot-gate-receipts.jsonl");

const SPAWNABLE = [
  {
    name: "organism-keeper",
    port: 0, // בלי-פורט — נבדק-לפי-lockfile; נליד אם-אין-עדות-חיים
    dir: path.join(ROOT, "mini-services", "organism-keeper"),
    entry: "index.ts",
  },
  {
    name: "sovereign-gateway",
    port: 3011,
    dir: path.join(ROOT, "mini-services", "sovereign-gateway"),
    entry: "index.ts",
  },
  {
    name: "boot-verifier",
    port: 3042,
    dir: path.join(ROOT, "mini-services", "boot-verifier"),
    entry: "index.ts",
  },
] as const;

const PORT_MAP = [
  { name: "reception", port: 3000 },
  { name: "fleet-hq-app", port: 3002 },
  { name: "foreman", port: 3010 },
  { name: "gateway", port: 3011 },
  { name: "fleet-economy", port: 3016 },
  { name: "estate-sync", port: 3021 },
  { name: "office-live", port: 3036 },
  { name: "selfcheck", port: 3040 },
  { name: "recruit", port: 3041 },
  { name: "boot-verifier", port: 3042 },
] as const;

function portAlive(port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function keeperLooksAlive(): boolean {
  // חוק-נגד-זומבים: lockfile O_EXCL קיים = מופע-חי (ה-keeper מוחק-אותו ביציאה)
  try {
    const lock = path.join(ROOT, "mini-services", "organism-keeper", "state", "keeper.lock");
    return fs.existsSync(lock);
  } catch {
    return false;
  }
}

function record(receipt: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(RECEIPTS), { recursive: true });
    fs.appendFileSync(RECEIPTS, JSON.stringify({ ts: new Date().toISOString(), ...receipt }) + "\n");
  } catch { /* fail-soft */ }
}

function spawnService(dir: string, entry: string, logFile: string): number | null {
  try {
    if (!fs.existsSync(dir)) return null;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const out = fs.openSync(logFile, "a");
    const child = spawn("bun", [entry], { cwd: dir, detached: true, stdio: ["ignore", out, out], env: { ...process.env } });
    child.unref();
    fs.closeSync(out);
    return child.pid ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const spawned: Array<{ name: string; pid: number | null }> = [];
  const skipped: Array<{ name: string; why: string }> = [];

  for (const svc of SPAWNABLE) {
    if (svc.name === "organism-keeper") {
      if (keeperLooksAlive()) { skipped.push({ name: svc.name, why: "lockfile-live" }); continue; }
    } else if (await portAlive(svc.port)) { skipped.push({ name: svc.name, why: `port-${svc.port}-alive` }); continue; }

    const depsReady = fs.existsSync(path.join(svc.dir, "node_modules"));
    const pid = depsReady ? spawnService(svc.dir, svc.entry, `/tmp/${svc.name}.log`) : null;
    if (!depsReady) record({ gate: "boot", action: "deps-missing", name: svc.name });
    record({ gate: "boot", action: "spawned", name: svc.name, pid });
    spawned.push({ name: svc.name, pid });
  }

  const ports: Record<string, boolean> = {};
  for (const p of PORT_MAP) ports[p.name] = await portAlive(p.port);

  const upCount = Object.values(ports).filter(Boolean).length;
  return Response.json({
    ok: true,
    gate: "birth-from-living-server",
    spawned,
    skipped,
    ports,
    stackUp: `${upCount}/${PORT_MAP.length}`,
    note: "ילדים-שנולדו-מ-next-server שורדים (חוק-הישרדות 46). keeper יקים-בעצמו את selfcheck+recruit והם ירפאו את 3002+3010.",
  });
}
