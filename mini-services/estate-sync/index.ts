/* estate-sync — שומר-האחוזה: האחוזה (estate/Domain) היא העוגן-האמת המקומי,
 * הצי מפרסם-אליה-דופקות-מהענן (fleet-heartbeat). השירות הזה מושך-את-העדכונים
 * (ff-only, אפס-שכתוב, אפס-דחיפה — קריאה-בלבד מהענן) כדי-שממשק-האמת יקרא
 * ספרים-חיים ולא-ספרים-מזדקנים. כנות: כל-משיכה נרשמת; כשל-רשת = כנה
 * ולא-קטלני (הספרים-הקודמים נשארים על-הדיסק — גיל-הקובץ מדוד-חי בממשק). */
import { createServer } from "node:http";

const ESTATE_DIR = process.env.ESTATE_DIR || "/home/z/estate/Domain";
const INTERVAL_MS = Number(process.env.ESTATE_SYNC_INTERVAL_MS || 600_000); /* 10ד׳ */
const PORT = Number(process.env.ESTATE_SYNC_PORT || 3021);

let lastPull: { at: string; ok: boolean; detail: string } | null = null;
let pulls = 0;
let fails = 0;

async function pullOnce(): Promise<{ ok: boolean; detail: string }> {
  const t0 = Date.now();
  try {
    const proc = Bun.spawn(["git", "pull", "--ff-only", "--quiet"], {
      cwd: ESTATE_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const ms = Date.now() - t0;
    if (code === 0) {
      pulls++;
      return { ok: true, detail: `ff-pull ok · ${ms}ms` };
    }
    const err = await new Response(proc.stderr).text();
    fails++;
    return { ok: false, detail: `git-exit ${code} · ${err.trim().slice(0, 140) || "no-stderr"}` };
  } catch (e) {
    fails++;
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function tick() {
  const r = await pullOnce();
  lastPull = { at: new Date().toISOString(), ok: r.ok, detail: r.detail };
  console.log(`[estate-sync] ${lastPull.at} · ${r.ok ? "OK" : "FAIL"} · ${r.detail}`);
}

const health = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    ok: true,
    service: "estate-sync",
    estate: ESTATE_DIR,
    intervalMs: INTERVAL_MS,
    pulls, fails,
    lastPull,
    now: new Date().toISOString(),
  }));
});

health.listen(PORT, "127.0.0.1", () => {
  console.log(`[estate-sync] alive · estate=${ESTATE_DIR} · every ${Math.round(INTERVAL_MS / 1000)}s · health :${PORT}`);
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
});
