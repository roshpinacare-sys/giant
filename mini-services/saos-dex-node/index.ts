/* ═══ saos-dex-node · mini-service wrapper · פורט 3010 ═════════════════════
 * מריץ את הבורסה הריבונית האמיתית (saos-dex מהגיט) עם:
 *  · DATABASE_URL → הספר-המשותף (fleet-economy/db/custom.db) — שהמילויים
 *    (DexTrade) ייקראו ע"י מנוע-הכלכלה החי ויהפכו לדמי-שירות בספר (מעגל-אמת).
 *  · SAOS_DEX_STATE_DIR → db מקומי משלו (בידוד-מצב, כמו-העיצוב המקורי).
 *  · DEX_OPERATOR_TOKEN → טוקן-מקומי (operator.env, chmod 600, לעולם לא מודפס)
 *    — שער-המפעיל fail-closed נפתח רק מולו.
 * מפקח: אם-הפורט-חי → לא-מקים כפילות; אם-הבן-מת → הקמה-מחדש אחרי 5ש׳. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const DEX_ROOT = "/home/z/work/saos-dex";
/* גל-92 · שחזור-קציר-3: לדקס dex.db משלו (חוק-Roast-68 · db-scope-guard · fail-closed) —
 * אסור-בספר-האם. הנתיב-הקנוני = repos/saos-dex/db (בתוך-עץ-הפרויקט → נחתם-git-seal
 * ושורד-קציר). הגשר (:3017) מעתיק מילויים מ-API-הדקס אל הספר-המשותף
 * (/home/z/my-project/db/custom.db) שמנוע-הכלכלה (:3016) קורא. */
const DB_FILE = "file:/home/z/my-project/repos/saos-dex/db/dex.db";
const STATE_DIR = "/home/z/my-project/repos/saos-dex/db";
const ENV_FILE = path.join(import.meta.dir, "operator.env");
const STATE_URL = "http://127.0.0.1:3010/saos-dex/api/dex/state";

/* גל-92 · הטבעת-טוקן-עצמית: היה fail-closed על operator.env חסר — כלומר אחרי
 * כל-קציר-סנדבוקס הדקס-והחיילים-מתים-עד-מתערב-אנושי. התיקון: אין-קובץ → המצאה
 * עצמית של טוקן-לוקאלי (crypto.randomBytes, chmod 600). רמת-אבטחה-זהה: מי-שיש-לו
 * גישה-לסנדבוקס קורא-את-הקובץ-בכל-מקרה; הטוקן אף-פעם-לא-יוצא-לרשת. אפס-תלות-בעלים. */
function readToken(): string {
  try {
    const m = fs.readFileSync(ENV_FILE, "utf8").match(/^DEX_OPERATOR_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* אין-קובץ — מטביעים-עכשיו */ }
  const { randomBytes } = require("crypto");
  const token = randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(ENV_FILE, `DEX_OPERATOR_TOKEN=${token}\n`, { mode: 0o600 });
    fs.chmodSync(ENV_FILE, 0o600);
    console.info("[saos-dex-node] טוקן-מפעיל הומצא-עצמית (operator.env · chmod 600) — עלייה-עצמאית-מלאה");
  } catch (e) {
    console.error(`[saos-dex-node] הטבעה-נכשלה: ${e instanceof Error ? e.message : String(e)} — fail-closed`);
    return "";
  }
  return token;
}

async function portAlive(): Promise<boolean> {
  try {
    const r = await fetch(STATE_URL, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let child: ReturnType<typeof spawn> | null = null;
let stopping = false;

async function boot(): Promise<void> {
  if (await portAlive()) {
    console.info("[saos-dex-node] פורט 3010 חי — לא-מקים כפילות");
    return;
  }
  const token = readToken();
  if (!token) {
    console.error("[saos-dex-node] הטבעת-טוקן-נכשלה (fs לא זמין?) — עלייה fail-closed");
    process.exit(1);
  }
  child = spawn("bun", ["run", "next", "dev", "-p", "3010", "-H", "127.0.0.1"], {
    cwd: DEX_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: `file:${DB_FILE}`,
      SAOS_DEX_STATE_DIR: STATE_DIR,
      DEX_OPERATOR_TOKEN: token,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code) => {
    child = null;
    if (stopping) return;
    console.error(`[saos-dex-node] הדקס-יצא code=${code} — הקמה-מחדש בעוד 5ש׳`);
    setTimeout(() => { void boot(); }, 5000);
  });
}

void boot();
setInterval(() => { void boot(); }, 30_000); // ווטצ'-דוג: אם-הבן-מת-והאירוע-החמיץ — מקים
process.on("SIGTERM", () => { stopping = true; try { child?.kill(); } catch { /* כנה */ } process.exit(0); });
