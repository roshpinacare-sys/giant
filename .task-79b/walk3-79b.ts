/* walk3-79b.ts — full per-version segmentation: find the longest genesis-rooted run in each version */
import { createHash } from "crypto";
import fs from "fs";

const VDIR = "/home/z/my-project/.task-79b/versions";
const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; h: string } & Record<string, unknown>;

function segments(lines: string[], P: (T | null)[]) {
  const segs: { from: number; to: number; anchor: string }[] = [];
  const hset = new Set<string>(["GENESIS"]);
  for (const t of P) if (t) hset.add(t.h);
  let i = 0;
  while (i < lines.length) {
    if (!P[i]) { i++; continue; }
    const t = P[i]!; const { h, ...rest } = t;
    let anchor = "FOREIGN";
    if (H(JSON.stringify({ ...rest, prev: "GENESIS" })) === h) anchor = "GENESIS";
    else { for (const c of hset) { if (H(JSON.stringify({ ...rest, prev: c })) === h) { anchor = c; break; } } }
    let prev = h, j = i + 1;
    while (j < lines.length) {
      const t2 = P[j]; if (!t2) break;
      const { h: h2, ...rest2 } = t2;
      if (H(JSON.stringify({ ...rest2, prev })) !== h2) break;
      prev = h2; j++;
    }
    segs.push({ from: i, to: j, anchor });
    i = j;
  }
  return segs;
}

const files = fs.readdirSync(VDIR).filter((f) => f.endsWith(".jsonl")).sort();
let best = { file: "", len: 0, from: -1, to: -1, seqMax: 0, genesisTs: "" };
for (const f of files) {
  const lines = fs.readFileSync(`${VDIR}/${f}`, "utf8").split("\n").filter(Boolean);
  const P: (T | null)[] = lines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });
  const segs = segments(lines, P);
  // longest run
  let longest = segs[0];
  for (const s of segs) if (s.to - s.from > longest.to - longest.from) longest = s;
  const fT = P[longest.from]!, lT = P[longest.to - 1]!;
  const genesisTs = longest.anchor === "GENESIS" ? new Date(fT.ts).toISOString().slice(11, 19) : "-";
  console.log(`${f.replace(".jsonl", "")}: segs=${segs.length} · longest lines ${longest.from}..${longest.to - 1} (${longest.to - longest.from}) seq ${fT.seq}..${lT.seq} anchor=${longest.anchor.slice(0, 8)} genesisTs=${genesisTs} · tailTs=${new Date(lT.ts).toISOString().slice(11, 19)}`);
  if (longest.to - longest.from > best.len || (longest.to - longest.from === best.len && lT.seq > best.seqMax)) {
    best = { file: f, len: longest.to - longest.from, from: longest.from, to: longest.to, seqMax: lT.seq, genesisTs };
  }
}
console.log(`\nBEST verbatim run: ${best.file} lines ${best.from}..${best.to - 1} (${best.len} entries) seq 1..${best.seqMax} genesisTs=${best.genesisTs}`);
