// instrumentation.ts — איחוד-אמת של שתי-שכבות-האתחול (true-union גל-93 · agent-2)
//
// שכבת-גל-80 (מנוע-התדירות): register() מריץ-בכל-עליית-שרת — הבריכה, המתאים והצי-סוחרים-מהבוט.
// שכבת-גל-85→92 (agent-2): watchdog-מארחים-ריבוניים — economy-beat-host + sovereign-builder-host
// מוקמים-כילדי-next-server ומוחיים-מחדש אם-דופקם-פסק. בלי-אף-סוכן-חי.
//
// כשל-כנה: אם-שכבה-נכשלת-היא-נרשמת-והבקשה-הראשונה-מחייה-מחדש (fail-honest) — שכבה-אחת לא מפילה את רעותה.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ─── שכבת-גל-80: מנוע-השוק-והצי ───
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

  // ─── שכבת-גל-85→92: watchdog-מארחי-הריבונות (agent-2) ───
  try {
    // עוקף-ניתוח-סטטי של הבונדלר (Turbopack בודק-גם-את-ענף-edge): מודולי-מערכת דרך-getBuiltinModule
    const nodeMods = (globalThis as any).process?.getBuiltinModule;
    if (!nodeMods) return;
    const { spawn } = nodeMods.call(process, "child_process");
    const fs = nodeMods.call(process, "fs");

    const HOSTS: Array<{ host: string; heartbeat: string; log: string; staleMs: number }> = [
      {
        host: "/home/z/my-project/economy-beat-host.mjs",
        heartbeat: "/home/z/audit/economy-beat-host-heartbeat.json",
        log: "/home/z/audit/economy-beat-host.log",
        staleMs: 12 * 60_000, // פעימה-כל-45 דק' אבל-ה-דופק-נכתב-כל-דקה
      },
      {
        host: "/home/z/my-project/sovereign-builder-host.mjs",
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
        const hb = JSON.parse(fs.readFileSync(h.heartbeat, "utf8"));
        if (Date.now() - (hb.at ?? 0) > h.staleMs) spawnHost(h, why);
      } catch {
        spawnHost(h, why);
      }
    };

    // הקמה ראשונה אם-אין-מארח-חי
    for (const h of HOSTS) checkHost(h, "stale-heartbeat-on-boot");

    // watchdog: כל-10 דק' — אם-דופק-מארח פסק — מקימים-מחדש
    setInterval(() => {
      for (const h of HOSTS) checkHost(h, "watchdog-stale");
    }, 10 * 60_000);
  } catch (err) {
    console.error(
      "[instrumentation] sovereign-hosts watchdog deferred (fail-honest):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
