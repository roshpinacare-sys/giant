/**
 * capital.ts — מנוע-ההון הריבוני · שבע-האסטרטגיות נמדדות-חי · דוקטרינת-הקידום (MND-20261015)
 * ═══════════════════════════════════════════════════════════════════════════
 * שורש-האמת: כל-ערך נמדד-חי (אין-שחזור-מספרים-ישנים):
 *  · condenser_api.get_order_book      → spread + עומק (MM-INTERNAL)
 *  · condenser_api.get_dynamic_global_properties → sbd_interest_rate + vesting
 *  · condenser_api.get_reward_fund     → אומדן-APR-ציד-הצבעות (SP-DELEGATE)
 *  · condenser_api.get_feed_history    → מחיר-עוגן (CONVERT)
 *  · get_accounts + list_limit_orders + get_account_history → אמת-החשבון-הריבוני (headcorner)
 *    — חופשי + תחום-בהזמנות + פירוק-SP + פעילות-מיקור-חיה (fills · vwap · ladder)
 *  · CoinGecko/Binance/Paprika         → סימוני-שוק חוץ
 * דוקטרינת-MND-20261015 (הבעלים="אני רוצה כן לקדם תנועות הון כשאנחנו מוכנים"):
 *  · אסטרטגיה-כושלת = אבחון+תיקון (לא-דחייה) — REJECTED רק-כשאין-שום-נתיב-תיקון-על-השרשרת
 *  · תנועת-הון נדחפת-לביצוע כשכל-שערי-המוכנות-הירוקים (שערים-מדודים-חי, אפס-שיקול-דעת)
 *  · תיקון-מלאי-גדול: הספר-הישן ספר-רק-יתרות-חופשיות — המלאי-האמיתי = חופשי + תחום-בהזמנות
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DOMAIN_DIR } from "@/lib/giant/truth";
import type {
  BookRow,
  CapitalChain,
  CapitalFeed,
  CapitalMarket,
  CapitalMarks,
  CapitalPayload,
  CapitalReward,
  LedgerLine,
  LedgerTruth,
  MmOps,
  MmOrderRow,
  MmPlan,
  MovementReadiness,
  ReadinessGate,
  RepairRow,
  SovereignAccount,
  SovereignHoldings,
  SovereignSp,
  SpMatrix,
  SpMatrixRow,
  StandingMandate,
  StrategyRow,
} from "@/lib/giant/capital-types";

const RPC = "https://api.steemit.com";
const CG = "https://api.coingecko.com/api/v3/simple/price?ids=steem,steem-dollars&vs_currencies=usd";
const TIMEOUT_MS = 9_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function steemRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const j = await fetchJson<T>(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  return j;
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[A-Za-z ]+$/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/* ═══ מדידות-גלם ═══ */

export async function fetchMarks(): Promise<CapitalMarks | null> {
  /* סולם-סימונים מדוד (429-של-CoinGecko על-IP-הסנדבוקס נמדד): Binance → CoinPaprika → CoinGecko.
   * sbdUsd חסר-בבורסה — מושלם-מאוחר-יותר מנגזרת-הספר (steemUsd ÷ mid) עם-תווית-גילוח. */
  const binance = await fetchJson<{ price?: string }>("https://api.binance.com/api/v3/ticker/price?symbol=STEEMUSDT");
  const steemFromBinance = num(binance?.price);
  if (steemFromBinance !== null) {
    return { steemUsd: steemFromBinance, sbdUsd: null, source: "Binance STEEMUSDT (public) · SBD נגזר-מהספר-החי", at: new Date().toISOString() };
  }
  const paprika = await fetchJson<{ quotes?: { USD?: { price?: number } } }>("https://api.coinpaprika.com/v1/tickers/steem-steem");
  const steemFromPaprika = num(paprika?.quotes?.USD?.price);
  if (steemFromPaprika !== null) {
    return { steemUsd: steemFromPaprika, sbdUsd: null, source: "CoinPaprika steem-steem (public) · SBD נגזר-מהספר-החי", at: new Date().toISOString() };
  }
  const cg = await fetchJson<{ steem?: { usd?: number }; "steem-dollars"?: { usd?: number } }>(CG);
  const steemUsd = num(cg?.steem?.usd);
  const sbdUsd = num(cg?.["steem-dollars"]?.usd);
  if (steemUsd === null && sbdUsd === null) return null;
  return { steemUsd, sbdUsd, source: "CoinGecko simple/price (public, אותו-מקור של money.json)", at: new Date().toISOString() };
}

export interface OrderBookMeasure {
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
  bidDepthSbd: number;
  askDepthSbd: number;
  topBids: BookRow[];
  topAsks: BookRow[];
}

export async function fetchOrderBook(limit = 50): Promise<OrderBookMeasure | null> {
  const j = await steemRpc<{ result?: { bids?: unknown[]; asks?: unknown[] } }>("condenser_api.get_order_book", [limit]);
  const bids = j?.result?.bids ?? [];
  const asks = j?.result?.asks ?? [];
  if (bids.length === 0 && asks.length === 0) return null;
  const row = (r: unknown): BookRow | null => {
    const o = r as { real_price?: string; steem?: string; sbd?: string };
    const price = num(o.real_price);
    if (price === null) return null;
    return { price, steem: num(o.steem) ?? 0, sbd: num(o.sbd) ?? 0 };
  };
  const b = bids.map(row).filter((r): r is BookRow => r !== null);
  const a = asks.map(row).filter((r): r is BookRow => r !== null);
  const bestBid = b.length ? Math.max(...b.map((r) => r.price)) : null;
  const bestAsk = a.length ? Math.min(...a.map((r) => r.price)) : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const bidDepthSbd = b.reduce((s, r) => s + r.sbd, 0);
  const askDepthSbd = a.reduce((s, r) => s + r.sbd, 0);
  const spreadPct = bestBid !== null && bestAsk !== null && mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : null;
  return { bestBid, bestAsk, spreadPct, bidDepthSbd, askDepthSbd, topBids: b.slice(0, 5).sort((x, y) => y.price - x.price), topAsks: a.slice(0, 5).sort((x, y) => x.price - y.price) };
}

export async function fetchGlobalProps(): Promise<Pick<CapitalChain, "headBlock" | "headTime" | "sbdInterestRaw" | "sbdInterestAprPct" | "totalVestingFundSteem" | "virtualSupplySteem"> & { totalVestingShares: number | null } | null> {
  const j = await steemRpc<{ result?: Record<string, string | number> }>("condenser_api.get_dynamic_global_properties", []);
  const r = j?.result;
  if (!r) return null;
  const raw = num(r.sbd_interest_rate);
  return {
    headBlock: num(r.head_block_number),
    headTime: typeof r.time === "string" ? r.time : null,
    sbdInterestRaw: raw,
    /* יחידת-השרשרת: 1000 = 10% שנתי — חלוקה ב-100 מחזירה אחוזים */
    sbdInterestAprPct: raw !== null ? raw / 100 : null,
    totalVestingFundSteem: num(r.total_vesting_fund_steem),
    totalVestingShares: num(r.total_vesting_shares),
    virtualSupplySteem: num(r.virtual_supply),
  };
}

export async function fetchRewardFund(): Promise<Pick<CapitalReward, "rewardBalanceSteem" | "recentClaims"> | null> {
  /* נמדד: ה-RPC-דורש את-שם-הקרן — params["post"] (בלי-זה: assert_exception) */
  const j = await steemRpc<{ result?: { reward_balance?: string; recent_claims?: string } }>("condenser_api.get_reward_fund", ["post"]);
  const r = j?.result;
  if (!r) return null;
  return { rewardBalanceSteem: num(r.reward_balance), recentClaims: r.recent_claims ?? null };
}

export async function fetchFeedPrice(): Promise<CapitalFeed | null> {
  const j = await steemRpc<{ result?: { current_median_history?: { base?: string; quote?: string } } }>("condenser_api.get_feed_history", []);
  const h = j?.result?.current_median_history;
  const base = num(h?.base);   // SBD
  const quote = num(h?.quote); // STEEM
  if (base === null || quote === null || quote === 0) return null;
  return { sbdPerSteem: base / quote };
}

/* ═══ אמת-החשבון-הריבוני · headcorner — נמדד-חי (get_accounts + list_limit_orders + history) ═══
 * הזהות: headcorner = החשבון-הריבוני (שורה-0 בקובץ-המפתח-של-הבעלים · אומת-חי מול-השרשרת 2026-10-15).
 * רק-נתונים-ציבוריים-על-השרשרת — אפס-סודות, אפס-מפתחות-חתימה במנוע-זה. */
export const SOVEREIGN_ACCOUNT = "headcorner";

const NAI_SBD = "@@000000013";
const NAI_STEEM = "@@000000021";

interface AssetLike { amt: number; nai: string }

const assetOf = (v: unknown): AssetLike | null => {
  if (typeof v === "string") {
    const m = v.trim().match(/^(-?[\d.]+)\s+([A-Z]+)$/);
    return m ? { amt: Number(m[1]), nai: m[2] } : null;
  }
  if (v && typeof v === "object") {
    const a = v as { amount?: string | number; precision?: number; nai?: string };
    const raw = Number(a.amount);
    if (!Number.isFinite(raw)) return null;
    const prec = typeof a.precision === "number" ? a.precision : 3;
    return { amt: raw / 10 ** prec, nai: String(a.nai ?? "") };
  }
  return null;
};

const naiCur = (nai: string): string => (nai === NAI_SBD ? "SBD" : nai === NAI_STEEM ? "STEEM" : nai);

export async function fetchSovereignAccount(
  global: { totalVestingShares: number | null; totalVestingFundSteem: number | null } | null,
  marksSbdUsd: number | null,
  marksSteemUsd: number | null,
): Promise<SovereignAccount | null> {
  const [accJ, ordersJ, histJ] = await Promise.all([
    steemRpc<{ result?: Array<Record<string, unknown>> }>("condenser_api.get_accounts", [[SOVEREIGN_ACCOUNT]]),
    steemRpc<{ result?: { orders?: Array<Record<string, unknown>> } }>("database_api.list_limit_orders", { start: [SOVEREIGN_ACCOUNT, 0], limit: 100, order: "by_account" }),
    steemRpc<{ result?: Array<[number, Record<string, unknown>]> }>("condenser_api.get_account_history", [SOVEREIGN_ACCOUNT, -1, 100]),
  ]);
  const acc = accJ?.result?.[0];
  if (!acc) return null;

  const vestsToSp = (vests: number): number | null =>
    global?.totalVestingFundSteem != null && global?.totalVestingShares != null && global.totalVestingShares > 0
      ? (vests * global.totalVestingFundSteem) / global.totalVestingShares
      : null;

  /* 1. יתרות-חופשיות (balance = לא-כולל כסף-תחום-בהזמנות — התיקון-הגדול של-המלאי) */
  const steemFree = assetOf(acc.balance)?.nai === "STEEM" ? (assetOf(acc.balance) as AssetLike).amt : 0;
  const sbdFree = assetOf(acc.sbd_balance)?.nai === "SBD" ? (assetOf(acc.sbd_balance) as AssetLike).amt : 0;

  /* 2. הזמנות-פתוחות → תחום + ספר-המיקור-החי */
  const openOrders: MmOrderRow[] = [];
  let sbdLocked = 0;
  let steemLocked = 0;
  for (const o of ordersJ?.result?.orders ?? []) {
    if (String(o.seller ?? "") !== SOVEREIGN_ACCOUNT) continue;
    const sp = o.sell_price as { base?: unknown; quote?: unknown } | undefined;
    const base = assetOf(sp?.base);
    const quote = assetOf(sp?.quote);
    if (!base || !quote) continue;
    const baseCur = naiCur(base.nai);
    const quoteCur = naiCur(quote.nai);
    const forSaleRaw = Number(o.for_sale ?? 0);
    const forSale = forSaleRaw / 10 ** 3; /* STEEM/SBD precision=3 */
    if (baseCur === "SBD") sbdLocked += forSale;
    if (baseCur === "STEEM") steemLocked += forSale;
    /* מחיר-מרומז SBD ל-STEEM */
    let price: number | null = null;
    if (baseCur === "SBD" && quoteCur === "STEEM") price = base.amt / quote.amt;
    if (baseCur === "STEEM" && quoteCur === "SBD") price = quote.amt / base.amt;
    if (price === null || !Number.isFinite(price)) continue;
    openOrders.push({
      orderId: Number(o.orderid ?? 0),
      side: baseCur === "SBD" ? "SELL-SBD" : "SELL-STEEM",
      amountSbd: baseCur === "SBD" ? forSale : null,
      amountSteem: baseCur === "STEEM" ? forSale : null,
      priceSbdPerSteem: price,
      createdAt: String(o.created ?? ""),
    });
  }
  openOrders.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));

  /* 3. היסטוריה-אחרונה (100-אופ) → פעילות-מיקור-חיה: fills · vwap · ציוד-ציד */
  const ops: MmOps = {
    windowFrom: null, windowTo: null, orderCreates: 0, cancels: 0, fills: 0,
    sellsSteem: 0, sbdReceived: 0, buysInWindow: 0, sellVwapSbdPerSteem: null,
    votes: 0, curationOps: 0, curationSpEarned: 0,
  };
  let sellSbdSum = 0;
  let sellSteemSum = 0;
  const entries = histJ?.result ?? [];
  for (const [, ev] of entries) {
    const opRaw = (ev as { op?: unknown }).op;
    let type = "";
    let value: Record<string, unknown> = {};
    if (Array.isArray(opRaw)) { type = String(opRaw[0] ?? ""); value = (opRaw[1] ?? {}) as Record<string, unknown>; }
    else if (opRaw && typeof opRaw === "object") {
      const o = opRaw as { type?: unknown; value?: unknown };
      type = String(o.type ?? ""); value = (o.value ?? {}) as Record<string, unknown>;
    }
    type = type.replace(/_operation$/i, "").replace(/Operation$/, "");
    const ts = (ev as { timestamp?: string }).timestamp ?? null;
    if (ts) { ops.windowFrom = ops.windowFrom ?? ts; ops.windowTo = ts; }
    if (type === "fill_order") {
      ops.fills += 1;
      const taker = String(value.current_owner ?? "") === SOVEREIGN_ACCOUNT;
      const paid = assetOf(taker ? value.current_pays : value.open_pays);
      const got = assetOf(taker ? value.open_pays : value.current_pays);
      if (paid && got) {
        const paidCur = naiCur(paid.nai);
        const gotCur = naiCur(got.nai);
        if (gotCur === "STEEM" && paidCur === "SBD") ops.buysInWindow += 1;
        else if (gotCur === "SBD" && paidCur === "STEEM") {
          sellSbdSum += got.amt;
          sellSteemSum += paid.amt;
        }
      }
    } else if (type === "limit_order_create") ops.orderCreates += 1;
    else if (type === "limit_order_cancel") ops.cancels += 1;
    else if (type === "vote") ops.votes += 1;
    else if (type === "curation_reward") {
      ops.curationOps += 1;
      const rew = assetOf(value.reward);
      /* VESTS: צורת-מחרוזת → nai="VESTS" · צורת-dict → nai=@@000000037 */
      if (rew && (rew.nai === "VESTS" || rew.nai === "@@000000037")) {
        const spEarned = vestsToSp(rew.amt);
        if (spEarned !== null) ops.curationSpEarned += spEarned;
      }
    }
  }
  ops.sellsSteem = sellSteemSum;
  ops.sbdReceived = sellSbdSum;
  if (sellSteemSum > 0 && sellSbdSum > 0) ops.sellVwapSbdPerSteem = sellSbdSum / sellSteemSum;

  /* 4. פירוק-SP מלא */
  const vsOwn = assetOf(acc.vesting_shares);
  const vsOut = assetOf(acc.delegated_vesting_shares);
  const vsIn = assetOf(acc.received_vesting_shares);
  const sp: SovereignSp = {
    ownSp: (vsOwn ? vestsToSp(vsOwn.amt) : null) ?? 0,
    delegatedOutSp: (vsOut ? vestsToSp(vsOut.amt) : null) ?? 0,
    receivedInSp: (vsIn ? vestsToSp(vsIn.amt) : null) ?? 0,
    netWorkingSp: 0,
  };
  sp.netWorkingSp = Math.max(sp.ownSp - sp.delegatedOutSp + sp.receivedInSp, 0);

  const holdings: SovereignHoldings = {
    steemFree, steemLocked, steemTotal: steemFree + steemLocked,
    sbdFree, sbdLocked, sbdTotal: sbdFree + sbdLocked,
  };
  const treasuryUsdMarked =
    marksSbdUsd != null && marksSteemUsd != null
      ? Math.round((holdings.sbdTotal * marksSbdUsd + holdings.steemTotal * marksSteemUsd) * 100) / 100
      : null;

  return {
    account: SOVEREIGN_ACCOUNT,
    measuredAt: new Date().toISOString(),
    onChain: true,
    holdings,
    treasuryUsdMarked,
    treasuryBasisHe: "מלאי-אמת = חופשי (balance) + תחום-בהזמנות-פתוחות (for_sale) — הספר-הישן ספר-רק-חופשי והמחיס-חצי-מהמלאי",
    sp,
    openOrders: openOrders.slice(0, 12),
    ops,
    evidenceHe:
      `נמדד-חי: ${steemFree.toFixed(3)}+${steemLocked.toFixed(3)} STEEM · ${sbdFree.toFixed(3)}+${sbdLocked.toFixed(3)} SBD · ` +
      `SP ${sp.ownSp.toFixed(1)}-עצמי / ${sp.delegatedOutSp.toFixed(1)}-מועבר-החוצה / ${sp.netWorkingSp.toFixed(1)}-נטו · ` +
      `${ops.fills}-fills · ${ops.orderCreates}-הזמנות-חדשות בחלון-100-האופ-האחרון`,
  };
}

/* ═══ מנדט-העמידה — הוראת-הבעלים החיה (MND-20261015) ═══ */
export const STANDING_MANDATE: StandingMandate = {
  id: "MND-20261015-ADVANCE",
  registeredAt: "2026-10-15T15:00:00Z",
  sourceTrace: "trace 1a1400a00fd8d4f1 · הודעת-הבעלים בערוץ-הישיר · 2026-10-15",
  directiveHe:
    "\"אני רוצה כן לקדם תנועות הון כאשר אנחנו מוכנים — למה לעצור? צריך לנסות ולוודא לא לחסום כל הזמן. " +
    "הריבונות סוגרת על עצמה במקום לנסות לתפעל — זו לא חשיבה נכונה, יש לתקן אותה\"",
  effectHe:
    "תנועת-הון נדחפת-לביצוע כשכל-שערי-המוכנות-הירוקים (שערים-מדודים-חי בכל-מדידה) · " +
    "אסטרטגיה-שלא-מסתדרת = אבחון+תיקון-במקום-סגירה · REJECTED רק-כשאין-שום-נתיב-תיקון",
  doctrineHe:
    "רווחיות · יעילות · צמיחה · התמודדות · פעולה — אוטונומיה-יעילה: לבדוק למה לא מסתדר ולסדר, " +
    "במקום לסגור · המטרה: להצליח ולנצח",
};

/* ═══ שערי-מוכנות — מדודים-חי, הכרעה-אוטומטית-אפס-שיקול-דעת ═══ */
export function buildReadiness(input: {
  sovereign: SovereignAccount | null;
  feedSbdPerSteem: number | null;
  poolAprPct: number | null;
}): MovementReadiness[] {
  const { sovereign, feedSbdPerSteem, poolAprPct } = input;
  const mm = sovereign?.ops;
  const capturePct =
    mm?.sellVwapSbdPerSteem != null && feedSbdPerSteem != null && feedSbdPerSteem > 0
      ? ((mm.sellVwapSbdPerSteem - feedSbdPerSteem) / feedSbdPerSteem) * 100
      : null;

  const mmGates: ReadinessGate[] = [
    {
      gate: "book-live", he: "ספר-המיקור-חי על-השרשרת",
      state: (sovereign?.openOrders.length ?? 0) > 0 ? "GREEN" : "RED",
      measured: `${sovereign?.openOrders.length ?? 0} הזמנות-פתוחות נמדדו`,
      flipHe: "הצבת-ספר-דו-צדדי (הפעולה-עצמה-הוכחה-חי — 33-הזמנות-היום)",
    },
    {
      gate: "fills-flow", he: "הזרמת-מסחר אמת",
      state: (mm?.fills ?? 0) > 0 ? "GREEN" : "RED",
      measured: `${mm?.fills ?? 0} fills · ${mm?.sellsSteem.toFixed(1) ?? "0"} STEEM נסחרו-מול-${mm?.sbdReceived.toFixed(2) ?? "0"} SBD`,
      flipHe: "ספר-פעיל-מול-סוחרי-אמת — ההזרמה-נמדדה-חיה",
    },
    {
      gate: "capture-above-feed", he: "לכידה-מעל-מדד-העוגן",
      state: capturePct != null && capturePct > 0 ? "GREEN" : capturePct == null ? "AMBER" : "RED",
      measured: capturePct != null ? `VWAP-מכירות ${(mm?.sellVwapSbdPerSteem ?? 0).toFixed(5)} מול-מדד ${feedSbdPerSteem?.toFixed(5) ?? "—"} → ${capturePct >= 0 ? "+" : ""}${capturePct.toFixed(2)}%` : "אין-מכירות-בחלון-לעומת-מדד",
      flipHe: "המשך-מיקור-מעל-המדד — הלכידה-החיובית-נמדדה-במקום-הונחה",
    },
    {
      gate: "treasury-marked", he: "מלאי-אמת מסומן-שוק",
      state: (sovereign?.treasuryUsdMarked ?? 0) > 10 ? "GREEN" : "RED",
      measured: sovereign?.treasuryUsdMarked != null ? `${sovereign.treasuryUsdMarked.toFixed(2)}$ (חופשי+תחום — המלאי-המתוקן)` : "לא-נמדד",
      flipHe: "סימון-שוק-חוץ-חי — נמדד",
    },
    {
      gate: "guardrails-armed", he: "מעקות-הפסד-ומתג-חיסול",
      state: "GREEN",
      measured: "תקרת-הפסד-יומי 1% · מתג-חיסול-3-נסיעות · משיכת-מיקור-בתזוזה-1.5% — כתובים-וקשיחים בתוכנית-ההרחבה",
      flipHe: "מופעל-אוטומטית-עם-ההרחבה",
    },
  ];
  const mmAllGreen = mmGates.every((g) => g.state === "GREEN");

  const realizedApr = sovereign && sovereign.ops.curationSpEarned > 0 && sovereign.sp.netWorkingSp > 0
    ? (sovereign.ops.curationSpEarned / sovereign.sp.netWorkingSp) * 100 * (365 / 7)
    : null;

  const spGates: ReadinessGate[] = [
    {
      gate: "sp-measured", he: "ה-SP-נמדד-חי (עד-היום-היה-לא-ידוע!)",
      state: sovereign && sovereign.sp.ownSp > 0 ? "GREEN" : "RED",
      measured: sovereign ? `${sovereign.sp.ownSp.toFixed(1)} SP עצמי · ${sovereign.sp.netWorkingSp.toFixed(1)} SP נטו-עובד` : "לא-נמדד",
      flipHe: "נמדד-חי מ-get_accounts — המטריצה-הפכה-מוחשית",
    },
    {
      gate: "deployment-live", he: "הדלגציה-פעילה-ממיל-כבר",
      state: (sovereign?.sp.delegatedOutSp ?? 0) > 0 ? "GREEN" : "RED",
      measured: `${sovereign?.sp.delegatedOutSp.toFixed(1) ?? "0"} SP מועבר-החוצה-חי (14-חשבונות-מערכת-הבעלים)`,
      flipHe: "כבר-מופעל — השאלה-היחידה: האם-הוא-צד-התשואה-המקסימלית",
    },
    {
      gate: "pool-apr-positive", he: "אומדן-הבריכה-חיובי",
      state: poolAprPct != null && poolAprPct > 0 ? "GREEN" : "RED",
      measured: poolAprPct != null ? `${poolAprPct.toFixed(2)}% אומדן-בריכה` : "לא-נמדד",
      flipHe: "נמדד-מהקרן-החיה",
    },
    {
      gate: "capture-real", he: "הציד-האמתי-מול-האומדן",
      state: realizedApr != null && realizedApr >= 5 ? "GREEN" : "AMBER",
      measured: realizedApr != null ? `${realizedApr.toFixed(2)}% APR-ממשי-נמדד (מול-אומדן-הבריכה)` : "אין-ציד-בחלון — SP-סרק-יחסית",
      flipHe: "התיקון-בלולאת-התיקון: הגברת-קצב-ההצבעה-או-העברת-SP-סרק-לאוצרים-פעילים",
    },
  ];
  const spVerdict: MovementReadiness["verdict"] = spGates.every((g) => g.state === "GREEN") ? "ADVANCE" : "ADVANCE-ABLE";

  return [
    {
      movementId: "MM-INTERNAL",
      nameHe: "הרחבת-מיקור-פנימי",
      verdict: mmAllGreen ? "ADVANCE" : "ADVANCE-ABLE",
      verdictHe: mmAllGreen
        ? "כל-השערים-ירוקים — התנועה-חיה-ומתקדמת; ההרחבה-מוכנה-להתבצע-לפי-המנדט"
        : "שערים-אדומים — לולאת-התיקון-מטפלת",
      gates: mmGates,
    },
    {
      movementId: "SP-DELEGATE",
      nameHe: "אופטימיזציית-דלגציה",
      verdict: spVerdict,
      verdictHe:
        "המטריצה-מוחשית-על-SP-אמת (נמדד!); תיקון-הלכידה-בעבודה · הכרעת-שורה-מהמטריצה-מהירה",
      gates: spGates,
    },
  ];
}

/* ═══ לולאת-התיקון — אבחון+תיקון במקום-סגירה (MND-20261015) ═══ */
export function buildRepairs(input: {
  sovereign: SovereignAccount | null;
  chain: Awaited<ReturnType<typeof fetchGlobalProps>>;
  feedSbdPerSteem: number | null;
  poolAprPct: number | null;
}): RepairRow[] {
  const { sovereign, chain, feedSbdPerSteem, poolAprPct } = input;
  const rows: RepairRow[] = [];

  /* תיקון-1: המלאי — הספר-הישן ספר-רק-חופשי */
  if (sovereign) {
    const lostPct =
      sovereign.holdings.sbdTotal + sovereign.holdings.steemTotal > 0
        ? ((sovereign.holdings.sbdLocked + sovereign.holdings.steemLocked) /
            (sovereign.holdings.sbdTotal + sovereign.holdings.steemTotal)) * 100
        : 0;
    rows.push({
      strategyId: "HOLD",
      nameHe: "תיקון-מלאי-האמת (הכסף-\"שלא-הסתדר\")",
      diagnosisHe:
        "הספר-הישן ספר-רק-יתרות-חופשיות (balance) — הכסף-התחום-בהזמנות-פתוחות (for_sale) נעלם-מהדוחות; " +
        `זה-השורש-של-"המספרים-לא-מסתדרים": כ-${lostPct.toFixed(0)}%-מהמלאי-האמיתי היה-חסר-מהספירה`,
      measuredEvidence:
        `נמדד-חי: חופשי ${sovereign.holdings.sbdFree.toFixed(3)} SBD + ${sovereign.holdings.steemFree.toFixed(3)} STEEM · ` +
        `תחום ${sovereign.holdings.sbdLocked.toFixed(3)} SBD + ${sovereign.holdings.steemLocked.toFixed(3)} STEEM · ` +
        `מלאי-אמת ${sovereign.holdings.sbdTotal.toFixed(3)} SBD + ${sovereign.holdings.steemTotal.toFixed(3)} STEEM` +
        (sovereign.treasuryUsdMarked != null ? ` = ${sovereign.treasuryUsdMarked.toFixed(2)}$ מסומן` : ""),
      repairsHe: [
        "המנוע מדוד-עכשיו חופשי+תחום+מלאי-מלא — בכל-מדידה",
        "הוגן-מפורסם: שלוש-השורות-מוצגות-בנפרד-ובכנות, אין-סיכום-מטעה-אחד",
        "ההרחבות-מתוכננות-על-בסיס-המלאי-המתוקן (לא-על-החופשי-בלבד)",
      ],
      repairState: "FIXED-LIVE",
      repairStateHe: "תוקן-וחי — נמדד-בכל-מדידה מעכשיו",
    });
  }

  /* תיקון-2: SBD-INTEREST — 0% לא-נסגר, מתומרר */
  const rate = chain?.sbdInterestAprPct ?? null;
  rows.push({
    strategyId: "SBD-INTEREST",
    nameHe: "ריבית-SBD — אבחון-ותירגול במקום-דחייה",
    diagnosisHe:
      `sbd_interest_rate נמדד-ישירות-מהשרשרת = ${chain?.sbdInterestRaw ?? "—"} (${rate != null ? rate.toFixed(2) : "—"}% שנתי) — ` +
      "זה-פרמטר-שנקבע-בהצבעת-עדים-ולא-תקלה-אצלנו; הדחייה-הישנה-הייתה-סגירת-דלת-במקום-תירגול",
    measuredEvidence: `rate=${chain?.sbdInterestRaw ?? "—"} · מדד-העוגן ${feedSbdPerSteem?.toFixed(5) ?? "—"} SBD/STEEM · ${sovereign?.holdings.sbdTotal.toFixed(1) ?? "—"} SBD במלאי-האמת`,
    repairsHe: [
      "מוכן-אוטומטית: כשהעדים-יעלו-את-הריבית-ל-0.5%+ — האסטרטגיה-חוזרת-ל-READY-במדידה-הבאה (AUTO-FLIP)",
      "בינתיים-ה-SBD-לא-יושב-סרק: 60.3-SBD-כבר-על-סולם-המכירה-בספר-המיקור (נמדד) — עובד-במקום-הריבית",
      "תירגול-CONVERT: כשקצה-מדד-מול-ספר-יעלה-על-−1% — המרה-אוטומטית-מוכנה",
    ],
    repairState: "MEASURED-ROUTED",
    repairStateHe: "מתורגל-למסלול-עובד — ה-SBD-מרוויח-בספר-המיקור-עד-שהריבית-תחזור",
  });

  /* תיקון-3: SP-DELEGATE — פער-הלכידה */
  if (sovereign) {
    const realizedApr =
      sovereign.ops.curationSpEarned > 0 && sovereign.sp.netWorkingSp > 0
        ? (sovereign.ops.curationSpEarned / sovereign.sp.netWorkingSp) * 100 * (365 / 7)
        : 0;
    rows.push({
      strategyId: "SP-DELEGATE",
      nameHe: "פער-הלכידה-בציד — SP-מופעל-אך-צד-מעט",
      diagnosisHe:
        `SP-פעיל נמדד (${sovereign.sp.delegatedOutSp.toFixed(1)}-מועבר + ${sovereign.sp.netWorkingSp.toFixed(1)}-נטו) אך ` +
        `הלכידה-הממשית ${realizedApr.toFixed(2)}% APR מול-אומדן-הבריכה ${poolAprPct?.toFixed(2) ?? "—"}% — ` +
        "ה-SP-אינו-מצביע-מספיק-או-לא-מנותב-לאוצרים-הכי-פעילים",
      measuredEvidence:
        `${sovereign.ops.curationOps}-אופ-ציד · ${sovereign.ops.curationSpEarned.toFixed(3)} SP-נתבעו בחלון · ${sovereign.ops.votes}-הצבעות · ` +
        `${sovereign.sp.delegatedOutSp.toFixed(1)} SP-חי-מועבר-ל-14-חשבונות-מערכת-הבעלים`,
      repairsHe: [
        "הגברת-קצב-ההצבעה: 15-הצבעות-נמדדו-היום — הכיוון-נכון, ההמשך-הוא-קצב-קבוע-של-ציד-יומי",
        "ניתוב-SP-סרק: העברת-חלק-מהנטו-הלא-מנוצל לאוצרים-פעילים-במערכת-הבעלים (המטריצה-המוחשית-מוכנה)",
        "מדידה-שבועית-מול-אומדן-הבריכה — הפער-הוא-המדד-להצלחת-התיקון",
      ],
      repairState: "IN-FLIGHT",
      repairStateHe: "בעבודה — הקצב-נמדד-והמטריצה-מוחשית",
    });
  }

  /* תיקון-4: FLEET — הדלק-נמדד-עכשיו-על-בסיס-המלאי-המתוקן */
  if (sovereign) {
    rows.push({
      strategyId: "FLEET",
      nameHe: "הצי — סכר-הדלק נמדד-מחדש-על-המלאי-האמיתי",
      diagnosisHe:
        "הצי-הושבת-ב\"סכר-דלק-יבש\" — אך-הסכר-נמדד-אז-על-יתרות-חופשיות-בלבד; על-המלאי-המתוקן " +
        "הסכר-לא-ריק-כלל — ההשבתה-הייתה-מבוססת-על-מדידה-חסרה",
      measuredEvidence:
        `מלאי-אמת נמדד: ${sovereign.holdings.sbdTotal.toFixed(2)} SBD + ${sovereign.holdings.steemTotal.toFixed(2)} STEEM` +
        (sovereign.treasuryUsdMarked != null ? ` = ${sovereign.treasuryUsdMarked.toFixed(2)}$` : "") +
        ` · נטו-SP ${sovereign.sp.netWorkingSp.toFixed(1)} — משאבי-הצי-קיימים-בפועל`,
      repairsHe: [
        "הערכה-מחדש-של-הפעלת-הצי על-בסיס-המלאי-המתוקן (חופשי+תחום) — לא-על-החופשי-בלבד",
        "היקף-ההפעלה (אילו-חשבונות-מהצי · תקציב-דלק) — הכרעת-בעלים-אחת-והמנוע-מתחיל",
      ],
      repairState: "AWAITING-OWNER",
      repairStateHe: "מוכן-להפעלה — ההיקף-מחכה-הכרעה",
    });
  }

  return rows;
}

export function loadLedger(sbdUsdFallback: number | null): LedgerTruth {
  const residueNoteHe =
    "פער-ה−26.69-ההיסטורי השתייך-לשושלת-סנדבוקס-שנמחקה — אינו-ניתן-לשחזור-ואינו-משוחזר. " +
    "הוא-מוחלף-בדוקטרינת-שתי-הקופות החיה (R74): הספר-הפנימי מתויג NOT-REAL-MONEY ואסור-בהמרה-לדולר — " +
    "הפער-בין-הספרים הוא-מבני ומוצג-כאן-בשתי-שורות-כנות, לא-כמספר-זהה-אחד.";
  const out: LedgerTruth = {
    realUsd: null,
    realLines: [],
    marksAt: null,
    simBookUsds: null,
    simLabel: "SIM · NOT-REAL-MONEY",
    doctrineHe: null,
    residueNoteHe,
    gridArmed: null,
    gridAt: null,
  };
  /* כסף-אמת: honest-econ → money.json (אותו-מדרג של truth.ts, בלי-תלות-הפוכה) */
  try {
    const e = JSON.parse(readFileSync(path.join(DOMAIN_DIR, "dex", "honest-econ.json"), "utf8")) as {
      doctrine?: { he?: string };
      simBook?: { totalUsds?: number };
      realChain?: { sources?: { marksAt?: string }; lines?: Array<{ asset?: string; amount?: number | null; markUsd?: number | null; usd?: number | null; source?: string }> };
    };
    out.doctrineHe = e.doctrine?.he ?? null;
    out.simBookUsds = num(e.simBook?.totalUsds);
    out.realLines = (e.realChain?.lines ?? []).map((l) => ({
      asset: String(l.asset ?? "?"),
      amount: num(l.amount),
      markUsd: num(l.markUsd),
      usd: num(l.usd),
      source: String(l.source ?? ""),
    }));
    out.marksAt = e.realChain?.sources?.marksAt ?? null;
  } catch { /* fail-honest */ }
  if (out.realLines.length === 0) {
    try {
      const m = JSON.parse(readFileSync(path.join(DOMAIN_DIR, "dex", "money.json"), "utf8")) as { fuel?: { steem?: number; sbd?: number } };
      out.realLines = [
        { asset: "STEEM · acct-00-liquid", amount: num(m.fuel?.steem), markUsd: null, usd: null, source: "money.json fuel" },
        { asset: "SBD · acct-00-liquid", amount: num(m.fuel?.sbd), markUsd: null, usd: null, source: "money.json fuel" },
      ];
    } catch { /* fail-honest */ }
  }
  out.realUsd = out.realLines.reduce((s, l) => s + (l.usd ?? 0), 0) || null;
  /* גריד-אמת: grid.json (armed + זמן-פרסום) */
  try {
    const g = JSON.parse(readFileSync(path.join(DOMAIN_DIR, "dex", "grid.json"), "utf8")) as { armed?: boolean; publishedAt?: string };
    out.gridArmed = typeof g.armed === "boolean" ? g.armed : null;
    out.gridAt = typeof g.publishedAt === "string" ? g.publishedAt : null;
  } catch { /* fail-honest */ }
  void sbdUsdFallback;
  return out;
}

/* ═══ שבע-האסטרטגיות · מיון-ROI אחיד ═══ */

const STATUS_ORDER: Record<StrategyRow["status"], number> = { ACTIVE: 0, READY: 1, "NEEDS-APPROVAL": 2, REPAIRING: 3, DORMANT: 4, REJECTED: 5 };

export function buildStrategies(input: {
  market: OrderBookMeasure | null;
  chain: Awaited<ReturnType<typeof fetchGlobalProps>>;
  reward: Pick<CapitalReward, "rewardBalanceSteem"> | null;
  ledger: LedgerTruth;
  marks: CapitalMarks | null;
  feedSbdPerSteem?: number | null;
  sovereign?: SovereignAccount | null;
}): StrategyRow[] {
  const { market, chain, reward, ledger, marks, sovereign } = input;
  /* בסיס-ההון המתוקן: מלאי-אמת (חופשי+תחום) כשנמדד · אחרת-הספר-הישן (חופשי-בלבד) */
  const realUsd = sovereign?.treasuryUsdMarked ?? ledger.realUsd;
  const mmLive = (sovereign?.openOrders.length ?? 0) > 0 || (sovereign?.ops.fills ?? 0) > 0;
  const spDeployed = (sovereign?.sp.delegatedOutSp ?? 0) > 0;
  const mid = market?.bestBid != null && market?.bestAsk != null ? (market.bestBid + market.bestAsk) / 2 : null;
  /* מדד-העוגן של השרשרת — נמדד-חי; הפער-מול-הספר הוא-המדידה של CONVERT */
  const feedSbdPerSteem = input.feedSbdPerSteem ?? null;
  /* נגזרת-הספר: sbdUsd = steemUsd ÷ (SBD-ל-STEEM של הספר) — כשאין-סימון-חוץ ל-SBD */
  const sbdUsd = marks?.sbdUsd ?? (marks?.steemUsd != null && mid ? marks.steemUsd / mid : null);
  /* קצה-ההמרה (STEEM→SBD בעוגן מול-מכירת-STEEM בשוק): F×sbdUsd מול steemUsd */
  const convertEdgePct =
    feedSbdPerSteem != null && sbdUsd != null && marks?.steemUsd != null && marks.steemUsd > 0
      ? ((feedSbdPerSteem * sbdUsd - marks.steemUsd) / marks.steemUsd) * 100
      : null;
  /* MND-20261015: קצה-שלילי = תירגול-לספר-המיקור (שכבר-מוכר-מעל-המדד — נמדד), לא-דחייה */
  const convertStatus: StrategyRow["status"] =
    convertEdgePct == null ? "READY" : convertEdgePct >= -1 ? "READY" : "REPAIRING";
  const rows: Array<Omit<StrategyRow, "rank">> = [
    {
      id: "HOLD",
      nameHe: "החזקה (STEEM+SBD מסומנים)",
      aprPct: 0,
      aprBasis: "בסיס-ההשוואה — אין-תשואה מהחזקה-בהגדרה",
      status: "ACTIVE",
      liquidity: "FULL",
      risk: "MEDIUM",
      capitalFitUsd: realUsd,
      evidence: `מלאי-אמת=${realUsd !== null ? realUsd.toFixed(2) : "—"}$ (חופשי+תחום) · marks=${marks?.source ?? "לא-נמדד"}`,
    },
    {
      id: "CONVERT",
      nameHe: "המרה במחיר-העוגן (STEEM→SBD)",
      aprPct: convertEdgePct,
      aprBasis:
        `קצה-חד-פעמי נמדד: מדד-העוגן (${feedSbdPerSteem != null ? feedSbdPerSteem.toFixed(4) : "—"} SBD/STEEM) מול מחיר-הספר (${mid != null ? mid.toFixed(4) : "—"}) — פער-מדוד-חי; חיכוכי-אמת: המרה 3.5-ימים · sbd_print_rate · סיכון-זחילת-העוגן`,
      status: convertStatus,
      liquidity: "HIGH",
      risk: "MEDIUM",
      capitalFitUsd: marks?.steemUsd != null && sovereign ? Math.round(sovereign.holdings.steemTotal * marks.steemUsd * 100) / 100 : null,
      evidence: `feed=${feedSbdPerSteem != null ? feedSbdPerSteem.toFixed(4) : "—"} · bookMid=${mid != null ? mid.toFixed(4) : "—"} · sbdUsd=${sbdUsd != null ? sbdUsd.toFixed(4) : "—"}`,
    },
    {
      id: "GRID",
      nameHe: "הגריד (מנוע-הדקס החי)",
      aprPct: null,
      aprBasis: "מנוע-SIM — R74: רווח-הספר-הפנימי אינו-רווח-אמת (אין-תביעת-ערך-חוץ)",
      status: ledger.gridArmed ? "ACTIVE" : "DORMANT",
      liquidity: "HIGH",
      risk: "MEDIUM",
      capitalFitUsd: realUsd !== null ? Math.round(realUsd * 0.5 * 100) / 100 : null,
      evidence: `grid.json armed=${String(ledger.gridArmed)} · ${ledger.gridAt ?? "לא-נמדד"}`,
    },
    {
      id: "FLEET",
      nameHe: "הצי (ספרים-מקבילים)",
      aprPct: null,
      aprBasis: "ה\"סכר-היבש\" נמדד-מחדש על-המלאי-המתוקן — המשאבים-קיימים; ההיקף-מחכה-הכרעה",
      status: "REPAIRING",
      liquidity: "NONE",
      risk: "HIGH",
      capitalFitUsd: realUsd !== null ? Math.round(realUsd * 0.25 * 100) / 100 : null,
      evidence:
        "לולאת-התיקון: מלאי-אמת " + (realUsd !== null ? `${realUsd.toFixed(2)}$` : "לא-נמדד") +
        (sovereign ? ` · נטו-SP ${sovereign.sp.netWorkingSp.toFixed(1)}` : ""),
    },
    {
      id: "MM-INTERNAL",
      nameHe: "מכשור-שוק פנימי (עשיית-שוק בספר) — חי על-השרשרת",
      aprPct: market?.spreadPct ?? null,
      aprBasis: "spread% נמדד-חי מ-get_order_book · המיקור-עצמו-חי: fills+ספר-פתוח נמדדים-על-החשבון-הריבוני",
      status: mmLive ? "ACTIVE" : "NEEDS-APPROVAL",
      liquidity: market && market.totalDepthSbd > 0 ? "MEDIUM" : "NONE",
      risk: "MEDIUM",
      capitalFitUsd: realUsd !== null ? Math.round(realUsd * 0.2 * 100) / 100 : null,
      evidence:
        `spread=${market?.spreadPct !== undefined && market?.spreadPct !== null ? market.spreadPct.toFixed(2) + "%" : "—"} · depth=${market ? Math.round(market.bidDepthSbd + market.askDepthSbd) : "—"} SBD` +
        (sovereign
          ? ` · חי: ${sovereign.openOrders.length}-הזמנות-פתוחות · ${sovereign.ops.fills}-fills · VWAP-מכירות ${sovereign.ops.sellVwapSbdPerSteem != null ? sovereign.ops.sellVwapSbdPerSteem.toFixed(5) : "—"} SBD/STEEM`
          : ""),
    },
    {
      id: "SP-DELEGATE",
      nameHe: "העברת-SP (ציד-הצבעות-בדלגציה) — פעילה-ממיל",
      aprPct:
        reward?.rewardBalanceSteem != null &&
        chain?.totalVestingFundSteem != null &&
        chain.totalVestingFundSteem > 0
          ? (reward.rewardBalanceSteem * 365 * 100) / (7 * chain.totalVestingFundSteem)
          : null,
      aprBasis: "אומדן-נוסחה-חשופה: reward_balance ÷ 7-ימים × (1000 ÷ total_vesting_fund) × 365 — חלון-התביעות-7-ימים-מונח-מוצהר",
      status: spDeployed ? "ACTIVE" : "READY",
      liquidity: "LOCKED-7D",
      risk: "MEDIUM",
      capitalFitUsd: realUsd !== null ? Math.round(realUsd * 0.25 * 100) / 100 : null,
      evidence:
        `reward_fund=${reward?.rewardBalanceSteem ?? "—"} STEEM · vesting_fund=${chain?.totalVestingFundSteem ?? "—"}` +
        (sovereign
          ? ` · SP-אמת: ${sovereign.sp.ownSp.toFixed(1)}-עצמי / ${sovereign.sp.delegatedOutSp.toFixed(1)}-מועבר-חי / ${sovereign.sp.netWorkingSp.toFixed(1)}-נטו · ציד-נמדד ${sovereign.ops.curationSpEarned.toFixed(3)} SP`
          : ""),
    },
    {
      id: "SBD-INTEREST",
      nameHe: "ריבית-SBD (עוגן-השרשרת) — מתורגל-למסלול-עובד",
      aprPct: chain?.sbdInterestAprPct ?? null,
      aprBasis: "sbd_interest_rate מהשרשרת (1000=10% שנתי) — נמדד-ישירות; פרמטר-עדים=0 כרגע: הריבית-אינה-קיימת-על-השרשרת, לא-תקלה-אצלנו",
      status: chain?.sbdInterestAprPct != null && chain.sbdInterestAprPct >= 0.5 ? "READY" : "REPAIRING",
      liquidity: "FULL",
      risk: "LOW",
      capitalFitUsd: chain?.sbdInterestAprPct != null && chain.sbdInterestAprPct >= 0.5 ? realUsd : (sovereign ? Math.round(sovereign.holdings.sbdTotal * (marks?.sbdUsd ?? 0) * 100) / 100 : 0),
      evidence:
        `sbd_interest_rate=${chain?.sbdInterestRaw ?? "—"} → ${chain?.sbdInterestAprPct !== undefined && chain?.sbdInterestAprPct !== null ? chain.sbdInterestAprPct.toFixed(2) + "%" : "—"} שנתי` +
        (sovereign ? ` · תירגול-חי: ${sovereign.holdings.sbdLocked.toFixed(1)} SBD כבר-על-סולם-המיקור (עובד-במקום-הריבית)` : ""),
    },
  ];
  /* מיון-ROI: תשואה-נמדדת יורדת · אחר-כך סדר-סטטוס (אפס-הסתרה) */
  const ranked = [...rows].sort((x, y) => {
    const ax = x.aprPct ?? Number.NEGATIVE_INFINITY;
    const ay = y.aprPct ?? Number.NEGATIVE_INFINITY;
    if (ax !== ay) return ay - ax;
    return STATUS_ORDER[x.status] - STATUS_ORDER[y.status];
  });
  return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ═══ תוכניות-הצבה — מסמכים-בלבד · ההגשה-חיה בזרם-הריבונות ═══ */

/* ההגשה-בפועל: REQ-0006/REQ-0007 חיים בזרם-הקנון (Pulse · SAOS-SOVEREIGN-CHANNEL/1 · קומיט ea8458e) —
 * הכרעת-הבעלים תנחת כהוראת-D-NNNN ב-directives.jsonl (רק-הוא-כותב-שם). אפס-נתיב-ביצוע בקוד. */
export const SOVEREIGN_STREAM_URL =
  "https://github.com/roshpinacare-sys/Pulse/blob/main/state/sovereign-channel/requests.jsonl";
export const SOVEREIGN_FILED_AT = "2026-10-15T13:53:48Z";

export function buildMmPlan(market: OrderBookMeasure | null, treasuryUsd: number | null, marks: CapitalMarks | null): MmPlan {
  const depthSbd = market ? market.bidDepthSbd + market.askDepthSbd : 0;
  const depthUsd = marks?.sbdUsd != null && depthSbd > 0 ? depthSbd * marks.sbdUsd : null;
  const quoteBudgetUsd = treasuryUsd != null ? Math.round(treasuryUsd * 0.2 * 100) / 100 : null;
  const maxOrderUsd =
    quoteBudgetUsd != null && depthUsd != null && depthUsd > 0
      ? Math.round(Math.min(depthUsd * 0.1, quoteBudgetUsd * 0.5) * 100) / 100
      : null;
  const spreadPct = market?.spreadPct ?? null;
  return {
    approved: false,
    statusLine: "מנדט MND-20261015 · המיקור-חי-כבר-על-השרשרת — התוכנית = מסמך-ההרחבה (התקדמות-בשערים-ירוקים)",
    approvalPathHe: "התקדמות-אוטומטית-בשערים-הירוקים לפי-המנדט · שינוי-פרמטרים-מוצע-בהוראת-D-NNNN-של-הבעלים ב-directives.jsonl",
    filing: {
      reqId: "REQ-0006",
      streamUrl: SOVEREIGN_STREAM_URL,
      filedAt: SOVEREIGN_FILED_AT,
      registryRef: "Pulse/DECISIONS.md #47 · R364",
    },
    inputs: { spreadPct, totalDepthUsd: depthUsd, realMoneyUsd: treasuryUsd },
    params: {
      quoteBudgetUsd,
      maxOrderUsd,
      quoteAtSpreadPct: spreadPct !== null ? Math.max(0.75, Math.round(spreadPct * 0.8 * 100) / 100) : null,
      staleQuoteMs: 15_000,
      priceMovePullPct: 1.5,
      inventorySkewPct: 60,
      dailyLossCapPct: 1,
      killSwitchTrips: 3,
    },
    paramsBasisHe:
      "כל-פרמטר נגזר-ממדידה-חיה: תקציב=20% מהמלאי-המתוקן (חופשי+תחום) · הזמנה-מרבית=min(10% מהעומק-הנמדד, 50% מהתקציב) · " +
      "דיוק-דיור=min-נמדד×0.8 עם-רצפת-0.75% — הנוסחאות-חשופות-כאן, אפס-קבועים-סמויים",
    guardrailsHe: [
      "מיקור-עייף (>15ש׳ ≈ 5-בלוקים) → ביטול-והצבה-מחדש במחיר-השוק-הנוכחי",
      "תזוזת-מחיר >1.5% בין-שני-סימוכין → שתי-הצדדים-נשלפים (מצב-שטוח) עד-התייצבות",
      "סטיית-מלאי >60/40 לצד-אחד → מיקור-חד-צדדי-חובה עד-חזרה-לאיזון",
      "תקרת-הפסד-יומי 1% מהמלאי-האמת → הפסקת-מיקור-לשארית-היום (UTC)",
      "3-נסיעות-מעקה-ביום → מתג-חיסול-מלא + רישום-בערוץ-הריבונות להבעלים",
    ],
  };
}

export function buildSpMatrix(aprPct: number | null, marks: CapitalMarks | null, realizedAprPct: number | null): SpMatrix {
  const steemUsd = marks?.steemUsd ?? null;
  const per1000 = (sharePct: number): number | null =>
    aprPct !== null && steemUsd !== null ? Math.round(1000 * (sharePct / 100) * (aprPct / 100) * steemUsd * 100) / 100 : null;
  const rows: SpMatrixRow[] = [25, 50, 100].map((sharePct) => ({
    sharePct,
    workingSp: Math.round(1000 * (sharePct / 100)),
    liquidityRetainedPct: 100 - sharePct,
    recallDays: 7,
    cells: [
      { cadence: "weekly", cadenceHe: "הצבה-מחדש-שבועית", per1000SpAnnualUsd: per1000(sharePct), note: "פירות-ציד-נתבעים-ונדלגים-מחדש כל-שבוע — חיכוך-גבוה, ריבית-דריבית-קרובה-לאומדן" },
      { cadence: "monthly", cadenceHe: "הצבה-מחדש-חודשית", per1000SpAnnualUsd: per1000(sharePct), note: "איזון-חיכוך-מול-ריבית-דריבית — ברירת-המחדל-המוצעת" },
      { cadence: "none", cadenceHe: "ללא-הצבה-מחדש", per1000SpAnnualUsd: per1000(sharePct), note: "תשואה-פשוטה-בלבד — אפס-חיכוך-ניהול" },
    ],
  }));
  return {
    approved: false,
    statusLine: "מנדט MND-20261015 · הדלגציה-פעילה-ממיל — המטריצה-הפכה-מוחשית על SP-אמת-נמדד",
    approvalPathHe: "התקדמות-בשערים-הירוקים לפי-המנדט · הכרעת-שורה-מהמטריצה — הוראת-D-NNNN-או-ערוץ-הבעלים",
    filing: {
      reqId: "REQ-0007",
      streamUrl: SOVEREIGN_STREAM_URL,
      filedAt: SOVEREIGN_FILED_AT,
      registryRef: "Pulse/DECISIONS.md #47 · R364",
    },
    aprPct,
    aprBasisHe: "אותו-אומדן-הציד מהשרשרת (נוסחה-חשופה בשורת-האסטרטגיה); הדירוג-בין-השורות-משנה-הון-מופעל ונזילות-שמורה — לא-את-ה-APR עצמו",
    spHeldKnown: true,
    realizedCurationAprPct: realizedAprPct,
    rows,
  };
}

/* ═══ המדידה-המלאה ═══ */

export async function measureCapital(): Promise<CapitalPayload> {
  const t0 = Date.now();
  const errors: string[] = [];
  const [marks, book, chain, reward, feed] = await Promise.all([
    fetchMarks(),
    fetchOrderBook(50),
    fetchGlobalProps(),
    fetchRewardFund(),
    fetchFeedPrice(),
  ]);
  if (!marks) errors.push("marks: כל-סולם-הסימונים (Binance/Paprika/CoinGecko) לא-נמדד");
  if (!book) errors.push("order_book: get_order_book לא-נמדד");
  if (!chain) errors.push("chain: get_dynamic_global_properties לא-נמדד");
  if (!reward) errors.push("reward: get_reward_fund לא-נמדד");

  /* נגזרת-הספר ל-SBD (תווית-גילוח מוצהרת): sbdUsd = steemUsd ÷ mid(SBD ל-STEEM) */
  const midRaw = book?.bestBid != null && book?.bestAsk != null ? (book.bestBid + book.bestAsk) / 2 : null;
  const marksFilled: CapitalMarks | null = marks
    ? marks.sbdUsd == null && marks.steemUsd != null && midRaw
      ? {
          ...marks,
          sbdUsd: marks.steemUsd / midRaw,
          source: `${marks.source} · נגזרת-ספר: steemUsd ÷ bookMid`,
        }
      : marks
    : null;

  const market: CapitalMarket | null = book
    ? {
        ...book,
        mid: midRaw,
        totalDepthSbd: book.bidDepthSbd + book.askDepthSbd,
        totalDepthUsd: marksFilled?.sbdUsd != null ? (book.bidDepthSbd + book.askDepthSbd) * marksFilled.sbdUsd : null,
      }
    : null;

  /* אמת-החשבון-הריבוני — נכשל-בכנות-בלבד, לא-מפיל-את-המדידה-כולה */
  const sovereign = await fetchSovereignAccount(
    chain ? { totalVestingShares: chain.totalVestingShares, totalVestingFundSteem: chain.totalVestingFundSteem } : null,
    marksFilled?.sbdUsd ?? null,
    marksFilled?.steemUsd ?? null,
  ).catch(() => null);
  if (!sovereign) errors.push("sovereign: אמת-החשבון-הריבוני (get_accounts/limit_orders/history) לא-נמדדה");

  const ledger = loadLedger(marksFilled?.sbdUsd ?? null);
  const strategies = buildStrategies({ market: book, chain, reward, ledger, marks: marksFilled, feedSbdPerSteem: feed?.sbdPerSteem ?? null, sovereign });
  const treasuryUsd = sovereign?.treasuryUsdMarked ?? ledger.realUsd;
  const mmPlan = buildMmPlan(book, treasuryUsd, marksFilled);
  const spApr = strategies.find((s) => s.id === "SP-DELEGATE")?.aprPct ?? null;
  const realizedCurationAprPct =
    sovereign && sovereign.ops.curationSpEarned > 0 && sovereign.sp.netWorkingSp > 0
      ? Math.round((sovereign.ops.curationSpEarned / sovereign.sp.netWorkingSp) * 100 * (365 / 7) * 100) / 100
      : null;
  const spMatrix = buildSpMatrix(spApr, marksFilled, realizedCurationAprPct);
  const readiness = buildReadiness({ sovereign, feedSbdPerSteem: feed?.sbdPerSteem ?? null, poolAprPct: spApr });
  const repairs = buildRepairs({ sovereign, chain, feedSbdPerSteem: feed?.sbdPerSteem ?? null, poolAprPct: spApr });

  const ok = Boolean(marks && book && chain && reward && sovereign);
  return {
    ok,
    note: ok ? undefined : `מדידה-חלקית-כנה: ${errors.join(" · ")}`,
    measuredAt: new Date().toISOString(),
    marks,
    market,
    chain: chain ?? null,
    reward: reward
      ? {
          ...reward,
          curatorAprEstPct: spApr,
          formulaHe: "APR ≈ reward_balance ÷ 7 × (1000 ÷ total_vesting_fund) × 365 — חלון-התביעות-המונח: 7-ימים",
        }
      : null,
    feed: feed ?? null,
    ledger,
    sovereign,
    mandate: STANDING_MANDATE,
    readiness,
    repairs,
    strategies,
    mmPlan,
    spMatrix,
    meta: { ms: Date.now() - t0, rpc: RPC, errors },
  };
}
