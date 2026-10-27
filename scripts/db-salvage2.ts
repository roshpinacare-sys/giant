/**
 * db-salvage2.ts — ניתוח-חירום מוגבל-תחום (אמת-מידה: SAOS-DB-SALVAGE/2)
 *
 * אסטרטגיה: גושים של 4096-rowid.
 *  - גוש-נקי → שאילתת-טווח → בליעה-שלמה.
 *  - גוש-פגוע-בתוך-נתונים (blockStart ≤ maxRidObserved) → ניקור-נקודתי.
 *  - גוש-פגוע-מעבר-לנתונים → דילוג-זול (throw-אחד) — SQLite-זורק-גם-על-חיפוש-מעבר-לקצה-בעץ-פגום.
 *  - עצירה-לכל-טבלה: 5,000,000-rowid-מעבר-ל-maxRidObserved.
 * תורת-אפס-המצאה: רק-שורות-שנקראו-מהקובץ. lost נספר-רק-על-שורות-שייתכן-שהיו.
 */
import { Database } from "bun:sqlite";

const SRC = process.argv[2] ?? "/home/z/my-project/state/db-salvage-snapshot/custom.db";
const DST = process.argv[3] ?? "/home/z/my-project/db/custom.repaired.db";
const BLOCK = 4096;
const PAST_MARGIN = 5_000_000;
const CORRUPT = new Set(
  (process.argv[4] ?? "DexCandle,DexTrade,DexLedger,DexOrder").split(","),
);

const src = new Database(SRC, { readonly: true });
for (const f of [DST, DST + "-wal", DST + "-shm"]) require("node:fs").rmSync(f, { force: true });
const dst = new Database(DST);
dst.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");

const stats: Record<string, { saved: number; lost: number; maxRid: number }> = {};
let totalSaved = 0;

const tables = (
  src.query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]
).map((r) => r.name);

for (const t of tables) {
  const def = (
    src.query(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(t) as { sql: string }
  ).sql;
  dst.exec(def);
}

function colsOf(t: string): string[] {
  return (src.query(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map((c) => c.name);
}

function commitRows(t: string, ins: ReturnType<Database["prepare"]>, cols: string[], rows: Record<string, unknown>[]): number {
  const s = stats[t];
  let n = 0;
  for (const r of rows) {
    try { ins.run(r.__rid, ...cols.map((c) => r[c] as never)); s.saved++; n++; totalSaved++; }
    catch { s.lost++; }
  }
  return n;
}

const t0 = Date.now();
for (const t of tables) {
  stats[t] = { saved: 0, lost: 0, maxRid: 0 };
  const s = stats[t];
  const cols = colsOf(t);
  const ins = dst.prepare(
    `INSERT OR IGNORE INTO "${t}" (rowid, ${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")},?)`,
  );
  const sel = cols.map((c) => `"${c}"`).join(",");
  const rangeQ = src.query(`SELECT rowid AS __rid, ${sel} FROM "${t}" WHERE rowid >= ? AND rowid < ?`);
  const pointQ = src.query(`SELECT rowid AS __rid, ${sel} FROM "${t}" WHERE rowid = ?`);

  if (!CORRUPT.has(t)) {
    const rows = src.query(`SELECT rowid AS __rid, ${sel} FROM "${t}"`).all() as Record<string, unknown>[];
    commitRows(t, ins, cols, rows);
    if (rows.length) s.maxRid = rows[rows.length - 1].__rid as number;
    console.log(`[salvage2] ${t}: saved=${s.saved} (clean)`);
    continue;
  }

  let block = 0;
  while (block * BLOCK < s.maxRid + PAST_MARGIN) {
    const lo = block * BLOCK + 1;
    const hi = (block + 1) * BLOCK + 1;
    let savedHere = 0;
    try {
      const rows = rangeQ.all(lo, hi) as Record<string, unknown>[];
      if (rows.length) {
        s.maxRid = Math.max(s.maxRid, rows[rows.length - 1].__rid as number);
        savedHere = commitRows(t, ins, cols, rows);
      }
    } catch {
      // גוש-פגוע: ניקור-נקודתי רק-אם-ייתכנו-נתונים-כאן
      if (lo <= s.maxRid + BLOCK) {
        for (let rid = lo; rid < hi; rid++) {
          try {
            const one = pointQ.all(rid) as Record<string, unknown>[];
            if (one.length) {
              s.maxRid = Math.max(s.maxRid, one[0].__rid as number);
              savedHere += commitRows(t, ins, cols, one);
            }
          } catch {
            if (rid <= s.maxRid) s.lost++;
          }
        }
      }
    }
    block++;
    if (block % 400 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[salvage2] ${t}: block=${block} saved=${s.saved} lost=${s.lost} maxRid=${s.maxRid} (${el}s)`);
    }
    if (savedHere === 0 && block * BLOCK > s.maxRid + PAST_MARGIN * 0.9) break;
  }
  console.log(`[salvage2] ${t}: DONE saved=${s.saved} lost=${s.lost} maxRid=${s.maxRid} blocks=${block}`);
}

const idx = src.query(`SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`).all() as { sql: string }[];
for (const i of idx) {
  try { dst.exec(i.sql); } catch (e) { console.error(`[salvage2] index WARN: ${String(e).slice(0, 80)}`); }
}

const ic = dst.query(`PRAGMA integrity_check`).get() as { integrity_check: string };
console.log(`[salvage2] integrity_check=${ic.integrity_check}`);
console.log(`[salvage2] TOTAL saved=${totalSaved} ${JSON.stringify(stats)}`);
console.log(`[salvage2] elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (ic.integrity_check !== "ok") {
  console.error("[salvage2] FAIL — לא-ימוסל");
  process.exit(2);
}
console.log("[salvage2] OK");
