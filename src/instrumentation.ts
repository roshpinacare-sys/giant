// instrumentation.ts — אתחול-ריבוני בעת-עליית-השרת (גל-80 · מנוע-התדירות)
// עד-היום מנוע-השוק-והלולאה-היו-חיים-רק-מהבקשה-הראשונה: ריסטרט-סנדבוקס = שוק-מת-עד-שמישהו-מבקר.
// מעכשיו: register() מריץ-בכל-עליית-שרת — הבריכה, המתאים (2ש׳) והצי-סוחרים-מהבוט.
// כשל-כנה: אם-ה-DB-לא-זמין-בבוט — השגיאה-נרשמת-והבקשה-הראשונה-מחייה-מחדש (fail-honest).
//
// שכבת-גל-85→95 (agent-2 · true-union על-גבי-גל-80, שוחזר-אחרי-בליעת-קציר-3): watchdog-מארחים-
// ריבוניים — הלב-והבנאי-חיים-בביתם-הקנוני fleet-economy/bootstrap (תורת-גל-93) ומוחיים-מחדש
// אם-דופקם-פסק. שכבה-זו-משלימה-את-מעגל-ההחיה-ההדדית-של-הפעימות (גל-95) — לא-מחליפה-אותה.

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

  // ─── שכבת-גל-85→95: watchdog-מארחי-הריבונות (agent-2) ───
  try {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    // עוקף-ניתוח-סטטי של הבונדלר (Turbopack בודק-גם-את-ענף-edge): מודולי-מערכת דרך-getBuiltinModule
    const nodeMods = (globalThis as unknown as { process?: { getBuiltinModule?: (m: string) => unknown } }).process?.getBuiltinModule;
    if (!nodeMods) return;
    const { spawn } = nodeMods.call(process, "child_process") as typeof import("child_process");
    const fs = nodeMods.call(process, "fs") as typeof import("fs");

    const HOSTS: Array<{ host: string; heartbeat: string; log: string; staleMs: number }> = [
      {
        host: "/home/z/audit/fleet-economy/bootstrap/economy-beat-host.mjs",
        heartbeat: "/home/z/audit/economy-beat-host-heartbeat.json",
        log: "/home/z/audit/economy-beat-host.log",
        staleMs: 12 * 60_000, // פעימה-כל-45 דק' אבל-הדופק-נכתב-כל-דקה
      },
      {
        host: "/home/z/audit/fleet-economy/bootstrap/sovereign-builder/host.mjs",
        heartbeat: "/home/z/audit/builder-beat-heartbeat.json",
        log: "/home/z/audit/builder-beat-host.log",
        staleMs: 12 * 60_000, // דופק-הבנאי-נכתב-כל-30ש'
      },
    ];

    const spawnHost = (h: (typeof HOSTS)[number], why: string) => {
      const child = spawn("bun", [h.host], { stdio: "ignore", detached: false });
      child.on("error", () => {});
      try {
        fs.appendFileSync(h.log, `[watchdog] ${new Date().toISOString()} spawn-host (${why})\n`);
      } catch {}
    };

    const checkHost = (h: (typeof HOSTS)[number], why: string) => {
      try {
        const hb = JSON.parse(fs.readFileSync(h.heartbeat, "utf8")) as { at?: number };
        if (Date.now() - (hb.at ?? 0) > h.staleMs) spawnHost(h, why);
      } catch {
        spawnHost(h, why);
      }
    };

    // הקמה ראשונה אם-אין-מארח-חי
    for (const h of HOSTS) checkHost(h, "stale-heartbeat-on-boot");

    // watchdog: כל-10 דק' — אם-דופק-מארח פסק — מקימים-מחדש
    const timer = setInterval(() => {
      for (const h of HOSTS) checkHost(h, "watchdog-stale");
    }, 10 * 60_000);
    timer.unref?.();
  } catch (err) {
    console.error(
      "[instrumentation] sovereign-hosts watchdog deferred (fail-honest):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
