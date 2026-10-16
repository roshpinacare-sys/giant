/* walk-79b.ts — reconstruct the true live lineage by hash-chain walking across all archived versions.
 * Read-only. Target: the engine's in-memory lastH (from /health). Every hop is hash-verified — zero fabrication. */
import { createHash } from "crypto";
import fs from "fs";
import { execFileSync } from "child_process";

const LEDGER = "/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl";
const VDIR = "/home/z/my-project/.task-79b/versions";
const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; h: string; ref?: string } & Record<string, unknown>;

// ── load current file ──
const curLines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);

// ── load all versions ──
const versions: { name: string; lines: string[] }[] = [{ name: "LIVE-FILE", lines: curLines }];
for (const f of fs.readdirSync(VDIR).filter((f) => f.endsWith(".jsonl"))) {
  versions.push({ name: f.replace(".jsonl", ""), lines: fs.readFileSync(`${VDIR}/${f}`, "utf8").split("\n").filter(Boolean) });
}

// ── global index: h → { line, versions, parsed } (dedup identical lines) ──
const byH = new Map<string, { raw: string; t: T; prov: Set<string> }>();
let dupLines = 0, markerLines = 0, badLines = 0;
for (const v of versions) {
  for (const l of v.lines) {
    if (l.startsWith("<<<<<<<") || l.startsWith("=======") || l.startsWith(">>>>>>>")) { markerLines++; continue; }
    let t: T;
    try { t = JSON.parse(l) as T; } catch { badLines++; continue; }
    const e = byH.get(t.h);
    if (e) { if (e.raw === l) { e.prov.add(v.name); dupLines++; } /* same h different body → hash collision, ignore */ continue; }
    byH.set(t.h, { raw: l, t, prov: new Set([v.name]) });
  }
}
console.log(`versions: ${versions.length} · unique tx lines indexed: ${byH.size} · dup-lines across versions: ${dupLines} · git-markers: ${markerLines} · bad: ${badLines}`);

// successors map: for each indexed entry, compute which indexed h it chains FROM is implicit — we walk by trying candidates.
// For speed: precompute body-without-h → we test candidates on the fly: given prev, a candidate t chains iff H(JSON({...rest(t), prev})) === t.h
const restCache = new Map<string, Record<string, unknown>>();
function restOf(t: T): Record<string, unknown> {
  let r = restCache.get(t.h);
  if (!r) { const { h, ...rest } = t; r = rest; restCache.set(t.h, r); }
  return r;
}
// index candidates by (seq) to prune: successor of seq S has seq S+1 in well-formed chains, but forks/renumbering… index by seq+1
const byNextSeq = new Map<number, T[]>();
for (const { t } of byH.values()) {
  const k = t.seq + 1;
  if (!byNextSeq.has(k)) byNextSeq.set(k, []);
  byNextSeq.get(k)!.push(t);
}

// ── find genesis-rooted roots among indexed entries ──
const roots: T[] = [];
for (const { t } of byH.values()) {
  if (H(JSON.stringify({ ...restOf(t), prev: "GENESIS" })) === t.h) roots.push(t);
}
console.log(`genesis-rooted roots: ${roots.map((r) => `seq${r.seq}@${new Date(r.ts).toISOString().slice(11, 19)}`).join(", ")}`);

// ── target: live engine memory head ──
const health = JSON.parse(execFileSync("curl", ["-m", "5", "-s", "http://127.0.0.1:3016/health"]).toString());
const targetH: string = health.lastH;
const targetSeq: number = health.seq;
console.log(`target: engine seq=${targetSeq} lastH=${targetH}`);

// ── DFS from each root, prefer continuations that reach targetH ──
function walk(root: T): { path: T[]; complete: boolean } {
  const path: T[] = [root];
  const used = new Set<string>([root.h]);
  let complete = root.h === targetH;
  let prev = root.h;
  while (!complete) {
    // candidates: indexed entries whose hash chains from prev
    let next: T | null = null;
    const cands: T[] = [];
    // prune by seq: well-formed successor has seq = last.seq+1, but allow scan of ±3 in case of renumbering oddities
    const lastSeq = path[path.length - 1].seq;
    for (let s = lastSeq; s <= lastSeq + 2; s++) {
      for (const c of byNextSeq.get(s) ?? []) {
        if (used.has(c.h)) continue;
        if (H(JSON.stringify({ ...restOf(c), prev })) === c.h) cands.push(c);
      }
    }
    if (cands.length === 0) break; // gap
    // prefer the candidate that itself has successors deep toward target (1-step lookahead), else first
    next = cands.find((c) => c.h === targetH) ?? cands[0];
    path.push(next); used.add(next.h); prev = next.h;
    if (next.h === targetH) { complete = true; break; }
    if (path.length > 20000) break; // safety
  }
  return { path, complete };
}

let best: { path: T[]; complete: boolean; root: T } | null = null;
for (const r of roots) {
  const w = walk(r);
  console.log(`root seq${r.seq}@${new Date(r.ts).toISOString().slice(11, 19)} → path ${w.path.length} entries, tail seq ${w.path[w.path.length - 1].seq}, complete=${w.complete}`);
  if (!best || w.path.length > best.path.length || (w.complete && !best.complete)) best = { ...w, root: r };
  if (w.complete) break;
}
if (!best) { console.log("NO WALK POSSIBLE"); process.exit(1); }

const { path } = best;
// provenance + coverage stats
const provCount = new Map<string, number>();
for (const t of path) for (const p of byH.get(t.h)!.prov) provCount.set(p, (provCount.get(p) ?? 0) + 1);
console.log(`\nBEST WALK: ${path.length} entries · seq ${path[0].seq}..${path[path.length - 1].seq} · complete-to-live-head=${best.complete}`);
console.log(`provenance (entries contributed per version, top 12):`);
[...provCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([p, c]) => console.log(`  ${p}: ${c}`));

// gaps: seq jumps within the path
const gaps: { after: number; before: number; n: number }[] = [];
for (let i = 1; i < path.length; i++) {
  const d = path[i].seq - path[i - 1].seq;
  if (d !== 1) gaps.push({ after: path[i - 1].seq, before: path[i].seq, n: d - 1 });
}
console.log(`seq gaps in reconstruction: ${gaps.length === 0 ? "NONE — fully continuous ✓" : JSON.stringify(gaps)}`);

// ts monotonicity
let tsBroken = 0;
for (let i = 1; i < path.length; i++) if (path[i].ts < path[i - 1].ts) tsBroken++;
console.log(`ts regressions inside path: ${tsBroken}`);

// byKind of reconstruction vs engine metrics
const byKind: Record<string, number> = {};
for (const t of path) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
const metrics = JSON.parse(execFileSync("curl", ["-m", "5", "-s", "http://127.0.0.1:3016/metrics"]).toString());
console.log(`\nreconstructed byKind: ${JSON.stringify(byKind)}`);
console.log(`engine byKind:        ${JSON.stringify(metrics.byKind)}`);
const kinds = new Set([...Object.keys(byKind), ...Object.keys(metrics.byKind)]);
let match = true;
for (const k of kinds) if ((byKind[k] ?? 0) !== (metrics.byKind[k] ?? 0)) { match = false; console.log(`  MISMATCH ${k}: recon ${byKind[k] ?? 0} vs engine ${metrics.byKind[k] ?? 0}`); }
console.log(`byKind match: ${match}`);

// entries in index NOT in the best path (orphans: α, B, and any others)
const pathHs = new Set(path.map((t) => t.h));
const orphans = [...byH.values()].filter((e) => !pathHs.has(e.h));
console.log(`\norphan indexed entries (real, outside live lineage): ${orphans.length}`);
const orphByKind: Record<string, number> = {}; let orphTMin = Infinity, orphTMax = -Infinity;
for (const o of orphans) { orphByKind[o.t.kind] = (orphByKind[o.t.kind] ?? 0) + 1; orphTMin = Math.min(orphTMin, o.t.ts); orphTMax = Math.max(orphTMax, o.t.ts); }
console.log(`orphan byKind: ${JSON.stringify(orphByKind)} · ${new Date(orphTMin).toISOString()} → ${new Date(orphTMax).toISOString()}`);

// persist the reconstruction for the repair step
fs.writeFileSync("/home/z/my-project/.task-79b/walk-result.json", JSON.stringify({ complete: best.complete, rootSeq: path[0].seq, tailSeq: path[path.length - 1].seq, tailH: path[path.length - 1].h, count: path.length, gaps, targetH, targetSeq, lines: path.map((t) => byH.get(t.h)!.raw) }));
console.log(`\nwalk-result.json written (${path.length} lines)`);
