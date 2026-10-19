/* ═══ giants-anchor · עורק-המחיר-מהענקים · פורט 3023 ═══════════════════════
 * Task 17 (צו-הבעלים: "למשוך נזילות מהענקים לרשת שלנו") — הווריד-הראשון, חי:
 * מושך מחירי-אמת מהענקיות (Binance ציבורי) עבור השרשרות-שלנו (STEEM/HIVE)
 * + מקרו-עוגן (BTC/ETH) — נזילות-ייחוס חוץ שמזרימה ערך-הכרעה לרשת:
 * דשבורדים, החלטות-אוצר, ועתיד: ארביטרז נייר-מול-אמת.
 *
 * חוקי-אמת: fail-honest — מקור-שנכשל מדווח כשגיאה, אין-המצאת-מחיר;
 * כל-מחיר נושא מקור + זמן; מצב-אחרון-טוב מסומן stale.
 * אפס-מפתחות: Binance-ציבורי בלבד, אפס-חתימה, אפס-סודות.
 */
const PORT = 3023;
const BINANCE = "https://api.binance.com/api/v3/ticker/price";
const SYMBOLS = ["STEEMUSDT", "HIVEUSDT", "BTCUSDT", "ETHUSDT"] as const;
const REFRESH_MS = 60_000;
const LOG_FILE = new URL("./state/anchor-log.jsonl", import.meta.url).pathname;
const LOG_CAP = 500;

interface Price { symbol: string; usdt: number; src: string; at: string }
interface Snap {
  at: string;
  prices: Record<string, Price>;
  errors: string[];
}
const g = globalThis as unknown as { __giantsSnap?: Snap | null; __giantsBooted?: boolean };

function appendLog(snap: Snap) {
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(snap) + "\n");
    // cap: אם-גדול-מדי — חיתוך-זנב
    try {
      const st = fs.statSync(LOG_FILE);
      if (st.size > LOG_CAP * 220) {
        const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").slice(-LOG_CAP);
        fs.writeFileSync(LOG_FILE, lines.join("\n") + "\n");
      }
    } catch { /* אין */ }
  } catch { /* log is best-effort */ }
}

async function refresh(): Promise<Snap> {
  const snap: Snap = { at: new Date().toISOString(), prices: {}, errors: [] };
  await Promise.all(
    SYMBOLS.map(async (sym) => {
      try {
        const r = await fetch(`${BINANCE}?symbol=${sym}`, { signal: AbortSignal.timeout(7000) });
        if (!r.ok) throw new Error(`http-${r.status}`);
        const j = (await r.json()) as { price?: string };
        const p = Number(j.price);
        if (!Number.isFinite(p) || p <= 0) throw new Error("bad-price");
        snap.prices[sym.replace("USDT", "")] = { symbol: sym, usdt: p, src: "binance", at: snap.at };
      } catch (e) {
        snap.errors.push(`${sym}:${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  g.__giantsSnap = snap;
  if (Object.keys(snap.prices).length > 0) appendLog(snap);
  return snap;
}

function serve(req: Request): Response {
  const url = new URL(req.url);
  const snap = g.__giantsSnap ?? null;
  if (url.pathname === "/health") {
    return Response.json({
      ok: true, service: "giants-anchor", port: PORT,
      lastSnapAt: snap?.at ?? null,
      sources: [...SYMBOLS],
      lastErrors: snap?.errors ?? [],
    });
  }
  if (url.pathname === "/anchor" || url.pathname === "/") {
    if (!snap) return Response.json({ ok: false, reason: "no-snap-yet" }, { status: 503 });
    const ageMs = Date.now() - Date.parse(snap.at);
    return Response.json({ ok: true, stale: ageMs > 3 * REFRESH_MS, ageMs, ...snap });
  }
  if (url.pathname === "/log") {
    try {
      const fs = require("node:fs");
      const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 5) || 5, 50);
      const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").slice(-limit);
      return Response.json({ ok: true, lines: lines.map((l: string) => JSON.parse(l)) });
    } catch {
      return Response.json({ ok: true, lines: [] });
    }
  }
  return Response.json({ ok: false, reason: "not-found" }, { status: 404 });
}

if (!g.__giantsBooted) {
  g.__giantsBooted = true;
  Bun.serve({ port: PORT, fetch: serve });
  console.info(`[giants-anchor] חי על :${PORT} — מושך מחירי-אמת מ-Binance כל ${REFRESH_MS / 1000}ש׳`);
  void refresh().then(() => {
    setInterval(() => void refresh(), REFRESH_MS);
  });
}
