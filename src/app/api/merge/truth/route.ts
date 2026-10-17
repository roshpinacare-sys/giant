import { SAOS_PROJECT_ROOT } from "@/lib/saos-paths";
// GET /api/merge/truth · המיזוג-האמיתי — כל-טענה-עם-הוכחה-נמדדת-חיה (משימה-51)
// חוק-אמת: אפס-טענות-סוכנים-קשיחות. הטוב-שהביא-כל-אחד מוצג-כ"טענה→הוכחה-נמדדת"
// כשההוכחה-נמדדת-בזמן-ריצה (דיסק · grep · DB · git-log) — וכל-נתיב-מקשר-למסך-החי-שבו-הדבר-באמת-חי.
// הבעלים (trace 1a13cd190aa51e8d): "צריך דברים שיהיו מה שכתוב שיהיה".

import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { readRepoFile, readLedger, buildCatalog } from "@/lib/git-content";
import { discoverGitRepos, gitMeta, type GitMeta } from "@/lib/estate-discovery";

export const dynamic = "force-dynamic";

const SYS = SAOS_PROJECT_ROOT;

async function fileBytes(rel: string): Promise<number | null> {
  try {
    const st = await stat(path.join(SYS, rel));
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

async function countInFile(rel: string, needle: string): Promise<number | null> {
  try {
    const body = await readFile(path.join(SYS, rel), "utf8");
    if (!body.includes(needle)) return 0;
    return body.split(needle).length - 1;
  } catch {
    return null;
  }
}

/** ספירת-קבצי-route.ts תחת-src/app/api — וכמה-מהם-שעורים-ב-isOwnerReq */
async function gateCoverage(): Promise<{ routes: number; gated: number }> {
  let routes = 0;
  let gated = 0;
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name === "route.ts") {
        routes += 1;
        try {
          const body = await readFile(full, "utf8");
          if (body.includes("isOwnerReq")) gated += 1;
        } catch {
          // קריאה-נכשלה — לא-נחשב-שעור
        }
      }
    }
  };
  await walk(path.join(SYS, "src/app/api"));
  return { routes, gated };
}

export interface LawOut {
  n: number;
  name: string;
  body: string;
}

export interface LaneProofOut {
  metric: string;
  value: string;
  how: string;
  ok: boolean;
}

export interface LaneOut {
  id: string;
  lane: string;
  who: string;
  claim: string;
  view: string;
  proofs: LaneProofOut[];
  ok: boolean;
}

export interface IdentityOut {
  name: string;
  commits: number;
  repos: string[];
}

function parseLaws(md: string): LawOut[] {
  const laws: LawOut[] = [];
  const re = /^\s*(\d+)\.\s+\*\*(.+?)\*\*\s+—\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    laws.push({ n: Number(m[1]), name: m[2].trim(), body: m[3].trim() });
  }
  // חוק-11 נולד-בפורמט-אחר ("**חוק-חדש-שנגזר (11):** ...") — נתפוס-גם-אותו
  if (!laws.some((l) => l.n === 11)) {
    const m11 = md.match(/\*\*חוק-חדש-שנגזר\s*\(11\):\*\*\s*([^\n]+)/);
    if (m11) {
      const body = m11[1].trim();
      const name = body.split(/[—.]/)[0].trim() || "היכולת-נרשמת";
      laws.push({ n: 11, name, body });
    }
  }
  return laws.sort((a, b) => a.n - b.n);
}

export async function GET() {
  try {
    // ---- 1) החוקים — נקראים-חי-מהסכם-המיזוג-בגיט (מקור-אחד-בלבד, אפס-שכפול) ----
    const agreement = await readRepoFile("Sandbox", "giant/MERGE-AGREEMENT.md");
    const laws = agreement ? parseLaws(agreement.content) : [];
    const agreementOk = Boolean(agreement) && laws.length > 0;

    // ---- 2) זהויות-אמת מ-git-log על-פני-כל-תיקיות-הגיט (מדידה-חיה) ----
    const repos = await discoverGitRepos();
    const metas = await Promise.all(
      repos.map(async (r) => ({ r, meta: await gitMeta(r.dir).catch(() => null) })),
    );
    const byName = new Map<string, IdentityOut>();
    for (const { r, meta } of metas) {
      const m: GitMeta | null = meta;
      if (!m) continue;
      for (const a of m.authors) {
        const cur = byName.get(a.name) ?? { name: a.name, commits: 0, repos: [] };
        cur.commits += a.commits;
        const label = r.generation === "system" ? "המערכת" : r.relName;
        if (!cur.repos.includes(label)) cur.repos.push(label);
        byName.set(a.name, cur);
      }
    }
    const identities = Array.from(byName.values())
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 12);

    // ---- 3) נתיבי-המייסדים — טענה→הוכחה-נמדדת (המיזוג-עצמו) ----
    const [
      pageBytes,
      caseCount,
      msgCount,
      feedBytes,
      feedBinance,
      terminalBytes,
      candleBytes,
      tickers24Wired,
      viewsBytes,
      ledgerRows,
      catalogFiles,
      engineRejects,
      faucetClamp,
      faucetSaosMint,
      gates,
      skillRunCount,
    ] = await Promise.all([
      fileBytes("src/app/page.tsx"),
      countInFile("src/app/page.tsx", '{ id: "'),
      db.sovereignMessage.count().catch(() => 0),
      fileBytes("src/lib/market-feed.ts"),
      countInFile("src/lib/market-feed.ts", "binance"),
      fileBytes("src/components/giant/DexView.tsx"),
      fileBytes("src/components/giant/CandleChart.tsx"),
      countInFile("src/lib/dex-engine.ts", "binanceTickers24h"),
      fileBytes("src/components/giant/LedgerView.tsx"),
      readLedger().then((l) => l.total).catch(() => 0),
      buildCatalog().then((s) => s.reduce((n, x) => n + x.files.length, 0)).catch(() => 0),
      countInFile("src/lib/dex-server.ts", "אין-מספיק"),
      countInFile("src/app/api/dex/wallet/faucet/route.ts", '? "USDS" : "USDS"'),
      countInFile("src/app/api/dex/wallet/faucet/route.ts", 'token: "SAOS"'),
      gateCoverage(),
      db.skillRun.count().catch(() => 0),
    ]);

    const fmtB = (b: number | null) => (b === null ? "—" : b >= 1024 ? `${(b / 1024).toFixed(1)}KB` : `${b}B`);
    /* שדה-ה-ok-ברמת-המסלול נגזר-מההוכחות-המדודות — אין-שיקול-דעת ואין-קישוט */
    const laneDrafts = [
      {
        id: "unified",
        lane: "הממשק-המאוחד",
        who: "ערוץ-הריבון + ההגשה-הסופית + מסך-אחד-לכל-המערכת",
        claim: "מסך-אחד-חי שמחבר-את-כל-הריבונות — לא-5-ממשקים-מקבילים",
        view: "final",
        proofs: [
          { metric: "מסך-האם-חי-על-הדיסק", value: fmtB(pageBytes), how: "stat(src/app/page.tsx)", ok: (pageBytes ?? 0) > 10_000 },
          { metric: "דלתות-הממשק-המאוחד (VIEWS)", value: String(caseCount ?? "—"), how: "ספירת-דלתות-ב-page.tsx", ok: (caseCount ?? 0) >= 15 },
          { metric: "הודעות-בערוץ-מה-DB", value: String(msgCount ?? "—"), how: "db.sovereignMessage.count()", ok: (msgCount ?? 0) > 0 },
        ],
      },
      {
        id: "trade",
        lane: "הנדסת-מסחר",
        who: "טרמינל-המסחר: נרות, עומק, סרט — השוק-האמת (Binance-חי)",
        claim: "הבורסה-מציגה-שוק-אמת — לא-נרות-שטוחים-של-גיבוב-AI",
        view: "dex",
        proofs: [
          { metric: "הזנת-השוק-האמת-קיימת", value: fmtB(feedBytes), how: "stat(src/lib/market-feed.ts)", ok: (feedBytes ?? 0) > 2_000 },
          { metric: "חיבורי-Binance-בקוד-ההזנה", value: String(feedBinance ?? "—"), how: "ספירת-binance ב-market-feed.ts", ok: (feedBinance ?? 0) >= 3 },
          { metric: "דוכן-המסחר+נרות-על-הדיסק", value: `${fmtB(terminalBytes)} + ${fmtB(candleBytes)}`, how: "stat(DexView.tsx, CandleChart.tsx) — סף-אנטי-סטאב (המרכיבים-הממוזגים-מודולריים-מהקודמים)", ok: (terminalBytes ?? 0) > 10_000 && (candleBytes ?? 0) > 3_000 },
          { metric: "סטטיסטיקת-24h-אמת-בטיקר", value: tickers24Wired ? "מחובר" : "—", how: "grep binanceTickers24h ב-dex-engine.ts", ok: (tickers24Wired ?? 0) >= 1 },
        ],
      },
      {
        id: "git2prod",
        lane: "גיט→מוצר",
        who: "הלדג'ר, הקטלוג-המצונן, וקריאת-הארכיון-האמיתי",
        claim: "הגיט-הוא-הזיכרון — והוא-נקרא-למסך-חי, לא-נשאר-סיפור",
        view: "ledger",
        proofs: [
          { metric: "טבלת-הלדג'ר-על-הדיסק", value: fmtB(viewsBytes), how: "stat(LedgerView.tsx) — סף-אנטי-סטאב; המהות-נמדדת-ברישומי-המשמרת-מתחת", ok: (viewsBytes ?? 0) > 3_000 },
          { metric: "רישומי-משמרת-בלדג'ר", value: String(ledgerRows ?? "—"), how: "readLedger() — ops/AGENT-LEDGER.md", ok: (ledgerRows ?? 0) > 0 },
          { metric: "פריטי-קטלוג-חיים", value: String(catalogFiles ?? "—"), how: "buildCatalog() — קיום-נבדק-בזמן-ריצה", ok: (catalogFiles ?? 0) > 30 },
          { metric: "תיקיות-גיט-נסרקות", value: String(repos.length), how: "discoverGitRepos() — טופולוגיית-גל-18 (14: מערכת+8-עוגנים+5-מורשת)", ok: repos.length >= 14 },
        ],
      },
      {
        id: "honesty",
        lane: "כנות-תיקון",
        who: "דחיית-SELL-בכנות-כשאין-יתרה · ברז-שמנפיק-רק-אשראי-אמת",
        claim: "כישלון-מדווח-כמו-שהוא — אין-קישוט-של-כישלון-ואין-מטבע-מת",
        view: "dex",
        proofs: [
          { metric: "דחייה-כנה-בביצוע-ההחלפה", value: engineRejects ? "נמצאה" : "—", how: "grep אין-מספיק ב-dex-server.ts (executeSwap)", ok: (engineRejects ?? 0) >= 1 },
          { metric: "הברז-כופה-USDS-בלבד", value: faucetClamp ? "נאכף" : "—", how: "grep כפיית-הטוקן ב-faucet/route.ts", ok: (faucetClamp ?? 0) >= 1 },
          { metric: "טביעת-SAOS-בברז", value: faucetSaosMint === 0 ? "0 — אסור-ואסור" : String(faucetSaosMint ?? "—"), how: "grep token-SAOS ב-faucet/route.ts", ok: faucetSaosMint === 0 },
        ],
      },
      {
        id: "security",
        lane: "אבטחה",
        who: "שערי-headcorner על-כל-מסלול-שמזיז-כסף",
        claim: "אימות-בעלים-על-המסלולים-הרגישים — ה-401-הכנה-היא-תכונה",
        view: "ops",
        proofs: [
          { metric: "מסלולי-API-במערכת", value: String(gates.routes), how: "מניין-route.ts-תחת-src/app/api", ok: gates.routes > 0 },
          { metric: "מסלולים-שעורים-ב-isOwnerReq", value: String(gates.gated), how: "grep-מלא-על-כל-קבצי-המסלולים", ok: gates.gated >= 5 },
        ],
      },
      {
        id: "skills",
        lane: "מרכז-היכולות",
        who: "יכולות-SDK-אמת-שרצות-ונרשמות — הקטלוג-הוא-נתונים",
        claim: "יכולת-שאינה-מורצת-ואינה-נרשמת — לא-מוצהרת (חוק-11)",
        view: "skills",
        proofs: [
          { metric: "הרצות-יכולת-רשומות-ב-DB", value: String(skillRunCount ?? "—"), how: "db.skillRun.count()", ok: (skillRunCount ?? 0) > 0 },
        ],
      },
    ];

    const lanes: LaneOut[] = laneDrafts.map((l) => ({ ...l, ok: l.proofs.every((p) => p.ok) }));

    return NextResponse.json({
      ok: true,
      measuredAt: new Date().toISOString(),
      agreement: {
        ok: agreementOk,
        repo: agreement?.repo ?? "Sandbox",
        path: agreement?.path ?? "giant/MERGE-AGREEMENT.md",
      },
      laws,
      identities,
      lanes,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "שגיאת-מדידה" },
      { status: 500 },
    );
  }
}
