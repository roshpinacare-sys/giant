// GET /api/estate/state · מצב-האחוזה-באמת — מדידה-חיה-מהדיסק + סטטיסטיקת-ענק-מהלדג'ר
// חוק-אמת: כל-מספר-כאן נמדד-בזמן-ריצה (קבצים, בייטים, DB) — אין-סיפורים-סטטיים.
// הבעלים (trace 1a13ca3f1160b6d1): גילוי-דינמי של *כל* תיקיות-הגיט — לא רק ה-7 הקנוניים.
import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { ensureEngine, SAOS } from "@/lib/dex-engine";
import {
  discoverGitRepos,
  gitMeta,
  type DiscoveredRepo,
  type GitMeta,
} from "@/lib/estate-discovery";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
]);

const MAX_FILES_PER_REPO = 30_000;

interface DiskMeasure {
  exists: boolean;
  files: number;
  bytes: number;
  lastModified: string | null;
  truncated: boolean;
}

async function measure(root: string): Promise<DiskMeasure> {
  const out: DiskMeasure = { exists: false, files: 0, bytes: 0, lastModified: null, truncated: false };
  let st;
  try {
    st = await stat(root);
  } catch {
    return out;
  }
  if (!st.isDirectory()) {
    out.exists = true;
    out.files = 1;
    out.bytes = st.size;
    out.lastModified = st.mtime.toISOString();
    return out;
  }
  out.exists = true;
  out.lastModified = st.mtime.toISOString();
  const queue: string[] = [root];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (out.files >= MAX_FILES_PER_REPO) {
        out.truncated = true;
        return out;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        queue.push(full);
      } else if (e.isFile()) {
        out.files += 1;
        try {
          const fs = await stat(full);
          out.bytes += fs.size;
          if (!out.lastModified || fs.mtime.toISOString() > out.lastModified) {
            out.lastModified = fs.mtime.toISOString();
          }
        } catch {
          // קובץ-שנעלם-בזמן-המדידה — מדלגים-בכנות
        }
      }
    }
  }
  return out;
}

export interface EstateRepo {
  name: string;
  dir: string;
  role: string;
  status: "system" | "source" | "mirror" | "archive" | "infra" | "charter";
  what: string;
  disk: DiskMeasure;
  generation: "system" | "live" | "archive";
  git: GitMeta | null;
}

export const dynamic = "force-dynamic";

// מגדירים-סמנטיים-קנוניים לדור-החי (t36) + המערכת — השאר מתגלה-דינמית
const SEMANTIC: Record<string, { role: string; status: EstateRepo["status"]; what: string }> = {
  ".": {
    role: "הממשק-המאוחד",
    status: "system",
    what: "ערוץ-הריבון + בורסת-אמת + מסך-המיזוג + שער-headcorner — נמדד-כאן-חי (src+prisma+db)",
  },
  Console: {
    role: "הקונסולה-הציבורית של SAOS",
    status: "source",
    what: "מקור-האמת-של-המטבע: שרשרת-האימות-והאספקה-המקורית",
  },
  Domain: {
    role: "מראת-Console",
    status: "mirror",
    what: "שיקוף-בלבד — לא-נבנה-שם-דבר-חדש",
  },
  FleetHQ: {
    role: "מטה-הצי",
    status: "infra",
    what: "CI-ומנועי-החלטה — תשתית-פנימית",
  },
  Sandbox: {
    role: "האמנות-והתיעוד",
    status: "charter",
    what: "הסכם-המיזוג, אמנת-giant, פרוטוקול-הצי, מקורות-העיצוב, תוכניות-האם",
  },
  "saos-dex": {
    role: "ארכיון-הדקס-ההיסטורי",
    status: "archive",
    what: "הנפחים-שם-היו-מבוימים — הוחלף-במנוע-האמת",
  },
  roshpina: {
    role: "מאגר-ידע SAOS",
    status: "archive",
    what: "תיעוד-בלבד",
  },
};

export async function GET() {
  try {
    await ensureEngine();

    // --- גילוי-אמת: כל-תיקיות-הגיט-בדיסק (המערכת + t36-חי + t35-ארכיון) ---
    const discovered = await discoverGitRepos();

    const repos: EstateRepo[] = await Promise.all(
      discovered.map(async (d: DiscoveredRepo) => {
        const semantic = SEMANTIC[d.relName];
        const isSystem = d.generation === "system";
        const name = isSystem
          ? "giant · המערכת הזאת"
          : d.generation === "archive"
            ? `${d.relName} · t35`
            : d.relName;

        const [disk, git] = await Promise.all([
          (async () => {
            const root = isSystem ? path.join(d.dir, "src") : d.dir;
            const m = await measure(root);
            if (isSystem) {
              const extra = await Promise.all([
                measure(path.join(d.dir, "prisma")),
                measure(path.join(d.dir, "db")),
              ]);
              for (const e of extra) {
                m.files += e.files;
                m.bytes += e.bytes;
                if (e.lastModified && (!m.lastModified || e.lastModified > m.lastModified)) {
                  m.lastModified = e.lastModified;
                }
              }
            }
            return m;
          })(),
          gitMeta(d.dir),
        ]);

        const role = isSystem
          ? SEMANTIC["."].role
          : d.generation === "archive"
            ? "הדור-הקודם · עדות-הישרדות-מגיט"
            : (semantic?.role ?? "ריפו-מגולה");
        const status: EstateRepo["status"] =
          d.generation === "archive"
            ? "archive"
            : (semantic?.status ?? "source");
        const what = isSystem
          ? SEMANTIC["."].what
          : d.generation === "archive"
            ? "שיבוש-שוטף-של-הדור-הקודם — לא-נבנה-שם-דבר-חדש; קיים-כעדות-הישרדות-בלבד"
            : (semantic?.what ?? "תיקיית-גיט-מגולה — נמדדת-חי");

        return {
          name,
          dir: d.dir,
          role,
          status,
          what,
          disk,
          generation: d.generation,
          git,
        } satisfies EstateRepo;
      }),
    );

    // סדר-קריאה: המערכת → דור-חי → ארכיון; בתוך-קבוצה — אלפבית
    const genOrder = { system: 0, live: 1, archive: 2 } as const;
    repos.sort((a, b) => genOrder[a.generation] - genOrder[b.generation] || a.name.localeCompare(b.name));

    const generations = {
      system: repos.filter((r) => r.generation === "system").length,
      live: repos.filter((r) => r.generation === "live").length,
      archive: repos.filter((r) => r.generation === "archive").length,
    };
    const commitCount = repos.reduce((s, r) => s + (r.git?.commitCount ?? 0), 0);

    // --- סטטיסטיקת-ענק-מהלדג'ר (אמת-בלבד) ---
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [pairs, trades24h, vol24hAgg, fleetAgents, fleetActive, ledgerRows, messages, saosSum] =
      await Promise.all([
        db.dexPair.count(),
        db.dexTrade.count({ where: { t: { gte: dayAgo } } }),
        db.dexTrade.aggregate({ _sum: { total: true }, where: { t: { gte: dayAgo } } }),
        db.fleetAgent.count(),
        db.fleetAgent.count({ where: { active: true } }),
        db.dexLedger.count(),
        db.sovereignMessage.count(),
        db.dexLedger.aggregate({ _sum: { amount: true }, where: { token: "SAOS" } }),
      ]);

    const saosPool = await db.dexPair.findFirst({ where: { base: "SAOS", quote: "USDS" } });
    const saosIssued = (saosSum._sum.amount ?? 0) + (saosPool?.reserveBase ?? 0);

    // head-הגיט-הקנוני — מתוך-המדידה-של-המערכת-עצמה
    const systemRepo = repos.find((r) => r.generation === "system");
    const head = systemRepo?.git?.headShort
      ? `${systemRepo.git.headShort} ${systemRepo.git.headSubject ?? ""}`.trim().slice(0, 120)
      : null;

    return NextResponse.json({
      ok: true,
      measuredAt: new Date().toISOString(),
      head,
      repos,
      generations,
      gitFoldersTotal: repos.length,
      commitCount,
      live: {
        saosIssued,
        saosCap: SAOS.cap,
        saosUnissued: SAOS.cap - saosIssued,
        pairs,
        trades24h,
        vol24h: vol24hAgg._sum.total ?? 0,
        fleetAgents,
        fleetActive,
        ledgerRows,
        messages,
      },
      truth:
        "גילוי-דינמי-של-כל-תיקיות-הגיט + מדידת-דיסק-ולדג'ר-חיה · אין-מחרוזות-סטטיות-מתחזות-לנתונים",
    });
  } catch (err) {
    console.error("[api/estate/state]", err);
    return NextResponse.json({ ok: false, error: "נכשלה-מדידת-האחוזה" }, { status: 500 });
  }
}
