// GET /api/giant/fleet — הצי-החי: האימפריה על-הגיט (GIANT · הכל-חי)
// ═════════════════════════════════════════════════════════════════════════
// המנוע ב-src/lib/giant/fleet.ts (משותף-גם-לסריקת-האמון); כאן רק-החשיפה.
import { NextResponse } from "next/server";
import { loadFleet } from "@/lib/giant/fleet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const data = await loadFleet();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
