#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * CLAIMS-AUDIT — מרשם-הטענות הריבוני (Proof-of-Honesty Registry)
 * ───────────────────────────────────────────────────────────────────────────
 * צו-בעלים (trace 1a1579cc5dfd1b15): "יש הרבה טענות של הארכיטקטורה שאינן מדויקות
 * או אינן מקצועיות מספיק — לא כל הכלים הם כפי שמתואר".
 *
 * התרופה המבנית: אף-טענה-חומרית של הארכיטקטורה לא נחשבת-אמת עד-שהמרשם מודד
 * אותה-חיה. כל-טענה = בדיקה-פונקציונלית (לא-רק-נמל-פתוח — הכלי-עושה-את-עבודתו):
 *   PROVEN     — הראיה-החיה עומדת (פונקציה + טריות + תנועה)
 *   DEGRADED   — חי-אבל לא-מתפקד / ישן / מתחת-לסף-הבריאות
 *   BROKEN     — הטענה שקרית-כרגע (מת / נופל / אפס-עבודה)
 *   UNVERIFIABLE — אין-דרך-כנה-למדוד (מדווח-בגלוי, לעולם-לא-מנוחש)
 *
 * חוקים:
 *   C-1 · אפס-סינתזה: כל-ראיה = מדידה-חיה-עכשיו (HTTP/קובץ/גיט) — אין-זיכרון-מרמה
 *   C-2 · דלתא-מדידה: טענות-תנועה (height/fills/polls) נמדדות-מול-ריצה-קודמת
 *   C-3 · fail-honest: כשל-בדיקה = BROKEN-כנה עם-השגיאה — לעולם-לא-דילוג-שקט
 *   C-4 · אפס-סודות: הטוקן-נקרא-מהקובץ-בזמן-ריצה-בלבד, לעולם-לא-נרשם-בפלט
 *   C-5 · המרשם-עצמו-מדווח-את-מה-שהוא-לא-מוכיח (סעיף-covers/does-not-cover)
 *
 * ריצה:  node scripts/claims-audit.mjs            → סבב-אחד (כותב-קבלות)
 *        node scripts/claims-audit.mjs --loop 15  → מתזמן-חי (כל-15-דק)
 *        node scripts/claims-audit.mjs --strict   → exit≠0 אם-יש-BROKEN (ל-CI)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const RECEIPTS_DIR = join(ROOT, "receipts");
const SCORECARD = join(RECEIPTS_DIR, "claims-scorecard.json");
const HISTORY = join(RECEIPTS_DIR, "claims-history.jsonl");
const PREV = join(RECEIPTS_DIR, "claims-audit-prev.json");
const SAOS_DEX = "/home/z/work/saos-dex";

try { mkdirSync(RECEIPTS_DIR, { recursive: true }); } catch { /* קיים */ }

/* ── עזרי-מדידה ─────────────────────────────────────────────────────────── */
async function getJson(url, timeoutMs = 5000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}
function ageMsOf(path) { try { return Date.now() - statSync(path).mtimeMs; } catch { return null; } }
function lastJsonl(path) {
  try {
    const txt = readFileSync(path, "utf8").trim();
    if (!txt) return null;
    return JSON.parse(txt.split("\n").pop());
  } catch { return null; }
}
function gitHead(repo) {
  try { return execSync(`git -C ${repo} rev-parse HEAD`, { encoding: "utf8" }).trim(); }
  catch { return null; }
}
function gitOriginHead(repo) {
  try { return execSync(`git -C ${repo} rev-parse origin/main`, { encoding: "utf8" }).trim(); }
  catch { return null; }
}
function gitToken() {
  try { return readFileSync(join(ROOT, "upload", "גיטראש.txt"), "utf8").replace(/\s+/g, ""); }
  catch { return ""; }
}

/* ── קריאת-מצב-קודם (לדלתאות) ───────────────────────────────────────────── */
function readPrev() {
  try { return JSON.parse(readFileSync(PREV, "utf8")); } catch { return {}; }
}
function writePrev(p) { try { writeFileSync(PREV, JSON.stringify(p, null, 1)); } catch { /* כנה */ } }

/* ── הטענות ────────────────────────────────────────────────────────────────
 * כל-טענה: { id, claim (מה-הארכיטקטורה-מצהירה), probe: async (prev) → {verdict, evidence} } */
function buildClaims(prev) {
  return [
    {
      id: "dex-kernel-alive",
      claim: "הקרנל-הריבוני חי ומייצר-בלוקים (h עולה · לא-מושהה)",
      probe: async () => {
        const s = await getJson("http://127.0.0.1:3010/saos-dex/api/dex/state");
        const st = s.state ?? s;
        const h = Number(st.height ?? 0);
        const halted = Boolean(st.halted);
        const prevH = Number(prev.dexHeight ?? 0);
        const advanced = h > prevH;
        const verdict = !halted && advanced ? "PROVEN" : (!halted ? "DEGRADED" : "BROKEN");
        return { verdict, evidence: { height: h, prevHeight: prevH, advanced, halted } };
      },
    },
    {
      id: "dex-trading-live",
      claim: "השוק-הריבוני סוחר-באמת (מילויים-חדשים-זורמים)",
      probe: async () => {
        const s = await getJson("http://127.0.0.1:3010/saos-dex/api/dex/state");
        const st = s.state ?? s;
        const fills = Number(st.fills ?? 0);
        const swaps = Number(st.swaps ?? 0);
        const prevFills = Number(prev.dexFills ?? 0);
        const newFills = fills - prevFills;
        return {
          verdict: newFills > 0 ? "PROVEN" : "DEGRADED",
          evidence: { fillsTotal: fills, swapsTotal: swaps, newFillsSinceLastRun: newFills },
        };
      },
    },
    {
      id: "fee-meter-health",
      claim: "בריאות-כלכלית: מד-העמלות-מעל-רצפת-הסולם (המזרקה-חיה)",
      probe: async () => {
        const s = await getJson("http://127.0.0.1:3010/saos-dex/api/dex/state");
        const st = s.state ?? s;
        const meter = Number(st.feeMeter ?? 0);
        const income = st.income ?? {};
        const profit = Number(income.treasuryProfitMu ?? 0);
        const ever = Number(income.treasuryProfitEverMu ?? 0);
        return {
          verdict: meter >= 8000 ? "PROVEN" : "DEGRADED",
          evidence: { feeMeter: meter, floor: 8000, treasuryProfit: profit, ratchetEver: ever },
        };
      },
    },
    {
      id: "economy-engine",
      claim: "מנוע-הכלכלה (:3016) חי ומונה-רצף",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3016/health");
        const seq = Number(h.seq ?? 0);
        const prevSeq = Number(prev.econSeq ?? 0);
        return {
          verdict: h.ok && seq > prevSeq ? "PROVEN" : (h.ok ? "DEGRADED" : "BROKEN"),
          evidence: { seq, prevSeq, advanced: seq > prevSeq },
        };
      },
    },
    {
      id: "bridge-relay",
      claim: "גשר-דקס→כלכלה (:3017) משדר-מילויים-אמת-לספר-המשותף",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3017/health");
        const polls = Number(h.polls ?? 0), inserted = Number(h.inserted ?? 0);
        const prevPolls = Number(prev.bridgePolls ?? 0);
        const polling = polls > prevPolls;
        return {
          verdict: polling && inserted > 0 ? "PROVEN" : (polling ? "DEGRADED" : "BROKEN"),
          evidence: { polls, inserted, pollsAdvanced: polling, errors: h.errors },
        };
      },
    },
    {
      id: "soldier-army-trading",
      claim: "צבא-החיילים סוחר-ומקליט-אירועים (actions.jsonl טרי)",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3018/health");
        const soldiers = Array.isArray(h.soldiers) ? h.soldiers : [];
        const placed = soldiers.reduce((a, s) => a + Number(s.placed ?? 0), 0);
        const filled = soldiers.reduce((a, s) => a + Number(s.filledMu ?? 0), 0);
        const actionsPath = join(ROOT, "mini-services/soldier-army/state/actions.jsonl");
        const age = ageMsOf(actionsPath);
        const fresh = age !== null && age < 30 * 60 * 1000;
        return {
          verdict: fresh && filled > 0 ? "PROVEN" : (fresh || placed > 0 ? "DEGRADED" : "BROKEN"),
          evidence: { soldiers: soldiers.length, placedTotal: placed, filledMuTotal: filled, actionsAgeMin: age === null ? null : Math.round(age / 60000) },
        };
      },
    },
    {
      id: "sovereign-audit-functional",
      claim: "המבקר-הריבוני (iFixAi :3022) מחליט-ממש (לא-AUDIT-ERROR)",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3022/health");
        const d = String(h.lastDecision ?? "");
        const age = h.lastRunAt ? Date.now() - Number(h.lastRunAt) : null;
        const fresh = age !== null && age < 40 * 60 * 1000;
        const deciding = d === "CLEAR" || d === "FINDINGS";
        return {
          verdict: deciding && fresh ? "PROVEN" : (h.ok ? "DEGRADED" : "BROKEN"),
          evidence: { lastDecision: d, lastError: h.lastError ?? null, runAgeMin: age === null ? null : Math.round(age / 60000) },
        };
      },
    },
    {
      id: "sovereign-voice-ops",
      claim: "הקול-הריבוני (:3019) סורק-ומרפא-מתמשך",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3019/health");
        return {
          verdict: h.ok && Number(h.scans ?? 0) > 0 ? "PROVEN" : "BROKEN",
          evidence: { scans: h.scans, heals: h.heals, github: h.ops?.github, diskPct: h.disk?.usedPct },
        };
      },
    },
    {
      id: "steem-voice-custody",
      claim: "ערוץ-השרשרת (:3023) חי והכספת-מוכחת 4/4",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3023/health");
        const custody = String(h.custody ?? "");
        const proven = custody.includes("4/4");
        return {
          verdict: h.ok && proven ? "PROVEN" : (h.ok ? "DEGRADED" : "BROKEN"),
          evidence: { custody, account: h.account, broadcasts: h.broadcasts },
        };
      },
    },
    {
      id: "boot-verifier",
      claim: "מאמת-האתחול (:3042) מזרים-tx-כלכלה-ללא-הפלות",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3042/health");
        const tx = h.economyTx ?? {};
        const sent = Number(tx.sent ?? 0), dropped = Number(tx.dropped ?? 0);
        return {
          verdict: sent > 0 && dropped === 0 ? "PROVEN" : (sent > 0 ? "DEGRADED" : "BROKEN"),
          evidence: { sent, dropped },
        };
      },
    },
    {
      id: "llm-gateway",
      claim: "שער-התבונה (:3011) חי-עם-מוחות-זמינים",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3011/health");
        const brains = Array.isArray(h.brains) ? h.brains : [];
        const live = brains.filter((b) => b.state === "live").length;
        return {
          verdict: h.ok && live > 0 ? "PROVEN" : (h.ok ? "DEGRADED" : "BROKEN"),
          evidence: { brains: brains.length, live },
        };
      },
    },
    {
      id: "estate-sync-anchors",
      claim: "סנכרון-העזבון (:3021) מצרף-את-כל-העוגנים",
      probe: async () => {
        const h = await getJson("http://127.0.0.1:3021/health");
        const anchors = Array.isArray(h.anchors) ? h.anchors : [];
        const ok = anchors.filter((a) => a.ok).length;
        return {
          verdict: h.ok && anchors.length > 0 && ok === anchors.length ? "PROVEN" : (ok > 0 ? "DEGRADED" : "BROKEN"),
          evidence: { anchors: anchors.length, ok, bad: anchors.filter((a) => !a.ok).map((a) => a.name) },
        };
      },
    },
    {
      id: "dividend-sweep-alive",
      claim: "ESC-10/11 · סדולת-הדיבידנד רצה-בלופ (קבלה-טרייה ≤35-דק)",
      probe: async () => {
        const path = join(SAOS_DEX, "grids/state/dividend-sweep.jsonl");
        const last = lastJsonl(path);
        const age = ageMsOf(path);
        const fresh = age !== null && age < 35 * 60 * 1000;
        return {
          verdict: fresh ? "PROVEN" : (last ? "DEGRADED" : "BROKEN"),
          evidence: { lastAt: last?.at ?? null, lastVerdict: last?.verdict ?? null, fileAgeMin: age === null ? null : Math.round(age / 60000), loopExpectedMin: 30 },
        };
      },
    },
    {
      id: "internal-pnl-published",
      claim: "SAOS-INTERNAL-PNL/1 מפורסם-וטרי (≤3.5-שעות)",
      probe: async () => {
        const path = join(SAOS_DEX, "grids/state/internal-pnl.json");
        const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
        const age = ageMsOf(path);
        const fresh = age !== null && age < 3.5 * 3600 * 1000;
        return {
          verdict: fresh && doc?.schema === "SAOS-INTERNAL-PNL/1" ? "PROVEN" : (doc ? "DEGRADED" : "BROKEN"),
          evidence: { schema: doc?.schema ?? null, publishedAt: doc?.at ?? null, fileAgeMin: age === null ? null : Math.round(age / 60000) },
        };
      },
    },
    {
      id: "self-deposit-accumulator",
      claim: "מנוע-ההפקדה-העצמית מקבל-רווח-פנימי-ומצבור-הון",
      probe: async () => {
        const path = join(SAOS_DEX, "grids/state/self-deposit-receipts.jsonl");
        const last = lastJsonl(path);
        const age = ageMsOf(path);
        const fresh = age !== null && age < 6 * 3600 * 1000;
        return {
          verdict: fresh && last ? "PROVEN" : (last ? "DEGRADED" : "BROKEN"),
          evidence: { lastAt: last?.at ?? null, verdict: last?.verdict ?? null, profitUsd24h: last?.profitUsd24h ?? null, fileAgeH: age === null ? null : Math.round(age / 360000) / 10 },
        };
      },
    },
    {
      id: "git-rail-value-flowing",
      claim: "עורק-הגיט-זורם: אין-ערך-תקוע-מקומי-שלא-נדחף (origin..HEAD == 0 בשני-הריפואים)",
      probe: async () => {
        // C-4: האימות-כבר-חי-ב-credential.helper-מקומי (giant) וב-ssh (saos-dex) — אפס-טוקן-בשורת-הפקודה.
        // תיקון-הגדרה (2026-10-20): בארכיטקטורת-התאום, origin חוקי-להיות-לפני-הסנדבוקס
        // (dex-beat-ענן). הטענה-המדויקת = "אין-ערך-מקומי-שלא-נדחף" → origin/main..HEAD == 0.
        const out = {};
        for (const [name, repo] of [["giant", ROOT], ["saos-dex", SAOS_DEX]]) {
          try {
            execSync(`git -C ${repo} fetch origin main`, { encoding: "utf8", timeout: 30000, stdio: "ignore" });
            const unpushed = Number(execSync(`git -C ${repo} rev-list --count origin/main..HEAD`, { encoding: "utf8" }).trim() || "0");
            out[name] = { unpushedCommits: unpushed, valueStuck: unpushed > 0 };
          } catch (e) {
            out[name] = { valueStuck: true, error: String(e).slice(0, 80) };
          }
        }
        const all = Object.values(out).every((v) => !v.valueStuck);
        return { verdict: all ? "PROVEN" : "BROKEN", evidence: out };
      },
    },
    {
      id: "dividend-lane-external",
      claim: "ESC-11-הרגל-החוץ: מסילת-µ→STEEM→בעלים מתפקדת (לא-רק-מתוארת)",
      probe: async () => {
        const lanePath = join(SAOS_DEX, "grids/state/dividend-lane.json");
        const lane = existsSync(lanePath) ? JSON.parse(readFileSync(lanePath, "utf8")) : null;
        const paid = Number(lane?.paidUsdTotal ?? 0);
        // כנות-קשוחה: טענה-של-"מסילה-מתפקדת" מתקיימת-רק-אם-זרם-כסף-אמת. עיצוב-בלבד = DEGRADED.
        return {
          verdict: paid > 0 ? "PROVEN" : (lane ? "DEGRADED" : "BROKEN"),
          evidence: { paidUsdTotal: paid, lastPaidAt: lane?.lastPaidAt ?? null, pendingReleaseUsd: lane?.pendingReleaseUsd ?? null, note: paid === 0 ? "המסילה-מעוצבת-אך-לא-הוכחה-בזרימת-כסף-אמת" : undefined },
        };
      },
    },
  ];
}

/* ── ריצת-סבב ───────────────────────────────────────────────────────────── */
async function runOnce() {
  const prev = readPrev();
  const claims = buildClaims(prev);
  const results = [];
  for (const c of claims) {
    const t0 = Date.now();
    let entry;
    try {
      const r = await c.probe(prev);
      entry = { id: c.id, claim: c.claim, verdict: r.verdict, evidence: r.evidence, probeMs: Date.now() - t0 };
    } catch (e) {
      entry = { id: c.id, claim: c.claim, verdict: "BROKEN", evidence: { error: String(e?.message ?? e).slice(0, 200) }, probeMs: Date.now() - t0 };
    }
    results.push(entry);
    console.log(`[${entry.verdict.padEnd(12)}] ${c.id} — ${JSON.stringify(entry.evidence).slice(0, 140)}`);
  }
  const counts = results.reduce((a, r) => { a[r.verdict] = (a[r.verdict] ?? 0) + 1; return a; }, {});
  const score = { proven: counts.PROVEN ?? 0, degraded: counts.DEGRADED ?? 0, broken: counts.BROKEN ?? 0, unverifiable: counts.UNVERIFIABLE ?? 0 };
  const total = results.length;
  const truthScore = Math.round((100 * (score.proven + 0.5 * score.degraded)) / total);

  /* K-EFF · מד-יעילות-כלכלית: Δראצ'ט-פר-שעה-מאז-הריצה-הקודמת */
  let kEff = null;
  try {
    const s = await getJson("http://127.0.0.1:3010/saos-dex/api/dex/state");
    const st = s.state ?? s;
    const ever = Number(st.treasuryProfitEver ?? 0);
    if (prev.ever && prev.everAt && ever >= prev.ever) {
      const hours = (Date.now() - prev.everAt) / 3600000;
      if (hours > 0.02) kEff = { ratchetDeltaMu: ever - prev.ever, hours: Math.round(hours * 100) / 100, muPerHour: Math.round((ever - prev.ever) / hours) };
    }
  } catch { /* כנה */ }

  const doc = {
    schema: "SAOS-CLAIMS-SCORECARD/1",
    at: new Date().toISOString(),
    law: "צו-בעלים trace 1a1579cc5dfd1b15 — אין-טענה-בלי-ראיה-חיה; חוסר-ראיה = DEGRADED/BROKEN-כנה (LAW-3)",
    truthScore, counts: score, total, kEff,
    doesNotCover: [
      "טענות-על-רווח-חוץ-אמיתי-מחוץ-לספר-הפנימי (אין-עדיין-נתיב-חוץ-מדוד מעבר-לפקדות-STEEM)",
      "אבטחת-מפתחות-מול-יריב-בעל-גישה-לסנדבוקס (המרשם-בודק-תפקוד, לא-פורנזו)",
      "שרשרת-הענן-התאום-מול-הסנדבוקס — כל-מדידה-כאן היא-על-הקרנל-החי-המקומי",
    ],
    claims: results,
  };
  writeFileSync(SCORECARD, JSON.stringify(doc, null, 1) + "\n");
  appendFileSync(HISTORY, JSON.stringify({ schema: "SAOS-CLAIMS-HISTORY/1", at: doc.at, truthScore, counts: score, broken: results.filter((r) => r.verdict === "BROKEN").map((r) => r.id), degraded: results.filter((r) => r.verdict === "DEGRADED").map((r) => r.id) }) + "\n");
  writePrev({
    dexHeight: results.find((r) => r.id === "dex-kernel-alive")?.evidence?.height,
    dexFills: results.find((r) => r.id === "dex-trading-live")?.evidence?.fillsTotal,
    econSeq: results.find((r) => r.id === "economy-engine")?.evidence?.seq,
    bridgePolls: results.find((r) => r.id === "bridge-relay")?.evidence?.polls,
    ever: results.find((r) => r.id === "fee-meter-health")?.evidence?.ratchetEver,
    everAt: prev.everAt && Date.now() - prev.everAt < 60_000 ? prev.everAt : Date.now(),
  });
  console.log(`\n[claims-audit] truthScore=${truthScore}/100 · PROVEN=${score.proven} DEGRADED=${score.degraded} BROKEN=${score.broken}/${total}`);
  return { doc, score, results };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const loopIdx = args.indexOf("--loop");
if (loopIdx >= 0) {
  const min = Math.max(5, Number(args[loopIdx + 1]) || 15);
  console.log(`[claims-audit] מתזמן-חי — כל-${min}-דק`);
  await runOnce();
  setInterval(() => void runOnce(), min * 60 * 1000);
} else {
  const { score, results } = await runOnce();
  if (strict && (score.broken > 0 || score.degraded > 0)) process.exit(1);
}
