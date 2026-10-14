// GET /api/fleet/roster · מפקד-הסוכנים-האמיתי — המפקדה-המלאה-מgit-אמת
// הבעלים (trace 1a13ca3f1160b6d1): "שים לב להתפתחות כי יש לנו הרבה יותר מ-6 סוכנים".
// חוק-אמת: כל-זהות כאן מנוסחת מ-git-log אמת (מחברי-הקומיטים בכל-תיקיות-הגיט) ∪ צי-ה-DB —
// אין-רשימה-מקודדת; הסיווג-למשפחות הוא-כלל-מוצהר-בקוד (classifyAgent).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  discoverGitRepos,
  gitMeta,
  classifyAgent,
  FAMILY_LABEL,
  type AgentFamily,
} from "@/lib/estate-discovery";

export const dynamic = "force-dynamic";

interface RosterEntry {
  name: string;
  family: AgentFamily;
  commits: number;
  repos: string[];
  fleet?: {
    active: boolean;
    allocationUsds: number;
    balanceUsds: number;
    vol24h: number;
    trades24h: number;
  };
}

// מטמון-זיכרון-קל (45ש) — git-log-על-13-ריפו-ים יקר; הזהויות-לא-משתנות-בכל-שנייה
let rosterCache: { at: number; data: unknown } | null = null;
const ROSTER_TTL = 45_000;

export async function GET() {
  if (rosterCache && Date.now() - rosterCache.at < ROSTER_TTL) {
    return NextResponse.json(rosterCache.data, { headers: { "cache-control": "no-store" } });
  }
  try {
    // --- 1 · מפקד-git: כל-המחברים-בכל-תיקיות-הגיט ---
    const repos = await discoverGitRepos();
    const metas = await Promise.all(
      repos.map(async (d) => ({ relName: d.relName, meta: await gitMeta(d.dir) })),
    );

    const agg = new Map<string, RosterEntry>();
    let commitsTotal = 0;
    for (const { relName, meta } of metas) {
      commitsTotal += meta.commitCount;
      for (const a of meta.authors) {
        const cur = agg.get(a.name);
        if (cur) {
          cur.commits += a.commits;
          if (!cur.repos.includes(relName)) cur.repos.push(relName);
        } else {
          agg.set(a.name, {
            name: a.name,
            family: classifyAgent(a.name),
            commits: a.commits,
            repos: [relName],
          });
        }
      }
    }

    // --- 2 · צי-ה-DB: תקציב/יתרה/נפח-אמת מוצמדים-לזהות-git ---
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [fleetRows, perAgent, balances] = await Promise.all([
      db.fleetAgent.findMany(),
      db.dexTrade.groupBy({
        by: ["sourceAgent"],
        _sum: { total: true },
        _count: { _all: true },
        where: { source: "FLEET", sourceAgent: { not: null }, t: { gte: dayAgo } },
      }),
      db.dexLedger.groupBy({
        by: ["account"],
        _sum: { amount: true },
        where: { account: { startsWith: "FLEET:" }, token: "USDS" },
      }),
    ]);
    const volMap = new Map(
      perAgent.map((r) => [r.sourceAgent as string, { vol: r._sum.total ?? 0, trades: r._count._all }]),
    );
    const balMap = new Map(balances.map((r) => [r.account, r._sum.amount ?? 0]));

    const byFamily: Record<AgentFamily, RosterEntry[]> = {
      owner: [],
      zai: [],
      organ: [],
      automation: [],
    };

    for (const entry of agg.values()) {
      const fleetRow = fleetRows.find((f) => f.agentId === entry.name);
      if (fleetRow) {
        entry.fleet = {
          active: fleetRow.active,
          allocationUsds: fleetRow.allocationUsds,
          balanceUsds: balMap.get(`FLEET:${fleetRow.agentId}`) ?? 0,
          vol24h: volMap.get(fleetRow.agentId)?.vol ?? 0,
          trades24h: volMap.get(fleetRow.agentId)?.trades ?? 0,
        };
      }
      byFamily[entry.family].push(entry);
    }
    for (const fam of Object.values(byFamily)) {
      fam.sort((a, b) => b.commits - a.commits);
    }

    const total = agg.size;

    const payload = {
      ok: true,
      measuredAt: new Date().toISOString(),
      reposScanned: repos.length,
      commitsTotal,
      identitiesTotal: total,
      families: {
        owner: { label: FAMILY_LABEL.owner, count: byFamily.owner.length, top: byFamily.owner.slice(0, 6) },
        zai: {
          label: FAMILY_LABEL.zai,
          count: byFamily.zai.length,
          top: byFamily.zai.slice(0, 40),
        },
        organ: { label: FAMILY_LABEL.organ, count: byFamily.organ.length, top: byFamily.organ.slice(0, 12) },
        automation: {
          label: FAMILY_LABEL.automation,
          count: byFamily.automation.length,
          top: byFamily.automation.slice(0, 12),
        },
      },
      fleet: fleetRows.map((f) => ({
        agentId: f.agentId,
        name: f.name,
        active: f.active,
        allocationUsds: f.allocationUsds,
        balanceUsds: balMap.get(`FLEET:${f.agentId}`) ?? 0,
        vol24h: volMap.get(f.agentId)?.vol ?? 0,
        trades24h: volMap.get(f.agentId)?.trades ?? 0,
        lastTradeAt: f.lastTradeAt?.toISOString() ?? null,
      })),
      proof:
        "כל-זהות-נמדדה-מgit-log-אמת-על-פני-כל-תיקיות-הגיט · הסיווג-למשפחות-מוצהר-בקוד · אין-רשימה-מקודדת",
    };
    rosterCache = { at: Date.now(), data: payload };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[api/fleet/roster]", err);
    return NextResponse.json({ ok: false, error: "נכשל-מפקד-הסוכנים" }, { status: 500 });
  }
}
