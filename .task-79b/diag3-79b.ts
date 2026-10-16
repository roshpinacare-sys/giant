/* diag3-79b.ts — sub-chain continuity + duplicate-ref forensics (read-only) */
import { createHash } from "crypto";
import fs from "fs";

const LEDGER = "/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl";
const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; h: string; ref?: string } & Record<string, unknown>;
const lines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);
const P: (T | null)[] = lines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });

function walkFrom(from: number, to: number, anchor: string) {
  let prev = anchor, ok = 0, failAt = -1;
  for (let i = from; i < to; i++) {
    const t = P[i]; if (!t) { failAt = i; break; }
    const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev })) !== h) { failAt = i; break; }
    prev = h; ok++;
  }
  return { ok, failAt, tail: prev };
}
// base validity: lines 0..8 from GENESIS
console.log(`base 0..8 from GENESIS:`, JSON.stringify(walkFrom(0, 9, "GENESIS")));
console.log(`line 9:`, JSON.stringify({ seq: P[9]!.seq, ts: new Date(P[9]!.ts).toISOString(), kind: P[9]!.kind, h: P[9]!.h.slice(0, 10) }));
// A-rest internal: 9..4678 chained from line9's own h
console.log(`A-rest 9..4678 internal from line9.h:`, JSON.stringify(walkFrom(9, 4679, P[9]!.h)));
// B internal: 4680..4765
console.log(`B 4680..4765 internal from line4680.h:`, JSON.stringify(walkFrom(4680, 4766, P[4680]!.h)));
// D internal: 5669..EOF
console.log(`D 5669..EOF internal from line5669.h:`, JSON.stringify(walkFrom(5669, lines.length, P[5669]!.h)));
// C->D direct: does D chain from C tail if we re-anchor at C-tail? (already known no) — measure gap
console.log(`C tail seq=${P[5667]!.seq} ts=${new Date(P[5667]!.ts).toISOString()} · D first seq=${P[5669]!.seq} ts=${new Date(P[5669]!.ts).toISOString()} · seq-gap=${P[5669]!.seq - P[5667]!.seq - 1}`);

// duplicate refs INSIDE A (palimpsest check)
const refCount = new Map<string, number>();
for (let i = 0; i < 4679; i++) { const t = P[i]; if (t?.ref) refCount.set(t.ref, (refCount.get(t.ref) ?? 0) + 1); }
let dupRefs = 0, dupLines = 0;
for (const [r, c] of refCount) if (c > 1) { dupRefs++; dupLines += c; }
console.log(`A-segment duplicate refs: ${dupRefs} refs appearing >1x (${dupLines} lines involved, of ${refCount.size} unique refs)`);
// exact duplicate h inside A?
const hCount = new Map<string, number>();
for (let i = 0; i < 4679; i++) { const t = P[i]; if (t) hCount.set(t.h, (hCount.get(t.h) ?? 0) + 1); }
let dupH = 0; for (const c of hCount.values()) if (c > 1) dupH += c - 1;
console.log(`A-segment duplicate h values: ${dupH}`);
// sample duplicated refs
let shown = 0;
for (const [r, c] of refCount) if (c > 1 && shown < 5) { console.log(`  dup-ref sample: ${r} x${c}`); shown++; }
