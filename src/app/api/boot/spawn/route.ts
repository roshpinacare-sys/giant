// POST /api/boot/spawn — מסלול-החייאה חי: מקים מיני-שירות כצאצא next-server.
// חוק-הישרדות (נמדד, worklog 46+85-b): תהליך-שנולד-מקריאת-כלי מת בין-קריאות;
// צאצא-שרת-חי שורד. לכן ההחייאות עוברות דרך כאן.
// אפס-חשיפה: רשימת-היתר סגורה, פקודה קבועה לכל-שירות, לוג כנה בלבד.
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// רשימת-היתר: מה מותר להחיות דרך השער (שם-שירות → cwd יחסי ל-mini-services)
const ALLOWED: Record<string, { cwd: string; entry: string; port: number }> = {
  "organism-keeper": { cwd: "organism-keeper", entry: "index.ts", port: 0 },
  "fleet-economy": { cwd: "fleet-economy", entry: "index.ts", port: 3016 },
  "boot-verifier": { cwd: "boot-verifier", entry: "index.ts", port: 3042 },
  "office-live": { cwd: "office-live", entry: "index.ts", port: 3036 },
  "estate-sync": { cwd: "estate-sync", entry: "index.ts", port: 3021 },
  "sovereign-gateway": { cwd: "sovereign-gateway", entry: "index.ts", port: 3011 },
};

function tcpOpen(port: number): Promise<boolean> {
  if (!port) return Promise.resolve(false);
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(1200);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}

function spawnDetached(cmd: string, args: string[], cwd: string, logFile: string): number | null {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    // דפוס-double-fork-setsid: bash -c 'exec setsid nohup ...' → יתום-מיידי, שורד-חיתוכי-סשן
    const child = spawn("bash", ["-c", `exec setsid nohup ${cmd} ${args.join(" ")} >> '${logFile}' 2>&1 < /dev/null`], {
      cwd, detached: true, stdio: ["ignore", "ignore", "ignore"], env: process.env,
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { service?: string } = {};
  try { body = await req.json(); } catch { /* fail-honest */ }
  const name = String(body.service || "").trim();
  const target = ALLOWED[name];
  if (!target) {
    return NextResponse.json({ ok: false, error: "service-not-allowed", allowed: Object.keys(ALLOWED) }, { status: 400 });
  }

  const cwd = path.join("/home/z/my-project/mini-services", target.cwd);
  const logFile = `/home/z/my-project/state/spawn-${name}.log`;
  const alive = await tcpOpen(target.port);
  if (alive && target.port) {
    return NextResponse.json({ ok: true, action: "already-alive", service: name, port: target.port });
  }
  // בדיקת-מופע-יחיד: lockfile עם pid-חי = לא מקימים כפילות
  const lock = path.join(cwd, "state", `${name}.lock`);
  if (fs.existsSync(lock)) {
    try {
      const pid = parseInt(fs.readFileSync(lock, "utf8").trim(), 10);
      if (pid && fs.existsSync(`/proc/${pid}`)) {
        return NextResponse.json({ ok: true, action: "lock-held-by-live-pid", service: name, pid });
      }
    } catch { /* lock corrupted — נמשך */ }
    try { fs.unlinkSync(lock); } catch { /* fail-soft */ }
  }
  // השאת-תלותות אוטונומית: אין node_modules + יש package.json → bun install (פעם-אחת, מתוזמן)
  if (!fs.existsSync(path.join(cwd, "node_modules")) && fs.existsSync(path.join(cwd, "package.json"))) {
    try {
      const { execSync } = await import("child_process");
      execSync("bun install", { cwd, timeout: 180_000, stdio: "ignore" });
    } catch (e) {
      return NextResponse.json({ ok: false, error: "bun-install-failed: " + String(e).slice(0, 120) }, { status: 500 });
    }
  }
  const pid = spawnDetached("bun", [target.entry], cwd, logFile);
  // קבלה-כנה: לא טוענים "up" לפני מדידה
  await new Promise((r) => setTimeout(r, 1500));
  const up = target.port ? await tcpOpen(target.port) : pid ? fs.existsSync(`/proc/${pid}`) : false;
  return NextResponse.json({ ok: true, action: "spawned", service: name, pid, portUp: up, logFile });
}

export async function GET() {
  const state: Record<string, { port: number; up: boolean }> = {};
  for (const [name, target] of Object.entries(ALLOWED)) {
    state[name] = { port: target.port, up: await tcpOpen(target.port) };
  }
  return NextResponse.json({ ok: true, producer: "boot-spawn", state });
}
