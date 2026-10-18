// instrumentation.ts — אתחול-ריבוני בעת-עליית-השרת (גל-80 · מנוע-התדירות)
// עד-היום מנוע-השוק-והלולאה-היו-חיים-רק-מהבקשה-הראשונה: ריסטרט-סנדבוקס = שוק-מת-עד-שמישהו-מבקר.
// מעכשיו: register() מריץ-בכל-עליית-שרת — הבריכה, המתאים (2ש׳) והצי-סוחרים-מהבוט.
// כשל-כנה: אם-ה-DB-לא-זמין-בבוט — השגיאה-נרשמת-והבקשה-הראשונה-מחייה-מחדש (fail-honest).

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
}
