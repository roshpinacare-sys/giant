/**
 * economy-beat-service — מארח-כאת-הלב של הכלכלה-הפנימית (גל-85 · agent-2 · 2026-10-17)
 *
 * למה-השירות-הזה-קיים (חוק-ההישרדות-המדוד): תהליכים-שהסוכן-משגר-מקריאות-כלים נשחטים-תוך-דקות;
 * היחידים-ששורדים הם-תהליכי-עץ-האתחול של הפלטפורמה. start.sh מריץ-אוטומטית כל-מיני-שירות
 * עם package.json+"dev" בכל-אתחול-קר — כלומר: השירות-הזה קם-מחדש-אל-מוות-בכל-boot,
 * ומקים-את-עצמו-לבד (כולל-שיבוט-הריפו אם-הסנדבוקס-חדש).
 *
 * ארכיטקטורה (הנחיית-בעלים): הסוכנים הם הלקוח והמשתמש של הכלכלה-הפנימית.
 * כל-מחזור = אותו-פרוטוקול-אמת של הענן (run-economy-beat.mjs):
 *   מנעול-כותב-יחיד (heartbeat TTL 30 דק') → boot על הספר-הקנוני → זרימה
 *   (שכר/שירותים/AMM/מס — אפס-הדמיות) → שער-אמת (/verify + עוגנים=3) → איטום-לגיט.
 * הענן והמארח-החלופי (instrumentation) יירשו-בכנות דרך-המנעול.
 */
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";

const REPO = process.env.ECONOMY_REPO ?? "/home/z/audit/fleet-economy";
const PORT = 3020; // פורט-קבוע-מטעמי-עקביות (לא-PORT-env — הוא שייך-לענף-3000)
const WRITER = "economy-beat-service";
const BEAT_SECONDS = Number(process.env.BEAT_SECONDS ?? 90);
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 45 * 60_000);
const HARD_TIMEOUT = 480;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const LOG_FILE = path.join(DIR, "beat.log");
const STATUS_FILE = path.join(DIR, "status.json");
const PAT_FILE = "/home/z/my-project/upload/pat.env";

const log = (s: string) => {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5_000_000) fs.writeFileSync(LOG_FILE, "");
    fs.appendFileSync(LOG_FILE, `[beat-service] ${new Date().toISOString()} ${s}\n`);
  } catch {}
  console.log(`[beat-service] ${s}`);
};

/* הקמה-עצמית: סנדבוקס-חדש? משגרים-את-הספר-מהגיט (PAT נקרא-בזמן-ריצה, לעולם-לא-בלוג) */
function ensureRepo(): boolean {
  if (fs.existsSync(path.join(REPO, "index.ts"))) return true;
  try {
    const pat = fs.readFileSync(PAT_FILE, "utf8").trim();
    if (!pat) { log("self-provision: no PAT — abort"); return false; }
    fs.mkdirSync(path.dirname(REPO), { recursive: true });
    log("self-provision: cloning canonical book…");
    execSync(`git clone --depth 1 https://x-access-token:${pat}@github.com/roshpinacare-sys/fleet-economy.git ${REPO}`, { stdio: "ignore", timeout: 300_000 });
    log("self-provision: clone ok");
    return true;
  } catch (e) { log(`self-provision failed: ${e}`); return false; }
}

const state = {
  startedAt: new Date().toISOString(),
  beatCount: 0,
  running: false,
  lastRc: null as number | null,
  lastDurationSec: null as number | null,
  lastSummary: [] as string[],
  nextRunAt: null as string | null,
};
const saveStatus = () => { try { fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...state, writer: WRITER, port: PORT }, null, 2) + "\n"); } catch {} };

const waitMsForLock = (): number => {
  try {
    const hb = JSON.parse(fs.readFileSync(path.join(REPO, "state/writer-heartbeat.json"), "utf8"));
    const age = Date.now() - (hb.at ?? 0);
    if (hb.writer && hb.writer !== WRITER && age < 30 * 60_000) {
      const ms = 30 * 60_000 - age + 60_000;
      log(`lock-respect: ${hb.writer} (גיל ${Math.round(age / 1000)}ש') — ממתין ${Math.round(ms / 1000)}ש'`);
      return Math.min(ms, 25 * 60_000);
    }
  } catch {}
  return 0;
};

const parseSummary = (out: string): string[] =>
  out.split("\n").filter((l) => /עסקאות אמת|VERIFY ok|עוגני-תפר=|מחיר=|FAIL|SKIP|איטום:|UP · seq/.test(l))
    .slice(-8).map((l) => l.trim().slice(0, 180));

function runBeat() {
  if (state.running) { log("beat-overlap-guard"); return; }
  // כבוד-למנוחה: סקר-ה-15ש' לא-דורס את-מנוחת-ה-45-דק' שנקבעה-אחרי-מחזור
  if (state.nextRunAt && Date.now() < new Date(state.nextRunAt).getTime()) return;
  state.running = true;
  const started = Date.now();
  log(`beat → #${state.beatCount + 1} (flow=${BEAT_SECONDS}s)`);
  const child = spawn("bash", ["-c", `cd ${REPO} && ECONOMY_WRITER=${WRITER} BEAT_SECONDS=${BEAT_SECONDS} timeout --signal=KILL ${HARD_TIMEOUT} bun run-economy-beat.mjs`], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout?.on("data", (d) => { out += d; if (out.length > 100_000) out = out.slice(-60_000); });
  child.stderr?.on("data", (d) => { out += d; if (out.length > 100_000) out = out.slice(-60_000); });
  child.on("close", (code) => {
    state.beatCount += 1;
    state.lastRc = code ?? 1;
    state.lastDurationSec = Math.round((Date.now() - started) / 1000);
    state.lastSummary = parseSummary(out);
    state.running = false;
    state.nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
    log(`beat ← #${state.beatCount} rc=${state.lastRc} dur=${state.lastDurationSec}s`);
    saveStatus();
  });
  child.on("error", (e) => { state.running = false; log(`beat-error: ${e.message}`); });
}

function scheduler() {
  const last = state.nextRunAt ? new Date(state.nextRunAt).getTime() - Date.now() : waitMsForLock() || 15_000;
  setTimeout(() => { runBeat(); scheduler(); }, Math.max(last, 5_000));
}

if (!ensureRepo()) {
  log("FATAL: אין-ספר-קנוני — השירות-יוצא; ינסה-שוב-באתחול-הבא");
  process.exit(1);
}

try {
  Bun.serve({
    port: PORT,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/health") return Response.json({ ok: true, service: "economy-beat-service", ...state });
      if (u.pathname === "/status") return Response.json({ ...state, writer: WRITER, port: PORT });
      if (u.pathname === "/beat" && req.method === "POST") {
        if (state.running) return Response.json({ ok: false, reason: "beat-already-running" }, { status: 409 });
        state.nextRunAt = new Date().toISOString();
        return Response.json({ ok: true, triggered: true });
      }
      return new Response("economy-beat-service · /health /status /beat(POST)\n");
    },
  });
  log(`service-up · port=${PORT} · interval=${Math.round(INTERVAL_MS / 60000)}min · flow=${BEAT_SECONDS}s · repo=${REPO}`);
} catch (e) {
  log(`port-busy (${e}) — מארח-אחר-כבר-חי; יוצא-בכבוד (המנעול-יקבע-כותב)`);
  process.exit(0);
}
saveStatus();
scheduler();
