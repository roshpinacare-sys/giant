/* diag5-79b.ts — full dynamic segmentation of CURRENT file (read-only) */
import { createHash } from "crypto";
import fs from "fs";

const LEDGER = "/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl";
const SNAP = "/home/z/my-project/mini-services/fleet-economy/state/snapshot.json";
const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; h: string; ref?: string } & Record<string, unknown>;

const lines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);
const P: (T | null)[] = lines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });
console.log(`file lines: ${lines.length} · unparsable: ${P.filter((x) => x === null).length}`);
lines.forEach((l, i) => { if (l.startsWith("<<<<<<<") || l.startsWith("=======") || l.startsWith(">>>>>>>")) console.log(`  MARKER line ${i}: ${l.slice(0, 50)}`); });

// all h in file
const hset = new Set<string>(["GENESIS"]);
for (const t of P) if (t) hset.add(t.h);

// walk with re-anchoring: segments = maximal runs of valid chained entries
const segs: { from: number; to: number; anchor: string }[] = [];
let i = 0;
while (i < lines.length) {
  if (P[i] === null) { i++; continue; }
  // try anchors for segment start: GENESIS first, then any h in file (prefer the previous segment's tail)
  let start = i;
  const t = P[start]!;
  const { h, ...rest } = t;
  let anchor: string | null = null;
  if (H(JSON.stringify({ ...rest, prev: "GENESIS" })) === h) anchor = "GENESIS";
  else {
    // brute-force: any h in file
    for (const cand of hset) { if (H(JSON.stringify({ ...rest, prev: cand })) === h) { anchor = cand; break; } }
  }
  // walk forward from start
  let prev = h; let j = start + 1;
  while (j < lines.length) {
    const t2 = P[j]; if (!t2) break;
    const { h: h2, ...rest2 } = t2;
    if (H(JSON.stringify({ ...rest2, prev })) !== h2) break;
    prev = h2; j++;
  }
  segs.push({ from: start, to: j, anchor: anchor ?? "FOREIGN(invisible)" });
  i = j;
}
console.log(`\nsegments: ${segs.length}`);
const hToLine = new Map<string, number>();
P.forEach((t, idx) => { if (t) hToLine.set(t.h, idx); });
for (const s of segs) {
  const f = P[s.from]!, l = P[s.to - 1]!;
  let tMin = Infinity, tMax = -Infinity; const refs = new Set<string>(); const byKind: Record<string, number> = {};
  for (let k = s.from; k < s.to; k++) { const t = P[k]!; tMin = Math.min(tMin, t.ts); tMax = Math.max(tMax, t.ts); byKind[t.kind] = (byKind[t.kind] ?? 0) + 1; if (t.ref) refs.add(t.ref); }
  const anchorLine = hToLine.get(s.anchor);
  console.log(`seg lines ${s.from}..${s.to - 1} (${s.to - s.from}) · seq ${f.seq}..${l.seq} · ${new Date(tMin).toISOString()} → ${new Date(tMax).toISOString()} · anchor=${s.anchor === "GENESIS" ? "GENESIS" : s.anchor.slice(0, 8) + (anchorLine !== undefined ? ` (line ${anchorLine})` : " FOREIGN")}${s.anchor === "GENESIS" ? "" : ""} · refs=${refs.size} · byKind=${JSON.stringify(byKind)}`);
}

// ref overlap matrix between segments
const segRefs = segs.map((s) => { const r = new Set<string>(); for (let k = s.from; k < s.to; k++) { const t = P[k]!; if (t.ref) r.add(t.ref); } return r; });
for (let a = 0; a < segs.length; a++) for (let b = a + 1; b < segs.length; b++) {
  let ov = 0; for (const r of segRefs[b]) if (segRefs[a].has(r)) ov++;
  if (ov > 0 || (segRefs[a].size < 200 && segRefs[b].size < 200)) console.log(`ref-overlap seg${a}(${segRefs[a].size})∩seg${b}(${segRefs[b].size}) = ${ov}`);
}

// snapshot vs tail
const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const last = P[lines.length - 1];
console.log(`\nsnapshot: seq=${snap.seq} lastH=${snap.lastH} savedAt=${new Date(snap.savedAt).toISOString()} · treasury=${JSON.stringify(snap.balances.treasury)}`);
console.log(`file tail: seq=${last?.seq} h=${last?.h} · match=${snap.seq === last?.seq && snap.lastH === last?.h}`);
console.log(`engine health: seq/lastH per /health vs snapshot — check separately`);
