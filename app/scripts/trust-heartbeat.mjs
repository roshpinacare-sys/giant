#!/usr/bin/env node
/**
 * trust-heartbeat.mjs — הסורק-האוטונומי של האימפריה (גל-8 · saos-trust-check@0.2.0-actions).
 *
 * רץ על GitHub Actions בלבד — אפס-סנדבוקס, אפס-תלות (node 22 + fetch גלובלי).
 * סורק את עצי-הגיט של כל-ספרי org:roshpinacare-sys ומפיק את הקנון:
 *   app/db/trust-cache.json  (version 1 — אותו-חוזה כמו trust-scan.ts של הממשק)
 *
 * חוקי-האמת (ממיל-אל-מיל מהסורק הקנוני src/lib/giant/trust-scan.ts):
 *  · עץ-גיט בלבד — לא מריץ קוד, לא פותח sockets, לא קורא תוכן-קבצים
 *  · סימנים = נתיבים שמרמזים על מוק/סימולציה — חשיפה ≠ פסק-דין
 *  · קווים-אדומים = שמות-נתיבים-בלבד של קבצי-סודות-פוטנציאליים — אפס-תוכן
 *  · כשל-ספר = entry כנה mode:"unscanned" + השגיאה-עצמה ("לא הצלחנו להסתכל" ≠ "הסתכלנו ולא ראינו")
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "roshpinacare-sys";
const TOKEN = process.env.GITHUB_TOKEN || "";
const SCANNER = "saos-trust-check@0.2.0-actions";
const OUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "trust-cache.json");

const gh = (extra = {}) => ({
  authorization: `Bearer ${TOKEN}`,
  accept: "application/vnd.github+json",
  "user-agent": "saos-trust-heartbeat",
  ...extra,
});

/* ── הכללים — זהים לסורק-הקנון ─────────────────────────────────────────── */
const SIGNAL_RULES = [
  { rule: "mock-path", re: /(^|[/_.-])(mock|mocks|mocked)([/_.-]|$)/i },
  { rule: "fake-path", re: /(^|[/_.-])(fake|faker)([/_.-]|$)/i },
  { rule: "simulate-path", re: /(simulat|simulation|sim-book)/i },
  { rule: "placeholder-path", re: /(placeholder|lorem)/i },
  { rule: "stub-path", re: /(^|[/_.-])(stub|stubs|mirror-stub)([/_.-]|$)/i },
  { rule: "sample-path", re: /(^|[/_.-])(sample|samples|demo|dummy)([/_.-]|$)/i },
  { rule: "todo-path", re: /(^|[/_.-])(todo|wip|drafts?)([/_.-]|$)/i },
];
const SECRET_PATH_RULES = [
  { rule: "secrets-file-present", re: /(^|[/_.-])(pat\.env|\.env|\.env\.[^/]*|credentials?|secrets?)($|[/_.-])/i },
  { rule: "keyfile-present", re: /\.(pem|key|p12|pfx)$|(^|[/_.-])id_rsa/i },
];
const CAP_RULES = [
  { cap: "api", test: (p) => p.some((x) => /(^|\/)api(\/|$)|route\.ts$|route\.js$/.test(x)) },
  { cap: "front", test: (p) => p.some((x) => /\.(tsx|jsx|html)$/.test(x)) },
  { cap: "db", test: (p) => p.some((x) => /prisma\/schema\.prisma$|(^|\/)db\//.test(x)) },
  { cap: "workflows", test: (p) => p.some((x) => /\.github\/workflows\/.+\.(yml|yaml)$/.test(x)) },
  { cap: "docs", test: (p) => p.some((x) => /(^|\/)(readme|docs\/)/i.test(x)) },
  { cap: "tests", test: (p) => p.some((x) => /(\.test\.|\.spec\.|(^|\/)tests?\/)/.test(x)) },
  { cap: "scripts", test: (p) => p.some((x) => /\.(mjs|sh)$/.test(x)) },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: gh(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
        const wait = Math.min(Math.max(reset - Date.now(), 5_000), 60_000);
        process.stderr.write(`rate-limit — ממתין ${Math.round(wait / 1000)}ש׳\n`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 || res.status === 409) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { ok: false, status: res.status, body: null };
      return { ok: true, status: res.status, body: await res.json() };
    } catch (e) {
      if (i === tries - 1) return { ok: false, status: 0, body: null, error: String(e?.message ?? e) };
      await sleep(1_500 * (i + 1));
    }
  }
  return { ok: false, status: 0, body: null };
}

async function listRepos() {
  const r = await ghJson(`https://api.github.com/search/repositories?q=org:${ORG}&per_page=100&sort=pushed&order=desc`);
  if (!r.ok || !Array.isArray(r.body?.items)) throw new Error(`רשימת-הצי נכשלה (HTTP ${r.status})`);
  return r.body.items
    .filter((x) => typeof x?.name === "string")
    .map((x) => ({
      name: x.name,
      branch: typeof x.default_branch === "string" && x.default_branch ? x.default_branch : "main",
      pushedAt: typeof x.pushed_at === "string" ? x.pushed_at : null,
      description: typeof x.description === "string" ? x.description.slice(0, 200) : null,
    }));
}

async function scanRepo(repo) {
  const base = {
    name: repo.name,
    branch: repo.branch,
    pushedAt: repo.pushedAt,
    description: repo.description,
    mode: "tree",
    scannedAt: new Date().toISOString(),
    ageMinutes: 0,
    files: null,
    capabilities: [],
    signals: [],
    redLines: [],
    deep: null,
    error: null,
  };
  const r = await ghJson(
    `https://api.github.com/repos/${ORG}/${encodeURIComponent(repo.name)}/git/trees/${encodeURIComponent(repo.branch)}?recursive=1`,
  );
  if (!r.ok || !Array.isArray(r.body?.tree)) {
    return { ...base, mode: "unscanned", error: `GitHub עץ-הספר HTTP ${r.status}${r.error ? ` · ${r.error}` : ""}` };
  }
  const paths = r.body.tree.filter((t) => t?.type === "blob" && typeof t.path === "string").map((t) => t.path);
  const signals = [];
  const redLines = [];
  for (const p of paths) {
    for (const rule of SIGNAL_RULES) if (rule.re.test(p)) signals.push({ rule: rule.rule, path: p });
    for (const rule of SECRET_PATH_RULES) if (rule.re.test(p)) redLines.push({ rule: rule.rule, path: p });
  }
  return {
    ...base,
    files: paths.length,
    capabilities: CAP_RULES.filter((c) => c.test(paths)).map((c) => c.cap),
    signals: signals.slice(0, 40),
    redLines: redLines.slice(0, 20),
  };
}

async function main() {
  if (!TOKEN) {
    console.error("GITHUB_TOKEN חסר — מסרב-לרמות-מדידה (fail-honest)");
    process.exit(1);
  }
  const repos = await listRepos();
  const entries = [];
  for (const repo of repos) {
    const row = await scanRepo(repo);
    entries.push({ name: repo.name, scannedAt: row.scannedAt, pushedAtAtScan: repo.pushedAt, row });
    process.stdout.write(
      `${row.mode === "unscanned" ? "✗" : "✓"} ${repo.name} · ${row.files ?? "?"} קבצים · ${(row.signals ?? []).length} סימנים · ${(row.redLines ?? []).length} אדומים${row.error ? ` · ${row.error}` : ""}\n`,
    );
    await sleep(350);
  }
  const scanned = entries.filter((e) => e.row.mode === "tree");
  const summary = `נסרקו ${scanned.length}/${entries.length} · סימנים ${scanned.reduce((s, e) => s + e.row.signals.length, 0)} · אדומים ${scanned.reduce((s, e) => s + e.row.redLines.length, 0)}`;
  const cache = { version: 1, scanner: SCANNER, entries, summary, scannedAt: new Date().toISOString() };
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(cache, null, 1));
  process.stdout.write(`${summary} → ${path.relative(process.cwd(), OUT_FILE)}\n`);
}

main().catch((e) => {
  console.error("הסריקה-נכשלה-כנה:", e?.message ?? e);
  process.exit(1);
});
