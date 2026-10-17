/* ═══ dexfill-relay · ממיר-מילויי-דקס → ספר-הכלכלה · פורט 3019 ══════════════
 * תפקיד: לקרוא מילויים-אמת מ-DexTrade (db/custom.db) ולהכניס אותם כדמי-שירות
 * למנוע-הכלכלה החי דרך נתיב-ה-ingest הרשמי (POST /tx/ingest · loopback ·
 * ref = dexfill-<tradeId> — זהו בדיוק ה-ref שרשת-הביטחון pollDexFills של
 * המנוע עצמו משתמשת בו → dedup כפול מובטח: אם-המנוע הקדים, ה-ref כבר קיים
 * וה-ingest מדווח dedup; אם-הממיר הקדים, רשת-הביטחון תדלג. אפס-כפילויות).
 *
 * חוקי-אמת:
 *  · אפס-סינתזה — price/amount/total/at 1:1 מהשורה ב-DexTrade (נכתבה ע"י
 *    dex-economy-bridge מהדיווח הגולמי של הדקס).
 *  · דמי-שירות = notional × 0.003, תחום [0.001, 2] — נוסחה-זהה לזו של
 *    pollDexFills במנוע (שורת-קוד-אחת זהה) כדי שהספריה-מתנהגת אותו-דבר.
 *  · מיקור-מי-מילא: reason נושא את pairId/side/source/sourceAgent מהשורה.
 *  · baseline = עליית-השירות; היסטוריה לא נספרת (כמו-המנוע).
 *  · fail-closed: אין-מנוע על :3016 → פסיקה-כנה בלוג ולא-המצאה. */
import { Database } from "bun:sqlite";

const DEX_DB = process.env.RELAY_DEX_DB ?? "/home/z/my-project/db/custom.db";
const ENGINE = process.env.RELAY_ENGINE_URL ?? "http://127.0.0.1:3016";
const PORT = Number(process.env.RELAY_PORT || 3019);
const POLL_MS = Number(process.env.RELAY_POLL_MS || 45_000);
const FEE_PCT = 0.003;

const baseline = Date.now();
let polls = 0, pushed = 0, deduped = 0, rejected = 0, errors = 0, lastErr = "", lastAt = 0, bootedAt = Date.now();

function round6(x: number): number { return Math.round(x * 1e6) / 1e6; }

async function pushRow(row: { id: string; pairId: string; side: string; source: string; sourceAgent: string | null; total: number | null; t: number }): Promise<void> {
  const notional = Number(row.total ?? 0);
  const fee = round6(Math.min(2, Math.max(0.001, notional * FEE_PCT)));
  const body = {
    kind: "dex-fee", from: "saos-dex", to: "treasury", asset: "USDS", amount: fee, refillFloat: true,
    reason: `דמי-שירות-מילוי-דקס (relay) · ${row.pairId} ${row.side} · מקור=${row.source}${row.sourceAgent ? `:${row.sourceAgent}` : ""}`,
    ref: `dexfill-${row.id}`,
  };
  try {
    const r = await fetch(`${ENGINE}/tx/ingest`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    const d: any = await r.json().catch(() => ({}));
    if (r.ok && (d?.ok ?? true)) {
      if (d?.dedup || d?.why === "dedup") deduped++; else pushed++;
      lastAt = Math.max(lastAt, row.t);
    } else if (d?.why === "dedup" || /dedup/i.test(String(d?.error ?? ""))) {
      deduped++;
    } else { rejected++; lastErr = `http ${r.status} ${JSON.stringify(d).slice(0, 120)}`; }
  } catch (e) { errors++; lastErr = String(e).slice(0, 120); }
}

function poll(): void {
  polls++;
  let db: Database | null = null;
  try {
    db = new Database(DEX_DB, { readonly: true, create: false });
    const rows = db
      .query("SELECT id, pairId, side, source, sourceAgent, total, t FROM DexTrade WHERE t >= ? ORDER BY t ASC LIMIT 500")
      .all(baseline) as any[];
    for (const row of rows) await pushRow(row);
    lastErr = "";
  } catch (e) { errors++; lastErr = String(e).slice(0, 120); }
  finally { try { db?.close(); } catch { /* כנה */ } }
}

Bun.serve({
  port: PORT,
  fetch: () => Response.json({
    ok: true, service: "dexfill-relay", port: PORT,
    engine: ENGINE, baselineMs: baseline,
    polls, pushed, deduped, rejected, errors, lastErr: lastErr || null, lastAt,
    upSec: Math.round((Date.now() - bootedAt) / 1000),
  }),
});

console.log(`[dexfill-relay] חי על :${PORT} · מנוע ${ENGINE} · baseline ${new Date(baseline).toISOString()}`);
setTimeout(poll, 10_000);
setInterval(poll, POLL_MS);
