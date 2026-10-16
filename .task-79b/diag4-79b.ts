/* diag4-79b.js — final anchor questions (read-only) */
import { createHash } from "crypto";
import fs from "fs";

const LEDGER = "/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl";
const H = (b) => createHash("sha256").update(b).digest("hex").slice(0, 32);
const lines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);
const P = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });

const restOf = (t) => { const { h, ...rest } = t; return rest; };

// Q1: is line 9 GENESIS-rooted?
const t9 = P[9];
const h9 = H(JSON.stringify({ ...restOf(t9), prev: "GENESIS" }));
console.log(`line9 genesis-rooted? ${h9 === t9.h} (computed ${h9.slice(0, 10)} vs stored ${t9.h.slice(0, 10)}) · seq=${t9.seq} ts=${new Date(t9.ts).toISOString()}`);

// Q2 (fixed off-by-one): internal continuity of each segment, anchored at segment-first-line's own h, checking from the SECOND line
function walkInternal(from, to) {
  let prev = P[from].h, ok = 0, failAt = -1;
  for (let i = from + 1; i < to; i++) {
    const t = P[i]; if (!t) { failAt = i; break; }
    const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev })) !== h) { failAt = i; break; }
    prev = h; ok++;
  }
  return { ok, failAt, of: to - from - 1 };
}
console.log(`α 0..8 internal:`, JSON.stringify(walkInternal(0, 9)));
console.log(`β 9..4678 internal:`, JSON.stringify(walkInternal(9, 4679)));
console.log(`B 4680..4765 internal:`, JSON.stringify(walkInternal(4680, 4766)));
console.log(`C 4767..5667 internal:`, JSON.stringify(walkInternal(4767, 5668)));
console.log(`D 5669..EOF internal:`, JSON.stringify(walkInternal(5669, lines.length)), `(file lines now: ${lines.length}, last seq: ${P[lines.length - 1]?.seq})`);

// Q3: ref collisions α vs (β∪B∪C∪D)
const refsRest = new Set();
for (let i = 9; i < lines.length; i++) { const t = P[i]; if (t?.ref) refsRest.add(t.ref); }
let coll = 0;
for (let i = 0; i < 9; i++) { const t = P[i]; if (t?.ref && refsRest.has(t.ref)) { coll++; console.log(`  α ref collision: ${t.ref}`); } }
console.log(`α-vs-rest ref collisions: ${coll}`);

// Q4: β ∪ C refs vs B refs (already 0 via diag2, re-confirm on current file state) + D vs B/C
const refsD = new Set(); for (let i = 5669; i < lines.length; i++) { const t = P[i]; if (t?.ref) refsD.add(t.ref); }
const refsB = new Set(); for (let i = 4680; i < 4766; i++) { const t = P[i]; if (t?.ref) refsB.add(t.ref); }
let dOVb = 0; for (const r of refsD) if (refsB.has(r)) dOVb++;
console.log(`D∩B refs: ${dOVb} · D unique refs: ${refsD.size} · B unique refs: ${refsB.size}`);
