/* ═══ saos-dex-node · mini-service wrapper · פורט 3012 ═════════════════════
 * מריץ את הבורסה הריבונית האמיתית (saos-dex מהגיט, שוחזר ל-/home/z/estate/saos-dex):
 *  · DATABASE_URL → sqlite משלו (עוגני-שרשרת מקומיים — BlockHeader וכו') —
 *    אפס-מגע בספר-המשותף; מעגל-האמת דרך dex-economy-bridge (DexTrade → custom.db).
 *  · SAOS_DEX_STATE_DIR → /home/z/estate/saos-dex/db — ספר-הארנקות האמיתי
 *    משוחזר מ-state-snapshot.json (height 432492 · operator עם עתודת-מימון).
 *  · DEX_OPERATOR_TOKEN → טוקן-מקומי (operator.env, chmod 600, לעולם לא מודפס)
 *    — שער-המפעיל fail-closed נפתח רק מולו.
 * פורט 3015 (ולא 3010/3012): agent-hq של FleetHQ יושב כנים על 3010 — לא נוגעים בו.
 * מפקח: אם-הפורט-חי → לא-מקים כפילות; אם-הבן-מת → הקמה-מחדש אחרי 5ש׳. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const DEX_ROOT = "/home/z/estate/saos-dex";
const DB_FILE = "/home/z/estate/saos-dex/db/dex.db";
const STATE_DIR = "/home/z/estate/saos-dex/db";
const PORT = Number(process.env.DEX_NODE_PORT || 3015);
const ENV_FILE = path.join(import.meta.dir, "operator.env");
const STATE_URL = `http://127.0.0.1:${PORT}/saos-dex/api/dex/state`;

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
    if (!r.ok) return false;
    /* זיהוי-DEX אמיתי — לא כל-200 עובד (local-beats/agent-hq עונים 200 על-הכל) */
    const j: any = await r.json().catch(() => null);
    const st = j?.state ?? j;
    return Boolean(st && (st.ladder || st.balances || st.height > 0 || j?.service === "saos-dex"));
  } catch {
    return false;
  }
}

let child: ReturnType<typeof spawn> | null = null;
let stopping = false;

async function boot(): Promise<void> {
  if (await portAlive()) {
    console.info("[saos-dex-node] פורט ${PORT} חי — לא-מקים כפילות");
    return;
  }
  const token = readToken();
  if (!token) {
    console.error("[saos-dex-node] אין-טוקן-מפעיל (operator.env) — עלייה fail-closed");
    process.exit(1);
  }
  child = spawn("bun", ["run", "next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
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
