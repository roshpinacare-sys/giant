/**
 * swallow-guard.ts — ליבת-מגן-הבליעות של giant (§8 deadlock-break · wave 19.83).
 * ═════════════════════════════════════════════════════════════════════════════
 * המחלקה-שנמדדה-חיה: סינכרון-ours-merge בולע-קבצי-קנון מ-main (היום בלבד:
 * identity-guard.yml/swallow-watch.yml נבלעו-פעמיים · empire-registry נבלע-וחולץ
 * ב-6c4bae6). "המטוס-המתוזמן-מת" — נוכחות-קובץ בלי-צופה-חי אינה-הגנה.
 *
 * חוקי-המגן:
 *  1. קנון-מוכרז: קבוצת-הנתיבים-הקנוניים היא-מפורשת-וקפואה; היעדרות-ב-tip
 *     = בליעה-מוכחת (SWALLOWED-PATH).
 *  2. התראה-בלבד על-שינוי-תוכן (CONTENT-DRIFT-ALERT): המגן-אינו-נלחם
 *     באבולוציה-לגיטימית — הוא-מדווח; רק-היעדרות-מתורגמת-לפעולה.
 *  3. fail-closed בשחזור: תוכנית-השחזור משחזרת-רק-מ-blob-מאומץ-ידוע;
 *     בלי-מקור — זריקה. אף-פיקסל-לא-נוצר-על-ידי-המגן.
 *  4. קבלות-hash-linked {prevHash, hash, SHA-256} — אותו-דפוס-של
 *     economy-signed-receipts ו-dispatch-receipts (שפת-הלהקה-האחת).
 *  5. דטרמיניזם מלא: אפס-שעון-פנימי (הזמן-קלט-מהקורא), אפס-RNG, אפס-רשת.
 *     אפס-תלויות-חוץ-מעבר ל-node:crypto (§11: פרימיטיבים-קיימים-בלבד).
 */
import { createHash } from "node:crypto";

/** קבוצת-הקנון (v1) — הנתיבים-שהיעדרותם-בליעה-מוכחת. קפוא. */
export const CANONICAL_SET: readonly string[] = Object.freeze([
  "src/lib/giant/empire-registry.ts",
  "src/lib/giant/empire-registry.test.ts",
  "src/lib/giant/empire-map.ts",
  "src/lib/giant/doors.ts",
  "src/lib/dispatch/doors.ts",
  "src/lib/dispatch/receipts.ts",
  "src/lib/dispatch/redact.ts",
  ".github/workflows/identity-guard.yml",
  ".github/workflows/swallow-watch.yml",
  ".github/workflows/trust-heartbeat.yml",
  ".github/workflows/ext-audit.yml",
  "SWARM_STATE.md",
]);

export interface Swallow {
  readonly path: string;
  readonly code: "SWALLOWED-PATH";
}

export interface ContentAlert {
  readonly path: string;
  readonly code: "CONTENT-DRIFT-ALERT";
  readonly foundSha: string;
}

export interface RescueAction {
  readonly path: string;
  readonly action: "restore";
  readonly from: string;
}

export interface GuardReceipt {
  readonly prevHash: string | null;
  readonly hash: string;
  readonly at: string;
  readonly payload: unknown;
}

/** מדידת-ה-tip: היעדרות = בליעה · שינוי-תוכן-מול-baseline-מוצהר = התראה-בלבד.
 *  baseline אופציונלי: בליו — רק-בליעות (אסור-להמציא-דריפט-בלי-baseline-מוצהר).
 *  טהור-וקפוא-בפלט. */
export function detectSwallows(
  tree: Readonly<Record<string, string>>,
  baseline?: Readonly<Record<string, string>>,
): { swallows: readonly Swallow[]; alerts: readonly ContentAlert[] } {
  const swallows: Swallow[] = [];
  const alerts: ContentAlert[] = [];
  for (const p of CANONICAL_SET) {
    const found = tree[p];
    // חוזה-המדידה-המתוקן (נתפס-חי 16:32Z): "" הוא-היעדרות-מוכחת — measure_tip
    // ההיסטורי הזרים "" לנעדר; הליבה-מקבלת-שתי-צורות-היעדרות (undefined או "")
    // ומסווגת-שתיהן SWALLOWED-PATH — לעולם-לא-דריפט-תוכן.
    if (found === undefined || found === "") {
      swallows.push({ path: p, code: "SWALLOWED-PATH" });
    } else if (baseline !== undefined) {
      const base = baseline[p];
      if (base !== undefined && found !== base) {
        alerts.push({ path: p, code: "CONTENT-DRIFT-ALERT", foundSha: found });
      }
    }
    // null/חסר-ב-baseline = לא-ממציאים — קיים-בלי-שיפוט-תוכן
  }
  return { swallows: Object.freeze(swallows), alerts: Object.freeze(alerts) };
}

/** תוכנית-שחזור fail-closed — רק-מ-blob-מאומץ; בלי-מקור: זריקה (אסור-להמציא). */
export function rescuePlan(
  swallows: readonly Swallow[],
  adopted: Readonly<Record<string, string>>,
): readonly RescueAction[] {
  return Object.freeze(
    swallows.map((s) => {
      const from = adopted[s.path];
      if (from === undefined) {
        throw new Error(`אין-מקור-מאומץ עבור ${s.path} — המגן אינו ממציא תוכן (fail-closed)`);
      }
      return { path: s.path, action: "restore" as const, from };
    }),
  );
}

/** קבלה-חתומה-hash-linked: hash = SHA-256(prevHash ‖ at ‖ payload-canonical). */
export function guardReceipt(
  prevHash: string | null,
  payload: unknown,
  at: string,
): GuardReceipt {
  const canonical = JSON.stringify({ prevHash, at, payload });
  const hash = createHash("sha256").update(canonical).digest("hex");
  return { prevHash, hash, at, payload };
}

/** אימות-שרשרת fail-closed: כל-קבלה חותמת את קודמתה. זיוף → brokenAt מדויק. */
export function verifyReceiptChain(
  receipts: readonly GuardReceipt[],
): { ok: boolean; verified: number; brokenAt?: number; reason?: string } {
  let prev: string | null = null;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const expected = createHash("sha256")
      .update(JSON.stringify({ prevHash: r.prevHash, at: r.at, payload: r.payload }))
      .digest("hex");
    if (r.prevHash !== prev) {
      return { ok: false, verified: i, brokenAt: i, reason: "chain-link-mismatch: prevHash אינו תואם את הקודמת" };
    }
    if (r.hash !== expected) {
      return { ok: false, verified: i, brokenAt: i, reason: "hash-mismatch: הפיילוד זויף או חושב-מחדש בלי-חתימה" };
    }
    prev = r.hash;
  }
  return { ok: true, verified: receipts.length };
}
