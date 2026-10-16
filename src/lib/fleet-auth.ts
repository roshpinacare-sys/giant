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

// גבולות-ההקצאה — מדיניות-גלויה, אין-הסתרה.
// גל-82 (הוראת-הבעלים "מקדמים-הכל-עכשיו" + השסתום-המוצהר בגל-80):
// התדירות-קיימת-אך-ההון-חנוק — הצי עבד-על 278-USDS-בלבד מול-טרזור-של-29,400.
// תקרת-הצי 2,000→20,000 = 10% מהנפקת-הגנזיס (200,000) — עדיין-רחוק-מלוויתן,
// מתועד-פומבית, וההקצאות-עצמן-נשארות-תנועות-לדג'ר-כפולות-מתועדות.
export const FLEET_LIMITS = {
  minPerAgent: 10,
  maxPerAgent: 3_000,
  maxTotalFleet: 20_000, // ≤10% מהנפקת-הגנזיס של-USDS (200,000)
} as const;

// תקרת-פקודה-לסוכן-פנים (שוק-ולימיט כאחד, בשקלול-USDS) — אותו-משמעת-כמו-הלולאה:
// לקוח-קמעונאי-אמיתי, לא-לוויתן. גל-62 · דוקטרינת-משתמשי-הפנים · גל-82: הוכפל.
export const FLEET_ORDER_USDS_CAP = 24;
