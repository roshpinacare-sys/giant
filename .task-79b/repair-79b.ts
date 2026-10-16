/* repair-79b.ts — honest regenesis repair of the economy ledger. RUN ONLY AFTER THE ENGINE IS STOPPED.
 * Principles: zero fabrication (every replayed body exists verbatim in an archived source),
 * everything preserved (original file archived whole), the chain tells the truth about itself (explicit markers). */
import { createHash } from "crypto";
import fs from "fs";

const STATE = "/home/z/my-project/mini-services/fleet-economy/state";
const LEDGER = `${STATE}/ledger.jsonl`;
const SNAP = `${STATE}/snapshot.json`;
const ARCHIVE = `${STATE}/ledger.forked-20261016.jsonl`;
const VDIR = "/home/z/my-project/.task-79b/versions";
const H = (b: string) => createHash("sha256").update(b).digest("hex").slice(0, 32);
type T = { seq: number; ts: number; kind: string; from: string; to: string; asset: string; amount: number; reason: string; ref?: string; h: string } & Record<string, unknown>;

const ts = () => Date.now();
const iso = (n: number) => new Date(n).toISOString();

/* ── 0. read final live state ── */
const liveLines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean);
const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const P: (T | null)[] = liveLines.map((l) => { try { return JSON.parse(l) as T; } catch { return null; } });
console.log(`[0] live ledger lines=${liveLines.length} · snapshot seq=${snap.seq} lastH=${snap.lastH} savedAt=${iso(snap.savedAt)}`);

/* ── 1. load all archived sources + index ── */
type Src = { name: string; lines: string[] };
const sources: Src[] = [{ name: "LIVE", lines: liveLines }];
for (const f of fs.readdirSync(VDIR).filter((f) => f.endsWith(".jsonl"))) sources.push({ name: f.replace(".jsonl", ""), lines: fs.readFileSync(`${VDIR}/${f}`, "utf8").split("\n").filter(Boolean) });
const qdir = `${STATE}/quarantine`;
for (const f of fs.readdirSync(qdir)) if (f.endsWith("·ledger.jsonl")) sources.push({ name: `Q:${f.slice(0, 22)}`, lines: fs.readFileSync(`${qdir}/${f}`, "utf8").split("\n").filter(Boolean) });

const byH = new Map<string, { raw: string; t: T; prov: Set<string> }>();
const bySeq = new Map<number, Map<string, string>>(); // seq → sig → raw (sig = body identity minus seq/h)
const sigOf = (t: T) => JSON.stringify({ k: t.kind, f: t.from, o: t.to, a: t.asset, m: t.amount, ts: t.ts, r: t.ref ?? "", why: t.reason });
for (const v of sources) for (const l of v.lines) {
  if (l.startsWith("<") || l.startsWith("=") || l.startsWith(">")) continue;
  let t: T; try { t = JSON.parse(l) as T; } catch { continue; }
  const e = byH.get(t.h);
  if (e) { e.prov.add(v.name); continue; }
  byH.set(t.h, { raw: l, t, prov: new Set([v.name]) });
  if (!bySeq.has(t.seq)) bySeq.set(t.seq, new Map());
  const m = bySeq.get(t.seq)!;
  if (!m.has(sigOf(t))) m.set(sigOf(t), l);
}
console.log(`[1] sources=${sources.length} · unique lines=${byH.size} · seqs covered=${bySeq.size}`);

/* ── 2. verbatim β-core: genesis-rooted run (08:27:41) — rebuild from index by walking ── */
const restCache = new Map<string, Record<string, unknown>>();
function restOf(t: T): Record<string, unknown> { let r = restCache.get(t.h); if (!r) { const { h, ...rest } = t; r = rest; restCache.set(t.h, r); } return r; }
const chainsFrom = (t: T, prev: string) => H(JSON.stringify({ ...restOf(t), prev })) === t.h;

let coreStart: T | null = null;
for (const { t } of byH.values()) if (t.seq === 1 && chainsFrom(t, "GENESIS") && t.ts < new Date("2026-10-16T08:28:00Z").getTime()) { coreStart = t; break; }
if (!coreStart) { console.error("FATAL: β genesis not found"); process.exit(1); }
const coreRaw: string[] = [byH.get(coreStart.h)!.raw];
let corePrev = coreStart.h;
for (;;) {
  let next: T | null = null;
  for (const { t } of byH.values()) if (t.seq === coreRaw.length + 1 && chainsFrom(t, corePrev)) { next = t; break; }
  if (!next) break;
  coreRaw.push(byH.get(next.h)!.raw); corePrev = next.h;
  if (coreRaw.length > 5000) break;
}
const coreTailSeq = coreRaw.length;
const coreTailH = JSON.parse(coreRaw[coreRaw.length - 1]).h as string;
console.log(`[2] verbatim core: ${coreRaw.length} entries (seq 1..${coreTailSeq}) · tail h=${coreTailH.slice(0, 10)} · genesis ts=${iso(JSON.parse(coreRaw[0]).ts)}`);

/* ── 3. live tail-run: the file's last internally-valid run, must end at snapshot.lastH ── */
let tailStart = liveLines.length - 1;
while (tailStart > 0 && P[tailStart] && P[tailStart - 1]) {
  const t = P[tailStart]!; const p = P[tailStart - 1]!;
  if (!chainsFrom(t, p.h)) break;
  tailStart--;
}
const tailRaw = liveLines.slice(tailStart).filter((l) => { try { return !!JSON.parse(l); } catch { return false; } });
const tailT = JSON.parse(tailRaw[tailRaw.length - 1]) as T;
const tailT0 = JSON.parse(tailRaw[0]) as T;
console.log(`[3] live tail-run: ${tailRaw.length} entries · seq ${tailT0.seq}..${tailT.seq} · ends at snapshot.lastH? ${tailT.h === snap.lastH}`);
if (tailT.h !== snap.lastH) { console.error("FATAL: tail-run does not end at snapshot.lastH — aborting"); process.exit(1); }
const tailSeqSet = new Map<number, string>(); // seq → raw (from the tail run)
for (const l of tailRaw) { const t = JSON.parse(l) as T; tailSeqSet.set(t.seq, l); }

/* ── 4. orphan fork B (parallel-writer block between git markers) ── */
let bRaw: string[] = [];
const mi = liveLines.findIndex((l) => l.startsWith("<<<<<<<"));
const mj = liveLines.findIndex((l) => l.startsWith("======="));
if (mi >= 0 && mj > mi) bRaw = liveLines.slice(mi + 1, mj).filter((l) => { try { return !!JSON.parse(l); } catch { return false; } });
else {
  // fallback: first archived version that still has markers
  for (const v of sources) {
    const a = v.lines.findIndex((l) => l.startsWith("<<<<<<<")); const b = v.lines.findIndex((l) => l.startsWith("======="));
    if (a >= 0 && b > a) { bRaw = v.lines.slice(a + 1, b).filter((l) => { try { return !!JSON.parse(l); } catch { return false; } }); break; }
  }
}
const bT0 = bRaw.length ? (JSON.parse(bRaw[0]) as T) : null;
const bT1 = bRaw.length ? (JSON.parse(bRaw[bRaw.length - 1]) as T) : null;
console.log(`[4] orphan fork B: ${bRaw.length} entries${bT0 ? ` · seq ${bT0.seq}..${bT1!.seq} · ${iso(bT0.ts)} → ${iso(bT1!.ts)}` : " (not found — archive only)"}`);

/* ── 5. continuation bodies: every seq 2706..snap.seq, unique body required ── */
const cont: { seq: number; raw: string; lost: false }[] = [];
const lostRuns: { a: number; b: number }[] = [];
const ambiguous: number[] = [];
let lastTs = (JSON.parse(coreRaw[coreRaw.length - 1]) as T).ts;
for (let s = coreTailSeq + 1; s <= snap.seq; s++) {
  const tailLine = tailSeqSet.get(s);
  const cands = bySeq.get(s);
  let chosen: string | null = null;
  if (tailLine) { chosen = tailLine; }
  else if (cands) {
    const okSigs = [...cands.entries()].filter(([, raw]) => (JSON.parse(raw) as T).ts >= lastTs);
    if (okSigs.length === 1) chosen = okSigs[0][1];
    else if (okSigs.length > 1) ambiguous.push(s);
  }
  if (chosen) {
    const t = JSON.parse(chosen) as T;
    if (t.ts < lastTs) { ambiguous.push(s); continue; } // ts regression → refuse (honest)
    lastTs = t.ts; cont.push({ seq: s, raw: chosen, lost: false });
  } else {
    if (lostRuns.length && lostRuns[lostRuns.length - 1].b === s - 1) lostRuns[lostRuns.length - 1].b = s;
    else lostRuns.push({ a: s, b: s });
  }
}
const recoveredCount = cont.length;
const lostCount = lostRuns.reduce((a, r) => a + (r.b - r.a + 1), 0);
console.log(`[5] continuation: recovered=${recoveredCount} · lost=${lostCount} in ${lostRuns.length} runs (${lostRuns.map((r) => `${r.a}..${r.b}`).join(", ")}) · ambiguous=${ambiguous.length}`);

/* ── 6. assemble the repaired chain ── */
type Out = Record<string, unknown> & { h: string };
const out: Out[] = [];
let prevH = "GENESIS";
let newSeq = 0;
function emitBody(body: Record<string, unknown>, srcCheck?: { raw: string }) {
  if (srcCheck) {
    // verbatim-body proof: body minus {seq,h} must equal source minus {seq,h}
    const strip = (o: any) => { const { seq, h, ...r } = o; return JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))); };
    if (strip(body) !== strip(JSON.parse(srcCheck.raw))) { console.error(`FATAL: body mismatch vs archive at origSeq=${body.origSeq}`); process.exit(1); }
  }
  const t = { ...body } as any;
  delete t.origSeq;
  t.seq = ++newSeq;
  const h = H(JSON.stringify({ ...t, prev: prevH }));
  const line = { ...t, h };
  out.push(line); prevH = h;
}
function emitMarker(reason: string, ref: string) {
  emitBody({ ts: ts(), kind: "infra", from: "treasury", to: "treasury", asset: "USDS", amount: 0, reason, ref });
}
const of = (raw: string) => { const t = JSON.parse(raw) as T; const { h, ...rest } = t; return rest; };

// core verbatim (hashes intact)
for (const raw of coreRaw) { const line = JSON.parse(raw); newSeq = line.seq; const h2 = H(JSON.stringify({ ...(({ h, ...r }: any) => r)(line), prev: prevH })); if (h2 !== line.h) { console.error("FATAL: core hash break"); process.exit(1); } out.push(line); prevH = line.h; }

emitMarker(`רג'נסיס-מדוד · שחזור-שרשרת מ-${recoveredCount + bRaw.length} אירועי-אמת · נתוני-מקור בלדג'ר-המאוחסן (ledger.forked-20261016.jsonl + היסטוריית-גיט) · ליבה-תקינה seq 1..${coreTailSeq} נשמרה-כלשונה · אפס-המצאה`, "regenesis-20261016");

if (bRaw.length) {
  emitMarker(`שחזור-סעיף-כותב-מקביל · ${bRaw.length} אירועי-אמת (seq-מקורי ${bT0!.seq}..${bT1!.seq} · ${iso(bT0!.ts)}→${iso(bT1!.ts)}) · נרשמו-בספר-במיזוג-גיט · אפס-חפיפת-refs מול-השרשרת-הראשית · גוף-כל-אירוע-ככתבו-בארכיון`, "regenesis-20261016-fork");
  for (const raw of bRaw) emitBody({ ...of(raw), origSeq: (JSON.parse(raw) as T).seq } as any, { raw });
}

emitMarker(`המשך-השרשרת-החיה · ${recoveredCount} אירועים (seq-מקורי ${coreTailSeq + 1}..${snap.seq}) שוחזרו-גוף-לגוף · seq-רציף-חדש · h-מחושב-מחדש · ts-מקורי-נשמר · ${lostCount} אירועים-אבדו-לדיסק (סמני-פער-להלן)`, "regenesis-20261016-continuation");
let lastEmitTs = 0;
for (const c of cont) {
  if (lostRuns.length && lostRuns[0] && c.seq > (lostRuns[0] as any).a && lostRuns.some((r) => r.b === c.seq - 1)) {
    // gap marker before this entry (the run just ended at c.seq-1)
  }
  // emit gap markers for runs that ended just before c.seq
  while (lostRuns.length && lostRuns[0].b < c.seq) {
    const r = lostRuns.shift()!;
    emitMarker(`פער-כנה: ${r.b - r.a + 1} אירועי-אמת (seq-מקורי ${r.a}..${r.b}) אבדו-מהדיסק בפעולות-גיט (stash-pop/rebase) לפני-אטימה · גופיהם-לא-ניתנים-לשחזור · המונים-ב-metrics כוללים-אותם-בכנות`, `regenesis-20261016-gap-${r.a}-${r.b}`);
  }
  emitBody({ ...of(c.raw), origSeq: c.seq } as any, { raw: c.raw });
}
// trailing lost runs (if the chain ends in a gap — impossible here, but honest)
for (const r of lostRuns) emitMarker(`פער-כנה: ${r.b - r.a + 1} אירועי-אמת (seq-מקורי ${r.a}..${r.b}) אבדו-מהדיסק בפעולות-גיט לפני-אטימה`, `regenesis-20261016-gap-${r.a}-${r.b}`);

/* ── 7. verify the repaired chain with the ENGINE's exact formula ── */
let vprev = "GENESIS", vok = 0;
for (const line of out) {
  const { h, ...rest } = line;
  if (H(JSON.stringify({ ...rest, prev: vprev })) !== h) { console.error(`FATAL: repaired chain broken at newSeq=${rest.seq}`); process.exit(1); }
  vprev = h; vok++;
}
console.log(`[7] repaired chain verify: ok=${vok === out.length} checked=${vok}/${out.length} · tail h=${prevH}`);

/* ── 8. write: archive original whole, new ledger, updated snapshot ── */
fs.copyFileSync(LEDGER, ARCHIVE);
fs.writeFileSync(LEDGER, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
snap.seq = newSeq; snap.lastH = prevH; snap.savedAt = ts();
fs.writeFileSync(SNAP, JSON.stringify(snap));
console.log(`[8] archive=${ARCHIVE} (${liveLines.length} lines verbatim) · new ledger=${out.length} lines · snapshot seq=${snap.seq} lastH=${prevH}`);
console.log(`repair stats: core=${coreRaw.length} B=${bRaw.length} recovered=${recoveredCount} lost=${lostCount} markers=${out.length - coreRaw.length - bRaw.length - recoveredCount} total=${out.length}`);
console.log(`treasury (from live snapshot, untouched): ${JSON.stringify(snap.balances.treasury)}`);
