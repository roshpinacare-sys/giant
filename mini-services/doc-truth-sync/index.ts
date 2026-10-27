/* index.ts — doc-truth-sync organ (:3062).
 *
 * §4 ULTIMATE DIRECTIVE: "Audit, update, and re-index all outdated files,
 * documentation, status trackers, and web pages ... that have been dormant."
 *
 * Surface:
 *   GET /health     — alive law (liveness probes; never 404-silent).
 *   GET /census     — REAL staleness census over DOC_TRUTH_ROOT (git metadata
 *                     → pure classifier). Fail-honest 503, never fabricates.
 *   GET /isolation  — the DECISIONS #42/#43 legacy-archive isolation manifest.
 *   POST /receipt   — append a hash-chained receipt (SAOS-DOC-TRUTH/1) for a
 *                     census/landing event; persisted to the state dir.
 *   bun run index.ts --once   — CI-provable single cycle: census summary JSON
 *                     to stdout, exit 0. No server.
 *
 * Env: DOC_TRUTH_SYNC_PORT (default 3062) · DOC_TRUTH_ROOT (default: the giant
 * repo root inferred from this module's location) · DOC_TRUTH_INCLUDE (comma
 * glob list; default docs-centric) · DOC_TRUTH_DORMANT_DAYS (default 7).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCensus, payloadHashOfCensus, type CensusRow, type FileFact } from "./census.ts";
import { buildIsolationManifest, type LegacyArtifact } from "./convergence.ts";
import { collectFileFacts } from "./collect.ts";
import { appendReceipt, genesisReceipt, verifyChain, type DocTruthReceipt } from "./receipts.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(HERE, "..", "..");
const PORT = Number(process.env.DOC_TRUTH_SYNC_PORT ?? 3062);
const ROOT = process.env.DOC_TRUTH_ROOT ?? DEFAULT_ROOT;
const DORMANT_DAYS = Number(process.env.DORMANT_DAYS ?? 7);
const INCLUDE = (process.env.DOC_TRUTH_INCLUDE ?? "*.md,docs/**/*.md,SWARM_STATE.md,SYSTEM.md,README.md")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const STATE_DIR = join(HERE, "state");
const CHAIN_PATH = join(STATE_DIR, "chain.json");

/** Measured legacy artifacts (census 2026-10-24, duplicates-audit freeze column). */
const SEED_ARTIFACTS: readonly LegacyArtifact[] = [
  {
    key: "autonomy-giant-folder",
    repo: "Autonomy",
    path: "giant/",
    description: "CHARTER.md + FRONT-CONTRACT.md + STATE.md — the exec38 seed folder predating the giant repo",
    supersededBy: "roshpinacare-sys/giant",
    decisionRef: "DECISIONS #43 (exec38/38-a)",
  },
  {
    key: "zip-archive",
    repo: "Zip",
    description: "legacy coordination/benchmark docs archive (2026-10-07 era)",
    supersededBy: "roshpinacare-sys/giant",
    decisionRef: "duplicates-audit-2026-10-15",
  },
  {
    key: "project-files-archive",
    repo: "Project-files",
    description: "legacy daily reports (2026-09-11 era)",
    supersededBy: "roshpinacare-sys/giant",
    decisionRef: "DECISIONS #42 (R360)",
  },
];

const GLOB_META = ".*+?^${}()|[]\\";
function escapeLiteral(ch: string): string {
  return GLOB_META.includes(ch) ? "\\" + ch : ch;
}

/** Mini-glob compiler: the sequence double-star-slash matches zero or more
 * dirs, double-star matches any remainder, single-star any run without a
 * slash. Everything else is literal. */
export function globToRegex(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern.startsWith("**/", i)) {
        re += "(?:.*/)?";
        i += 2;
      } else if (pattern.startsWith("**", i)) {
        re += ".*";
        i += 1;
      } else {
        re += "[^/]*";
      }
    } else {
      re += escapeLiteral(c);
    }
  }
  return new RegExp("^" + re + "$");
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function loadChain(): DocTruthReceipt[] {
  if (!existsSync(CHAIN_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(CHAIN_PATH, "utf8")) as DocTruthReceipt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistChain(chain: readonly DocTruthReceipt[]): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = CHAIN_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(chain, null, 2) + "\n", "utf8");
  writeFileSync(CHAIN_PATH, JSON.stringify(chain, null, 2) + "\n", "utf8");
}

export function runCensusWith(
  root: string,
  include: readonly string[],
  dormantDays: number,
  iso: string = nowIso(),
): Promise<CensusResult> {
  return (async () => {
    const collected = await collectFileFacts(root);
    const scoped: FileFact[] = collected.facts
      .filter((f) => include.some((pat) => globToRegex(pat).test(f.path)))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const { rows, summary } = buildCensus(scoped, iso, dormantDays);
    return {
      iso,
      root,
      include,
      dormantAfterDays: dormantDays,
      walkedCommits: collected.walkedCommits,
      historyComplete: collected.historyComplete,
      summary,
      rows,
      payloadHash: payloadHashOfCensus(rows),
    };
  })();
}

export interface CensusResult {
  readonly iso: string;
  readonly root: string;
  readonly include: readonly string[];
  readonly dormantAfterDays: number;
  readonly walkedCommits: number;
  readonly historyComplete: boolean;
  readonly summary: ReturnType<typeof buildCensus>["summary"];
  readonly rows: readonly CensusRow[];
  readonly payloadHash: string;
}

export async function runCensus(): Promise<CensusResult> {
  return runCensusWith(ROOT, INCLUDE, DORMANT_DAYS);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    const chain = loadChain();
    const verdict = verifyChain(chain);
    return json({
      ok: true,
      service: "doc-truth-sync",
      version: "SAOS-DOC-TRUTH/1",
      port: PORT,
      root: ROOT,
      receipts: chain.length,
      chainOk: verdict.ok,
      ts: nowIso(),
    });
  }
  if (url.pathname === "/census") {
    try {
      const c = await runCensus();
      return json({ ok: true, census: c });
    } catch (e) {
      return json({ ok: false, reason: e instanceof Error ? e.message : String(e) }, 503);
    }
  }
  if (url.pathname === "/isolation") {
    try {
      const m = buildIsolationManifest(SEED_ARTIFACTS, nowIso());
      return json({ ok: true, isolation: m });
    } catch (e) {
      return json({ ok: false, reason: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  if (url.pathname === "/receipt" && req.method === "POST") {
    try {
      const body = (await req.json()) as { kind?: string; payload?: unknown };
      const kind = typeof body.kind === "string" && body.kind.length > 0 ? body.kind : null;
      if (kind === null) return json({ ok: false, reason: "kind required" }, 400);
      const iso = nowIso();
      const payload = body.payload ?? {};
      const chain = loadChain();
      const next =
        chain.length === 0
          ? [genesisReceipt(iso, kind, payload)]
          : appendReceipt(chain, iso, kind, payload);
      persistChain(next);
      return json({ ok: true, receipt: next[next.length - 1], receipts: next.length });
    } catch (e) {
      return json({ ok: false, reason: e instanceof Error ? e.message : String(e) }, 400);
    }
  }
  return json({ ok: false, reason: "not-found" }, 404);
}

async function once(): Promise<void> {
  const c = await runCensus();
  const m = buildIsolationManifest(SEED_ARTIFACTS, c.iso);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "once",
        iso: c.iso,
        summary: c.summary,
        payloadHash: c.payloadHash,
        walkedCommits: c.walkedCommits,
        historyComplete: c.historyComplete,
        isolationManifestHash: m.manifestHash,
        dormantPaths: c.rows.filter((r) => r.status === "DORMANT").map((r) => r.path),
      },
      null,
      2,
    ) + "\n",
  );
}

const isDirectRun = process.argv[1] !== undefined && import.meta.path === process.argv[1];
if (isDirectRun && process.argv.includes("--once")) {
  once().catch((e) => {
    console.error(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }) + "\n");
    process.exit(1);
  });
} else if (isDirectRun) {
  Bun.serve({
    port: PORT,
    fetch: (req) => handle(req),
  });
  console.log("doc-truth-sync listening on :" + PORT + " (root=" + ROOT + ", dormant>" + DORMANT_DAYS + "d)");
}
