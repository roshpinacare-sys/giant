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
const DB_FILE = "/home/z/work/fleet-economy/db/custom.db";
const STATE_DIR = "/home/z/work/saos-dex/db";
const ENV_FILE = path.join(import.meta.dir, "operator.env");
const STATE_URL = "http://127.0.0.1:3010/saos-dex/api/dex/state";

function readToken(): string {
  try {
    const m = fs.readFileSync(ENV_FILE, "utf8").match(/^DEX_OPERATOR_TOKEN=(.+)$/m);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
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
    console.error("[saos-dex-node] אין-טוקן-מפעיל (operator.env) — עלייה fail-closed");
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
