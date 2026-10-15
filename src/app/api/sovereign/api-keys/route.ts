/**
 * /api/sovereign/api-keys — ניהול-מפתחות-API-ציבוריים · שער-בעלים-בלבד
 *  GET    — רשימת-המפתחות (prefix · label · שימוש · מצב) — לעולם-בלי-hash ובלי-גולמי
 *  POST   — הנפקה {label, ratePerMin?} — מחזיר-את-הגולמי-פעם-אחת-ולעולם-לא-שוב
 *  DELETE — ביטול {id} — המפתח-מפסיק-לעבוד-מיד
 * חוק: הכסף-של-מפתח-הוא-החשבון-שלו (API:<prefix>) — ההנפקה-לא-מזיזה-שקל-מאף-ארנק.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isOwnerReq } from "@/lib/sovereign-auth";
import { generateRawKey, DEFAULT_RATE_PER_MIN } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json({ error: "ניהול-מפתחות-API — דורש-אימות-headcorner", authRequired: true }, { status: 401 });
  }
  const rows = await db.dexApiKey.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(
    {
      ok: true,
      keys: rows.map((r) => ({
        id: r.id,
        prefix: r.prefix,
        label: r.label,
        account: r.account,
        ratePerMin: r.ratePerMin,
        requestCount: r.requestCount,
        lastUsedAt: r.lastUsedAt,
        revoked: r.revokedAt !== null,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json({ error: "הנפקת-מפתח-API — דורש-אימות-headcorner", authRequired: true }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { label?: string; ratePerMin?: number };
  const label = (body.label ?? "").trim();
  if (!label) {
    return NextResponse.json({ error: "חסר-label — למי-המפתח?" }, { status: 400 });
  }
  const ratePerMin = Math.min(600, Math.max(1, Number(body.ratePerMin ?? DEFAULT_RATE_PER_MIN)));
  const { raw, hash, prefix } = generateRawKey();
  const row = await db.dexApiKey.create({
    data: {
      keyHash: hash,
      prefix,
      label,
      account: `API:${prefix}`,
      ratePerMin,
    },
  });
  // הגולמי-מוחזר-כאן-ורק-כאן — בשרת-נשמר-ה-hash-בלבד
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
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(req: NextRequest) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json({ error: "ביטול-מפתח-API — דורש-אימות-headcorner", authRequired: true }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "חסר-id-המפתח" }, { status: 400 });
  const row = await db.dexApiKey.findUnique({ where: { id: body.id } });
  if (!row) return NextResponse.json({ error: "מפתח-לא-נמצא" }, { status: 404 });
  if (row.revokedAt) return NextResponse.json({ ok: true, note: "כבר-בוטל" });
  await db.dexApiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true, revoked: row.prefix });
}
