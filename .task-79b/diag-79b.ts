/* diag-79b.ts — אבחון-מדוד של שבר-השרשרת · אותה-נוסחה בדיוק כמו verifyChain ב-index.ts
 * h_i = sha256(JSON.stringify({...rest_i, prev: h_{i-1}})).slice(0,32), h_0 anchor = "GENESIS"
 * קריאה-בלבד — אפס-כתיבה. */
import { createHash } from "crypto";
import fs from "fs";

const LEDGER = "/home/z/my-project/mini-services/fleet-economy/state/ledger.jsonl";
const H = (body: string) => createHash("sha256").update(body).digest("hex").slice(0, 32);

const lines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);
console.log(`total lines: ${lines.length}`);

type T = { seq: number; ts: number; kind: string; from: string; to: string; asset: string; amount: number; reason: string; ref?: string; h: string } & Record<string, unknown>;

// ── pass 1: walk the chain, find first break ────────────────────────────────
let prev = "GENESIS";
let firstBreak = -1; // line index of first broken entry
const storedH: string[] = [];
for (let i = 0; i < lines.length; i++) {
  let t: T;
  try { t = JSON.parse(lines[i]) as T; } catch (e) { console.log(`PARSE-FAIL at line ${i}: ${e}`); firstBreak = i; break; }
  const { h, ...rest } = t;
  const body = JSON.stringify({ ...rest, prev });
  if (H(body) !== h) { firstBreak = i; storedH.push(h); break; }
  prev = h; storedH.push(h);
}
if (firstBreak === -1) { console.log("CHAIN OK — no break found"); process.exit(0); }

const bt = JSON.parse(lines[firstBreak]) as T;
console.log(`\nFIRST BREAK: line index ${firstBreak} (0-based), seq=${bt.seq}, ts=${new Date(bt.ts).toISOString()}, kind=${bt.kind}, ref=${bt.ref ?? "-"}`);
console.log(`valid entries BEFORE break: ${firstBreak}`);
console.log(`entries AFTER break (incl. broken one): ${lines.length - firstBreak}`);
console.log(`prev used by verifier at break: ${prev}`);
if (firstBreak > 0) console.log(`last valid h (line ${firstBreak - 1}): ${storedH[firstBreak - 1]}`);

// ── pass 2: what anchor does the seam line actually use? brute-force over all h in file + GENESIS ──
const allH = new Set<string>(["GENESIS"]);
for (const l of lines) { try { allH.add((JSON.parse(l) as T).h); } catch { /* כנה */ } }
let anchorFound: string | null = null;
for (const cand of allH) {
  const { h, ...rest } = JSON.parse(lines[firstBreak]) as T;
  if (H(JSON.stringify({ ...rest, prev: cand })) === h) { anchorFound = cand; break; }
}
console.log(`\nSEAM ANCHOR: ${anchorFound ?? "NOT FOUND in file (foreign anchor)"}`);

// ── pass 3: is the post-break segment a continuous valid sub-chain (from the seam line onward)? ──
// chaining check: line k+1 hashed with prev = stored h of line k
let subPrev = (JSON.parse(lines[firstBreak]) as T).h;
let subValid = 0, subBroken = -1;
for (let k = firstBreak + 1; k < lines.length; k++) {
  const t = JSON.parse(lines[k]) as T;
  const { h, ...rest } = t;
  if (H(JSON.stringify({ ...rest, prev: subPrev })) !== h) { subBroken = k; break; }
  subPrev = h; subValid++;
}
console.log(`post-break sub-chain: ${subValid}/${lines.length - firstBreak - 1} entries chain continuously after seam${subBroken >= 0 ? ` · SECOND break at line ${subBroken} seq=${(JSON.parse(lines[subBroken]) as T).seq}` : " · single continuous sub-chain ✓"}`);

// if the seam anchor is GENESIS → post-break is a complete genesis-rooted chain
if (anchorFound === "GENESIS") {
  let p2 = "GENESIS"; let ok2 = 0;
  for (let k = firstBreak; k < lines.length; k++) {
    const t = JSON.parse(lines[k]) as T; const { h, ...rest } = t;
    if (H(JSON.stringify({ ...rest, prev: p2 })) !== h) break;
    p2 = h; ok2++;
  }
  console.log(`GENESIS-rooted replay of post-break segment: ${ok2}/${lines.length - firstBreak} valid → ${ok2 === lines.length - firstBreak ? "FULL VALID CHAIN FROM GENESIS ✓" : "partial"}`);
}

// ── pass 4: segment stats ───────────────────────────────────────────────────
function segStats(name: string, from: number, to: number) {
  const byKind: Record<string, number> = {};
  let first = Infinity, last = -Infinity; const refs = new Set<string>();
  let seqMin = Infinity, seqMax = -Infinity;
  for (let i = from; i < to; i++) {
    const t = JSON.parse(lines[i]) as T;
    byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
    first = Math.min(first, t.ts); last = Math.max(last, t.ts);
    seqMin = Math.min(seqMin, t.seq); seqMax = Math.max(seqMax, t.seq);
    if (t.ref) refs.add(t.ref);
  }
  console.log(`\n[${name}] entries=${to - from} · seq ${seqMin}..${seqMax} · ${new Date(first).toISOString()} → ${new Date(last).toISOString()} · byKind=${JSON.stringify(byKind)}`);
  return refs;
}
const preRefs = segStats("PRE-BREAK", 0, firstBreak);
const postRefs = segStats("POST-BREAK", firstBreak, lines.length);
let overlap = 0; for (const r of postRefs) if (preRefs.has(r)) overlap++;
console.log(`\nref overlap pre∩post: ${overlap} (pre unique=${preRefs.size}, post unique=${postRefs.size})`);

// first/last lines of each side for eyeballing
const show = (i: number) => { const t = JSON.parse(lines[i]) as T; return `line ${i} seq=${t.seq} ${new Date(t.ts).toISOString()} ${t.kind} ${t.from}→${t.to} ${t.asset} ${t.amount} ref=${t.ref ?? "-"} h=${t.h}`; };
console.log("\n--- pre-break head ---"); for (let i = 0; i < Math.min(3, firstBreak); i++) console.log(show(i));
console.log("--- pre-break tail ---"); for (let i = Math.max(0, firstBreak - 3); i < firstBreak; i++) console.log(show(i));
console.log("--- post-break head ---"); for (let i = firstBreak; i < Math.min(firstBreak + 5, lines.length); i++) console.log(show(i));
console.log("--- file tail ---"); for (let i = Math.max(firstBreak + 1, lines.length - 3); i < lines.length; i++) console.log(show(i));
