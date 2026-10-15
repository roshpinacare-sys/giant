// GET /api/skills/state · מצב-מרכז-היכולות — הקטלוג-נגזר-מנתונים + סטטיסטיקה-נגזרת-מ-SkillRun-האמת.
// חוק-אמת: אין-סטטיסטיקה-סטטית — כל-מספר-נגזר-מהרצות-הרשומות-בלבד.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SKILLS } from "@/lib/skills-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [runs, recent] = await Promise.all([
      db.skillRun.groupBy({
        by: ["skill", "status"],
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
      db.skillRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          skill: true,
          status: true,
          input: true,
          output: true,
          durationMs: true,
          error: true,
          createdAt: true,
        },
      }),
    ]);

    const total = await db.skillRun.count();

    const perSkill = SKILLS.map((meta) => {
      const rows = runs.filter((r) => r.skill === meta.id);
      const ok = rows.find((r) => r.status === "OK");
      const err = rows.find((r) => r.status === "ERROR");
      const okCount = ok?._count._all ?? 0;
      const errCount = err?._count._all ?? 0;
      const all = okCount + errCount;
      const last = recent.find((r) => r.skill === meta.id);
      return {
        id: meta.id,
        runs: all,
        ok: okCount,
        errors: errCount,
        successRate: all > 0 ? Math.round((okCount / all) * 100) : null,
        avgMs: ok?._avg.durationMs != null ? Math.round(ok._avg.durationMs) : null,
        lastAt: last?.createdAt?.toISOString() ?? null,
      };
    });

    const okTotal = perSkill.reduce((a, s) => a + s.ok, 0);
    const errTotal = perSkill.reduce((a, s) => a + s.errors, 0);
    const okRecent = recent.filter((r) => r.status === "OK");
    const avgMs =
      okRecent.length > 0
        ? Math.round(okRecent.reduce((a, r) => a + r.durationMs, 0) / okRecent.length)
        : null;

    return NextResponse.json({
      ok: true,
      measuredAt: new Date().toISOString(),
      catalog: SKILLS,
      stats: {
        total,
        ok: okTotal,
        errors: errTotal,
        successRate: okTotal + errTotal > 0 ? Math.round((okTotal / (okTotal + errTotal)) * 100) : null,
        avgMs,
        skillsLive: perSkill.filter((s) => s.runs > 0).length,
      },
      perSkill,
      recent,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאת-מצב" },
      { status: 500 },
    );
  }
}
