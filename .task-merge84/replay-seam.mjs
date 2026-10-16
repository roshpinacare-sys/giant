// replay-seam.mjs · תיקון-תפר-מיזוג-84: שידור-חוזר-דטרמיניסטי של זנב-הספר-על-הסנאפשוט
// קלט: .task-merge84/their-snap.json + .task-merge84/their-ledger.jsonl (מה-vault, origin/main)
// פלט: .task-merge84/snapshot-repaired.json — עקבי-מול-הספר-כולו (seq=זנב, lastH=זנב)
import { createHash } from "crypto";
import fs from "fs";

const DIR = "/home/z/my-project/.task-merge84";
const snap = JSON.parse(fs.readFileSync(DIR + "/their-snap.json", "utf8"));
const rawLines = fs.readFileSync(DIR + "/their-ledger.jsonl", "utf8").split("\n").filter(Boolean);
// קנוניזציה: A(1..18973) + B(18974..19866) — הוצאת-23-שורות-מזלג-יתומות (נשמרות-בהסגר-בנפרד)
const aSeg = rawLines.slice(0, 18996), bSeg = rawLines.slice(18996);
const orphans = aSeg.slice(18973); // 23 שורות-מזלג-יתומות seq 18974..18996
const lines = [...aSeg.slice(0, 18973), ...bSeg];
fs.writeFileSync(DIR + "/orphan-fork-23.jsonl", orphans.join("\n") + "\n");
console.log("CANONICAL lines=" + lines.length + " orphans-quarantined=" + orphans.length);

/* ── מצב מהסנאפשוט ── */
const balances = new Map(Object.entries(snap.balances ?? {}).map(([k, v]) => [k, { usds: 0, saos: 0, saosStaked: 0, ...v }]));
const pool = snap.pool;
let seq = snap.seq;
let lastH = snap.lastH;
const byKind = { ...(snap.byKind ?? {}) };
const byAccount = { ...(snap.byAccount ?? {}) };

const bal = (id) => {
  if (!balances.has(id)) balances.set(id, { usds: 0, saos: 0, saosStaked: 0 });
  return balances.get(id);
};

/* ── אימות-שרשרת מלא קודם (זהה-ל-verifyChain במנוע) ── */
let prev = "GENESIS", checked = 0;
for (const line of lines) {
  let t; try { t = JSON.parse(line); } catch { console.log("UNPARSEABLE at checked=" + checked); process.exit(2); }
  const { h, ...rest } = t;
  const body = JSON.stringify({ ...rest, prev });
  if (createHash("sha256").update(body).digest("hex").slice(0, 32) !== h) {
    console.log("CHAIN-BROKEN at seq=" + t.seq + " checked=" + checked);
    process.exit(2);
  }
  prev = h; checked++;
}
console.log("CHAIN-VERIFY ok checked=" + checked + " lastSeqLine=" + JSON.parse(lines[lines.length - 1]).seq);

/* ── שידור-חוזר: רק עסקאות אחרי רגע-הסנאפשוט ── */
let applied = 0, skipped = 0; const gaps = [];
for (const line of lines) {
  const t = JSON.parse(line);
  if (t.seq <= seq) { skipped++; continue; }
  if (t.seq !== seq + 1) gaps.push(seq + "→" + t.seq);
  const from = bal(t.from), to = bal(t.to);
  const field = t.asset === "USDS" ? "usds" : "saos";
  if ((from[field] ?? 0) < t.amount) { console.log("REJECTED-IN-REPLAY seq=" + t.seq + " (מצב-לא-עקבי-עם-הספר)"); process.exit(3); }
  if (t.kind === "stake") { from.saos -= t.amount; from.saosStaked += t.amount; }
  else if (t.kind === "unstake") {
    if ((from.saosStaked ?? 0) < t.amount) { console.log("UNSTAKE-FAIL seq=" + t.seq); process.exit(3); }
    from.saosStaked -= t.amount; to.saos += t.amount;
  } else {
    from[field] -= t.amount;
    if (t.kind === "swap") {
      const feeAmt = t.fee ?? 0;
      if (t.asset === "USDS") { pool.usds += t.amount; pool.saos -= t.outSaos; to.saos += t.outSaos; pool.feesUsds += feeAmt; }
      else { pool.saos += t.amount; pool.usds -= t.outUsds; to.usds += t.outUsds; pool.feesSaos += feeAmt; }
    } else {
      to[field] += t.amount;
    }
  }
  byAccount[t.from] = (byAccount[t.from] ?? 0) + 1;
  byAccount[t.to] = (byAccount[t.to] ?? 0) + 1;
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  seq = t.seq; lastH = t.h;
  applied++;
}

console.log("REPLAY applied=" + applied + " skipped=" + skipped + " gaps=" + JSON.stringify(gaps));
console.log("FINAL seq=" + seq + " lastH=" + lastH);

/* ── סנאפשוט מתוקן — אותו מבנה v3 שהמנוע מצפה לו ── */
const repaired = {
  v: 3, savedAt: Date.now(), seq, lastH,
  balances: Object.fromEntries(balances),
  pool, byKind, byAccount,
  rejected: snap.rejected ?? 0, errors: snap.errors ?? 0,
  ledgerFileNo: snap.ledgerFileNo ?? 0,
  ingestOk: snap.ingestOk ?? 0, ingestDedup: snap.ingestDedup ?? 0, ingestFailed: snap.ingestFailed ?? 0, ingestBad: snap.ingestBad ?? 0,
  seenRefs: snap.seenRefs ?? [],
};
fs.writeFileSync(DIR + "/snapshot-repaired.json", JSON.stringify(repaired));
console.log("WRITTEN " + DIR + "/snapshot-repaired.json");
