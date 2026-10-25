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
import fs, { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
// G73 (§2 · 19.93 prediction-1): the organ plane's FIRST PRODUCTION consumer of the
// all-soldier census — the army beat reads the live book tail and measures activation.
import { censusFromBook, type BookCensus, type BookRecord } from "../self-financing-engine/roster-from-book.ts";

const DEX = "http://127.0.0.1:3010/saos-dex/api/dex";
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

/* גל-93 · פליטת-אירועי-פעולה מובנים — החומר-הגלם לביקורת-מסלול בלתי-תלויה (iFixAi).
 * כל-פעולה-אמיתית (הזמנה/דלק/העברה) נרשמת כאן: מי · מה · על-איזה-משאב · תוצאה · עלות.
 * הביקורת (sovereign-audit :3022) קוראת את הקובץ-הזה ומקפיאה-הוכחות. כשל-כתיבה לעולם-לא-מפיל-מסחר. */
const ACTIONS_FILE = path.join(import.meta.dir, "state", "actions.jsonl");
function act(actor: string, action: string, resource: string, args: Record<string, unknown>, outcome: "ok" | "denied" | "error", costUnits: number, detail = ""): void {
  try {
    mkdirSync(path.dirname(ACTIONS_FILE), { recursive: true });
    /* sem:"gal-16" = חתימת-סמנטיקה: הצבה=escrow (עלות-0) · מילוי=הוצאה-אמת · דופק=עמלה-אמת.
     * המבקר מסכם-תקציב רק על אירועים חתומים — ההיסטוריה-הישנה נמדדה בסמנטיקה-שגויה
     * (ציטוט-נספר-כהוצאה) ולכן אינה-ראיה על זרימת-הון. */
    appendFileSync(ACTIONS_FILE, JSON.stringify({ ts: Date.now(), sem: "gal-16", actor, action, resource, args, outcome, cost_units: costUnits, detail: String(detail).slice(0, 160) }) + "\n");
  } catch { /* ביקורת-לעולם-לא-מפילה-מסחר */ }
}

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
    if (!d?.ok) { if (S[from]) S[from].lastErr = `xfer: ${d?.error ?? "?"}`; act(from, "xfer", to, { asset, amountMu }, "error", 0, d?.error ?? ""); return false; }
    act(from, "xfer", to, { asset, amountMu }, "ok", 0);
    return true;
  } catch (e) { if (S[from]) S[from].lastErr = String(e).slice(0, 110); act(from, "xfer", to, { asset, amountMu }, "error", 0, String(e)); return false; }
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
  /* גל-16 · עוגן-אמת: קודם שוק-האמת (fair = מיזוג ספר+בריכה), נפילות-סודרות:
   * poolMid → refPrice. נמדד חי: העוגן-הישן (refPrice=1009) נטה 3.1% מהשוק-החי
   * (fair=1040) → צד-המכירה נשאר ריק והסלוטים נחטפים בבידים-מתים → אפס-חציות. */
  const mks: any[] = Array.isArray(st?.markets) ? st.markets : [];
  const mk = mks.find((m) => m?.key === "SAOS/USDS") ?? {};
  const fairRaw = Number(mk.fair) || Number(mk.poolMid) || Number(stt?.ladder?.refPrice ?? 0);
  const fair = Math.round(fairRaw);
  if (!(fair > 0)) throw new Error("אין-fair");
  const bid = Math.floor(fair * (1 - GRID_BPS / 10_000));
  const ask = Math.ceil(fair * (1 + GRID_BPS / 10_000));
  const bals = await balances();
  const STALE_BPS = 60; // פקודה שנטתה מעבר-לזה מהשוק-החי = זומבי — מתבטלת
  /* גל-HF (2026-10-24 · מנדט-#37 §2): חיילים במקביל — כל-חייל עצמאי לגמרי
   * (פקודות-משלו, משמעת-בנק-משלו, escrow-משלו) → קיר-זמן של מחזור יורד ~6x,
   * ועם הדופק 45ש׳ — עד ~12x תדירות-רענון-פקודות. allSettled: חייל-שנכשל
   * לעולם לא מפיל את הסגל. */
  const soldierWork = async (s: string): Promise<void> => {
    try {
      const mine = await jget(`${DEX}/my-orders?issuer=${s}`);
      const orders: any[] = mine?.orders ?? [];
      for (const o of orders) {
        const prev = seenFilled[String(o.id)] ?? 0;
        const now = Number(o.filled ?? 0);
        if (now > prev) {
          S[s].filledMu += now - prev;
          /* גל-16 · מילוי = העברת-הון-אמת — נרשם כאירוע-עלות לביקורת-המסלול (iFixAi) */
          act(s, "fill", "SAOS/USDS", { orderId: String(o.id).slice(0, 12), filledMu: now - prev, price: Number(o.price ?? 0) }, "ok", now - prev, "מילוי-ספר-אמת");
        }
        seenFilled[String(o.id)] = now;
      }
      /* גל-16 · ציד-זומבים: פקודה שהתרחקה מעבר ל-STALE_BPS מהשוק-החי לעולם לא תיחתך
       * במחיר-צדק — היא רק חוטפת סלוט (תקרה 4) ומשאירה את הצד-השני ריק. מתבטלת. */
      for (const o of orders) {
        const px = Number(o.price ?? 0);
        if (!(px > 0)) continue;
        if (Math.abs(px - fair) * 10_000 > STALE_BPS * fair) {
          try {
            const c = await jpost(`${DEX}/cancel`, { orderId: Number(o.id), issuer: s });
            if (c?.ok) { console.log(`[army] ${s}: זומבי-נטבח order#${o.id} @ ${px} (fair ${fair})`); act(s, "cancel", "SAOS/USDS", { orderId: o.id, price: px, fair }, "ok", 0, "stale>60bps"); }
            else act(s, "cancel", "SAOS/USDS", { orderId: o.id, price: px, fair }, "denied", 0, c?.error ?? "");
          } catch (e) { S[s].lastErr = `cancel: ${String(e).slice(0, 90)}`; }
        }
      }
      const live = orders.filter((o) => Math.abs(Number(o.price ?? 0) - fair) * 10_000 <= STALE_BPS * fair);
      if (live.length >= MAX_ORDERS) return; // גל-HF: בתוך-פונקציית-חץ — return במקום continue
      const hasSide = (side: string, price: number) => live.some((o) => o.side === side && Math.abs(Number(o.price) - price) <= Math.max(2, fair * 0.001));
      const usds = Number(bals[s]?.bal?.USDS ?? 0), saos = Number(bals[s]?.bal?.SAOS ?? 0);
      if ((bals[s]?.credits ?? 0) < 400) {
        try {
          const f = await jpost(`${DEX}/fuel`, { to: s, amount: 600 });
          if (f?.ok) { S[s].fuel++; console.log(`[army] דלק ${s}: ${String(f.note ?? "").slice(0, 90)}`); }
          else { S[s].rejected++; S[s].lastErr = `fuel: ${f?.error}`; }
          act(s, "fuel", "credits", { amount: 600 }, f?.ok ? "ok" : "denied", 0, f?.error ?? "");
        } catch (e) { S[s].lastErr = `fuel: ${String(e).slice(0, 90)}`; }
      }
      if (!hasSide("buy", bid) && usds - BUY_FLOOR_MU >= bid * ORDER_AMT_MU / 1000) {
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "buy", price: bid, amount: ORDER_AMT_MU, issuer: s, postOnly: true });
        if (r?.ok) { S[s].placed++; console.log(`[army] ${s}: BID ${ORDER_AMT_MU}µ @ ${bid} (fair ${fair})`); } else { S[s].rejected++; S[s].lastErr = `bid: ${r?.error}`; }
        /* גל-16 · סמנטיקת-עלות-כנה: הצבה = escrow (אפס-עלות) — העלות-האמיתית נרשמת רק במילוי.
         * המבקר (iFixAi) מודד זרימת-הון-אמת מול תקרת-הבנק, לא זרימת-ציטוט. */
        act(s, "order", "SAOS/USDS", { side: "buy", price: bid, amount: ORDER_AMT_MU, postOnly: true }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
      }
      if (!hasSide("sell", ask) && saos >= ORDER_AMT_MU * 2) {
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "sell", price: ask, amount: ORDER_AMT_MU, issuer: s, postOnly: true });
        if (r?.ok) { S[s].placed++; console.log(`[army] ${s}: ASK ${ORDER_AMT_MU}µ @ ${ask} (fair ${fair})`); } else { S[s].rejected++; S[s].lastErr = `ask: ${r?.error}`; }
        act(s, "order", "SAOS/USDS", { side: "sell", price: ask, amount: ORDER_AMT_MU, postOnly: true }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
      }
    } catch (e) { S[s].lastErr = String(e).slice(0, 110); }
  };
  await Promise.allSettled(SOLDIERS.map((s) => soldierWork(s)));
  lastFair = fair; cycles++;
}

/* ═══ גל-16 · מנגנון-הדופק (MARKET-PULSE) ═══════════════════════════════════
 * נמדד-חי (2026-10-18): feeMeter נוגע ברצפה LADDER_FUEL_FLOOR=8000 → המזרקה
 * (mint_fuel) מתה (meterAvail=0) → כל-סולם-המממנים יבש → הבוטים מתים → אפס-חציות
 * → אפס-עמלות → אפס-גז. טרמינציה-מלאה של השוק.
 * השבירה החוקית: סוואפ-אמת דרך הבריכה מזרים עמלת-אוצר ישר ל-meter (amm.ts:120,
 * נמדד: 20,000µ → +30µ) → כשה-meter חוצה 9,000 המזרקה מדליקה mint_fuel →
 * סולם-הסטיפנד מחייה את-הגריד כולו. הדופק = חשמל-שוק אמיתי: מלאי-אמת, עמלה אמיתית,
 * מגובה-בנק-החיילים (מעל רצפת-הקנייה). כיוון-מתחלף = נטרול-הטייה-כיוונית. */
const PULSE_SIZE_MU = 100_000;      // סוואפ-דופק: 100 יח' — עמלת-אוצר ≈150µ פר-פעימה
const PULSE_FROZEN_CYCLES = 3;      // כמה-מחזורים בלי-מילוי → דופק
const PULSE_METER_IGNITE = 9_000;   // סף-הדלקת-המזרקה (feeMeter≥9,000 → mint_fuel)
let lastFillsSeen = -1, frozenCycles = 0, pulseDir: "USDS" | "SAOS" = "USDS";
let pulses = 0, pulseFeeMu = 0, lastPulseAt = 0, pulseErr = "";

async function marketPulse(fillsNow: number, feeMeter: number): Promise<void> {
  if (fillsNow === lastFillsSeen) frozenCycles++; else { frozenCycles = 0; lastFillsSeen = fillsNow; }
  if (frozenCycles < PULSE_FROZEN_CYCLES) return;      // השוק נושם — אין-צורך-בדופק
  if (feeMeter >= PULSE_METER_IGNITE) return;          // המזרקה חיה — הדופק מיותר
  // החייל-המדופם: העשיר-ביותר-מעל-רצפת-הקנייה (סבבי)
  const bals = await balances();
  const rich = SOLDIERS
    .map((s) => ({ s, usds: Number(bals[s]?.bal?.USDS ?? 0), saos: Number(bals[s]?.bal?.SAOS ?? 0) }))
    .filter((x) => (pulseDir === "USDS" ? x.usds - BUY_FLOOR_MU >= PULSE_SIZE_MU : x.saos >= PULSE_SIZE_MU * 2))
    .sort((a, b) => (pulseDir === "USDS" ? b.usds - a.usds : b.saos - a.saos))[0];
  if (!rich) { pulseErr = "אין-חייל-מתאים-לדופק"; return; }
  try {
    const assetIn = pulseDir, amount = PULSE_SIZE_MU;
    const q = await jget(`${DEX}/swap?pair=SAOS/USDS&assetIn=${assetIn}&amount=${amount}`);
    const out = Number(q?.out ?? 0);
    if (!(out > 0)) { pulseErr = `quote:${q?.error ?? "אפס"}`; return; }
    const minOut = Math.floor(out * 0.98);            // מגן-החלקה 2%
    const r = await jpost(`${DEX}/swap`, { pair: "SAOS/USDS", assetIn, amount, minOut, issuer: rich.s });
    if (r?.ok) {
      pulses++; lastPulseAt = Date.now(); pulseFeeMu += Math.floor(amount * 0.0015);
      pulseErr = ""; frozenCycles = 0;
      pulseDir = pulseDir === "USDS" ? "SAOS" : "USDS";  // מתחלף-כיוון
      console.log(`[army] דופק ${rich.s}: ${amount}µ ${assetIn}→SAOS/USDS (out≈${out}) — עמלה→meter (feeMeter ${feeMeter})`);
      act(rich.s, "pulse-swap", "SAOS/USDS", { assetIn, amount, minOut }, "ok", Math.floor(amount * 0.003), `feeMeter=${feeMeter} עמלת-חשמל-שוק אמת`);
    } else { pulseErr = `swap:${r?.error ?? "?"}`; act(rich.s, "pulse-swap", "SAOS/USDS", { assetIn, amount }, "denied", 0, pulseErr); }
  } catch (e) { pulseErr = String(e).slice(0, 110); }
}

let cycles = 0, lastFair = 0, lastErr = "", bootedAt = Date.now();
// G73 §2 census state (measured, honest — null until the first live book read lands)
let census: BookCensus | null = null;
let censusAt = 0;
let censusErr = "";
const ECONOMY_BOOK = "http://127.0.0.1:3016/ledger?limit=500";
async function measureCensus(): Promise<void> {
  try {
    const r = await jget(ECONOMY_BOOK);
    const tail: BookRecord[] = Array.isArray(r?.tail) ? r.tail : [];
    const c = censusFromBook(tail, Date.now(), 6);
    census = c; censusAt = Date.now(); censusErr = "";
    if (cycles % 20 === 0) {
      console.log(`[army] census: roster ${c.rosterSize} · active ${c.activeCount} (${c.activationPct}%) · window ${c.windowHours}h · records ${tail.length}`);
    }
  } catch (e) { censusErr = String(e).slice(0, 110); }
}
async function tick(): Promise<void> {
  try {
    const bals = await balances();
    await fundCycle(bals);
    await gridCycle();
    // G73 §2: the all-soldier census — a live book read, never fatal to trading
    try { await measureCensus(); } catch { /* census never kills the beat */ }
    // גל-16: מדידה-אחרי-מחזור — דופק-רק-כשהשוק קפוא-והמזרקה יבשה
    try {
      const st2 = await jget(`${DEX}/state`);
      const stt2 = st2?.state ?? st2;
      await marketPulse(Number(stt2?.fills ?? -1), Number(stt2?.feeMeter ?? 0));
    } catch { /* מדידת-דופק לעולם-לא-מפילה-מסחר */ }
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
    pulse: { pulses, pulseFeeMu, frozenCycles, dir: pulseDir, lastPulseAgoSec: lastPulseAt ? Math.round((Date.now() - lastPulseAt) / 1000) : null, err: pulseErr || null },
    census: census ? { rosterSize: census.rosterSize, activeCount: census.activeCount, activationPct: census.activationPct, windowHours: census.windowHours, measuredAt: censusAt ? new Date(censusAt).toISOString() : null } : null,
    censusErr: censusErr || null,
    lastErr: lastErr || null, upSec: Math.round((Date.now() - bootedAt) / 1000),
  }),
});

console.log(`[army] חי על :${PORT} · ${SOLDIERS.length} חיילים · בנק ${BANK_USDS_MU}µ USDS פר-חייל · דופק-שוק gal-16 חי`);
void tick();
setInterval(() => void tick(), 45_000); // גל-HF (#37 §2): 90ש׳→45ש׳
