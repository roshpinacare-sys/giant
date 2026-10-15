/**
 * GET /api/giant/flow — דופק-הזרימה (T69): הוכחת-החיים-של-מנועי-הכסף,
 * כנקודה-קלילה-משלה כדי-שכל-המשטחים-הכלכליים ינשמו-את-אותו-דופק.
 *
 * T70 · מסלול-הזרימה: כל-ניפוח גם-מודד את-גובה-השרשרת (מאותו-מקור-אמת של
 * /api/giant/dex — loadDex) ורושם-אותו-בפנקס-המדידות (db/flow-ledger.json);
 * התשובה מכילה את-ההתקדמות-האמיתית-בין-שתי-המדידות-הראשונה-והאחרונה.
 * אפס-זריעה-ידנית — הפנקס-נכתב-רק-מהמדידות-החיות-עצמן.
 *
 * המכונה-האמיתית = התאום-הציבורי ב-Domain (R71). המדידה-חיה מה-API
 * · כישלון = כנה (flow=null + errors[]) · אפס-סודות · sha16 על-המטען.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { measureFlow } from "@/lib/giant/flow";
import { recordMeasurement, readTrajectory } from "@/lib/giant/flow-ledger";
import type { FlowPayload } from "@/lib/giant/flow-types";
import { loadDex } from "@/app/api/giant/dex/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; payload: FlowPayload } | null = null;
const CACHE_MS = 15_000; // קייש-תצוגה-קצר-בלבד; המדידות-עצמן מקושרות-לקייש-המודולים

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, { headers: { "x-flow-sha16": cache.payload.sha16 } });
  }
  const errors: string[] = [];
  const flow = await measureFlow(errors);

  /* T70 · מדידת-גובה-מאותו-מקור-אמת + רישום-בפנקס (כנה; דדופ/חנק = תקין, כישלון-כתיבה בלבד = שגיאה) */
  try {
    const dex = await loadDex();
    if (dex.ok && typeof dex.height === "number" && dex.height > 0) {
      const res = await recordMeasurement(dex.height, dex.savedAt, new Date().toISOString());
      if (res === "failed") errors.push("רישום-המדידה-בפנקס נכשל — כנה");
    } else {
      errors.push("מדידת-הגובה-למסלול לא-הצליחה-כרגע — כנה");
    }
  } catch (e) {
    errors.push(`מסלול-הזרימה נכשל: ${String(e).slice(0, 90)}`);
  }
  const trajectory = await readTrajectory();

  const payload: FlowPayload = { ok: true, flow, trajectory, errors, sha16: "" };
  payload.sha16 = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store", "x-flow-sha16": payload.sha16 },
  });
}
