/**
 * mini-guard — המשגיחה-הפנימית (גל-17 · "המכונה-המשגיחה-על-עצמה")
 * ══════════════════════════════════════════════════════════════════
 * נמדד: מנגנון-הסנדבוקס עוקר תהליכים-מנותקים (setsid/nohup — SIGTERM בלי-לוג).
 * התהליך-היחיד-שהפלטפורמה-מחזיקה-חי = שרת-Next עצמו. אז-השרת הוא-המשגיחה:
 * כל-פול-של-דלת-חיה בודק-את-פורטי-מיני-השירותים ומחייה-את-המתים.
 *
 * כנות: הילד-נולד-כבן-של-שרת-Next (לא-setsid — בן-עץ-הפלטפורמה); אם-נעקר
 * בכל-זאת — הפול-הבא (דבונס-90ש׳) מחיה-אותו-שוב. כשל = שדה-כנה, לעולם-לא-ירוק-מזויף.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { openSync, closeSync } from "node:fs";

export interface MiniServiceDef {
  name: string;
  dir: string;
  port: number;
  he: string;
}

export const MINI_SERVICES: MiniServiceDef[] = [
  { name: "estate-sync", dir: "mini-services/estate-sync", port: 3021, he: "שומר-העוגנים (estate/lane/channels)" },
  { name: "office-live", dir: "mini-services/office-live", port: 3036, he: "משדר-העולם-התלת-ממדי" },
];

const MIN_SPAWN_INTERVAL_MS = 90_000;
const lastSpawnAt: Record<string, number> = {};
const lastNote: Record<string, string> = {};

export function portAlive(port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      try { s.destroy(); } catch { /* כבר-מת */ }
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

export interface MiniServiceHealth {
  name: string;
  he: string;
  port: number;
  alive: boolean;
  restarted: boolean;
  note: string;
}

function spawnService(svc: MiniServiceDef): string {
  const cwd = path.join(process.cwd(), svc.dir);
  const logPath = path.join(process.cwd(), ".zscripts", `mini-service-${svc.name}.log`);
  let fd: number | null = null;
  try {
    fd = openSync(logPath, "a");
    const stamp = new Date().toISOString();
    const child = spawn("bun", ["run", "dev"], {
      cwd,
      /* בן-של-שרת-Next (עץ-הפלטפורמה) — בלי-setsid; ההשגחה-החוזרת-מכסה-אם-נעקר */
      stdio: ["ignore", fd, fd],
      env: { ...process.env, MINI_GUARD: "1", REVIVED_AT: stamp },
    });
    child.on("error", (e) => { lastNote[svc.name] = `spawn-error: ${e.message}`; });
    child.unref();
    lastNote[svc.name] = `revived-at ${stamp} (pid ${child.pid ?? "?"})`;
    return lastNote[svc.name];
  } catch (e) {
    lastNote[svc.name] = `spawn-failed: ${e instanceof Error ? e.message : String(e)}`;
    return lastNote[svc.name];
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* כבר-סגור */ }
    }
  }
}

/** הבריאות-הפעילה: בדיקת-פורטים + החייאה-מדובנת. זול (ms) — מותר-לקרוא-מכל-פול-דלת. */
export async function ensureMiniServices(force = false): Promise<MiniServiceHealth[]> {
  const results: MiniServiceHealth[] = [];
  for (const svc of MINI_SERVICES) {
    const alive = await portAlive(svc.port);
    if (alive) {
      results.push({ name: svc.name, he: svc.he, port: svc.port, alive: true, restarted: false, note: lastNote[svc.name] ?? "running" });
      continue;
    }
    const now = Date.now();
    const since = now - (lastSpawnAt[svc.name] ?? 0);
    if (!force && since < MIN_SPAWN_INTERVAL_MS) {
      results.push({ name: svc.name, he: svc.he, port: svc.port, alive: false, restarted: false, note: `dead · revive-debounced (${Math.round((MIN_SPAWN_INTERVAL_MS - since) / 1000)}s)` });
      continue;
    }
    lastSpawnAt[svc.name] = now;
    const note = spawnService(svc);
    results.push({ name: svc.name, he: svc.he, port: svc.port, alive: false, restarted: true, note });
  }
  return results;
}
