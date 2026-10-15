/**
 * capital-types.ts — טיפוסי-מנוע-ההון (חוק-books-types: איסור-מוחלט לייבא טיפוסים
 * מקבצי-route או מ-truth.ts ללקוח — node:fs נמשך לדפדפן → 500 קולקטיבי).
 * כל-מה שהלקוח (CapitalView) צריך — כאן בלבד.
 */

export interface CapitalMarks {
  steemUsd: number | null;
  sbdUsd: number | null;
  source: string;
  at: string | null;
}

export interface BookRow {
  price: number;
  steem: number;
  sbd: number;
}

export interface CapitalMarket {
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  spreadPct: number | null;
  bidDepthSbd: number | null;
  askDepthSbd: number | null;
  totalDepthSbd: number | null;
  totalDepthUsd: number | null;
  topBids: BookRow[];
  topAsks: BookRow[];
}

export interface CapitalChain {
  headBlock: number | null;
  headTime: string | null;
  sbdInterestRaw: number | null;
  sbdInterestAprPct: number | null;
  totalVestingFundSteem: number | null;
  virtualSupplySteem: number | null;
}

export interface CapitalReward {
  rewardBalanceSteem: number | null;
  recentClaims: string | null;
  curatorAprEstPct: number | null;
  formulaHe: string;
}

export interface CapitalFeed {
  sbdPerSteem: number | null;
}

export interface LedgerLine {
  asset: string;
  amount: number | null;
  markUsd: number | null;
  usd: number | null;
  source: string;
}

export interface LedgerTruth {
  realUsd: number | null;
  realLines: LedgerLine[];
  marksAt: string | null;
  simBookUsds: number | null;
  simLabel: string;
  doctrineHe: string | null;
  residueNoteHe: string;
  gridArmed: boolean | null;
  gridAt: string | null;
}

export type StrategyId =
  | "HOLD"
  | "CONVERT"
  | "GRID"
  | "FLEET"
  | "MM-INTERNAL"
  | "SP-DELEGATE"
  | "SBD-INTEREST";

export type StrategyStatus = "ACTIVE" | "READY" | "NEEDS-APPROVAL" | "DORMANT" | "REJECTED";

export interface StrategyRow {
  id: StrategyId;
  nameHe: string;
  rank: number;
  aprPct: number | null;
  aprBasis: string;
  status: StrategyStatus;
  liquidity: "FULL" | "HIGH" | "MEDIUM" | "LOCKED-7D" | "NONE";
  risk: "LOW" | "MEDIUM" | "HIGH";
  capitalFitUsd: number | null;
  evidence: string;
}

/* ההגשה-הריבונית-בפועל — הזרם-הקנוני (SAOS-SOVEREIGN-CHANNEL/1) */
export interface SovereignFiling {
  reqId: string;
  streamUrl: string;
  filedAt: string;
  registryRef: string;
}

export interface MmPlan {
  approved: false;
  statusLine: string;
  approvalPathHe: string;
  filing: SovereignFiling;
  inputs: {
    spreadPct: number | null;
    totalDepthUsd: number | null;
    realMoneyUsd: number | null;
  };
  params: {
    quoteBudgetUsd: number | null;
    maxOrderUsd: number | null;
    quoteAtSpreadPct: number | null;
    staleQuoteMs: number;
    priceMovePullPct: number;
    inventorySkewPct: number;
    dailyLossCapPct: number;
    killSwitchTrips: number;
  };
  paramsBasisHe: string;
  guardrailsHe: string[];
}

export interface SpMatrixCell {
  cadence: string;
  cadenceHe: string;
  per1000SpAnnualUsd: number | null;
  note: string;
}

export interface SpMatrixRow {
  sharePct: number;
  workingSp: number;
  liquidityRetainedPct: number;
  recallDays: number;
  cells: SpMatrixCell[];
}

export interface SpMatrix {
  approved: false;
  statusLine: string;
  approvalPathHe: string;
  filing: SovereignFiling;
  aprPct: number | null;
  aprBasisHe: string;
  spHeldKnown: boolean;
  rows: SpMatrixRow[];
}

export interface CapitalPayload {
  ok: boolean;
  note?: string;
  measuredAt: string;
  marks: CapitalMarks | null;
  market: CapitalMarket | null;
  chain: CapitalChain | null;
  reward: CapitalReward | null;
  feed: CapitalFeed | null;
  ledger: LedgerTruth;
  strategies: StrategyRow[];
  mmPlan: MmPlan;
  spMatrix: SpMatrix;
  meta: { ms: number; rpc: string; errors: string[] };
}
