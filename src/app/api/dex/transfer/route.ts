/**
 * POST /api/dex/transfer — העברה-פנימית-אמת · שער-בעלים-בלבד
 * {toAccount, token, amount} — מזיז-יתרה-אמת מארנק-הבעלים לחשבון-אחר (למשל API:<prefix>).
 * זו-לא-טביעה-של-כסף: OWNER-יורד-בדיוק-מה-שהיעד-עולה — שתי-שורות-לדג'ר-מקושרות (ref).
 * זה-הגשר-הפנימי: מפתח-חוץ-יכול-לסחור-רק-במה-שהבעלים-הפקיד-באמת-לחשבונו.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isOwnerReq } from "@/lib/sovereign-auth";
import { ensureEngine } from "@/lib/dex-engine";
import { accountBalance } from "@/lib/dex-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "העברת-כספים-מארנק-הבעלים — דורש-אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    await ensureEngine();
    const body = (await req.json()) as { toAccount?: string; token?: string; amount?: number };
    const toAccount = (body.toAccount ?? "").trim();
    const token = (body.token ?? "").trim().toUpperCase();
    const amount = Number(body.amount ?? 0);
    if (!toAccount || !token || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "פרמטרים-חסרים: toAccount/token/amount>0" }, { status: 400 });
    }
    if (toAccount === "OWNER" || toAccount === "ESCROW" || toAccount.startsWith("FLEET:")) {
      return NextResponse.json(
        { error: "העברה-מותרת-רק-לחשבון-מפתח-API (API:…) — הצי-וארנק-הבעלים-מנוהלים-בנתיבים-שלהם" },
        { status: 403 },
      );
    }
    const balance = await accountBalance("OWNER", token);
    if (balance < amount) {
      return NextResponse.json(
        { error: `אין-מספיק ${token} בארנק-הבעלים (יש ${balance.toLocaleString("he-IL", { maximumFractionDigits: 2 })})` },
        { status: 400 },
      );
    }
    const ref = `xfer:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    await db.$transaction([
      db.dexLedger.create({
        data: { account: "OWNER", token, amount: -amount, reason: `הפקדה-פנימית → ${toAccount}`, ref },
      }),
      db.dexLedger.create({
        data: { account: toAccount, token, amount, reason: `הפקדה-מארנק-הבעלים (${ref})`, ref },
      }),
    ]);
    const newOwner = await accountBalance("OWNER", token);
    const newTarget = await accountBalance(toAccount, token);
    return NextResponse.json({ ok: true, ref, token, amount, ownerBalance: newOwner, targetBalance: newTarget });
  } catch (err) {
    console.error("[api/dex/transfer]", err);
    return NextResponse.json({ error: "כשל-ההעברה" }, { status: 500 });
  }
}
