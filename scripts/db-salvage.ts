/**
 * db-salvage.ts — ניתוח-חירום של db/custom.db (אמת-מידה: SAOS-DB-SALVAGE/1)
 *
 * תורת-החוק:
 *  1. אפס-המצאה: כל-שורה-שניצלת = שורה-שנקראה-מהקובץ עצמו. שורה-שאי-אפשר-לקרוא = נספרת-בכנות-lost.
 *  2. ביסקט-משיכה: חלונות-rowid מתחלקים עד-רזולוציית-שורה-בודדת — כל-עמוד-תקין-נמשך.
 *  3. הצפה-מלאה: schema מקורי מועתק מילולית (sqlite_master.sql), rowid נשמר, אינדקסים נבנים-מחדש.
 *  4. שער-עצמי: DexPair חייב-להינצל-מלא (מדידה-ידועה: 18 שורות) — אחרת עצירה-כושלת.
 *  5. אימות-סופי: PRAGMA integrity_check חייב ok — אחרת הקובץ-המתוקן-לא-מוחלף.
 *
 * שימוש: bun scripts/db-salvage.ts <src> <dst>
 */
import { Database } from "bun:sqlite";

const SRC = process.argv[2] ?? "/home/z/my-project/db/custom.db.snapshot";
const DST = process.argv[3] ?? "/home/z/my-project/db/custom.repaired.db";

const src = new Database(SRC, { readonly: true });
require("node:fs").rmSync(DST, { force: true });
const dst = new Database(DST);
dst.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");

const stats: Record<string, { saved: number; lost: number }> = {};

function colsOf(name: string): string[] {
  const info = src.query(`PRAGMA table_info("${name}")`).all() as {
    name: string;
  }[];
  return info.map((c) => c.name);
}

function mkInsert(
  t: string,
  cols: string[],
): ReturnType<Database["prepare"]> {
  return dst.prepare(
    `INSERT OR IGNORE INTO "${t}" (rowid, ${cols
      .map((c) => `"${c}"`)
      .join(",")}) VALUES (${cols.map(() => "?").join(",")},?)`,
  );
}

function commitRows(
  t: string,
  insert: ReturnType<Database["prepare"]>,
  cols: string[],
  rows: Record<string, unknown>[],
): void {
  const s = (stats[t] ??= { saved: 0, lost: 0 });
  for (const r of rows) {
    try {
      insert.run(r.__rid, ...cols.map((c) => r[c] as never));
      s.saved++;
    } catch {
      s.lost++;
    }
  }
}

/** משיכת-ביסקט: חלון-תקין נבלע-שלם; חלון-שבור מתפצל עד-שורה-בודדת */
function salvageWindow(
  t: string,
  insert: ReturnType<Database["prepare"]>,
  cols: string[],
  lo: number,
  hi: number,
  depth: number,
): void {
  if (lo >= hi) return;
  let rows: Record<string, unknown>[] = [];
  try {
    const sel = cols.map((c) => `"${c}"`).join(",");
    rows = src
      .query(
        `SELECT rowid AS __rid, ${sel} FROM "${t}" WHERE rowid >= ? AND rowid < ?`,
      )
      .all(lo, hi) as Record<string, unknown>[];
  } catch {
    if (hi - lo <= 1) {
      try {
        const sel = cols.map((c) => `"${c}"`).join(",");
        rows = src
          .query(
            `SELECT rowid AS __rid, ${sel} FROM "${t}" WHERE rowid = ?`,
          )
          .all(lo) as Record<string, unknown>[];
      } catch {
        stats[t] = (stats[t] ??= { saved: 0, lost: 0 });
        stats[t].lost++;
        return;
      }
      if (rows.length) commitRows(t, insert, cols, rows);
      return;
    }
    if (depth > 48) {
      stats[t] = (stats[t] ??= { saved: 0, lost: 0 });
      stats[t].lost += hi - lo;
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    salvageWindow(t, insert, cols, lo, mid, depth + 1);
    salvageWindow(t, insert, cols, mid, hi, depth + 1);
    return;
  }
  if (rows.length) commitRows(t, insert, cols, rows);
}

// ── 1. סכמה מלאה ────────────────────────────────────────────────────────
const tables = (
  src.query(`SELECT name FROM sqlite_master WHERE type='table'`).all() as {
    name: string;
  }[]
)
  .map((r) => r.name)
  .filter((n) => n !== "sqlite_sequence" && !n.startsWith("_sqlite"));

for (const t of tables) {
  const def = (
    src.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
    ).get(t) as { sql: string } | undefined
  )?.sql;
  if (def) dst.exec(def);
  else console.error(`[salvage] WARN: אין-sql-ל-${t}`);
}

// ── 2. שער-עצמי על DexPair (מדידה-ידועה: 18) ────────────────────────────
{
  const t = "DexPair";
  const cols = colsOf(t);
  const ins = mkInsert(t, cols);
  salvageWindow(t, ins, cols, 1, 2**32, 0);
  const s = (stats[t] ??= { saved: 0, lost: 0 });
  if (s.saved !== 18) {
    console.error(
      `[salvage] FAIL-SELFTEST: DexPair saved=${s.saved} (חוק: 18) — עצירה`,
    );
    process.exit(2);
  }
  console.log(`[salvage] selftest DexPair OK (${s.saved}/18)`);
}

// ── 3. משיכת-נתונים לכל-הטבלאות ─────────────────────────────────────────
for (const t of tables) {
  if (t === "DexPair") continue;
  const cols = colsOf(t);
  const ins = mkInsert(t, cols);
  salvageWindow(t, ins, cols, 1, 2**32, 0);
  const s = (stats[t] ??= { saved: 0, lost: 0 });
  console.log(`[salvage] ${t}: saved=${s.saved} lost=${s.lost}`);
}
const dexPair = stats["DexPair"]!;
console.log(`[salvage] DexPair: saved=${dexPair.saved} lost=${dexPair.lost}`);

// ── 4. אינדקסים ─────────────────────────────────────────────────────────
const idx = src.query(
  `SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`,
).all() as { sql: string }[];
for (const i of idx) {
  try {
    dst.exec(i.sql);
  } catch (e) {
    console.error(`[salvage] index WARN: ${String(e).slice(0, 80)}`);
  }
}

// ── 5. sqlite_sequence (AUTOINCREMENT) ──────────────────────────────────
try {
  const seqRows = src
    .query(`SELECT name, seq FROM sqlite_sequence`)
    .all() as { name: string; seq: number }[];
  for (const r of seqRows) {
    try {
      dst.prepare(`UPDATE sqlite_sequence SET seq=? WHERE name=?`).run(
        r.seq,
        r.name,
      );
    } catch {
      /* טבלה-ללא-AUTOINCREMENT-ביעד */
    }
  }
} catch {
  /* אין-sqlite_sequence-במקור */
}

// ── 6. אימות-אמת ────────────────────────────────────────────────────────
const ic = dst.query(`PRAGMA integrity_check`).get() as {
  integrity_check: string;
};
const fk = dst.query(`PRAGMA foreign_key_check`).all();
console.log(`[salvage] integrity_check=${ic.integrity_check}`);
console.log(
  `[salvage] foreign_key_check=${fk.length === 0 ? "clean" : JSON.stringify(fk).slice(0, 200)}`,
);
console.log(
  `[salvage] TOTAL ${JSON.stringify(stats)}`,
);
if (ic.integrity_check !== "ok") {
  console.error("[salvage] FAIL — הקובץ-המתוקן-אינו-תקין, לא-ימוסל");
  process.exit(2);
}
console.log("[salvage] OK");
