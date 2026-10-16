/* diag2-79b.ts — segment-level diagnosis of the conflicted ledger (read-only) */
import { createHash } from "crypto";
import fs from "fs";

const LEDGER = "/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl";
const SNAP = "/home/z/my-project/mini-services/fleet-economy/state/snapshot.json";
const H = (body: string) => createHash("sha256").update(body).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; from: string; to: string; asset: string; amount: number; reason: string; ref?: string; h: string } & Record<string, unknown>;

const raw = fs.readFileSync(LEDGER, "utf8");
const lines = raw.split("\n").filter(Boolean);
console.log(`total lines: ${lines.length}`);

// segment boundaries: marker lines
const markers: { i: number; text: string }[] = [];
lines.forEach((l, i) => { if (l.startsWith("<<<<<<<") || l.startsWith("=======") || l.startsWith(">>>>>>>")) markers.push({ i, text: l.slice(0, 40) }); });
console.log("markers:", JSON.stringify(markers));

// build segments of parseable tx lines
const segs: { name: string; from: number; to: number }[] = [];
let cur = 0;
for (const m of markers) { if (m.i > cur) segs.push({ name: `seg${segs.length}`, from: cur, to: m.i }); cur = m.i + 1; }
if (cur < lines.length) segs.push({ name: `seg${segs.length}`, from: cur, to: lines.length });
// name them
const names = ["A:shared-prefix", "B:upstream-side", "C:stashed-side", "D:post-pop-appends"];
segs.forEach((s, idx) => (s.name = names[idx] ?? `seg${idx}`));

// parse each segment
const parsed: (T | null)[] = lines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });

// chain-walk a segment given entry anchor
function walk(from: number, to: number, anchor: string): { okCount: number; failAt: number; lastH: string } {
  let prev = anchor, ok = 0, failAt = -1, lastH = anchor;
  for (let i = from; i < to; i++) {
    const t = parsed[i]; if (!t) { failAt = i; break; }
    const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev })) !== h) { failAt = i; break; }
    prev = h; lastH = h; ok++;
  }
  return { okCount: ok, failAt, lastH: prev };
}

// seg A from GENESIS
const A = segs[0];
const wA = walk(A.from, A.to, "GENESIS");
const hA = parsed[A.to - 1]!.h;
console.log(`\n[A ${A.name}] lines ${A.from}..${A.to - 1} (${A.to - A.from}) · walk from GENESIS: ${wA.okCount} ok, failAt=${wA.failAt} · tail h=${hA}`);

function segInfo(idx: number) {
  const s = segs[idx]; if (!s) return;
  let seqMin = Infinity, seqMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  const refs = new Set<string>(); const byKind: Record<string, number> = {};
  let bad = 0;
  for (let i = s.from; i < s.to; i++) {
    const t = parsed[i]; if (!t) { bad++; continue; }
    seqMin = Math.min(seqMin, t.seq); seqMax = Math.max(seqMax, t.seq);
    tMin = Math.min(tMin, t.ts); tMax = Math.max(tMax, t.ts);
    byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
    if (t.ref) refs.add(t.ref);
  }
  console.log(`[${s.name}] lines ${s.from}..${s.to - 1} (${s.to - s.from}, unparsable=${bad}) · seq ${seqMin}..${seqMax} · ${new Date(tMin).toISOString()} → ${new Date(tMax).toISOString()} · byKind=${JSON.stringify(byKind)} · uniqueRefs=${refs.size}`);
  return refs;
}
const refsA = segInfo(0);
const refsB = segInfo(1);
const refsC = segInfo(2);
const refsD = segInfo(3);

// does B chain from A's tail? does C chain from A's tail? does D chain from C's tail?
if (segs[1]) {
  const wB = walk(segs[1].from, segs[1].to, hA);
  console.log(`\n[B] walk from A-tail(${hA.slice(0, 8)}): ${wB.okCount}/${segs[1].to - segs[1].from} ok · failAt=${wB.failAt}`);
  const hB = parsed[segs[1].to - 1]!.h;
  if (segs[2]) {
    const wC = walk(segs[2].from, segs[2].to, hA);
    console.log(`[C] walk from A-tail: ${wC.okCount}/${segs[2].to - segs[2].from} ok · failAt=${wC.failAt}`);
    const hC = parsed[segs[2].to - 1]!.h;
    if (segs[3]) {
      const wD = walk(segs[3].from, segs[3].to, hC);
      console.log(`[D] walk from C-tail(${hC.slice(0, 8)}): ${wD.okCount}/${segs[3].to - segs[3].from} ok · failAt=${wD.failAt}`);
      const wD2 = walk(segs[3].from, segs[3].to, hB);
      console.log(`[D] walk from B-tail(${hB.slice(0, 8)}): ${wD2.okCount}/${segs[3].to - segs[3].from} ok`);
    }
  }
}

// ref overlap between B and C (duplicate events?)
if (refsB && refsC) {
  let ov = 0; for (const r of refsB) if (refsC.has(r)) ov++;
  console.log(`\nref overlap B∩C: ${ov} (B=${refsB.size}, C=${refsC.size})`);
}
// ref overlap B vs A and B vs D
if (refsB && refsA) { let ov = 0; for (const r of refsB) if (refsA.has(r)) ov++; console.log(`ref overlap B∩A: ${ov}`); }
if (refsB && refsD) { let ov = 0; for (const r of refsB) if (refsD.has(r)) ov++; console.log(`ref overlap B∩D: ${ov}`); }

// duplicate check: are B lines verbatim copies of lines inside C? (same h)
const hsetC = new Set<string>(); for (let i = segs[2].from; i < segs[2].to; i++) { const t = parsed[i]; if (t) hsetC.add(t.h); }
let dupH = 0; for (let i = segs[1].from; i < segs[1].to; i++) { const t = parsed[i]; if (t && hsetC.has(t.h)) dupH++; }
console.log(`B lines whose h exists in C: ${dupH}/${segs[1].to - segs[1].from}`);
const hsetA = new Set<string>(); for (let i = segs[0].from; i < segs[0].to; i++) { const t = parsed[i]; if (t) hsetA.add(t.h); }
let dupHA = 0; for (let i = segs[1].from; i < segs[1].to; i++) { const t = parsed[i]; if (t && hsetA.has(t.h)) dupHA++; }
console.log(`B lines whose h exists in A: ${dupHA}/${segs[1].to - segs[1].from}`);

// snapshot vs file tail
const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const lastLine = parsed[lines.length - 1];
console.log(`\nsnapshot: seq=${snap.seq} lastH=${snap.lastH} savedAt=${new Date(snap.savedAt).toISOString()}`);
console.log(`file last line: seq=${lastLine?.seq} h=${lastLine?.h} ts=${lastLine ? new Date(lastLine.ts).toISOString() : "-"} kind=${lastLine?.kind}`);
console.log(`snapshot.seq === lastLine.seq? ${snap.seq === lastLine?.seq} · snapshot.lastH === lastLine.h? ${snap.lastH === lastLine?.h}`);

// eyeball boundary lines
const show = (i: number) => { const t = parsed[i]; return t ? `line ${i} seq=${t.seq} ${new Date(t.ts).toISOString()} ${t.kind} ${t.from}→${t.to} ${t.asset} ${t.amount} ref=${t.ref ?? "-"} h=${t.h.slice(0, 10)}` : `line ${i}: ${lines[i].slice(0, 60)}`; };
console.log("\n--- boundaries ---");
for (const s of segs) { console.log(`> ${s.name} first:`); console.log("  " + show(s.from)); console.log(`${s.name} last:`); console.log("  " + show(s.to - 1)); }
