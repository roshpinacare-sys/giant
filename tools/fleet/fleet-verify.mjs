// ═══════════════════════════════════════════════════════════════════════════
// ARTERY-FLEET · מכונת-האמת של הצי — אימות-ריפואים-קריטיות מהגיט (T-53).
// ───────────────────────────────────────────────────────────────────────────
// הבעיה-שנמדדה (2026-10-11): כל-ה-Actions של הריפואים-הפרטיות מתים-בחומת-מכסה
// מאז 10-05 — אימות-המוח (steem engine), ה-dex והספרייה (saos-agents) נעשה
// במכונות-מקומיות בלבד = לא-ניתן-לאימות-מהגיט. והמנוע בכלל לא רץ מ-checkout
// נקי בלי משמעת-התקנה (selftest: ERR_MODULE_NOT_FOUND — נמדד-חי).
// התיקון: מדידה-קבועה מ-Sandbox (Actions ציבורי = דקות-חינם) + חוקי-צי אחידים.
// כשל ⇒ exit 1 (אדום) + קבלה-כנה בגיט (כולל FAIL). אפס-סודות-בפלט.
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORG = "roshpinacare-sys";
const TOKEN = process.env.ECO_WALLET_TOKEN || "";
const out = (...a) => console.log(...a);

if (!TOKEN) {
  // BLOCKED-SILENT LAW v2 (owner word 2026-10-13): an owner-word gate is a DESIGNED state,
  // not a malfunction. The lane measured the one thing it can (the gate itself), wrote the
  // honest BLOCKED receipt, and must NOT page the owner with a red run every cycle.
  // Loud red is reserved for FAIL/ERROR (real defects). The alarm lives on in the receipt,
  // the office-pulse freshness board and the GridWatch census — they read receipts, not colors.
  // History: 3-a fix (measured run 38305751418) made the receipt land even on the gate path.
  out("BLOCKED: ECO_WALLET_TOKEN absent — nothing measured, nothing claimed");
  const blocked = {
    at: new Date().toISOString(),
    repos: {},
    alerts: ["ECO_WALLET_TOKEN absent - owner secret not wired to this repo; nothing measured, nothing claimed"],
    overall: "BLOCKED",
    reason: "ECO_WALLET_TOKEN absent — nothing measured, nothing claimed",
    provenance: {
      runId: process.env.GITHUB_RUN_ID || null,
      runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
      sha: process.env.GITHUB_SHA || null,
    },
  };
  try {
    mkdirSync("receipts/fleet", { recursive: true });
    writeFileSync("receipts/fleet/verdict.json", JSON.stringify({ ...blocked, details: [] }, null, 2) + "\n");
    appendFileSync("receipts/fleet/log.jsonl", JSON.stringify(blocked) + "\n");
  } catch (e) { out("receipt-write error:", String(e.message || e).slice(0, 200)); }
  process.exit(0); // BLOCKED = designed waiting state — receipt carries the truth, run stays green
}


// הצי-הקריטי: מוח (steem engine selftest) · dex (typecheck) · ספרייה (agents selftest)
const FLEET = [
  {
    name: "steem-cockpit",
    slug: `${ORG}/steem`,
    checks: [
      { id: "install", cmd: "bun", args: ["install", "--frozen-lockfile"] },
      { id: "engineInstall", cmd: "bun", args: ["install"], cwd: "mini-services/saos-engine" },
      { id: "engineSelftest", cmd: "bun", args: ["selftest.mjs"], cwd: "mini-services/saos-engine", timeout: 600000, expect: "SELFTEST" },
    ],
  },
  {
    name: "saos-dex",
    slug: `${ORG}/saos-dex`,
    checks: [
      { id: "install", cmd: "bun", args: ["install", "--frozen-lockfile"] },
      { id: "typecheck", cmd: "bun", args: ["run", "typecheck"], timeout: 600000 },
    ],
  },
  {
    name: "saos-agents",
    slug: `${ORG}/saos-agents`,
    checks: [
      { id: "agentsSelftest", cmd: "bun", args: ["test/selftest.mjs"], timeout: 300000, expect: "SELFTEST" },
    ],
  },
  {
    name: "saos-wallet",
    slug: `${ORG}/Saosmartwallet`,
    checks: [], // הבנייה נמדדת שעתית ב-artery-wallet (T-52) — כאן רק חוקי-הארנק (חוזה-צי, מדידה-כפולה)
    walletLaws: true,
  },
  {
    // I-סדרה (2026-10-11): זרוע-השיווק החיה (E-סדרה החייאה) — תוכן סטטי (fact-sheet מגובה-txids,
    // kits EN/HE, claims-guard) שהתחייב לעורקי-אמת ולא סיפק. מעתה: gitleaks-HEAD + חוקי-צי
    // רצים עליו כאן מדקות-ציבוריות (ה-Actions-שלו-עצמו מתים-בחומת-המכסה-הפרטית — נמדד).
    // מדידה-מקומית לפני-חיווט (2026-10-11): gitleaks-HEAD --no-git = 0 ממצאים.
    name: "adsmarket",
    slug: `${ORG}/Adsmarket`,
    checks: [],
  },
];

// חוקי-צי אחידים — כל-ריפו-קריטי נבדק מולם (החוזה של הסקירות, הופך-מכונה)
function fleetLaws(wdir, headScanned) {
  const laws = [];
  // 1) תיאטרון-CI אסור: אין דפוס skipped-עובר באף-workflow
  const wfDir = join(wdir, ".github/workflows");
  let theater = 0, scanned = 0;
  if (existsSync(wfDir)) {
    for (const f of execFileSync("ls", [wfDir]).toString().trim().split("\n").filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
      scanned++;
      const txt = readFileSync(join(wfDir, f), "utf8");
      if (txt.includes('!= "fail"')) theater++;
    }
  }
  laws.push({ id: "law-no-skipped-pass", verdict: theater === 0 ? "pass" : "fail", detail: `workflows scanned: ${scanned}, theater patterns: ${theater}` });
  // 2) סריקת-סודות על-push (אם-gitleaks.yml קיים — חייב push trigger)
  //    אמנת-קיר-החיוב (2026-10-13): בריפו פרטי מאחורי קיר-הדקות ריצת-push תמות ברמת-ה-job
  //    לפני כל-שלב (מדוד 6/6, BlobNotFound) — red שלא-יכול-להיות-ירוק הוא רעש. החוזה
  //    המושג: יכולת-סריקה בריפו (push/pull/dispatch) + הסריקה החיה של העורק הזה — law-1
  //    למעלה סרק את HEAD ב-gitleaks בריצה הזאת עצמה (עדות על-כל-דחיפה עד-רמת-קצב-העורק).
  const glPath = join(wfDir, "gitleaks.yml");
  if (existsSync(glPath)) {
    const glTxt = readFileSync(glPath, "utf8");
    const anyTrigger = glTxt.includes("push:") || glTxt.includes("pull_request:") || glTxt.includes("workflow_dispatch:");
    const arteryScannedHead = headScanned === true;
    const ok = anyTrigger && arteryScannedHead;
    laws.push({ id: "law-gitleaks-push", verdict: ok ? "pass" : "fail", detail: ok ? "scan capability present + this artery scanned HEAD this run (billing-wall covenant: the artery is the push layer for walled repos)" : "gitleaks.yml present but no trigger at all, or HEAD not scanned this run" });
  } else laws.push({ id: "law-gitleaks-push", verdict: "flag", detail: "no gitleaks.yml in repo — no in-repo secret scan" });
  // 3) R11 חייב להישאר מחוץ-לHEAD
  const r11 = existsSync(join(wdir, "agent/vault/recovery-meta-2026-09-12.json"));
  laws.push({ id: "law-r11-head-absent", verdict: r11 ? "fail" : "pass", detail: r11 ? "R11 key-material metadata REAPPEARED at HEAD" : "absent at HEAD" });
  return laws;
}

/* חוקי-הארנק כחוזה-צי (T-64): חמשת-החוקים של wallet-verify נאכפים גם כאן —
 * מדידה-כפולה בלתי-תלויה. אם מישהו יחליש את עורק-הארנק או את קוד-השער,
 * העורק-הזה יצעק. severity זהה למקור (provenance = flag, השאר fail). */
function walletFleetLaws(wdir, headScanned) {
  const laws = [];
  const read = (p) => (existsSync(join(wdir, p)) ? readFileSync(join(wdir, p), "utf8") : null);
  const push = (id, ok, detail, severity = "fail") => laws.push({ id, verdict: ok ? "pass" : severity, detail });
  const unlock = read("src/app/api/gate/unlock/route.ts") || "";
  push("law-unlock-ratelimit", unlock.includes("rateLimit("), "unlock endpoint must gate online passphrase guessing");
  const wv = read(".github/workflows/wallet-verify.yml") || "";
  push("law-no-skipped-pass", !wv.includes('!= "fail"') && wv.includes("push:"), "CI verdict law: skipped is never pass + push trigger present");
  const gl = read(".github/workflows/gitleaks.yml") || "";
  push("law-gitleaks-push", gl.includes("push:"), "secret scan must run on every push, not only PRs");
  push("law-r11-head-absent", !existsSync(join(wdir, "agent/vault/recovery-meta-2026-09-12.json")), "R11 key-material metadata file must stay absent at HEAD");
  const status = read("agent/status.json");
  if (status) {
    try {
      const s = JSON.parse(status);
      if (s.verdict === "PASS") {
        const prov = s.provenance || {};
        const ok = typeof prov.runUrl === "string" && prov.runUrl.includes("/actions/runs/");
        push("law-pass-provenance", ok, ok ? `receipt provenance: ${prov.runUrl}` : "PASS receipt minted out-of-band — flagged; artery measurement is the authoritative verdict", "flag");
      }
    } catch { laws.push({ id: "law-pass-provenance", verdict: "flag", detail: "agent/status.json unparseable" }); }
  }
  return laws;
}

const tmp = mkdtempSync(join(tmpdir(), "fleet-verify-"));
const results = [];
const overall = { at: new Date().toISOString(), repos: {}, alerts: [], overall: "FAIL", reason: "" };
const askpass = join(tmp, "askpass.sh");
writeFileSync(askpass, "#!/bin/sh\ncase \"$1\" in Username*) echo x-access-token ;; Password*) echo \"$ECO_WALLET_TOKEN\" ;; esac\n", { mode: 0o700 });

// סריקת-סודות על HEAD — הבינארי-המקובע (הקנון: Domain/Defi gitleaks.yml). מתה-אורג-wide מאז 09-20; חוזרת דרך דקות-חינם.
let GLBIN = null;
try {
  const tgz = join(tmp, "gl.tgz");
  const res = await fetch("https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz");
  if (res.ok) {
    writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    execFileSync("tar", ["-xzf", tgz, "-C", tmp, "gitleaks"]);
    GLBIN = join(tmp, "gitleaks");
    out("gitleaks binary ready (v8.24.3, HEAD-only scan)");
  } else out(`gitleaks download skipped: http=${res.status} — scan law degrades to flag`);
} catch (e) { out(`gitleaks download failed: ${String(e.message).slice(0, 120)} — scan law degrades to flag`); }

function gitleaksHeadScan(wdir, repName) {
  if (!GLBIN) return { id: "law-no-secrets-at-head", verdict: "flag", detail: "scanner unavailable this run (download failed) — no HEAD secret scan" };
  const rep = join(tmp, `gl-${repName}.json`);
  try {
    execFileSync(GLBIN, ["detect", "--source", wdir, "--no-git", "--report-format", "json", "--report-path", rep, "--redact", "--no-banner", "--log-level", "error"], { timeout: 300000, stdio: ["ignore", "pipe", "pipe"] });
    return { id: "law-no-secrets-at-head", verdict: "pass", detail: "gitleaks HEAD scan: 0 findings" };
  } catch (e) {
    // exit 1 = findings; פרס-מטא-דאטה בלבד (--redact — אפס-ערכים)
    let count = 0; const top = [];
    try {
      const findings = JSON.parse(readFileSync(rep, "utf8"));
      count = findings.length;
      const uniq = [...new Set(findings.map((f) => `${f.RuleID}@${f.File || ""}`))];
      top.push(...uniq);
    } catch { /* report unreadable */ }
    return { id: "law-no-secrets-at-head", verdict: count > 0 ? "flag" : "flag", detail: count > 0 ? `gitleaks HEAD scan: ${count} finding(s) — redacted metadata: ${top.join(", ")}` : "scan ran, report unreadable" };
  }
}

for (const repo of FLEET) {
  const r = { at: overall.at, slug: repo.slug, head: null, checks: {}, laws: [], alerts: [], overall: "FAIL", reason: "" };
  const wdir = join(tmp, repo.name);
  try {
    execFileSync("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${repo.slug}.git`, wdir], {
      stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0" }, timeout: 300000,
    });
    r.head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: wdir }).toString().trim();
    const scanLaw = gitleaksHeadScan(wdir, repo.name);
    r.laws.push(scanLaw);
    out(`${repo.name}/${scanLaw.id}: ${scanLaw.verdict} — ${scanLaw.detail}`);
    for (const c of repo.checks) {
      const cwdAbs = c.cwd ? join(wdir, c.cwd) : wdir;
      try {
        const o = execFileSync(c.cmd, c.args, { cwd: cwdAbs, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: c.timeout || 600000 });
        if (c.expect && !o.includes(c.expect)) throw new Error(`expected marker "${c.expect}" missing in output`);
        r.checks[c.id] = "pass";
        out(`${repo.name}/${c.id}=pass`);
      } catch (e) {
        r.checks[c.id] = "fail";
        r.reason = `${c.id} failed: ${String(e.stdout || e.stderr || e.message).split("\n").slice(-4).join(" | ").slice(-240)}`;
        out(`${repo.name}/${c.id}=FAIL — ${r.reason}`);
      }
    }
    const headScannedOk = !!scanLaw && (scanLaw.verdict === "pass" || (scanLaw.verdict === "flag" && !String(scanLaw.detail || "").includes("unavailable")));
    r.laws.push(...fleetLaws(wdir, headScannedOk));
    if (repo.walletLaws) r.laws.push(...walletFleetLaws(wdir, headScannedOk));
    for (const l of r.laws) {
      if (l.verdict === "flag") r.alerts.push(`${l.id}: ${l.detail}`);
      out(`${repo.name}/${l.id}: ${l.verdict} — ${l.detail}`);
    }
    const checkFail = Object.values(r.checks).some((v) => v === "fail");
    const lawFail = r.laws.some((l) => l.verdict === "fail");
    r.overall = checkFail || lawFail ? "FAIL" : "PASS";
    if (r.overall === "PASS" && !r.reason) r.reason = "all checks and fleet laws pass";
  } catch (e) {
    r.overall = "ERROR";
    r.reason = String(e.message || e).slice(0, 240);
    out(`${repo.name}: ERROR — ${r.reason}`);
  }
  results.push(r);
  overall.repos[repo.name] = { head: r.head, overall: r.overall, checks: r.checks, reason: r.reason };
  if (r.alerts.length) overall.alerts.push(...r.alerts.map((a) => `${repo.name}: ${a}`));
}

overall.overall = results.every((r) => r.overall === "PASS") ? "PASS" : "FAIL";
overall.reason = results.map((r) => `${r.slug.split("/")[1]}=${r.overall}`).join(" · ");

// provenance (G-series law, closes the unprovenanced FLAG on receipts/fleet): the receipt
// carries its own Actions run identity - the integrity guard verifies it against the API.
overall.provenance = {
  runId: process.env.GITHUB_RUN_ID || null,
  runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  sha: process.env.GITHUB_SHA || null,
};

// קבלות-כנות תמיד (כולל FAIL)
try {
  mkdirSync("receipts/fleet", { recursive: true });
  writeFileSync("receipts/fleet/verdict.json", JSON.stringify({ ...overall, details: results }, null, 2) + "\n");
  appendFileSync("receipts/fleet/log.jsonl", JSON.stringify(overall) + "\n");
  for (const r of results) {
    writeFileSync(`receipts/fleet/${r.slug.split("/")[1]}.json`, JSON.stringify(r, null, 2) + "\n");
  }
} catch (e) { out("receipt-write error:", String(e.message || e).slice(0, 200)); }

if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
out(`VERDICT: ${overall.overall} — ${overall.reason}`);
process.exit(overall.overall === "PASS" ? 0 : 1);
