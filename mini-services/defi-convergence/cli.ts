#!/usr/bin/env bun
// cli.ts — runnable surface for the canonical SAOS-EXECUTION-LEDGER/1 accessor.
//
//   bun mini-services/defi-convergence/cli.ts verify   [--json]
//   bun mini-services/defi-convergence/cli.ts recover  [--json] [--no-apply]
//
// Exit codes (fail-honest):
//   0 ok / recovered   2 stale   3 invalid   4 missing   5 recovery refused
//
// Zero dependencies. Host paths resolve via measured candidate order
// (env overrides → Domain checkout → giant last-good mirror).

import { readFileSync, existsSync, copyFileSync } from "node:fs";
import {
  resolveCandidates,
  resolveMirrorCandidates,
  readExecutionState,
  recoverExecutionState,
  type AccessResult,
} from "./execution-accessor.ts";

function emitJson(r: AccessResult, extra: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify(
      {
        schema: "execution-accessor-report/1",
        at: new Date().toISOString(),
        status: r.status,
        path: r.path,
        reason: r.reason ?? null,
        candidates: r.candidates,
        ...extra,
      },
      null,
      2,
    ),
  );
}

function emitHuman(r: AccessResult, extra: string[] = []): void {
  console.log(`[execution-accessor] status=${r.status}`);
  console.log(`[execution-accessor] path=${r.path ?? "(none)"}`);
  if (r.reason) console.log(`[execution-accessor] reason=${r.reason}`);
  for (const line of extra) console.log(`[execution-accessor] ${line}`);
  console.log(`[execution-accessor] candidates (measured order):`);
  for (const c of r.candidates) console.log(`[execution-accessor]   - ${c}`);
}

function exitFor(r: AccessResult): number {
  return r.status === "ok" ? 0 : r.status === "stale" ? 2 : r.status === "invalid" ? 3 : 4;
}

const [, , cmd = "", ...rest] = process.argv;
const json = rest.includes("--json");
const apply = !rest.includes("--no-apply");

if (cmd === "verify") {
  const r = readExecutionState({});
  if (json) emitJson(r);
  else emitHuman(r, r.doc ? [`ledger.at=${String((r.doc as { at?: unknown }).at)}`] : []);
  process.exit(exitFor(r));
} else if (cmd === "recover") {
  const r = recoverExecutionState({ apply, generator: "defi-convergence cli.ts recover (G76-h)" });
  const extra = [
    r.wroteTo ? `wroteTo=${r.wroteTo}` : "wroteTo=(none — ledger untouched)",
    r.quarantinedTo ? `quarantinedTo=${r.quarantinedTo}` : "quarantinedTo=(none)",
  ];
  if (json) emitJson(r.read, { action: r.action, wroteTo: r.wroteTo ?? null, quarantinedTo: r.quarantinedTo ?? null });
  else emitHuman(r.read, [`action=${r.action}`, ...extra]);
  process.exit(r.read.status === "invalid" ? 3 : exitFor(r.read));
} else if (cmd === "mirror") {
  // measured copy: refresh the giant last-good mirror from the live ledger (byte-true).
  // ok|stale are both mirrorable — staleness is an honesty flag, not corruption;
  // missing/invalid refuse (never propagate a torn or absent ledger).
  const live = readExecutionState({});
  if ((live.status !== "ok" && live.status !== "stale") || !live.path) {
    if (json) emitJson(live, { mirrored: false });
    else emitHuman(live, ["mirror refused: live ledger is not healthy — refusing to propagate a bad copy"]);
    process.exit(exitFor(live));
  }
  const mirror = resolveMirrorCandidates()[0];
  if (!mirror) {
    console.error("[execution-accessor] no mirror path resolvable (repo root not found)");
    process.exit(5);
  }
  copyFileSync(live.path, mirror);
  const ok = existsSync(mirror) && readFileSync(mirror, "utf8") === readFileSync(live.path, "utf8");
  const receipt = {
    schema: "execution-mirror-receipt/1",
    at: new Date().toISOString(),
    source: live.path,
    mirror,
    byteIdentical: ok,
    sha256Source: new Bun.CryptoHasher("sha256").update(readFileSync(live.path)).digest("hex"),
    sha256Mirror: new Bun.CryptoHasher("sha256").update(readFileSync(mirror)).digest("hex"),
  };
  if (json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`[execution-accessor] mirrored ${receipt.source} → ${receipt.mirror} byteIdentical=${ok}`);
  process.exit(ok ? 0 : 5);
} else {
  console.error("usage: cli.ts verify|recover|mirror [--json] [--no-apply]");
  process.exit(1);
}
