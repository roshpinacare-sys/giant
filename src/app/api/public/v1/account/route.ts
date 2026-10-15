/**
 * GET /api/public/v1/account — מאזני-החשבון-של-המפתח + פקודות-פתוחות
 * חוק-אמת: מפתח-רואה-רק-את-החשבון-שלו (API:<prefix>) — אפס-גישה-ל-OWNER או-לצי.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/public-api";
import { ensureEngine } from "@/lib/dex-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
    );
  }
  try {
    await ensureEngine();
    const [agg, openOrders, totalOrders] = await Promise.all([
      db.dexLedger.groupBy({
        by: ["token"],
        _sum: { amount: true },
        where: { account: auth.key.account },
      }),
      db.dexOrder.count({ where: { account: auth.key.account, status: "OPEN" } }),
      db.dexOrder.count({ where: { account: auth.key.account } }),
    ]);
    const balances = agg
      .map((r) => ({ token: r.token, balance: r._sum.amount ?? 0 }))
      .filter((b) => Math.abs(b.balance) > 1e-9)
      .sort((a, b) => b.balance - a.balance);
    return NextResponse.json(
      {
        ok: true,
        account: auth.key.account,
        balances,
        openOrders,
        totalOrders,
        note: "החשבון-מחזיק-רק-מה-שנזקף-אליו-בפועל — אין-אשראי, אין-כסף-מזויף",
      },
      { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/public/v1/account]", err);
    return NextResponse.json({ ok: false, error: "כשל-מדידת-החשבון" }, { status: 500 });
  }
}
