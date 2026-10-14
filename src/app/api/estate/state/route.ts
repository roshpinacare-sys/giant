// GET /api/estate/state · מצב-האחוזה-באמת — מדידה-חיה-מהדיסק + סטטיסטיקת-ענק-מהלדג'ר
// חוק-אמת: כל-מספר-כאן נמדד-בזמן-ריצה (קבצים, בייטים, DB) — אין-סיפורים-סטטיים.
import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { db } from "@/lib/db";
import { ensureEngine, SAOS } from "@/lib/dex-engine";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

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
}

export async function GET() {
  try {
    await ensureEngine();

    const T36 = "/home/z/my-project/t36";
    const defs: Array<Omit<EstateRepo, "disk">> = [
      {
        name: "giant · המערכת הזאת",
        dir: "/home/z/my-project",
        role: "הממשק-המאוחד",
        status: "system",
        what: "ערוץ-הריבון + בורסת-אמת + מסך-המיזוג + שער-headcorner — נמדד-כאן-חי (src+prisma+db)",
      },
      {
        name: "Console",
        dir: path.join(T36, "Console"),
        role: "הקונסולה-הציבורית של SAOS",
        status: "source",
        what: "מקור-האמת-של-המטבע: שרשרת-האימות-והאספקה-המקורית",
      },
      {
        name: "Domain",
        dir: path.join(T36, "Domain"),
        role: "מראת-Console",
        status: "mirror",
        what: "שיקוף-בלבד — לא-נבנה-שם-דבר-חדש",
      },
      {
        name: "FleetHQ",
        dir: path.join(T36, "FleetHQ"),
        role: "מטה-הצי",
        status: "infra",
        what: "CI-ומנועי-החלטה — תשתית-פנימית",
      },
      {
        name: "Sandbox",
        dir: path.join(T36, "Sandbox"),
        role: "האמנות-והתיעוד",
        status: "charter",
        what: "הסכם-המיזוג, אמנת-giant, פרוטוקול-הצי, תוכניות-האם",
      },
      {
        name: "saos-dex",
        dir: path.join(T36, "saos-dex"),
        role: "ארכיון-הדקס-ההיסטורי",
        status: "archive",
        what: "הנפחים-שם-היו-מבוימים — הוחלף-במנוע-האמת",
      },
      {
        name: "roshpina",
        dir: path.join(T36, "roshpina"),
        role: "מאגר-ידע SAOS",
        status: "archive",
        what: "תיעוד-בלבד",
      },
    ];

    const repos: EstateRepo[] = [];
    for (const d of defs) {
      const root =
        d.name === "giant · המערכת הזאת" ? path.join(d.dir, "src") : d.dir;
      const disk = await measure(root);
      // giant: מוסיפים prisma+db למדידה
      if (d.name === "giant · המערכת הזאת") {
        const extra = await Promise.all([
          measure(path.join(d.dir, "prisma")),
          measure(path.join(d.dir, "db")),
        ]);
        for (const e of extra) {
          disk.files += e.files;
          disk.bytes += e.bytes;
          if (e.lastModified && (!disk.lastModified || e.lastModified > disk.lastModified)) {
            disk.lastModified = e.lastModified;
          }
        }
      }
      repos.push({ ...d, disk });
    }

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

    // head-הגיט-הקנוני
    let head: string | null = null;
    try {
      const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%h %s", "--max-count=1"], {
        cwd: "/home/z/my-project",
        timeout: 5_000,
      });
      head = stdout.trim().slice(0, 120);
    } catch {
      head = null; // דיווח-כנה: אין-גיט-זמין
    }

    return NextResponse.json({
      ok: true,
      measuredAt: new Date().toISOString(),
      head,
      repos,
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
      truth: "כל-מספר-נמדד-חי-מהדיסק-ומהלדג'ר · אין-מחרוזות-סטטיות-מתחזות-לנתונים",
    });
  } catch (err) {
    console.error("[api/estate/state]", err);
    return NextResponse.json({ ok: false, error: "נכשלה-מדידת-האחוזה" }, { status: 500 });
  }
}
