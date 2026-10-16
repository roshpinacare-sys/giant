// giant DEX · פקודות-לימיט אמת (server-only) — סוגרת-את-הפער-מול-הענקים
// ═══════════════════════════════════════════════════════════════════════
// הוראת-הבעלים (trace 1a13feac8b93b859): "בסוף צריך איחוד ומערכת אמיתית — אפליקציה ווב ממש
// ולא אתר · השוואות מול מוצרים אמיתיים". ליגת-הענקים מחזיקה פקודות-לימיט
// (Jupiter: trigger/OCO · Uniswap-v4: limit-order hooks) — עד-היום הדקס-שלנו
// ידע-רק-החלפת-שוק. מעכשיו: פקודות-לימיט אמת.
//
// חוקי-האמת (אותם-חוקים כמו כל-הסחר):
//  · נעילת-נזילות בלדג'ר: בהצבה — חובה-יתרה; הכסף עובר OWNER→ESCROW (רשומות-לדג'ר עם ref=orderId).
//  · התאמה מול הבריכה האמיתית בלבד (SAOS/USDS): quote מהרזרבות-החיות;
//    BUY מתמלא רק אם המחיר-האפקטיבי ≤ הלימיט · SELL רק אם ≥ הלימיט.
//  · ביצוע דרך executeSwap — מנוע-אמת-אחד (רזרבות→מחיר→עסקה→לדג'ר→נפח).
//  · ביטול = שחרור-העיקול בשלמותו. אפס-מספרים-מומצאים.

import { db } from "@/lib/db";
import type { TradeSide } from "@/lib/dex-types";
import { buildQuote, executeSwap } from "@/lib/dex-server";

const ESCROW = "ESCROW";
// סובלנות-השוואה (0.1%): מגינה-מתנודות-נקודה-צפה בלי-לפגוע-בכנות
const EPS = 0.001;

export interface OrderRow {
  id: string;
  pairId: string;
  side: TradeSide;
  limitPrice: number;
  amountIn: number;
  status: "OPEN" | "FILLED" | "CANCELLED";
  source: string;
  tradeId: string | null;
  fillPrice: number | null;
  fillOut: number | null;
  createdAt: string;
  closedAt: string | null;
}

function toRow(o: {
  id: string; pairId: string; side: string; limitPrice: number; amountIn: number;
  status: string; source: string; tradeId: string | null; fillPrice: number | null;
  fillOut: number | null; createdAt: Date; closedAt: Date | null;
}): OrderRow {
  return {
    id: o.id,
    pairId: o.pairId,
    side: o.side as TradeSide,
    limitPrice: o.limitPrice,
    amountIn: o.amountIn,
    status: o.status as OrderRow["status"],
    source: o.source,
    tradeId: o.tradeId,
    fillPrice: o.fillPrice,
    fillOut: o.fillOut,
    createdAt: o.createdAt.toISOString(),
    closedAt: o.closedAt?.toISOString() ?? null,
  };
}

/* ─────────────────────────── הצבת-פקודה ─────────────────────────── */

export interface PlaceOrderArgs {
  pairId: string;
  side: TradeSide;
  limitPrice: number;
  amountIn: number;
  account?: string; // OWNER (ברירת-מחדל) או FLEET:<agentId>
  source?: "USER" | "FLEET" | "API";
  agentId?: string;
}

export async function placeLimitOrder(
  args: PlaceOrderArgs,
): Promise<{ order: OrderRow; immediateFill: boolean } | { error: string; status: number }> {
  const account = args.account ?? "OWNER";
  if (!Number.isFinite(args.limitPrice) || args.limitPrice <= 0) {
    return { error: "מחיר-הלימיט חייב להיות חיובי", status: 400 };
  }
  if (!Number.isFinite(args.amountIn) || args.amountIn <= 0) {
    return { error: "סכום-הפקודה חייב להיות חיובי", status: 400 };
  }
  const pair = await db.dexPair.findUnique({ where: { id: args.pairId } });
  if (!pair) return { error: "זוג-לא-נמצא", status: 404 };
  if (!pair.isNative) {
    return { error: `${pair.base} הוא מדד-מחיר-חוץ (Binance) — פקודות-לימיט רק על הבריכה האמיתית SAOS/USDS`, status: 403 };
  }
  if (args.limitPrice <= 0 || !Number.isFinite(args.limitPrice)) {
    return { error: "מחיר-לימיט לא חוקי", status: 400 };
  }

  const tokenIn = args.side === "BUY" ? pair.quote : pair.base;
  const bal = await db.dexLedger.aggregate({
    _sum: { amount: true },
    where: { account, token: tokenIn },
  });
  const balance = bal._sum.amount ?? 0;
  if (balance < args.amountIn) {
    return {
      error: `אין-מספיק ${tokenIn} לנעילה (יש ${balance.toLocaleString("he-IL", { maximumFractionDigits: 2 })})`,
      status: 400,
    };
  }

  const order = await db.dexOrder.create({
    data: {
      pairId: pair.id,
      account,
      side: args.side,
      limitPrice: args.limitPrice,
      amountIn: args.amountIn,
      status: "OPEN",
      source: args.source ?? "USER",
      sourceAgent: args.source === "FLEET" ? (args.agentId ?? null) : null,
    },
  });

  // נעילת-הנזילות בלדג'ר — הכסף-באמת-נעול (לא-זמין-לשום-שימוש-אחר)
  await db.dexLedger.create({
    data: {
      account,
      token: tokenIn,
      amount: -args.amountIn,
      reason: `פקודת-לימיט ${args.side === "BUY" ? "קנייה" : "מכירה"} @ ${args.limitPrice.toLocaleString("he-IL", { maximumFractionDigits: 6 })} · נעילת-כספים`,
      ref: order.id,
    },
  });
  await db.dexLedger.create({
    data: {
      account: ESCROW,
      token: tokenIn,
      amount: args.amountIn,
      reason: `פקודת-לימיט · עיקול-נזילות (${args.side})`,
      ref: order.id,
    },
  });

  // ניסיון-התאמה-מיידי (פקודה-ניתנת-למילוי-עכשיו = מתמלאת-עכשיו, כמו בבורסה)
  const fill = await matchOrder(order.id);
  const fresh = await db.dexOrder.findUnique({ where: { id: order.id } });
  return {
    order: toRow(fresh ?? order),
    immediateFill: fill === "FILLED",
  };
}

/* ─────────────────────────── התאמה ─────────────────────────── */

type MatchResult = "FILLED" | "STILL_OPEN" | "NOT_FOUND" | "SKIP";

export async function matchOrder(orderId: string): Promise<MatchResult> {
  // תביעת-בעלות-אטומית: פקודה-אחת-נמדדת-פעם-אחת (מונע-מילוי-כפול בתחרות טיק/API)
  const claim = await db.dexOrder.updateMany({
    where: { id: orderId, status: "OPEN" },
    data: { status: "MATCHING" },
  });
  if (claim.count !== 1) return "SKIP";
  try {
    const order = await db.dexOrder.findUnique({ where: { id: orderId } });
    if (!order) return "NOT_FOUND";
    const pair = await db.dexPair.findUnique({ where: { id: order.pairId } });
    if (!pair || !pair.isNative) {
      await db.dexOrder.update({ where: { id: orderId }, data: { status: "OPEN" } });
      return "SKIP";
    }

    const side = order.side as TradeSide;
    const q = await buildQuote(pair.id, side, order.amountIn, 0);
    if ("error" in q) {
      await db.dexOrder.update({ where: { id: orderId }, data: { status: "OPEN" } });
      return "SKIP";
    }
    const eff = q.quote.effectivePrice;
    const good = side === "BUY" ? eff <= order.limitPrice * (1 + EPS) : eff >= order.limitPrice * (1 - EPS);
    if (!good) {
      await db.dexOrder.update({ where: { id: orderId }, data: { status: "OPEN" } });
      return "STILL_OPEN";
    }

    // ביצוע-אמת דרך מנוע-האמת-האחד — מהעיקול (ESCROW)
    const tokenIn = side === "BUY" ? pair.quote : pair.base;
    const tokenOut = side === "BUY" ? pair.base : pair.quote;
    const res = await executeSwap({
      pairId: pair.id,
      side,
      amountIn: order.amountIn,
      slippagePct: 0,
      /* שיוך-המקור-האמת: המילוי-יורש-את-שיוך-הפקודה (USER/FLEET/API) — אין-טיפוס-"ORDER" */
      source: order.source === "FLEET" || order.source === "API" ? order.source : "USER",
      account: ESCROW,
      agentId: order.sourceAgent ?? undefined,
    });
    if ("error" in res) {
      // כשל-ביצוע — מחזירים-את-הפקודה-לתור (כנות: לא משקרים "מולא")
      await db.dexOrder.update({ where: { id: orderId }, data: { status: "OPEN" } });
      return "STILL_OPEN";
    }

    // יישוב-העיקול: התוצרת עוברת מ-ESCROW לחשבון-המזמין (רשומות-לדג'ר מלאות)
    await db.dexLedger.create({
      data: { account: ESCROW, token: tokenOut, amount: -res.quote.outAmount, reason: "פקודת-לימיט מולאה · יישוב-העיקול", ref: order.id },
    });
    await db.dexLedger.create({
      data: {
        account: order.account,
        token: tokenOut,
        amount: res.quote.outAmount,
        reason: `פקודת-לימיט מולאה · קבלת ${tokenOut} @ ${res.quote.effectivePrice.toLocaleString("he-IL", { maximumFractionDigits: 6 })}`,
        ref: order.id,
      },
    });

    await db.dexOrder.update({
      where: { id: orderId },
      data: {
        status: "FILLED",
        tradeId: res.trade.id,
        fillPrice: res.quote.effectivePrice,
        fillOut: res.quote.outAmount,
        closedAt: new Date(),
      },
    });
    return "FILLED";
  } catch (err) {
    // כשל-לא-צפוי: הפקודה חוזרת-לתור — לא-נעלמת ולא-משקרת
    try {
      await db.dexOrder.updateMany({ where: { id: orderId, status: "MATCHING" }, data: { status: "OPEN" } });
    } catch { /* כנה — הטיקר הבא ינסה שוב */ }
    console.error("[dex-orders] match failed:", err);
    return "SKIP";
  }
}

/** התאמת-כל-הפקודות-הפתוחות — נקרא מהמתאים-הייעודי (כל-2ש׳ · גל-80) ואחרי-כל-הצבה */
export async function matchOpenOrders(): Promise<{ checked: number; filled: number }> {
  const open = await db.dexOrder.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  let filled = 0;
  for (const o of open) {
    const r = await matchOrder(o.id);
    if (r === "FILLED") filled++;
  }
  return { checked: open.length, filled };
}

/* ─────────────────────────── ביטול ─────────────────────────── */

export async function cancelLimitOrder(
  orderId: string,
  account: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  // תביעה-אטומית: רק-פקודה-פתוחה-של-החשבון-עצמו
  const claim = await db.dexOrder.updateMany({
    where: { id: orderId, status: "OPEN", account },
    data: { status: "CANCELLING" },
  });
  if (claim.count !== 1) {
    const exists = await db.dexOrder.findUnique({ where: { id: orderId } });
    if (!exists) return { error: "פקודה-לא-נמצאה", status: 404 };
    return { error: exists.account !== account ? "פקודה-של-חשבון-אחר" : "הפקודה כבר לא פתוחה", status: 409 };
  }
  try {
    const order = await db.dexOrder.findUnique({ where: { id: orderId } });
    if (!order) return { error: "פקודה-לא-נמצאה", status: 404 };
    const pair = await db.dexPair.findUnique({ where: { id: order.pairId } });
    const tokenIn = order.side === "BUY" ? (pair?.quote ?? "USDS") : (pair?.base ?? "SAOS");
    // שחרור-העיקול בשלמותו
    await db.dexLedger.create({
      data: { account: ESCROW, token: tokenIn, amount: -order.amountIn, reason: "פקודת-לימיט בוטלה · שחרור-עיקול", ref: order.id },
    });
    await db.dexLedger.create({
      data: { account: order.account, token: tokenIn, amount: order.amountIn, reason: "פקודת-לימיט בוטלה · החזרת-כספים-נעולים", ref: order.id },
    });
    await db.dexOrder.update({
      where: { id: orderId },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    await db.dexOrder.updateMany({ where: { id: orderId, status: "CANCELLING" }, data: { status: "OPEN" } });
    console.error("[dex-orders] cancel failed:", err);
    return { error: "נכשל-ביטול-הפקודה", status: 500 };
  }
}

/* ─────────────────────────── רישום ─────────────────────────── */

export async function listOrders(
  account: string | null,
  limit = 60,
): Promise<OrderRow[]> {
  const acc = account ? { account } : {};
  // פתוחות-ראשון (לפי-ישן→חדש — סדר-התור), ואז-סגורות-חדשות-ראשית
  const open = await db.dexOrder.findMany({
    where: { ...acc, status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const closed = await db.dexOrder.findMany({
    where: { ...acc, status: { in: ["FILLED", "CANCELLED"] } },
    orderBy: { closedAt: "desc" },
    take: limit,
  });
  return [...open, ...closed].map(toRow);
}
