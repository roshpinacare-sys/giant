/* ═══ issue-forge · selftest.mjs — deterministic · offline · honest ═════════════
 * House style (grids/*-selftest.mjs): every section asserts REAL behavior with
 * fixtures built fresh under /tmp — zero network, zero GitHub calls, zero mocks
 * in production code (the only fake fetch here would be a lie: there is none).
 *
 * Sections:
 *   1. auditors against fixture repos (todo markers · testgap corpus · ledger anomalies)
 *   2. issue-body schema + content-hash idempotency logic
 *   3. claim lock acquire / busy / stale-break / release
 *   4. diff validation against fixture patches (valid + corrupt + scope-violation)
 *   5. forge ledger append + schema (+ Mode-A test generation + probe, real bun child)
 *   6. tests-result interpretation (vacuous-pass law)
 *
 * Run: bun run mini-services/issue-forge/selftest.mjs
 * process.exitCode = 1 on ANY failure.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { auditLedgerFile, auditTestGaps, auditTodos, exportedFunctionNames } from "./auditors.ts";
import {
  acquireLock,
  appendLedger,
  buildIssueBody,
  buildIssueTitle,
  findingHash,
  hashFromTitle,
  issueCriteriaFor,
  nextCycle,
  parseKindFromTitle,
  readLedgerTail,
  readLock,
  releaseLock,
  subsystemFor,
} from "./forge.ts";
import {
  buildModeATest,
  extractDiff,
  probeFunction,
  validatePatch,
} from "./author.ts";
import { interpretTestsResult } from "./verify.ts";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.error(`✗ ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)?.slice(0, 220)}` : ""}`);
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "issue-forge-selftest-"));
function write(rel, content) {
  const abs = path.join(TMP, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/* ── 1 · auditors against a fixture repo ─────────────────────────────────── */
function sectionAuditors() {
  console.log("\n── 1 · auditors (fixture repo) ──");
  write("src/lib/pure.ts", "export function addOne(n: number) { return n + 1; }\nexport function greet(name: string) { return 'hi ' + name; }\n");
  write("src/lib/debty.ts", "// TODO: implement retry\n// FIXME later\nexport function f() { return 1; }\n");
  write("src/lib/typed.ts", "export const double = (n: number): number => n * 2;\n");
  write("tests/pure.test.ts", 'import { addOne } from "../src/lib/pure";\n');
  write("src/components/x.tsx", "export function Widget() { return null; }\n");
  write("mini-services/fleet-economy/state/ledger.jsonl", [
    JSON.stringify({ seq: 1, h: "aaa" }),
    JSON.stringify({ seq: 2, h: "aaa" }), // duplicate consecutive hash
    "{not json", // malformed
    JSON.stringify({ seq: 3, h: "bbb" }),
    "",
  ].join("\n"));

  const todos = auditTodos(TMP);
  check("todo-auditor finds the marker file", todos.some((f) => f.target === "src/lib/debty.ts" && f.count === 2), todos.map((t) => t.target));
  check("todo-auditor ignores clean files", !todos.some((f) => f.target === "src/lib/pure.ts"), null);
  check("todo-auditor hashes are content-stable", todos.every((f) => f.hash === findingHash("todo", f.target)), null);

  const gaps = auditTestGaps(TMP);
  const gapTargets = gaps.map((g) => g.target);
  check("testgap-auditor flags untested exports", gapTargets.includes("src/lib/typed.ts"), gapTargets);
  check("testgap-auditor counts per-file untested fns", gaps.find((g) => g.target === "src/lib/pure.ts")?.count === 1, gaps);
  check("testgap-auditor subsystem mapping", gaps.every((g) => g.subsystem === subsystemFor(g.target)), null);

  const fns = exportedFunctionNames('export function a(){}\nexport const b = (x) => x;\nexport async function c(){}\nexport const d = async function(){}\n');
  check("exported-function extraction covers 4 shapes", fns.length === 4 && ["a", "b", "c", "d"].every((n) => fns.includes(n)), fns);

  const led = auditLedgerFile(path.join(TMP, "mini-services/fleet-economy/state/ledger.jsonl"));
  check("ledger-auditor counts 2 anomalies", led.anomalies.length === 2 && led.findings.length === 1 && led.findings[0].count === 2, led.anomalies);
  check("ledger-auditor reports malformed-json", led.anomalies.some((a) => a.problem === "malformed-json"), null);
  check("ledger-auditor reports duplicate-consecutive-hash", led.anomalies.some((a) => a.problem === "duplicate-consecutive-hash"), null);
  check("ledger-auditor honest on missing ledger", auditLedgerFile(path.join(TMP, "nope/missing.jsonl")).lines === 0, null);
}

/* ── 2 · issue schema + content-hash idempotency ─────────────────────────── */
function sectionIssueSchema() {
  console.log("\n── 2 · issue schema + hash idempotency ──");
  const f1 = { kind: "testgap", subsystem: "lib", target: "src/lib/typed.ts", count: 1, detail: "1/1 exported function(s) untested: double", hash: findingHash("testgap", "src/lib/typed.ts") };
  const f2 = { kind: "testgap", subsystem: "lib", target: "src/lib/typed.ts", count: 1, detail: "re-audit same debt", hash: findingHash("testgap", "src/lib/typed.ts") };
  const f3 = { kind: "todo", subsystem: "lib", target: "src/lib/debty.ts", count: 2, detail: "2 markers", hash: findingHash("todo", "src/lib/debty.ts") };

  check("same finding → same content-hash (idempotent)", f1.hash === f2.hash, [f1.hash, f2.hash]);
  check("different finding → different hash", f1.hash !== f3.hash, null);

  const t1 = buildIssueTitle(f1);
  check("title carries kind + slug + hash suffix", t1 === `forge(testgap): src-lib-typed [forge:${f1.hash}]`, t1);
  check("hash recoverable from title", hashFromTitle(t1) === f1.hash, null);
  check("kind parseable from title", parseKindFromTitle(t1) === "testgap" && parseKindFromTitle("chore: x") === null, null);

  const body = buildIssueBody(f1, issueCriteriaFor(f1));
  check("body has exact test command", body.includes("Test command (exact): `bun test tests/typed.forge.test.ts`"), null);
  check("body defines green (exit 0 + lint 0)", body.includes("exit code 0") && body.includes("bun run lint` exits 0"), null);
  check("body declares scope (target + test only)", body.includes("ONLY `src/lib/typed.ts`") && body.includes("typed.forge.test.ts"), null);
  check("body carries hash + honesty law", body.includes(f1.hash) && body.includes("deletion without implementation is forbidden"), null);

  const ledBody = buildIssueBody({ ...f3, kind: "ledger" }, issueCriteriaFor({ ...f3, kind: "ledger" }));
  check("ledger issues are observation-only", ledBody.includes("NO code change authorized"), null);
}

/* ── 3 · claim lock ──────────────────────────────────────────────────────── */
function sectionLock() {
  console.log("\n── 3 · claim lock (acquire · busy · stale-break · release) ──");
  const lockPath = path.join(TMP, "state", "claim.lock");
  const a = acquireLock(lockPath, 30 * 60 * 1000);
  check("acquire on clean state", a.ok === true && a.staleBroken === false, a);
  check("lock holds pid+ts", (() => { const l = readLock(lockPath); return l !== null && typeof l.pid === "number" && typeof l.ts === "number"; })(), readLock(lockPath));

  const b = acquireLock(lockPath, 30 * 60 * 1000);
  check("second acquire is busy (single-flight)", b.ok === false && b.holder?.pid === process.pid, b);

  check("release only by owner", releaseLock(lockPath) === true, null);

  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, ts: Date.now() - 31 * 60 * 1000 }));
  const c = acquireLock(lockPath, 30 * 60 * 1000);
  check("stale lock (>30min) breaks honestly", c.ok === true && c.staleBroken === true, c);

  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, ts: Date.now() }));
  const d = acquireLock(lockPath, 30 * 60 * 1000);
  check("fresh foreign lock is respected (not stolen)", d.ok === false && d.staleBroken === false, d);
  fs.unlinkSync(lockPath);
}

/* ── 4 · diff validation (fixture git repo) ──────────────────────────────── */
function sectionDiffValidation() {
  console.log("\n── 4 · diff validation (real git apply --check on fixtures) ──");
  const repo = path.join(TMP, "patchrepo");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" }).toString();
  git(["init", "--quiet"]);
  git(["config", "user.email", "forge@test"]); git(["config", "user.name", "forge"]);
  fs.writeFileSync(path.join(repo, "src.ts"), "export function one() {\n  return 1;\n}\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "base"]);

  const validDiff = [
    "diff --git a/src.ts b/src.ts",
    "--- a/src.ts",
    "+++ b/src.ts",
    "@@ -1,3 +1,4 @@",
    " export function one() {",
    "   return 1;",
    "+  // real implementation line, not a marker",
    " }",
    "",
  ].join("\n");

  const v1 = { promise: null };
  v1.promise = validatePatch(repo, validDiff, "src.ts");
  return v1.promise.then((r1) => {
    check("valid patch passes apply-check + scope", r1.ok === true, r1);

    const corruptDiff = validDiff.replace(" return 1;", " return 999;");
    return validatePatch(repo, corruptDiff, "src.ts").then((r2) => {
      check("corrupt patch rejected (apply-check)", r2.ok === false && (r2.reason ?? "").startsWith("apply-check-failed"), r2);

      const foreignDiff = validDiff.split("src.ts").join("other.ts");
      return validatePatch(repo, foreignDiff, "src.ts").then((r3) => {
        check("scope violation rejected (only target allowed)", r3.ok === false && (r3.reason ?? "").startsWith("scope-violation"), r3);

        check("extractDiff strips fences", (extractDiff("```diff\n" + validDiff + "\n```") ?? "").includes("diff --git"), null);
        check("extractDiff honest on REFUSE", extractDiff("REFUSE") === null, null);
      });
    });
  });
}

/* ── 5 · forge ledger + cycle counter + Mode A (real probe) ──────────────── */
async function sectionLedgerAndModeA() {
  console.log("\n── 5 · forge ledger · cycle counter · Mode-A probe+test-gen ──");
  const ledPath = path.join(TMP, "state", "forge-ledger.jsonl");
  const e1 = appendLedger({ cycle: 7, phase: "audit", issue: null, verdict: "measured", detail: "d=1" }, ledPath);
  const e2 = appendLedger({ cycle: 7, phase: "claim", issue: 42, verdict: "claimed", detail: "SAOS-FORGE-CLAIM/7/x" }, ledPath);
  check("ledger entry schema SAOS-FORGE/1", e1.schema === "SAOS-FORGE/1" && e2.schema === "SAOS-FORGE/1", null);
  const tail = readLedgerTail(10, ledPath);
  check("ledger tail reads back 2 valid JSON lines", tail.length === 2 && tail[1].issue === 42 && typeof tail[1].at === "string", tail);
  check("ledger tail bounded", readLedgerTail(1, ledPath).length === 1, null);

  const cycleDir = path.join(TMP, "state2");
  check("cycle counter increments", nextCycle(cycleDir) === 1 && nextCycle(cycleDir) === 2 && nextCycle(cycleDir) === 3, null);

  const probe = await probeFunction(TMP, "src/lib/pure.ts", "addOne");
  check("probe characterizes addOne with ≥3 captured cases", probe.ok === true && probe.name === "addOne" && (probe.cases?.length ?? 0) >= 3, probe.reason ?? probe.cases?.length);
  check("probe captured outputs are canon strings", (probe.cases ?? []).every((c) => typeof c.out === "string" && c.out.length > 0), probe.cases?.map((c) => c.out));

  const testSrc = buildModeATest({ relModule: "src/lib/pure.ts", fnName: probe.name ?? "addOne", cases: probe.cases ?? [], isAsync: !!probe.async, issue: 42, cycle: 7 });
  check("generated test imports the audited module", testSrc.includes('from "../src/lib/pure"'), null);
  check("generated test asserts captured canon outputs", (probe.cases ?? []).every((c) => testSrc.includes(JSON.stringify(c.out))), null);
  check("generated test has no TODO markers", !/\b(TODO|FIXME|XXX|STUB)\b/.test(testSrc), null);

  /* the generated test must actually run green against the fixture module
     (bun test prints results on stderr — capture both streams honestly) */
  write("tests/pure.forge.test.ts", testSrc);
  const run = spawnSync("bun", ["test", "tests/pure.forge.test.ts"], { cwd: TMP, encoding: "utf8", timeout: 60_000 });
  const bunOut = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  check("generated characterization suite runs GREEN under bun test", run.status === 0 && /\d+ pass/.test(bunOut), bunOut.slice(-300));
}

/* ── 6 · tests-result interpretation (vacuous law) ───────────────────────── */
function sectionTestsInterpretation() {
  console.log("\n── 6 · tests-result interpretation ──");
  check("exit 0 → pass", interpretTestsResult(0, "2 pass").pass === true, null);
  const vac = interpretTestsResult(1, "The following filters did not match any test files:\n tests/\n1 file was searched");
  check("no matching test files → vacuous pass (honest)", vac.pass === true && vac.vacuous === true, vac);
  const red = interpretTestsResult(1, "1 pass\n1 fail\nerror: something broke");
  check("real failure → RED (never faked)", red.pass === false && red.vacuous === false, red);
}

/* ── main ────────────────────────────────────────────────────────────────── */
async function main() {
  console.log(`issue-forge selftest — fixtures under ${TMP}`);
  sectionAuditors();
  sectionIssueSchema();
  sectionLock();
  await sectionDiffValidation();
  await sectionLedgerAndModeA();
  sectionTestsInterpretation();

  console.log(`\n════════════════════════════════════════`);
  console.log(`  pass=${pass}  fail=${fail}  ${fail === 0 ? "— ALL GREEN" : "— RED (honest)"}`);
  console.log(`════════════════════════════════════════`);
  if (failures.length > 0) {
    console.error("failures:");
    for (const f of failures) console.error(` - ${f.name}`);
  }
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch { /* cleanup best-effort — fixtures are in /tmp anyway */ }
  process.exitCode = fail === 0 ? 0 : 1;
}

await main();
