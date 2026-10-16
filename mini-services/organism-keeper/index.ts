/* ═══ organism-keeper · משגר-האחזקה של הריבונות ═══
 * ==============================================================================
 * תפקיד (בעלים, trace 1a14426db3d03909 — "הסנדבוקס מת כל-כמה-שעות; כלום לא מת איתו"):
 *   dev.sh מריץ ב-boot את שירותי mini-services/* — אבל ה-estate (FleetHQ וכו')
 *   ושירותיו (selfcheck/app:3002/foreman:3010 · recruit:3041) נמצאים מחוץ לסריקה.
 *   ה-keeper הזה הוא הבעלים שלהם:
 *   1. מבטיח credential-helper (אימות-גיט מ-upload/pat.env בזמן-ריצה בלבד)
 *   2. מבטיח estate מחובר — clone-if-missing (fail-honest, ממשיך-בכל-זאת)
 *   3. מקים selfcheck + recruit (הם עצמם מרפאים app:3002 + foreman:3010)
 *   4. דופק-בריאות כנה כל-דקה על כל-הפורטים → receipts jsonl (אפס-הדמיות)
 *
 * חוק-נגד-זומבים (נמדד-חי 78-a: "כפילויות-מפקחים — רק-אחד-תופס-פורט"):
 *   · מופע-keeper יחיד — נעילת-עלייה (lockfile O_EXCL)
 *   · ה-keeper לא מריץ את מה ש-dev.sh כבר מריץ (boot-verifier/office-live/
 *     estate-sync/forge/sovereign-gateway/fleet-economy) — רק בודק-בריאות
 *   · לפני-כל-העלאה: בדיקת-פורט TCP — פורט-תפוס = לא-מקים
 * ==============================================================================
 */
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import net from "net";

const HERE = import.meta.dir;
const STATE = path.join(HERE, "state");
const LOG = path.join(STATE, "keeper-log.jsonl");
const LOCK = path.join(STATE, "keeper.lock");
const PAT_FILE = "/home/z/my-project/upload/pat.env";
const ESTATE = "/home/z/estate";
const CHANNELS = "/home/z/channels";

fs.mkdirSync(STATE, { recursive: true });
fs.mkdirSync(ESTATE, { recursive: true });
fs.mkdirSync(CHANNELS, { recursive: true });

/* ── נגד-זומבים: מופע-יחיד ────────────────────────────────────────────────── */
try {
  const fd = fs.openSync(LOCK, "wx");
  fs.writeSync(fd, String(process.pid));
} catch {
  console.log("[keeper] מופע-אחר-חי (lockfile קיים) — יוצא בכבוד");
  process.exit(0);
}
process.on("exit", () => { try { fs.unlinkSync(LOCK); } catch { /* כנה */ } });

function log(e: Record<string, unknown>) {
  try { fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...e }) + "\n"); } catch { /* fail-soft */ }
}

const run = promisify(execFile);
async function sh(cmd: string, args: string[], cwd: string, timeout = 300_000): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return { code: 0, out: ((stdout || "") + (stderr || "")).slice(-300) };
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string; killed?: boolean };
    return { code: err.code ?? (err.killed ? 124 : 1), out: ((err.stdout || "") + (err.stderr || "")).slice(-300) };
  }
}

function tcpOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.setTimeout(1500);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}

/* חוק-PATH-המובטח (נמדד 85-c: יתומי-דור-ישן נולדו-בלי-/home/z/.bun/bin → posix_spawn 'bun' ENOENT):
 *   כל-צאצא-שלנו מקבל PATH עם bun + נתיבים-קנוניים, ללא-תלות בסביבת-ההורה. */
const GUARANTEED_PATH = ["/home/z/.bun/bin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin", process.env.PATH ?? ""].join(":");
const GUARANTEED_ENV: NodeJS.ProcessEnv = { ...process.env, PATH: GUARANTEED_PATH };
function resolveBun(): string {
  for (const cand of ["/home/z/.bun/bin/bun", "/usr/local/bin/bun"]) if (fs.existsSync(cand)) return cand;
  return "bun"; // נפילה-כנה
}
const BUN = resolveBun();

function spawnDetached(cmd: string, args: string[], cwd: string, logFile: string): number | null {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const out = fs.openSync(logFile, "a");
    const child = spawn(cmd, args, { cwd, detached: true, stdio: ["ignore", out, out], env: GUARANTEED_ENV });
    child.unref();
    return child.pid ?? null;
  } catch (e) {
    log({ action: "spawn-fail", what: `${cmd} ${args.join(" ")}`, cwd, error: String(e) });
    return null;
  }
}

/* ── 1 · credential-helper (זהות-כתיבה אחידה) ─────────────────────────────── */
async function ensureGitWiring(): Promise<void> {
  await sh("git", ["config", "--global", "credential.helper", "!/home/z/my-project/boot/git-cred.sh"], "/home/z/my-project", 15_000);
  const identity = [["user.name", "roshpinacare-sys"], ["user.email", "326012154+roshpinacare-sys@users.noreply.github.com"]] as const;
  for (const [k, v] of identity) await sh("git", ["config", "--global", k, v], "/home/z/my-project", 15_000);
  const tokenOk = fs.existsSync(PAT_FILE) && fs.statSync(PAT_FILE).size > 10;
  log({ action: "git-wiring", credHelper: true, tokenPresent: tokenOk });
}

/* ── 2 · estate מחובר ─────────────────────────────────────────────────────── */
const ESTATE_REPOS: Array<{ dir: string; url: string }> = [
  { dir: path.join(ESTATE, "FleetHQ"), url: "https://github.com/roshpinacare-sys/FleetHQ.git" },
  { dir: path.join(ESTATE, "Domain"), url: "https://github.com/roshpinacare-sys/Domain.git" },
  { dir: path.join(ESTATE, "Console"), url: "https://github.com/roshpinacare-sys/Console.git" },
  { dir: path.join(ESTATE, "Pulse"), url: "https://github.com/roshpinacare-sys/Pulse.git" },
  { dir: path.join(ESTATE, "saos-dex"), url: "https://github.com/roshpinacare-sys/saos-runtime.git" },
  { dir: "/home/z/autonomy-fix", url: "https://github.com/roshpinacare-sys/Autonomy.git" },
  { dir: path.join(CHANNELS, "giant"), url: "https://github.com/roshpinacare-sys/giant.git" },
];

async function ensureEstate(): Promise<void> {
  for (const r of ESTATE_REPOS) {
    if (fs.existsSync(path.join(r.dir, ".git"))) continue; // חי — לא נוגעים
    const cl = await sh("git", ["clone", "-q", r.url, r.dir], ESTATE, 300_000);
    log({ action: cl.code === 0 ? "estate-cloned" : "estate-clone-fail", dir: r.dir, out: cl.out.slice(-160) });
    if (cl.code === 0) {
      await sh("git", ["config", "user.name", "roshpinacare-sys"], r.dir, 10_000);
      await sh("git", ["config", "user.email", "326012154+roshpinacare-sys@users.noreply.github.com"], r.dir, 10_000);
    }
  }
}

/* ── 3 · שירותי-ה-estate (selfcheck → app:3002+foreman:3010 · recruit:3041) ── */
const FH = path.join(ESTATE, "FleetHQ", "mini-services");
const ESTATE_SERVICES: Array<{ name: string; port: number; dir: string; entry: string; log: string }> = [
  { name: "office-selfcheck", port: 3040, dir: path.join(FH, "office-selfcheck"), entry: "index.ts", log: "/tmp/office-selfcheck.log" },
  { name: "office-recruit", port: 3041, dir: path.join(FH, "office-recruit"), entry: "recruit.ts", log: "/tmp/office-recruit.log" },
];

async function ensureEstateServices(): Promise<void> {
  for (const s of ESTATE_SERVICES) {
    if (!(fs.existsSync(path.join(s.dir, s.entry)))) {
      log({ action: "estate-service-missing", name: s.name, dir: s.dir }); // estate חסר — כנה
      continue;
    }
    if (await tcpOpen(s.port)) continue; // פורט-חי — אין-כפילות (חוק-נגד-זומבים)
    if (!fs.existsSync(path.join(s.dir, "node_modules"))) {
      const inst = await sh(BUN, ["install"], s.dir, 180_000);
      log({ action: "deps-install", name: s.name, code: inst.code, via: BUN });
      if (inst.code !== 0) continue;
    }
    const pid = spawnDetached(BUN, [s.entry], s.dir, s.log);
    log({ action: "estate-service-spawned", name: s.name, pid, via: BUN });
  }
}

/* ── 4 · דופק-בריאות כנה ──────────────────────────────────────────────────── */
const PROBES: Array<{ name: string; port: number }> = [
  { name: "reception", port: 3000 },
  { name: "fleet-hq-app", port: 3002 },
  { name: "foreman", port: 3010 },
  { name: "fleet-economy", port: 3016 },
  { name: "office-live", port: 3036 },
  { name: "office-selfcheck", port: 3040 },
  { name: "office-recruit", port: 3041 },
  { name: "boot-verifier", port: 3042 },
];

async function healthTick(): Promise<void> {
  const status: Record<string, boolean> = {};
  for (const p of PROBES) status[p.name] = await tcpOpen(p.port);
  const tokenOk = fs.existsSync(PAT_FILE) && fs.statSync(PAT_FILE).size > 10;
  log({ action: "tick", ports: status, tokenPresent: tokenOk });
}

/* ── לולאה ────────────────────────────────────────────────────────────────── */
async function cycle(): Promise<void> {
  try { await ensureGitWiring(); } catch (e) { log({ action: "cycle-error", at: "git-wiring", error: String(e) }); }
  try { await ensureEstate(); } catch (e) { log({ action: "cycle-error", at: "estate", error: String(e) }); }
  try { await ensureEstateServices(); } catch (e) { log({ action: "cycle-error", at: "estate-services", error: String(e) }); }
  try { await healthTick(); } catch (e) { log({ action: "cycle-error", at: "tick", error: String(e) }); }
}

console.log(`[organism-keeper] חי · pid=${process.pid} · estate-orchestrator · חוק-נגד-זומבים פעיל (lockfile + בדיקת-פורט)`);
cycle();
setInterval(cycle, 60_000);
