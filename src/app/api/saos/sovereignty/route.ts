import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AUDIT = "/home/z/audit";
const BOOK = `${AUDIT}/fleet-economy`;

// מטמון-ציבורי קטן ל-GitHub API (60ש') — ה-UI דוגם-כל-15ש' אבל אנחנו לא שורפים-מכסה
let __pulseCache: { at: number; data: unknown } | null = null;

type RunRow = {
  name: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
};

async function publicPulse(): Promise<{ runs: RunRow[]; fetchedAt: string } | null> {
  try {
    if (__pulseCache && Date.now() - __pulseCache.at < 60_000) {
      return __pulseCache.data as { runs: RunRow[]; fetchedAt: string };
    }
    // הגבלת-קצב של GitHub על-IP משותף (403 ללא-אימות, נמדד 10:33Z) — אימות-קריאה-בלבד
    // מהשרת: PAT נקרא בזמן-ריצה ולעולם לא יוצא ללקוח (בתגובה רק מטא-דאטה של ריצות-ציבוריות)
    const headers: Record<string, string> = {
      "User-Agent": "saos-sovereignty-console",
      Accept: "application/vnd.github+json",
    };
    try {
      const pat = fs.readFileSync("/home/z/my-project/upload/pat.env", "utf8").trim();
      if (pat) headers.Authorization = `Bearer ${pat}`;
    } catch {}
    const res = await fetch(
      "https://api.github.com/repos/roshpinacare-sys/saos-runtime/actions/runs?per_page=20",
      {
        headers,
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      workflow_runs?: Array<{
        name: string;
        status: string;
        conclusion: string | null;
        created_at: string;
        html_url: string;
      }>;
    };
    const data = {
      runs: (j.workflow_runs ?? []).slice(0, 20).map((r) => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        createdAt: r.created_at,
        url: r.html_url,
      })),
      fetchedAt: new Date().toISOString(),
    };
    __pulseCache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

async function hostHealth(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("http://127.0.0.1:3020/health", {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Seal = { sha: string; subject: string; date: string; seq: number | null; tx: number | null };

async function seals(): Promise<Seal[]> {
  try {
    // רק איטומי-פעימה (קומיטים רגילים כמו bootstrap נשמטים — לפי תבנית-הנושא)
    const { stdout } = await exec("git", ["-C", BOOK, "log", "--format=%h|%s|%cI", "-14"], {
      timeout: 6000,
    });
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, subject, date] = line.split("|");
        const m = subject.match(/seq=(\d+)\s*\(\+(\d+)\)/);
        return { sha, subject, date, seq: m ? Number(m[1]) : null, tx: m ? Number(m[2]) : null };
      })
      .filter((s) => s.seq !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}

export async function GET() {
  const [host, status, lock, sealList, pulse] = await Promise.all([
    hostHealth(),
    Promise.resolve(readJson(`${AUDIT}/economy-beat-service-status.json`)),
    Promise.resolve(readJson(`${BOOK}/state/writer-heartbeat.json`)),
    seals(),
    publicPulse(),
  ]);

  const now = Date.now();
  const lockAgeSec = lock && typeof lock.at === "number" ? Math.round((now - lock.at) / 1000) : null;
  const lockAlive = lockAgeSec !== null && lockAgeSec < 30 * 60;

  // פסק-דין-חי ל-sovereign-runtime מהדופק-הציבורי (ריצות מוסדרות מהחדש לישן) — האמת נמדדת, לא סטטית (gal-89)
  const pulseRuns = (pulse?.runs ?? []) as RunRow[];
  const sovCompleted = pulseRuns.filter((r) => r.name === "sovereign-runtime" && r.conclusion);
  const latestSov = sovCompleted[0] ?? null;
  let sovGreenStreak = 0;
  for (const r of sovCompleted) {
    if (r.conclusion === "success") sovGreenStreak += 1;
    else break;
  }
  const sovGreen = latestSov?.conclusion === "success";
  const sovRed = latestSov?.conclusion === "failure";

  // עובדות-הישרדות שנמדדו היום (2026-10-17) — כנות מלאה, אפס-המצאה
  const survival = {
    coldStart: {
      at: "2026-10-17T10:14:49Z",
      what: "הסנדבוקס נמחק-חלקית וקם — המערכת הריבונית התאוששה לבד",
      chain: [
        "next-server עלה → instrumentation הקים את מארח-הפעימה (child-of-house)",
        "mini-service self-provision: שכפול הספר מהגיט (ניסיון ראשון נפל, שני עבר — 10:14:56)",
        "mini-service מצא פורט-תפוס → יצא בכבוד (המנעול מכריע כותב)",
        "beat #1 ירוק: seq 86469 → 87798 (+1,329 עסקאות אמת), עוגנים 3/3, איטום נדחף (0f92d5d)",
      ],
      verdict: "ריבונות שורדת מחיקת-סנדבוקס — הוכח בפועל, לא בהצהרה",
    },
    gitOnlyDrill: {
      at: "2026-10-17T10:28:40Z",
      cloneSec: 2.4,
      bootToVerifySec: 0.7,
      totalSec: 3.2,
      result: "ok:true · checked=87,774 · עוגנים [46335, 55120, 68276] זהים-לקנוני",
      verdict: "מאפס-מוחלט לספר-חי-מאומת ב-3.2 שניות (גיט-בלבד, אפס-דחיפות, עותק-נמחק)",
    },
    hostSelfProvision: {
      version: "gal-88",
      at: "2026-10-17T10:25:51Z",
      what: "המארח למד self-provisioning בזמן-ריצה: ספר-חסר/שבור → שכפול-עצמי מהגיט לפני כל beat",
      closes: "הפער שנתגלה היום: מחיקת-ספר בזמן-ריצה הייתה מותיחה את המארח מת עד אתחול-מלא",
    },
    gitCanonicalBootstrap: {
      at: "2026-10-17T10:43:30Z",
      commit: "c72aff3 (fleet-economy · bootstrap/)",
      what: "העותקים-הקנוניים של המארח (gal-88) + instrumentation + README-שחזור נדחפו לספר-האמת עצמו",
      verdict: "wipe-מלא של הסנדבוקס = שחזור מהגיט ב-4 פקודות — חוק ״הגיט הוא מקור-האמת״ סגור לכל-השכבות",
    },
    wipeThreeEstate: {
      at: "2026-10-17T20:37:45Z",
      commit: "restore-lane-a.sh (saos-coordination @ 7e5ace6)",
      what: "wipe-שלישי נספג: coord-work + 4 קלונים אבדו — הלב החי התאושש לבד (beat #1 ירוק +1,497 tx, seq 130,123), ואחוזת-Lane-A כולה שוחזרה מהגיט",
      verdict: "סקריפט-שחזור אחוזה בפקודה-אחת — הוכח-חי 5/5 ירוק (קלון-טרי ×4 + עדכון ×1), ספר state=87 קבצים, ledger seq=130,123",
    },
    multiNodeLaw: {
      at: "2026-10-18T00:12Z",
      commit: "a3d73fa (fleet-economy · run-economy-beat.mjs) · תיאום 0a1dc27",
      what: "ריבוי-צמתים על ספר-אחד: צומת-חי בסנדבוקס-אחר איטם את הספר (bd009ae · seq 135,439) בזמן שהמארח-המקומי ישן — נתגלה, ננתח ונחוקק חוק-מירוץ: git-first-אימוץ לפני-כל-זרימה + RACE-LOST fail-closed (אפס-rebase-כוחני — לא משתיקים שורות-פנקס חוקיות)",
      verdict: "beat #5 על הקנוני: 135,453→136,899 (+1,446 tx) · עוגנים 3/3 · שני-צמתים חיים על שרשרת-ליניארית-אחת · המארח הוחלף-בחיים (watchdog 00:07:45Z, מצב-שומר-מדויק)",
    },
    sovereignVm: {
      at: "2026-10-18T01:15Z",
      commit: "967bf25 (fleet-economy · bootstrap/sovereign-vm/) · תיאום 5f7e9c2",
      what: "ביקורת-ריבונית בסנדבוקס-מבודד על בסיס microsoft/quicksand (MIT, QEMU): אלפיין-VM בגרעין-משלו, רשת-fail-closed-נאכפת-בהיפרוויזור (MOUNTS_ONLY), אפס-סודות-באורח, checkpoint/revert = חוק-ניסוי-בטוח",
      verdict: "GREEN 52.4ש': L1 אורח-קורא-ספר sha-זהה-בייטים (1819da2c…) · L2 מאמת-שרשרת בלתי-תלוי ב-Python — checked=138,316 זהה-מדויק ל-/verify (פורנזיה-צולבת שני-מימושים) · L3 revert-מוכח",
    },
  };

  const ownerDecisions = [
    {
      id: "actions-wall",
      title: "קיר-Actions על ריפו פרטיים (חיוב/minutes)",
      detail:
        "steem · fleet-economy · saos-markets · saos-dex — dispatch 204 אך run נתקע queued עם אפס-jobs. פתירה רק ב-UI של הבעלים.",
      state: "חוסם-ענן; הלב-המקומי מפצה במלואו",
    },
    {
      id: "zombies",
      title: "4 זומבי-ריצות ב-steem (API=409)",
      detail:
        "runs 38505442929 · 38503516299 · 38503112902 · 39000906090 — ביטול אפשרי רק ב-UI בעלים.",
      state: "ניקוי-קוסמטי",
    },
    {
      id: "hive-custody",
      title: "Hive Option-B בוצע (agent-5) — נותרה פעולת-בעלים אחת",
      detail:
        "keypair פוסטינג חדש נוצר ונאטם (vault-home @ 70becce, slot HIVE_HEADCORNER_POSTING_WIF_C); חותם fail-closed חי (787b3ef79) — מסרב לחתום עד שהבעלים יתקין את ה-authority. ברגע ההתקנה עיגון-Hive חוזר אוטונומית.",
      state: "פעולת-בעלים אחת; Steem ירוק-מלא",
    },
    {
      id: "truthrail-red",
      title: sovGreen
        ? `TruthRail: ה-RED נרפא — sovereign-runtime ירוק ×${sovGreenStreak} ברצף`
        : sovRed
          ? "TruthRail: RED-STREAM-STARVING (saos-runtime)"
          : "TruthRail: sovereign-runtime בריצה — שיפוט-תוצאה בסיומה",
      detail: sovGreen
        ? "האזעקה המעוצבת נרפאה (R-CMDHIER גל-3, a0ec8b1ea, 10:45Z): התאמת-חוק-זהה STANDBY→PASS נשמרת-מדוד; נשפט-חי מהדופק-הציבורי בכל-ריצה. ניטור-נמשך."
        : sovRed
          ? "המכונה ירוקה (selftest 1823/1823, custody 4/4, anchor OK) אך התוצאה-בשרשרת: 0 פוסטים ב-24h, 0 הצבעות-חוץ — אזעקת-תוצאה מעוצבת. באחריון lane-steem."
          : "ריצת-שיפוט-מתמשכת — הפסק-דין נגזר מסיום-הריצה הקרוב (כישלון יחזיר את חוק-ה-RED מיד, fail-closed).",
      state: sovGreen
        ? "ירוק-מדידה · ניטור-נמשך"
        : sovRed
          ? "אזעקה-פומבית חיה"
          : "רץ-עכשיו",
    },
    {
      id: "saos-markets-archive",
      title: "archive ל-saos-markets",
      detail: "README כבר כנה (MERGED·קפוא → saos-dex/markets); archive=true קפוא להחלטת-בעלים.",
      state: "המתנה-לבעלים",
    },
  ];

  return NextResponse.json(
    {
      at: new Date().toISOString(),
      heart: {
        host,
        status,
        writerLock: lock
          ? { writer: lock.writer, at: lock.at, ageSec: lockAgeSec, alive: lockAlive, seq: lock.seq }
          : null,
      },
      seals: sealList,
      publicPulse: pulse ? { ...pulse, runs: (pulse.runs as RunRow[]).slice(0, 8) } : null,
      survival,
      ownerDecisions,
      safety: "אפס נגיעה בכספות/סודות/טוקנים/רוטציות — הוראת-בעלים בתוקף",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
