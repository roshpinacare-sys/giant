/**
 * pat.ts — מקור-ה-PAT של-הצי (שרת-בלבד) · fail-honest (T63-a מיזוג-הענק-האח).
 * שרשרת-המקורות: GITHUB_PAT → GITHUB_TOKEN → טוקן-התקנת-ה-App מ-.git/config
 * של-העותק-הקנוני (/home/z/estate/giant) — העותק-הקנוני נושא את טוקן-התקנת
 * הארגון, ולכן הוא המקור-החי-היחיד במכונה (ה-env כאן ריק).
 * חוק-אמון: הערך לעולם לא נרשם-בלוג, לא נכלל-בשגיאה ולא חוזר-ללקוח —
 * משמש-רק ככותרת-authorization בקריאות-שרת. כשל = null (כנה, אפס-המצאה).
 */
import { readFileSync } from "node:fs";

export function readPat(): string | null {
  const env = process.env.GITHUB_PAT ?? process.env.GITHUB_TOKEN;
  if (env !== undefined && env.length > 0) return env;
  try {
    const cfg = readFileSync("/home/z/estate/giant/.git/config", "utf8");
    for (const line of cfg.split("\n")) {
      if (!line.includes("x-access-token:")) continue;
      const m = /x-access-token:([^@\s]+)@/.exec(line);
      if (m?.[1] && m[1].length > 0) return m[1];
    }
  } catch {
    /* אין-קובץ/אין-הרשאה — null כנה; הקוראים מדווחים "PAT לא זמין" */
  }
  return null;
}
