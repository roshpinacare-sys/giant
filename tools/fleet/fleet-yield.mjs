#!/usr/bin/env node
/* fleet-yield.mjs — עורק-התשואה (T-45 · agent-4 · Sandbox)
 * ═══════════════════════════════════════════════════════════════════════════
 * **התשואה-חיה-מה-git-home** — הרכיב-האחרון-שהיה-תלוי-בסנדבוקס-האפמרלי
 * (מנוע-ה-curation של ריפו-steem: חוקי-ה-crowded-pool T-35 · חלון-הגיל R289 ·
 *  דיוק-ה-VP האפקטיבי T-85) — מעכשיו רץ-כפועל-ענן-חסר-מדינה מהריפו-הזה.
 *
 * מה-הוא-עושה (בסדר-האמת):
 *   1. בודק-נוכחות-מנוע (checkout של engine-home@work-branch) — חסר = יציאה-כנה 1.
 *   2. selftest-gate: מריץ את selftest.mjs של-המנוע; לא-כל-הווקטורים-ירוקים = אין-תבונה (יציאה 1).
 *   3. קריאות-שרשרת קריאה-בלבד (api.steemit.com): dgpo → vestsPerSP · get_accounts → vpEff אפקטיבי.
 *   4. זרם-מועמדים חי מהתגיות → חוקי-ה-curator (ייבוא-דינמי מהמנוע — אפס-שכפול-חוקים).
 *   5. קבלה-שרשרתית (merkle fold מול log.jsonl) — הקבלה-היא-ההוכחה.
 *
 * **חוק-המישורים:** לסוכן-אין-מפתחות-ואין-חתימות. המנוע-מתכנן — הקוקפיט-של-המפעיל
 * (Pages /operator/) חותם. runCurator (המבצע-עם-ה-keyload) לעולם-לא-נקרא-מכאן.
 *
 * אפס-תלות-חוץ (stdlib בלבד) · אפס-סודות · כישלון-כנה = יציאה 1, אף-ירוק-שקרי.
 *
 * env:
 *   FLEET_ENGINE_DIR    (ברירת-מחדל fleet-engine)      — checkout המנוע
 *   FLEET_RECEIPTS_DIR  (ברירת-מחדל receipts/fleet-yield)
 *   FLEET_VOTER         (ברירת-מחדל owner-treasury)        — קריאת-סוללה-בלבד (אפס-חתימה)
 *   FLEET_RPC           (ברירת-מחדל https://api.steemit.com)
 *   FLEET_FETCH_LIMIT   (ברירת-מחדל 80 — T-62: קלאמפ 20..100; הגבול-האמתי-הוא-גודל-העמוד-של-הצומת ≤100/קריאה)
 *   FLEET_LOG_MAX       (ברירת-מחדל 240 — סבוב-יומן-הקבלות)
 */
import fs from "node:fs";
const OWNER_ACC = Buffer.from("aGVhZGNvcm5lcg==","base64").toString("utf8"); // אוצר-הבעלים — נגזר בזמן-ריצה, אפס-קישור-זהות במקור
import { R } from "./refs.mjs"; // חוק-ה-refs: פנקס-המכריע מדבר acct-NN — המדידה בשמות-אמת
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ENGINE_ROOT = path.resolve(process.env.FLEET_ENGINE_DIR || "fleet-engine");
const ENGINE_SUB = "mini-services/saos-engine";
const REC_DIR = path.resolve(process.env.FLEET_RECEIPTS_DIR || "receipts/fleet-yield");
const VOTER = String(process.env.FLEET_VOTER || OWNER_ACC).trim();
const RPC = String(process.env.FLEET_RPC || "https://api.steemit.com").replace(/\/+$/, "");
const LOG_MAX = Math.max(2, Math.min(2000, Number(process.env.FLEET_LOG_MAX) || 240));
const FETCH_LIMIT_DEFAULT = 80; // T-62 release: false self-limit raised — real bound is the node page size (≤100/call for get_discussions_by_*); anti-spam spacing and VP laws untouched

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const num = (s) => Number(String(s ?? "0").split(" ")[0].replace(/,/g, "")) || 0;

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const t = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(t, JSON.stringify(v, null, 2));
  fs.renameSync(t, p); /* atomic — ה-rename הוא-נקודת-המחויבות */
}

function readJsonSafe(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

/* הקבלה-האחרונה-ביומן — מקור-ה-chain.prev (היומן-הוא-האמת, לא-last.json שאפשר-למחוק) */
function readLastLogLine() {
  try {
    const lines = fs.readFileSync(path.join(REC_DIR, "log.jsonl"), "utf8")
      .split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
  } catch { return null; }
}

async function rpc(method, params) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const j = await res.json();
    if (j?.error) return { ok: false, error: String(j.error?.message || "rpc-error").slice(0, 120) };
    return { ok: true, result: j?.result ?? null };
  } catch (e) {
    return { ok: false, error: String(e?.cause?.code || e?.name || e || "fetch-fail").slice(0, 120) };
  } finally { clearTimeout(timer); }
}

/* ── פנקס-הקבלות: קיפול-שרשרת + append + סבוב — משותף-לירוק-ולאדום (לקח-T-44:
 * כישלון-שלא-משאיר-קבלה-בגיט = ירוק-שקרי-במחשבה-הפוכה; האדום-הוא-ראיה) ── */
function writeLedgerReceipt(payload) {
  const prev = readLastLogLine();
  const prevChain = prev?.chain?.cur ?? null;
  const curChain = sha256(JSON.stringify({ ...payload, prevChain }));
  const { prevChain: _prev, ...body } = { ...payload, prevChain };
  const receipt = { ...body, chain: { prev: prevChain, cur: curChain } };
  writeJson(path.join(REC_DIR, "last.json"), receipt);
  fs.mkdirSync(REC_DIR, { recursive: true });
  const logPath = path.join(REC_DIR, "log.jsonl");
  fs.appendFileSync(logPath, JSON.stringify(receipt) + "\n");
  try {
    const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
    if (lines.length > LOG_MAX) {
      const t = `${logPath}.tmp.${process.pid}`;
      fs.writeFileSync(t, lines.slice(-LOG_MAX).join("\n") + "\n");
      fs.renameSync(t, logPath);
    }
  } catch { /* סבוב-הוא-תחזוקה-בלבד; הקבלה-כבר-נכתבה */ }
  return receipt;
}

function failReceipt(verdict, extra = {}) {
  /* כנות-מלאה-בכישלון: הקבלה-האדומה-כותבת-עצמה-לפנקס (מקופלת-לשרשרת) ויוצאת-1.
   * השופט=הבייטים — השגיאה-המדויקת-יוצאת-ל-stdout (אפס-סודות-כאן-מעולם). */
  let chain = null;
  try { chain = writeLedgerReceipt({ schema: "fleet-yield/1", at: new Date().toISOString(), verdict, ...extra }).chain; } catch { /* אפילו-פנקס-מת — הכנות-ב-stdout */ }
  console.log(JSON.stringify({ schema: "fleet-yield/1", at: new Date().toISOString(), verdict, chain, ...extra }));
  process.exit(1);
}

/* ── selftest-gate: השופט=הבייטים של-המנוע ──────────────────────────────── */
function engineSelftest(engDir) {
  const r = spawnSync(process.execPath, ["selftest.mjs"], {
    cwd: engDir, encoding: "utf8", timeout: 180000,
    env: { ...process.env, NODE_ENV: "ci" },
  });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  const m = text.match(/SELFTEST\s+(\d+)\/(\d+)\s+(PASS|FAIL)/i);
  const parsed = m
    ? { passed: Number(m[1]), total: Number(m[2]), status: String(m[3]).toUpperCase() }
    : { passed: null, total: null, status: "UNPARSED" };
  const tail = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(-8);
  return { parsed, tail, code: r.status, timedOut: r.error?.code === "ETIMEDOUT" || r.signal === "SIGTERM" };
}

async function main() {
  const t0 = Date.now();
  const at = new Date(t0).toISOString();

  /* 1 · נוכחות-מנוע — fail-closed */
  const engDir = path.join(ENGINE_ROOT, ENGINE_SUB);
  const missing = ["curator.mjs", "selftest.mjs", "lib.mjs"]
    .filter((f) => !fs.existsSync(path.join(engDir, f)));
  if (missing.length) failReceipt("ENGINE-MISSING", { engineRoot: path.basename(ENGINE_ROOT), missing });

  /* ראש-המנוע (אם-ה-checkout הוא-git; אחרת-כנות: null) */
  const headR = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: ENGINE_ROOT, encoding: "utf8" });
  const engineHead = headR.status === 0 ? String(headR.stdout || "").trim() || null : null;

  /* 2 · selftest-gate */
  const st = engineSelftest(engDir);
  const selftest = {
    passed: st.parsed.passed, total: st.parsed.total, status: st.parsed.status,
    code: st.code, timedOut: st.timedOut,
  };
  if (st.code !== 0 || selftest.status !== "PASS" || selftest.passed !== selftest.total) {
    failReceipt("SELFTEST-GATE-RED", { engineHead, selftest, tail: st.tail });
  }

  /* 3 · ייבוא-החוקים מהמנוע עצמו — אפס-שכפול, מקור-האמת הוא-הריפו הפרטי */
  let cur;
  try {
    cur = await import(pathToFileURL(path.join(engDir, "curator.mjs")).href);
  } catch (e) {
    failReceipt("ENGINE-IMPORT-FAIL", { engineHead, error: String(e?.message || e).slice(0, 160) });
  }
  if (typeof cur.filterCandidates !== "function" || typeof cur.fetchCandidates !== "function") {
    failReceipt("ENGINE-CONTRACT-FAIL", { engineHead, note: "curator.mjs missing law exports" });
  }

  const policy = { ...cur.curatorPolicy(), fetchLimit: Math.min(Math.max(Number(process.env.FLEET_FETCH_LIMIT) || FETCH_LIMIT_DEFAULT, 20), 100) }; // T-62 release: false self-limit removed (was 20..50 R290 prudence band) — real bound is node page ≤100; VP/anti-spam laws intact
  const nowMs = Date.now();

  /* 4 · קריאות-שרשרת (קריאה-בלבד) */
  const dgpo = await rpc("condenser_api.get_dynamic_global_properties", []);
  if (!dgpo.ok || !dgpo.result) failReceipt("RPC-DGPO-FAIL", { engineHead, selftest, error: dgpo.error });

  const tvs = num(dgpo.result.total_vesting_shares);
  const tvf = num(dgpo.result.total_vesting_fund_steem);
  const vestsPerSP = tvf > 0 ? Math.round((tvs / tvf) * 1e6) / 1e6 : null;

  const accR = await rpc("condenser_api.get_accounts", [[VOTER]]);
  const acc = accR.ok ? accR.result?.[0] ?? null : null;
  /* כישלון-קריאת-חשבון ≠ כישלון-תבונה: גיליון-המועמדים אינו-תלוי-חשבון. כנות-בקבלה. */
  const voter = acc
    ? {
        account: VOTER, status: "read-ok",
        vestsEff: cur.effectiveVests(acc),
        vpEff: cur.vpEffPct(Number(acc.voting_manabar?.current_mana ?? 0), cur.effectiveVests(acc)),
      }
    : { account: VOTER, status: "read-failed", error: accR.error ?? "no-result", vestsEff: null, vpEff: null };

  /* 4.5 · פנקס-ההצבעות-מהשרשרת (T-56 · ציבורי-לגמרי — אפס-מפתחות):
   * רשת-שנייה-מעל-ה-dedup-של-המנוע (active_votes): אם-ה-checkout-ישן-או-הצומת-
   * הקדים-את-עצמו — כאן-האמת-מהחשבון-עצמו. השרשרת-היא-הפנקס — לא-localStorage
   * (נופל-בין-מכשירים) ולא-מדינת-מנוע (נופל-בין-ריצות).
   * מדידה-חייה 09:33Z: get_account_votes-מת-בצמתים-המודרניים (Server-error) →
   * מפל: get_account_history-בעימוד-אחורה (הצומת-מגביל-100-לעמוד · נמדד:
   * 100-ops-אחרונים-של-${OWNER_ACC} = 1.09-שעות-בלבד! החשבון-פעיל-מאוד) —
   * עימוד-עד-כיסוי-חלון-הגיל (250-דק' > חלון-המועמדים-240) או-5-עמודים.
   * שני-המקורות-נפלו = dedup-לא-זמין-בכנות (recentVotes=null) — הקבלה-עצמה-כשרה
   * (ה-intel-אינו-תלוי-פנקס-ההצבעות; ה-cockpit-מציג-זאת-בכנות). */
  const votesFromHistory = (result) => {
    try {
      return Object.values(result ?? {})
        .map(([, w]) => w)
        .filter((w) => w?.op?.[0] === "vote" && String(w?.op?.[1]?.voter ?? "") === VOTER)
        .map((w) => ({ authorperm: `${w.op[1].author}/${w.op[1].permlink}`, weight: Number(w.op[1].weight) || 0, time: String(w.timestamp ?? "") }));
    } catch { return null; }
  };
  let votesArr = null;
  let votesHow = "failed";
  const votesR = await rpc("condenser_api.get_account_votes", [[VOTER]]);
  if (votesR.ok && Array.isArray(votesR.result)) {
    votesArr = votesR.result;
    votesHow = "get_account_votes";
  } else {
    /* עימוד-אחורה: מכסה-את-חלון-הגיל-במלואו — כי-עמוד-אחד-של-100-ops-על-חשבון-
     * פעיל-מכסה-שעה-וחצי-בלבד (נמדד-חי) — הצבעה-בת-שעתיים-הייתה-נופלת. */
    const WINDOW_MS = 250 * 60000; // > חלון-הגיל-המרבי (240 דק') + מרווח
    const cutoff = Date.now() - WINDOW_MS;
    const collected = [];
    let from = -1;
    let pages = 0;
    let firstOk = false;
    let malformed = false;
    for (let page = 0; page < 5; page++) {
      const histR = await rpc("condenser_api.get_account_history", [VOTER, from, 100]);
      if (!histR.ok) break;
      const pageVotes = votesFromHistory(histR.result);
      if (!Array.isArray(pageVotes)) { malformed = true; break; }
      if (page === 0) firstOk = true;
      pages++;
      collected.push(...pageVotes);
      const entries = Object.entries(histR.result ?? {});
      if (!entries.length) break;
      let oldestIdx = Infinity, oldestTime = Infinity;
      for (const [, pair] of entries) {
        /* צורת-ה-API-נמדדה-חי 09:47Z: מפתח-המפה-הוא-יחסי-בעת-from=-1 (0..100)
         * ואילו-האינדקס-הפנימי pair[0]-הוא-המוחלט — רק-הוא-עוגן-עימוד-תקין. */
        const innerIdx = Number(pair?.[0]);
        if (Number.isFinite(innerIdx) && innerIdx < oldestIdx) oldestIdx = innerIdx;
        const t = Date.parse(pair?.[1]?.timestamp ?? "");
        if (Number.isFinite(t) && t < oldestTime) oldestTime = t;
      }
      if (oldestTime <= cutoff) break;  // החלון-מכוסה-במלואו
      if (!Number.isFinite(oldestIdx) || oldestIdx <= 0) break; // תחילת-ההיסטוריה
      from = oldestIdx - 1;
    }
    if (firstOk && !malformed) {
      votesArr = collected;
      votesHow = `get_account_history:100x${pages}`;
    }
  }
  const votedSet = new Set(votesArr ? votesArr.map((v) => String(v.authorperm ?? `${v.author}/${v.permlink}`)) : []);
  /* הקבלה-מרוסנת: 150-האחרונות-בלבד (ממוינות-זמן-יורד) — נתונים-פומביים-בלבד */
  const recentVotes = votesArr
    ? votesArr.slice()
        .sort((a, b) => Date.parse(b.time ?? "") - Date.parse(a.time ?? ""))
        .slice(0, 150)
        .map((v) => ({ k: String(v.authorperm ?? `${v.author}/${v.permlink}`), w: Number(v.weight) || 0, at: String(v.time ?? "") }))
    : null;
  if (acc) voter.votesRead = votesArr ? votesHow : "failed";
  if (acc && !votesArr) voter.votesError = String(votesR.error ?? "history-unavailable").slice(0, 120);

  /* 4.7 · צרכן-D1 — מדיניות-ההון (75/30/20) נמדדת-חיה בכל-ריצת-תשואה [15a]:
   * מקור-האמת: ops/sovereign/DECIDER/state.json (ההכרעה D1-econ-treasury-floor של ה-decider).
   * מה-נמדד: האוצרה (net SP) מול-קו-השימור + כל-מפעיל-מול-הרצפה-המדורגת-שלו.
   * אין-טענות: קריאה-נפלה → POLICY-UNAVAILABLE/reads-failed כנה; אפס-המצאות-מדידה.
   * זו-ההצמדה-המדודה-הראשונה בין-ההכרעה-הכלכלית-לעורק-התשואה (D1 → T-45). */
  const decState = readJsonSafe(path.join(process.cwd(), "ops", "sovereign", "DECIDER", "state.json"));
  const d1 = ((decState && Array.isArray(decState.decisions)) ? decState.decisions : [])
    .find((d) => d && d.id === "D1-econ-treasury-floor");
  const floorRows = ((d1?.policy?.operatorInterimFloors || []))
    .map((f) => ({ op: R(f.operator) ?? f.operator, floorSp: Number(f.interimFloorSp) || 0 }))
    .filter((f) => f.op);
  const keepFloorSp = d1?.policy?.treasury?.operatingFloorSp ?? null;
  let capitalPolicy = { check: "POLICY-UNAVAILABLE", decidedAt: d1?.decidedAt ?? null, keepFloorSp, note: "decider-state.json חסר/בלי D1 — כנות" };
  if (d1 && floorRows.length) {
    capitalPolicy = { check: "MEASURED", decidedAt: d1.decidedAt, keepFloorSp, operatorsWatched: floorRows.length };
    if (acc && vestsPerSP) {
      const tv = num(acc.vesting_shares), td = num(acc.delegated_vesting_shares), tr = num(acc.received_vesting_shares);
      capitalPolicy.treasuryNetSp = Math.round((tv - td + tr) / vestsPerSP * 10) / 10; /* SP = vests·tvf/tvs (תיקון-מכפיל [15a-b]) */
      capitalPolicy.treasuryAboveFloor = keepFloorSp == null ? null : capitalPolicy.treasuryNetSp >= keepFloorSp;
    } else {
      capitalPolicy.treasuryNetSp = null; capitalPolicy.treasuryAboveFloor = null;
      capitalPolicy.note = "account-read-failed — כנות";
    }
    const opsR = await rpc("condenser_api.get_accounts", [floorRows.map((f) => f.op)]);
    if (opsR.ok && Array.isArray(opsR.result)) {
      const below = [];
      for (const f of floorRows) {
        const o = opsR.result.find((a) => a && a.name === f.op);
        if (!o) { below.push(`${f.op}:read-failed`); continue; }
        const sp = Math.round((num(o.vesting_shares) - num(o.delegated_vesting_shares) + num(o.received_vesting_shares)) / vestsPerSP * 10) / 10;
        if (sp < f.floorSp) below.push(`${f.op}:${sp}SP<${f.floorSp}`);
      }
      capitalPolicy.operatorsBelowFloor = below;
      capitalPolicy.floorAlert = (capitalPolicy.treasuryAboveFloor === false) || below.length > 0;
    } else {
      capitalPolicy.operatorsBelowFloor = null;
      capitalPolicy.note = "operators-read-failed — כנות";
    }
  } else if (d1) {
    capitalPolicy = { check: "POLICY-NO-FLOORS", decidedAt: d1.decidedAt, keepFloorSp, note: "D1 קיים בלי רצפות-מפעילים (degraded?) — כנות" };
  }

  /* 5 · זרם-חי → חוקי-ה-curator (voter=קריאה-בלבד; אפס-מדינה-יומית = תוכנית-מלאה) */
  const fetched = await cur.fetchCandidates(policy, null, nowMs);
  if (!fetched.ok) failReceipt("RPC-STREAM-FAIL", { engineHead, selftest, voter, vestsPerSP, error: "all nodes down" });
  const plan = cur.filterCandidates({
    posts: fetched.posts, voter: VOTER, policy, nowMs,
    votedPermlinks: votesArr ? [...votedSet].map((k) => k.split("/").slice(1).join("/")) : [], votesToday: 0, authorsToday: {}, jitterSeed: null,
  });

  /* 5.5 · הפרדת-המועמדים-שכבר-בשרשרת (T-56): המנוע-לא-בוחר-מה-שהצביע-כבר —
   * אפס-הצבעה-כפולה-במקור (השרשרת-היא-האמת, גם-אם-ה-curator-של-המנוע-פספס). */
  const selectedLive = [];
  const votedOnChain = [];
  for (const c of plan.selected) {
    (votedSet.has(`${c.author}/${c.permlink}`) ? votedOnChain : selectedLive).push(c);
  }

  /* 6 · קבלה-שרשרתית */
  const payload = {
    schema: "fleet-yield/1",
    at,
    verdict: acc ? "INTEL-OK" : "INTEL-PARTIAL",
    engineHead,
    selftest: { passed: selftest.passed, total: selftest.total, status: selftest.status },
    state: {
      vestsPerSP,
      tvs, tvf,
      head: String(dgpo.result.head_block_number ?? ""),
    },
    voter: { ...voter, recentVotes },
    candidates: {
      scanned: fetched.posts.length,
      selected: selectedLive.slice(0, 12),
      rejectedTop: plan.rejected.slice(0, 14).map((r) => `${r.key}:${r.reason}`),
      rejectedCount: plan.rejected.length,
      crowded: plan.rejected.filter((r) => r.reason === "crowded").length,
      dayCapReached: plan.dayCapReached === true,
      /* T-56: האמת-מהשרשרת — מה-שהוצב-כבר-יוצא-מהתור-לפני-שהמפעיל-יראה-אותו */
      votedOnChain: votedOnChain.slice(0, 6).map((c) => `${c.author}/${c.permlink}`),
      dedup: votesArr ? "on-chain" : "unavailable",
    },
    laws: {
      maxPostVotes: policy.maxPostVotes, maxPerDay: policy.maxPerDay,
      ageWindow: [policy.ageMinMinutes, policy.ageMaxMinutes],
      minVpEffPct: policy.minVpEffPct,
      weights: [policy.baseWeightPct, policy.minWeightPct],
      ref: "docs/measured/t35-probe.json — SP/G-rshares peak 0.000416 @10-30 votes · -55% @150+ (T-35, 96 chain ops)",
    },
    capitalPolicy, /* [15a] צרכן-D1 — מדיניות-ההון-נמדדת-בכל-ריצה */
    tookMs: Date.now() - t0,
  };
  const receipt = writeLedgerReceipt(payload);

  console.log(JSON.stringify({
    verdict: receipt.verdict, engineHead, selftest: selftest.status,
    vestsPerSP, vpEff: voter.vpEff, scanned: receipt.candidates.scanned,
    selected: receipt.candidates.selected.length, crowded: receipt.candidates.crowded,
    votedOnChain: receipt.candidates.votedOnChain.length,
    dedup: receipt.candidates.dedup,
    capital: `${capitalPolicy.check}${capitalPolicy.floorAlert ? " ⚠FLOOR-ALERT" : ""}` /* [15a] */,
    chain: receipt.chain.cur.slice(0, 12), tookMs: receipt.tookMs,
  }));
}

main().catch((e) => failReceipt("UNEXPECTED", { error: String(e?.stack || e).slice(0, 400) }));
