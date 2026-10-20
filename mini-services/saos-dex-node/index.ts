/* ═══ saos-dex-node · mini-service wrapper · פורט 3010 ═════════════════════
 * מריץ את הבורסה הריבונית האמיתית (saos-dex מהגיט) עם:
 *  · DATABASE_URL → הספר-המשותף (fleet-economy/db/custom.db) — שהמילויים
 *    (DexTrade) ייקראו ע"י מנוע-הכלכלה החי ויהפכו לדמי-שירות בספר (מעגל-אמת).
 *  · SAOS_DEX_STATE_DIR → db מקומי משלו (בידוד-מצב, כמו-העיצוב המקורי).
 *  · DEX_OPERATOR_TOKEN → טוקן-מקומי (operator.env, chmod 600, לעולם לא מודפס)
 *    — שער-המפעיל fail-closed נפתח רק מולו.
 * מפקח: אם-הפורט-חי → לא-מקים כפילות; אם-הבן-מת → הקמה-מחדש אחרי 5ש׳. */
import { spawn } from "child_process";
import { Database as SqliteDatabase } from "bun:sqlite";
import { randomBytes } from "crypto";
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

/* גל-92 · ריפוי-עצמי-מהגיט: אחרי-קציר /home/z/work נמחק-כולו — ה-wrapper היה מת
 * לנצח (DEX_ROOT חסר). עכשיו: אין-שכפול → משכפל-לבד מ-origin (ריפו-ציבורי),
 * אין-node_modules → מתקין-לבד, אין-סכימה → prisma-db-push לבד. אפס-אדם. */
async function ensureDexRoot(): Promise<boolean> {
  try {
    if (!fs.existsSync(path.join(DEX_ROOT, ".git"))) {
      console.info("[saos-dex-node] DEX_ROOT חסר (קציר?) — משכפל-עצמית מהגיט");
      fs.mkdirSync(path.dirname(DEX_ROOT), { recursive: true });
      const r = Bun.spawnSync(["git", "clone", "--quiet", "https://github.com/roshpinacare-sys/saos-dex.git", DEX_ROOT], { stdout: "ignore", stderr: "pipe" });
      if (r.exitCode !== 0) {
        console.error("[saos-dex-node] שכפול-נכשל — fail-honest");
        return false;
      }
    }
    if (!fs.existsSync(path.join(DEX_ROOT, "node_modules"))) {
      console.info("[saos-dex-node] node_modules חסר — מתקין-עצמית");
      Bun.spawnSync(["bun", "install", "--silent"], { cwd: DEX_ROOT, stdout: "ignore", stderr: "ignore" });
    }
    if (!fs.existsSync(DB_FILE.replace(/^file:/, ""))) {
      console.info("[saos-dex-node] dex.db חסר — מקים-סכימה-עצמית (prisma db push)");
      Bun.spawnSync(["bunx", "prisma", "db", "push", "--skip-generate"], {
        cwd: DEX_ROOT, stdout: "ignore", stderr: "ignore",
        env: { ...process.env, DATABASE_URL: DB_FILE },
      });
    }
    return fs.existsSync(path.join(DEX_ROOT, "package.json"));
  } catch (e) {
    console.error(`[saos-dex-node] ריפוי-שורש-נכשל: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

let child: ReturnType<typeof spawn> | null = null;
let stopping = false;

/* גל-93 · git-first hydration (2026-10-20 · הניתוח-שנמדד-אחרי-קציר-סנדבוקס):
 * הקציר השאיר 3 עותקי-מצב סוטים: קרנל-מקומי genesis (h=0) · db-קנוני ישן
 * (h=501K, מ-18/10) · עדות-גיט-חיה (dex-beat אוטמים h=828K בריפו). הקרנל
 * דחה-כנה (snapshot-integrity) ואז עלה genesis-ריק בשקט — עולם-על-עולם.
 * החוק-החדש: לפני-כל-עלייה, אם בעדות-הגיט הטרייה (origin/main:db/state-snapshot.json)
 * יש גובה גבוה יותר מהקנוני — מזריקים אותה לקנוני ומרוקנים שורות-נגזרת
 * (BlockHeader/SealRecord — כולן אטומות-בגיט) כדי שחוק-ה-corroboration-birth
 * של chain.ts יקבל את עדות-הריפו הריבונית. כל-פעולה מגוללת-בלוג. אפס-זיוף:
 * ה-snapshot שנכנס הוא בדיוק מה שאוטם ב-origin/main. */
function gitFirstHydration(): void {
  try {
    const canonicalSnap = path.join(STATE_DIR, "state-snapshot.json");
    const h = (p: string): number => {
      try { return (JSON.parse(fs.readFileSync(p, "utf8")) as { state?: { height?: number } })?.state?.height ?? -1; }
      catch { return -1; }
    };
    const localH = h(canonicalSnap);
    const fetchRes = Bun.spawnSync(["git", "fetch", "--quiet", "origin", "main"], { cwd: DEX_ROOT, stdout: "ignore", stderr: "ignore" });
    if (fetchRes.exitCode !== 0) { console.info("[saos-dex-node] hydration: fetch נכשל (לא-חוסם) — ממשיך-עם-המקומי"); return; }
    const showRes = Bun.spawnSync(["git", "show", "origin/main:db/state-snapshot.json"], { cwd: DEX_ROOT, stdout: "pipe", stderr: "ignore" });
    if (showRes.exitCode !== 0 || !showRes.stdout?.length) { console.info("[saos-dex-node] hydration: אין-snapshot ב-origin/main — ממשיך-עם-המקומי"); return; }
    const tmpSnap = `${canonicalSnap}.origin-tmp`;
    fs.writeFileSync(tmpSnap, showRes.stdout);
    const originH = h(tmpSnap);
    if (originH <= localH) {
      fs.rmSync(tmpSnap, { force: true });
      console.info(`[saos-dex-node] hydration: מקומי h${localH} ≥ origin h${originH} — לא-נוגעים`);
      return;
    }
    const bk = `${STATE_DIR}/pre-hydration-backup-${Date.now()}`;
    fs.mkdirSync(bk, { recursive: true });
    for (const f of ["state-snapshot.json", "dex.db"]) {
      try { fs.copyFileSync(path.join(STATE_DIR, f), path.join(bk, f)); } catch { /* חסר — נולד-חדש */ }
    }
    fs.copyFileSync(tmpSnap, canonicalSnap);
    fs.rmSync(tmpSnap, { force: true });
    /* ריקון-שורות-נגזרת: הראיה-הגיטית עדיפה; בלי-זה chain.ts דוחה (priorCount>0
     * ואין-הקשר-רצוף לגובה-החדש) ועולה genesis. השורות עצמן אטומות-בגיט-HEAD. */
    try {
      const db = new SqliteDatabase(DB_FILE.replace(/^file:/, ""));
      const before = db.query("SELECT COUNT(*) c FROM BlockHeader").get() as { c: number };
      db.run("DELETE FROM BlockHeader");
      db.run("DELETE FROM SealRecord");
      db.run("VACUUM");
      db.close();
      console.warn(`[saos-dex-node] HYDRATION git-first: h${localH} → h${originH} (מ-origin/main, גובר על הקנוני) · שורות-נגזרת שנרוקנו: ${before.c} (אטומות-בגיט) · גיבוי: ${bk}`);
    } catch (e) {
      console.error(`[saos-dex-node] hydration: הזרקה-בוצעה אך ריקון-השורות-נכשל (${e instanceof Error ? e.message : String(e)}) — הקרנל עשוי-לדחות-כנה (fail-honest, לא-שתיקה)`);
    }
  } catch (e) {
    console.error(`[saos-dex-node] hydration-שגיאה-כללית (לא-חוסם): ${e instanceof Error ? e.message : String(e)}`);
  }
}

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
  if (!(await ensureDexRoot())) {
    console.error("[saos-dex-node] ריפוי-שורש-נכשל — מנסה-שוב-במחזור-הבא (אפס-ירוק-מזויף)");
    return;
  }
  gitFirstHydration();
  child = spawn("bun", ["run", "next", "dev", "-p", "3010", "-H", "127.0.0.1"], {
    cwd: DEX_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: DB_FILE, /* כבר-כולל file: */
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
