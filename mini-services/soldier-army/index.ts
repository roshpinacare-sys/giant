/* ═══ soldier-army · פורט 3018 · חיילים אמיתיים על בנק-יציב ══════════════════
 * מנדט-בעלים (2026-10-17): "קח חיילים על 300 באנק יציב — מפסיד פחות" +
 * msg-8: מימון-חיילים לסחר-אוטומטי · מילוי-מתמשך · ניתוב-רווחים.
 *
 * אמת:
 *  · זהויות = אותם-חיילי-כלכלה (yarden/tamar/shachar/aluf/erez/gal) — צי-אחד.
 *  · מימון: xfer_free (THE-SWEEP, גז-0, תקרה-קנונית) מהמפעיל — אפס-הטבעה.
 *  · מסחר: THE-LEGION (EXEC-CD-22) — פקודות postOnly ב issuer-החייל, יתרות-משלו
 *    נעולות-escrow בגרעין. אפס-סימולציה: כל-מילוי הוא מילוי-ספר-אמת.
 *  · משמעת-בנק: יעד-בנק 300,000µ USDS פר-חייל · תחתית-קנייה 150,000µ ·
 *    ניתוב-רווחים: עודף-מעל 450,000µ נסחט חזרה למפעיל (xfer_free, גז-0).
 *  · אפס-סודות כאן: הטוקן נקרא מ-operator.env של saos-dex-node (chmod 600).
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
const GRID_BPS = 20;               // רוחב-גריד סביב ה-fair

type SoldierState = {
  fundedUsds: number; fundedSaos: number; swept: number; fuel: number;
  placed: number; rejected: number; filledMu: number; lastErr: string;
};
const S: Record<string, SoldierState> = {};
for (const s of SOLDIERS) S[s] = { fundedUsds: 0, fundedSaos: 0, swept: 0, fuel: 0, placed: 0, rejected: 0, filledMu: 0, lastErr: "" };

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

const W: Record<string, { bal: Record<string, number>; credits: number }> = {};
async function balances(): Promise<Record<string, { bal: Record<string, number>; credits: number }>> {
  const d = await jget(`${DEX}/state`);
  for (const w of (d?.wallets ?? []) as any[]) {
    if (w?.name) W[String(w.name).toLowerCase()] = { bal: (w.balances ?? {}) as Record<string, number>, credits: Number(w.credits ?? 0) };
  }
  return W;
}

async function xfer(from: string, to: string, asset: string, amountMu: number): Promise<boolean> {
  try {
    const d = await jpost(`${DEX}/transfer`, { from, to, asset, amountMu });
    if (!d?.ok) { if (S[from]) S[from].lastErr = `xfer: ${d?.error ?? "?"}`; return false; }
    return true;
  } catch (e) { if (S[from]) S[from].lastErr = String(e).slice(0, 110); return false; }
}

async function fundCycle(bals: Record<string, { bal: Record<string, number>; credits: number }>): Promise<void> {
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
async function gridCycle(): Promise<void> {
  const st = await jget(`${DEX}/state`);
  const stt = st?.state ?? st;
  const fair = Number(stt?.ladder?.refPrice ?? stt?.fair ?? 0);
  if (!(fair > 0)) throw new Error("אין-fair");
  const bid = Math.floor(fair * (1 - GRID_BPS / 10_000));
  const ask = Math.ceil(fair * (1 + GRID_BPS / 10_000));
  const bals = await balances();
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
      if (orders.length >= MAX_ORDERS) continue;
      const hasSide = (side: string, price: number) => orders.some((o) => o.side === side && Math.abs(Number(o.price) - price) <= Math.max(2, fair * 0.001));
      const usds = Number(bals[s]?.bal?.USDS ?? 0), saos = Number(bals[s]?.bal?.SAOS ?? 0);
      if ((bals[s]?.credits ?? 0) < 400) {
        try {
          const f = await jpost(`${DEX}/fuel`, { to: s, amount: 600 });
          if (f?.ok) { S[s].fuel++; console.log(`[army] דלק ${s}: ${String(f.note ?? "").slice(0, 90)}`); }
          else { S[s].rejected++; S[s].lastErr = `fuel: ${f?.error}`; }
        } catch (e) { S[s].lastErr = `fuel: ${String(e).slice(0, 90)}`; }
      }
      if (!hasSide("buy", bid) && usds - BUY_FLOOR_MU >= bid * ORDER_AMT_MU / 1000) {
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "buy", price: bid, amount: ORDER_AMT_MU, issuer: s, postOnly: true });
        if (r?.ok) { S[s].placed++; console.log(`[army] ${s}: BID ${ORDER_AMT_MU}µ @ ${bid} (fair ${fair})`); } else { S[s].rejected++; S[s].lastErr = `bid: ${r?.error}`; }
      }
      if (!hasSide("sell", ask) && saos >= ORDER_AMT_MU * 2) {
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "sell", price: ask, amount: ORDER_AMT_MU, issuer: s, postOnly: true });
        if (r?.ok) { S[s].placed++; console.log(`[army] ${s}: ASK ${ORDER_AMT_MU}µ @ ${ask} (fair ${fair})`); } else { S[s].rejected++; S[s].lastErr = `ask: ${r?.error}`; }
      }
    } catch (e) { S[s].lastErr = String(e).slice(0, 110); }
  }
  lastFair = fair; cycles++;
}

let cycles = 0, lastFair = 0, lastErr = "", bootedAt = Date.now();
async function tick(): Promise<void> {
  try {
    const bals = await balances();
    await fundCycle(bals);
    await gridCycle();
    lastErr = "";
  } catch (e) { lastErr = String(e).slice(0, 140); console.log(`[army] tick-error: ${lastErr}`); }
}

Bun.serve({
  port: PORT,
  fetch: () => Response.json({
    ok: true, service: "soldier-army", port: PORT,
    mandate: "בנק-יציב 300µ·יח' פר-חייל · מילוי-מתמשך · ניתוב-רווחים (msg-8 + פקודת-בעלים 2026-10-17)",
    soldiers: SOLDIERS.map((s) => ({ id: s, ...S[s] })),
    cycles, lastFair, bankUsdsMu: BANK_USDS_MU, gridBps: GRID_BPS,
    lastErr: lastErr || null, upSec: Math.round((Date.now() - bootedAt) / 1000),
  }),
});

console.log(`[army] חי על :${PORT} · ${SOLDIERS.length} חיילים · בנק ${BANK_USDS_MU}µ USDS פר-חייל`);
void tick();
setInterval(() => void tick(), 90_000);
