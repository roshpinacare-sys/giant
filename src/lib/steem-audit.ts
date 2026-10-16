// steem-audit.ts — אמת-הכסף של headcorner (server-only)
// השאלה-של-הבעלים (trace 1a14672a193f9255): "איפה הכסף? קיבלתי בערך 1100 STEEM
// ונראה שלפחות 800 נעלמו". התשובה-המדודה (2026-10-16, מהשרשרת):
//  · החשבון לא העביר שקל החוצה (אפס transfers) — הכסף לא "נעלם", הוא התחלף.
//  · חלק-גדול מהיקף-העסקאות הוא **עסקאות-עצמי (self-trade wash)**: הפקודות-שלנו
//    מתמלאות-מול-הפקודות-שלנו. ווש-כזה = אפס-השפעה-על-יתרות, אך ההיסטוריה
//    מציגה "נפח" ענק-ומטעה (נמדד: 1,286 STEEM ווש בחלון של ~5 ימים —
//    בדיוק-המקור-של-"1100 התקבלו/800 נעלמו").
//  · הזרימה-האמת: מכירות-אמת נטו הפכו STEEM→SBD (היתרה-נשארת-בחשבון:
//    נזיל + תחום-בהזמנות + SP).
// חוקי-אמת: כל-מספר מהשרשרת (api.steemit.com). כשל-רשת = null כנה.
// מטמון-מודול + stale-while-revalidate: הסריקה-כבדה (עמודי-היסטוריה) לא חוסמת-בקשות.

const STEEM_RPC = "https://api.steemit.com";
const ACCOUNT = "headcorner";
const HISTORY_PAGES_MAX = 110; // 110×100 אופים — החשבון עמוס (~4,800 אופים/יום: votes+posts+fills)
const FLOW_WINDOW_DAYS = 3; // חלון-הזרימה: 72 שעות אחרונות
const FLOW_WINDOW_TARGET_TS = new Date(Date.now() - FLOW_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
const CACHE_TTL_MS = 5 * 60_000;
const STALE_MAX_MS = 60 * 60_000; // מעבר-לזה מפרסמים-כשל-כנה

/* ─────────────────────────── RPC ─────────────────────────── */

async function steemRpc<T>(method: string, params: unknown, timeoutMs = 12_000): Promise<T | null> {
  try {
    const res = await fetch(STEEM_RPC, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "sovereign-audit" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: T; error?: unknown };
    if (!j || j.error || j.result === undefined) return null;
    return j.result;
  } catch {
    return null;
  }
}

/* ─────────────────────────── טיפוסים ─────────────────────────── */

export interface AuditOrder {
  orderid: number;
  side: "buy" | "sell";
  price: number;
  baseAsset: string;
  baseAmount: number;
  created: string;
  farFromMidPct: number | null; // |price/mid−1|×100 — סדר-שגוי-גלוי
}

export interface FlowWindow {
  fromTs: string;
  toTs: string;
  realFills: number;
  washFills: number;
  washVolumeSteem: number;
  washVolumeSbd: number;
  soldSteem: number; // מכירות-אמת (בסיס STEEM)
  receivedSbd: number;
  sellVwapSbdPerSteem: number | null;
  boughtSteem: number;
  spentSbd: number;
  buyVwapSbdPerSteem: number | null;
  netSteem: number; // קניות-אמת פחות מכירות-אמת
  netSbd: number;
  netValueSbd: number | null; // הערך-הנקי במחיר-מיד-חי (SBD יחידת-ערך)
  edgePct: number | null; // (buyVwap−sellVwap)/sellVwap×100 — חיובי=אובדן-קצה
}

export interface SteemAudit {
  at: string;
  account: string;
  live: boolean; // האם-הקריאה-האחרונה-הצליחה
  stale: boolean;
  holdings: {
    liquidSteem: number | null;
    liquidSbd: number | null;
    savingsSteem: number | null;
    savingsSbd: number | null;
    lockedSteem: number | null; // תחום-בהזמנות-פתוחות
    lockedSbd: number | null;
    openOrders: number | null;
    ownSp: number | null; // SP עצמי-נטו (אחרי-הפקדות-החוצה)
    delegatedOutSp: number | null;
  };
  midSbdPerSteem: number | null; // מיד-חי מהשוק-הפנימי
  orders: AuditOrder[]; // ההזמנות-הפתוחות (מדגם-ממוין-לפי-יצירה)
  mispricedOrders: AuditOrder[]; // סטייה->5% מהמיד — סדרות-שגויות-גלויות
  flow: FlowWindow | null;
  transfers: {
    count: number;
    in: { ts: string; from: string; amount: string }[];
    out: { ts: string; to: string; amount: string }[];
  } | null;
  verdict: {
    he: string; // משפט-אמת בעברית
    making: "yes" | "no" | "flat" | "unknown";
  };
  lastError: string | null;
}

/* ─────────────────────────── מטמון-מודול ─────────────────────────── */

interface CacheState {
  data: SteemAudit | null;
  builtAt: number;
  building: Promise<void> | null;
}

const g = globalThis as unknown as { __steemAudit?: CacheState };

function cache(): CacheState {
  if (!g.__steemAudit) g.__steemAudit = { data: null, builtAt: 0, building: null };
  return g.__steemAudit;
}

/* ─────────────────────────── עזרים ─────────────────────────── */

interface AssetLike {
  amount: number;
  nai: string;
  precision: number;
}

function parseAsset(a: unknown): AssetLike | null {
  if (!a || typeof a !== "object") return null;
  const o = a as { amount?: unknown; nai?: unknown; precision?: unknown };
  if (typeof o.amount !== "string" || typeof o.nai !== "string") return null;
  const amount = Number(o.amount) / 10 ** Number(o.precision ?? 3);
  return Number.isFinite(amount) ? { amount, nai: o.nai, precision: Number(o.precision ?? 3) } : null;
}

const NAI = {
  STEEM: "@@000000021",
  SBD: "@@000000013",
  VESTS: "@@000000037",
} as const;

function isNai(a: AssetLike, nai: string): boolean {
  return a.nai === nai;
}

interface HistFill {
  ts: string;
  currentOwner: string;
  openOwner: string;
  currentPays: AssetLike;
  openPays: AssetLike;
}
interface HistTransfer {
  ts: string;
  from: string;
  to: string;
  amount: AssetLike;
  memo: string;
}

interface HistoryScan {
  fills: HistFill[];
  transfers: HistTransfer[];
  opsSeen: number;
  fromTs: string;
  toTs: string;
}

async function scanHistory(): Promise<HistoryScan | null> {
  const fills: HistFill[] = [];
  const transfers: HistTransfer[] = [];
  let start: number = -1;
  let pages = 0;
  let fromTs = "";
  let toTs = "";
  let opsSeen = 0;
  while (pages < HISTORY_PAGES_MAX) {
    const res = await steemRpc<{ history: Array<[number, { timestamp: string; op: { type: string; value: Record<string, unknown> } }]> }>(
      "account_history_api.get_account_history",
      { account: ACCOUNT, start, limit: 100 },
    );
    if (!res?.history?.length) break;
    const hist = res.history;
    opsSeen += hist.length;
    for (const [, e] of hist) {
      const t = e.op?.type ?? "";
      const v = e.op?.value ?? {};
      if (t === "fill_order_operation") {
        const cp = parseAsset(v.current_pays);
        const op = parseAsset(v.open_pays);
        if (cp && op)
          fills.push({
            ts: e.timestamp,
            currentOwner: String(v.current_owner ?? ""),
            openOwner: String(v.open_owner ?? ""),
            currentPays: cp,
            openPays: op,
          });
      } else if (t === "transfer_operation") {
        const amt = parseAsset(v.amount);
        if (amt)
          transfers.push({
            ts: e.timestamp,
            from: String(v.from ?? ""),
            to: String(v.to ?? ""),
            amount: amt,
            memo: String(v.memo ?? ""),
          });
      }
    }
    pages += 1;
    const lo = hist[0][0];
    fromTs = hist[0][1].timestamp;
    toTs = hist[hist.length - 1][1].timestamp;
    if (lo <= 1 || lo - 1 === start) break;
    start = lo - 1;
    if (fromTs < FLOW_WINDOW_TARGET_TS) break;
    await new Promise((r) => setTimeout(r, 45)); // אדיבות-לצומת
  }
  if (!fills.length && !transfers.length && opsSeen === 0) return null;
  return { fills, transfers, opsSeen, fromTs, toTs };
}

/* ─────────────────────────── הבנייה ─────────────────────────── */

async function buildAudit(): Promise<SteemAudit> {
  const audit: SteemAudit = {
    at: new Date().toISOString(),
    account: ACCOUNT,
    live: false,
    stale: false,
    holdings: {
      liquidSteem: null,
      liquidSbd: null,
      savingsSteem: null,
      savingsSbd: null,
      lockedSteem: null,
      lockedSbd: null,
      openOrders: null,
      ownSp: null,
      delegatedOutSp: null,
    },
    midSbdPerSteem: null,
    orders: [],
    mispricedOrders: [],
    flow: null,
    transfers: null,
    verdict: { he: "הקריאה-מהשרשרת לא ענתה כרגע — לא ממציאים מסקנה", making: "unknown" },
    lastError: null,
  };

  // 1. יתרות + מיד (קריאות-קלות-במקביל)
  const [accRes, dgpRes, tickerRes, bookRes, ordersRes] = await Promise.all([
    steemRpc<Record<string, unknown>[]>("condenser_api.get_accounts", [[ACCOUNT]]),
    steemRpc<Record<string, string>>("condenser_api.get_dynamic_global_properties", []),
    steemRpc<{ latest: string }>("condenser_api.get_ticker", []),
    steemRpc<{ bids?: unknown[]; asks?: unknown[] }>("condenser_api.get_order_book", [3]),
    steemRpc<Record<string, unknown>[]>("condenser_api.get_open_orders", [ACCOUNT]),
  ]);
  const acc = accRes?.[0];
  if (!acc) {
    audit.lastError = "get_accounts לא ענה";
    return audit;
  }
  audit.live = true;
  const bal = (k: string) => parseFloat(String(acc[k] ?? "0")) || 0;
  audit.holdings.liquidSteem = bal("balance");
  audit.holdings.liquidSbd = bal("sbd_balance");
  audit.holdings.savingsSteem = bal("savings_balance");
  audit.holdings.savingsSbd = bal("savings_sbd_balance");

  const vest = (k: string) => parseFloat(String(acc[k] ?? "0")) || 0;
  const totalVests = parseFloat(String(dgpRes?.total_vesting_shares ?? "0")) || 0;
  const totalFund = parseFloat(String(dgpRes?.total_vesting_fund_steem ?? "0")) || 0;
  const spPerVest = totalVests > 0 ? totalFund / totalVests : 0;
  const ownVests = vest("vesting_shares") - vest("delegated_vesting_shares") + vest("received_vesting_shares");
  audit.holdings.ownSp = spPerVest > 0 ? ownVests * spPerVest : null;
  audit.holdings.delegatedOutSp = spPerVest > 0 ? vest("delegated_vesting_shares") * spPerVest : null;

  const latest = parseFloat(String(tickerRes?.latest ?? "0")) || null;
  // מיד-מהספר (הטיקר-לפעמים-מקרטע): best-bid/ask מהעומק
  let bid = 0;
  let ask = 0;
  try {
    const b0 = Array.isArray(bookRes?.bids) ? (bookRes?.bids?.[0] as Record<string, unknown>) : null;
    const a0 = Array.isArray(bookRes?.asks) ? (bookRes?.asks?.[0] as Record<string, unknown>) : null;
    if (b0) bid = Number(b0.real_price) || 0;
    if (a0) ask = Number(a0.real_price) || 0;
  } catch {
    /* כנה — המיד מהטיקר */
  }
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : (latest ?? null);
  audit.midSbdPerSteem = mid;

  // 2. הזמנות-פתוחות → תחום + סדרות-שגויות
  const open = Array.isArray(ordersRes) ? (ordersRes as Record<string, unknown>[]) : [];
  audit.holdings.openOrders = open.length;
  let lockSteem = 0;
  let lockSbd = 0;
  const orderRows: AuditOrder[] = [];
  for (const o of open) {
    const sp = o.sell_price as { base?: string; quote?: string } | undefined;
    const baseStr = String(sp?.base ?? "");
    const [amtStr, assetStr] = baseStr.split(" ");
    const baseAmount = parseFloat(amtStr ?? "0") || 0;
    const price = Number(o.real_price);
    let side: "buy" | "sell" = "sell";
    if (assetStr === "SBD") {
      lockSbd += baseAmount;
      side = "buy"; // מוכרים-SBD כדי-לקנות-STEEM
    } else if (assetStr === "STEEM") {
      lockSteem += baseAmount;
      side = "sell";
    }
    const far = mid && price > 0 ? Math.abs(price / mid - 1) * 100 : null;
    orderRows.push({
      orderid: Number(o.orderid ?? 0),
      side,
      price: Number.isFinite(price) ? price : 0,
      baseAsset: assetStr ?? "?",
      baseAmount,
      created: String(o.created ?? ""),
      farFromMidPct: far,
    });
  }
  audit.holdings.lockedSteem = lockSteem;
  audit.holdings.lockedSbd = lockSbd;
  orderRows.sort((a, b) => b.created.localeCompare(a.created));
  audit.orders = orderRows.slice(0, 24);
  audit.mispricedOrders = orderRows.filter((o) => o.farFromMidPct !== null && o.farFromMidPct > 5);

  // 3. סריקת-הזרימה (כבדה — המטמון-מגן)
  const scan = await scanHistory();
  if (scan) {
    const window = scan.fills.filter((f) => f.ts >= FLOW_WINDOW_TARGET_TS);
    let realFills = 0;
    let washFills = 0;
    let washSteem = 0;
    let washSbd = 0;
    let soldSteem = 0;
    let receivedSbd = 0;
    let boughtSteem = 0;
    let spentSbd = 0;
    for (const f of window) {
      const selfTrade = f.currentOwner === ACCOUNT && f.openOwner === ACCOUNT;
      if (selfTrade) {
        // עסקת-עצמי: שני-הצדדים-שלנו — אפס-השפעה-על-יתרות; נספר-כווש-בלבד
        washFills += 1;
        if (isNai(f.currentPays, NAI.STEEM)) washSteem += f.currentPays.amount;
        if (isNai(f.currentPays, NAI.SBD)) washSbd += f.currentPays.amount;
        if (isNai(f.openPays, NAI.STEEM)) washSteem += f.openPays.amount;
        if (isNai(f.openPays, NAI.SBD)) washSbd += f.openPays.amount;
        continue;
      }
      realFills += 1;
      // אנחנו-המייקר (current_owner=אנחנו): שילמנו current, קיבלנו open
      if (f.currentOwner === ACCOUNT) {
        if (isNai(f.currentPays, NAI.STEEM)) soldSteem += f.currentPays.amount;
        if (isNai(f.currentPays, NAI.SBD)) spentSbd += f.currentPays.amount;
        if (isNai(f.openPays, NAI.STEEM)) boughtSteem += f.openPays.amount;
        if (isNai(f.openPays, NAI.SBD)) receivedSbd += f.openPays.amount;
      } else if (f.openOwner === ACCOUNT) {
        // אנחנו-הטייקר: שילמנו open, קיבלנו current
        if (isNai(f.openPays, NAI.STEEM)) soldSteem += f.openPays.amount;
        if (isNai(f.openPays, NAI.SBD)) spentSbd += f.openPays.amount;
        if (isNai(f.currentPays, NAI.STEEM)) boughtSteem += f.currentPays.amount;
        if (isNai(f.currentPays, NAI.SBD)) receivedSbd += f.currentPays.amount;
      }
    }
    const sellVwap = soldSteem > 0 ? receivedSbd / soldSteem : null;
    const buyVwap = boughtSteem > 0 ? spentSbd / boughtSteem : null;
    const netSteem = boughtSteem - soldSteem;
    const netSbd = receivedSbd - spentSbd;
    const netValueSbd = mid ? netSteem * mid + netSbd : null;
    const edgePct = sellVwap && buyVwap ? ((buyVwap - sellVwap) / sellVwap) * 100 : null;

    audit.flow = {
      fromTs: scan.fromTs,
      toTs: scan.toTs,
      realFills,
      washFills,
      washVolumeSteem: washSteem,
      washVolumeSbd: washSbd,
      soldSteem,
      receivedSbd,
      sellVwapSbdPerSteem: sellVwap,
      boughtSteem,
      spentSbd,
      buyVwapSbdPerSteem: buyVwap,
      netSteem,
      netSbd,
      netValueSbd,
      edgePct,
    };

    const tIn = scan.transfers.filter((t) => t.to === ACCOUNT && t.from !== ACCOUNT && t.ts >= FLOW_WINDOW_TARGET_TS);
    const tOut = scan.transfers.filter((t) => t.from === ACCOUNT && t.to !== ACCOUNT && t.ts >= FLOW_WINDOW_TARGET_TS);
    audit.transfers = {
      count: tIn.length + tOut.length,
      in: tIn.map((t) => ({ ts: t.ts, from: t.from, amount: `${t.amount.amount.toFixed(3)} ${isNai(t.amount, NAI.STEEM) ? "STEEM" : isNai(t.amount, NAI.SBD) ? "SBD" : "?"}` })),
      out: tOut.map((t) => ({ ts: t.ts, to: t.to, amount: `${t.amount.amount.toFixed(3)} ${isNai(t.amount, NAI.STEEM) ? "STEEM" : isNai(t.amount, NAI.SBD) ? "SBD" : "?"}` })),
    };

    // 4. פסק-אמת — מנוסח-מהמספרים-המדודים-בלבד
    const parts: string[] = [];
    let making: SteemAudit["verdict"]["making"] = "unknown";
    if (audit.transfers.count === 0) parts.push("אף-העברה-לא-יצאה-מהחשבון");
    if (washFills > 0)
      parts.push(
        `${washFills} עסקאות-עצמי (ווש) בנפח ${Math.round(washSteem)} STEEM — הן-לא-הזיזו-יתרה-וגרמו-לרושם-של-"כסף-שנעלם"`,
      );
    if (netValueSbd !== null) {
      const rounded = Math.round(netValueSbd * 100) / 100;
      if (rounded > 0.05) {
        making = "yes";
        parts.push(`זרימת-המסחר-האמת חיובית: +${rounded} SBD במונחי-מחיר-חי`);
      } else if (rounded < -0.05) {
        making = "no";
        parts.push(`זרימת-המסחר-האמת שלילית: ${rounded} SBD במונחי-מחיר-חי`);
      } else {
        making = "flat";
        parts.push(`זרימת-המסחר-האמת כמעט-אפסית (${rounded} SBD)`);
      }
    }
    if (edgePct !== null)
      parts.push(`קצה-מחיר: מכירות-VWAP ${sellVwap?.toFixed(5)} מול קניות-VWAP ${buyVwap?.toFixed(5)} (קצה ${edgePct.toFixed(3)}%)`);
    if (audit.mispricedOrders.length > 0)
      parts.push(`${audit.mispricedOrders.length} הזמנות-פתוחות-במחיר-חריג (>5% מהמיד) — דורשות-עין`);
    parts.push("היתרות-עגולות: נזיל + תחום-בהזמנות + SP — הכסף-בחשבון, לא-נעלם");
    audit.verdict = { he: parts.join(" · "), making };
  }

  return audit;
}

/* ─────────────────────────── שער-ציבורי ─────────────────────────── */

export async function steemAudit(): Promise<{ audit: SteemAudit; building: boolean }> {
  const c = cache();
  const now = Date.now();
  if (c.data && now - c.builtAt < CACHE_TTL_MS) return { audit: c.data, building: false };
  if (c.data && now - c.builtAt < STALE_MAX_MS) {
    // stale-while-revalidate: מחזירים-את-האמת-האחרונה-ומרעננים-ברקע
    if (!c.building) {
      c.building = buildAudit()
        .then((a) => {
          c.data = a;
          c.builtAt = Date.now();
        })
        .catch(() => {
          /* האמת-הקודמת-נשארת; הכישלון-הבא-ידווח-כנה */
        })
        .finally(() => {
          c.building = null;
        });
    }
    return { audit: c.data, building: true };
  }
  // אין-נתון-רענן — בונים-עכשיו (הבקשה-הראשונה-עלולה-להיות-איטית; כנה)
  try {
    const a = await buildAudit();
    c.data = a;
    c.builtAt = Date.now();
    return { audit: a, building: false };
  } catch (err) {
    if (c.data) return { audit: c.data, building: true };
    const failed: SteemAudit = {
      at: new Date().toISOString(),
      account: ACCOUNT,
      live: false,
      stale: false,
      holdings: {
        liquidSteem: null,
        liquidSbd: null,
        savingsSteem: null,
        savingsSbd: null,
        lockedSteem: null,
        lockedSbd: null,
        openOrders: null,
        ownSp: null,
        delegatedOutSp: null,
      },
      midSbdPerSteem: null,
      orders: [],
      mispricedOrders: [],
      flow: null,
      transfers: null,
      verdict: { he: "כשל-בניית-האמת מהשרשרת — לא ממציאים", making: "unknown" },
      lastError: err instanceof Error ? err.message : String(err),
    };
    return { audit: failed, building: true };
  }
}
