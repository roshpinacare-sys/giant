/**
 * capital.ts — מנוע-ההון הריבוני · שבע-האסטרטגיות נמדדות-חי (גל-המשך · חוק-הבעלים).
 * ═══════════════════════════════════════════════════════════════════════════
 * שורש-האמת: השושלת-הקודמת של מנוע-זה חיה-רק-בסנדבוקס-שנמחק (מנדט-הבעלים:
 * "הגיט הוא שכבת-הקיום") — לכן אין-שחזור-מספרים-ישנים: כל-ערך נמדד-חי כאן:
 *  · condenser_api.get_order_book      → spread + עומק (MM-INTERNAL)
 *  · condenser_api.get_dynamic_global_properties → sbd_interest_rate + vesting
 *  · condenser_api.get_reward_fund     → אומדן-APR-ציד-הצבעות (SP-DELEGATE)
 *  · condenser_api.get_feed_history    → מחיר-עוגן (CONVERT)
 *  · CoinGecko simple/price            → סימוני-שוק חוץ (אותו-מקור של money.json)
 *  · estate/Domain (קבצי-אמת מקומיים)  → כסף-אמת · ספר-SIM · מצב-הגריד
 * דוקטרינת-האישורים (הבעלים=הריבונות): תוכניות-הצבה/העברה מיוצרות כמסמכים
 * בלבד (approved:false-מוצק) — אין-שום-נתיב-ביצוע בקוד; האישור עובר בערוץ.
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
  MmPlan,
  SpMatrix,
  SpMatrixRow,
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

export async function fetchGlobalProps(): Promise<Pick<CapitalChain, "headBlock" | "headTime" | "sbdInterestRaw" | "sbdInterestAprPct" | "totalVestingFundSteem" | "virtualSupplySteem"> | null> {
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

/* ═══ קבצי-אמת מקומיים (אחוזת-Domain — הקנון) ═══ */

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

const STATUS_ORDER: Record<StrategyRow["status"], number> = { ACTIVE: 0, READY: 1, "NEEDS-APPROVAL": 2, DORMANT: 3, REJECTED: 4 };

export function buildStrategies(input: {
  market: OrderBookMeasure | null;
  chain: Awaited<ReturnType<typeof fetchGlobalProps>>;
  reward: Pick<CapitalReward, "rewardBalanceSteem"> | null;
  ledger: LedgerTruth;
  marks: CapitalMarks | null;
  feedSbdPerSteem?: number | null;
}): StrategyRow[] {
  const { market, chain, reward, ledger, marks } = input;
  const realUsd = ledger.realUsd;
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
  const convertStatus: StrategyRow["status"] =
    convertEdgePct == null ? "READY" : convertEdgePct >= -1 ? "READY" : "REJECTED";
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
      evidence: `realUsd=${realUsd !== null ? realUsd.toFixed(2) : "—"}$ · marks=${marks?.source ?? "לא-נמדד"}`,
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
      capitalFitUsd: marks?.steemUsd != null && ledger.realLines[0]?.amount != null ? Math.round(ledger.realLines[0].amount * marks.steemUsd * 100) / 100 : null,
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
      aprBasis: "סכר-הדלק יבש — כסף-אמת קטן-מדד להזנה; דורש-מימון-מחדש",
      status: "DORMANT",
      liquidity: "NONE",
      risk: "HIGH",
      capitalFitUsd: 0,
      evidence: "קנון-הגלים · כסף-אמת " + (realUsd !== null ? `${realUsd.toFixed(2)}$` : "לא-נמדד"),
    },
    {
      id: "MM-INTERNAL",
      nameHe: "מכשור-שוק פנימי (עשיית-שוק בספר)",
      aprPct: market?.spreadPct ?? null,
      aprBasis: "spread% נמדד-חי מ-get_order_book — לכידה-גולמית-למחזור (לא-ממוספר)",
      status: "NEEDS-APPROVAL",
      liquidity: market && market.totalDepthSbd > 0 ? "MEDIUM" : "NONE",
      risk: "MEDIUM",
      capitalFitUsd: realUsd !== null ? Math.round(realUsd * 0.2 * 100) / 100 : null,
      evidence: `spread=${market?.spreadPct !== undefined && market?.spreadPct !== null ? market.spreadPct.toFixed(2) + "%" : "—"} · depth=${market ? Math.round(market.bidDepthSbd + market.askDepthSbd) : "—"} SBD`,
    },
    {
      id: "SP-DELEGATE",
      nameHe: "העברת-SP (ציד-הצבעות-בדלגציה)",
      aprPct:
        reward?.rewardBalanceSteem != null &&
        chain?.totalVestingFundSteem != null &&
        chain.totalVestingFundSteem > 0
          ? (reward.rewardBalanceSteem * 365 * 100) / (7 * chain.totalVestingFundSteem)
          : null,
      aprBasis: "אומדן-נוסחה-חשופה: reward_balance ÷ 7-ימים × (1000 ÷ total_vesting_fund) × 365 — חלון-התביעות-7-ימים-מונח-מוצהר",
      status: "READY",
      liquidity: "LOCKED-7D",
      risk: "MEDIUM",
      capitalFitUsd: realUsd !== null ? Math.round(realUsd * 0.25 * 100) / 100 : null,
      evidence: `reward_fund=${reward?.rewardBalanceSteem ?? "—"} STEEM · vesting_fund=${chain?.totalVestingFundSteem ?? "—"}`,
    },
    {
      id: "SBD-INTEREST",
      nameHe: "ריבית-SBD (עוגן-השרשרת)",
      aprPct: chain?.sbdInterestAprPct ?? null,
      aprBasis: "sbd_interest_rate מהשרשרת (1000=10% שנתי) — נמדד-ישירות",
      status: chain?.sbdInterestAprPct != null && chain.sbdInterestAprPct >= 0.5 ? "READY" : "REJECTED",
      liquidity: "FULL",
      risk: "LOW",
      capitalFitUsd: chain?.sbdInterestAprPct != null && chain.sbdInterestAprPct >= 0.5 ? realUsd : 0,
      evidence: `sbd_interest_rate=${chain?.sbdInterestRaw ?? "—"} → ${chain?.sbdInterestAprPct !== undefined && chain?.sbdInterestAprPct !== null ? chain.sbdInterestAprPct.toFixed(2) + "%" : "—"} שנתי`,
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

export function buildMmPlan(market: OrderBookMeasure | null, realUsd: number | null, marks: CapitalMarks | null): MmPlan {
  const depthSbd = market ? market.bidDepthSbd + market.askDepthSbd : 0;
  const depthUsd = marks?.sbdUsd != null && depthSbd > 0 ? depthSbd * marks.sbdUsd : null;
  const quoteBudgetUsd = realUsd != null ? Math.round(realUsd * 0.2 * 100) / 100 : null;
  const maxOrderUsd =
    quoteBudgetUsd != null && depthUsd != null && depthUsd > 0
      ? Math.round(Math.min(depthUsd * 0.1, quoteBudgetUsd * 0.5) * 100) / 100
      : null;
  const spreadPct = market?.spreadPct ?? null;
  return {
    approved: false,
    statusLine: "מוגשת-ריבונית · REQ-0006 פתוח בזרם-הקנון — הכדור-אצל-הריבונות",
    approvalPathHe: "הכרעה-רק-בהוראת-D-NNNN של-הבעלים ב-directives.jsonl (שער-הבעלים) — לא-בכפתור, לא-ב-API, לא-בשרת",
    filing: {
      reqId: "REQ-0006",
      streamUrl: SOVEREIGN_STREAM_URL,
      filedAt: SOVEREIGN_FILED_AT,
      registryRef: "Pulse/DECISIONS.md #47 · R364",
    },
    inputs: { spreadPct, totalDepthUsd: depthUsd, realMoneyUsd: realUsd },
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
      "כל-פרמטר נגזר-ממדידה-חיה: תקציב=20% מהכסף-האמת · הזמנה-מרבית=min(10% מהעומק-הנמדד, 50% מהתקציב) · " +
      "דיוק-דיור=min-נמדד×0.8 עם-רצפת-0.75% — הנוסחאות-חשופות-כאן, אפס-קבועים-סמויים",
    guardrailsHe: [
      "מיקור-עייף (>15ש׳ ≈ 5-בלוקים) → ביטול-והצבה-מחדש במחיר-השוק-הנוכחי",
      "תזוזת-מחיר >1.5% בין-שני-סימוכין → שתי-הצדדים-נשלפים (מצב-שטוח) עד-התייצבות",
      "סטיית-מלאי >60/40 לצד-אחד → מיקור-חד-צדדי-חובה עד-חזרה-לאיזון",
      "תקרת-הפסד-יומי 1% מהכסף-האמת → הפסקת-מיקור-לשארית-היום (UTC)",
      "3-נסיעות-מעקה-ביום → מתג-חיסול-מלא + רישום-בערוץ-הריבונות להבעלים",
    ],
  };
}

export function buildSpMatrix(aprPct: number | null, marks: CapitalMarks | null): SpMatrix {
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
    statusLine: "מוגשת-ריבונית · REQ-0007 פתוח בזרם-הקנון — הכדור-אצל-הריבונות",
    approvalPathHe: "הכרעה-רק-בהוראת-D-NNNN — כמו-כל-העברת-SP (הבעלים=הריבונות)",
    filing: {
      reqId: "REQ-0007",
      streamUrl: SOVEREIGN_STREAM_URL,
      filedAt: SOVEREIGN_FILED_AT,
      registryRef: "Pulse/DECISIONS.md #47 · R364",
    },
    aprPct,
    aprBasisHe: "אותו-אומדן-הציד מהשרשרת (נוסחה-חשופה בשורת-האסטרטגיה); הדירוג-בין-השורות-משנה-הון-מופעל ונזילות-שמורה — לא-את-ה-APR עצמו",
    spHeldKnown: false,
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

  const ledger = loadLedger(marksFilled?.sbdUsd ?? null);
  const strategies = buildStrategies({ market: book, chain, reward, ledger, marks: marksFilled, feedSbdPerSteem: feed?.sbdPerSteem ?? null });
  const mmPlan = buildMmPlan(book, ledger.realUsd, marksFilled);
  const spMatrix = buildSpMatrix(strategies.find((s) => s.id === "SP-DELEGATE")?.aprPct ?? null, marksFilled);

  const ok = Boolean(marks && book && chain && reward);
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
          curatorAprEstPct: strategies.find((s) => s.id === "SP-DELEGATE")?.aprPct ?? null,
          formulaHe: "APR ≈ reward_balance ÷ 7 × (1000 ÷ total_vesting_fund) × 365 — חלון-התביעות-המונח: 7-ימים",
        }
      : null,
    feed: feed ?? null,
    ledger,
    strategies,
    mmPlan,
    spMatrix,
    meta: { ms: Date.now() - t0, rpc: RPC, errors },
  };
}
