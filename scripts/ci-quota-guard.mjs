#!/usr/bin/env bun
/* ci-quota-guard.mjs — שומר-CI-הריבוני · ESC-CI-GUARD (2026-10-19)
 * ═══════════════════════════════════════════════════════════════════════
 * שורש-נמדד (trace 1a1555569bbc411d → 1a155910dbacc4c1): הריפו-הפרטיים
 * (Sandbox · roshpina · Adsmarket · Defi · saos-agents) על קיר-המכסה של
 * GitHub-Actions — כל-ריצה נכשלת בתוך 2-4 שניות עם אפס-שליחות ואפס-לוגים
 * (BlobNotFound), וכל-דחיפת-בוט (~כל-5-דקות) מציתה 1-4 כשלים → הצפת-אימיילים
 * לבעלים. תוקן-ידנית ב-2026-10-19 (נטרול-כל-ה-workflows-בפרטיים + [skip ci]
 * על-קומיטי-בוטים). השומר-הזה הוא-החוסן-המתמשך:
 *
 *   1. כל-30-דקות סריקת-ריצות-אחרונות-על-כל-הריפו-הפרטיים
 *   2. כשל-עם-חתימת-קיר-מכסה (jobs-עם-אפס-שליחות) → נטרול-אוטומטי-של-ה-workflow
 *      (הפעולה-היחידה-שעוצרת-את-האימיילים-מבלי-להרוג-את-הקנון)
 *   3. כשל-אמיתי-עם-שליחות-רצות → לא-נוגעים — זה-אות-עבודה-לגיטימי
 *   4. יומן-כנה מלא (state/ci-quota-guard.jsonl) + בריאות (state/ci-quota-guard.json)
 *
 * חוקי-בטיחות: נוגע-רק-בריפו-רשומים-מפורשים · רק-disable (הפיך-תמיד) · אפס-סודות-
 * בדיסק (הפאט-נקרא-בזמן-ריצה-בלבד) · כשל-רשת=כנה-ולא-קטלני · מירוץ-מוגן-בנעילה. */

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";

const PAT_FILE = "/home/z/my-project/upload/pat.env";
const STATE_DIR = "/home/z/my-project/state";
const LOG_JSONL = `${STATE_DIR}/ci-quota-guard.jsonl`;
const HEALTH = `${STATE_DIR}/ci-quota-guard.json`;
const LOCK = `${STATE_DIR}/ci-quota-guard.lock`;
const INTERVAL_MS = 30 * 60 * 1000;

/* רק-הריפו-הפרטיים — שם-המכסה-חיה. הציבוריים-בריאים-ולא-נוגעים-בהם. */
const PRIVATE_REPOS = ["Sandbox", "roshpinacare-sys", "Adsmarket", "Defi", "saos-agents", "saos-markets"];

let disabledCount = 0;
let scans = 0;
let lastTick = null;
let lastFindings = [];

function log(e) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...e });
  try { appendFileSync(LOG_JSONL, line + "\n"); } catch { /* כנה */ }
  console.log(line);
}

function readPat() {
  try {
    const m = readFileSync(PAT_FILE, "utf8").match(/(?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)/);
    return m ? m[0] : null;
  } catch { return null; }
}

async function gh(path, token, method = "GET") {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ci-quota-guard" },
  });
  if (res.status === 204) return { ok: true, status: 204, json: null };
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { ok: res.ok, status: res.status, json };
}

/* חתימת-קיר-המכסה: ל-job-אין-אף-שליחה (הראנר-מעולם-לא-עלה) */
async function isQuotaWallFailure(token, repo, runId) {
  const jobs = await gh(`/repos/roshpinacare-sys/${repo}/actions/runs/${runId}/jobs`, token);
  if (!jobs.ok || !Array.isArray(jobs.json?.jobs)) return false;
  const js = jobs.json.jobs;
  if (js.length === 0) return false;
  return js.every((j) => Array.isArray(j.steps) && j.steps.length === 0);
}

async function sweep() {
  if (existsSync(LOCK)) {
    try {
      const pid = Number(readFileSync(LOCK, "utf8").trim());
      if (pid && Number.isFinite(pid)) {
        try { process.kill(pid, 0); log({ action: "skip-sweep", reason: "sweep-already-running", pid }); return; }
        catch { /* נעילת-יתום — ממשיכים */ }
      }
    } catch { /* כנה */ }
  }
  try { writeFileSync(LOCK, String(process.pid)); } catch { /* כנה */ }
  try {
    const token = readPat();
    if (!token) { log({ action: "sweep-skip", reason: "no-pat" }); return; }
    scans++;
    lastTick = new Date().toISOString();
    lastFindings = [];
    for (const repo of PRIVATE_REPOS) {
      try {
        const runs = await gh(`/repos/roshpinacare-sys/${repo}/actions/runs?per_page=15`, token);
        if (!runs.ok || !Array.isArray(runs.json?.workflow_runs)) {
          log({ action: "scan-fail", repo, status: runs.status });
          continue;
        }
        /* workflows-שנוטרלו-בסבב-הזה — מונע-ניסיונות-disable-כפולים */
        const disabledThisSweep = new Set();
        for (const run of runs.json.workflow_runs) {
          if (run.conclusion !== "failure") continue;
          if (run.created_at && Date.now() - Date.parse(run.created_at) > 48 * 3600_000) continue; /* רק-48-ש׳-אחרונות */
          const wfId = run.workflow_id;
          if (!wfId || disabledThisSweep.has(wfId)) continue;
          const wall = await isQuotaWallFailure(token, repo, run.id);
          if (!wall) continue;
          /* כנות-מצב: workflow-כבר-מנוטרל → אין-פעולה (נמדד: disable-על-מנוטרל = 403) */
          const wfMeta = await gh(`/repos/roshpinacare-sys/${repo}/actions/workflows/${wfId}`, token);
          const wfState = wfMeta.json?.state ?? "unknown";
          if (wfState !== "active") {
            disabledThisSweep.add(wfId);
            lastFindings.push({ repo, workflow: run.name, wfId, run: run.id, alreadyNeutralized: true, wfState });
            log({ action: "already-neutralized", repo, workflow: run.name, wfId, wfState });
            continue;
          }
          /* נטרול-ה-workflow הספציפי — הפיך, ממוקד, מתועד */
          const dis = await gh(`/repos/roshpinacare-sys/${repo}/actions/workflows/${wfId}/disable`, token, "PUT");
          lastFindings.push({ repo, workflow: run.name, wfId, run: run.id, disabled: dis.ok, status: dis.status });
          log({ action: dis.ok ? "auto-disable" : "auto-disable-fail", repo, workflow: run.name, wfId, runId: run.id, httpStatus: dis.status });
          if (dis.ok) { disabledCount++; disabledThisSweep.add(wfId); }
        }
      } catch (e) {
        log({ action: "repo-sweep-error", repo, error: String(e).slice(0, 160) });
      }
    }
  } catch (e) {
    log({ action: "sweep-error", error: String(e).slice(0, 200) });
  } finally {
    try { writeFileSync(HEALTH, JSON.stringify({
      ok: true, service: "ci-quota-guard", pid: process.pid,
      bootedAt: BOOTED_AT, scans, disabledCount, lastTick, lastFindings,
      now: new Date().toISOString(),
    }, null, 2)); } catch { /* כנה */ }
    try { if (existsSync(LOCK)) rmSync(LOCK, { force: true }); } catch { /* כנה */ }
  }
}

const BOOTED_AT = new Date().toISOString();
mkdirSync(STATE_DIR, { recursive: true });
log({ action: "boot", pid: process.pid, repos: PRIVATE_REPOS.length, intervalMin: INTERVAL_MS / 60000 });

void sweep();
setInterval(() => void sweep(), INTERVAL_MS);

/* שמירה-על-חיים: השומר-עצמו-לא-מת-בשקט — חריגה-לא-נתפסת=יומן-כנה-והמשך */
process.on("uncaughtException", (e) => { log({ action: "uncaught-exception", error: String(e).slice(0, 200) }); });
process.on("unhandledRejection", (e) => { log({ action: "unhandled-rejection", error: String(e).slice(0, 200) }); });
