/**
 * GET /api/giant/flow — דופק-הזרימה (T69): הוכחת-החיים-של-מנועי-הכסף,
 * כנקודה-קלילה-משלה כדי-שכל-המשטחים-הכלכליים ינשמו-את-אותו-דופק.
 *
 * המכונה-האמיתית = התאום-הציבורי ב-Domain (R71). המדידה-חיה מה-API
 * (cache-זיכרון 60 שניות בתוך measureFlow) · כישלון = כנה (flow=null +
 * errors[]) · אפס-סודות בתשובה · sha16 על-המטען.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { measureFlow } from "@/lib/giant/flow";
import type { FlowPayload } from "@/lib/giant/flow-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; payload: FlowPayload } | null = null;
const CACHE_MS = 15_000; // קייש-תצוגה-קצר-בלבד; המדידה-עצמה מקושרת-ל-60ש׳ בתוך-המודול

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, { headers: { "x-flow-sha16": cache.payload.sha16 } });
  }
  const errors: string[] = [];
  const flow = await measureFlow(errors);
  const payload: FlowPayload = { ok: true, flow, errors, sha16: "" };
  payload.sha16 = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store", "x-flow-sha16": payload.sha16 },
  });
}
