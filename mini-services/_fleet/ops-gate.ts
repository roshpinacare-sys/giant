/**
 * ops-gate — שער-המפעיל-הכושל-סגירה של-המיני-שירותים (directive 1a173c6ac120ccb1 §1).
 * ═════════════════════════════════════════════════════════════════════════════
 * תבנית-הבית (house pattern): saos-dex src/lib/operator-auth.ts (Task 69 / P0 25-a).
 *
 * חוקי-השער:
 *  · כל-מוטציה (POST) חייבת כותרת `x-saos-operator`.
 *  · מאומת ⟸ או טוקן-הסביבה של-השירות (envName), או הסכם-מפתח-האב (headcorner.txt —
 *    רק-דיגסט, המפתח-עצמו לעולם לא-נוגע/נרשם).
 *  · FAIL-CLOSED: אין-טוקן-בסביבה ואין-קובץ-הסכם → 503 לכל-מוטציה (השער-סגור).
 *  · השוואה timing-safe באמצעות sha256-דיגסטים באורך-קבוע (32B) — מונע-תזמון-ואורך.
 *  · GET/בריאות נשארים פתוחים — השקיפות היא-המוצר (תורת-הריבונות).
 *
 * שימוש בראש-כל-handler-מוטציה:
 *   import { opsGate } from "../_fleet/ops-gate.ts";
 *   const deny = opsGate(req, "MY_SERVICE_OPS_TOKEN");
 *   if (deny) return deny;
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

/** קובצי-הסכם-מפתח-האב — אותם-מועמדים כמו saos-control-center src/lib/master-key.ts. */
const MASTER_KEY_CANDIDATES = [
  "/home/z/.devgate/secrets/saos-keys/headcorner.txt",
  "/home/z/.secrets/master-key.txt",
  "/home/z/my-project/upload/headcorner.txt",
];

let masterDigestCache: Buffer | null | undefined;

/** sha256-דיגסט של-מפתח-האב, או null אם-אין-קובץ-הסכם (לעולם לא מחזיר/מרשים את-המפתח-עצמו). */
function masterDigest(): Buffer | null {
  if (masterDigestCache !== undefined) return masterDigestCache;
  masterDigestCache = null;
  for (const p of MASTER_KEY_CANDIDATES) {
    try {
      const raw = readFileSync(p, "utf8").trim();
      if (!raw) continue;
      masterDigestCache = createHash("sha256").update(raw, "utf8").digest();
      break;
    } catch {
      /* מועמד-חסר — המועמד-הבא */
    }
  }
  return masterDigestCache;
}

function deny(status: 401 | 503, error: string, note: string): Response {
  return Response.json({ ok: false, error, note }, { status });
}

/**
 * מחזיר null ⟸ מאומת — המשך. אחרת: Response-דחייה (fail-closed).
 * @param req     בקשת-המוטציה
 * @param envName שם-משתנה-הסביבה הנושא את-טוקן-המפעיל של-השירות
 */
export function opsGate(req: Request, envName = "FLEET_OPS_TOKEN"): Response | null {
  const provided = req.headers.get("x-saos-operator") ?? "";
  const expected = process.env[envName] ?? "";
  const md = masterDigest();
  const unconfigured = !expected && !md;

  if (!provided) {
    return unconfigured
      ? deny(503, "ops-gate-unconfigured",
          `${envName} לא-הוגדר בסביבה ואין-הסכם-מפתח-אב — פעולות-מוטציה נעולות (fail-closed). הגדר טוקן בן 32+ תווים ושלח כותרת x-saos-operator`)
      : deny(401, "ops-unauthorized",
          `פעולות-מוטציה מחייבות כותרת x-saos-operator (טוקן ${envName} או מפתח-האב)`);
  }

  // הסכם-מפתח-האב (Task 69): מפתח-אחד — headcorner — פותח את-כל-שערי-הצי.
  if (md) {
    const a = createHash("sha256").update(provided, "utf8").digest();
    if (timingSafeEqual(a, md)) return null;
  }
  // טוקן-הסביבה של-השירות.
  if (expected) {
    const a = createHash("sha256").update(provided, "utf8").digest();
    const b = createHash("sha256").update(expected, "utf8").digest();
    if (timingSafeEqual(a, b)) return null;
  }
  return deny(401, "ops-unauthorized",
    `פעולות-מוטציה מחייבות כותרת x-saos-operator (טוקן ${envName} או מפתח-האב)`);
}
