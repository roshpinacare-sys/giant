// giant · צי-הסוכנים — אימות-אסימון-סוכן (backend only)
// האסימון הגולמי לעולם לא נשמר — רק SHA-256 נגזר. השוואה timing-safe.

import { createHash, timingSafeEqual } from "crypto";

export function fleetTokenHash(raw: string): string {
  return createHash("sha256").update(`giant-fleet-v1:${raw.trim()}`).digest("hex");
}

export function verifyFleetToken(raw: string, hash: string): boolean {
  if (!raw || !hash) return false;
  const a = Buffer.from(fleetTokenHash(raw));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// גבולות-ההקצאה — מדיניות-גלויה, אין-הסתרה:
export const FLEET_LIMITS = {
  minPerAgent: 10,
  maxPerAgent: 1_000,
  maxTotalFleet: 2_000, // ≤1% מהנפקת-הגנזיס של-USDS (200,000)
} as const;
