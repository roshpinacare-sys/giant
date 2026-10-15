// POST /api/fleet/allocate · הקצאת-עבודה-אמיתית לסוכן-צי (פעולת-בעלים · headcorner)
// חוק-אמת: הכסף זז-מהקופה בלדג'ר (TREASURY −X / FLEET:<agentId> +X) — אין-הדפסה-סמויה.
// האסימון הגולמי מוחזר-פעם-אחת-בלבד לבעלים למסירה-ידנית לסוכן; ב-DB רק ה-hash.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { isOwnerReq } from "@/lib/sovereign-auth";
import { accountBalance } from "@/lib/dex-server";
import { fleetTokenHash, FLEET_LIMITS } from "@/lib/fleet-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json(
        { error: "הקצאת-צי היא פעולת-בעלים — נדרש אימות-headcorner", authRequired: true },
        { status: 401 },
      );
    }
    await ensureEngine();
    const body = (await req.json().catch(() => ({}))) as { agentId?: string; name?: string; usds?: number };
    const agentId = String(body.agentId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    const name = String(body.name ?? agentId).trim().slice(0, 60);
    const usds = Math.round(Number(body.usds ?? 0) * 100) / 100;
    if (!agentId) return NextResponse.json({ error: "נדרש מזהה-סוכן (agentId)" }, { status: 400 });
    if (!Number.isFinite(usds) || usds < FLEET_LIMITS.minPerAgent || usds > FLEET_LIMITS.maxPerAgent) {
      return NextResponse.json(
        { error: `ההקצאה חייבת בין ${FLEET_LIMITS.minPerAgent} ל-${FLEET_LIMITS.maxPerAgent} USDS` },
        { status: 400 },
      );
    }

    const treasury = await accountBalance("TREASURY", "USDS");
    if (treasury < usds) {
      return NextResponse.json(
        { error: `לקופה אין מספיק USDS (יש ${treasury.toLocaleString("he-IL", { maximumFractionDigits: 2 })})` },
        { status: 400 },
      );
    }
    const fleetAgg = await db.dexLedger.aggregate({
      _sum: { amount: true },
      where: { account: { startsWith: "FLEET:" }, token: "USDS" },
    });
    const totalFleet = fleetAgg._sum.amount ?? 0;
    if (totalFleet + usds > FLEET_LIMITS.maxTotalFleet) {
      return NextResponse.json(
        { error: `תקרת-הצי הכוללת היא ${FLEET_LIMITS.maxTotalFleet} USDS (מוקצה עד-כה ${totalFleet.toLocaleString("he-IL", { maximumFractionDigits: 2 })})` },
        { status: 429 },
      );
    }

    const rawToken = randomBytes(24).toString("hex");
    const account = `FLEET:${agentId}`;
    const existing = await db.fleetAgent.findUnique({ where: { agentId } });
    if (existing) {
      await db.fleetAgent.update({
        where: { agentId },
        data: { tokenHash: fleetTokenHash(rawToken), active: true, allocationUsds: { increment: usds }, name },
      });
    } else {
      await db.fleetAgent.create({
        data: { agentId, name, tokenHash: fleetTokenHash(rawToken), allocationUsds: usds, active: true },
      });
    }
    await db.dexLedger.create({
      data: { account: "TREASURY", token: "USDS", amount: -usds, reason: `הקצאת-עבודה · צי · ${agentId}` },
    });
    await db.dexLedger.create({
      data: { account, token: "USDS", amount: usds, reason: `הקצאת-עבודה מהקופה · צי · ${agentId}` },
    });

    return NextResponse.json({
      ok: true,
      agentId,
      allocated: usds,
      token: rawToken, // פעם-אחת-בלבד — למסירה לסוכן
      note: "האסימון לא יוצג שוב לעולם. רשמי אותו עכשיו והעבירי לסוכן.",
    });
  } catch (err) {
    console.error("[api/fleet/allocate]", err);
    return NextResponse.json({ error: "נכשלה-ההקצאה" }, { status: 500 });
  }
}

// DELETE — השבתת-סוכן (פעולת-בעלים)
export async function DELETE(req: NextRequest) {
  try {
    if (!(await isOwnerReq(req))) {
      return NextResponse.json({ error: "פעולת-בעלים", authRequired: true }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as { agentId?: string };
    const agentId = String(body.agentId ?? "").trim();
    if (!agentId) return NextResponse.json({ error: "נדרש agentId" }, { status: 400 });
    await db.fleetAgent.updateMany({ where: { agentId }, data: { active: false } });
    return NextResponse.json({ ok: true, agentId, active: false });
  } catch (err) {
    console.error("[api/fleet/allocate DELETE]", err);
    return NextResponse.json({ error: "נכשלה-ההשבתה" }, { status: 500 });
  }
}
