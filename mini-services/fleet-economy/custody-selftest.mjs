/* custody-selftest.mjs — TDD suite BEFORE custody-seal.mjs implementation (RED first).
 * Deterministic, offline, zero deps. Exit 1 on any failure.
 * Golden facts mirror the engine's chain law: h = sha256(JSON.stringify({...tx, prev})).slice(0,32),
 * chain starts at prev="GENESIS", ledger files = ledger.jsonl + ledger-N.jsonl sorted numerically.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyBook, runCustodySeal } from "./custody-seal.mjs";

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), `${name} (${JSON.stringify(a)} === ${JSON.stringify(b)})`); }

function sealTx(prev, t) {
  const body = JSON.stringify({ ...t, prev });
  return { ...t, h: createHash("sha256").update(body).digest("hex").slice(0, 32) };
}
function makeBook(dir, entries) {
  mkdirSync(dir, { recursive: true });
  let prev = "GENESIS"; const lines = [];
  for (const t of entries) { const tx = sealTx(prev, t); prev = tx.h; lines.push(JSON.stringify(tx)); }
  writeFileSync(join(dir, "ledger.jsonl"), lines.join("\n") + "\n");
  return lines;
}
function makeSnapshot(dir, seq, lastH) {
  writeFileSync(join(dir, "snapshot.json"), JSON.stringify({ v: 3, seq, lastH, balances: { treasury: { usds: 1, saos: 2 } } }));
}

const T1 = [{ seq: 1, ts: 1, kind: "swap", from: "a", to: "pool", asset: "USDS", amount: 1 },
            { seq: 2, ts: 2, kind: "tip", from: "b", to: "c", asset: "SAOS", amount: 0.5 },
            { seq: 3, ts: 3, kind: "tax", from: "c", to: "treasury", asset: "USDS", amount: 0.01 }];

console.log("— verifyBook golden facts —");
{
  const d = join(mkdtempSync(join(tmpdir(), "custody-t-")), "state");
  makeBook(d, T1); makeSnapshot(d, 3, "x");
  const v = verifyBook(d);
  eq({ ok: v.ok, checked: v.checked, lastSeq: v.lastSeq }, { ok: true, checked: 3, lastSeq: 3 }, "valid 3-entry book verifies");
}
{
  const d = join(mkdtempSync(join(tmpdir(), "custody-t-")), "state");
  const lines = makeBook(d, T1);
  const torn = JSON.parse(lines[1]); torn.amount = 999;               // flip amount → hash mismatch
  const all = lines.map((l, i) => (i === 1 ? JSON.stringify(torn) : l));
  writeFileSync(join(d, "ledger.jsonl"), all.join("\n") + "\n");
  const v = verifyBook(d);
  eq({ ok: v.ok, checked: v.checked, brokenAt: v.brokenAt }, { ok: false, checked: 1, brokenAt: 2 }, "torn body detected at seq 2");
}
{
  const d = join(mkdtempSync(join(tmpdir(), "custody-t-")), "state");
  makeBook(d, T1);
  writeFileSync(join(d, "ledger.jsonl"), readFileSync(join(d, "ledger.jsonl"), "utf8") + "{not-json\n");
  const v = verifyBook(d);
  eq({ ok: v.ok, checked: v.checked, brokenAt: v.brokenAt }, { ok: false, checked: 3, brokenAt: 3 }, "malformed line fails closed at checked=3");
}
{
  const d = join(mkdtempSync(join(tmpdir(), "custody-t-")), "state");
  makeBook(d, T1);
  makeBook(d + "_x", T1); // second rotation file ledger-2.jsonl
  writeFileSync(join(d, "ledger-2.jsonl"), readFileSync(join(d + "_x", "ledger.jsonl"), "utf8"));
  const v = verifyBook(d);
  eq(v.ok, false, "rotation file with restarted GENESIS chain is NOT valid (numeric sort, contiguity enforced)");
}
{
  const d = join(mkdtempSync(join(tmpdir(), "custody-t-")), "state");
  const lines = makeBook(d, T1);
  const t2 = sealTx(JSON.parse(lines[1]).h, T1[2]);
  writeFileSync(join(d, "ledger.jsonl"), lines.slice(0, 2).concat([JSON.stringify(t2)]).join("\n") + "\n");
  writeFileSync(join(d, "ledger-2.jsonl"), lines.slice(0, 0).join(""));
  writeFileSync(join(d, "ledger-10.jsonl"), JSON.stringify(sealTx(t2.h, { seq: 4, ts: 4, kind: "tip", from: "d", to: "e", asset: "USDS", amount: 1 })) + "\n");
  const v = verifyBook(d);
  eq(v.checked, 4, "numeric rotation sort (ledger-10 AFTER ledger-2) — chain continues");
  eq(v.ok, true, "rotated book verifies end-to-end");
}
{
  const d = join(mkdtempSync(join(tmpdir(), "custody-t-")), "state");
  eq(verifyBook(d), { ok: false, checked: 0, brokenAt: 0 }, "empty/missing book fails closed, not vacuous-true");
}

console.log("— runCustodySeal custody laws —");
{
  const root = mkdtempSync(join(tmpdir(), "custody-s-"));
  const state = join(root, "state"), custody = join(root, "state-custody");
  makeBook(state, T1); makeSnapshot(state, 3, "abc");
  const before = ["ledger.jsonl", "snapshot.json"].map((f) => statSync(join(state, f)).mtimeMs);
  const r = runCustodySeal({ stateDir: state, custodyDir: custody, now: "2026-10-24T17:00:00.000Z" });
  ok(r.ok === true, "seal on valid book succeeds");
  eq(r.checked, 3, "receipt carries verified checked count");
  const stamp = "2026-10-24T17-00-00-000Z";
  ok(existsSync(join(custody, stamp, "ledger.jsonl")), "custody dir is timestamped + append-only (new path)");
  ok(existsSync(join(custody, stamp, "snapshot.json")), "snapshot rides the custody snapshot");
  const man = JSON.parse(readFileSync(join(custody, stamp, "manifest.json"), "utf8"));
  eq(man.schema, "SAOS-CUSTODY/1", "manifest schema law");
  const real = createHash("sha256").update(readFileSync(join(custody, stamp, "ledger.jsonl"))).digest("hex");
  eq(man.files["ledger.jsonl"].sha256, real, "manifest sha256 is the REAL file hash");
  const after = ["ledger.jsonl", "snapshot.json"].map((f) => statSync(join(state, f)).mtimeMs);
  ok(JSON.stringify(before) === JSON.stringify(after), "LIVE files byte/mtime-untouched by seal (tear class dead)");
}
{
  const root = mkdtempSync(join(tmpdir(), "custody-s-"));
  const state = join(root, "state"), custody = join(root, "state-custody");
  makeBook(state, T1);
  const lines = readFileSync(join(state, "ledger.jsonl"), "utf8").split("\n").filter(Boolean);
  const torn = JSON.parse(lines[2]); torn.amount = 1e9;
  writeFileSync(join(state, "ledger.jsonl"), lines.map((l, i) => (i === 2 ? JSON.stringify(torn) : l)).join("\n") + "\n");
  const r = runCustodySeal({ stateDir: state, custodyDir: custody, now: "2026-10-24T17:01:00.000Z" });
  eq(r.ok, false, "seal on torn book FAILS CLOSED");
  ok(!existsSync(custody) || readdirSync(custody).length === 0, "NO custody artifact on torn book (never seals a lie)");
}
{
  const root = mkdtempSync(join(tmpdir(), "custody-s-"));
  const state = join(root, "state"), custody = join(root, "state-custody");
  makeBook(state, T1); makeSnapshot(state, 3, "abc");
  runCustodySeal({ stateDir: state, custodyDir: custody, now: "2026-10-24T17:02:00.000Z" });
  const r2 = runCustodySeal({ stateDir: state, custodyDir: custody, now: "2026-10-24T17:12:00.000Z" });
  ok(r2.ok && existsSync(join(custody, "2026-10-24T17-12-00-000Z", "ledger.jsonl")), "two seals = two distinct append-only stamps");
  ok(readdirSync(custody).length === 2, "no overwrite: custody history preserved");
}

console.log(`\nCUSTODY-SELFTEST: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
