/**
 * mini-guard — המשגיחה-הפנימית (גל-17 · "המכונה-המשגיחה-על-עצמה" · גל-18 · בדיקה-פונקציונלית)
 * ══════════════════════════════════════════════════════════════════
 * נמדד: מנגנון-הסנדבוקס עוקר תהליכים-מנותקים (setsid/nohup — SIGTERM בלי-לוג).
 * התהליך-היחיד-שהפלטפורמה-מחזיקה-חי = שרת-Next עצמו. אז-השרת הוא-המשגיחה:
 * כל-פול-של-דלת-חיה בודק-את-פורטי-מיני-השירותים ומחייה-את-המתים.
 *
 * גל-18 · השורש-שנמדד-חי: שומר-העוגנים-שהה-80-דקות-על-הפורט-עם-אפס-טיקים
 * (זומבי) — והמשגיחה-קראה-לו-"חי" כי-הפורט-היה-פתוח. מעכשיו: לשירות-עם-בריאות-HTTP
 * נמדד-העבודה-עצמה (טיקים-מתקדמים); פורט-פתוח-בלי-עבודה = זומבי → הריגה-והחייאה.
 * כנות: ירוק-מזויף-אסור — דלת-שלא-עובדת-מדווחת-אדום, לעולם-לא-ירוק.
 *
 * כנות: הילד-נולד-כבן-של-שרת-Next (לא-setsid — בן-עץ-הפלטפורמה); אם-נעקר
 * בכל-זאת — הפול-הבא (דבונס-90ש׳) מחיה-אותו-שוב. כשל = שדה-כנה, לעולם-לא-ירוק-מזויף.
 */
import { spawn, execFile } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { openSync, closeSync } from "node:fs";

export const MINI_SERVICES: MiniServiceDef[] = [
  { name: "estate-sync", dir: "mini-services/estate-sync", port: 3021, he: "שומר-העוגנים (estate/lane/channels/law)", probe: "estate-sync" },
  { name: "office-live", dir: "mini-services/office-live", port: 3036, he: "משדר-העולם-התלת-ממדי" },
  { name: "sovereign-gateway", dir: "mini-services/sovereign-gateway", port: 3011, he: "שער-ה-LLM-הריבוני (כל-סוכן-משוחזר)", probe: "gateway" },
  { name: "boot-verifier", dir: "mini-services/boot-verifier", port: 3042, he: "מאמת-התחייה — קבלת-בריאות-כל-15דק", probe: "boot-verifier" },
  /* גל-87 · נמדד: כל-צוות-FleetHQ-היה-אנשי-מת-מהלכים (קורפסים-מ-FleetHQ.stale-שנמחק) —
   * הממונה-האמיתי-עתה-בן-עץ-ה-Next (שושלת-השרדות); הוא-בעצמו-מחיה-פורנן/gateway/beats-כל-5ש׳.
   * single-flight-מובנה (pid-file+pidAlive) מונע-כפילות-אם-המשגיחה-משגיחה-על-המשגיח. */
  { name: "fleet-supervisor", dir: "/home/z/estate/FleetHQ/mini-services/agent-hq", port: 3010, he: "ממונה-הצי (FleetHQ: פורנן 3010 + גייטוויי + beats)", cmd: "[ -d node_modules ] || bun install --silent; exec bun tools/runtime-supervisor.ts", env: { AGENT_HQ_DATA_DIR: "/home/z/my-project/Domain" } },
  /* גל-90 · הכלכלה-הפנימית תחת-המשגיחה: נמדד שמשגיח-ה-shell שלה (supervise-economy.sh)
   * מת-עם-קציר-הסנדבוקס — מעכשיו גם-הוא בן-עץ-ה-Next (שושלת-השרדות) עם בריאות-HTTP כנה (/health). */
  { name: "fleet-economy", dir: "mini-services/fleet-economy", port: 3016, he: "הכלכלה-הפנימית (ספר-hash-chain · AMM · תורת-כותבים-רבים)", probe: "gateway" },
  /* גל-90 · מנוע-המסחר-החי על-Steem-מייננט: נמדד שמת מ-12:36 בקציר + האישור נמחק
   * (קציר-קור-מוחק-סודות-gitignored) → SIGNING-DEAD. ההחייאה-הריבונית: vault-seed.sh
   * מזריע את סיסמת-האב מהכספת-האטומה (אפס-סודות-על-stdout) → המנוע שופט-מול-השרשרת
   * ומאמץ-עצמית (T-12 fail-closed). נמדד: פתיחת-הכספת + זריעה עובדים אוטומטית. */
  { name: "saos-engine", dir: "/home/z/estate/steem/mini-services/saos-engine", port: 3040, he: "מנוע-המסחר-החי על-Steem (hyper-grid · חתימה-ריבונית מהכספת)", probe: "gateway", cmd: "bash tools/vault-seed.sh; [ -d node_modules ] || bun install --silent; exec bun run dev", env: { SAOS_ENGINE_PORT: "3040" } },
];

export interface MiniServiceDef {
  name: string;
  /** יחסי-ל-my-project או מוחלט (מחוץ-לעץ — למשל FleetHQ) */
  dir: string;
  port: number;
  he: string;
  /** סוג-הבדיקה-הפונקציונלית: "estate-sync" = מדידת-טיקים-מהבריאות-החיה. "gateway"/"boot-verifier" = בריאות-HTTP. חסר = פורט-בלבד (socket.io). */
  probe?: "estate-sync" | "gateway" | "boot-verifier";
  /** פקודת-השקה-מותאמת (default: התקנה-אם-חסר + bun run dev) */
  cmd?: string;
  /** השמה-סביבתית-מכריעה (מנצחת-את-הורשת-השרת — גל-87: AGENT_HQ_DATA_DIR ירש-נתיב-עוגן-קריאה) */
  env?: Record<string, string>;
}

const MIN_SPAWN_INTERVAL_MS = 90_000;
const lastSpawnAt: Record<string, number> = {};
const lastNote: Record<string, string> = {};

/* ── זיהוי-זומבי (גל-18): פורט-פתוח-אך-אפס-עבודה ───────────────────────
 * חוק-הכנות: עבודה = טיקים-מתקדמים. רווח-הטיק-הקנוני-של-estate-sync = 10 דק',
 * וטיק-מלא (8 עוגנים × git) יכול-להתארך — החלון-25 דק' מכסה-2.5 רווחים:
 * שירות-בריא-לעולם-לא-נחצה, זומבי-אמיתי (80 דק' במדידה) נתפס-מהר. */
const ZOMBIE_STAGNANT_MS = 25 * 60_000;
const ZOMBIE_HTTP_STRIKES = 3;
interface ProbeMem { lastTicks: number | null; stagnantSince: number | null; httpFails: number; }
const probeMem: Record<string, ProbeMem> = {};

async function probeEstateSync(port: number): Promise<{ ticks: number | null } | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = (await r.json()) as { ticks?: unknown };
    return { ticks: typeof j.ticks === "number" ? j.ticks : null };
  } catch {
    return null; /* הפורט-ענה-TCP-אך-לא-מדבר-בריאות */
  }
}

function killPortHolder(port: number): Promise<string> {
  return new Promise((resolve) => {
    execFile("lsof", ["-t", `-i:${port}`, "-sTCP:LISTEN"], { timeout: 8000 }, (err, stdout) => {
      if (err || !stdout.trim()) { resolve("kill-skip: no-listener-found"); return; }
      const pids = stdout.trim().split(/\s+/).filter((p) => /^\d+$/.test(p));
      if (pids.length === 0) { resolve("kill-skip: no-pids"); return; }
      let killed = 0;
      for (const p of pids) {
        try { process.kill(Number(p), "SIGKILL"); killed++; } catch { /* כבר-מת */ }
      }
      resolve(`zombie-killed: ${killed} holder(s) on :${port}`);
    });
  });
}

/** קביעת-מצב-פונקציונלית: null = עובד; מחרוזת = כנה; "ZOMBIE:..." = דרוש-הריגה. */
async function functionalVerdict(svc: MiniServiceDef): Promise<string | null> {
  if (svc.probe === "gateway" || svc.probe === "boot-verifier") {
    /* בריאות-HTTP-כנה: הפורט-עונה-ומדבר (gateway:/health · boot-verifier:/latest) */
    const probePath = svc.probe === "gateway" ? "/health" : "/latest";
    try {
      const r = await fetch(`http://127.0.0.1:${svc.port}${probePath}`, { signal: AbortSignal.timeout(2500) });
      return r.ok ? null : `http-${r.status} on ${probePath} (strike)`;
    } catch {
      return `no-http-probe on ${probePath} (strike)`;
    }
  }
  if (svc.probe !== "estate-sync") return null;
  const mem = (probeMem[svc.name] ??= { lastTicks: null, stagnantSince: null, httpFails: 0 });
  const p = await probeEstateSync(svc.port);
  if (!p) {
    mem.httpFails++;
    if (mem.httpFails >= ZOMBIE_HTTP_STRIKES) return `ZOMBIE: port-open but health unreachable ×${mem.httpFails}`;
    return `no-http-probe (strike ${mem.httpFails}/${ZOMBIE_HTTP_STRIKES})`;
  }
  mem.httpFails = 0;
  const ticks = p.ticks;
  if (ticks === null) return "health-speaks-but-no-tick-counter";
  if (ticks > 0 && ticks !== mem.lastTicks) {
    mem.lastTicks = ticks; mem.stagnantSince = null;
    return null; /* עובד */
  }
  const now = Date.now();
  if (mem.stagnantSince === null) { mem.stagnantSince = now; mem.lastTicks = ticks; return `ticks-stagnant (${ticks}) — watching`; }
  if (now - mem.stagnantSince > ZOMBIE_STAGNANT_MS) return `ZOMBIE: ticks frozen at ${ticks} for ${Math.round((now - mem.stagnantSince) / 60_000)}min`;
  return `ticks-stagnant (${ticks}) for ${Math.round((now - mem.stagnantSince) / 1000)}s`;
}

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

/* חור-ריפוי-נמדד-חי (T75 · 2026-10-16): אחרי-מחיקת-סנדבוקס node_modules-של-מיני-שירותים-אבד —
 * ההשקה-הישירה-של-bun-run-dev קרסה-על-חבילה-חסרה (Cannot find package 'socket.io')
 * והמשגיחה-שגרה-עותק-גוסס-כל-90ש׳. התיקון: ההשקה-מתקינה-תחילה-אם-חסר (מדוד-חי-שוב-אחרי-מחיקה-אמת). */
function spawnService(svc: MiniServiceDef): string {
  const cwd = svc.dir.startsWith("/") ? svc.dir : path.join(process.cwd(), svc.dir);
  const logPath = path.join(process.cwd(), ".zscripts", `mini-service-${svc.name}.log`);
  let fd: number | null = null;
  try {
    fd = openSync(logPath, "a");
    const stamp = new Date().toISOString();
    const child = spawn("bash", ["-c", svc.cmd ?? `[ -d node_modules ] || bun install --silent; exec bun run dev`], {
      cwd,
      /* בן-של-שרת-Next (עץ-הפלטפורמה) — בלי-setsid; ההשגחה-החוזרת-מכסה-אם-נעקר */
      stdio: ["ignore", fd, fd],
      env: { ...process.env, MINI_GUARD: "1", REVIVED_AT: stamp, ...(svc.env ?? {}) },
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

/** הבריאות-הפעילה: בדיקת-פורטים + בדיקה-פונקציונלית + הריגת-זומבי + החייאה-מדובנת. זול (ms) — מותר-לקרוא-מכל-פול-דלת. */
export async function ensureMiniServices(force = false): Promise<MiniServiceHealth[]> {
  const results: MiniServiceHealth[] = [];
  for (const svc of MINI_SERVICES) {
    const alive = await portAlive(svc.port);
    if (alive) {
      const verdict = await functionalVerdict(svc);
      if (verdict !== null && verdict.startsWith("ZOMBIE:")) {
        const killNote = await killPortHolder(svc.port);
        lastSpawnAt[svc.name] = 0; /* מתיר-החייאה-מיידית-בפול-הבא */
        lastNote[svc.name] = `${verdict} · ${killNote}`;
        results.push({ name: svc.name, he: svc.he, port: svc.port, alive: false, restarted: true, note: lastNote[svc.name] });
        continue;
      }
      results.push({ name: svc.name, he: svc.he, port: svc.port, alive: true, restarted: false, note: verdict ? `${lastNote[svc.name] ?? "running"} · ${verdict}` : `${lastNote[svc.name] ?? "running"} · working` });
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
