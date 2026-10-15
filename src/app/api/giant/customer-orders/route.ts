/**
 * /api/giant/customer-orders — ספר-הפקודות-הפנימי של הריבונות (T74+T75 · הצי-הוא-הלקוח-הראשון)
 *
 * חוקי-הספר (כנות-מלאה):
 *  · רק-חשבונות-אמת-עם-סשן-חי מציבים-פקודות (מקור-הזהות: /api/auth/me → scrypt+סשן-מהבסיס).
 *  · T75-קאסטודיה: כל-חשבון מקבל-מאזן-אימון-פנימי (GENESIS 10,000$ + 0.05 BTC · paper לפני-M4);
 *    הצבה נועלת-מראש את-מלוא-מה-שהיא-דורשת — מילוי משלם-מהנעול-בלבד · אין-מאזן-שלילי-אף-פעם.
 *  · מילוי קורה-אך-ורק-מול-פקודה-מנוחה-אמיתית-של-חשבון-אחר (price-time priority, אין-מסחר-עם-עצמך).
 *    מחיר-המילוי = מחיר-הפקודה-המנוחה (הקודמת-בזמן) · מילויים-חלקיים נתמכים · עודף-מחיר חוזר-לחופשי.
 *  · חוק-הנעילה: פקודת-מנוחה-בלי-נעול (מהתקופה-שלפני-T75) אינה-בת-התאמה — מי-שלא-נעל, לא-מוכן-לשלם.
 *  · מחיר-ייחוס (refMidMu) = מרכז-ספר-החוץ-החי בעת-ההצבה — רק-רישום; כשל-חוץ לא מונע-הצבה (ריבונות).
 *  · אפס-סימולציה: אין-מילוי-ללא-צד-שני-אמיתי; פקודה-שלא-חוצה נשארת OPEN — כנה.
 *
 * GET    → המאזן-שלי (חופשי+נעול) + פנקס-התנועות + הפקודות-שלי + הספר-הפתוח + סטטיסטיקות.
 * POST   → הצבת-פקודת-מגבלה {side, qty, priceUsd} + נעילה + התאמה + התיישבות-שני-הצדדים-בעסקה-אחת.
 * DELETE → ביטול-פקודה-פתוחה-שלי (?id=) + שחרור-הנעול-חזרה-לחופשי.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/sovereign-auth";
import { measureExternalBook } from "@/lib/giant/external-book";
import {
  CustodyError, ensureGenesis, ledger, lockForOrder, qtyToSat, releaseResidual, satToBtc,
} from "@/lib/giant/custody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Fill {
  priceMu: number;
  qty: number;
  counterpartyUserId: string;
  counterpartyOrderId: string;
  at: string;
}

const parseFills = (json: string): Fill[] => {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as Fill[]) : [];
  } catch {
    return [];
  }
};

const userLabel = (u: { name: string | null; email: string; crewId: string | null }) =>
  u.name?.trim() || u.email.split("@")[0];

const usdOf = (mu: number) => (mu / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });

export async function GET() {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "דרוש-סשן — הירשם-או-היכנס" }, { status: 401 });
  }

  /* מאזן-פתיחה-עצל — חשבונות-T74 מקבלים-מאזן-אימון-פעם-אחת-כנה */
  await db.$transaction((tx) => ensureGenesis(tx, me.id));

  const [myOrders, bookRaw, users, statsUsers, open, filled, ledgerRaw, acct, locks] = await Promise.all([
    db.tradeOrder.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.tradeOrder.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: [{ priceMu: "asc" }, { createdAt: "asc" }],
      take: 100,
      include: { user: { select: { name: true, email: true, crewId: true } } },
    }),
    db.user.findMany({ select: { id: true, name: true, email: true, crewId: true } }),
    db.user.count(),
    db.tradeOrder.count({ where: { status: { in: ["OPEN", "PARTIAL"] } } }),
    db.tradeOrder.count({ where: { status: "FILLED" } }),
    db.ledgerEntry.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.user.findUniqueOrThrow({ where: { id: me.id }, select: { cashMu: true, assetSat: true } }),
    db.tradeOrder.aggregate({
      where: { userId: me.id, status: { in: ["OPEN", "PARTIAL"] } },
      _sum: { reservedCashMu: true, reservedAssetSat: true },
    }),
  ]);

  const labelById = new Map(users.map((u) => [u.id, { label: userLabel(u), crewId: u.crewId }]));

  return NextResponse.json({
    ok: true,
    me,
    balances: {
      freeCashMu: acct.cashMu,
      freeAssetSat: acct.assetSat,
      lockedCashMu: locks._sum.reservedCashMu ?? 0,
      lockedAssetSat: locks._sum.reservedAssetSat ?? 0,
    },
    ledger: ledgerRaw.map((l) => ({
      id: l.id,
      kind: l.kind,
      deltaCashMu: l.deltaCashMu,
      deltaAssetSat: l.deltaAssetSat,
      note: l.note,
      counterpartyLabel: l.counterpartyUserId ? labelById.get(l.counterpartyUserId)?.label ?? null : null,
      createdAt: l.createdAt,
    })),
    myOrders: myOrders.map((o) => ({
      id: o.id,
      side: o.side,
      qty: o.qty,
      remaining: o.remaining,
      status: o.status,
      priceMu: o.priceMu,
      refMidMu: o.refMidMu,
      reservedCashMu: o.reservedCashMu,
      reservedAssetSat: o.reservedAssetSat,
      fills: parseFills(o.fillsJson).map((f) => ({
        ...f,
        counterpartyLabel: labelById.get(f.counterpartyUserId)?.label ?? "חשבון-לא-ידוע",
      })),
      createdAt: o.createdAt,
    })),
    book: bookRaw.map((o) => ({
      id: o.id,
      side: o.side,
      qty: o.qty,
      remaining: o.remaining,
      status: o.status,
      priceMu: o.priceMu,
      userLabel: userLabel(o.user),
      userCrewId: o.user.crewId,
      createdAt: o.createdAt,
    })),
    stats: { users: statsUsers, open, filled },
    measuredAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "דרוש-סשן — הירשם-או-היכנס" }, { status: 401 });
  }

  let body: { side?: unknown; qty?: unknown; priceUsd?: unknown };
  try {
    body = (await req.json()) as { side?: unknown; qty?: unknown; priceUsd?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "גוף-הבקשה-לא-JSON-תקין" }, { status: 400 });
  }

  const side = body.side === "buy" || body.side === "sell" ? body.side : null;
  const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);
  const priceUsd = typeof body.priceUsd === "number" ? body.priceUsd : Number(body.priceUsd);

  if (side === null) return NextResponse.json({ ok: false, error: "צד-חייב-להיות buy או sell" }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10) {
    return NextResponse.json({ ok: false, error: "כמות-חייבת-להיות-בין 0.001 ל-10" }, { status: 400 });
  }
  const qtyRounded = Math.round(qty * 1000) / 1000;
  if (qtyRounded <= 0) return NextResponse.json({ ok: false, error: "כמות-קטנה-מדי (מינימום 0.001)" }, { status: 400 });
  if (!Number.isFinite(priceUsd) || priceUsd <= 0 || priceUsd > 1_000_000) {
    return NextResponse.json({ ok: false, error: "מחיר-חייב-להיות-בין 0 ל-1,000,000 דולר" }, { status: 400 });
  }
  const priceMu = Math.round(priceUsd * 1000);
  if (priceMu <= 0) return NextResponse.json({ ok: false, error: "מחיר-קטן-מדי (מינימום 0.001$)" }, { status: 400 });

  /* מחיר-ייחוס מספר-החוץ-החי — רק-רישום; כשל-חוץ = null וההצבה-ממשיכה (ריבונות) */
  const book = await measureExternalBook();
  const refMidMu = book.ok && book.mid !== null ? Math.round(book.mid * 1000) : null;

  const opposite = side === "buy" ? "sell" : "buy";
  const totalQty = qtyRounded;
  let remaining = totalQty;

  try {
    const placed = await db.$transaction(async (tx) => {
      await ensureGenesis(tx, me.id);

      /* T75-נעילה: בדיקת-יתרה-כנה (400-במחסור) + הוצאה-מהחופשי-אל-הפקודה */
      const lock = await lockForOrder(tx, me.id, side, qtyRounded, priceMu);

      /* הפקודות-המנוחות-החוצות-הטובות-ביותר — ורק-כאלה-שיש-להן-נעול (חוק-הנעילה) */
      const resting = await tx.tradeOrder.findMany({
        where: {
          status: { in: ["OPEN", "PARTIAL"] },
          side: opposite,
          userId: { not: me.id },
          ...(opposite === "buy" ? { reservedCashMu: { gt: 0 } } : { reservedAssetSat: { gt: 0 } }),
        },
        orderBy: side === "buy" ? [{ priceMu: "asc" }, { createdAt: "asc" }] : [{ priceMu: "desc" }, { createdAt: "asc" }],
        take: 100,
      });

      const incomingFills: Fill[] = [];
      let resCashLeft = lock.reservedCashMu; /* הנעול-הנוכחי-של-הפונה (קנייה) */
      let resSatLeft = lock.reservedAssetSat; /* הנעול-הנוכחי-של-הפונה (מכירה) */
      let totalFillSat = 0;
      let totalPayMu = 0; /* סך-שולם-במחירי-מנוחה */
      let totalRefundMu = 0; /* סך-עודף-מחיר-שחזר-לחופשי */

      for (const r of resting) {
        if (remaining <= 0) break;
        const crosses = side === "buy" ? r.priceMu <= priceMu : r.priceMu >= priceMu;
        if (!crosses) break; /* ממוין-לפי-הטוב-ביותר — אין-חצייה-קדימה */
        const fillQty = Math.min(remaining, r.remaining);
        if (fillQty <= 0) continue;

        const now = new Date().toISOString();
        const fillSat = qtyToSat(fillQty);
        const restFilled = Math.round((r.remaining - fillQty) * 1000) / 1000 <= 0;

        /* ═ התיישבות-צד-המנוחה (משלם-מהנעול-שנעל-בהצבה-שלו) ═ */
        if (r.side === "sell") {
          const satOut = Math.min(fillSat, r.reservedAssetSat);
          const proceedsMu = Math.round(fillQty * r.priceMu);
          await tx.user.update({ where: { id: r.userId }, data: { cashMu: { increment: proceedsMu } } });
          await ledger(tx, r.userId, "TRADE", proceedsMu, 0, {
            orderId: r.id,
            counterpartyUserId: me.id,
            note: `מכר ${fillQty} BTC (מהנעול) @ ${usdOf(r.priceMu)}$ · קיבל ${usdOf(proceedsMu)}$`,
          });
          const residualSat = restFilled ? Math.max(0, r.reservedAssetSat - satOut) : 0;
          await tx.tradeOrder.update({
            where: { id: r.id },
            data: {
              remaining: Math.round((r.remaining - fillQty) * 1000) / 1000,
              status: restFilled ? "FILLED" : "PARTIAL",
              fillsJson: JSON.stringify([...parseFills(r.fillsJson), { priceMu: r.priceMu, qty: fillQty, counterpartyUserId: me.id, counterpartyOrderId: "incoming", at: now } as Fill]),
              reservedAssetSat: r.reservedAssetSat - satOut - residualSat,
            },
          });
          if (residualSat > 0) await releaseResidual(tx, r.userId, "sell", r.id, 0, residualSat, "הפקודה-התמלאה");
        } else {
          const payMu = Math.min(Math.round(fillQty * r.priceMu), r.reservedCashMu);
          await tx.user.update({ where: { id: r.userId }, data: { assetSat: { increment: fillSat } } });
          await ledger(tx, r.userId, "TRADE", 0, fillSat, {
            orderId: r.id,
            counterpartyUserId: me.id,
            note: `קנה ${fillQty} BTC (מהנעול) @ ${usdOf(r.priceMu)}$ · שילם ${usdOf(payMu)}$`,
          });
          const residualMu = restFilled ? Math.max(0, r.reservedCashMu - payMu) : 0;
          await tx.tradeOrder.update({
            where: { id: r.id },
            data: {
              remaining: Math.round((r.remaining - fillQty) * 1000) / 1000,
              status: restFilled ? "FILLED" : "PARTIAL",
              fillsJson: JSON.stringify([...parseFills(r.fillsJson), { priceMu: r.priceMu, qty: fillQty, counterpartyUserId: me.id, counterpartyOrderId: "incoming", at: now } as Fill]),
              reservedCashMu: r.reservedCashMu - payMu - residualMu,
            },
          });
          if (residualMu > 0) await releaseResidual(tx, r.userId, "buy", r.id, residualMu, 0, "הפקודה-התמלאה");
        }

        /* ═ התיישבות-הפונה (מהנעול-הטרי-של-הפקודה-הנכנסת) ═ */
        if (side === "buy") {
          const payMu = Math.min(Math.round(fillQty * r.priceMu), resCashLeft);
          const refundMu = Math.min(Math.round(fillQty * (priceMu - r.priceMu)), resCashLeft - payMu);
          resCashLeft -= payMu + refundMu;
          totalPayMu += payMu;
          totalRefundMu += refundMu;
          totalFillSat += fillSat;
        } else {
          const satOut = Math.min(fillSat, resSatLeft);
          resSatLeft -= satOut;
          totalFillSat += satOut;
          totalPayMu += Math.round(fillQty * r.priceMu);
        }

        incomingFills.push({
          priceMu: r.priceMu,
          qty: fillQty,
          counterpartyUserId: r.userId,
          counterpartyOrderId: r.id,
          at: now,
        });
        remaining = Math.round((remaining - fillQty) * 1000) / 1000;
        if (remaining < 0.0005) remaining = 0;
      }

      const filled = remaining <= 0;
      const status = filled ? "FILLED" : incomingFills.length > 0 ? "PARTIAL" : "OPEN";

      const created = await tx.tradeOrder.create({
        data: {
          userId: me.id,
          side,
          qty: totalQty,
          priceMu,
          remaining,
          status,
          refMidMu,
          reservedCashMu: side === "buy" ? resCashLeft : 0,
          reservedAssetSat: side === "sell" ? resSatLeft : 0,
          fillsJson: JSON.stringify(incomingFills),
        },
      });

      /* ═ פנקס-הפונה: LOCK + TRADE + UNLOCK(עודף/שארית) ═ */
      if (side === "buy") {
        await ledger(tx, me.id, "LOCK", -lock.reservedCashMu, 0, {
          orderId: created.id,
          note: `נעילה-לקנייה ${totalQty} BTC @ ${usdOf(priceMu)}$`,
        });
        if (totalFillSat > 0) {
          await tx.user.update({
            where: { id: me.id },
            data: { assetSat: { increment: totalFillSat }, cashMu: { increment: totalRefundMu } },
          });
          await ledger(tx, me.id, "TRADE", 0, totalFillSat, {
            orderId: created.id,
            note: `קנה ${Math.round((totalFillSat / 1e8) * 1000) / 1000} BTC · שילם ${usdOf(totalPayMu)}$ (מהנעול)${totalRefundMu > 0 ? ` · עודף-מחיר ${usdOf(totalRefundMu)}$` : ""}`,
          });
          if (totalRefundMu > 0) {
            await ledger(tx, me.id, "UNLOCK", totalRefundMu, 0, { orderId: created.id, note: "עודף-מחיר — מילוי-זול-מהמגבלה" });
          }
        }
        if (filled && resCashLeft > 0) {
          await tx.user.update({ where: { id: me.id }, data: { cashMu: { increment: resCashLeft } } });
          await ledger(tx, me.id, "UNLOCK", resCashLeft, 0, { orderId: created.id, note: "שארית-נעילה — הפקודה-התמלאה" });
          await tx.tradeOrder.update({ where: { id: created.id }, data: { reservedCashMu: 0 } });
        }
      } else {
        await ledger(tx, me.id, "LOCK", 0, -lock.reservedAssetSat, {
          orderId: created.id,
          note: `נעילה-למכירה ${totalQty} BTC @ ${usdOf(priceMu)}$`,
        });
        if (totalFillSat > 0) {
          await tx.user.update({ where: { id: me.id }, data: { cashMu: { increment: totalPayMu } } });
          await ledger(tx, me.id, "TRADE", totalPayMu, 0, {
            orderId: created.id,
            note: `מכר ${satToBtc(totalFillSat)} BTC (מהנעול) · קיבל ${usdOf(totalPayMu)}$`,
          });
        }
        if (filled && resSatLeft > 0) {
          await tx.user.update({ where: { id: me.id }, data: { assetSat: { increment: resSatLeft } } });
          await ledger(tx, me.id, "UNLOCK", 0, resSatLeft, { orderId: created.id, note: "שארית-נעילה — הפקודה-התמלאה" });
          await tx.tradeOrder.update({ where: { id: created.id }, data: { reservedAssetSat: 0 } });
        }
      }

      return { created, fills: incomingFills };
    });

    /* שמות-הצד-השני לקבלה-המיידית (ה-GET מצרף-שמות-משלו; ה-POST חייב-קבלה-מלאה-עצמאית) */
    const counterpartyIds = [...new Set(placed.fills.map((f) => f.counterpartyUserId))];
    const counterparties = counterpartyIds.length
      ? await db.user.findMany({ where: { id: { in: counterpartyIds } }, select: { id: true, name: true, email: true } })
      : [];
    const cpLabel = new Map(counterparties.map((u) => [u.id, u.name?.trim() || u.email.split("@")[0]]));
    const fillsWithLabels = placed.fills.map((f) => ({
      ...f,
      counterpartyLabel: cpLabel.get(f.counterpartyUserId) ?? "חשבון-לא-ידוע",
    }));

    const after = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { cashMu: true, assetSat: true } });

    return NextResponse.json({
      ok: true,
      order: {
        id: placed.created.id,
        side: placed.created.side,
        qty: placed.created.qty,
        remaining: placed.created.remaining,
        status: placed.created.status,
        priceMu: placed.created.priceMu,
        refMidMu: placed.created.refMidMu,
        fills: fillsWithLabels,
        createdAt: placed.created.createdAt,
      },
      balances: { freeCashMu: after.cashMu, freeAssetSat: after.assetSat },
      matched: placed.fills.length,
    });
  } catch (e) {
    if (e instanceof CustodyError) {
      return NextResponse.json({ ok: false, error: e.message, needed: e.needed, have: e.have }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: `הספר-דחה-את-הפקודה-כנה: ${e instanceof Error ? e.message : "שגיאת-בסיס"}` },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "דרוש-סשן — הירשם-או-היכנס" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "חסר-id-פקודה" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      await ensureGenesis(tx, me.id);
      const o = await tx.tradeOrder.findUnique({ where: { id } });
      if (!o || o.userId !== me.id) return { notFound: true as const };
      if (o.status !== "OPEN" && o.status !== "PARTIAL") return { alreadyClosed: true as const, status: o.status };

      await tx.tradeOrder.update({
        where: { id: o.id },
        data: { status: "CANCELLED", reservedCashMu: 0, reservedAssetSat: 0 },
      });
      await releaseResidual(
        tx,
        me.id,
        o.side === "sell" ? "sell" : "buy",
        o.id,
        o.reservedCashMu,
        o.reservedAssetSat,
        "ביטול-פקודה",
      );
      const u = await tx.user.findUniqueOrThrow({ where: { id: me.id }, select: { cashMu: true, assetSat: true } });
      return {
        cancelled: true as const,
        releasedCashMu: o.reservedCashMu,
        releasedAssetSat: o.reservedAssetSat,
        balances: u,
      };
    });

    if ("notFound" in result) {
      return NextResponse.json({ ok: false, error: "פקודה-לא-נמצאה או שאינה-שלך" }, { status: 404 });
    }
    if ("alreadyClosed" in result) {
      return NextResponse.json({ ok: false, error: `הפקודה-כבר-סגורה (${result.status}) — אין-מה-לבטל` }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      releasedCashMu: result.releasedCashMu,
      releasedAssetSat: result.releasedAssetSat,
      balances: { freeCashMu: result.balances.cashMu, freeAssetSat: result.balances.assetSat },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `הביטול-נכשל-כנה: ${e instanceof Error ? e.message : "שגיאת-בסיס"}` },
      { status: 500 },
    );
  }
}
