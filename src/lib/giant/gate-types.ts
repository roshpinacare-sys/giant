/**
 * gate-types — T64: פתיחת-השער · מפתח-המפעיל מאומת.
 *
 * מקורות-אמת:
 *  · db/gate-check.json — קבלת-הזיהוי-המקומית (53 מועמדים מול שרשרת-Steem החיה,
 *    פסק-דין-בלבד: אף ערך-מפתח לא נכתב/נותר/הודפס — דוקטרינת key-verify.mjs + P0-1)
 *    והיא מועשרת בעדות-ה-Actions (ריצת-חימוש מוצלחת + אטימה לכספת saos-dex).
 *  · מדידת-דלת חיה: קובץ ה-workflow וה-verifier נקראים מהעותק-הקנוני
 *    /home/z/estate/Domain בכל-בקשה (השורות-הקובעות נבדקות כטקסט).
 *
 * חוק-חשיפה: התשובה מכילה פסקי-דין, שמות-קבצים, שמות-סודות ועובדות-שרשרת
 * פומביות בלבד — אפס ערכי-מפתח, אפס מפתחות-ציבוריים-נגזרים, אפס מבנה-כספת.
 *
 * T69 · טיפוסי-הזרימה (EngineFlow · EngineFlowBeat) עברו-למקור-האמת-היחיד
 * flow-types.ts — DexView · WalletView ו-gate חולקים-את-אותן-אמת, אפס-שכפול.
 */
import type { EngineFlow, FlowTrajectory } from "@/lib/giant/flow-types";

export type { EngineFlow, EngineFlowBeat } from "@/lib/giant/flow-types";

export interface GateCandidate {
  file: string;
  at: string;
  valueKind?: string;
  rolesTested?: number;
  matches?: string[];
  error?: string;
}

export interface GateRun {
  id: number;
  headSha: string;
  event: string;
  conclusion: string;
  verdict?: string;
  cause?: string;
  detail?: string;
}

export interface GateArmEvidence {
  schema: string;
  measuredAt: string;
  runs: GateRun[];
  commits: { sha: string; fix: string }[];
  vault: { repo: string; secret: string; updatedAt: string; verifiedVia: string };
  gridIgnition: { state: string; note: string };
  law: string;
}

export interface GateCheckReceipt {
  format: string;
  generatedAt: string;
  source: {
    machine: string;
    uploadDir: string;
    candidatesTested: number;
    accountDiscovery: string;
  };
  target: { accounts: string[]; roles: string[]; rpc: string };
  chainAuthoritiesSeen: number;
  matrix: GateCandidate[];
  matchesCount: number;
  matchesByAccountRole: { file: string; at: string; match: string }[];
  verdict: string;
  law: string;
  actions?: GateArmEvidence;
}

/** מדידת-דלת חיה — השורות-הקובעות ב-yml וב-verifier, נקראות בכל-בקשה. */
export interface GateDoor {
  domainPresent: boolean;
  workflowSha: string | null;
  rosterEnvPassed: boolean;
  fleetAccountPassed: boolean;
  secretSource: string | null;
  gridSignerDynamic: boolean;
  receiptSummaryOnly: boolean;
}

/**
 * T66 · החסמים-הכלכליים — מצב-workflows של מנוע-הדקס, נמדד-חי מה-API בכל-בקשה.
 * הוראת-הבעלים: "כל החסמים הכלכליים פתח" — המדידה מראה את המצב-בפועל, אפס-סיפור.
 */
export interface GateBarrierWorkflow {
  path: string; // dex-grid.yml
  name: string; // dex-grid
  state: string; // active | disabled_manually | disabled_inactivity
  economic: boolean; // מנוע-הזרימה-הכלכלית (דקס/גריד/שוק) מול תשתית (ci/guards)
}

export interface GateBarriers {
  measuredAt: string;
  repo: string;
  workflows: GateBarrierWorkflow[];
  active: number;
  total: number;
  economicActive: number;
  economicTotal: number;
  /** T67 · הוכחת-זרימה-חיה — ריצות-מוצלחות-אחרונות של-המכונה (התאום-הציבורי ב-Domain); T69: הטיפוס-חי-ב-flow-types */
  flow: EngineFlow | null;
}

/** T68 · מפקד-הצי — מצב-כל-ה-workflows בכל-המאגרים (חסמים-נותרים בשקיפות-מלאה) */
export interface FleetBlockedWorkflow {
  repo: string;
  workflow: string;
  state: string;
  documented?: string; // הערת-הכרעה-מתועדת (לא-חסם-שוגג)
}

export interface FleetCensus {
  measuredAt: string;
  reposMeasured: number;
  totalWorkflows: number;
  active: number;
  blocked: FleetBlockedWorkflow[];
}

export interface GatePayload {
  ok: boolean;
  receipt: GateCheckReceipt | null;
  receiptAgeMin: number | null;
  door: GateDoor | null;
  gateOpen: boolean;
  barriers: GateBarriers | null;
  census: FleetCensus | null;
  /** T70 · מסלול-הזרימה — התקדמות-הגובה-בין-מדידות-אמיתיות-שהמערכת-רשמה-בעצמה */
  flowTrajectory: FlowTrajectory | null;
  errors: string[];
  sha16: string;
}
