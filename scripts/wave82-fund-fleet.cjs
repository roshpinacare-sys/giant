/* eslint-disable @typescript-eslint/no-require-imports */
// wave82-fund-fleet.cjs — גל-82 · פתיחת-שסתום-ההון של-הצי (פעולה-בעלים-מתועדת)
// הוראת-הבעלים: "מקדמים-הכל-עכשיו" + השסתום-המוצהר-בגל-80: "הקצאות-צי-800→2000".
// האמת: הצי-עבד-על 278-USDS-בלבד מול-טרזור-של-~29,400 — התדירות-הייתה-חנוקת-הון.
// חוק-אמת: הכסף-זז-בלדג'ר-כפול (TREASURY −X / FLEET:<id> +X) — אין-הדפסה-סמויה.
// + שני-סוכני-פנים-חדשים (mm-1 מעשה-שוק, lp-1 עומק-נזילות) — כולם-סוחרים-על-כל-הבריכות-הילידות.
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const WAVE = "גל-82";
const FUNDING = [
  { agentId: "zai-main", name: "סוכן-ראשי · ריבוי-בריכות", usds: 1000 },
  { agentId: "zai-code-3", name: "סוכן-בנייה · ריבוי-בריכות", usds: 1000 },
  { agentId: "zai-code-5", name: "סוכן-בנייה-ב' · ריבוי-בריכות", usds: 1000 },
  { agentId: "zai-fix", name: "סוכן-ריפוי · ריבוי-בריכות", usds: 1000 },
  { agentId: "zai-sec", name: "סוכן-חומה · ריבוי-בריכות", usds: 1000 },
  { agentId: "inward-62", name: "סוכן-פנים · ריבוי-בריכות", usds: 1000 },
  { agentId: "mm-1", name: "מעשה-שוק-פנימי · כל-הבריכות", usds: 1500 },
  { agentId: "lp-1", name: "עומק-נזילות-פנימי · כל-הבריכות", usds: 1500 },
];

(async () => {
  let total = 0;
  for (const f of FUNDING) {
    const existing = await db.fleetAgent.findUnique({ where: { agentId: f.agentId } });
    if (existing) {
      await db.fleetAgent.update({
        where: { agentId: f.agentId },
        data: { active: true, name: f.name, allocationUsds: { increment: f.usds } },
      });
    } else {
      await db.fleetAgent.create({
        data: {
          agentId: f.agentId,
          name: f.name,
          tokenHash: "internal-loop-agent", // סוכן-פנים-של-הלולאה — אין-אסימון-חוץ, הלולאה-עצמה-סוחרת-בחשבונו
          allocationUsds: f.usds,
          active: true,
        },
      });
    }
    await db.dexLedger.create({
      data: { account: "TREASURY", token: "USDS", amount: -f.usds, reason: `${WAVE} · הקצאת-עבודה · צי-פנימי · ${f.agentId}` },
    });
    await db.dexLedger.create({
      data: { account: `FLEET:${f.agentId}`, token: "USDS", amount: f.usds, reason: `${WAVE} · הקצאת-עבודה מהקופה · ${f.name}` },
    });
    total += f.usds;
    console.log(`funded ${f.agentId}: +${f.usds} USDS`);
  }
  const treasury = await db.dexLedger.aggregate({ _sum: { amount: true }, where: { account: "TREASURY", token: "USDS" } });
  const fleet = await db.dexLedger.aggregate({ _sum: { amount: true }, where: { account: { startsWith: "FLEET:" }, token: "USDS" } });
  const agents = await db.fleetAgent.count({ where: { active: true } });
  console.log(JSON.stringify({ totalAllocated: total, treasuryUsds: treasury._sum.amount, fleetUsds: fleet._sum.amount, activeAgents: agents }));
  await db.$disconnect();
})();
