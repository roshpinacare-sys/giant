import path from "path";

/* ═══ SAOS-נתיבים · ניידות (branch ops/a1-giant-portable-paths) ═══
 * בעבר: נתיבי-מכונה מוקשים (/home/z/...) בכל-רחבי הקוד — המערכת חייבת-מכונה-אחת
 * ומתה-איתה. עתה: כל-שורש נגזר מהסביבה; ברירות-המחדל זהות למקור — אפס-שינוי-
 * התנהגות על-המארח הקיים, וריצה-מלאה בכל-מכונה אחרת עם המשתנים המתאימים.
 *   SAOS_HOME          — בית-המערכת (ברירת-מחדל: /home/z)
 *   SAOS_PROJECT_ROOT  — מיזוג-המצב-החי (ברירת-מחדל: $SAOS_HOME/my-project)
 *   SAOS_ESTATE        — האחוזה (ברירת-מחדל: $SAOS_HOME/estate)
 *   SAOS_LANE          — נתיב-הסוכנים (ברירת-מחדל: $SAOS_HOME/lane)
 *   SAOS_CHANNELS      — הערוצים (ברירת-מחדל: $SAOS_HOME/channels)
 *   SAOS_AUTONOMY      — ספר-החוקים (ברירת-מחדל: $SAOS_HOME/autonomy-fix)
 * ============================================================================== */

function fromEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? path.resolve(v.trim()) : fallback;
}

export const SAOS_HOME = fromEnv("SAOS_HOME", "/home/z");
export const SAOS_PROJECT_ROOT = fromEnv("SAOS_PROJECT_ROOT", path.join(SAOS_HOME, "my-project"));
export const SAOS_ESTATE = fromEnv("SAOS_ESTATE", path.join(SAOS_HOME, "estate"));
export const SAOS_LANE = fromEnv("SAOS_LANE", path.join(SAOS_HOME, "lane"));
export const SAOS_CHANNELS = fromEnv("SAOS_CHANNELS", path.join(SAOS_HOME, "channels"));
export const SAOS_AUTONOMY = fromEnv("SAOS_AUTONOMY", path.join(SAOS_HOME, "autonomy-fix"));
