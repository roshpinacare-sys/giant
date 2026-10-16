// GET /api/dex/pairs?q= · רשימת-זוגות לשוק ולבורר-הזוגות
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { toPairSummary } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const pairs = await db.dexPair.findMany({ orderBy: [{ featured: "desc" }, { sort: "asc" }] });
    const mapped = pairs.map(toPairSummary);
    const filtered = q
      ? mapped.filter((p) =>
          `${p.base}/${p.quote} ${p.chain}`.toLowerCase().includes(q),
        )
      : mapped;
    return NextResponse.json({ pairs: filtered });
  } catch (err) {
    console.error("[api/dex/pairs]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-הזוגות" }, { status: 500 });
  }
}
