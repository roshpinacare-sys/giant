// /api/dex/orders · פקודות-לימיט אמת על בריכת-האמת SAOS/USDS
// GET    — רשימת-הפקודות (פתוחות-ראשון) + מחיר-חי · קריאה-פתוחה (נתוני-שוק)
//          + אם-נשלח-מפתח-API תקף — myOrders+myBalances שלו (גשר-הנזילות-החוץ)
// POST   — הצבת-פקודה {pairId, side, limitPrice, amountIn} · סולם-אימות:
//          בעלים (headcorner) → חשבון-OWNER · מפתח-API תקף → חשבון-API:<prefix>
//          (סוחר-אך-ורק-עם-הכסף-שהופקד-לו — אפס-טביעה) → אחרת 401
// DELETE — ביטול {id} עם שחרור-העיקול בשלמותו · סולם-זהה — מפתח-חוץ-מבטל-רק-שלו
// התאמה: בטיקר-המנוע (8 שניות) + מיידית-אם-הפקודה-ניתנת-למילוי-עכשיו.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/dex-engine";
import { cancelLimitOrder, listOrders, placeLimitOrder } from "@/lib/dex-orders";
import { isOwnerReq } from "@/lib/sovereign-auth";
import { authenticateApiKey, extractRawKey } from "@/lib/public-api";
import { accountBalance } from "@/lib/dex-server";
import type { TradeSide } from "@/lib/dex-types";

export const dynamic = "force-dynamic";

/** סולם-האימות: בעלים → מפתח-API → אנונימי. מחזיר-את-החשבון-שממנו-ינוע-כסף. */
async function resolveTradeAccount(
  req: NextRequest,
): Promise<
  | { ok: true; account: string; via: "OWNER" | "API"; rateHeaders?: Record<string, string>; keyPrefix?: string }
  | { ok: false; status: number; error: string; rateHeaders?: Record<string, string> }
> {
  if (await isOwnerReq(req)) {
    return { ok: true, account: "OWNER", via: "OWNER" };
  }
  if (extractRawKey(req)) {
    const auth = await authenticateApiKey(req);
    if (!auth.ok) {
      return { ok: false, status: auth.status, error: auth.error, rateHeaders: auth.rateHeaders };
    }
    return { ok: true, account: auth.key.account, via: "API", rateHeaders: auth.rateHeaders, keyPrefix: auth.key.prefix };
  }
  return { ok: false, status: 401, error: "נדרש-אימות — headcorner (בעלים) או מפתח-API (X-API-Key / Bearer)" };
}

export async function GET(req: NextRequest) {
  try {
    await ensureEngine();
    // הוראת-הבעלים "הכל נזיל": כל-הבריכות-הילידות נסחרות מהדוכן —
    // ?pairId=... בוחר-שוק; בלי-בחירה — בריכת-הבסיס (SAOS/USDS).
    const [orders, nativePairs] = await Promise.all([
      listOrders(null),
      db.dexPair.findMany({
        where: { isNative: true, reserveBase: { gt: 0 }, reserveQuote: { gt: 0 } },
        orderBy: { sort: "asc" },
      }),
    ]);
    const wanted = req.nextUrl.searchParams.get("pairId");
    const pair =
      (wanted ? nativePairs.find((p) => p.id === wanted) : undefined) ??
      nativePairs.find((p) => p.base === "SAOS") ??
      nativePairs[0] ??
      null;
    // גשר-חוץ: מפתח-API שנשלח — רואה-את-הפקודות-והיתרות-שלו-בלבד (מעבר-לקריאה-הציבורית)
    let my: Record<string, unknown> = {};
    let rateHeaders: Record<string, string> = {};
    if (extractRawKey(req)) {
      const auth = await authenticateApiKey(req);
      if (auth.ok) {
        rateHeaders = auth.rateHeaders ?? {};
        const [myOrders, usds, saos] = await Promise.all([
          listOrders(auth.key.account),
          accountBalance(auth.key.account, "USDS"),
          accountBalance(auth.key.account, "SAOS"),
        ]);
        my = {
          myAccount: auth.key.account,
          myLabel: auth.key.label,
          myOrders,
          myBalances: { USDS: usds, SAOS: saos },
        };
      } else {
        // קריאה-ציבורית-לא-נשברת — אך-הכישלון-כנה-ובכותרות-המדידה (429/401)
        my = { keyError: auth.error, keyStatus: auth.status };
        rateHeaders = auth.rateHeaders ?? {};
      }
    }
    return NextResponse.json(
      {
        ok: true,
        orders,
        markets: nativePairs.map((p) => ({ pairId: p.id, base: p.base, quote: p.quote, price: p.price, chain: p.chain })),
        market: pair ? { pairId: pair.id, base: pair.base, quote: pair.quote, price: pair.price } : null,
        ...my,
      },
      { headers: { "cache-control": "no-store", ...rateHeaders } },
    );
  } catch (err) {
    console.error("[api/dex/orders GET]", err);
    return NextResponse.json({ ok: false, error: "כשל-רישום-הפקודות" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await resolveTradeAccount(req);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, authRequired: true },
        { status: gate.status, headers: gate.rateHeaders },
      );
    }
    await ensureEngine();
    const body = (await req.json()) as {
      pairId?: string;
      side?: string;
      limitPrice?: number;
      amountIn?: number;
    };
    if (!body.pairId || (body.side !== "BUY" && body.side !== "SELL")) {
      return NextResponse.json({ error: "פרמטרים-חסרים (pairId/side)" }, { status: 400, headers: gate.rateHeaders });
    }
    const res = await placeLimitOrder({
      pairId: body.pairId,
      side: body.side as TradeSide,
      limitPrice: Number(body.limitPrice),
      amountIn: Number(body.amountIn),
      account: gate.account,
      source: gate.via === "API" ? "API" : "USER",
    });
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res, { headers: gate.rateHeaders });
  } catch (err) {
    console.error("[api/dex/orders POST]", err);
    return NextResponse.json({ error: "כשל-הצבת-הפקודה" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const gate = await resolveTradeAccount(req);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, authRequired: true },
        { status: gate.status, headers: gate.rateHeaders },
      );
    }
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "חסר-id-הפקודה" }, { status: 400 });
    const res = await cancelLimitOrder(body.id, gate.account);
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true }, { headers: gate.rateHeaders });
  } catch (err) {
    console.error("[api/dex/orders DELETE]", err);
    return NextResponse.json({ error: "כשל-ביטול-הפקודה" }, { status: 500 });
  }
}
