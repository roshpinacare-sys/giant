/* walk2-79b.ts — per-version internal chain walks: how far does each archived version chain verbatim? */
import { createHash } from "crypto";
import fs from "fs";

const VDIR = "/home/z/my-project/.task-79b/versions";
const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; h: string } & Record<string, unknown>;

const files = fs.readdirSync(VDIR).filter((f) => f.endsWith(".jsonl")).sort();
for (const f of files) {
  const lines = fs.readFileSync(`${VDIR}/${f}`, "utf8").split("\n").filter(Boolean);
  const P: (T | null)[] = lines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });
  // walk from GENESIS as far as possible
  let prev = "GENESIS", ok = 0, failAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = P[i];
    if (!t) { failAt = i; break; }
    const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev })) !== h) { failAt = i; break; }
    prev = h; ok++;
  }
  // maxSeq overall
  let maxSeq = 0, nTxs = 0;
  for (const t of P) if (t) { if (t.seq > maxSeq) maxSeq = t.seq; nTxs++; }
  // tail seq
  let lastT = null; for (let i = P.length - 1; i >= 0; i--) if (P[i]) { lastT = P[i]; break; }
  console.log(`${f.replace(".jsonl", "")}: txs=${nTxs} maxSeq=${maxSeq} · walk-from-GENESIS: ${ok} ok, failAt=${failAt} (tail-h=${prev.slice(0, 8)})`);
}
// also the LIVE file right now
const cur = fs.readFileSync("/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl", "utf8").split("\n").filter(Boolean);
const CP: (T | null)[] = cur.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });
let prev = "GENESIS", ok = 0, failAt = -1;
for (let i = 0; i < cur.length; i++) {
  const t = CP[i]; if (!t) { failAt = i; break; }
  const { h, ...rest } = t;
  if (H(JSON.stringify({ ...rest, prev })) !== h) { failAt = i; break; }
  prev = h; ok++;
}
console.log(`LIVE-FILE(now): lines=${cur.length} · walk: ${ok} ok, failAt=${failAt}, tail-h=${prev.slice(0, 8)}`);
