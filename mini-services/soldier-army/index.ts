/* ═══ soldier-army v2 · פורט 3018 · חיילים אמיתיים על בנק-יציב ═══════════════
 * מנדט-בעלים (2026-10-17): "קח חיילים על 300 באנק יציב — מפסיד פחות" +
 * msg-8: מימון-חיילים לסחר-אוטומטי · מילוי-מתמשך · ניתוב-רווחים.
 *
 * v2 (2026-10-18 · תיקון-שוק-חי): ה-v1 היה מאונקר ל-ladder.refPrice שהתיישן
 * (1009 מול fair-חי 1024) — ה-ASKs נפסלו postOnly-חוצה (bestBid 1027) וה-BIDs
 * ישבו מתחת לתור. v2 חי-על-השוק:
 *  · anchor = markets.fair (חי) ← poolMid ← ladder.refPrice (נפילה-לאחור)
 *  · ביטול-פקודות-מתות (|px−anchor| > STALE_BPS) — משחרר-נעולים
 *  · BID: עלייה-לראש-התור עד anchor+grid · ASK: bestBid+1 כשצד-האסק ריק
 *    (הבריכה משלמת poolMid+fee — מי-שמציב-מעליה-מקבל-את-זרימת-הקונים)
 *  · דלק: רצפת-בקשה FUEL_ASK_MIN (2000) — לא-אבק-גז · יעד 5000
 *  · כנות: כשלי-xfer מודפסים תמיד (כולל-operator — היה-נבלע-בשקט)
 *
 * אמת (נשמר מ-v1):
 *  · זהויות = אותם-חיילי-כלכלה (yarden/tamar/shachar/aluf/erez/gal) — צי-אחד
 *  · מימון: /transfer מה-operator — אפס-הטבעה · מסחר: postOnly ב-issuer-החייל
 *  · משמעת-בנק: יעד 300,000µ USDS · רצפת-קנייה 150,000µ · סחיטה מעל 450,000µ
 *  · אפס-סודות כאן: הטוקן נקרא מ-operator.env של saos-dex-node (chmod 600)
 */
import fs from "node:fs";
import path from "node:path";

const DEX = "http://127.0.0.1:3013/saos-dex/api/dex";
const PORT = 3018;
const ENV_FILE = path.join(import.meta.dir, "..", "saos-dex-node", "operator.env");
function readToken(): string {
  try {
    const m = fs.readFileSync(ENV_FILE, "utf8").match(/^DEX_OPERATOR_TOKEN=(.+)$/m);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}
const TOKEN = readToken();
if (!TOKEN) { console.error("[army] אין-טוקן-מפעיל — fail-closed"); process.exit(1); }
const H = { "content-type": "application/json", "x-saos-operator": TOKEN, "x-saos-dex-console": "1" };

const SOLDIERS = ["yarden", "tamar", "shachar", "aluf", "erez", "gal"] as const;
const BANK_USDS_MU = 300_000;      // בנק-יציב: 300 יח'
const SAOS_SEED_MU = 100_000;      // מלאי-פתיחה לצד-המכירה
const ORDER_AMT_MU = 10_000;       // µSAOS פר-פקודה (10 יח')
const MAX_ORDERS = 4;              // תקרת-פקודות-חיות פר-חייל
const BUY_FLOOR_MU = 150_000;      // משמעת-בנק: לא-לעבור-את-זה בהזמנות-קנייה
const SWEEP_ABOVE_MU = 450_000;    // ניתוב-רווחים: עודף-מעל-זה חוזר למפעיל
const GRID_BPS = 20;               // רוחב-גריד סביב ה-anchor
const STALE_BPS = 40;              // פקודה-רחוקה-מזה-מתה — ביטול
const FUEL_FLOOR = 2_000;          // FUEL_ASK_MIN בגרעין — מתחת-זה אבק-גז
const FUEL_TARGET = 5_000;         // יעד-עירוי
const MAX_CANCELS_PER_CYCLE = 2;   // גבול-גז: ביטולים-פר-חייל-פר-מחזור
const CYCLE_MS = 30_000;           // השוק נושם כל-3ש׳ — החיילים כל-30ש׳

type SoldierState = {
  fundedUsds: number; fundedSaos: number; swept: number; fuel: number;
  placed: number; rejected: number; canceled: number; filledMu: number; lastErr: string;
};
const S: Record<string, SoldierState> = {};
for (const s of SOLDIERS) S[s] = { fundedUsds: 0, fundedSaos: 0, swept: 0, fuel: 0, placed: 0, rejected: 0, canceled: 0, filledMu: 0, lastErr: "" };

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.json();
}
async function jpost(url: string, body: any): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`POST ${url} → ${r.status} ${JSON.stringify(d).slice(0, 120)}`);
  return d;
}

const W: Record<string, { bal: Record<string, number>; locked: Record<string, number>; credits: number }> = {};
async function balances(): Promise<Record<string, { bal: Record<string, number>; locked: Record<string, number>; credits: number }>> {
  const d = await jget(`${DEX}/state`);
  for (const w of (d?.wallets ?? []) as any[]) {
    if (w?.name) W[String(w.name).toLowerCase()] = {
      bal: (w.balances ?? {}) as Record<string, number>,
      locked: (w.locked ?? {}) as Record<string, number>,
      credits: Number(w.credits ?? 0),
    };
  }
  return W;
}

/* ── v2 · anchor חי-מהשוק: markets.fair ← poolMid ← ladder.refPrice ── */
type Market = { anchor: number; bestBid: number; bestAsk: number; poolMid: number; fair: number };
async function market(): Promise<Market> {
  const d = await jget(`${DEX}/state`);
  const mk = ((d?.markets ?? []) as any[]).find((m) => m?.key === "SAOS/USDS") ?? {};
  const ladder = d?.state?.ladder ?? {};
  const fair = Number(mk.fair ?? 0);
  const poolMid = Number(mk.poolMid ?? 0);
  const refPrice = Number(ladder.refPrice ?? 0);
  const anchor = fair > 0 ? fair : (poolMid > 0 ? poolMid : refPrice);
  if (!(anchor > 0)) throw new Error("אין-anchor-חי (fair/poolMid/refPrice)");
  return {
    anchor,
    bestBid: Number(mk.bestBid ?? 0),
    bestAsk: Number(mk.bestAsk ?? 0),
    poolMid,
    fair,
  };
}

async function xfer(from: string, to: string, asset: string, amountMu: number): Promise<boolean> {
  try {
    const d = await jpost(`${DEX}/transfer`, { from, to, asset, amountMu });
    if (!d?.ok) {
      console.log(`[army] xfer-נכשל ${from}→${to} ${amountMu}µ ${asset}: ${d?.error ?? "?"}`); // כנות-מלאה (כולל-operator)
      if (S[from]) S[from].lastErr = `xfer: ${d?.error ?? "?"}`;
      return false;
    }
    return true;
  } catch (e) {
    console.log(`[army] xfer-שגיאה ${from}→${to}: ${String(e).slice(0, 110)}`);
    if (S[from]) S[from].lastErr = String(e).slice(0, 110);
    return false;
  }
}

async function cancelOrder(orderId: number, issuer: string): Promise<boolean> {
  try {
    const d = await jpost(`${DEX}/cancel`, { orderId, issuer });
    return !!d?.ok;
  } catch { return false; }
}

async function fundCycle(bals: ReturnType<typeof balances> extends Promise<infer T> ? T : never): Promise<void> {
  for (const s of SOLDIERS) {
    const b = bals[s]?.bal ?? {};
    const usds = Number(b.USDS ?? 0), saos = Number(b.SAOS ?? 0);
    if (usds < BANK_USDS_MU) {
      const need = Math.min(BANK_USDS_MU - usds, 2_000_000);
      if (await xfer("operator", s, "USDS", need)) { S[s].fundedUsds += need; console.log(`[army] מימון ${s}: +${need}µ USDS (בנק-יעד ${BANK_USDS_MU}µ)`); }
    }
    if (saos < SAOS_SEED_MU) {
      const need = Math.min(SAOS_SEED_MU - saos, 2_000_000);
      if (await xfer("operator", s, "SAOS", need)) { S[s].fundedSaos += need; console.log(`[army] מימון ${s}: +${need}µ SAOS`); }
    }
    /* ניתוב-רווחים: עודף-יציב חוזר למפעיל → הזדמנויות-חדשות (msg-8) · גם-SAOS */
    if (usds > SWEEP_ABOVE_MU) {
      const excess = usds - BANK_USDS_MU;
      if (await xfer(s, "operator", "USDS", excess)) { S[s].swept += excess; console.log(`[army] ניתוב-רווחים ${s}: ${excess}µ USDS → operator`); }
    }
    if (saos > SAOS_SEED_MU * 1.5) {
      const excessS = saos - SAOS_SEED_MU;
      if (await xfer(s, "operator", "SAOS", excessS)) { S[s].swept += excessS; console.log(`[army] ניתוב-עודף ${s}: ${excessS}µ SAOS → operator`); }
    }
  }
}

const seenFilled: Record<string, number> = {};
async function gridCycle(mk: Market, bals: ReturnType<typeof balances> extends Promise<infer T> ? T : never): Promise<void> {
  const gridPx = Math.max(1, Math.round(mk.anchor * GRID_BPS / 10_000));
  const stalePx = Math.max(3, Math.round(mk.anchor * STALE_BPS / 10_000));
  for (const s of SOLDIERS) {
    try {
      const mine = await jget(`${DEX}/my-orders?issuer=${s}`);
      const orders: any[] = mine?.orders ?? [];
      for (const o of orders) {
        const prev = seenFilled[String(o.id)] ?? 0;
        const now = Number(o.filled ?? 0);
        if (now > prev) S[s].filledMu += now - prev;
        seenFilled[String(o.id)] = now;
      }
      /* v2 · ביטול-פקודות-מתות: רחוקות-מה-anchor החי — משחרר-נעולים ומונע-ספר-זומבי */
      let cancelsLeft = MAX_CANCELS_PER_CYCLE;
      for (const o of orders) {
        if (cancelsLeft <= 0) break;
        if (Math.abs(Number(o.price) - mk.anchor) > stalePx) {
          if (await cancelOrder(Number(o.id), s)) { S[s].canceled++; cancelsLeft--; delete seenFilled[String(o.id)]; console.log(`[army] ${s}: ביטול-פקודה-מתה #${o.id} @ ${o.price} (anchor ${mk.anchor})`); }
        }
      }
      /* דלק: רצפת FUEL_ASK_MIN — לא-אבק-גז (גרעין: בקשות-זעירות לא-מועילות) */
      const credits = bals[s]?.credits ?? 0;
      if (credits < FUEL_FLOOR) {
        try {
          const f = await jpost(`${DEX}/fuel`, { to: s, amount: FUEL_TARGET });
          if (f?.ok) { S[s].fuel++; console.log(`[army] דלק ${s}: ${String(f.note ?? `→${FUEL_TARGET}`).slice(0, 90)}`); }
          else { S[s].rejected++; S[s].lastErr = `fuel: ${f?.error}`; console.log(`[army] דלק-נכשל ${s}: ${f?.error}`); }
        } catch (e) { S[s].lastErr = `fuel: ${String(e).slice(0, 90)}`; }
      }
      if (orders.length >= MAX_ORDERS) continue;

      /* v2 · תמחור-חי:
       *  BID — עלייה-לראש-התור: min(bestBid, anchor+gridPx), ואם-התור-נמוך → anchor−gridPx
       *  ASK — מעל-ה-BID הטוב ב-1 לפחות; כשצד-האסק-ריק זו-ההצבה-הראשונה-בספר
       *       (הבריכה משלמת poolMid+30bps — זרימת-קונים אמיתית תיתקל-בנו קודם) */
      const targetBid = mk.anchor - gridPx;
      let bid = targetBid;
      if (mk.bestBid > 0) bid = Math.min(Math.max(mk.bestBid, targetBid), mk.anchor + gridPx);
      let ask = mk.anchor + gridPx;
      if (mk.bestAsk > 0) {
        const a = Math.min(Math.max(mk.bestBid + 1, ask), mk.bestAsk - 1);
        if (a < mk.bestBid + 1) continue; // ספר-נעול — אין-מקום-חוקי-לאסק
        ask = a;
      } else {
        ask = Math.max(mk.bestBid + 1, ask);
      }
      const hasSide = (side: string, price: number) => orders.some((o) => o.side === side && Math.abs(Number(o.price) - price) <= Math.max(2, mk.anchor * 0.001));
      const usds = Number(bals[s]?.bal?.USDS ?? 0), saos = Number(bals[s]?.bal?.SAOS ?? 0);
      if (!hasSide("buy", bid) && usds - BUY_FLOOR_MU >= bid * ORDER_AMT_MU / 1000) {
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "buy", price: bid, amount: ORDER_AMT_MU, issuer: s, postOnly: true });
        if (r?.ok) { S[s].placed++; console.log(`[army] ${s}: BID ${ORDER_AMT_MU}µ @ ${bid} (anchor ${mk.anchor} · bidTop ${mk.bestBid})`); } else { S[s].rejected++; S[s].lastErr = `bid: ${r?.error}`; }
      }
      if (!hasSide("sell", ask) && saos >= ORDER_AMT_MU * 2) {
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "sell", price: ask, amount: ORDER_AMT_MU, issuer: s, postOnly: true });
        if (r?.ok) { S[s].placed++; console.log(`[army] ${s}: ASK ${ORDER_AMT_MU}µ @ ${ask} (anchor ${mk.anchor} · askSide ${mk.bestAsk || "ריק!"})`); } else { S[s].rejected++; S[s].lastErr = `ask: ${r?.error}`; }
      }
    } catch (e) { S[s].lastErr = String(e).slice(0, 110); }
  }
  lastAnchor = mk.anchor; lastBestBid = mk.bestBid; lastBestAsk = mk.bestAsk; cycles++;
}

let cycles = 0, lastAnchor = 0, lastBestBid = 0, lastBestAsk = 0, lastErr = "", bootedAt = Date.now();
async function tick(): Promise<void> {
  try {
    const bals = await balances();
    await fundCycle(bals);
    const mk = await market();
    await gridCycle(mk, bals);
    lastErr = "";
  } catch (e) { lastErr = String(e).slice(0, 140); console.log(`[army] tick-error: ${lastErr}`); }
}

Bun.serve({
  port: PORT,
  fetch: () => Response.json({
    ok: true, service: "soldier-army", version: 2, port: PORT,
    mandate: "בנק-יציב 300µ·יח' פר-חייל · מילוי-מתמשך · ניתוב-רווחים (msg-8 + פקודת-בעלים 2026-10-17)",
    market: { anchor: lastAnchor, bestBid: lastBestBid, bestAsk: lastBestAsk, gridBps: GRID_BPS, staleBps: STALE_BPS },
    soldiers: SOLDIERS.map((s) => ({ id: s, ...S[s] })),
    cycles, bankUsdsMu: BANK_USDS_MU,
    lastErr: lastErr || null, upSec: Math.round((Date.now() - bootedAt) / 1000),
  }),
});

console.log(`[army v2] חי על :${PORT} · ${SOLDIERS.length} חיילים · בנק ${BANK_USDS_MU}µ USDS פר-חייל · גריד-מודע-שוק (anchor-חי · ביטול-זומבים · דלק-רצפת ${FUEL_FLOOR})`);
void tick();
setInterval(() => void tick(), CYCLE_MS);
