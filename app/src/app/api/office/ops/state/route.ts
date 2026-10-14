// GET /api/office/ops/state — לוח-המפעיל: 9 הזנות-החדר + STASIS + פקודות + ריצות.
// נדרש טוקן-מפעיל (Authorization: Bearer). חוק-אמת: כשל-מדידה = null, לא ירוק-מזויף.
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/office-operator";
import { measureFeeds, measureOrders, measureRuns, measureStasis, readPat } from "@/lib/office-truth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!verifySession(token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const pat = await readPat();
  const [feeds, stasis, orders, runs] = await Promise.all([
    measureFeeds(pat),
    measureStasis(pat),
    measureOrders(pat),
    measureRuns(pat, "Domain", 12),
  ]);

  return NextResponse.json(
    { ok: true, feeds, stasis, orders, runs, servedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
