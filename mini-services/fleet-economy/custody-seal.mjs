/* custody-seal.mjs — append-only custody for the fleet-economy book (sovereign-fabric-liveness lane).
 *
 * The tear law it cures (measured, 8+ quarantines): the live state files were git-TRACKED,
 * so any seal/pull/merge could rewrite the book under the running engine → torn chain →
 * quarantine + genesis reseed = the whole treasury history destroyed.
 *
 * The cure has two halves:
 *  1. giant/.gitignore untracks mini-services/fleet-economy/state/  → git can NEVER touch the
 *     live book again (autostash/pull/merge become inert for it).
 *  2. THIS module seals custody as APPEND-ONLY timestamped snapshots (state-custody/<ISO>/),
 *     new path per seal → merge conflicts structurally impossible, live files byte-untouched.
 *  Restore stays manual/boot-heal only — custody never feeds back automatically (the live
 *  book is the truth; a custody copy is evidence, not a writer).
 *
 * Zero deps. Zero network in library mode. CLI mode (import.meta.main) does the real seal:
 * verify fail-closed → copy → manifest → git add custody-dir-only → commit → pull --rebase → push.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const GENESIS = "GENESIS";

/* ── ledger file inventory (identical law to the engine: numeric rotation sort) ── */
export function ledgerFiles(stateDir) {
  if (!existsSync(stateDir)) return [];
  return readdirSync(stateDir)
    .filter((f) => f === "ledger.jsonl" || /^ledger-\d+\.jsonl$/.test(f))
    .sort((a, b) => {
      const na = Number(/-(\d+)\.jsonl$/.exec(a)?.[1] ?? 0);
      const nb = Number(/-(\d+)\.jsonl$/.exec(b)?.[1] ?? 0);
      return na - nb || a.localeCompare(b);
    });
}

/* ── full-chain verification (same math as the engine's verifyChain) ── */
export function verifyBook(stateDir) {
  let prev = GENESIS;
  let checked = 0;
  let lastSeq = 0;
  const files = ledgerFiles(stateDir);
  if (files.length === 0) return { ok: false, checked: 0, brokenAt: 0 };
  for (const f of files) {
    const raw = readFileSync(join(stateDir, f), "utf8");
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let t;
      try {
        t = JSON.parse(line);
      } catch {
        return { ok: false, checked, brokenAt: checked, lastSeq };
      }
      const { h, ...rest } = t;
      const body = JSON.stringify({ ...rest, prev });
      if (createHash("sha256").update(body).digest("hex").slice(0, 32) !== h) {
        return { ok: false, checked, brokenAt: t.seq, lastSeq };
      }
      prev = h;
      lastSeq = t.seq;
      checked++;
    }
  }
  return { ok: true, checked, lastSeq };
}

function stampOf(iso) {
  return iso.replace(/[:.]/g, "-");
}

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

/* ── the custody seal: verify fail-closed → append-only snapshot → manifest ── */
export function runCustodySeal({ stateDir, custodyDir, now }) {
  const iso = now ?? new Date().toISOString();
  const v = verifyBook(stateDir);
  if (!v.ok) {
    return { ok: false, checked: v.checked, brokenAt: v.brokenAt, reason: "book-torn-nothing-sealed" };
  }
  const stamp = stampOf(iso);
  const dir = join(custodyDir, stamp);
  mkdirSync(dir, { recursive: true });

  const files = {};
  for (const f of ledgerFiles(stateDir)) {
    copyFileSync(join(stateDir, f), join(dir, f));
    files[f] = { sha256: sha256File(join(dir, f)), bytes: statSync(join(dir, f)).size };
  }
  if (existsSync(join(stateDir, "snapshot.json"))) {
    copyFileSync(join(stateDir, "snapshot.json"), join(dir, "snapshot.json"));
    files["snapshot.json"] = { sha256: sha256File(join(dir, "snapshot.json")), bytes: statSync(join(dir, "snapshot.json")).size };
  }

  const manifest = {
    schema: "SAOS-CUSTODY/1",
    at: iso,
    stamp,
    checked: v.checked,
    lastSeq: v.lastSeq,
    files,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { ok: true, checked: v.checked, lastSeq: v.lastSeq, stamp, files: Object.keys(files) };
}

/* ── CLI: the real seal against the live deployment (fail-closed exit 1) ── */
async function main() {
  const here = new URL(".", import.meta.url).pathname;
  const stateDir = join(here, "state");
  const custodyDir = join(here, "state-custody");
  const r = runCustodySeal({ stateDir, custodyDir });
  if (!r.ok) {
    console.error(`CUSTODY-SEAL-FAIL: torn book (checked=${r.checked} brokenAt=${r.brokenAt}) — nothing sealed, fail-closed`);
    process.exit(1);
  }
  console.log(`CUSTODY-SEAL-OK: ${r.stamp} · ${r.checked} entries · seq ${r.lastSeq}`);
  const { execFileSync } = await import("node:child_process");
  const git = (args, opts = {}) =>
    execFileSync("git", args, { cwd: here, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  try {
    git(["add", "state-custody"]);
    const st = git(["status", "--porcelain"]).trim();
    if (st) {
      git(["commit", "-q", "-m", `custody [auto-economy]: ${r.checked} entries · seq ${r.lastSeq} — append-only snapshot`]);
      const rm = git(["remote"]).split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "origin";
      const pull = git(["-c", "rebase.autoStash=false", "pull", "--rebase", "-X", "ours", rm, "main"]);
      git(["push", rm, "main"]);
      console.log(`CUSTODY-PUSH-OK: ${pull.includes("up to date") ? "rebased-clean" : "fast-forward"}`);
    } else {
      console.log("CUSTODY-NOOP: no new artifacts (already sealed)");
    }
  } catch (e) {
    console.error(`CUSTODY-GIT-FAIL (snapshot preserved locally): ${String(e.message).split("\n")[0]}`);
    process.exit(1);
  }
}

if (import.meta.main) await main();
