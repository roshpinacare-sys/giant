/* walk4-79b.ts — add quarantine ledgers to the index; search for β-continuation beyond seq 2705 */
import { createHash } from "crypto";
import fs from "fs";
import { execFileSync } from "child_process";

const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; h: string; ref?: string } & Record<string, unknown>;

const sources: { name: string; lines: string[] }[] = [];
const qdir = "/home/z/my-project/mini-services/fleet-economy/state/quarantine";
for (const f of fs.readdirSync(qdir)) {
  if (f.includes("ledger.jsonl")) {
    sources.push({ name: `Q:${f.slice(0, 24)}`, lines: fs.readFileSync(`${qdir}/${f}`, "utf8").split("\n").filter(Boolean) });
  }
}
for (const f of fs.readdirSync("/home/z/my-project/.task-79b/versions").filter((f) => f.endsWith(".jsonl"))) {
  sources.push({ name: f.replace(".jsonl", ""), lines: fs.readFileSync(`/home/z/my-project/.task-79b/versions/${f}`, "utf8").split("\n").filter(Boolean) });
}
sources.push({ name: "LIVE", lines: fs.readFileSync("/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl", "utf8").split("\n").filter(Boolean) });

// index
const byH = new Map<string, { raw: string; t: T; prov: Set<string> }>();
for (const v of sources) for (const l of v.lines) {
  if (l.startsWith("<") || l.startsWith("=") || l.startsWith(">")) continue;
  let t: T; try { t = JSON.parse(l) as T; } catch { continue; }
  const e = byH.get(t.h);
  if (e) { e.prov.add(v.name); continue; }
  byH.set(t.h, { raw: l, t, prov: new Set([v.name]) });
}
console.log(`sources: ${sources.length} · unique indexed: ${byH.size}`);

// h of seq 2705 entry (the core tail) — find it
let h2705: string | null = null;
for (const { t } of byH.values()) if (t.seq === 2705 && byH.get(t.h)!.prov.size > 5) { h2705 = t.h; break; }
console.log(`h(2705) = ${h2705}`);

// successors of h(2705) anywhere in the index
if (h2705) {
  let found = 0;
  for (const { t, raw } of byH.values()) {
    const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev: h2705 })) === h) { found++; if (found <= 5) console.log(`SUCCESSOR of 2705: seq=${t.seq} ts=${new Date(t.ts).toISOString()} kind=${t.kind} h=${t.h} prov=${[...byH.get(t.h)!.prov].join(",")}`); }
  }
  console.log(`total successors of h(2705) in ${byH.size} indexed entries: ${found}`);
}

// quarantine files: maxSeq, structure
for (const v of sources.filter((s) => s.name.startsWith("Q:"))) {
  let maxSeq = 0, n = 0, genesisAt = -1;
  const P: (T | null)[] = v.lines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });
  P.forEach((t, i) => { if (t) { n++; if (t.seq > maxSeq) maxSeq = t.seq; } });
  // is line 0 genesis rooted?
  if (P[0]) { const { h, ...rest } = P[0]; if (H(JSON.stringify({ ...rest, prev: "GENESIS" })) === h) genesisAt = 0; }
  // walk from genesis
  let prev = "GENESIS", ok = 0, failAt = -1;
  for (let i = 0; i < v.lines.length; i++) {
    const t = P[i]; if (!t) { failAt = i; break; }
    const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev })) !== h) { failAt = i; break; }
    prev = h; ok++;
  }
  console.log(`${v.name}: txs=${n} maxSeq=${maxSeq} genesisRooted@0=${genesisAt === 0} · walk=${ok} failAt=${failAt}`);
}

// by-seq body availability in the lost ranges: 2706..2833, 2843, 3359..3360, 3833..3945, 5798..5813, 6295..6643, 6782..7946
const lostRanges: [number, number][] = [[2706, 2833], [2843, 2843], [3359, 3360], [3833, 3945], [5798, 5813], [6295, 6643], [6782, 7946]];
const bySeq = new Map<number, Set<string>>(); // seq → set of distinct body-signatures (ts|kind|amount|ref)
for (const { t } of byH.values()) {
  const sig = `${t.ts}|${t.kind}|${t.from}|${t.to}|${t.asset}|${t.amount}|${t.ref ?? ""}`;
  if (!bySeq.has(t.seq)) bySeq.set(t.seq, new Set());
  bySeq.get(t.seq)!.add(sig);
}
for (const [a, b] of lostRanges) {
  let withBody = 0, multiSig = 0;
  for (let s = a; s <= b; s++) { const sigs = bySeq.get(s); if (sigs && sigs.size > 0) { withBody++; if (sigs.size > 1) multiSig++; } }
  console.log(`range ${a}..${b} (${b - a + 1}): bodies found for ${withBody} · ambiguous(multi-sig) ${multiSig}`);
}
