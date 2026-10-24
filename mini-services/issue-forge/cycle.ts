/* ═══ issue-forge · cycle.ts — the bounded engine ═══════════════════════════════
 * One cycle = AUDIT → ISSUES → CLAIM → AUTHOR → VERIFY → SHIP, every transition
 * appended to the forge ledger. Single-flight via state/claim.lock (stale >30min
 * breaks honestly). Failures are verdicts, never exceptions that escape.
 *
 * Mode A (testgap): real characterization test, captured from execution.
 * Mode B (todo):    LLM unified diff, git-apply-validated, scope-locked; two
 *                   validation failures → author-refused (recorded, claim released,
 *                   issue labeled author-refused so it never deadlocks the loop).
 * ledger-kind findings are observation-only evidence issues — never claimed.
 * SHIP: push forge/issue-<n> → PR → squash merge ONLY after a fresh green gate
 * re-run. RED is never merged, never shipped, never faked.
 */
import fs from "node:fs";
import path from "node:path";

import {
  appendLedger,
  acquireLock,
  buildIssueBody,
  buildIssueTitle,
  GITHUB_REPO,
  hashFromTitle,
  issueCriteriaFor,
  MAX_ISSUES_PER_CYCLE,
  nextCycle,
  parseKindFromTitle,
  readGithubToken,
  redact,
  releaseLock,
  sh,
  slugify,
  Finding,
  FindingKind,
} from "./forge.ts";
import {
  auditLedgerFile,
  auditTestGaps,
  auditTodos,
  firstUntestedFunction,
} from "./auditors.ts";
import { Gh, GhIssue } from "./github.ts";
import {
  buildModeBPrompt,
  buildModeATest,
  FORGE_SYSTEM_PROMPT,
  llmDiff,
  probeFunction,
  stagePatch,
  validatePatch,
} from "./author.ts";
import { GateResult, gateProof, runGate } from "./verify.ts";

export interface CycleVerdict {
  ok: boolean;
  cycle: number;
  verdict: string;
  audit: { todo: number; testgap: number; ledger: number };
  issuesCreated: number[];
  claimed?: number;
  pr?: number;
  merged?: boolean;
  findings: { kind: FindingKind; target: string; count: number; hash: string }[];
  detail: string;
}

interface AuthorOutcome {
  ok: boolean;
  files: string[];
  summary?: string;
  reason?: string;
  mode?: "A" | "B";
}

function emptyVerdict(
  cycle: number,
  verdict: string,
  detail: string,
  audit: CycleVerdict["audit"] = { todo: 0, testgap: 0, ledger: 0 },
): CycleVerdict {
  return { ok: false, cycle, verdict, audit, issuesCreated: [], findings: [], detail };
}

function summarizeFindings(all: Finding[]): CycleVerdict["findings"] {
  return all.slice(0, 50).map((f) => ({ kind: f.kind, target: f.target, count: f.count, hash: f.hash }));
}

function pushUrl(token: string): string {
  return `https://x-access-token:${token}@github.com/${GITHUB_REPO}.git`;
}

async function resolveMainHead(repoRoot: string): Promise<string> {
  await sh("git", ["fetch", "origin", "main", "--quiet"], repoRoot, 45_000);
  const r1 = await sh("git", ["rev-parse", "origin/main"], repoRoot, 15_000);
  if (r1.code === 0) return r1.out.trim();
  const r2 = await sh("git", ["rev-parse", "main"], repoRoot, 15_000);
  if (r2.code === 0) return r2.out.trim();
  return "HEAD";
}

/* ── entry: the bounded, single-flight cycle ──────────────────────────────── */
export async function runCycle(repoRoot: string): Promise<CycleVerdict> {
  const lock = acquireLock();
  if (!lock.ok) {
    const ageSec = lock.holder ? Math.round((Date.now() - lock.holder.ts) / 1000) : -1;
    return emptyVerdict(
      0,
      "busy",
      `single-flight: claim.lock held by pid ${lock.holder?.pid ?? "?"} (age ${ageSec}s) — cycle not started`,
    );
  }
  if (lock.staleBroken) {
    appendLedger({
      cycle: 0,
      phase: "lock",
      issue: null,
      verdict: "stale-lock-broken",
      detail: "claim.lock was older than 30min — broken honestly, cycle proceeds",
    });
  }
  const cycle = nextCycle();
  try {
    return await cycleBody(cycle, repoRoot);
  } finally {
    releaseLock();
  }
}

async function cycleBody(cycle: number, repoRoot: string): Promise<CycleVerdict> {
  /* ── 1 · AUDIT — deterministic, read-only ──────────────────────────────── */
  const todos = auditTodos(repoRoot);
  const gaps = auditTestGaps(repoRoot);
  const led = auditLedgerFile(path.join(repoRoot, "mini-services/fleet-economy/state/ledger.jsonl"));
  const findings: Finding[] = [...gaps, ...todos, ...led.findings];
  const audit = { todo: todos.length, testgap: gaps.length, ledger: led.anomalies.length };
  appendLedger({
    cycle,
    phase: "audit",
    issue: null,
    verdict: "measured",
    detail: `todo-files=${todos.length} testgap-files=${gaps.length} ledger-anomalies=${led.anomalies.length} (fleet-ledger lines=${led.lines}, read-only)`,
  });
  const summarized = summarizeFindings(findings);

  /* ── 2 · ISSUES — sovereign-forge namespace, hash-idempotent ───────────── */
  const token = readGithubToken();
  if (!token) {
    appendLedger({
      cycle,
      phase: "issues",
      issue: null,
      verdict: "auth-missing",
      detail: "GitHub token unreadable at runtime — loop stops honestly; findings preserved in ledger",
    });
    return { ...emptyVerdict(cycle, "auth-missing", "no GitHub token available", audit), findings: summarized };
  }
  const gh = new Gh(token);
  const openBefore = await gh.listOpenForgeIssues();
  const openHashes = new Set(openBefore.map((i) => hashFromTitle(i.title)).filter((h): h is string => h !== null));
  const candidates = findings.filter((f) => !openHashes.has(f.hash)).slice(0, MAX_ISSUES_PER_CYCLE);
  const created: number[] = [];
  for (const f of candidates) {
    const criteria = issueCriteriaFor(f);
    const r = await gh.createIssue({
      title: buildIssueTitle(f),
      body: buildIssueBody(f, criteria),
      labels: ["sovereign-forge", `subsystem:${f.subsystem}`],
    });
    if (r.ok && r.number) {
      created.push(r.number);
      appendLedger({
        cycle,
        phase: "issues",
        issue: r.number,
        verdict: f.kind === "ledger" ? "observation-opened" : "opened",
        detail: `${f.kind} · ${f.target} · hash ${f.hash}${f.kind === "ledger" ? " · observation-only, never claimed" : ""}`,
      });
    } else {
      appendLedger({
        cycle,
        phase: "issues",
        issue: null,
        verdict: "create-failed",
        detail: redact(`${f.target}: ${r.error ?? "unknown error"}`),
      });
    }
  }
  if (created.length === 0) {
    appendLedger({
      cycle,
      phase: "issues",
      issue: null,
      verdict: "no-new",
      detail: `${openBefore.length} open sovereign-forge issue(s); every finding hash already open or cap reached`,
    });
  }

  /* ── 3 · CLAIM — oldest open unclaimed forge issue (observation-only never) */
  const openNow = await gh.listOpenForgeIssues();
  let target: GhIssue | undefined;
  for (const iss of openNow) {
    const issKind = parseKindFromTitle(iss.title);
    if (issKind === "ledger" || issKind === null) continue; // observation-only / foreign
    if ((iss.labels ?? []).some((l) => l.name === "author-refused")) continue;
    if (await gh.hasClaimComment(iss.number)) continue;
    target = iss;
    break;
  }
  if (!target) {
    appendLedger({
      cycle,
      phase: "claim",
      issue: null,
      verdict: "nothing-to-claim",
      detail: "no open unclaimed sovereign-forge issue (observation-only issues are never claimed)",
    });
    return {
      ok: true,
      cycle,
      verdict: "no-claimable",
      audit,
      issuesCreated: created,
      findings: summarized,
      detail: `${created.length} issue(s) opened this cycle; nothing claimable now`,
    };
  }
  const iso = new Date().toISOString();
  const kind = parseKindFromTitle(target.title) as FindingKind;
  const claimPosted = await gh.addComment(
    target.number,
    `SAOS-FORGE-CLAIM/${cycle}/${iso}\n\nclaimed by issue-forge (giant §9) — Mode ${kind === "testgap" ? "A (real characterization tests)" : "B (LLM patch, gate-gated)"}`,
  );
  if (!claimPosted) {
    appendLedger({ cycle, phase: "claim", issue: target.number, verdict: "claim-comment-failed", detail: "GitHub API refused the claim comment" });
    return { ...emptyVerdict(cycle, "claim-failed", `could not post claim comment on #${target.number}`, audit), issuesCreated: created, findings: summarized };
  }
  await gh.addLabels(target.number, ["claimed"]);
  appendLedger({ cycle, phase: "claim", issue: target.number, verdict: "claimed", detail: `SAOS-FORGE-CLAIM/${cycle}/${iso}` });

  /* ── temp branch from current main HEAD ─────────────────────────────────── */
  const savedBranch = (await sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot, 15_000)).out.trim() || "main";
  const baseRef = await resolveMainHead(repoRoot);
  const branch = `forge/issue-${target.number}`;
  const co = await sh("git", ["checkout", "-B", branch, baseRef], repoRoot, 60_000);
  if (co.code !== 0) {
    appendLedger({ cycle, phase: "author", issue: target.number, verdict: "branch-failed", detail: redact(co.out.slice(-300)) });
    await gh.addComment(target.number, `branch-failed (honest): could not create ${branch} from ${baseRef}\n\`\`\`\n${redact(co.out).slice(-500)}\n\`\`\``);
    return { ...emptyVerdict(cycle, "branch-failed", `git checkout -B ${branch} failed`, audit), issuesCreated: created, claimed: target.number, findings: summarized };
  }
  try {
    /* ── 4 · AUTHOR ─────────────────────────────────────────────────────── */
    const issueBody = target.body ?? "";
    const author =
      kind === "testgap"
        ? await authorModeA({
            repoRoot,
            cycle,
            issue: target.number,
            findingTitle: target.title,
            testgapFindings: findings.filter((f) => f.kind === "testgap"),
          })
        : await authorModeB({
            repoRoot,
            cycle,
            issue: target.number,
            issueTitle: target.title,
            issueBody,
            finding: findings.find((f) => f.hash === hashFromTitle(target.title)) ?? null,
          });

    if (!author.ok) {
      await gh.addLabels(target.number, ["author-refused"]);
      await gh.addComment(
        target.number,
        `author-refused (honest — nothing fabricated):\n\nreason: ${author.reason ?? "unknown"}\n\nThe issue stays open with the evidence; a future cycle may retry with better tooling.`,
      );
      appendLedger({ cycle, phase: "author", issue: target.number, verdict: "author-refused", detail: redact(author.reason ?? "unknown") });
      return { ...emptyVerdict(cycle, "author-refused", redact(author.reason ?? "unknown"), audit), issuesCreated: created, claimed: target.number, findings: summarized };
    }
    appendLedger({ cycle, phase: "author", issue: target.number, verdict: author.mode === "A" ? "mode-a" : "mode-b", detail: redact(author.summary ?? "") });

    const add = await sh("git", ["add", ...author.files], repoRoot, 30_000);
    const commit = await sh(
      "git",
      [
        "-c", "user.name=roshpinacare-sys",
        "-c", "user.email=326012154+roshpinacare-sys@users.noreply.github.com",
        "commit", "-m", `forge(issue-${target.number}): ${kind} — ${slugify(author.files[0] ?? "target")}`,
      ],
      repoRoot,
      60_000,
    );
    if (add.code !== 0 || commit.code !== 0) {
      const detail = redact(`${add.out.slice(-150)} | ${commit.out.slice(-300)}`);
      appendLedger({ cycle, phase: "author", issue: target.number, verdict: "commit-failed", detail });
      await gh.addComment(target.number, `commit-failed (honest):\n\`\`\`\n${detail.slice(0, 1200)}\n\`\`\``);
      return { ...emptyVerdict(cycle, "commit-failed", detail, audit), issuesCreated: created, claimed: target.number, findings: summarized };
    }

    /* ── 5 · VERIFY — the real gate ─────────────────────────────────────── */
    const gate1 = await runGate(repoRoot);
    if (!gate1.green) {
      const proof = redact(gateProof(gate1));
      appendLedger({ cycle, phase: "verify", issue: target.number, verdict: "gate-red", detail: proof.slice(-1200) });
      await gh.addComment(target.number, `gate-RED (honest — not shipped, not merged):\n\`\`\`\n${proof.slice(0, 1800)}\n\`\`\``);
      return { ...emptyVerdict(cycle, "gate-red", "verify gate red — claim released, temp branch deleted", audit), issuesCreated: created, claimed: target.number, findings: summarized };
    }
    appendLedger({ cycle, phase: "verify", issue: target.number, verdict: "gate-green", detail: redact(gateProof(gate1)).slice(-800) });

    /* ── 6 · SHIP — push → PR → fresh gate re-run → squash merge ────────── */
    const push = await sh("git", ["push", pushUrl(token), `${branch}:${branch}`], repoRoot, 90_000);
    if (push.code !== 0) {
      const detail = redact(push.out).slice(-400);
      appendLedger({ cycle, phase: "ship", issue: target.number, verdict: "push-failed", detail });
      await gh.addComment(target.number, `push-failed (honest):\n\`\`\`\n${detail.slice(0, 1000)}\n\`\`\``);
      return { ...emptyVerdict(cycle, "push-failed", detail, audit), issuesCreated: created, claimed: target.number, findings: summarized };
    }
    const prr = await gh.openPr({
      title: `fix(issue-${target.number}): ${slugify(author.files[0] ?? "target")}`,
      head: branch,
      base: "main",
      body: prBody(target.number, author, gate1),
    });
    if (!prr.ok || !prr.number) {
      const detail = redact(prr.error ?? "HTTP ?");
      appendLedger({ cycle, phase: "ship", issue: target.number, verdict: "pr-failed", detail });
      return { ...emptyVerdict(cycle, "pr-failed", detail, audit), issuesCreated: created, claimed: target.number, findings: summarized };
    }
    const pr = prr.number;
    appendLedger({ cycle, phase: "ship", issue: target.number, verdict: "pr-opened", detail: `PR #${pr} from ${branch} → main` });

    /* fresh local re-run of the gate — merge ONLY after it passes */
    const gate2 = await runGate(repoRoot);
    if (!gate2.green) {
      appendLedger({
        cycle,
        phase: "ship",
        issue: target.number,
        verdict: "merge-refused",
        detail: `fresh gate re-run red — PR #${pr} left open, never merged: ${redact(gateProof(gate2)).slice(-600)}`,
      });
      return { ...emptyVerdict(cycle, "merge-refused", `fresh gate re-run red — PR #${pr} left open`, audit), issuesCreated: created, claimed: target.number, pr, findings: summarized };
    }
    const mr = await gh.mergePr(pr, "squash");
    if (!mr.ok) {
      const detail = redact(mr.error ?? "unknown");
      appendLedger({ cycle, phase: "ship", issue: target.number, verdict: "merge-failed", detail });
      return { ...emptyVerdict(cycle, "merge-failed", detail, audit), issuesCreated: created, claimed: target.number, pr, findings: summarized };
    }
    appendLedger({ cycle, phase: "ship", issue: target.number, verdict: "merged", detail: `PR #${pr} squash-merged after fresh green gate re-run` });
    await gh.addComment(target.number, `merged: PR #${pr} (squash) — fresh gate re-run was green.\n\ncloses #${target.number}`);
    return {
      ok: true,
      cycle,
      verdict: "shipped",
      audit,
      issuesCreated: created,
      claimed: target.number,
      pr,
      merged: true,
      findings: summarized,
      detail: `${author.mode === "A" ? "Mode A characterization" : "Mode B patch"} → gate green ×2 → PR #${pr} squash-merged`,
    };
  } finally {
    /* restore the worktree exactly as the loop found it; temp branch never lingers */
    await sh("git", ["checkout", savedBranch], repoRoot, 60_000);
    await sh("git", ["reset", "--hard"], repoRoot, 30_000);
    await sh("git", ["clean", "-fd", "--", "tests"], repoRoot, 30_000);
    await sh("git", ["branch", "-D", branch], repoRoot, 30_000);
  }
}

function prBody(issueNumber: number, author: AuthorOutcome, gate: GateResult): string {
  return [
    "## Scope declaration",
    `- closes #${issueNumber}`,
    `- files touched: ${author.files.map((f) => `\`${f}\``).join(", ")}`,
    `- authoring mode: ${author.mode === "A" ? "A — deterministic characterization (real captured outputs)" : "B — LLM patch, git-apply validated, scope-locked"}`,
    `- summary: ${author.summary ?? ""}`,
    "",
    `## Test output proof (real gate on forge/issue-${issueNumber})`,
    "```",
    gateProof(gate),
    "```",
    "",
    "## Honesty",
    "Merged (squash) only after a FRESH local re-run of the same gate was green. RED is never shipped.",
  ].join("\n");
}

/* ── Mode A implementation ────────────────────────────────────────────────── */
async function authorModeA(input: {
  repoRoot: string;
  cycle: number;
  issue: number;
  findingTitle: string;
  testgapFindings: Finding[];
}): Promise<AuthorOutcome> {
  const hash = hashFromTitle(input.findingTitle);
  const finding = input.testgapFindings.find((f) => f.hash === hash);
  if (!finding) {
    return { ok: false, files: [], reason: `finding-hash ${hash ?? "?"} not present in current audit — file may already be tested` };
  }
  const prefer = firstUntestedFunction(input.repoRoot, finding.target) ?? undefined;
  const probe = await probeFunction(input.repoRoot, finding.target, prefer);
  if (!probe.ok || !probe.name || !probe.cases || probe.cases.length < 3) {
    return { ok: false, files: [], reason: `probe-failed: ${probe.reason ?? "fewer than 3 deterministic cases"}` };
  }
  const stem = path.basename(finding.target).replace(/\.tsx?$/, "");
  const testRel = path.join("tests", `${stem}.forge.test.ts`);
  const content = buildModeATest({
    relModule: finding.target,
    fnName: probe.name,
    cases: probe.cases,
    isAsync: !!probe.async,
    issue: input.issue,
    cycle: input.cycle,
  });
  const abs = path.join(input.repoRoot, testRel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return {
    ok: true,
    files: [testRel],
    mode: "A",
    summary: `${probe.name}() · ${probe.cases.length} cases captured from real execution of ${finding.target}`,
  };
}

/* ── Mode B implementation ────────────────────────────────────────────────── */
async function authorModeB(input: {
  repoRoot: string;
  cycle: number;
  issue: number;
  issueTitle: string;
  issueBody: string;
  finding: Finding | null;
}): Promise<AuthorOutcome> {
  if (!input.finding) {
    return { ok: false, files: [], reason: "finding-hash not present in current audit — the todo debt may have moved" };
  }
  const target = input.finding.target;
  const abs = path.join(input.repoRoot, target);
  let fileContent = "";
  try {
    fileContent = fs.readFileSync(abs, "utf8");
  } catch {
    return { ok: false, files: [], reason: `target file unreadable: ${target}` };
  }
  const prompt = buildModeBPrompt({
    issueTitle: input.issueTitle,
    issueBody: input.issueBody,
    target,
    fileContent,
  });
  let lastReason = "author-refused";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptPrompt =
      attempt === 1
        ? prompt
        : `${prompt}\n\nATTEMPT ${attempt}: your previous output was rejected (it must be ONE unified diff, touching ONLY ${target}, applicable by git apply). Output the diff or exactly REFUSE.`;
    const { diff, via, refused } = await llmDiff(FORGE_SYSTEM_PROMPT, attemptPrompt);
    if (!diff) {
      lastReason = refused ? `llm-refused via ${via}` : `llm-${via}-no-diff`;
      continue;
    }
    const v = await validatePatch(input.repoRoot, diff, target);
    if (!v.ok) {
      lastReason = v.reason ?? "validate-failed";
      continue;
    }
    /* real apply on the temp branch */
    const stage = stagePatch(input.repoRoot, diff);
    try {
      const ap = await sh("git", ["apply", "--whitespace=nowarn", path.relative(input.repoRoot, stage.file)], input.repoRoot, 30_000);
      if (ap.code !== 0) {
        lastReason = "apply-failed: " + ap.out.slice(-200);
        continue;
      }
      return { ok: true, files: [target], mode: "B", summary: `LLM patch via ${via} · validated (scope + apply-check) · ${target}` };
    } finally {
      stage.cleanup();
    }
  }
  return { ok: false, files: [], reason: lastReason };
}
