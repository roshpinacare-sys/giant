// GET /api/dex/pools · בריכות-נזילות + עמדות-הבעלים
// POST /api/dex/pools · הוספה/הסרה-נזילות {action:'add'|'remove', ...}
// חוק-שער: הוספה/הסרה מזיזות-כסף-אמת מהקופה/ארנק-הבעלים — 401 בלי-אימות-headcorner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { getPoolRows, ownerBalance } from "@/lib/dex-server";
import { lpQuote } from "@/lib/dex-math";
import { isOwnerReq } from "@/lib/sovereign-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngine();
    const pools = await getPoolRows();
    return NextResponse.json({ pools });
  } catch (err) {
    console.error("[api/dex/pools GET]", err);
    return NextResponse.json({ error: "נכשלה-טעינת-הבריכות" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "ניהול-נזילות הוא פעולת-בעלים — נדרש אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    await ensureEngine();
    const body = (await req.json()) as {
      action?: string;
      pairId?: string;
      quoteAmount?: number;
      positionId?: string;
      pct?: number;
    };

    if (body.action === "add") {
      const quoteAmount = Number(body.quoteAmount ?? 0);
      if (!body.pairId || !Number.isFinite(quoteAmount) || quoteAmount <= 0) {
        return NextResponse.json({ error: "פרמטרים-לא-חוקיים" }, { status: 400 });
      }
      const pair = await db.dexPair.findUnique({ where: { id: body.pairId } });
      if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });
      // חוק-אמת: בריכות-נזילות רק על המטבע-האמיתי (SAOS/USDS)
      if (!pair.isNative) {
        return NextResponse.json(
          { error: `${pair.base} הוא מדד-מחיר-חוץ — בריכות נזילות פתוחות רק ב-SAOS/USDS` },
          { status: 403 },
        );
      }

      const bal = await ownerBalance(pair.quote);
      if (bal < quoteAmount) {
        return NextResponse.json({ error: `אין-מספיק ${pair.quote} בארנק` }, { status: 400 });
      }
      const existing = await db.dexLpPosition.aggregate({
        _sum: { shares: true },
        where: { pairId: pair.id },
      });
      const lp = lpQuote(
        { base: pair.reserveBase, quote: pair.reserveQuote },
        existing._sum.shares ?? 0,
        quoteAmount,
      );
      if (lp.baseAmount > (await ownerBalance(pair.base))) {
        return NextResponse.json({ error: `אין-מספיק ${pair.base} להשלמת-הזיווד` }, { status: 400 });
      }
      // עדכון-רזרבות + עמדה + לדג'ר
      await db.dexPair.update({
        where: { id: pair.id },
        data: {
          reserveBase: pair.reserveBase + lp.baseAmount,
          reserveQuote: pair.reserveQuote + quoteAmount,
        },
      });
      const pos = await db.dexLpPosition.create({
        data: {
          pairId: pair.id,
          owner: "OWNER",
          shares: lp.shares,
          baseAmount: lp.baseAmount,
          quoteAmount,
        },
      });
      await db.dexLedger.create({
        data: { account: "OWNER", token: pair.quote, amount: -quoteAmount, reason: `הפקדה-לבריכה ${pair.base}/${pair.quote}`, ref: pos.id },
      });
      await db.dexLedger.create({
        data: { account: "OWNER", token: pair.base, amount: -lp.baseAmount, reason: `הפקדה-לבריכה ${pair.base}/${pair.quote}`, ref: pos.id },
      });
      return NextResponse.json({ ok: true, positionId: pos.id, baseAmount: lp.baseAmount, shares: lp.shares, poolSharePct: lp.poolSharePct });
    }

    if (body.action === "remove") {
      const pct = Math.min(100, Math.max(1, Number(body.pct ?? 0)));
      // תמיכה-גם-ב-pairId (הפרונט שולח-זוג) וגם-ב-positionId
      const pos = body.positionId
        ? await db.dexLpPosition.findFirst({
            where: { id: body.positionId, owner: "OWNER" },
            orderBy: { createdAt: "desc" },
          })
        : body.pairId
          ? await db.dexLpPosition.findFirst({
              where: { pairId: body.pairId, owner: "OWNER" },
              orderBy: { createdAt: "desc" },
            })
          : null;
      if (!pos) {
        return NextResponse.json({ error: "עמדה-לא-נמצאה" }, { status: 404 });
      }
      const pair = await db.dexPair.findUnique({ where: { id: pos.pairId } });
      if (!pair) return NextResponse.json({ error: "זוג-לא-נמצא" }, { status: 404 });
      const f = pct / 100;
      const outBase = pos.baseAmount * f;
      const outQuote = pos.quoteAmount * f;
      await db.dexPair.update({
        where: { id: pos.pairId },
        data: {
          reserveBase: Math.max(1e-9, pair.reserveBase - outBase),
          reserveQuote: Math.max(1e-9, pair.reserveQuote - outQuote),
        },
      });
      if (pct >= 100) {
        await db.dexLpPosition.delete({ where: { id: pos.id } });
      } else {
        await db.dexLpPosition.update({
          where: { id: pos.id },
          data: { baseAmount: pos.baseAmount - outBase, quoteAmount: pos.quoteAmount - outQuote, shares: pos.shares * (1 - f) },
        });
      }
      await db.dexLedger.create({
        data: { account: "OWNER", token: pair.quote, amount: outQuote, reason: `משיכה-מבריכה ${pair.base}/${pair.quote} (${pct}%)`, ref: pos.id },
      });
      await db.dexLedger.create({
        data: { account: "OWNER", token: pair.base, amount: outBase, reason: `משיכה-מבריכה ${pair.base}/${pair.quote} (${pct}%)`, ref: pos.id },
      });
      return NextResponse.json({ ok: true, outBase, outQuote });
    }

    return NextResponse.json({ error: "פעולה-לא-מוכרת" }, { status: 400 });
  } catch (err) {
    console.error("[api/dex/pools POST]", err);
    return NextResponse.json({ error: "נכשלה-פעולת-הבריכה" }, { status: 500 });
  }
}
