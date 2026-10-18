#!/usr/bin/env bun
/**
 * sovereign-builder-host.mjs — מארח-הבנאי-הריבוני (גל-92 · agent-2 · 2026-10-18)
 *
 * בקשת-בעלים: "אני רוצה בניה ושיפור תמיד ולא רק בדיקות" + הארכיטקטורה תעבוד-לבד
 * רב-תחומית בלי-סוכנים. מארח-זה מריץ את פעימת-הבנאי בקצב-קבוע (ברירת-מחדל 15 דק'),
 * חי-כילד-של-next-server דרך src/instrumentation.ts עם-watchdog-החיה (אותו-דפוס
 * שהוכח-חי בגל-90 לכאת-הלב). ריצה-נכשלת (rc≠0) → ניסיון-חוזר מהיר (5 דק').
 *
 * פורט 3021 · /health חי · status+heartbeat ב-/home/z/audit/builder-beat-*.json
 */
import { spawn } from "child_process";
import fs from "fs";

const BEAT = "/home/z/audit/fleet-economy/bootstrap/sovereign-builder/run-builder-beat.mjs"; // גל-93: נתיב-קנוני אמת (הנתיב הישן נעלם-בשחזור — הרץ-חי-רק-תחת fleet-economy/bootstrap)
const STATUS_FILE = "/home/z/audit/builder-beat-service-status.json";
const HB_FILE = "/home/z/audit/builder-beat-heartbeat.json";
const LOG_FILE = "/home/z/audit/builder-beat-host.log";
const PORT = 3021;
const INTERVAL_MS = Number(process.env.BUILDER_INTERVAL_MS ?? 15 * 60_000);
const RETRY_MS = Number(process.env.BUILDER_RETRY_MS ?? 5 * 60_000);
const HARD_TIMEOUT = 420; // שניות — הפעימה-הארוכה-ביותר (tool-run) ~3 דק'

const state = {
  startedAt: new Date().toISOString(),
  beatCount: 0,
  running: false,
  lastRc: null,
  lastDurationSec: null,
  lastSummary: [],
  nextRunAt: new Date().toISOString(),
};

function persist() {
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...state, writer: "sovereign-builder-host", port: PORT }, null, 2) + "\n"); } catch {}
  try { fs.writeFileSync(HB_FILE, JSON.stringify({ at: Date.now() }, null, 2) + "\n"); } catch {}
}

function log(msg) {
  const line = `[builder-host] ${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

async function runBeat() {
  state.running = true;
  persist();
  const t0 = Date.now();
  await new Promise((resolve) => {
    // גל-93: bun (הרץ-הקנוני) + יומן-פעימה-חי במקום stdio עיוור — כישלון-שקט לא-חוקי-עוד
    const out = fs.openSync(LOG_FILE, "a");
    const stamp = `[builder-beat] ${new Date().toISOString()} פעימה-מתחילה\n`;
    try { fs.writeSync(out, stamp); } catch {}
    const child = spawn("bun", [BEAT], { stdio: ["ignore", out, out] });
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, HARD_TIMEOUT * 1000);
    child.on("exit", (code) => { clearTimeout(killer); try { fs.closeSync(out); } catch {} state.lastRc = code ?? 1; resolve(); });
    child.on("error", (e) => { clearTimeout(killer); try { fs.writeSync(out, `[builder-beat] spawn-שגיאה: ${String(e?.message ?? e)}\n`); fs.closeSync(out); } catch {} state.lastRc = 1; resolve(); });
  });
  state.running = false;
  state.lastDurationSec = Math.round((Date.now() - t0) / 1000);
  state.beatCount += 1;
  state.lastSummary = [
    `בנאי-beat #${state.beatCount} · rc=${state.lastRc} · ${state.lastDurationSec}ש'`,
  ];
  persist();
}

function schedule() {
  const wait = state.lastRc === 0 ? INTERVAL_MS : RETRY_MS;
  state.nextRunAt = new Date(Date.now() + wait).toISOString();
  persist();
  setTimeout(async () => {
    try { await runBeat(); } catch (e) { state.lastRc = 1; log(`beat-שגיאה: ${String(e?.message ?? e).slice(0, 120)}`); }
    schedule();
  }, wait);
  log(`פעימה-הבאה בעוד ${Math.round(wait / 60000)} דק'`);
}

// דופק-HTTP קטן לבריאות (אותו-דפוס של כאת-הלב על 3020)
Bun.serve({
  port: PORT,
  fetch: () => new Response(JSON.stringify({ ok: true, at: new Date().toISOString(), ...state }, null, 2), {
    headers: { "content-type": "application/json" },
  }),
});

// הקמה-מיידית: אם-מארח-קודם-השאיר-תור-קרוב — מכבדים; אחרת-מיד
(function boot() {
  let wait = 30_000;
  try {
    const prev = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
    const t = new Date(prev.nextRunAt).getTime();
    if (Number.isFinite(t) && t > Date.now() && t - Date.now() < INTERVAL_MS) wait = t - Date.now();
  } catch {}
  state.beatCount = 0;
  persist();
  setTimeout(async () => {
    try { await runBeat(); } catch (e) { state.lastRc = 1; }
    schedule();
  }, wait);
  log(`מארח-בנאי קם · פעימה-ראשונה בעוד ${Math.round(wait / 60000)} דק' · פורט ${PORT}`);
})();

// עדכון-דופק-כל-30ש' (ל-watchdog)
setInterval(persist, 30_000);
