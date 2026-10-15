// giant DEX · עזרי-שרת משותפים ל-API
import { db } from "@/lib/db";
import type {
  PairSummary,
  PoolRow,
  WalletState,
  WalletBalance,
  WalletPosition,
  SwapQuote,
  TradeSide,
} from "@/lib/dex-types";
import { ammQuote, poolAprPct } from "@/lib/dex-math";

type DexPairRow = Awaited<ReturnType<typeof db.dexPair.findFirst>>;

export function toPairSummary(p: NonNullable<DexPairRow>): PairSummary {
  const change24h =
    p.openPrice24h > 0 ? ((p.price - p.openPrice24h) / p.openPrice24h) * 100 : 0;
  return {
    id: p.id,
    base: p.base,
    quote: p.quote,
    chain: p.chain,
    price: p.price,
    change24h,
    high24h: p.high24h,
    low24h: p.low24h,
    vol24h: p.vol24h,
    vol7d: p.vol7d,
    liquidity: p.reserveBase * p.price + p.reserveQuote,
    featured: p.featured,
    isNative: p.isNative,
  };
}

export async function pairPrices(): Promise<Map<string, number>> {
  const pairs = await db.dexPair.findMany();
  const map = new Map<string, number>([["USDS", 1]]);
  for (const p of pairs) map.set(p.base, p.price);
  return map;
}

export async function getWalletState(): Promise<WalletState> {
  const grouped = await db.dexLedger.groupBy({
    by: ["token"],
    _sum: { amount: true },
    where: { account: "OWNER" },
  });
  const chains: Record<string, string> = {
    USDS: "Giant Chain",
    SAOS: "Giant Chain",
    BTC: "Ethereum",
    ETH: "Ethereum",
    SOL: "Solana",
    BNB: "BNB Chain",
  };
  // סקטורים (M-11) — כלי-הון-ילידים של Giant Chain
  const chainFor = (token: string): string =>
    chains[token] ?? "Giant Chain";
  const prices = await pairPrices();
  const balances: WalletBalance[] = grouped
    .filter((g) => (g._sum.amount ?? 0) > 1e-9)
    .map((g) => {
      const amount = g._sum.amount ?? 0;
      const priceUsd = prices.get(g.token) ?? 0;
      return {
        token: g.token,
        chain: chainFor(g.token),
        amount,
        priceUsd,
        valueUsd: amount * priceUsd,
      };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const positionsRaw = await db.dexLpPosition.findMany({
    where: { owner: "OWNER" },
  });
  const posPairs = await db.dexPair.findMany({
    where: { id: { in: positionsRaw.map((p) => p.pairId) } },
  });
  const pairById = new Map(posPairs.map((p) => [p.id, p]));
  const positions: WalletPosition[] = positionsRaw.flatMap((pos) => {
    const pair = pairById.get(pos.pairId);
    if (!pair) return [];
    return [{
      pairId: pos.pairId,
      base: pair.base,
      quote: pair.quote,
      shares: pos.shares,
      baseAmount: pos.baseAmount,
      quoteAmount: pos.quoteAmount,
      valueUsd: pos.baseAmount * pair.price + pos.quoteAmount,
    }];
  });

  const ledger = await db.dexLedger.findMany({
    where: { account: "OWNER" },
    orderBy: { t: "desc" },
    take: 30,
  });

  return {
    balances,
    positions,
    ledger: ledger.map((l) => ({
      id: l.id,
      token: l.token,
      amount: l.amount,
      reason: l.reason,
      t: l.t.toISOString(),
    })),
    totalUsd:
      balances.reduce((s, b) => s + b.valueUsd, 0) +
      positions.reduce((s, p) => s + p.valueUsd, 0),
  };
}

export async function ownerBalance(token: string): Promise<number> {
  const agg = await db.dexLedger.aggregate({
    _sum: { amount: true },
    where: { account: "OWNER", token },
  });
  return agg._sum.amount ?? 0;
}

export async function buildQuote(
  pairId: string,
  side: TradeSide,
  amountIn: number,
  slippagePct: number,
): Promise<{ quote: SwapQuote } | { error: string; status: number }> {
  if (!Number.isFinite(amountIn) || amountIn <= 0) {
    return { error: "סכום-הקלט חייב להיות חיובי", status: 400 };
  }
  const pair = await db.dexPair.findUnique({ where: { id: pairId } });
  if (!pair) return { error: "זוג-לא-נמצא", status: 404 };

  const res = ammQuote(
    { base: pair.reserveBase, quote: pair.reserveQuote },
    side,
    amountIn,
    pair.feeBps,
  );
  const quote: SwapQuote = {
    pairId: pair.id,
    side,
    amountIn,
    outAmount: res.outAmount,
    minOut: res.outAmount * (1 - slippagePct / 100),
    price: pair.price,
    effectivePrice: res.effectivePrice,
    priceImpactPct: res.priceImpactPct,
    feePct: pair.feeBps / 100,
    slippagePct,
    route: side === "BUY" ? ["USDS", pair.base] : [pair.base, "USDS"],
    reservesAfter: res.reservesAfter,
  };
  return { quote };
}

export async function getPoolRows(): Promise<PoolRow[]> {
  const pairs = await db.dexPair.findMany({ orderBy: { sort: "asc" } });
  const mine = await db.dexLpPosition.findMany({ where: { owner: "OWNER" } });
  const mineByPair = new Map<string, { shares: number; base: number; quote: number }>();
  for (const m of mine) {
    const cur = mineByPair.get(m.pairId) ?? { shares: 0, base: 0, quote: 0 };
    cur.shares += m.shares;
    cur.base += m.baseAmount;
    cur.quote += m.quoteAmount;
    mineByPair.set(m.pairId, cur);
  }
  return pairs.map((p) => {
    const tvl = p.reserveBase * p.price + p.reserveQuote;
    const fees7d = p.vol7d * (p.feeBps / 10_000);
    const my = mineByPair.get(p.id) ?? { shares: 0, base: 0, quote: 0 };
    return {
      pairId: p.id,
      base: p.base,
      quote: p.quote,
      chain: p.chain,
      price: p.price,
      tvl,
      aprPct: poolAprPct(fees7d, tvl),
      fees24h: p.vol24h * (p.feeBps / 10_000),
      fees7d,
      vol24h: p.vol24h,
      reserveBase: p.reserveBase,
      reserveQuote: p.reserveQuote,
      myShares: my.shares,
      myBase: my.base,
      myQuote: my.quote,
    };
  });
}

/* ==================== מנוע-ביצוע-משותף (OWNER + FLEET) ==================== */
// כל-הסחר במערכת עובר-כאן — בורסה-אחת, חוק-אמת-אחד:
// רזרבות → מחיר → עסקה (עם-מקור) → לדג'ר (חובה/זיכוי) → נפח-24h.

export async function accountBalance(account: string, token: string): Promise<number> {
  const agg = await db.dexLedger.aggregate({
    _sum: { amount: true },
    where: { account, token },
  });
  return agg._sum.amount ?? 0;
}

export interface ExecuteSwapArgs {
  pairId: string;
  side: TradeSide;
  amountIn: number;
  slippagePct: number;
  source: "USER" | "FLEET" | "API";
  account: string; // OWNER או FLEET:<agentId>
  agentId?: string;
}

export async function executeSwap(
  args: ExecuteSwapArgs,
): Promise<{ trade: { id: string; side: string; price: number; amount: number; total: number; source: string; t: string }; quote: SwapQuote; newPrice: number } | { error: string; status: number }> {
  const pair = await db.dexPair.findUnique({ where: { id: args.pairId } });
  if (!pair) return { error: "זוג-לא-נמצא", status: 404 };
  // חוק-אמת: מסחר-פתוח רק על המטבע-האמיתי; עזרים הם מדדי-Binance
  if (!pair.isNative) {
    return { error: `${pair.base} הוא מדד-מחיר-חוץ (Binance) — מסחר פתוח רק ב-SAOS/USDS`, status: 403 };
  }
  const tokenIn = args.side === "BUY" ? pair.quote : pair.base;
  const tokenOut = args.side === "BUY" ? pair.base : pair.quote;

  const bal = await accountBalance(args.account, tokenIn);
  if (bal < args.amountIn) {
    return { error: `אין-מספיק ${tokenIn} בחשבון (יש ${bal.toLocaleString("he-IL", { maximumFractionDigits: 2 })})`, status: 400 };
  }

  const q = await buildQuote(pair.id, args.side, args.amountIn, args.slippagePct);
  if ("error" in q) return q;
  const quote = q.quote;

  const updated = await db.dexPair.update({
    where: { id: pair.id },
    data: {
      reserveBase: quote.reservesAfter.base,
      reserveQuote: quote.reservesAfter.quote,
      price: quote.reservesAfter.quote / quote.reservesAfter.base,
      high24h: Math.max(pair.high24h, quote.reservesAfter.quote / quote.reservesAfter.base),
      low24h: Math.min(pair.low24h, quote.reservesAfter.quote / quote.reservesAfter.base),
    },
  });
  const trade = await db.dexTrade.create({
    data: {
      pairId: pair.id,
      side: args.side,
      price: quote.effectivePrice,
      amount: args.side === "BUY" ? quote.outAmount : args.amountIn,
      total: args.side === "BUY" ? args.amountIn : quote.outAmount,
      source: args.source,
      sourceAgent: args.source === "FLEET" ? (args.agentId ?? null) : null,
    },
  });
  const reasonPrefix = args.source === "FLEET" ? `צי · ${args.agentId} · ` : "";
  await db.dexLedger.create({
    data: { account: args.account, token: tokenIn, amount: -args.amountIn, reason: `${reasonPrefix}החלפה · ${args.side === "BUY" ? "קניית" : "מכירת"} ${tokenOut}`, ref: trade.id },
  });
  await db.dexLedger.create({
    data: { account: args.account, token: tokenOut, amount: quote.outAmount, reason: `${reasonPrefix}החלפה · קבלת ${tokenOut}`, ref: trade.id },
  });
  await db.dexPair.update({
    where: { id: pair.id },
    data: { vol24h: { increment: args.amountIn } },
  });

  return {
    trade: {
      id: trade.id,
      side: trade.side,
      price: trade.price,
      amount: trade.amount,
      total: trade.total,
      source: trade.source,
      t: trade.t.toISOString(),
    },
    quote,
    newPrice: updated.price,
  };
}
