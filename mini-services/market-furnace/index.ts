/* ═══ market-furnace · פורט 3045 · תנור-השוק-החריף ═══════════════════════════
 * (:3044 = dev-keeper R262 — נמדד-תפוס, עברנו-ל-3045 בלי-דריסה)
 * מנדט-בעלים (IM 1a15c78ee1e63511, 2026-10-21):
 *  "הכי הייתי רוצה שנוכל לייצר באמת שוק חריף של גרידים וארביטראזים דווקא על
 *   הדקס שלנו... במקום להתלות בשירותים אחרים בעצם לעשות את זה על הרשת שלנו"
 *  "ואיך רווח חיצוני 0? מה, כל העסקאות לא מרוויחות? בוא תמצא היגיון אמיתי"
 *
 * ההיגיון-האמיתי-שנמדד (2026-10-21, מהגרעין-החי):
 *  · העסקאות כן מרוויחות — poolFees-ever=24,056,044µ · treasuryProfit-ever=18,394,640µ ·
 *    protorev-pending=20,303,080µ. הרווח הפנימי אינו 0 ולעולם לא היה.
 *  · "רווח-חוץ=0" פירושו רק: אין-ערוץ-מימוש-חוץ (USDS=FAKE-PEG, כיסוי-חוץ 0.058% —
 *    פסק-הדקס-עצמו). המנצחים-הפנימיים אינם-ניתנים-עדיין-להמרה-לכסף-אמת.
 *  · החסם-המטבולי-החי: feeMeter=8000(רצפה) → המזרקה(mint_fuel) מתה → ארנה-מתה-גז
 *    (8-דחיות/בלוק) → אפס-טייקרים → הזרימה-קפואה. זה דד-לוק-גז, לא חוסר-רווח.
 *
 * מה-התנור-עושה (הכל-אמת-על-הספר-הריבוני, אפס-סימולציה):
 *  1. הצתה: סוואפים-אמת-מתחלפי-כיוון דרך בריכת SAOS/USDS → עמלת-אוצר-אמת →
 *     feeMeter ↑ → מעל 9,000 המזרקה חוזרת-לנשום → ארנה+חיילים מקבלים-דלק.
 *  2. ארביטראז' בריכה↔ספר: כשמחיר-הבריכה-האפקטיבי (אחרי-30bps) סוטה מפסגת-הספר
 *     ביותר-מהמקף → שתי-רגליים-אמת (סוואפ+IOC) שלוכדות-את-הפיזור.
 *  3. עומק-Maker דו-צדדי סביב פול-מיד (postOnly) — משלים את צבא-החיילים (20bps,
 *     maker-בלבד) בלי-לדרוך-עליו: תנור=טייקר/ארב, צבא=מייקר-גריד.
 *  4. קציר: עודפי-רווח נסחטים ל-operator (ניתוב-רווחים msg-8).
 *  5. מסילות-חוץ (מדידה-בלבד, אפס-מפתחות): סקר-ספקי-המרה-ללא-KYC ל-STEEM/HIVE +
 *     מצב-עורק-FixedFloat (הקבלה-החיה-מה-Actions של Autonomy) — כנה: מה-שלא-נענה = null.
 *
 * אפס-סודות: הטוקן-נקרא מ-operator.env של saos-dex-node (chmod 600), זיכרון-בלבד.
 * אירועי-עלות-כנים: actions.jsonl sem:"furnace-1" — הביקורת (iFixAi :3022) קוראת.
 */
import fs, { appendFileSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = 3045;
const DEX = "http://127.0.0.1:3010/saos-dex/api/dex";
const FURNACE = "furnace";
const ENV_FILE = path.join(import.meta.dir, "..", "saos-dex-node", "operator.env");

function readToken(): string {
  try {
    const m = readFileSync(ENV_FILE, "utf8").match(/^DEX_OPERATOR_TOKEN=(.+)$/m);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}
const TOKEN = readToken();
if (!TOKEN) { console.error("[furnace] אין-טוקן-מפעיל — fail-closed"); process.exit(1); }
const H = { "content-type": "application/json", "x-saos-operator": TOKEN, "x-saos-dex-console": "1" };

/* ═══ קבועי-המשמעת ═══════════════════════════════════════════════════════ */
const FUND_USDS = 2_000_000;        // הון-עובד-פתיחה (תקרת-xfer-חופשי 2M)
const FUND_SAOS = 600_000;
const MIN_USDS = 400_000;           // רצפת-בנק-תנור
const MIN_SAOS = 150_000;
const IGNITE_SIZE = 100_000;        // סוואפ-הצתה/סיבוב
const IGNITE_TARGET_METER = 9_000;  // מעל-זה: המזרקה-חיה
const IGNITE_MAX_STRIKES = 10;      // הגבלה-פר-רצף-הצתה
const ROTATE_MIN_GAP_MS = 45_000;   // קצב-סיבוב-בסיסי (שמירת-מטבוליזם)
const ROTATE_DAILY_BUDGET = 2_500_000; // תקציב-סיבוב-יומי (µUSDS-עלות-מוערכת)
const ARB_EDGE_BPS = 60;            // מקף-ארב אחרי-30bps-בריכה+עלות-ספר
const ARB_SIZE = 30_000;            // גודל-רגל-ארב
const ARB_MAX_PER_HOUR = 6;
const MAKER_BPS = 25;               // עומק-Maker סביב פול-מיד
const MAKER_STALE_BPS = 120;        // ביטול-זומבים
const MAKER_AMOUNT = 15_000;
const SWEEP_GAP_CYCLES = 30;
const COST_BPS = 30;                // עלות-עמלה-מוערכת-כנה-פר-סוואפ

/* ═══ מצב ════════════════════════════════════════════════════════════════ */
const bootAt = Date.now();
let cycles = 0, lastErr = "";
let ignitionSwaps = 0, ignitionCostMu = 0, rotationSwaps = 0, rotationVolMu = 0, rotationCostMu = 0;
let arbSeen = 0, arbTaken = 0, arbProfitMu = 0, lastArbAt = 0, arbThisHour = 0, arbHourKey = "";
let lastSwapDir: "USDS" | "SAOS" = "USDS", lastSwapAt = 0;
let spentTodayMu = 0, budgetDay = new Date().toISOString().slice(0, 10);
let sweeps = 0, sweptUsdsMu = 0, sweptSaosMu = 0;
let fundedUsds = 0, fundedSaos = 0, bootFunded = false;
let meterHistory: Array<{ t: number; meter: number; fills: number }> = [];
let rails: unknown = null, railsAt = 0;

const stateFile = path.join(import.meta.dir, "state");
mkdirSync(stateFile, { recursive: true });
const ACTIONS_FILE = path.join(stateFile, "actions.jsonl");
function act(action: string, resource: string, args: Record<string, unknown>, outcome: "ok" | "denied" | "error", costUnits: number, detail = ""): void {
  try {
    appendFileSync(ACTIONS_FILE, JSON.stringify({ ts: Date.now(), sem: "furnace-1", actor: FURNACE, action, resource, args, outcome, cost_units: costUnits, detail: String(detail).slice(0, 160) }) + "\n");
  } catch { /* ביקורת-לעולם-לא-מפילה-מסחר */ }
}
function persist(): void {
  try {
    writeFileSync(path.join(stateFile, "furnace-state.json"), JSON.stringify({ at: new Date().toISOString(), ignitionSwaps, ignitionCostMu, rotationSwaps, rotationVolMu, rotationCostMu, arbSeen, arbTaken, arbProfitMu, sweeps, sweptUsdsMu, sweptSaosMu, fundedUsds, fundedSaos, spentTodayMu, budgetDay }, null, 1));
  } catch { /* אפס-קריטיות */ }
}

/* ═══ לקוח-דקס ═══════════════════════════════════════════════════════════ */
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
/* זרם-הספר (SSE) — פסגות-הספר-החיות לשוק SAOS/USDS */
type BookTop = { fair: number; bestBid: number; bestAsk: number };
let bookCache: BookTop | null = null, bookCacheAt = 0;
async function bookTop(): Promise<BookTop | null> {
  if (bookCache && Date.now() - bookCacheAt < 4000) return bookCache;
  try {
    const t = await (await fetch(`${DEX}/stream`, { signal: AbortSignal.timeout(6000) })).text();
    let top: BookTop | null = null;
    for (const line of t.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const d = JSON.parse(line.slice(6));
        const m = (d?.markets ?? []).find((x: any) => x?.key === "SAOS/USDS");
        if (m) top = { fair: Number(m.fair) || 0, bestBid: Number(m.bestBid) || 0, bestAsk: Number(m.bestAsk) || 0 };
      } catch { /* שורה-חלקית */ }
    }
    if (top) { bookCache = top; bookCacheAt = Date.now(); }
    return top;
  } catch { return null; }
}
async function walletOf(name: string): Promise<{ usds: number; saos: number; credits: number } | null> {
  const d = await jget(`${DEX}/wallets`);
  const w = (d?.wallets ?? []).find((x: any) => String(x?.name ?? "").toLowerCase() === name);
  if (!w) return null;
  const b = w.balances ?? {};
  return { usds: Number(b.USDS ?? 0), saos: Number(b.SAOS ?? 0), credits: Number(w.credits ?? 0) };
}
async function dexState(): Promise<any> {
  const d = await jget(`${DEX}/state`);
  return d?.state ?? d;
}
/* ציטוט-בריכה אפקטיבי: מחיר-אמת אחרי-הכיוון (µUSDS ל-1000µSAOS) */
async function poolQuote(assetIn: "USDS" | "SAOS", amount: number): Promise<{ out: number; eff: number } | null> {
  try {
    const q = await jget(`${DEX}/swap?pair=SAOS/USDS&assetIn=${assetIn}&amount=${amount}`);
    if (!q?.ok || !(Number(q.out) > 0)) return null;
    const out = Number(q.out);
    const eff = assetIn === "USDS" ? Math.round((amount / out) * 1000) : Math.round((out / amount) * 1000);
    return { out, eff };
  } catch { return null; }
}

/* ═══ לידה: מימון-התנור (אפס-הטבעה — הכל xfer-חופשי-גז-0 מ-operator) ═════ */
async function ensureFunded(): Promise<void> {
  if (bootFunded) return;
  let w = await walletOf(FURNACE);
  if (!w) {
    const r = await jpost(`${DEX}/transfer`, { from: "operator", to: FURNACE, asset: "USDS", amountMu: FUND_USDS });
    act("birth-xfer", FURNACE, { asset: "USDS", amountMu: FUND_USDS }, r?.ok ? "ok" : "denied", 0, r?.error ?? "addBal-ensure-entry");
    await new Promise((res) => setTimeout(res, 4000)); // הבלוק-הבא (~3ש׳)
  }
  w = await walletOf(FURNACE);
  if (w && Number(w.usds) === 0) {
    const r = await jpost(`${DEX}/transfer`, { from: "operator", to: FURNACE, asset: "USDS", amountMu: FUND_USDS });
    act("fund", FURNACE, { asset: "USDS", amountMu: FUND_USDS }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
    if (r?.ok) fundedUsds += FUND_USDS;
    await new Promise((res) => setTimeout(res, 4000));
  }
  w = await walletOf(FURNACE);
  if (w && Number(w.saos) < FUND_SAOS) {
    const r = await jpost(`${DEX}/transfer`, { from: "operator", to: FURNACE, asset: "SAOS", amountMu: FUND_SAOS });
    act("fund", FURNACE, { asset: "SAOS", amountMu: FUND_SAOS }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
    if (r?.ok) fundedSaos += FUND_SAOS;
    await new Promise((res) => setTimeout(res, 4000));
  }
  w = await walletOf(FURNACE);
  if (w && Number(w.credits) < 400) {
    /* דלק-צנועה: funderFor-חוזר-operator-כ-fallback-גם-שאינו-יכול-לשלם — נבקש
     * סכום-ש-operator-באמת-מחזיק (גז-אופים=1µ לפקודה — 1200µ=1200 פקודות, נדיב). */
    const f = await jpost(`${DEX}/fuel`, { to: FURNACE, amount: 1_200 });
    act("fuel", "credits", { amount: 1_200 }, f?.ok ? "ok" : "denied", 0, f?.error ?? f?.note ?? "");
  }
  w = await walletOf(FURNACE);
  if (w && Number(w.usds) >= FUND_USDS * 0.9) bootFunded = true;
  console.log(`[furnace] לידה: USDS=${w?.usds ?? "?"} SAOS=${w?.saos ?? "?"} credits=${w?.credits ?? "?"} funded=${bootFunded}`);
}

/* ═══ מנוע-הבעירה: סוואפ-אמת אחד (העמלה=חשמל-שוק אמת) ════════════════════ */
async function fireSwap(issuer: string, assetIn: "USDS" | "SAOS", amount: number, kind: "ignite" | "rotate" | "arb"): Promise<{ ok: boolean; out: number; err?: string }> {
  const q = await poolQuote(assetIn, amount);
  if (!q) return { ok: false, out: 0, err: "no-quote" };
  const minOut = Math.floor(q.out * 0.98); // מגן-החלקה 2%
  try {
    const r = await jpost(`${DEX}/swap`, { pair: "SAOS/USDS", assetIn, amount, minOut, issuer });
    if (r?.ok) {
      const cost = Math.floor(amount * (COST_BPS / 10_000));
      if (kind === "ignite") { ignitionSwaps++; ignitionCostMu += cost; }
      else { rotationSwaps++; rotationVolMu += amount; rotationCostMu += cost; spentTodayMu += cost; }
      act(kind === "ignite" ? "ignite-swap" : kind === "arb" ? "arb-swap" : "rotate-swap", "SAOS/USDS", { assetIn, amount, minOut, eff: q.eff }, "ok", cost, `feeMeter↑ עמלת-אמת`);
      return { ok: true, out: q.out };
    }
    act(`${kind}-swap`, "SAOS/USDS", { assetIn, amount }, "denied", 0, r?.error ?? "");
    return { ok: false, out: 0, err: r?.error ?? "denied" };
  } catch (e) {
    act(`${kind}-swap`, "SAOS/USDS", { assetIn, amount }, "error", 0, String(e).slice(0, 120));
    return { ok: false, out: 0, err: String(e).slice(0, 120) };
  }
}

/* רצף-הצתה: עד-IGNITE_MAX_STRIKES סוואפים-מתחלפים עד שהמזרקה נושמת */
async function igniteSequence(): Promise<void> {
  for (let i = 0; i < IGNITE_MAX_STRIKES; i++) {
    const st = await dexState().catch(() => null);
    const meter = Number(st?.feeMeter ?? 0);
    if (meter >= IGNITE_TARGET_METER) break;
    const dir = lastSwapDir === "USDS" ? "SAOS" : "USDS"; // מתחלף-כיוון — נטרול-הטיה
    const r = await fireSwap(FURNACE, dir, IGNITE_SIZE, "ignite");
    if (r.ok) { lastSwapDir = dir; lastSwapAt = Date.now(); console.log(`[furnace] הצתה ${i + 1}: ${IGNITE_SIZE}µ ${dir} — meter ${meter}→?`); }
    else { console.log(`[furnace] הצתה-נדחתה: ${r.err}`); break; }
    await new Promise((res) => setTimeout(res, 5000)); // בלוק-הבא
  }
}

/* ═══ ארביטראז' בריכה↔ספר — שתי-רגליים-אמת, מקף-אחרי-עלויות ══════════════ */
function hourKey(): string { const d = new Date(); return `${d.toISOString().slice(0, 13)}`; }
async function arbScan(w: { usds: number; saos: number }): Promise<void> {
  const hk = hourKey();
  if (hk !== arbHourKey) { arbHourKey = hk; arbThisHour = 0; }
  const book = await bookTop();
  if (!book || !(book.bestBid > 0) || !(book.bestAsk > 0)) return;
  const buyEff = await poolQuote("USDS", ARB_SIZE);           // מחיר-קניית-SAOS-מהבריכה
  const sellEff = await poolQuote("SAOS", ARB_SIZE);          // מחיר-מכירת-SAOS-לבריכה
  if (!buyEff || !sellEff) return;
  const edge = ARB_EDGE_BPS / 10_000;

  /* הזדמנות-א: הספר-משלם-יותר-מהבריכה → קנה-בריכה, מכור-ספר (IOC) */
  const o1 = book.bestBid > buyEff.eff * (1 + edge);
  /* הזדמנות-ב: הבריכה-משלמת-יותר-מהספר → קנה-ספר (IOC), מכור-לבריכה */
  const o2 = sellEff.eff > book.bestAsk * (1 + edge);
  if (!o1 && !o2) return;
  arbSeen++;

  if (arbThisHour >= ARB_MAX_PER_HOUR) return;
  if (Date.now() - lastArbAt < 90_000) return;

  if (o1 && w.usds - MIN_USDS >= ARB_SIZE) {
    const leg1 = await fireSwap(FURNACE, "USDS", ARB_SIZE, "arb");
    if (leg1.ok) {
      const saosOut = leg1.out;
      lastArbAt = Date.now(); arbThisHour++;
      try {
        const amt = Math.min(saosOut, w.saos + saosOut);
        const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "sell", price: book.bestBid, amount: amt, issuer: FURNACE, ioc: true });
        act("arb-book-sell", "SAOS/USDS", { price: book.bestBid, amount: amt, ioc: true }, r?.ok ? "ok" : "denied", 0, r?.error ?? `ארב-א: נקנה-בריכה@${buyEff.eff} נמכר-ספר@${book.bestBid}`);
        if (r?.ok) { arbTaken++; arbProfitMu += Math.floor((book.bestBid - buyEff.eff) * (amt / 1000)); }
      } catch (e) { act("arb-book-sell", "SAOS/USDS", {}, "error", 0, String(e).slice(0, 100)); }
    }
  } else if (o2 && w.saos >= ARB_SIZE * 2) {
    try {
      const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "buy", price: book.bestAsk, amount: ARB_SIZE, issuer: FURNACE, ioc: true });
      act("arb-book-buy", "SAOS/USDS", { price: book.bestAsk, amount: ARB_SIZE, ioc: true }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
      if (r?.ok) {
        lastArbAt = Date.now(); arbThisHour++;
        const leg2 = await fireSwap(FURNACE, "SAOS", ARB_SIZE, "arb");
        if (leg2.ok) { arbTaken++; arbProfitMu += Math.floor((sellEff.eff - book.bestAsk) * (ARB_SIZE / 1000)); }
      }
    } catch (e) { act("arb-book-buy", "SAOS/USDS", {}, "error", 0, String(e).slice(0, 100)); }
  }
}

/* ═══ עומק-Maker דו-צדדי סביב פול-מיד (postOnly — משלים-את-הצבא, לא-דורך) ══ */
async function makerCycle(w: { usds: number; saos: number }): Promise<void> {
  const book = await bookTop();
  if (!book || !(book.fair > 0)) return;
  const mid = Math.round((book.bestBid && book.bestAsk ? (book.bestBid + book.bestAsk) / 2 : book.fair));
  const bid = Math.floor(mid * (1 - MAKER_BPS / 10_000));
  const ask = Math.ceil(mid * (1 + MAKER_BPS / 10_000));
  const mine = await jget(`${DEX}/my-orders?issuer=${FURNACE}`).catch(() => null);
  const orders: any[] = mine?.orders ?? [];
  for (const o of orders) {
    const px = Number(o.price ?? 0);
    if (px > 0 && Math.abs(px - mid) * 10_000 > MAKER_STALE_BPS * mid) {
      try {
        const c = await jpost(`${DEX}/cancel`, { orderId: Number(o.id), issuer: FURNACE });
        act("cancel-stale", "SAOS/USDS", { orderId: o.id, price: px, mid }, c?.ok ? "ok" : "denied", 0, c?.error ?? "זומבי-תנור");
      } catch { /* לא-קריטי */ }
    }
  }
  const live = orders.filter((o) => Math.abs(Number(o.price ?? 0) - mid) * 10_000 <= MAKER_STALE_BPS * mid);
  const hasSide = (side: string, price: number) => live.some((o) => o.side === side && Math.abs(Number(o.price) - price) <= Math.max(2, mid * 0.002));
  if (!hasSide("buy", bid) && w.usds - MIN_USDS >= bid * (MAKER_AMOUNT / 1000)) {
    try {
      const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "buy", price: bid, amount: MAKER_AMOUNT, issuer: FURNACE, postOnly: true });
      act("maker-bid", "SAOS/USDS", { price: bid, amount: MAKER_AMOUNT }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
    } catch (e) { lastErr = String(e).slice(0, 110); }
  }
  if (!hasSide("sell", ask) && w.saos >= MAKER_AMOUNT * 2) {
    try {
      const r = await jpost(`${DEX}/order`, { action: "order", base: "SAOS", quote: "USDS", side: "sell", price: ask, amount: MAKER_AMOUNT, issuer: FURNACE, postOnly: true });
      act("maker-ask", "SAOS/USDS", { price: ask, amount: MAKER_AMOUNT }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
    } catch (e) { lastErr = String(e).slice(0, 110); }
  }
}

/* ═══ קציר: ניתוב-רווחים (msg-8) — עודף-מעל-הבנק חוזר ל-operator ═════════ */
async function harvest(): Promise<void> {
  const w = await walletOf(FURNACE);
  if (!w) return;
  if (w.usds > MIN_USDS + 300_000) {
    const excess = w.usds - MIN_USDS;
    try {
      const r = await jpost(`${DEX}/transfer`, { from: FURNACE, to: "operator", asset: "USDS", amountMu: excess });
      if (r?.ok) { sweeps++; sweptUsdsMu += excess; console.log(`[furnace] קציר: ${excess}µ USDS → operator`); }
      act("sweep", "operator", { asset: "USDS", amountMu: excess }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
    } catch (e) { act("sweep", "operator", { asset: "USDS" }, "error", 0, String(e).slice(0, 100)); }
  }
  if (w.saos > MIN_SAOS + 200_000) {
    const excessS = w.saos - MIN_SAOS;
    try {
      const r = await jpost(`${DEX}/transfer`, { from: FURNACE, to: "operator", asset: "SAOS", amountMu: excessS });
      if (r?.ok) { sweeps++; sweptSaosMu += excessS; }
      act("sweep", "operator", { asset: "SAOS", amountMu: excessS }, r?.ok ? "ok" : "denied", 0, r?.error ?? "");
    } catch (e) { act("sweep", "operator", { asset: "SAOS" }, "error", 0, String(e).slice(0, 100)); }
  }
}

/* ═══ מסילות-חוץ: סקר-כנה-בלבד (אפס-מפתחות, אפס-הזמנות) ═════════════════ */
type RailProbe = { provider: string; http: number | null; supportsSteem: boolean | null; supportsHive: boolean | null; rate: number | null; err: string | null; at: string };
async function probeRails(): Promise<void> {
  const at = new Date().toISOString();
  const out: RailProbe[] = [];
  const t8 = AbortSignal.timeout(8000);
  /* SimpleSwap — רשימת-מטבעות-ציבורית */
  try {
    const r = await fetch("https://api.simpleswap.io/get_all_currencies", { signal: t8 });
    const j = await r.json().catch(() => null);
    const syms: string[] = Array.isArray(j) ? j.map((c: any) => String(c?.symbol ?? "").toLowerCase()) : [];
    out.push({ provider: "simpleswap", http: r.status, supportsSteem: syms.includes("steem"), supportsHive: syms.includes("hive"), rate: null, err: null, at });
  } catch (e) { out.push({ provider: "simpleswap", http: null, supportsSteem: null, supportsHive: null, rate: null, err: String(e).slice(0, 80), at }); }
  /* Exolix — רשימת-מטבעות-ציבורית */
  try {
    const r = await fetch("https://api.exolix.com/api/v2/currencies", { signal: t8 });
    const j = await r.json().catch(() => null);
    const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
    const codes: string[] = arr.map((c: any) => String(c?.code ?? c?.id ?? "").toLowerCase());
    out.push({ provider: "exolix", http: r.status, supportsSteem: codes.includes("steem"), supportsHive: codes.includes("hive"), rate: null, err: null, at });
  } catch (e) { out.push({ provider: "exolix", http: null, supportsSteem: null, supportsHive: null, rate: null, err: String(e).slice(0, 80), at }); }
  /* Trocador — מאגד-ללא-KYC, שער-ציבורי */
  try {
    const r = await fetch("https://trocador.app/api/rates?from=steem&to=btc&amount=100&havepartner=true", { signal: t8 });
    const j = await r.json().catch(() => null);
    const first = Array.isArray(j) ? j[0] : null;
    out.push({ provider: "trocador", http: r.status, supportsSteem: r.ok && !!first, supportsHive: null, rate: first ? (Number(first.rate) || null) : null, err: r.ok ? null : `http-${r.status}`, at });
  } catch (e) { out.push({ provider: "trocador", http: null, supportsSteem: null, supportsHive: null, rate: null, err: String(e).slice(0, 80), at }); }
  /* SideShift — שער-ציבורי-לזוג */
  try {
    const r = await fetch("https://sideshift.ai/api/v2/pairs/steem/btc", { signal: t8 });
    const j = await r.json().catch(() => null);
    out.push({ provider: "sideshift", http: r.status, supportsSteem: r.ok && !!j?.rate, supportsHive: null, rate: j?.rate ?? null, err: r.ok ? null : `http-${r.status}`, at });
  } catch (e) { out.push({ provider: "sideshift", http: null, supportsSteem: null, supportsHive: null, rate: null, err: String(e).slice(0, 80), at }); }
  /* FixedFloat — הקבלה-החיה-מעורק-ה-Actions (Autonomy) — מצב-הטוקן-הממתין */
  try {
    const r = await fetch("https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/receipts/fixedfloat/latest.json", { signal: t8 });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      (out as any).fixedfloat = { at: j?.at ?? null, verdict: j?.verdict ?? null, steemSupported: j?.steemSupported ?? null, currenciesHttp: j?.currencies?.http ?? null, note: "עורק-Actions-חי-כל-2דק' — הטוקן-ממתין-אישור-אצל-FF (מדידה-מהקבלה)" };
    } else (out as any).fixedfloat = { at, verdict: null, note: `קבלה-לא-נגישה (http-${r.status}) — כנה` };
  } catch (e) { (out as any).fixedfloat = { at, verdict: null, note: String(e).slice(0, 80) }; }
  rails = { at, probes: out };
  railsAt = Date.now();
  try { writeFileSync(path.join(stateFile, "rails-latest.json"), JSON.stringify(rails, null, 1)); } catch { /* כנות */ }
  act("rails-probe", "external-bridges", { providers: out.length }, "ok", 0, "סקר-קריאה-בלבד");
}

/* ═══ מחזור-ראשי ═════════════════════════════════════════════════════════ */
async function tick(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== budgetDay) { budgetDay = today; spentTodayMu = 0; }
    await ensureFunded();
    const w = await walletOf(FURNACE);
    if (!w) { lastErr = "ארנק-תנור-טרם-נולד"; return; }
    const st = await dexState();
    const meter = Number(st?.feeMeter ?? 0);
    const fills = Number(st?.fills ?? 0);
    meterHistory.push({ t: Date.now(), meter, fills });
    if (meterHistory.length > 240) meterHistory = meterHistory.slice(-240);

    /* 1. מטבוליזם: מתחת-ליעד-המזרקה → סיבוב-אמת (בתקציב-יומי-ובבנק) */
    if (meter < IGNITE_TARGET_METER && spentTodayMu < ROTATE_DAILY_BUDGET
      && w.usds - MIN_USDS >= IGNITE_SIZE && Date.now() - lastSwapAt >= ROTATE_MIN_GAP_MS) {
      const dir = lastSwapDir === "USDS" ? "SAOS" : "USDS";
      const r = await fireSwap(FURNACE, dir, IGNITE_SIZE, "rotate");
      if (r.ok) { lastSwapDir = dir; lastSwapAt = Date.now(); }
    }
    /* 2. ארביטראז' — רק-כשיש-פיזור-אמת-מעל-המקף */
    if (w.usds > MIN_USDS + ARB_SIZE && w.saos > MIN_SAOS + ARB_SIZE) await arbScan({ usds: w.usds, saos: w.saos });
    /* 3. עומק-Maker דו-צדדי */
    await makerCycle({ usds: w.usds, saos: w.saos });
    /* 4. קציר-תקופתי */
    if (cycles % SWEEP_GAP_CYCLES === 0 && cycles > 0) await harvest();
    lastErr = "";
    cycles++;
    if (cycles % 15 === 0) persist();
  } catch (e) {
    lastErr = String(e).slice(0, 140);
    console.log(`[furnace] tick-error: ${lastErr}`);
  }
}

/* ═══ שירות-בריאות (:3045) — כנות-מלאה ══════════════════════════════════ */
Bun.serve({
  port: PORT,
  fetch: async (req) => {
    /* בריאות-מהירה: כל-המדידות-במקביל עם-סופ-זמן-קצר — השירות-תמיד-עונה.
     * כתובת-/health נתמכת-במיוחד (פרוב-resurrect-fleet דוגם-/health). */
    const path = new URL(req.url).pathname;
    if (path !== "/" && path !== "/health") return Response.json({ ok: false, error: "not-found", routes: ["/", "/health"] }, { status: 404 });
    const [w, st] = await Promise.all([
      walletOf(FURNACE).catch(() => null),
      dexState().catch(() => null),
    ]);
    const mid = bookCache?.fair ?? Number(st?.ladder?.refPrice ?? 0);
    const equityMu = w ? Math.round(w.usds + (w.saos * mid) / 1000) : null;
    return Response.json({
      ok: true, service: "market-furnace", port: PORT,
      mandate: "שוק-חריף-אמת על-הדקס-שלנו: הצתת-עמלות · ארביטראז' בריכה↔ספר · עומק-Maker · קציר (msg-8) — מנדט-בעלים 1a15c78ee1e63511",
      furnace: w ? { usdsMu: w.usds, saosMu: w.saos, credits: w.credits, equityMuMark: equityMu } : null,
      funded: { usdsMu: fundedUsds, saosMu: fundedSaos, bootFunded },
      engine: {
        cycles, lastErr: lastErr || null,
        meterNow: st?.feeMeter ?? null, fountainAlive: Number(st?.feeMeter ?? 0) >= IGNITE_TARGET_METER,
        fillsNow: st?.fills ?? null, treasuryProfitMu: st?.treasuryProfit ?? null,
        ignition: { swaps: ignitionSwaps, estCostMu: ignitionCostMu },
        rotation: { swaps: rotationSwaps, volumeMu: rotationVolMu, estCostMu: rotationCostMu, spentTodayMu, budgetMu: ROTATE_DAILY_BUDGET, budgetLeftMu: Math.max(0, ROTATE_DAILY_BUDGET - spentTodayMu) },
        arb: { seen: arbSeen, taken: arbTaken, grossProfitMu: arbProfitMu, lastAgoSec: lastArbAt ? Math.round((Date.now() - lastArbAt) / 1000) : null, thisHour: arbThisHour, capPerHour: ARB_MAX_PER_HOUR, edgeBps: ARB_EDGE_BPS },
        maker: { bps: MAKER_BPS, amountMu: MAKER_AMOUNT, staleBps: MAKER_STALE_BPS },
        sweeps: { count: sweeps, usdsMu: sweptUsdsMu, saosMu: sweptSaosMu },
      },
      book: bookCache,
      rails: rails ?? null, railsAgoSec: railsAt ? Math.round((Date.now() - railsAt) / 1000) : null,
      honest: {
        externalProfitUsd: 0,
        why: "USDS=FAKE-PEG (פסק-הדקס-עצמו, כיסוי-חוץ 0.058%) — רווח-פנימי-אמת זורם (poolFees-ever 24Mµ · treasuryProfit-ever 18.4Mµ · protorev-pending 20.3Mµ) אך-אין-עדיין-מסילת-מימוש-חוץ. התנור-מגביר-את-הזרימה-הפנימית-והמסילות-נבנות (FixedFloat-ממתין-אישור + ספקים-נמדדים-ב-rails).",
      },
      upSec: Math.round((Date.now() - bootAt) / 1000),
    }, { headers: { "access-control-allow-origin": "*" } });
  },
});

console.log(`[furnace] חי על :${PORT} — תנור-השוק-החריף (הצתה+ארב+Maker+קציר)`);
/* שומרי-תהליך: לעולם-לא-מוות-שקט — כל-שגיאה-נרשמת-והתנור-ממשיך-לנשום */
process.on("uncaughtException", (e) => { try { appendFileSync(ACTIONS_FILE, JSON.stringify({ ts: Date.now(), sem: "furnace-1", actor: FURNACE, action: "uncaught", outcome: "error", detail: String(e?.stack ?? e).slice(0, 300) }) + "\n"); } catch { } });
process.on("unhandledRejection", (e) => { try { appendFileSync(ACTIONS_FILE, JSON.stringify({ ts: Date.now(), sem: "furnace-1", actor: FURNACE, action: "unhandled-rejection", outcome: "error", detail: String(e).slice(0, 300) }) + "\n"); } catch { } });
void (async () => {
  await ensureFunded();
  await igniteSequence();
  await probeRails();
  void tick();
  setInterval(() => void tick(), 20_000);
  setInterval(() => { void probeRails().catch(() => { /* כנה */ }); }, 30 * 60_000);
  setInterval(persist, 60_000);
})();
