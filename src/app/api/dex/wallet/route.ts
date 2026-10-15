// GET /api/dex/wallet · ארנק-הבעלים: יתרות, עמדות-LP, לדג'ר
import { NextResponse } from "next/server";
import { ensureEngine } from "@/lib/dex-engine";
import { getWalletState } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const wallet = await getWalletState();
    return NextResponse.json(wallet);
  } catch (err) {
    console.error("[api/dex/wallet]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-הארנק" }, { status: 500 });
  }
}
