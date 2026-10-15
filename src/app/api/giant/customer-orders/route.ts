/**
 * /api/giant/customer-orders — ספר-הפקודות-הפנימי של הריבונות (T74 · הצי-הוא-הלקוח-הראשון)
 *
 * חוקי-הספר (כנות-מלאה):
 *  · רק-חשבונות-אמת-עם-סשן-חי מציבים-פקודות (מקור-הזהות: /api/auth/me → scrypt+סשן-מהבסיס).
 *  · מילוי קורה-אך-ורק-מול-פקודה-מנוחה-אמיתית-של-חשבון-אחר (price-time priority, אין-מסחר-עם-עצמך).
 *    מחיר-המילוי = מחיר-הפקודה-המנוחה (הקודמת-בזמן). מילויים-חלקיים נתמכים (remaining).
 *  · מחיר-ייחוס (refMidMu) = מרכז-ספר-החוץ-החי (Kraken/Binance) בעת-ההצבה — רק-רישום; כשל-חוץ
 *    לא מונע-הצבה (ריבונות: הספר-הפנימי לא-תלוי-באף-אחד).
 *  · אפס-סימולציה: אין-מילוי-ללא-צד-שני-אמיתי; פקודה-שלא-חוצה נשארת OPEN — כנה.
 *
 * GET  → הפקודות-שלי (עם-קבלות-המילוי) + הספר-הפנימי-הפתוח + סטטיסטיקות-אמת.
 * POST → הצבת-פקודת-מגבלה {side, qty, priceUsd} + התאמה-ומילוי-מיידי-בעסקה-אחת.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/sovereign-auth";
import { measureExternalBook } from "@/lib/giant/external-book";

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

export async function GET() {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "דרוש-סשן — הירשם-או-היכנס" }, { status: 401 });
  }

  const [myOrders, bookRaw, users, statsUsers, open, filled] = await Promise.all([
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
  ]);

  const labelById = new Map(users.map((u) => [u.id, { label: userLabel(u), crewId: u.crewId }]));

  return NextResponse.json({
    ok: true,
    me,
    myOrders: myOrders.map((o) => ({
      id: o.id,
      side: o.side,
      qty: o.qty,
      remaining: o.remaining,
      status: o.status,
      priceMu: o.priceMu,
      refMidMu: o.refMidMu,
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
      /* הפקודות-המנוחות-החוצות-הטובות-ביותר: buy נגד asks הזולות-ביותר; sell נגד bids היוקרות-ביותר */
      const resting = await tx.tradeOrder.findMany({
        where: { status: { in: ["OPEN", "PARTIAL"] }, side: opposite, userId: { not: me.id } },
        orderBy: side === "buy" ? [{ priceMu: "asc" }, { createdAt: "asc" }] : [{ priceMu: "desc" }, { createdAt: "asc" }],
        take: 100,
      });

      const incomingFills: Fill[] = [];
      for (const r of resting) {
        if (remaining <= 0) break;
        const crosses = side === "buy" ? r.priceMu <= priceMu : r.priceMu >= priceMu;
        if (!crosses) break; /* ממוין-לפי-הטוב-ביותר — אין-חצייה-קדימה */
        const fillQty = Math.min(remaining, r.remaining);
        if (fillQty <= 0) continue;

        const now = new Date().toISOString();
        /* קבלה-לפקודה-המנוחה: הצד-השני = הפונה-הנוכחי */
        const restFill: Fill = {
          priceMu: r.priceMu, /* price-time priority: המחיר-של-המנוחה */
          qty: fillQty,
          counterpartyUserId: me.id,
          counterpartyOrderId: "incoming",
          at: now,
        };
        const newRestRemaining = Math.round((r.remaining - fillQty) * 1000) / 1000;
        await tx.tradeOrder.update({
          where: { id: r.id },
          data: {
            remaining: newRestRemaining,
            status: newRestRemaining <= 0 ? "FILLED" : "PARTIAL",
            fillsJson: JSON.stringify([...parseFills(r.fillsJson), restFill]),
          },
        });

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

      const status = remaining <= 0 ? "FILLED" : incomingFills.length > 0 ? "PARTIAL" : "OPEN";
      const created = await tx.tradeOrder.create({
        data: {
          userId: me.id,
          side,
          qty: totalQty,
          priceMu,
          remaining,
          status,
          refMidMu,
          fillsJson: JSON.stringify(incomingFills),
        },
      });
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
      matched: placed.fills.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `הספר-דחה-את-הפקודה-כנה: ${e instanceof Error ? e.message : "שגיאת-בסיס"}` },
      { status: 500 },
    );
  }
}
