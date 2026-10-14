// POST /api/dex/wallet/faucet · הנפקת-USDS-מתועדת לארנק-הבעלים (תקרה-מוצהרת)
// חוק-אמת: הברז מנפיק רק-USDS (יחידת-סליקה-פנימית) — SAOS לעולם לא נטבע-כאן
// (ההנפקה-האמיתית של-SAOS מגיעה-רק-מהשרשרת של-Console: 126,682 מתוך-21M).
// כל-הנפקה-נרשמת-בלדג'ר — פאנל-האספקה מראה-אותה-מיד.
// חוק-שער: פעולת-בעלים — 401 בלי-אימות-headcorner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { ownerBalance } from "@/lib/dex-server";
import { isOwnerReq } from "@/lib/sovereign-auth";

export const dynamic = "force-dynamic";

const AMOUNT = 10_000;
const CAP = 500_000;

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "הברז הוא פעולת-בעלים — נדרש אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    await ensureEngine();
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = body.token === "USDS" ? "USDS" : "USDS"; // רק-USDS — אין-טביעת-SAOS
    const bal = await ownerBalance(token);
    if (bal >= CAP) {
      return NextResponse.json({ error: `תקרת-הברז הושגה (${CAP.toLocaleString("he-IL")} ${token})` }, { status: 429 });
    }
    const amount = Math.min(AMOUNT, CAP - bal);
    const entry = await db.dexLedger.create({
      data: { account: "OWNER", token, amount, reason: `הנפקת-USDS-מתועדת · ברז-בעלים · מתווסף-לפאנל-האספקה` },
    });
    return NextResponse.json({ ok: true, amount, token, id: entry.id });
  } catch (err) {
    console.error("[api/dex/wallet/faucet]", err);
    return NextResponse.json({ error: "נכשל-הברז" }, { status: 500 });
  }
}
