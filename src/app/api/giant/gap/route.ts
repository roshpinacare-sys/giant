/**
 * GET /api/giant/gap — מפת-הפער מול הענקים (T73 · fail-honest)
 *
 * מקורות:
 *  · הדאטה-הכנה (עובדות-ענקים-ציבוריות + פסקי-דין על טענות) — gap-data.ts (נמדד-רשת 2026-10-15)
 *  · מדידות-חי מהמכונה: measureFlow (beats) + readTrajectory (שרשרת) + loadTruth (אמת)
 *  · מדידת-קוד-חיה: ספירת-נתיבי-API ובדיקת-הימצאות-אימות — ישירות-מעץ-הקבצים (לא-מסיפור)
 * כשל-כל-מדידה = שדה-null וכנות-ב-errors[]. cache-זיכרון 60 שניות.
 */
import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { measureFlow } from "@/lib/giant/flow";
import { readTrajectory } from "@/lib/giant/flow-ledger";
import { loadTruth } from "@/lib/giant/truth";
import {
  AGENT_CLAIMS, GAP_DIMENSIONS, GAP_VERDICT, GIANT_PRODUCTS,
  GIANTS_SEARCHED_AT, ROADMAP,
} from "@/lib/giant/gap-data";
import { measureComputeWall, type ComputeWallState } from "@/lib/compute-wall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
let cache: { at: number; payload: GapPayload } | null = null;

export interface CodeMeasurement {
  apiRouteGroups: number;
  giantRoutes: number;
  authRouteExists: boolean;
  middlewareExists: boolean;
  uiModules: number;
}

export interface GapPayload {
  ok: boolean;
  errors: string[];
  measuredAt: string;
  giantsSearchedAt: string;
  giantProducts: typeof GIANT_PRODUCTS;
  dimensions: typeof GAP_DIMENSIONS;
  agentClaims: typeof AGENT_CLAIMS;
  roadmap: typeof ROADMAP;
  verdict: typeof GAP_VERDICT;
  live: {
    trajectory: { entries: number; deltaHeight: number | null; lastHeight: number | null } | null;
    beats: { workflow: string; conclusion: string | null; lastSuccessAt: string | null }[];
    truthVerdict: string | null;
    externalBidExists: boolean | null;
    internalPriceUsdsMu: number | null;
    code: CodeMeasurement | null;
    computeWall: ComputeWallState | null;
  };
}

async function measureCode(errors: string[]): Promise<CodeMeasurement | null> {
  try {
    const apiDir = join(process.cwd(), "src", "app", "api");
    const groups = await readdir(apiDir, { withFileTypes: true });
    const dirs = groups.filter((d) => d.isDirectory()).map((d) => d.name);
    const giantDir = join(apiDir, "giant");
    let giantRoutes = 0;
    try {
      giantRoutes = (await readdir(giantDir, { withFileTypes: true })).filter((d) => d.isDirectory()).length;
    } catch { /* giant אינו-קיים = 0 */ }
    const authRouteExists = dirs.some((d) => d.toLowerCase().includes("auth"));
    let middlewareExists = false;
    try {
      await readdir(join(process.cwd(), "src", "middleware.ts"));
      middlewareExists = true;
    } catch { /* אין-middleware — מדידה-כנה */ }
    const giantUiDir = join(process.cwd(), "src", "components", "giant");
    let uiModules = 0;
    try {
      uiModules = (await readdir(giantUiDir)).filter((f) => f.endsWith("View.tsx")).length;
    } catch { /* 0 */ }
    return {
      apiRouteGroups: dirs.length,
      giantRoutes,
      authRouteExists,
      middlewareExists,
      uiModules,
    };
  } catch (e) {
    errors.push(`code-measure: ${e instanceof Error ? e.message : "שגיאה"}`);
    return null;
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload);
  }
  const errors: string[] = [];

  const [flow, trajectory] = await Promise.all([
    measureFlow(errors),
    readTrajectory().catch((e) => { errors.push(`trajectory: ${e instanceof Error ? e.message : "שגיאה"}`); return null; }),
  ]);
  const code = await measureCode(errors);

  let truthVerdict: string | null = null;
  let externalBidExists: boolean | null = null;
  let internalPriceUsdsMu: number | null = null;
  try {
    const t = loadTruth();
    truthVerdict = t.ok ? "ALL-GREEN" : null; /* ה-verdict המדויק מגיע-מ-attestation; כאן-רק-קיום */
    externalBidExists = t.externalBid?.exists ?? null;
    internalPriceUsdsMu = t.externalBid?.internalPriceUsdsMu ?? null;
  } catch (e) {
    errors.push(`truth: ${e instanceof Error ? e.message : "שגיאה"}`);
  }
  /* ה-verdict המדויק — מ-attestation-השער הקנוני אם-הוא-קיים */
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile("/home/z/estate/Domain/Pulse/giant/attestation.json", "utf8");
    const a = JSON.parse(raw) as { verdict?: string };
    if (typeof a.verdict === "string") truthVerdict = a.verdict;
  } catch { /* כנה — נשאר הערך-הגס */ }

  /* T75-c: מודעות-חומת-המחשוב — ההסבר-הכנה למיילי-canary (בדיקה-מתוזמנת, לא-תקלה) */
  const computeWall = await measureComputeWall(6000).catch((e) => {
    errors.push(`computeWall: ${e instanceof Error ? e.message : "שגיאה"}`);
    return null;
  });

  const payload: GapPayload = {
    ok: errors.length === 0,
    errors,
    measuredAt: new Date().toISOString(),
    giantsSearchedAt: GIANTS_SEARCHED_AT,
    giantProducts: GIANT_PRODUCTS,
    dimensions: GAP_DIMENSIONS,
    agentClaims: AGENT_CLAIMS,
    roadmap: ROADMAP,
    verdict: GAP_VERDICT,
    live: {
      trajectory: trajectory
        ? {
            entries: trajectory.entries,
            deltaHeight: trajectory.deltaHeight,
            lastHeight: trajectory.last?.height ?? null,
          }
        : null,
      beats: (flow?.beats ?? []).map((b) => ({
        workflow: b.workflow,
        conclusion: b.conclusion,
        lastSuccessAt: b.lastSuccessAt,
      })),
      truthVerdict,
      externalBidExists,
      internalPriceUsdsMu,
      code,
      computeWall,
    },
  };

  cache = { at: Date.now(), payload };
  return NextResponse.json(payload);
}
