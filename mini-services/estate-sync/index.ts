/* estate-sync v2 — שומר-העוגנים-המרפא-את-עצמו (גל-16 · "הזרימה-המרפאת-את-עצמה")
 * ═══════════════════════════════════════════════════════════════════════════════
 * לקח-הגלים: סנדבוקסים נמחקים — הגיט הוא שכבת-הקיום. v1 ידע-רק ff-pull בספרייה
 * קיימת; אחרי-מחיקת-סנדבוקס השומר-עצמו נשאר-חסר-אונים. v2 מרפא: אם-עוגן-חסר —
 * משובט-מהקנון; אם-פגום — מועבר-להסגר-ומשובט-מחדש; אם-pull-נכשל — משובט-טרי.
 *
 * עוגנים (קריאה-בלבד · אפס-דחיפה · אפס-שכתוב-היסטוריה):
 *  · estate/Domain        (פומבי)   — עוגן-האמת: dex/market/giants/pulse + מנוע-העולם
 *  · lane/saos-agents     (פרטי)    — ספר-הצי: CLAIMS.json
 *  · lane/Defi            (פרטי)    — ספר-הצייד: fleet/KPI.json
 *  · lane/Adsmarket       (פרטי)    — ערכת-השיווק
 *  · lane/saos-markets    (פרטי)    — ספר-השווקים
 *  · channels/giant       (פרטי)    — ערוץ-המפעיל
 *
 * כנות: הטוקן חי-רק בזיכרון-התהליך (env של-spawn · helper-חד-פעמי) — לעולם
 * לא ב-argv, לא ב-דיסק, לא ב-לוגים, לא ב-.git/config (ה-remote-נשאר-URL-נקי).
 * כשל-רשת = כנה-ולא-קטלני; בריאות-מלאה על :3021.
 *
 * גל-18 · התיקון-השורשי-של-הזומבי: נמדד-חי — תהליך-שרת-ענה-200-על-הבריאות
 * במשך-80-דקות-ובפנים אפס-טיקים (ה-`void tick()`-היה-חבור-ב-callback-של-listen,
 * ו-hot-reload/קריסה-השאירו-פורט-פתוח-בלי-עבודה). החיווט-החדש: הטיק-רץ-מיד-
 * ברמת-המודול — לא-תלוי-ב-listen; מגן-globalThis מונע-ריבוי-מאזינים-ב-hot-reload;
 * כשל-listen = יומן-כנה-ולא-מוות-שקט — העבודה-ממשיכה-גם-בלי-HTTP. */
import { createServer } from "node:http";
import { existsSync, mkdirSync, rmSync, renameSync, readFileSync } from "node:fs";
import path from "node:path";

const ORG = "roshpinacare-sys";
const PAT_FILE = "/home/z/my-project/upload/pat.env";
const INTERVAL_MS = Number(process.env.ESTATE_SYNC_INTERVAL_MS || 600_000); /* 10ד׳ */
const PORT = Number(process.env.ESTATE_SYNC_PORT || 3021);

interface Anchor {
  name: string;
  dir: string;
  repo: string;
  privateRepo: boolean;
}

const ANCHORS: Anchor[] = [
  { name: "estate/Domain", dir: "/home/z/estate/Domain", repo: "Domain", privateRepo: false },
  { name: "estate/Pulse", dir: "/home/z/estate/Pulse", repo: "Pulse", privateRepo: false },
  { name: "law/Autonomy", dir: "/home/z/autonomy-fix", repo: "Autonomy", privateRepo: false },
  { name: "lane/saos-agents", dir: "/home/z/lane/saos-agents", repo: "saos-agents", privateRepo: true },
  { name: "lane/Defi", dir: "/home/z/lane/Defi", repo: "Defi", privateRepo: true },
  { name: "lane/Adsmarket", dir: "/home/z/lane/Adsmarket", repo: "Adsmarket", privateRepo: true },
  { name: "lane/saos-markets", dir: "/home/z/lane/saos-markets", repo: "saos-markets", privateRepo: true },
  { name: "channels/giant", dir: "/home/z/channels/giant", repo: "giant", privateRepo: true },
  /* מורשת-t36 — הקנון-ההיסטורי (ציבוריים · נמשכים-ללא-טוקן):
   * Sandbox = ספר-הלדג'ר-והאמנות (ops/AGENT-LEDGER.md) · FleetHQ = מטה-הצי ·
   * Console = הקונסולה-הציבורית · saos-dex = ארכיון-הדקס · roshpina = מאגר-הידע.
   * בלעדיהם שכבת-גיט→מסך (git-content REPOS) קראה-מתיקיות-מתות — נמדד-חי-בגל-18. */
  { name: "estate/Sandbox", dir: "/home/z/estate/Sandbox", repo: "Sandbox", privateRepo: false },
  { name: "estate/FleetHQ", dir: "/home/z/estate/FleetHQ", repo: "FleetHQ", privateRepo: false },
  { name: "estate/Console", dir: "/home/z/estate/Console", repo: "Console", privateRepo: false },
  { name: "estate/saos-dex", dir: "/home/z/estate/saos-dex", repo: "saos-dex", privateRepo: false },
  { name: "estate/roshpina", dir: "/home/z/estate/roshpina", repo: "roshpina", privateRepo: false },
];

interface AnchorState {
  name: string;
  dir: string;
  ok: boolean | null; /* null = טרם-נמדד */
  state: "pending" | "fresh" | "healed" | "failed";
  detail: string;
  headAgeMin: number | null;
  lastAt: string | null;
}

const states: AnchorState[] = ANCHORS.map((a) => ({
  name: a.name, dir: a.dir, ok: null, state: "pending", detail: "טרם-נמדד", headAgeMin: null, lastAt: null,
}));

let ticks = 0;
let heals = 0;
let fails = 0;
let lastTick: string | null = null;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), "[estate-sync]", ...args);
}

function readPat(): string | null {
  try {
    const raw = readFileSync(PAT_FILE, "utf8");
    const m = raw.match(/(?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

interface ProcResult { code: number; out: string; }

function runGit(args: string[], opts: { cwd?: string; token?: string | null; timeoutMs?: number } = {}): Promise<ProcResult> {
  const { cwd, token, timeoutMs = 120_000 } = opts;
  const finalArgs = token
    ? ["-c", "credential.helper=", "-c", "credential.helper=!f(){ echo username=x-access-token; echo password=$SAOS_ANCHOR_TOKEN; };f", ...args]
    : args;
  return new Promise((resolve) => {
    const proc = Bun.spawn(["git", ...finalArgs], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: token ? { ...process.env, SAOS_ANCHOR_TOKEN: token } : { ...process.env },
    });
    let out = "";
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* כבר-מת */ }
      out += "\ntimeout";
      resolve({ code: 124, out });
    }, timeoutMs);
    void (async () => {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const code = await proc.exited;
      clearTimeout(timer);
      out += stdout + stderr;
      resolve({ code, out });
    })();
  });
}

async function headAge(dir: string): Promise<number | null> {
  const r = await runGit(["log", "-1", "--format=%cI"], { cwd: dir, timeoutMs: 10_000 });
  if (r.code !== 0) return null;
  const t = Date.parse(r.out.trim());
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

/* ריפוי-עצמי: הסגר-של-ספרייה-פגומה ואז-שיבוט-טרי */
function quarantine(dir: string): string {
  const qu = `${dir}.stale-${Date.now()}`;
  try { renameSync(dir, qu); log("quarantined:", dir, "→", qu); return qu; }
  catch { try { rmSync(dir, { recursive: true, force: true }); } catch { /* כבר-אין */ } return ""; }
}

async function syncAnchor(a: Anchor, st: AnchorState, pat: string | null): Promise<void> {
  st.lastAt = new Date().toISOString();
  const needsToken = a.privateRepo;
  const token = needsToken ? pat : null;
  if (needsToken && !token) {
    st.ok = false; st.state = "failed"; fails++;
    st.detail = "ספר-פרטי-ללא-טוקן (upload/pat.env-חסר) — כנה";
    log(st.detail, a.name);
    return;
  }
  const url = `https://github.com/${ORG}/${a.repo}.git`;

  /* קיים-כריפו? → ff-pull */
  if (existsSync(path.join(a.dir, ".git"))) {
    const r = await runGit(["pull", "--ff-only", "--quiet"], { cwd: a.dir, token, timeoutMs: 90_000 });
    if (r.code === 0) {
      st.ok = true; st.state = st.state === "healed" ? "healed" : "fresh";
      st.headAgeMin = await headAge(a.dir);
      st.detail = `ff-pull ok${st.headAgeMin !== null ? ` · head ${st.headAgeMin} דק` : ""}`;
      log("OK", a.name, st.detail);
      return;
    }
    log("pull-failed → self-heal re-clone:", a.name, r.out.trim().slice(0, 120));
  }

  /* חסר/פגום → הסגר-ושיבוט-טרי */
  if (existsSync(a.dir)) quarantine(a.dir);
  mkdirSync(path.dirname(a.dir), { recursive: true });
  const c = await runGit(["clone", "--quiet", url, a.dir], { token, timeoutMs: 180_000 });
  if (c.code === 0) {
    st.ok = true; st.state = "healed"; heals++;
    st.headAgeMin = await headAge(a.dir);
    st.detail = `cloned-from-canon${st.headAgeMin !== null ? ` · head ${st.headAgeMin} דק` : ""}`;
    log("HEALED", a.name, st.detail);
    return;
  }
  st.ok = false; st.state = "failed"; fails++;
  st.detail = `clone-failed: ${c.out.trim().slice(0, 120) || "no-stderr"}`;
  log("FAIL", a.name, st.detail);
}

async function tick() {
  ticks++;
  lastTick = new Date().toISOString();
  const pat = readPat();
  for (let i = 0; i < ANCHORS.length; i++) {
    try { await syncAnchor(ANCHORS[i], states[i], pat); }
    catch (e) {
      states[i].ok = false; states[i].state = "failed"; fails++;
      states[i].detail = `exception: ${e instanceof Error ? e.message : String(e)}`.slice(0, 140);
      log("FAIL", states[i].name, states[i].detail);
    }
  }
}

const BOOTED_AT = new Date().toISOString();

const health = createServer((req, res) => {
  const allOk = states.every((s) => s.ok === true);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    ok: allOk,
    service: "estate-sync",
    version: 3,
    selfHealing: true,
    tickDecoupledFromListen: true,
    pid: process.pid,
    bootedAt: BOOTED_AT,
    uptimeSec: Math.round((Date.now() - Date.parse(BOOTED_AT)) / 1000),
    listen: listenState,
    anchors: states,
    ticks, heals, fails,
    lastTick,
    now: new Date().toISOString(),
  }, null, 2));
});

interface ListenState { ok: boolean; detail: string; at: string | null; }
const listenState: ListenState = { ok: false, detail: "starting", at: new Date().toISOString() };

/* מגן-העלייה: ב-hot-reload המודול-רץ-שוב — אסור-שייווצר-מאזין-שני-או-לולאת-טיק-שנייה
 * (אחרת-שני-ראשים-דורסים-מצב-והבריאות-משקרת). עץ-אחד, שורש-אחד. */
const G = globalThis as { __estateSyncBooted?: boolean };

function boot() {
  if (G.__estateSyncBooted) { log("boot skipped (already booted in this process — hot-reload guard)"); return; }
  G.__estateSyncBooted = true;

  /* העבודה-קודמת-לבריאות: הטיק-רץ-מיד — לא-חבור-ב-callback-של-listen
   * (השורש-של-הזומבי-שנמדד: שרת-200 · אפס-טיקים · 80-דקות). */
  log(`booting v3 · self-healing · ${ANCHORS.length} anchors · every ${Math.round(INTERVAL_MS / 1000)}s · health :${PORT} · pid ${process.pid}`);
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);

  try {
    health.listen(PORT, "127.0.0.1", () => {
      listenState.ok = true;
      listenState.detail = "listening";
      listenState.at = new Date().toISOString();
      log(`health :${PORT} listening`);
    });
    /* כשל-אסינכרוני (EADDRINUSE) = יומן-כנה — הטיק-ממשיך-לעבוד-בלי-HTTP,
     * והמשגיחה-הפונקציונלית (mini-guard) תהרוג-את-הזומבי-על-הפורט. */
    health.on("error", (e: Error) => {
      listenState.ok = false;
      listenState.detail = `listen-error: ${e.message}`;
      listenState.at = new Date().toISOString();
      log("HEALTH-LISTEN-ERROR (work continues, honest):", e.message);
    });
  } catch (e) {
    listenState.ok = false;
    listenState.detail = `listen-throw: ${e instanceof Error ? e.message : String(e)}`;
    log("HEALTH-LISTEN-THROW (work continues, honest):", listenState.detail);
  }
}

boot();
