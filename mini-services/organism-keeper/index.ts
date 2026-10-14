/**
 * ORGANISM KEEPER — משמר-האורגניזם (mini service, port 3040)
 *
 * תפקיד: למדוד את המערך באמת ולכתוב את שני קובצי-ההזנה שמפקדת-האורגניזם
 * מכריזה עליהם (Sandbox/state/network-state.json + Sandbox/ops/office/potential.json).
 *
 * חוזה אין-זיופים (ZERO-FAKE):
 *  - כל ערך נמדד עכשיו ממקור מוכרז: GitHub API (org repos + actions runs),
 *    חלון-המשרד הציבורי (office-state.json), שרת-הפיתוח המקומי.
 *  - אם מקור נכשל — הערך מושמט / status=degraded עם סיבה מפורשת. לעולם לא מומצא.
 *  - חומר-מפתח לעולם לא נקרא, לא נרשם ולא נודפס (הטוקן נשלף מ-/home/z/.secrets/keys
 *    ומשמש ל-fetch בלבד).
 *  - כתיבה אטומית (tmp+rename) כדי שהקורא (מנוע הקונסולה) לעולם לא יקרא קובץ חצי-כתוב.
 */

import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, statSync } from "fs";
import path from "path";

const PORT = 3040;
const TICK_MS = 120_000; // 2 דקות — קצב שמכבד מכסות-API ומספיק טרי לרענון-90 שניות של הקונסולה
const ORG = "roshpinacare-sys";
const ESTATE = "/home/z/estate";
const OUT_STATE = path.join(ESTATE, "Sandbox", "state", "network-state.json");
const OUT_POTENTIAL = path.join(ESTATE, "Sandbox", "ops", "office", "potential.json");
const KEYS_FILE = "/home/z/.secrets/keys";
const DEV_SERVER = "http://127.0.0.1:3000/";
// מודדים את raw-main — אותו מקור בדיוק שהחדר והאתר הציבורי קוראים (נמדד 2026-10-14:
// עותק ה-Pages CDN התעכב 5 ש׳ מאחורי raw וגרם ל-keeper לראות ישן-כוזב)
const OFFICE_STATE_URL = "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json";
const HEARTBEAT_DISPATCH_URL = `https://api.github.com/repos/${ORG}/FleetHQ/actions/workflows/office-heartbeat.yml/dispatches`;
const PULSE_URL = "https://roshpinacare-sys.github.io/Domain/office/data.json";
const PULSE_DISPATCH_URL = `https://api.github.com/repos/${ORG}/Domain/actions/workflows/office-pulse.yml/dispatches`;
// חוק-הטריות של חדר-המשרד לפיד הפורמן הוא 130 דק׳ (2.17 ש׳, נמדד מה-bundle);
// GitHub מדלג על הרצות-cron באופן הסתברותי (נמדד 2026-10-14: 3 הרצות-schedule ב-15 ש׳),
// אז ה-keeper מרפא: חריגה מהסף → dispatch אמיתי של office-heartbeat, עם קירור.
const HEAL_THRESHOLD_H = 2.5;
const HEAL_COOLDOWN_MS = 2 * 3600_000;
// הדופק (office/data.json): חוק-החדר 30 דק׳, התאומה של הצי נכנסת רק מעל 35 דק׳ ובמשבצות :03/:33 —
// ה-keeper סוגר את חלון-הביניים: מעל 32 דק׳ → dispatch של office-pulse (הכותב המקורי, keyless same-repo).
const PULSE_THRESHOLD_MIN = 32;
const PULSE_COOLDOWN_MS = 30 * 60_000;
let lastHealDispatch: string | null = null;
let lastPulseDispatch: string | null = null;

let tickCount = 0;
let lastTick: string | null = null;
let lastStatus: "ok" | "degraded" = "degraded";
let lastReasons: string[] = ["עדיין לא נמדד (פעימה ראשונה בעבודה)"];
let starting = true;

/* ------------------------------- token (never logged) ------------------------------ */

function githubToken(): string | null {
  try {
    if (!existsSync(KEYS_FILE)) return null;
    const lines = readFileSync(KEYS_FILE, "utf8").split("\n");
    for (const line of lines) {
      if (/github/i.test(line) && line.trim().length > 0) {
        const tok = line.trim().split(/\s+/).pop();
        return tok && tok.length > 10 ? tok : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* --------------------------------- measurement --------------------------------- */

interface RepoRow {
  repo: string;
  status: string;
  push_age_h: number | null;
  reds_48h: number | null;
  open_issues: number | null;
  archived: boolean;
}

async function jfetch(url: string, token: string | null, timeoutMs = 10_000): Promise<{ ok: boolean; status: number | null; json: unknown; err: string | null }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      cache: "no-store",
      headers: token
        ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
        : { Accept: "application/vnd.github+json" },
    });
    // raw.githubusercontent מחזיר text/plain גם ל-JSON תקני — מפענחים לפי תוכן, לא רק לפי כותרת
    let json: unknown = null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      json = await res.json();
    } else {
      try {
        const text = await res.text();
        json = text.length > 0 && (text[0] === "{" || text[0] === "[") ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
    }
    return { ok: res.ok, status: res.status, json, err: null };
  } catch (e) {
    return { ok: false, status: null, json: null, err: e instanceof Error ? e.message.slice(0, 120) : "fetch-error" };
  } finally {
    clearTimeout(t);
  }
}

function hoursSince(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round(((Date.now() - t) / 3600000) * 10) / 10);
}

async function measure() {
  const reasons: string[] = [];
  const token = githubToken();
  if (!token) reasons.push("טוקן-גיטהאב לא נמצא ב-KEYS (המדידה הארגונית מושעית)");

  // 1) owner repos — roshpinacare-sys is a USER account (orgs API 404s, measured);
  //    one call for all repos (open_issues/pushed_at/archived)
  let repoRows: RepoRow[] = [];
  let orgOk = false;
  if (token) {
    let org = await jfetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100&sort=pushed`, token);
    if (!org.ok && org.status === 404) {
      org = await jfetch(`https://api.github.com/users/${ORG}/repos?per_page=100&sort=pushed`, token);
    }
    if (org.ok && Array.isArray(org.json)) {
      orgOk = true;
      const repos = (org.json as Record<string, unknown>[]).filter((r) => typeof r.name === "string");

      // 2) per-repo runs for reds_48h (parallel, per_page=20 enough for 48h window)
      const rows = await Promise.all(
        repos.map(async (r): Promise<RepoRow> => {
          const name = r.name as string;
          const runs = await jfetch(
            `https://api.github.com/repos/${ORG}/${name}/actions/runs?per_page=20`,
            token
          );
          let reds: number | null = null;
          if (runs.ok && runs.json && typeof runs.json === "object") {
            const list = (runs.json as Record<string, unknown>).workflow_runs;
            if (Array.isArray(list)) {
              const cutoff = Date.now() - 48 * 3600_000;
              reds = list.filter((x) => {
                const o = x as Record<string, unknown>;
                if (o.conclusion !== "failure") return false;
                const at = typeof o.created_at === "string" ? Date.parse(o.created_at) : NaN;
                return Number.isFinite(at) && at >= cutoff;
              }).length;
            }
          } else if (runs.err) {
            reasons.push(`${name}: מדידת-הרצות נכשלה (${runs.err})`);
          }
          return {
            repo: name,
            status: reds === null ? "unknown" : reds > 0 ? "red" : "green",
            push_age_h: hoursSince(r.pushed_at),
            reds_48h: reds,
            open_issues: typeof r.open_issues_count === "number" ? r.open_issues_count : null,
            archived: r.archived === true,
          };
        })
      );
      repoRows = rows;
    } else {
      reasons.push(`org-repos API נכשל (status=${org.status ?? "?"} ${org.err ?? ""})`);
    }
  }

  // 3) office-state freshness (public pages feed)
  let officeAgeH: number | null = null;
  let officeOk = false;
  {
    const os = await jfetch(OFFICE_STATE_URL, null);
    if (os.ok && os.json && typeof os.json === "object") {
      const capturedAt = (os.json as Record<string, unknown>).capturedAt;
      officeAgeH = hoursSince(capturedAt);
      officeOk = true;
    } else {
      reasons.push(`office-state.json לא נטען (status=${os.status ?? "?"} ${os.err ?? ""})`);
    }
  }

  // 3-b) self-heal: office-state past the room's freshness law → real dispatch
  let healDispatchedThisTick: string | null = null;
  if (officeAgeH !== null && officeAgeH > HEAL_THRESHOLD_H && token) {
    const cooled = !lastHealDispatch || Date.now() - Date.parse(lastHealDispatch) > HEAL_COOLDOWN_MS;
    if (cooled) {
      const res = await fetch(HEARTBEAT_DISPATCH_URL, {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        body: JSON.stringify({ ref: "main" }),
      });
      if (res.status === 204) {
        lastHealDispatch = new Date().toISOString();
        healDispatchedThisTick = lastHealDispatch;
        reasons.push(`office-state בן ${officeAgeH} ש׳ (מעבר לחוק 130 הדק׳ של החדר) — office-heartbeat הופעל ב-dispatch אמיתי לריפוי הפיד`);
      } else {
        reasons.push(`heal-dispatch נכשל (status=${res.status}) — לא מזויף כהצלחה`);
      }
    }
  }

  // 3-c) pulse freshness + self-heal (חוק-החדר 30 דק׳; התאומה של הצי מכסה רק מעל 35 דק׳)
  let pulseAgeMin: number | null = null;
  let pulseDispatchedThisTick: string | null = null;
  {
    const pf = await jfetch(PULSE_URL, null);
    if (pf.ok && pf.json && typeof pf.json === "object") {
      const h = hoursSince((pf.json as Record<string, unknown>).generatedAt);
      pulseAgeMin = h === null ? null : Math.round(h * 60);
    } else {
      reasons.push(`office/data.json לא נטען (status=${pf.status ?? "?"} ${pf.err ?? ""})`);
    }
    if (pulseAgeMin !== null && pulseAgeMin > PULSE_THRESHOLD_MIN && token) {
      const cooled = !lastPulseDispatch || Date.now() - Date.parse(lastPulseDispatch) > PULSE_COOLDOWN_MS;
      if (cooled) {
        const res = await fetch(PULSE_DISPATCH_URL, {
          method: "POST",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          body: JSON.stringify({ ref: "main" }),
        });
        if (res.status === 204) {
          lastPulseDispatch = new Date().toISOString();
          pulseDispatchedThisTick = lastPulseDispatch;
          reasons.push(`דופק office/data.json בן ${pulseAgeMin} דק׳ (מעבר לחוק 30) — office-pulse הופעל ב-dispatch אמיתי לריפוי`);
        } else {
          reasons.push(`pulse-dispatch נכשל (status=${res.status}) — לא מזויף כהצלחה`);
        }
      }
    }
  }

  // 4) dev server health
  let devUp: boolean | null = null;
  {
    const dev = await jfetch(DEV_SERVER, null, 8000);
    devUp = dev.ok;
    if (!dev.ok) reasons.push(`שרת-הפיתוח לא מגיב (status=${dev.status ?? "?"} ${dev.err ?? ""})`);
  }

  // 5) derived top-actions — כל שורה נגזרת ממדידה של הטיק הזה בלבד
  const topActions: string[] = [];
  for (const r of repoRows) {
    if (!r.archived && r.reds_48h !== null && r.reds_48h > 0) {
      topActions.push(`${r.repo}: ${r.reds_48h} הרצות אדומות ב-48 שעות — בדיקת-שורש וטיפול`);
    }
  }
  if (officeAgeH !== null && officeAgeH > 2.2) {
    topActions.push(
      healDispatchedThisTick
        ? `הזנת office-state מיושנת (${officeAgeH} ש׳) — keeper כבר הפעיל office-heartbeat בריפוי (${healDispatchedThisTick})`
        : `הזנת office-state מיושנת (${officeAgeH} ש׳) — בדיקת חלון-המשרד והפעלת-האפייה מחדש`
    );
  }
  if (pulseAgeMin !== null && pulseAgeMin > 30) {
    topActions.push(
      pulseDispatchedThisTick
        ? `דופק המשרד מיושן (${pulseAgeMin} דק׳) — keeper כבר הפעיל office-pulse בריפוי (${pulseDispatchedThisTick})`
        : `דופק המשרד מיושן (${pulseAgeMin} דק׳) — הפעלת office-pulse מחדש`
    );
  }
  if (devUp === false) {
    topActions.push("שרת-הפיתוח של הקונסולה לא מגיב — הפעלה מחדש של next-dev");
  }
  if (topActions.length === 0 && orgOk) {
    topActions.push("אין פעולות דחופות — המערך ירוק, ההזנות טריות והשרת חי (נמדד בטיק זה)");
  }

  return { repoRows, officeAgeH, officeOk, devUp, orgOk, reasons, topActions, healDispatchedThisTick, pulseAgeMin, pulseDispatchedThisTick };
}

/* ---------------------------------- writers ---------------------------------- */

function atomicWrite(abs: string, data: unknown): boolean {
  try {
    mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    renameSync(tmp, abs);
    return true;
  } catch (e) {
    console.error(`[keeper] write-failed ${abs}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

async function tick() {
  const at = new Date().toISOString();
  const m = await measure();
  tickCount += 1;
  lastTick = at;

  const status: "ok" | "degraded" = m.orgOk && m.officeOk && m.devUp === true ? "ok" : "degraded";
  lastStatus = status;
  lastReasons = m.reasons;

  // network-state.json — הקונסולה קוראת keeper{tickCount,lastTick,status}
  const stateOk = atomicWrite(OUT_STATE, {
    keeper: { tickCount, lastTick: at, status, tickIntervalMs: TICK_MS },
    measured: {
      at,
      sources: {
        githubOrgApi: m.orgOk ? "ok" : "error",
        officeStateFeed: m.officeOk ? "ok" : "error",
        devServer: m.devUp === true ? "up" : m.devUp === false ? "down" : "unknown",
      },
      officeStateAgeH: m.officeAgeH,
      pulseAgeMin: m.pulseAgeMin,
      heal: {
        lastHeartbeatDispatchAt: lastHealDispatch,
        heartbeatDispatchedThisTick: m.healDispatchedThisTick,
        lastPulseDispatchAt: lastPulseDispatch,
        pulseDispatchedThisTick: m.pulseDispatchedThisTick,
        thresholdH: HEAL_THRESHOLD_H,
        pulseThresholdMin: PULSE_THRESHOLD_MIN,
      },
    },
    machines: [
      { name: "organism-keeper", kind: "keeper", status: "up", tick: tickCount },
      { name: "next-dev", kind: "dev-server", status: m.devUp === true ? "up" : "down" },
      { name: "github-api", kind: "source", status: m.orgOk ? "ok" : "error" },
      { name: "pages-office-state", kind: "feed", status: m.officeOk ? "ok" : "error" },
    ],
    reasons: m.reasons,
  });

  // potential.json — הקונסולה קוראת measured_at/estate.rows/top_actions
  let potentialOk = false;
  if (m.orgOk) {
    potentialOk = atomicWrite(OUT_POTENTIAL, {
      measured_at: at,
      measured_from: `GitHub API ${ORG} + ${OFFICE_STATE_URL} + ${DEV_SERVER} (keeper tick #${tickCount})`,
      estate: { rows: m.repoRows },
      top_actions: m.topActions,
      work_orders_open: null, // אין מקור אמיתי מוכרז — מוצהר חסר, לא מומצא
      token_days_left: null, // חומר-מפתח לעולם לא נקרא
      delta_since_last: [],
      not_scanned: null,
    });
  } else {
    console.error("[keeper] potential.json skipped — org measurement failed (fail-honest, no synthetic payload)");
  }

  console.log(
    `[keeper] tick #${tickCount} at ${at} — status=${status} repos=${m.repoRows.length} officeAgeH=${m.officeAgeH} state=${stateOk ? "written" : "FAILED"} potential=${potentialOk ? "written" : "skipped"} reasons=${m.reasons.length}`
  );
}

/* ----------------------------------- server ----------------------------------- */

async function run() {
  await tick(); // פעימה ראשונה מיד בעלייה
  starting = false;
  setInterval(() => {
    tick().catch((e) => {
      lastReasons = [e instanceof Error ? e.message.slice(0, 200) : "tick-error"];
      console.error("[keeper] tick crashed:", e);
    });
  }, TICK_MS);

  Bun.serve({
    port: PORT,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        const stat = (p: string) => {
          try {
            const s = statSync(p);
            return { exists: true, bytes: s.size, mtime: s.mtime.toISOString() };
          } catch {
            return { exists: false, bytes: null, mtime: null };
          }
        };
        return Response.json({
          service: "organism-keeper",
          tickCount,
          lastTick,
          status: starting ? "starting" : lastStatus,
          reasons: lastReasons,
          feeds: { state: stat(OUT_STATE), potential: stat(OUT_POTENTIAL) },
        });
      }
      return new Response("organism-keeper: use /health\n", { status: 404 });
    },
  });
  console.log(`[keeper] listening on :${PORT} — tick every ${TICK_MS / 1000}s`);
}

run().catch((e) => {
  console.error("[keeper] fatal:", e);
  process.exit(1);
});
