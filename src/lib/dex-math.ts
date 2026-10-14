// giant DEX · מתמטיקת-AMM טהורה (x·y=k, עמלה-0.3%) — משותפת לבק ולפרונט
// ההכוונה: BUY = משלמים quote (USDS) ומקבלים base; SELL = משלמים base ומקבלים quote.

export interface AmmReserves {
  base: number;
  quote: number;
}

export interface AmmResult {
  outAmount: number;
  effectivePrice: number; // out/in
  priceImpactPct: number;
  reservesAfter: AmmReserves;
}

/** פגיעת-מחיר לפי x·y=k עם עמלה: dx הוא הקלט-אחרי-עמלה. */
export function ammQuote(
  reserves: AmmReserves,
  side: "BUY" | "SELL",
  amountIn: number,
  feeBps: number,
): AmmResult {
  if (amountIn <= 0 || reserves.base <= 0 || reserves.quote <= 0) {
    return {
      outAmount: 0,
      effectivePrice: 0,
      priceImpactPct: 0,
      reservesAfter: { ...reserves },
    };
  }
  const fee = feeBps / 10_000;
  const dx = amountIn * (1 - fee);

  let out: number;
  let spotBefore: number;
  let spotAfter: number;

  if (side === "BUY") {
    // quote in → base out. spot = quote/base
    spotBefore = reserves.quote / reserves.base;
    out = reserves.base - (reserves.base * reserves.quote) / (reserves.quote + dx);
    const quoteAfter = reserves.quote + dx;
    const baseAfter = reserves.base - out;
    spotAfter = baseAfter > 0 ? quoteAfter / baseAfter : spotBefore;
  } else {
    // base in → quote out. spot = quote/base
    spotBefore = reserves.quote / reserves.base;
    out = reserves.quote - (reserves.quote * reserves.base) / (reserves.base + dx);
    const baseAfter = reserves.base + dx;
    const quoteAfter = reserves.quote - out;
    spotAfter = baseAfter > 0 ? quoteAfter / baseAfter : spotBefore;
  }

  // מחיר-אפקטיבי תמיד ביחידות: quote-לכל-base (כמו מחיר-הספוט)
  const effectivePrice =
    amountIn > 0 ? (side === "BUY" ? amountIn / out : out / amountIn) : 0;
  const priceImpactPct =
    spotBefore > 0 ? ((spotAfter - spotBefore) / spotBefore) * 100 : 0;

  const reservesAfter: AmmReserves =
    side === "BUY"
      ? { base: reserves.base - out, quote: reserves.quote + dx }
      : { base: reserves.base + dx, quote: reserves.quote - out };

  return { outAmount: out, effectivePrice, priceImpactPct, reservesAfter };
}

/** נתח-ה-LP הצפוי בהוספת-נזילות ביחס-הנוכחי. */
export function lpQuote(
  reserves: AmmReserves,
  existingShares: number,
  quoteAmount: number,
): { baseAmount: number; shares: number; poolSharePct: number } {
  const price = reserves.quote / reserves.base;
  const baseAmount = price > 0 ? quoteAmount / price : 0;
  const k = reserves.base * reserves.quote;
  const kAfter = (reserves.base + baseAmount) * (reserves.quote + quoteAmount);
  const shares =
    existingShares > 0 && k > 0
      ? existingShares * (Math.sqrt(kAfter / k) - 1)
      : Math.sqrt(baseAmount * quoteAmount);
  const poolSharePct =
    kAfter > 0 ? (1 - Math.sqrt(k / kAfter)) * 100 : 0;
  return { baseAmount, shares, poolSharePct };
}

/** APR שנתי מעמלות-7 ימים מול-TVl. */
export function poolAprPct(fees7d: number, tvl: number): number {
  if (tvl <= 0) return 0;
  return ((fees7d / 7) * 365 * 100) / tvl;
}
