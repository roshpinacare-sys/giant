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
  /** T70 · מסלול-הזרימה — התקדמות-הגובה-בין-מדידות-אמיתיות-שנשמרו (אפס-זריעה-ידנית) */
  trajectory: FlowTrajectory;
  errors: string[];
  sha16: string;
}

/** T70 · רשומה-אחת-בפנקס — מדידה-אמיתית-שנעשתה-בפועל */
export interface FlowTrajectoryEntry {
  measuredAt: string; // זמן-המדידה-עצמה
  height: number; // גובה-השרשרת-כפי-שנמדד
  savedAt: string | null; // חתימת-הסנאפשוט (זהות-הסנאפשוט לדדופ)
}

/** T70 · מסלול-הזרימה — הפרש-אמיתי בין-שתי-מדידות-אמיתיות */
export interface FlowTrajectory {
  entries: number; // כמה-מדידות-חיות-נשמרו
  first: FlowTrajectoryEntry | null;
  last: FlowTrajectoryEntry | null;
  deltaHeight: number | null; // null = פחות-משתי-רשומות — כנה
  deltaMinutes: number | null;
  /** T71 · הקצה-האחרון-של-הפנקס (עד-24 מדידות, סדר-כרונולוגי) — ספארקליין-המסלול ניזון-מזה; אפס-זריעה */
  recent?: FlowTrajectoryEntry[];
}
