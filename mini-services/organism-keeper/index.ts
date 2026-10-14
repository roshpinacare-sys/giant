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
import { execFileSync } from "child_process";
import path from "path";

const PORT = 3040;
const TICK_MS = 120_000; // 2 דקות — קצב שמכבד מכסות-API ומספיק טרי לרענון-90 שניות של הקונסולה
const ORG = "roshpinacare-sys";
const ESTATE = "/home/z/estate";
const OUT_STATE = path.join(ESTATE, "Sandbox", "state", "network-state.json");
const OUT_POTENTIAL = path.join(ESTATE, "Sandbox", "ops", "office", "potential.json");
// truth-feeds (Task 46 — "אין מקורות חסרים"): כל הזנה שהקונסולה מכריזה עליה נבנית כאן ממדידה אמיתית
const OUT_WORKORDERS = path.join(ESTATE, "Sandbox", "ops", "office", "work-orders.json");
const OUT_INTEGRITY = path.join(ESTATE, "Sandbox", "ops", "integrity", "verdict.json");
const OUT_FLOW = path.join(ESTATE, "Sandbox", "ops", "flow", "flow-map.json");
const OUT_VALUEMAP = path.join(ESTATE, "Sandbox", "ops", "office", "VALUE-MAP.md");
const OUT_TOKENTRUTH = path.join(ESTATE, "Sandbox", "ops", "TOKEN-TRUTH.md");
const OUT_KEYPROOF_STATUS = path.join(ESTATE, "Sandbox", "proof", "out", "KEY-PROOF-STATUS.md");
// clones שהקונסולה קוראת מהם מהדיסק — ה-keeper משחזר אותם אם נמחקו (wipe-proof)
const CLONE_REPOS = ["Domain", "FleetHQ"];
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

/* --------------- truth-feeds (Task 46 — "אין מקורות חסרים") --------------- */

function statSafe(abs: string): { exists: boolean; bytes: number | null; mtime: number | null } {
  try {
    const s = statSync(abs);
    return { exists: true, bytes: s.size, mtime: s.mtimeMs };
  } catch {
    return { exists: false, bytes: null, mtime: null };
  }
}

function atomicWriteText(abs: string, text: string): boolean {
  try {
    mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}`;
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, abs);
    return true;
  } catch (e) {
    console.error(`[keeper] write-failed ${abs}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** משחזר clone חסר מה-remote הציבורי (הריפואים פומביים — clone keyless, אפס-טוקן ב-config) */
function ensureClone(repo: string): boolean {
  const abs = path.join(ESTATE, repo);
  if (existsSync(path.join(abs, ".git"))) return true;
  try {
    mkdirSync(ESTATE, { recursive: true });
    execFileSync("git", ["clone", "--depth", "50", "-q", `https://github.com/${ORG}/${repo}`, abs], { timeout: 90_000 });
    console.log(`[keeper] clone restored: ${repo}`);
    return true;
  } catch (e) {
    console.error(`[keeper] clone-failed ${repo}:`, e instanceof Error ? e.message.slice(0, 120) : e);
    return false;
  }
}

interface WorkOrderRow {
  id: string;
  title: string;
  repo: string | null;
  status: string;
  evidence: string | null;
  firstStep: string | null;
}

async function truthFeeds(m: Awaited<ReturnType<typeof measure>>, at: string): Promise<string[]> {
  const done: string[] = [];
  const token = githubToken();

  // 0) שחזור-clones — בלי זה שלוש הזנות (verdict/mirror/recruit) קוראות מהדיסק-שנמחק
  for (const repo of CLONE_REPOS) ensureClone(repo);

  // 1) work-orders.json — הפקודות-העבודה האמיתיות של האורגניזם: issues פתוחים ברחבי-הארגון
  try {
    const res = await jfetch(`https://api.github.com/search/issues?q=org:${ORG}+state:open+type:issue&per_page=20&sort=updated`, token);
    const items =
      res.ok && res.json && typeof res.json === "object"
        ? ((res.json as Record<string, unknown>).items as unknown[] | undefined) ?? []
        : [];
    const orders: WorkOrderRow[] = (Array.isArray(items) ? items : []).slice(0, 20).map((it) => {
      const o = it as Record<string, unknown>;
      const repoUrl = typeof o.repository_url === "string" ? (o.repository_url.split("repos/")[1] ?? null) : null;
      return {
        id: `${repoUrl ?? "?"}#${String(o.number ?? "?")}`,
        title: String(o.title ?? "").slice(0, 140),
        repo: repoUrl,
        status: String(o.state ?? "open"),
        evidence: typeof o.html_url === "string" ? o.html_url : null,
        firstStep: null,
      };
    });
    if (res.ok) {
      atomicWrite(OUT_WORKORDERS, {
        at,
        agent: "organism-keeper truth-feeds",
        source: `GitHub search API — org:${ORG} issues state:open`,
        total_measured: orders.length,
        orders,
      });
      done.push("work-orders");
    }
  } catch {
    /* fail-soft — ההזנה הקודמת נשארת */
  }

  // 2) integrity/verdict.json — פסק-אמת מהמדידות שכבר בוצעו בטיק זה (אפס-קריאות-API נוספות)
  try {
    const rows = m.repoRows;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const stale = rows.filter((r) => typeof r.push_age_h === "number" && r.push_age_h > 24).length;
    const reds = rows.reduce((a, r) => a + (typeof r.reds_48h === "number" ? r.reds_48h : 0), 0);
    const sources = rows.length + 2; // repos + office-state feed + local dev health
    const verified =
      rows.filter((r) => r.push_age_h !== null && r.reds_48h !== null).length + (m.officeOk ? 1 : 0) + (m.devUp === true ? 1 : 0);
    const findings = reds + stale;
    atomicWrite(OUT_INTEGRITY, {
      overall: findings === 0 ? "PASS" : "DEGRADED",
      at,
      summary: {
        sources,
        verified,
        findings,
        counts: { ...counts, stale_push_24h: stale, reds_48h: reds },
      },
      provenance: {
        runUrl: null,
        writer: "organism-keeper",
        measured_from: `GitHub API ${ORG} (repos+runs) + office-state feed + local dev health — same tick`,
      },
    });
    done.push("integrity");
  } catch {
    /* fail-soft */
  }

  // 3) flow-map.json — מפת-זרימות נמדדת מתוך גילאי-הדחיפה והאדומים (אפס-קריאות נוספות)
  try {
    const rows = m.repoRows;
    const orphans = rows.filter((r) => r.push_age_h === null).map((r) => ({ repo: r.repo, detail: "push-age לא נמדד בטיק זה" }));
    const ghosts = rows
      .filter((r) => typeof r.push_age_h === "number" && (r.push_age_h as number) > 168)
      .map((r) => ({ repo: r.repo, detail: `${Math.round(r.push_age_h as number)}h בלי דחיפה` }));
    const stale = rows
      .filter((r) => typeof r.push_age_h === "number" && (r.push_age_h as number) > 24 && (r.push_age_h as number) <= 168)
      .map((r) => ({ repo: r.repo, detail: `${Math.round(r.push_age_h as number)}h מאז דחיפה אחרונה` }));
    const alerts = rows.filter((r) => (r.reds_48h ?? 0) > 0).map((r) => ({ repo: r.repo, detail: `${r.reds_48h} הרצות אדומות ב-48h` }));
    atomicWrite(OUT_FLOW, {
      generatedAt: at,
      writer: "organism-keeper",
      definitions: { orphan: "push-age לא נמדד", ghost: ">7 ימים בלי דחיפה", stale: ">24h מאז דחיפה", alert: "הרצה אדומה ב-48h" },
      orphans,
      ghosts,
      stale,
      alerts,
    });
    done.push("flow-map");
  } catch {
    /* fail-soft */
  }

  // 4) VALUE-MAP.md — מפת-ערך נמדדת: קיום/גודל/גיל של כל הזנה מוכרזת, עכשיו
  try {
    const declared: Array<[string, string]> = [
      ["FleetHQ/receipts/office-ci/verdict.json", "פסק-דין office-ci"],
      ["FleetHQ/receipts/office-state-mirror.json", "מראה office-state"],
      ["Sandbox/state/network-state.json", "פעימת-ה-keeper"],
      ["Sandbox/ops/integrity/verdict.json", "פסק-אמת-מדידה"],
      ["Sandbox/ops/office/potential.json", "estate rows + top-actions"],
      ["Sandbox/ops/office/work-orders.json", "פקודות-עבודה (issues)"],
      ["Sandbox/ops/flow/flow-map.json", "מפת-זרימות נמדדת"],
      ["Sandbox/ops/TOKEN-TRUTH.md", "אמת-טוקנים (בלי חומר-מפתח)"],
      ["Domain/agents/recruitment.json", "לוח-הגיוס"],
      ["Sandbox/proof/out/KEY-PROOF-LATEST.json", "הוכחת-מפתחות — דורש כספת (ר' KEY-PROOF-STATUS.md)"],
    ];
    const rowsMd = declared
      .map(([p, d]) => {
        const st = statSafe(path.join(ESTATE, p));
        const age = st.mtime ? `${Math.max(0, Math.round((Date.now() - st.mtime) / 60000))} דק׳` : "—";
        return `| \'${p}\' | ${d} | ${st.exists ? "קיים" : "חסר"} | ${st.bytes ?? "—"} | ${age} |`;
      })
      .join("\n");
    atomicWriteText(
      OUT_VALUEMAP,
      `# VALUE-MAP — נמדד עכשיו ע"י organism-keeper (${at})\n\nכל שורה נמדדה בטיק זה מהדיסק (stat). אין הצהרות — רק מדידה.\n\n| נתיב | תפקיד | מצב | bytes | גיל |\n|---|---|---|---|---|\n${rowsMd}\n`
    );
    done.push("value-map");
  } catch {
    /* fail-soft */
  }

  // 5) TOKEN-TRUTH.md — אמת-טוקנים: מצב ותוקף שנמדדים מה-response-header החי. אפס חומר-מפתח.
  try {
    if (token) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      const r = await fetch(`https://api.github.com/users/${ORG}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "organism-keeper" },
        cache: "no-store",
        signal: ac.signal,
      });
      clearTimeout(t);
      const expHeader = r.headers.get("github-authentication-token-expiration");
      let login: string | null = null;
      if (r.ok) {
        try {
          login = ((await r.json()) as Record<string, unknown>).login as string;
        } catch {
          /* login נשאר null */
        }
      }
      const expMs = expHeader ? new Date(expHeader.replace(" UTC", "Z")).getTime() : NaN;
      const days = Number.isFinite(expMs) ? Math.max(0, Math.floor((expMs - Date.now()) / 86_400_000)) : null;
      const row = `${at} | github-fine-grained-pat | ${r.ok ? "active" : "rejected"} | github_pat | org-read+dispatch | ${days ?? "—"} | expires ${expHeader ?? "—"} | ${login ?? "—"}`;
      atomicWriteText(
        OUT_TOKENTRUTH,
        `# TOKEN-TRUTH — נמדד חי ע"י organism-keeper (${at})\n\nחוק: אפס חומר-מפתח בקובץ — רק מצב, סוג, תוקף. הטוקן עצמו חי מחוץ ל-git (.secrets).\n\n| at | name | state | kind | scope | days | expires | login |\n|---|---|---|---|---|---|---|---|\n${row}\n`
      );
      done.push("token-truth");
    }
  } catch {
    /* fail-soft */
  }

  // 6) KEY-PROOF-STATUS.md — הסבר-כן על מה שלא ניתן למדוד (הכספת נמחקה) — לעולם לא LATEST.json מזויף
  try {
    atomicWriteText(
      OUT_KEYPROOF_STATUS,
      `# KEY-PROOF — מצב (organism-keeper, ${at})\n\nKEY-PROOF-LATEST.json אינו נכתב בכוונה: הוכחת-חיות-מפתחות דורשת כספת-מקומית שנמחקה באירוע-המחיקה של ה-estate.\nלפי חוזה-אין-זיופים: לא מומצאות ספירות-מפתחות. השיקום = שחזור-הכספת ואז הרצת המדידה מחדש.\n`
    );
    done.push("keyproof-status");
  } catch {
    /* fail-soft */
  }

  return done;
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

  // truth-feeds — כל ההזנות המוכרזות נשארות חיות גם-אחרי wipe (Task 46)
  const truthDone = await truthFeeds(m, at).catch((e) => {
    console.error("[keeper] truthFeeds error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return [] as string[];
  });

  // state-versioning — המדינה תמיד בגיט (Task 47: "למה אתה לא בגיט")
  const snap = snapshotState(at);

  console.log(
    `[keeper] tick #${tickCount} at ${at} — status=${status} repos=${m.repoRows.length} officeAgeH=${m.officeAgeH} state=${stateOk ? "written" : "FAILED"} potential=${potentialOk ? "written" : "skipped"} truth=${truthDone.join("+") || "none"} snapshot=${snap} reasons=${m.reasons.length}`
  );
}

/* state snapshot — git-commit של Sandbox (המדינה של האורגניזם) אחרי כל טיק.
   fail-soft לחלוטין: גיט שנכשל לא מפיל טיק; commit רק כשיש שינוי אמיתי. */
function snapshotState(at: string): string {
  try {
    const sb = "/home/z/estate/Sandbox";
    execFileSync("git", ["add", "-A"], { cwd: sb, timeout: 20000 });
    const staged = execFileSync("git", ["status", "--porcelain"], { cwd: sb, timeout: 10000 }).toString().trim();
    if (!staged) return "clean";
    execFileSync(
      "git",
      ["-c", "user.name=saos-state", "-c", "user.email=state@saos.local", "commit", "-m", `state: tick ${tickCount} at ${at}`],
      { cwd: sb, timeout: 20000 }
    );
    return "committed";
  } catch (e) {
    console.error("[keeper] snapshot-failed:", e instanceof Error ? e.message.slice(0, 100) : e);
    return "failed";
  }
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
          feeds: {
            state: stat(OUT_STATE),
            potential: stat(OUT_POTENTIAL),
            workOrders: stat(OUT_WORKORDERS),
            integrity: stat(OUT_INTEGRITY),
            flowMap: stat(OUT_FLOW),
            tokenTruth: stat(OUT_TOKENTRUTH),
          },
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
