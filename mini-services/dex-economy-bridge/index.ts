/* ═══ dex-economy-bridge · פורט 3017 · המפיק-החי של DexTrade ═══
 * התפר-שנמדד-בהרצה-חיה (גל-87): לכלכלה יש קורא DexTrade (pollDexFills) אבל
 * אף-כותב לא היה בשום-מקום בקוד. הגשר הזה הוא הכותב: שולף מילויים-אמת
 * מ-/api/dex/trades של הדקס-החי וכותב אותם 1:1 ל-DexTrade ב-SQLite.
 *
 * חוקי-אמת:
 *  · אפס-סינתזה — רק-מה שהדקס מדווח (price/amountMu/taker/maker/h/at).
 *  · אידמפוטנטי: id = sha256(תוכן-קנוני) → סקר-חוזר לא מכפיל.
 *    מגבלה-כנה: שני-מילויים-זהים-לחלוטין באותו-בלוק (אותם-צדדים, מחיר, כמות)
 *    אינם-נבדלים-גם-בטבעת-הדקס עצמה — יירשמו-כאחד. המקור-הוא-האמת.
 *  · side: ה-API אינו חושף כיוון-טייקר; נרשם kind ("fill") בכנות — לא ניחוש.
 *  · total (USDS) = price[mUSDS/SAOS] × amountMu[µSAOS] / 1e9 (נמדד: 1005×100000/1e9=0.1005).
 */
import { Database } from "bun:sqlite";
import { createHash } from "crypto";

const DEX_DB = process.env.BRIDGE_DEX_DB ?? "/home/z/my-project/db/custom.db";
const API = process.env.BRIDGE_DEX_API ?? "http://127.0.0.1:3015/saos-dex/api/dex/trades?pair=SAOS/USDS&limit=500";
const POLL_MS = 20_000;
const PORT = 3017;

const db = new Database(DEX_DB, { create: true });
db.exec(`CREATE TABLE IF NOT EXISTS DexTrade (
  id TEXT PRIMARY KEY, pairId TEXT NOT NULL, side TEXT, source TEXT,
  sourceAgent TEXT, total REAL, t INTEGER)`);
// תיקון-שורשי (2026-10-17): ספר-הגיאנט דורש price/amount NOT NULL — ההחדרות
// נדחו בשקט עד-היום (OR IGNORE בלע את השגיאה). הערכים נשמרים 1:1 מהדיווח
// הגולמי של הדקס (price=µUSDS/SAOS · amount=µSAOS) — אפס-המרה, אפס-סינתזה.
const ins = db.prepare("INSERT OR IGNORE INTO DexTrade (id,pairId,side,price,amount,source,sourceAgent,total,t) VALUES (?,?,?,?,?,?,?,?,?)");

let polls = 0, inserted = 0, errors = 0, lastAt = 0, lastErr = "";

function writeFills(trades: any[]): number {
  let n = 0;
  for (const f of trades) {
    const canonical = `${f.h}|${f.at}|${f.taker}|${f.maker}|${f.price}|${f.amountMu}|${f.kind}|${f.base}/${f.quote}`;
    const id = createHash("sha256").update(canonical).digest("hex").slice(0, 24);
    const total = (Number(f.price) * Number(f.amountMu)) / 1e9;
    const r = ins.run(id, `${f.base}/${f.quote}`, String(f.kind ?? "fill"), Number(f.price), Number(f.amountMu), "saos-dex", String(f.taker ?? ""), total, Number(f.at));
    if (r.changes > 0) { n++; lastAt = Math.max(lastAt, Number(f.at) || 0); }
  }
  return n;
}

async function poll(): Promise<void> {
  polls++;
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`http-${res.status}`);
    const d = await res.json();
    const n = writeFills(d.trades ?? []);
    inserted += n;
    if (n > 0) console.log(`[bridge] +${n} fills → DexTrade (Σinserted=${inserted})`);
  } catch (e) {
    errors++; lastErr = String(e);
    console.log(`[bridge] poll-error #${errors}: ${lastErr.slice(0, 120)}`);
  }
}

setInterval(poll, POLL_MS);
setTimeout(poll, 3_000);

Bun.serve({
  port: PORT,
  fetch: () => Response.json({ ok: true, bridge: "dex-economy-bridge", polls, inserted, errors, lastAt, lastErr: lastErr || null, db: DEX_DB }),
});
console.log(`[bridge] חי על :${PORT} · db=${DEX_DB} · api=${API}`);
