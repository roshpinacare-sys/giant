/**
 * אימות-ריבוני (T74 · הצי-הוא-הלקוח-הראשון)
 *
 * אפס-תלות-חוץ: scrypt + sha256 + randomBytes — הכל מ-node:crypto של-הריבונות-עצמה.
 *  · סיסמאות: scrypt(64B) + salt אקראי לכל-משתמש, פורמט s1:salt:hash
 *  · סשנים: טוקן-אקראי-32B בקוקי-HttpOnly; בבסיס רק-sha256(טוקן) — דליפת-בסיס לא מזהיבה-טוקנים
 *  · תוקף-סשן: 30 יום; השוואה-בזמן-קבוע (timingSafeEqual) בכל-שלב
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "giant_session";
const SESSION_DAYS = 30;

/* ═══ סיסמאות ═══ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `s1:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "s1") return false;
  const [, salt, hash] = parts;
  try {
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ═══ סשנים ═══ */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  return { token, expiresAt };
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  crewId: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/* המשתמש-הנוכחי-מהקוקי — null כנה כשאין-סשן/פג-תוקף */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = await db.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    const { user } = session;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      crewId: user.crewId,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  } catch {
    return null; /* fail-honest — אין-משתמש-מזויף */
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => undefined);
  }
}

export const sessionCookieOptions = (expiresAt: Date) =>
  ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false, /* sandbox-מקומי; בפריסה-חוץ יועבר-ל-secure:true */
    path: "/",
    expires: expiresAt,
  }) as const;

/* ═══ רישום-הצי: אימות-crewId מול-הרישום-החי ═══ */

let crewCache: { at: number; ids: Set<string> } | null = null;
const CREW_CACHE_MS = 5 * 60_000;

export async function crewIdExists(crewId: string): Promise<boolean | null> {
  try {
    if (crewCache && Date.now() - crewCache.at < CREW_CACHE_MS) return crewCache.ids.has(crewId);
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile("/home/z/estate/Domain/agents/registry.json", "utf8");
    const reg = JSON.parse(raw) as { agents?: { id?: string }[] };
    const ids = new Set((reg.agents ?? []).map((a) => a.id).filter((v): v is string => typeof v === "string"));
    crewCache = { at: Date.now(), ids };
    return ids.has(crewId);
  } catch {
    return null; /* הרישום-לא-נקרא — כנה, לא-false-מזויף */
  }
}

export const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
