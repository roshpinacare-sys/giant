// POST /api/dex/wallet/faucet · ברז-דמו לטעינת-הארנק (כולל-תקרה)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { ownerBalance } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

const AMOUNT = 10_000;
const CAP = 500_000;

export async function POST(req: NextRequest) {
  try {
    await ensureEngine();
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = ["USDS", "GNT"].includes(body.token ?? "") ? (body.token as string) : "USDS";
    const bal = await ownerBalance(token);
    if (bal >= CAP) {
      return NextResponse.json({ error: `תקרת-הברז הושגה (${CAP.toLocaleString("he-IL")} ${token})` }, { status: 429 });
    }
    const amount = Math.min(AMOUNT, CAP - bal);
    const entry = await db.dexLedger.create({
      data: { account: "OWNER", token, amount, reason: `ברז-דמו · טעינת ${token}` },
    });
    return NextResponse.json({ ok: true, amount, token, id: entry.id });
  } catch (err) {
    console.error("[api/dex/wallet/faucet]", err);
    return NextResponse.json({ error: "נכשל-הברז" }, { status: 500 });
  }
}
