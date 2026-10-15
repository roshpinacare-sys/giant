/**
 * T69 · טיפוסי-הזרימה — נתלשו מ-gate-types כדי-שהמשטחים-הכלכליים
 * (DexView · WalletView · SovereigntyView) יחלקו-את-אותה-אמת בדיוק.
 * gate-types עצמו מייבא-מכאן (מקור-אחד, אפס-שכפול).
 */
export interface EngineFlowBeat {
  workflow: string; // dex-beat.yml
  event: string; // schedule | workflow_dispatch
  conclusion: string; // הריצה-האחרונה בפועל
  lastSuccessAt: string | null; // ISO של-ריצת-ההצלחה-האחרונה
}

export interface EngineFlow {
  repo: string; // roshpinacare-sys/Domain
  measuredAt: string;
  beats: EngineFlowBeat[];
}

/** T69 · מטען-הנקודה /api/giant/flow — דופק-הזרימה-בלבד, קליל-לדפדוף-חי */
export interface FlowPayload {
  ok: boolean;
  flow: EngineFlow | null;
  errors: string[];
  sha16: string;
}
