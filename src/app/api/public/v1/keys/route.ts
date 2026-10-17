/**
 * /api/public/v1/keys — הצטרפות-עצמית לחוץ (גל-76 · סוגר-את-חסם-external-users)
 * ═══════════════════════════════════════════════════════════════════════════
 * חוק-האמת: עד-היום הנפקת-מפתח דרשה-את-הבעלים (שער-headcorner) — זהו-חסם-אנושי.
 * מ-עכשיו: כל-גורם-חוץ מנפיק-לעצמו-מפתח בכמה-כללי-בטיחות-מדודים:
 *  · POST   — הנפקה-עצמית: ללא-אימות · חשבון-חדש = אפס-יתרה (אפס-סיכון, אפס-טביעה)
 *             · מגבלה-פר-IP: 5/שעה (מטמון-תהליך — כנה: לא-משותף-בין-מופעים)
 *             · תקרה-גלובלית: 400 מפתחות-עצמיים-פעילים (מונע-הצפת-DB)
 *             · ratePerMin קבוע 60 — אין-הרשאות-מיוחדות לאנונימי
 *  · GET    — בלי-מפתח: מידע-ציבורי (תפוסה · חוקים) · עם-מפתח: מצב-המפתח-שלי
 *  · DELETE — ביטול-עצמי: המפתח-הורג-את-עצמו (Bearer/X-API-Key) — בלי-בעלים
 * הכסף: החשבון-נולד-אפס; ההפקדה-אליו עוברת-על-מסילת-ההפקדות-המבוקרת בלבד.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey, generateRawKey, DEFAULT_RATE_PER_MIN } from "@/lib/public-api";
import { ensureEngine } from "@/lib/dex-engine";

export const dynamic = "force-dynamic";

const SELF_KEYS_PER_IP_PER_HOUR = 5;
const MAX_ACTIVE_SELF_KEYS = 400;
const SELF_KEY_RATE = Math.min(60, DEFAULT_RATE_PER_MIN); // אנונימי-לא-מקבל-יותר-מברירת-המחדל

/* מטמון-תהליך-מקומי (כנה: לא-משותף-בין-מופעים · מתועד-בקוד) */
const ipWindow = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) || "local";
}

function sanitizeLabel(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return cleaned || "external";
}

export async function GET(req: NextRequest) {
  // עם-מפתח → מצב-עצמי; בלי → מידע-ציבורי (הדלת-החיה-של-ההצטרפות)
  if (req.headers.get("authorization") || req.headers.get("x-api-key")) {
    const auth = await authenticateApiKey(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { ...auth.rateHeaders, "cache-control": "no-store" } });
    }
    try {
      await ensureEngine();
      const [row, agg, openOrders] = await Promise.all([
        db.dexApiKey.findUnique({ where: { id: auth.key.id } }),
        db.dexLedger.groupBy({
          by: ["token"],
          _sum: { amount: true },
          where: { account: auth.key.account },
        }),
        db.dexOrder.count({ where: { account: auth.key.account, status: "OPEN" } }),
      ]);
      if (!row) return NextResponse.json({ ok: false, error: "מפתח-לא-נמצא" }, { status: 404 });
      return NextResponse.json(
        {
          ok: true,
          key: {
            prefix: row.prefix,
            label: row.label,
            account: row.account,
            ratePerMin: row.ratePerMin,
            requestCount: row.requestCount,
            lastUsedAt: row.lastUsedAt,
            revoked: row.revokedAt !== null,
            createdAt: row.createdAt,
          },
          balances: agg.map((r) => ({ token: r.token, balance: r._sum.amount ?? 0 })),
          openOrders,
        },
        { headers: { ...auth.rateHeaders, "cache-control": "no-store" } },
      );
    } catch (err) {
      console.error("[api/public/v1/keys GET self]", err);
      return NextResponse.json({ ok: false, error: "כשל-מדידת-מצב-המפתח" }, { status: 500 });
    }
  }
  try {
    const active = await db.dexApiKey.count({ where: { revokedAt: null } });
    return NextResponse.json(
      {
        ok: true,
        service: "self-service-keys/1",
        activeKeys: active,
        capacity: MAX_ACTIVE_SELF_KEYS,
        open: active < MAX_ACTIVE_SELF_KEYS,
        perIpPerHour: SELF_KEYS_PER_IP_PER_HOUR,
        ratePerMin: SELF_KEY_RATE,
        law: "חשבון-חדש-נולד-אפס · סוחר-רק-מהכסף-שהופקד-לו · ביטול-עצמי-בלי-בעלים",
        docs: "/join",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/public/v1/keys GET public]", err);
    return NextResponse.json({ ok: false, error: "כשל-מדידת-תפוסה" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const w = ipWindow.get(ip);
  if (!w || w.resetAt <= now) {
    ipWindow.set(ip, { count: 1, resetAt: now + 3_600_000 });
  } else {
    w.count += 1;
    if (w.count > SELF_KEYS_PER_IP_PER_HOUR) {
      return NextResponse.json(
        { ok: false, error: `יותר-מדי-הנפקות-מכתובת-זו (${SELF_KEYS_PER_IP_PER_HOUR}/שעה) — נסה-שוב-מאוחר` },
        { status: 429, headers: { "retry-after": String(Math.ceil((w.resetAt - now) / 1000)), "cache-control": "no-store" } },
      );
    }
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { label?: string };
    const label = sanitizeLabel(body.label);
    const active = await db.dexApiKey.count({ where: { revokedAt: null } });
    if (active >= MAX_ACTIVE_SELF_KEYS) {
      return NextResponse.json(
        { ok: false, error: `התפוסה-מלאה (${active}/${MAX_ACTIVE_SELF_KEYS} מפתחות-פעילים) — פנה-לבעלים-להרחבה` },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    const { raw, hash, prefix } = generateRawKey();
    const row = await db.dexApiKey.create({
      data: {
        keyHash: hash,
        prefix,
        label,
        account: `API:${prefix}`,
        ratePerMin: SELF_KEY_RATE,
      },
    });
    return NextResponse.json(
      {
        ok: true,
        key: {
          id: row.id,
          prefix: row.prefix,
          label: row.label,
          account: row.account,
          ratePerMin: row.ratePerMin,
          createdAt: row.createdAt,
        },
        plaintext: raw,
        warning: "זו-הפעם-היחידה-שהמפתח-הגולמי-מוצג — שמור-אותו-עכשיו",
        next: "בדוק-עצמך: GET /api/public/v1/account עם המפתח · הפקדה-דרך-מסילת-ההפקדות · מסחר-מאומת",
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/public/v1/keys POST]", err);
    return NextResponse.json({ ok: false, error: "ההנפקה-נכשלה" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { ...auth.rateHeaders, "cache-control": "no-store" } });
  }
  try {
    const row = await db.dexApiKey.findUnique({ where: { id: auth.key.id } });
    if (!row) return NextResponse.json({ ok: false, error: "מפתח-לא-נמצא" }, { status: 404 });
    if (row.revokedAt) return NextResponse.json({ ok: true, note: "כבר-בוטל", revoked: row.prefix });
    await db.dexApiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true, revoked: row.prefix, note: "המפתח-מת-מיד — כל-הפקודות-הפתוחות-שלו-נשארות-בלדג'ר-לביקורת" });
  } catch (err) {
    console.error("[api/public/v1/keys DELETE]", err);
    return NextResponse.json({ ok: false, error: "הביטול-נכשל" }, { status: 500 });
  }
}
