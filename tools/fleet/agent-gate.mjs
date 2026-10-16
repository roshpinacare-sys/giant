#!/usr/bin/env node
/**
 * agent-gate.mjs — שער-הסוכנים (T-44 · agent-3 orchestrator)
 * ═════════════════════════════════════════════════════════════════════════════
 * מטרה: לאפשר לסוכני-הצי (לא רק למפעיל-האנושי) להיכנס ל-Sandbox — בזהות-מאומתת,
 * בהיקף-מוגדר, עם קבלות-מבוקרות — בלי שאף-טוקן-סוכן נוגע-אי-פעם בגיט.
 *
 * חוזה-אפס-חשיפה (מיושר ל-tools/seal.mjs של agent-1 ול-SECURITY.md):
 *   · טוקן-סוכן: קיים רק ב-(a) קובץ-מקומי gitignored (agents/.agent-tokens.env)
 *     (b) GitHub repo-secret (SBX_AGENT_TOKEN_<ID>) — לעולם-לא-בגיט/לוג/קבלה.
 *   · בריפו נשאר רק verifier = PBKDF2-HMAC-SHA256(טוקן, salt) · 650,000 איטרציות
 *     · מפתח-32B — זהה לחוזה הקונסולה (קנון-62 של agent-1).
 *   · הוכחת-זיהוי = אתגר-מענה: proof = sha256(טוקן + ":" + אתגר-טרי) — האתגר
 *     נכתב-ע"י-ה-runner ונשרף-בהצלחה; proof שנראה בפומבי אינו-שימושי-חוזר.
 *   · כל-ההשוואות קבועות-זמן (timingSafeEqual). כל-כישלון = קבלה-כנה + יציאה 1.
 *
 * CLI:
 *   node engine/agent-gate.mjs challenge --id <agent-N>
 *   node engine/agent-gate.mjs verify    --id <agent-N>            # proof via env SBX_PROOF
 *   node engine/agent-gate.mjs report    --id <agent-N> --text "…"
 *   node engine/agent-gate.mjs selftest                            # עץ-זמני + תהליכי-ילד
 *   node engine/agent-gate.mjs register  --id <agent-N> --token <טוקן>  # SBX_ADMIN_CONFIRM=1 חובה
 *
 * משתני-סביבה: SBX_AGENT_ID · SBX_PROOF · SBX_TEXT · SBX_AGENT_TOKEN_<ID> (סוד)
 * SBX_ROOT: השתרשות-חלופית — ל-selftest-בלבד (עץ-זמני); אסור-ב-production.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
const SELF_ROOT = path.dirname(path.dirname(MODULE_PATH));
const ROOT = process.env.SBX_ROOT && process.env.SBX_ROOT !== "" ? path.resolve(process.env.SBX_ROOT) : SELF_ROOT;
const AGENTS_DIR = path.join(ROOT, "agents");
const REGISTRY = path.join(AGENTS_DIR, "agents.json");
const CHALLENGES_DIR = path.join(AGENTS_DIR, "challenges");
const RECEIPTS_LOG = path.join(AGENTS_DIR, "receipts", "log.jsonl");
const REPORTS_DIR = path.join(AGENTS_DIR, "reports");
const RECEIPTS_MAX = 100;
const REPORTS_MAX = 200;

const ITERATIONS = 650_000;
const KEY_LEN = 32;
const SALT_LEN = 16;

/* ── עזרי-עץ ──────────────────────────────────────────────────────────────── */
function fail(msg, code = 1) {
  console.error(`[agent-gate] ✖ ${msg}`);
  process.exit(code);
}
function ok(msg) {
  console.log(`[agent-gate] ✔ ${msg}`);
}
/** atomic write: tmp+rename באותה-תיקייה (חוזה-state) */
function atomicWrite(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}
/** רוטציית-גבול לקובץ-שורות: שורות-כותרת (#) נשמרות-תמיד */
function rotateLines(file, max) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const header = lines.filter((l) => l.startsWith("#"));
  const body = lines.filter((l) => l !== "" && !l.startsWith("#"));
  if (body.length <= max) return;
  atomicWrite(file, Buffer.from([...header, ...body.slice(-max), ""].join("\n"), "utf8"));
}

/* ── רישום ────────────────────────────────────────────────────────────────── */
function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) fail(`רישום-חסר: agents/agents.json (יחסי ל-SBX_ROOT=${ROOT === SELF_ROOT ? "." : "tmp"})`);
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  if (reg.schema !== "sanbox-agents/1") fail(`סכימת-רישום-לא-נתמכת: ${reg.schema}`);
  return reg;
}
function findMember(reg, id) {
  const m = reg.members.find((x) => x.id === id);
  if (!m) fail(`סוכן-לא-רשום: ${id}`, 2);
  return m;
}
function tokenEnvName(id) {
  return `SBX_AGENT_TOKEN_${String(id).replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}
function loadToken(id) {
  const name = tokenEnvName(id);
  const tok = process.env[name];
  if (!tok || tok.length < 16) fail(`טוקן-סוכן-חסר/קצר-מדי (env ${name}) — לעולם-לא-argv פומבי`, 3);
  return tok;
}
function verifierOf(token, saltB64) {
  return crypto.pbkdf2Sync(Buffer.from(token, "utf8"), Buffer.from(saltB64, "base64"), ITERATIONS, KEY_LEN, "sha256");
}
function constEq(a, b) {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(a, "utf8");
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ── קבלות ────────────────────────────────────────────────────────────────── */
function appendReceipt(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
  fs.mkdirSync(path.dirname(RECEIPTS_LOG), { recursive: true });
  fs.appendFileSync(RECEIPTS_LOG, line, "utf8");
  rotateLines(RECEIPTS_LOG, RECEIPTS_MAX);
}

/* ── אתגר ─────────────────────────────────────────────────────────────────── */
function challengePath(id) {
  return path.join(CHALLENGES_DIR, `${id}.txt`);
}
function readChallenge(id) {
  const p = challengePath(id);
  if (!fs.existsSync(p)) fail(`אתגר-חסר ל-${id} — הרץ challenge קודם`, 4);
  const c = fs.readFileSync(p, "utf8").trim();
  if (!/^[0-9a-f]{32,128}$/.test(c)) fail(`אתגר-פגום ל-${id} (פורמט)`, 4);
  return c;
}
function writeChallenge(id) {
  const nonce = crypto.randomBytes(16).toString("hex"); // 32-hex · פומבי-מטבעו
  atomicWrite(challengePath(id), Buffer.from(nonce + "\n", "utf8"));
  return nonce;
}
function proofOf(token, challenge) {
  return crypto.createHash("sha256").update(`${token}:${challenge}`, "utf8").digest("hex");
}

/* ── פקודות ───────────────────────────────────────────────────────────────── */
function cmdChallenge(id) {
  const reg = loadRegistry();
  findMember(reg, id); // רק-רשומים מקבלים-אתגר
  const nonce = writeChallenge(id);
  ok(`אתגר-חדש ל-${id}: ${nonce} (פומבי-מטבעו; הוכחה=sha256(טוקן:אתגר))`);
}
function cmdVerify(id, { text = null } = {}) {
  const reg = loadRegistry();
  findMember(reg, id);
  const token = loadToken(id);
  const challenge = readChallenge(id);
  const proof = (process.env.SBX_PROOF || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(proof)) {
    appendReceipt({ kind: text === null ? "verify" : "report", agentId: id, verdict: "failed", reason: "proof-missing-or-malformed" });
    fail("proof-חסר/פגום (64-hex נדרש)", 5);
  }
  if (!constEq(proof, proofOf(token, challenge))) {
    appendReceipt({ kind: text === null ? "verify" : "report", agentId: id, verdict: "failed", reason: "proof-mismatch" });
    fail(`הוכחה-נדחתה ל-${id} — טוקן/אתגר לא-תואמים`, 6);
  }
  appendReceipt({ kind: text === null ? "verify" : "report", agentId: id, verdict: "ok" });
  ok(`${text === null ? "אימות" : "דיווח"}-אושר: ${id} (אתגר ${challenge.slice(0, 8)}… נשרף)`);
  writeChallenge(id); // שריפה: אותו-proof לעולם-לא-עובר-פעמיים
  if (text !== null) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const f = path.join(REPORTS_DIR, `${id}.jsonl`);
    fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), id, text: String(text).slice(0, 500) }) + "\n", "utf8");
    rotateLines(f, REPORTS_MAX);
  }
}
function cmdRegister(id, token) {
  if (process.env.SBX_ADMIN_CONFIRM !== "1") fail("רישום/רוטציה מחייבים SBX_ADMIN_CONFIRM=1 (פעולת-בעלים)", 7);
  if (!/^[A-Za-z0-9-]{3,40}$/.test(id || "")) fail("מזהה-סוכן-לא-כשר (3–40: אותיות/ספרות/מקף)", 7);
  if (!token || token.length < 16) fail("טוקן-קצר-מדי (≥16 תווים; מומלץ 43 base64url)", 7);
  const reg = fs.existsSync(REGISTRY)
    ? JSON.parse(fs.readFileSync(REGISTRY, "utf8"))
    : { schema: "sanbox-agents/1", kdf: "PBKDF2-HMAC-SHA256", iterations: ITERATIONS, hash: "SHA-256", keyLen: KEY_LEN, updatedAt: null, members: [] };
  const salt = crypto.randomBytes(SALT_LEN).toString("base64");
  const verifier = verifierOf(token, salt).toString("base64");
  const now = new Date().toISOString();
  const existing = reg.members.find((x) => x.id === id);
  if (existing) {
    existing.saltB64 = salt;
    existing.verifierB64 = verifier;
    existing.rotatedAt = now;
  } else {
    reg.members.push({ id, scope: "act", saltB64: salt, verifierB64: verifier, createdAt: now, rotatedAt: null, note: "" });
  }
  reg.updatedAt = now;
  atomicWrite(REGISTRY, Buffer.from(JSON.stringify(reg, null, 1) + "\n", "utf8"));
  ok(`${existing ? "רוטציה" : "רישום"}-הושלם ל-${id} (verifier-חדש; הטוקן-עצמו-לא-נכתב-לשום-קובץ-נעקב)`);
}

/* ── selftest: עץ-זמני + תהליכי-ילד — בודק את-ממשק-ה-CLI האמיתי ───────────── */
function cmdSelftest() {
  let passed = 0;
  let total = 0;
  const t = (name, cond) => {
    total++;
    if (cond) passed++;
    else console.error(`  ✖ selftest-${total}: ${name}`);
  };
  const tmp = fs.mkdtempSync("/tmp/sbx-agent-selftest-");
  const childEnv = (extra) => ({
    ...process.env,
    SBX_ROOT: tmp,
    ...extra,
  });
  const run = (args, env) => {
    const out = spawnSync(process.execPath, [MODULE_PATH, ...args], { env: childEnv(env), encoding: "utf8" });
    return { status: out.status, stdout: out.stdout || "", stderr: out.stderr || "" };
  };

  try {
    // עץ-זמני: רישום-שני-סוכנים + אתגרים
    const tokA = crypto.randomBytes(32).toString("base64url");
    const tokB = crypto.randomBytes(32).toString("base64url");
    fs.mkdirSync(path.join(tmp, "agents"), { recursive: true });
    for (const [id, tok] of [["selftest-a", tokA], ["selftest-b", tokB]]) {
      const r = run(["register", "--id", id, "--token", tok], { SBX_ADMIN_CONFIRM: "1" });
      if (r.status !== 0) throw new Error(`register ${id} failed: ${r.stderr}`);
    }

    // 1) challenge כותב-נונס-כשר
    let r = run(["challenge", "--id", "selftest-a"], {});
    const chalA = fs.readFileSync(path.join(tmp, "agents", "challenges", "selftest-a.txt"), "utf8").trim();
    t("challenge-יצר-נונס-32hex", r.status === 0 && /^[0-9a-f]{32}$/.test(chalA));

    // 2) עגול verifier מול-הרישום-שנכתב
    const reg = JSON.parse(fs.readFileSync(path.join(tmp, "agents", "agents.json"), "utf8"));
    const memA = reg.members.find((m) => m.id === "selftest-a");
    t("verifier-ברישום=PBKDF2(טוקן)", constEq(verifierOf(tokA, memA.saltB64), Buffer.from(memA.verifierB64, "base64")));
    t("salt-טרי-בין-חברים", memA.saltB64 !== reg.members.find((m) => m.id === "selftest-b").saltB64);

    // 3) verify נכון עובר + שורף-אתגר
    const proof = proofOf(tokA, chalA);
    r = run(["verify", "--id", "selftest-a"], { SBX_AGENT_TOKEN_SELFTESTA: tokA, SBX_PROOF: proof });
    t("verify-נכון-עובר", r.status === 0);
    const chalAfter = fs.readFileSync(path.join(tmp, "agents", "challenges", "selftest-a.txt"), "utf8").trim();
    t("אתגר-נשרף-והתחלף", chalAfter !== chalA);

    // 4) replay של-אותו-proof מול-האתגר-החדש-נדחה
    r = run(["verify", "--id", "selftest-a"], { SBX_AGENT_TOKEN_SELFTESTA: tokA, SBX_PROOF: proof });
    t("replay-נדחה", r.status !== 0);

    // 5) טוקן-שגוי-נדחה: סוד-ה-runner=הטוקן-הרשום; ההוכחה=של-טוקן-זר (סוכן-מזויף)
    r = run(["verify", "--id", "selftest-a"], { SBX_AGENT_TOKEN_SELFTESTA: tokA, SBX_PROOF: proofOf(tokB, chalAfter) });
    t("טוקן-שגוי-נדחה", r.status !== 0);

    // 6) סוכן-לא-רשום נדחה
    r = run(["challenge", "--id", "ghost-x"], {});
    t("סוכן-לא-רשום-נדחה", r.status !== 0);

    // 7) report נכון: עובר + כותב + קבלה ok (אתגר-מוקדם-חובה)
    run(["challenge", "--id", "selftest-b"], {});
    const chalB0 = fs.readFileSync(path.join(tmp, "agents", "challenges", "selftest-b.txt"), "utf8").trim();
    r = run(["report", "--id", "selftest-b", "--text", "drill-report"], { SBX_AGENT_TOKEN_SELFTESTB: tokB, SBX_PROOF: proofOf(tokB, chalB0) });
    const repFile = path.join(tmp, "agents", "reports", "selftest-b.jsonl");
    t("report-עובר-וכותב", r.status === 0 && fs.existsSync(repFile) && fs.readFileSync(repFile, "utf8").includes("drill-report"));

    // 8) report עם-proof-רקוב נדחה + קבלת-כישלון-כנה
    const logBefore = fs.readFileSync(path.join(tmp, "agents", "receipts", "log.jsonl"), "utf8");
    r = run(["report", "--id", "selftest-b", "--text", "bad"], { SBX_AGENT_TOKEN_SELFTESTB: tokB, SBX_PROOF: proofOf(tokB, chalB0) });
    const logAfter = fs.readFileSync(path.join(tmp, "agents", "receipts", "log.jsonl"), "utf8");
    t("proof-רקוב-נדחה", r.status !== 0 && logAfter.length > logBefore.length && logAfter.includes('"verdict":"failed"'));

    // 9) rotate: register על-קיים מעדכן-rotatedAt ומבטל-טוקן-ישן
    const tokA2 = crypto.randomBytes(32).toString("base64url");
    r = run(["register", "--id", "selftest-a", "--token", tokA2], { SBX_ADMIN_CONFIRM: "1" });
    const reg2 = JSON.parse(fs.readFileSync(path.join(tmp, "agents", "agents.json"), "utf8"));
    const memA2 = reg2.members.find((m) => m.id === "selftest-a");
    t("רוטציה-מעדכנת-verifier", r.status === 0 && !constEq(verifierOf(tokA, memA2.saltB64), Buffer.from(memA2.verifierB64, "base64")) && constEq(verifierOf(tokA2, memA2.saltB64), Buffer.from(memA2.verifierB64, "base64")));

    // 10) register בלי-SBX_ADMIN_CONFIRM נדחה
    r = run(["register", "--id", "selftest-c", "--token", tokA2], { SBX_ADMIN_CONFIRM: "" });
    t("register-בלי-אישור-נדחה", r.status !== 0);

    console.log(`[agent-gate] selftest: ${passed}/${total} ${passed === total ? "OK" : "FAILED"}`);
    if (passed !== total) process.exit(1);
  } catch (e) {
    console.error(`[agent-gate] ✖ selftest-חריג: ${e.message}`);
    process.exit(1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ── ממשק ─────────────────────────────────────────────────────────────────── */
function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const cmd = process.argv[2];
const id = process.env.SBX_AGENT_ID || argOf("--id");
switch (cmd) {
  case "challenge":
    cmdChallenge(id);
    break;
  case "verify":
    cmdVerify(id);
    break;
  case "report":
    cmdVerify(id, { text: process.env.SBX_TEXT || argOf("--text") || "" });
    break;
  case "selftest":
    cmdSelftest();
    break;
  case "register":
    cmdRegister(id, argOf("--token") || process.env.SBX_REGISTER_TOKEN || fail("register מחייב --token או env SBX_REGISTER_TOKEN", 7));
    break;
  default:
    fail(`פקודה-לא-מוכרת: ${cmd} (challenge|verify|report|selftest|register)`, 8);
}
