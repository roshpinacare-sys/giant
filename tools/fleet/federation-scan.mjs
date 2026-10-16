#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
 * federation-scan.mjs — עורק-הפדרציה (T-46 · agent-2 · טריטוריה: federation/)
 *
 * ריבונות על-כלל-הגיט: גילוי + בריאות + סררות + פנקס-מרקל על-כל-הריפואים.
 *   1. טוען-את-המניפסט החוקתי (federation/FEDERATION.json — כוונה)
 *   2. שואל-את-המציאות (GitHub API — השופט; עם-טוקן כולל-פרטיים, בלי — פומבי-בלבד)
 *   3. מדגיל כל-סטייה: ADOPT-PENDING · GONE · STALE · VISIBILITY-DRIFT ·
 *      ARCHIVED · WORKFLOW-RED · UNVERIFIED-PRIVATE — לעולם-לא-אימוץ-שקט
 *   4. קופל-לפנקס מרקל (federation/LEDGER.jsonl · דפוס-השרשרת של fleet-yield:
 *      cur = sha256({...payload, prevChain}) — גם-אדום-נקופל, לקח-T-45b)
 *   5. latest.json = קבלת-הראש (הפאנל-בשער-המפעיל קורא-אותה-חי)
 *
 * אפס-תלות-חוץ (node:crypto/fs בלבד + fetch גלובלי). אפס-סודות:
 * הטוקן-זורם-env→header-בלבד — מעולם-לא-נדפס, לא-נכתב, לא-נכנס-לקבלה.
 * שימוש:
 *   node engine/federation-scan.mjs                      # סריקה מלאה
 *   node engine/federation-scan.mjs --guard-minutes 28   # פנקס-טרי → CHAIN-SUPPRESSED (אפס-כתיבה)
 *   node engine/federation-scan.mjs --verify-ledger      # הליכת-מרקל → exit 0 אם-שלמה
 * ═══════════════════════════════════════════════════════════════════════ */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/* ── המניפסט-החוקתי: ולידציה-כנה — מבנה-רע = זריקה, לא-ניחוש ── */
export function loadManifest(raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { throw new Error("manifest: not valid JSON — " + e.message); }
  if (m?.schema !== "federation-manifest/1") throw new Error('manifest: schema must be "federation-manifest/1"');
  if (typeof m?.owner !== "string" || !m.owner) throw new Error("manifest: owner (string) required");
  if (!Array.isArray(m?.repos) || m.repos.length === 0) throw new Error("manifest: non-empty repos[] required");
  const seen = new Set();
  for (const r of m.repos) {
    if (!r || typeof r.name !== "string" || !r.name) throw new Error("manifest: every repo needs a name");
    if (!r.role) throw new Error(`manifest: repo ${r.name} missing role`);
    if (r.visibility !== "public" && r.visibility !== "private")
      throw new Error(`manifest: repo ${r.name} visibility must be "public"|"private"`);
    if (seen.has(r.name)) throw new Error(`manifest: duplicate repo ${r.name}`);
    seen.add(r.name);
  }
  return m;
}

/* ── GitHub API — הטוקן-עובר-ל-header-בלבד; הודעות-שגיאה-מעולם-לא-מצטטות-אותו ── */
async function gh(cfg, path) {
  const url = cfg.apiBase.replace(/\/$/, "") + path;
  const headers = { accept: "application/vnd.github+json", "user-agent": "sovereign-federation/1" };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  let r;
  try { r = await fetch(url, { headers }); }
  catch (e) { throw new Error(`api ${path} → network failure: ${String(e?.cause?.message ?? e.message).slice(0, 100)}`); }
  if (r.status === 404) return null;
  if (!r.ok) {
    const rem = r.headers.get("x-ratelimit-remaining");
    throw new Error(`api ${path} → HTTP ${r.status}${rem != null ? ` (rate remaining: ${rem})` : ""}`);
  }
  return r.json();
}

/* ── גילוי: כל-הריפואים-של-הבעלים (עימוד מלא).
 *     עם-טוקן: /user/repos?affiliation=owner — היחיד-שמחזיר-גם-פרטיים
 *     (נמדד-חי ב-T46: /users/{owner}/repos מחזיר-פומביים-בלבד — גם-בטוקן!)
 *     אנונימי: /users/{owner}/repos — פומביים-בלבד, מדוגל-בכנות. ── */
export async function listRepos(cfg) {
  const out = [];
  const path = cfg.token
    ? `/user/repos?affiliation=owner&per_page=100&page=`
    : `/users/${encodeURIComponent(cfg.owner)}/repos?per_page=100&page=`;
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(cfg, `${path}${page}&sort=pushed`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/* ── בריאות-Actions: הריצה-האחרונה-לכל-workflow (כישלון-קריאה = נרשם, לא-מת) ── */
export async function workflowRuns(cfg, repo) {
  try {
    const j = await gh(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=10`);
    if (!j) return { actions: "unavailable" };
    const byWf = {};
    for (const run of j.workflow_runs ?? []) {
      const key = run.path ?? run.name ?? "unknown";
      if (!byWf[key]) byWf[key] = { name: run.name ?? key, conclusion: run.conclusion ?? "unknown", at: run.created_at ?? null, event: run.event ?? null };
    }
    return { actions: "ok", workflows: byWf };
  } catch (e) {
    return { actions: "error: " + String(e.message).slice(0, 80) };
  }
}

const RED = new Set(["failure", "startup_failure", "timed_out", "action_required"]);

/* ── הדיון-בין-כוונה-למציאות: כל-השמות-משני-העולמות, דגל-לכל-סטייה ── */
export function classify(manifest, reality, runsMap, nowMs, authMode) {
  const flags = [];
  const mByName = new Map(manifest.repos.map((r) => [r.name, r]));
  const rByName = new Map(reality.map((r) => [r.name, r]));
  const names = [...new Set([...mByName.keys(), ...rByName.keys()])].sort();
  const records = [];
  for (const name of names) {
    const m = mByName.get(name);
    const r = rByName.get(name);
    const rec = { name, inManifest: !!m, onGithub: !!r };
    if (m) rec.role = m.role;
    if (r) {
      rec.visibility = r.private ? "private" : "public";
      rec.pushedAt = r.pushed_at ?? null;
      rec.ageHours = r.pushed_at ? Math.round(((nowMs - Date.parse(r.pushed_at)) / 3600000) * 10) / 10 : null;
      rec.archived = !!r.archived;
      rec.defaultBranch = r.default_branch ?? null;
      const wr = runsMap.get(name);
      rec.actions = wr?.actions ?? "not-checked";
      rec.redWorkflows = [];
      for (const w of Object.values(wr?.workflows ?? {})) {
        if (RED.has(w.conclusion)) rec.redWorkflows.push(w.name);
      }
      for (const w of Object.values(wr?.workflows ?? {})) {
        if (RED.has(w.conclusion))
          flags.push({ repo: name, flag: "WORKFLOW-RED", detail: `${w.name} → ${w.conclusion} @ ${(w.at ?? "").slice(0, 19)}` });
      }
    }
    if (m && r) {
      if (m.visibility !== rec.visibility)
        flags.push({ repo: name, flag: "VISIBILITY-DRIFT", detail: `manifest=${m.visibility} github=${rec.visibility}` });
      const maxAge = m.expect?.maxPushAgeHours;
      if (maxAge != null && rec.ageHours != null && rec.ageHours > maxAge)
        flags.push({ repo: name, flag: "STALE", detail: `push age ${rec.ageHours}h > ${maxAge}h` });
      if (rec.archived && !m.expect?.archivedOk)
        flags.push({ repo: name, flag: "ARCHIVED", detail: "archived without manifest consent" });
      if (m.expect?.actionsAlive && rec.actions === "unavailable")
        flags.push({ repo: name, flag: "ACTIONS-DEAD", detail: "manifest expects live Actions; GitHub reports none" });
    }
    if (m && !r) {
      if (authMode === "anonymous" && m.visibility === "private")
        flags.push({ repo: name, flag: "UNVERIFIED-PRIVATE", detail: "manifest private repo invisible to anonymous scan — verify with token" });
      else
        flags.push({ repo: name, flag: "GONE", detail: "in manifest but absent from GitHub" });
    }
    if (!m && r)
      flags.push({ repo: name, flag: "ADOPT-PENDING", detail: `discovered on GitHub (${rec.visibility}) but not in manifest — zero-trust: adoption requires an explicit manifest commit` });
    records.push(rec);
  }
  return { records, flags: flags.slice(0, 40), flagsTotal: flags.length };
}

/* ── פנקס: השורה-האחרונה-היא-מקור-ה-chain.prev (היומן-הוא-האמת) ── */
export function readLastLine(p) {
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1] : null;
}

const REDACT = [
  [/roshpinacare-sys\/בית-הכספת/g, "vault-home"],
  [/roshpinacare-sys\/steem/g, "engine-home"],
  [/בית-הכספת/g, "vault-home"],
];
export function redact(s) { return REDACT.reduce((a, [re, to]) => String(a).replace(re, to), s); }
export function appendReceipt(cfg, receipt) {
  appendFileSync(cfg.ledgerPath, redact(JSON.stringify(receipt)) + "\n");
  writeFileSync(cfg.latestPath, redact(JSON.stringify(receipt, null, 2)) + "\n");
}

/* ── הליכת-מרקל: חישוב-מחדש של כל-קשר מהבייטים-עצמם (דפוס-T-45b) ── */
export function verifyLedger(lines) {
  const out = { count: 0, unbroken: true, head: null, brokeAt: null, reason: null };
  let prev = null;
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch (e) {
      return { ...out, unbroken: false, brokeAt: out.count, reason: "unparseable line" };
    }
    const { chain, ...body } = rec;
    const expect = chain ? sha256(JSON.stringify({ ...body, prevChain: chain.prev ?? null })) : null;
    const prevCur = prev ? prev.chain.cur : null;
    if (!chain || chain.prev !== prevCur || chain.cur !== expect) {
      return { count: out.count, unbroken: false, head: prevCur, brokeAt: out.count, reason: !chain ? "missing chain" : chain.prev !== prevCur ? "prev-link mismatch" : "cur-hash mismatch" };
    }
    prev = rec;
    out.count = out.count + 1;
  }
  out.head = prev ? prev.chain.cur : null;
  return out;
}

/* ── הסריקה-המלאה — מחזירה-קבלה; כישלון-מבני = קבלה-אדומה-נקופלת + זריקה ── */
export async function runScan(cfg) {
  const t0 = Date.now();
  const manifest = loadManifest(readFileSync(cfg.manifestPath, "utf8"));
  const owner = cfg.owner ?? manifest.owner;
  const cfg2 = { ...cfg, owner };
  const authMode = cfg.token ? "token" : "anonymous";

  /* guard: פנקס-טרי-מדי → דיכוי-שקט (אפס-כתיבה) */
  if (cfg.guardMinutes != null) {
    const last = readLastLine(cfg.ledgerPath);
    const at = last ? (() => { try { return JSON.parse(last)?.at; } catch { return null; } })() : null;
    if (at) {
      const ageMin = Math.round((Date.now() - Date.parse(at)) / 60000);
      if (ageMin < cfg.guardMinutes) return { suppressed: true, verdict: "CHAIN-SUPPRESSED", ageMinutes: ageMin };
    }
  }

  try {
    const reality = await listRepos(cfg2);
    const runsMap = new Map();
    for (const r of reality) {
      const wr = await workflowRuns(cfg2, r.name);
      runsMap.set(r.name, wr);
    }
    const { records, flags, flagsTotal } = classify(manifest, reality, runsMap, Date.now(), authMode);
    const verdict = flags.length === 0 ? "FEDERATION-OK" : "FEDERATION-DRIFT";
    const receipt = buildReceipt(cfg, {
      schema: "federation/1",
      at: new Date().toISOString(),
      verdict,
      owner,
      authMode,
      counts: { manifest: manifest.repos.length, github: reality.length, records: records.length, flags: flags.length, flagsTotal },
      flags,
      repos: records.map((r) => ({
        name: r.name, inManifest: r.inManifest, onGithub: r.onGithub, role: r.role ?? null,
        visibility: r.visibility ?? null, ageHours: r.ageHours ?? null, archived: r.archived ?? null,
        actions: r.actions ?? null, redWorkflows: r.redWorkflows ?? [],
      })),
      tookMs: Date.now() - t0,
    });
    appendReceipt(cfg, receipt);
    return { suppressed: false, receipt };
  } catch (e) {
    /* כנות-fail-closed: כישלון-מבני → קבלה-אדומה-נקופלת-לפנקס → זריקה (exit 1) */
    const receipt = buildReceipt(cfg, {
      schema: "federation/1",
      at: new Date().toISOString(),
      verdict: "SCAN-RED",
      owner,
      authMode,
      error: String(e?.message ?? e).slice(0, 240),
      tookMs: Date.now() - t0,
    });
    try { appendReceipt(cfg, receipt); } catch {}
    throw e;
  }
}

/* ── שרשרת-המרקל — דפוס-verbatim מ-engine/fleet-yield.mjs (תאימות-קנון) ── */
function buildReceipt(cfg, payload) {
  const prev = readLastLine(cfg.ledgerPath);
  const prevChain = prev ? (() => { try { return JSON.parse(prev)?.chain?.cur ?? null; } catch { return null; } })() : null;
  const curChain = sha256(JSON.stringify({ ...payload, prevChain }));
  const { prevChain: _omit, ...body } = { ...payload, prevChain };
  return { ...body, chain: { prev: prevChain, cur: curChain } };
}

/* ── CLI ── */
async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, dflt) => { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };

  if (argv.includes("--verify-ledger")) {
    const p = opt("ledger", "federation/LEDGER.jsonl");
    const lines = existsSync(p) ? readFileSync(p, "utf8").split("\n") : [];
    const res = verifyLedger(lines);
    console.log(JSON.stringify({ ledger: p, ...res }));
    process.exit(res.unbroken ? 0 : 1);
  }

  const gm = opt("guard-minutes", null);
  const cfg = {
    manifestPath: opt("manifest", "federation/FEDERATION.json"),
    ledgerPath: opt("ledger", "federation/LEDGER.jsonl"),
    latestPath: opt("latest", "federation/latest.json"),
    guardMinutes: gm != null ? Number(gm) : null,
    apiBase: process.env.FED_API_BASE ?? "https://api.github.com",
    token: process.env.FED_TOKEN ?? "",
    owner: process.env.FED_OWNER ?? null,
  };
  const res = await runScan(cfg);
  if (res.suppressed) {
    console.log(JSON.stringify({ verdict: res.verdict, ageMinutes: res.ageMinutes, note: "ledger fresh — chain-suppressed, zero writes" }));
    return;
  }
  const r = res.receipt;
  console.log(JSON.stringify({ verdict: r.verdict, counts: r.counts, chain: r.chain.cur.slice(0, 12), tookMs: r.tookMs }));
}

/* הרצה-ישירה-בלבד — selftest מייבא-פונקציות ואף-פעם-לא-מריץ-main */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
try {
  const isMain = process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  if (isMain) main().catch((e) => { console.error("FATAL " + String(e?.message ?? e).slice(0, 300)); process.exit(1); });
} catch { /* ייבוא-כמודול — לא-הרצה-ישירה */ }
