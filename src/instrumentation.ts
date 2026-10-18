// instrumentation.ts — אתחול-ריבוני בעת-עליית-השרת (גל-80 · מנוע-התדירות)
// עד-היום מנוע-השוק-והלולאה-היו-חיים-רק-מהבקשה-הראשונה: ריסטרט-סנדבוקס = שוק-מת-עד-שמישהו-מבקר.
// מעכשיו: register() מריץ-בכל-עליית-שרת — הבריכה, המתאים (2ש׳) והצי-סוחרים-מהבוט.
// כשל-כנה: אם-ה-DB-לא-זמין-בבוט — השגיאה-נרשמת-והבקשה-הראשונה-מחייה-מחדש (fail-honest).
//
// גל-19 (2026-10-18) · שרשרת-התאוששות-על-עץ-הפלטפורמה: ה-Next-של-:3000 הוא-התהליך-
// שהפלטפורמה-מקימה-בעצמה — הילד-היחיד-שחי-בוודאות. בכל-עלייה-שלו אנו-זורקים-
// detached-resurrect-fleet.sh (מתייתם-ל-init) שמקים-את-כל-הצי-בחוק-סדר-העלייה:
// קונסולה→כלכלה→דקס→השאר (מלחמת-הפורטים: הדקס-שנולד-ראשון-חוטף-גם-:3000).
import { spawn } from "node:child_process";

export async function register(): Promise<void> {
  try {
    const { ensureEngine } = await import("@/lib/dex-engine");
    await ensureEngine();
    console.log("[instrumentation] sovereign market engine + fleet loop booted at server start");
  } catch (err) {
    console.error(
      "[instrumentation] engine boot deferred to first request (fail-honest):",
      err instanceof Error ? err.message : String(err),
    );
  }
  try {
    const child = spawn("bash", ["/home/z/my-project/scripts/resurrect-fleet.sh"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log("[instrumentation] fleet resurrect chain spawned (detached → init)");
  } catch (err) {
    console.error("[instrumentation] fleet resurrect spawn failed (fail-honest):", err instanceof Error ? err.message : String(err));
  }
}
