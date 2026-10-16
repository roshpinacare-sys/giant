/**
 * GET /api/giant/liveness — דלת-החיות-הפנימית (גל-17)
 * ═══════════════════════════════════════════════════════
 * המשגיחה-הפנימית של המכונה: בודקת-את-מיני-השירותים ומחייה-מתים (דבונס-90ש׳).
 * ?force=1 → מדלג-על-הדבונס (למפעיל-ולבדיקות בלבד).
 * חוק-אמת: כל-מצב-מוצהר-כמו-שהוא — dead-כנה עד-הוכחת-פורט-חי.
 */
import { NextResponse } from "next/server";
import { ensureMiniServices, portAlive, MINI_SERVICES } from "@/lib/mini-guard";
import { measureComputeWall } from "@/lib/compute-wall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const services = await ensureMiniServices(force);
  /* אחרי-החייאה נותנים-רגע-לקום ומודדים-שוב — כנות-שנייה */
  const anyRevived = services.some((s) => s.restarted);
  let servicesAfter = services;
  if (anyRevived) {
    await new Promise((r) => setTimeout(r, 3500));
    servicesAfter = await Promise.all(
      MINI_SERVICES.map(async (svc) => ({
        name: svc.name,
        he: svc.he,
        port: svc.port,
        alive: await portAlive(svc.port),
        restarted: false,
        note: "re-measured after revive",
      })),
    );
  }
  const allAlive = servicesAfter.every((s) => s.alive);
  /* T75-c: מודעות-חומת-המחשוב — מצב-כנה מהיומן-הציבורי, בלי-לעכב את-הבקרת-החיים */
  const computeWall = await measureComputeWall(6000).catch(() => null);
  return NextResponse.json(
    {
      ok: allAlive,
      guardian: "next-server",
      force,
      services: servicesAfter,
      computeWall,
      at: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
