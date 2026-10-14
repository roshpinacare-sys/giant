// giant DEX · חוזה-הנתונים המוקפא (v1.1) — הבק והפרונט נבנים מולו
// יחידות: כל נפחים/נזילויות ב-µ-USDS (מיקרו-יוסד"ש), מחירים ב-USDS ליחידת-בסיס.

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type TradeSide = "BUY" | "SELL"; // BUY = קניית הבסיס ב-USDS

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/* ------------------------------ מודלים ------------------------------ */

export interface PairSummary {
  id: string;
  base: string;
  quote: string;
  chain: string;
  price: number;
  change24h: number; // אחוז, למשל +2.41
  high24h: number;
  low24h: number;
  vol24h: number; // µ-USDS
  vol7d: number;
  liquidity: number; // TVL µ-USDS
  featured: boolean;
  isNative: boolean;
}

export interface Candle {
  t: number; // epoch seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // מנפח-התקופה, µ-USDS
}

export interface TradeRow {
  id: string;
  side: TradeSide;
  price: number;
  amount: number;
  total: number;
  source: string;
  t: string; // ISO
}

export interface DepthLevel {
  price: number;
  amount: number;
  total: number;
}

export interface Depth {
  pairId: string;
  mid: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface SwapQuote {
  pairId: string;
  side: TradeSide;
  amountIn: number;
  outAmount: number;
  minOut: number;
  price: number; // מחיר-אמצע לפני-פגיעה
  effectivePrice: number;
  priceImpactPct: number;
  feePct: number; // למשל 0.3
  slippagePct: number;
  route: string[]; // למשל ["USDS", "GNT"]
  reservesAfter: { base: number; quote: number };
}

export interface PoolRow {
  pairId: string;
  base: string;
  quote: string;
  chain: string;
  price: number;
  tvl: number;
  aprPct: number;
  fees24h: number;
  fees7d: number;
  vol24h: number;
  reserveBase: number;
  reserveQuote: number;
  myShares: number;
  myBase: number;
  myQuote: number;
}

export interface WalletBalance {
  token: string;
  chain: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
}

export interface WalletPosition {
  pairId: string;
  base: string;
  quote: string;
  shares: number;
  baseAmount: number;
  quoteAmount: number;
  valueUsd: number;
}

export interface LedgerEntry {
  id: string;
  token: string;
  amount: number;
  reason: string;
  t: string;
}

export interface WalletState {
  balances: WalletBalance[];
  positions: WalletPosition[];
  ledger: LedgerEntry[];
  totalUsd: number;
}

/* ------------------------------ סקירה ------------------------------ */

export interface MarketKpis {
  tvl: number;
  vol24h: number;
  vol7d: number;
  vol30d: number;
  fees24h: number;
  pairsCount: number;
  gntPrice: number;
  gntChange24h: number;
}

export interface Mover {
  pairId: string;
  base: string;
  price: number;
  change24h: number;
}

export interface SparkPoint {
  t: number;
  v: number;
}

export interface ArenaDay {
  day: string; // YYYY-MM-DD
  vol: number;
}

export interface Arena {
  days: ArenaDay[]; // 14 ימים אחרונים, ישן→חדש
  current24h: number;
  target7d: number; // יעד-יומי לשבוע (M-9)
  target30d: number; // יעד-יומי לחודש (M-9)
  goal7dPct: number;
  goal30dPct: number;
  bestDayVol: number;
}

export interface EngineStatus {
  running: boolean;
  ticks: number;
  lastTickAt: string | null;
  seededAt: string | null;
}

export interface Overview {
  kpis: MarketKpis;
  moversUp: Mover[];
  moversDown: Mover[];
  sparks: Record<string, SparkPoint[]>; // מפתח: "GNT/USDS" וכו'
  arena: Arena;
  engine: EngineStatus;
  topPairs: PairSummary[]; // 8 לפי vol24h
}

/* ------------------------------ תשובות-API ------------------------------ */

export type OverviewResponse = Overview;
export type PairsResponse = {
  pairs: PairSummary[];
};
export type CandlesResponse = {
  candles: Candle[];
  tf: Timeframe;
};
export type TradesResponse = {
  trades: TradeRow[];
};
export type DepthResponse = Depth;
export type QuoteResponse = {
  quote: SwapQuote;
};
export type SwapResponse = {
  trade: TradeRow;
  quote: SwapQuote;
};
export type PoolsResponse = {
  pools: PoolRow[];
};
export type WalletResponse = WalletState;
