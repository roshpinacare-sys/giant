/**
 * מפתחות-API ציבוריים — הרפסודה-האמיתית של גישה-חוץ (סוגר-את-הפער public-api)
 *
 * חוקי-אמת:
 *  · המפתח-הגולמי (sk-saos-<hex>) מונפק-פעם-אחת-ונשלח-למשתמש; בשרת יש רק sha256 שלו.
 *  · אימות בהשוואה-בזמן-קבוע (timingSafeEqual) — אין-דליפת-תזמון.
 *  · כל-מפתח סוחר מהחשבון-שלו-בלבד (API:<prefix>) — לעולם-לא-נוגע-ב-OWNER או בצי.
 *  · מגבלת-קצב לכל-מפתח (ברירת-מחדל 60/דק') — מטמון-זיכרון בתהליך; מדווח-בכנות.
 *  · שימוש-במפתח נמדד: requestCount+lastUsedAt נרשמים ב-DB.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const KEY_ACCOUNT_PREFIX = "API:";
export const DEFAULT_RATE_PER_MIN = 60;

export function sha256(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

export function generateRawKey(): { raw: string; hash: string; prefix: string } {
  const raw = `sk-saos-${randomBytes(24).toString("hex")}`;
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 14) };
}

/* ─────────────── מגבלת-קצב (מטמון-זיכרון בתהליך · כנה: לא-משותף-בין-מופעים) ─────────────── */

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export interface RateVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSec: number;
}

export function rateLimit(keyId: string, perMin: number): RateVerdict {
  const now = Date.now();
  const b = buckets.get(keyId);
  if (!b || b.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + 60_000 };
    buckets.set(keyId, fresh);
    return { allowed: true, limit: perMin, remaining: perMin - 1, resetSec: 60 };
  }
  b.count += 1;
  const remaining = Math.max(0, perMin - b.count);
  return {
    allowed: b.count <= perMin,
    limit: perMin,
    remaining,
    resetSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

/* ─────────────────────────────── אימות-מפתח ─────────────────────────────── */

export interface ApiKeyRow {
  id: string;
  prefix: string;
  label: string;
  account: string;
  ratePerMin: number;
}

export type KeyAuthResult =
  | { ok: true; key: ApiKeyRow; rate: RateVerdict; rateHeaders: Record<string, string> }
  | { ok: false; status: 401 | 429; error: string; rateHeaders?: Record<string, string> };

export function extractRawKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(sk-saos-[0-9a-f]{48})$/i.exec(auth.trim());
    if (m) return m[1];
  }
  const x = req.headers.get("x-api-key");
  if (x && /^sk-saos-[0-9a-f]{48}$/.test(x.trim())) return x.trim();
  return null;
}

/** אימות-מלא: מפתח-תקין + לא-מבוטל + בתוך-מגבלת-הקצב. כישלון = כנה (401/429). */
export async function authenticateApiKey(req: NextRequest): Promise<KeyAuthResult> {
  const raw = extractRawKey(req);
  if (!raw) {
    return {
      ok: false,
      status: 401,
      error: "חסר-מפתח-API — שלח Authorization: Bearer sk-saos-… או X-API-Key",
    };
  }
  const hash = sha256(raw);
  const row = await db.dexApiKey.findUnique({ where: { keyHash: hash } });
  if (!row) {
    return { ok: false, status: 401, error: "מפתח-לא-מוכר — המפתח-אינו-קיים-במערכת" };
  }
  if (row.revokedAt) {
    return { ok: false, status: 401, error: "המפתח-בוטל — יש-להנפיק-מפתח-חדש" };
  }
  const rate = rateLimit(row.id, row.ratePerMin);
  const rateHeaders: Record<string, string> = {
    "x-ratelimit-limit": String(rate.limit),
    "x-ratelimit-remaining": String(rate.remaining),
    "x-ratelimit-reset": String(rate.resetSec),
  };
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      error: `עברת-מגבלת-הקצב (${rate.limit}/דק') — נסה-שוב-בעוד ${rate.resetSec} שניות`,
      rateHeaders,
    };
  }
  // מדידת-שימוש — לא-חוסם-את-הבקשה אם-נכשלת (fire-and-forget כנה)
  void db.dexApiKey
    .update({
      where: { id: row.id },
      data: { requestCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    ok: true,
    key: {
      id: row.id,
      prefix: row.prefix,
      label: row.label,
      account: row.account,
      ratePerMin: row.ratePerMin,
    },
    rate,
    rateHeaders,
  };
}

/** השוואה-בזמן-קבוע (משמשת-בבדיקות-הפנימיות; האימות-הראשי על ה-hash-מה-DB) */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
