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

export type StrategyStatus = "ACTIVE" | "READY" | "NEEDS-APPROVAL" | "DORMANT" | "REJECTED" | "REPAIRING";

/* ═══ מנדט-עמידה של הבעלים (הוראה-חיה · רשומה-במנוע) ═══
 * מקור: הודעת-הבעלים "אני רוצה כן לקדם תנועות הון כאשר אנחנו מוכנים... לא לחסום כל הזמן...
 * לבדוק למה לא מסתדר ולסדר במקום לסגור" (trace 1a1400a00fd8d4f1 · 2026-10-15).
 * האפקט: אסטרטגיה-כושלת = אבחון+תיקון (לא-דחייה); תנועת-הון נדחפת כשכל-השערים-הירוקים. */
export interface StandingMandate {
  id: string;
  registeredAt: string;
  sourceTrace: string;
  directiveHe: string;
  effectHe: string;
  doctrineHe: string;
}

/* ═══ אמת-החשבון הריבוני — headcorner נמדד-חי מהשרשרת ═══
 * התיקון-הגדול: הספר-הישן ספר-רק-יתרות-חופשיות (balance) והתעלם מהכסף-התחום-בהזמנות
 * (for_sale) — המלאי-האמיתי = חופשי + תחום. נמדד-חי, אפס-הנחות. */
export interface SovereignHoldings {
  steemFree: number;
  steemLocked: number;
  steemTotal: number;
  sbdFree: number;
  sbdLocked: number;
  sbdTotal: number;
}

export interface SovereignSp {
  ownSp: number;
  delegatedOutSp: number;
  receivedInSp: number;
  netWorkingSp: number;
}

export interface MmOrderRow {
  orderId: number;
  side: "SELL-SBD" | "SELL-STEEM";
  amountSbd: number | null;
  amountSteem: number | null;
  priceSbdPerSteem: number;
  createdAt: string;
}

export interface MmOps {
  windowFrom: string | null;
  windowTo: string | null;
  orderCreates: number;
  cancels: number;
  fills: number;
  sellsSteem: number;
  sbdReceived: number;
  buysInWindow: number;
  sellVwapSbdPerSteem: number | null;
  votes: number;
  curationOps: number;
  curationSpEarned: number;
}

export interface SovereignAccount {
  account: string;
  measuredAt: string;
  onChain: boolean;
  holdings: SovereignHoldings;
  treasuryUsdMarked: number | null;
  treasuryBasisHe: string;
  sp: SovereignSp;
  openOrders: MmOrderRow[];
  ops: MmOps;
  evidenceHe: string;
}

/* ═══ שערי-מוכנות — תנועת-הון נדחפת רק-כשהכל-ירוק (מדוד-חי, אפס-שיקול-דעת) ═══ */
export interface ReadinessGate {
  gate: string;
  he: string;
  state: "GREEN" | "RED" | "AMBER";
  measured: string;
  flipHe: string;
}

export interface MovementReadiness {
  movementId: StrategyId;
  nameHe: string;
  verdict: "ADVANCE" | "ADVANCE-ABLE" | "REPAIR-FIRST";
  verdictHe: string;
  gates: ReadinessGate[];
}

/* ═══ לולאת-התיקון — אסטרטגיה-כושלת = אבחון+תיקון, לא-סגירה ═══ */
export interface RepairRow {
  strategyId: StrategyId;
  nameHe: string;
  diagnosisHe: string;
  measuredEvidence: string;
  repairsHe: string[];
  repairState: "FIXED-LIVE" | "AUTO-FLIP-ARMED" | "IN-FLIGHT" | "MEASURED-ROUTED" | "AWAITING-OWNER";
  repairStateHe: string;
}

export interface StrategyRow {
  id: StrategyId;
  nameHe: string;
  rank: number;
  aprPct: number | null;
  aprBasis: string;
  status: StrategyStatus;
  liquidity: "FULL" | "HIGH" | "MEDIUM" | "LOCKED-7D" | "NONE" | "LOW";
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
  realizedCurationAprPct: number | null;
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
  sovereign: SovereignAccount | null;
  mandate: StandingMandate;
  readiness: MovementReadiness[];
  repairs: RepairRow[];
  strategies: StrategyRow[];
  mmPlan: MmPlan;
  spMatrix: SpMatrix;
  meta: { ms: number; rpc: string; errors: string[] };
}
