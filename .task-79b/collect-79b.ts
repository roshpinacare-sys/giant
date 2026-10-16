/* collect-79b.ts — gather every recoverable version of ledger.jsonl (commits + stashes) · read-only */
import fs from "fs";
import { execFileSync } from "child_process";

const P = "mini-services/fleet-economy/state/ledger.jsonl";
const REPO = "/home/z/my-project";
const outDir = "/home/z/my-project/.task-79b/versions";
fs.mkdirSync(outDir, { recursive: true });

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO, maxBuffer: 256 * 1024 * 1024 }).toString();
}

// 1. commits touching the ledger (all refs)
const revs = git(["log", "--all", "--format=%H %cI %s", "--", P]).trim().split("\n").filter(Boolean);
console.log(`commits touching ledger: ${revs.length}`);
const seen = new Map<string, { rev: string; ts: string; msg: string; maxSeq: number; lines: number }>();
let kept = 0;
for (const r of revs) {
  const [rev, ts] = r.split(" ");
  const msg = r.slice(rev.length + ts.length + 2, rev.length + ts.length + 62);
  try {
    const content = git(["show", `${rev}:${P}`]);
    const lines = content.split("\n").filter(Boolean);
    let maxSeq = 0;
    for (const l of lines) { try { const s = (JSON.parse(l) as any).seq; if (typeof s === "number" && s > maxSeq) maxSeq = s; } catch { /* markers */ } }
    // dedup identical content by line count + maxSeq + first-line hash
    const key = `${lines.length}:${maxSeq}:${(JSON.parse(lines[0]) as any).h ?? "-"}`;
    if (!seen.has(key)) {
      seen.set(key, { rev, ts, msg, maxSeq, lines: lines.length });
      fs.writeFileSync(`${outDir}/${rev.slice(0, 10)}.jsonl`, content);
      kept++;
    }
  } catch (e) { console.log(`  skip ${rev.slice(0, 8)}: ${(e as Error).message.slice(0, 60)}`); }
}
console.log(`unique committed versions kept: ${kept}`);

// 2. stashes
let stashN = 0;
try {
  const stashes = git(["stash", "list"]).trim().split("\n").filter(Boolean);
  for (let i = 0; i < stashes.length; i++) {
    try {
      const content = git(["show", `stash@{${i}}:${P}`]);
      const lines = content.split("\n").filter(Boolean);
      let maxSeq = 0;
      for (const l of lines) { try { const s = (JSON.parse(l) as any).seq; if (typeof s === "number" && s > maxSeq) maxSeq = s; } catch {} }
      const key = `stash${i}:${lines.length}:${maxSeq}`;
      if (!seen.has(key)) {
        seen.set(key, { rev: `stash@{${i}}`, ts: stashes[i].slice(0, 60), msg: stashes[i], maxSeq, lines: lines.length });
        fs.writeFileSync(`${outDir}/stash${i}.jsonl`, content);
        kept++;
        console.log(`stash@{${i}}: ${lines.length} lines · maxSeq ${maxSeq} · ${stashes[i].slice(0, 70)}`);
      }
    } catch { console.log(`stash@{${i}}: no ledger inside`); }
  }
} catch (e) { console.log(`no stashes: ${(e as Error).message.slice(0, 60)}`); }

// 3. summary table (by maxSeq desc)
const list = [...seen.values()].sort((a, b) => b.maxSeq - a.maxSeq);
console.log(`\ntop versions by maxSeq:`);
for (const v of list.slice(0, 25)) console.log(`  ${v.rev.slice(0, 10)} ${v.ts?.slice(0, 19) ?? ""} lines=${v.lines} maxSeq=${v.maxSeq} · ${v.msg}`);
fs.writeFileSync(`${outDir}/index.json`, JSON.stringify(list, null, 1));
