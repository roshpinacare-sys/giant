/**
 * GET /api/giant/gate — מצב-השער (T64): "וודא שגם פותח את השער כי מפתח עדיין לא מאומת"
 *
 * פסק-הדין-האמיתי, על-שני-מישורים שלא מדירים זה את זה:
 *  1. הקבלה-המקומית (db/gate-check.json): 53 מועמדים מחומר-הבעלים על-המכונה,
 *     נגזרו מול הרשויות-החיות של @owner ו-@headcorner בשרשרת-Steem (קריאה-בלבד).
 *     שני-קבצים התאימו ביט-מול-ביט בכל-ארבעת-התפקידים → המפתח אמיתי.
 *  2. עדות-ה-Actions (בתוך-הקבלה): ריצת key-verify מוצלחת (run 38661586814,
 *     e89de38) — פסק-דין armed, אטימה לכספת saos-dex (STEEM_ACTIVE_WIF,
 *     2026-10-15T00:43:01Z, אומת דרך רשימת-הסודות), הגריד כבוי-ידנית (כנה).
 *
 * מדידת-דלת חיה בכל-בקשה: שורות-ה-yml וה-verifier נקראות מהעותק-הקנוני.
 * חוזה-אפס-זיופים: אפס ערכי-מפתח בתשובה · כישלון-קריאה נרשם ב-errors[]
 * · cache-זיכרון 60 שניות · sha16 על-המטען.
 */
import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FleetBlockedWorkflow, FleetCensus, GateBarriers, GateBarrierWorkflow, GateCheckReceipt, GateDoor, GatePayload } from "@/lib/giant/gate-types";
import type { FlowTrajectory } from "@/lib/giant/flow-types";
import { measureFlow } from "@/lib/giant/flow";
import { recordMeasurement, readTrajectory } from "@/lib/giant/flow-ledger";
import { loadDex } from "@/app/api/giant/dex/route";
import { readPat } from "@/lib/office-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
let cache: { at: number; payload: GatePayload } | null = null;

const RECEIPT = path.join("/home/z", "my-project", "db", "gate-check.json");
const DOMAIN = path.join("/home/z", "estate", "Domain");
const WORKFLOW = path.join(DOMAIN, ".github", "workflows", "key-verify.yml");
const VERIFIER = path.join(DOMAIN, "agents", "key-verify.mjs");

/** T66 · מנוע-הזרימה-הכלכלית: אלו-workflows הם הכסף (השאר = תשתית/שומרים) */
const ECONOMIC = new Set(["dex-beat.yml", "dex-grid.yml", "grid-trigger.yml", "mm-supremacy.yml", "arb-scan.yml", "llm-bridge.yml"]);

/**
 * T66 · מדידת-החסמים-הכלכליים — מצב-workflows של saos-dex נמדד-חי מה-API.
 * הוראת-הבעלים: "כל החסמים הכלכליים פתח" — המדידה מראה את המצב-בפועל.
 * כישלון = כנה: barriers=null + errors[]. אפס-סודות בתשובה.
 *
 * T69 · מדידת-הזרימה נתלשה-מכאן למודול-האמת-היחיד (@/lib/giant/flow) —
 * DexView · WalletView ו-gate מודדים-עכשיו את-אותו-דופק בדיוק, אפס-שכפול.
 */
/**
 * T68 · מפקד-הצי — מצב-workflows על-כל-המאגרים. cache-נפרד 10 דק' (15+ קריאות-API);
 * הערת-הכרעה-מתועדת (content-campaign) מסומנת — כנות-מלאה, אפס-הסתרה.
 */
const CENSUS_CACHE_MS = 10 * 60_000;
let censusCache: { at: number; data: FleetCensus | null } | null = null;

async function measureFleetCensus(errors: string[]): Promise<FleetCensus | null> {
  if (censusCache && Date.now() - censusCache.at < CENSUS_CACHE_MS) return censusCache.data;
  try {
    const pat = await readPat();
    if (!pat) return null;
    const res = await fetch("https://api.github.com/users/roshpinacare-sys/repos?per_page=100&type=owner", {
      headers: { authorization: `Bearer ${pat}`, accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      errors.push(`מפקד-הצי: רשימת-מאגרים השיבה HTTP ${res.status}`);
      return null;
    }
    const repos = ((await res.json()) as { name: string }[]).map((r) => r.name);
    repos.push("saos-dex"); // הקאנון-הפרטי — נמדד-גם-הוא
    const blocked: FleetBlockedWorkflow[] = [];
    let total = 0;
    let active = 0;
    const perRepo = await Promise.all(
      repos.map(async (repo): Promise<{ total: number; active: number; blocked: FleetBlockedWorkflow[] } | null> => {
        try {
          const r = await fetch(`https://api.github.com/repos/roshpinacare-sys/${repo}/actions/workflows?per_page=100`, {
            headers: { authorization: `Bearer ${pat}`, accept: "application/vnd.github+json" },
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          });
          if (!r.ok) return null;
          const j = (await r.json()) as { workflows?: { path: string; state: string }[] };
          const list = Array.isArray(j.workflows) ? j.workflows : [];
          const repoBlocked = list
            .filter((w) => w.state !== "active")
            .map((w) => ({
              repo,
              workflow: w.path.split("/").pop() ?? w.path,
              state: w.state,
              documented:
                repo === "Domain" && w.path.endsWith("content-campaign.yml")
                  ? "הכרעת-בעלים-מתועדת בקובץ (2026-10-13): זהות-פרסום-היא-הצפון-של-הבעלים; התאום-הבריא-מפרסם-שעתית"
                  : undefined,
            }));
          return { total: list.length, active: list.filter((w) => w.state === "active").length, blocked: repoBlocked };
        } catch {
          return null;
        }
      }),
    );
    for (const p of perRepo) {
      if (!p) continue;
      total += p.total;
      active += p.active;
      blocked.push(...p.blocked);
    }
    const census: FleetCensus = {
      measuredAt: new Date().toISOString(),
      reposMeasured: perRepo.filter(Boolean).length,
      totalWorkflows: total,
      active,
      blocked: blocked.sort((a, b) => a.repo.localeCompare(b.repo) || a.workflow.localeCompare(b.workflow)),
    };
    censusCache = { at: Date.now(), data: census };
    return census;
  } catch (e) {
    errors.push(`מפקד-הצי נכשל: ${String(e).slice(0, 90)}`);
    return null;
  }
}

async function measureBarriers(errors: string[]): Promise<GateBarriers | null> {
  try {
    const pat = await readPat();
    if (!pat) {
      errors.push("מדידת-החסמים: אין-גישה-מאומתת ל-API (PAT חסר) — כנה");
      return null;
    }
    const res = await fetch("https://api.github.com/repos/roshpinacare-sys/saos-dex/actions/workflows?per_page=50", {
      headers: { authorization: `Bearer ${pat}`, accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      errors.push(`מדידת-החסמים נכשלה: API השיב HTTP ${res.status}`);
      return null;
    }
    const j = (await res.json()) as { workflows?: { path: string; name: string; state: string }[] };
    const list = Array.isArray(j.workflows) ? j.workflows : [];
    if (list.length === 0) {
      errors.push("מדידת-החסמים: ה-API החזיר אפס-workflows — כנה");
      return null;
    }
    const workflows: GateBarrierWorkflow[] = list
      .map((w) => ({
        path: w.path.split("/").pop() ?? w.path,
        name: w.name,
        state: w.state,
        economic: ECONOMIC.has(w.path.split("/").pop() ?? ""),
      }))
      .sort((a, b) => Number(b.economic) - Number(a.economic) || a.path.localeCompare(b.path));
    const economic = workflows.filter((w) => w.economic);
    const flow = await measureFlow(errors);
    return {
      measuredAt: new Date().toISOString(),
      repo: "roshpinacare-sys/saos-dex",
      workflows,
      active: workflows.filter((w) => w.state === "active").length,
      total: workflows.length,
      economicActive: economic.filter((w) => w.state === "active").length,
      economicTotal: economic.length,
      flow,
    };
  } catch (e) {
    errors.push(`מדידת-החסמים נכשלה: ${String(e).slice(0, 90)}`);
    return null;
  }
}

async function measureDoor(errors: string[]): Promise<GateDoor | null> {
  try {
    const [yml, mjs] = await Promise.all([fs.readFile(WORKFLOW, "utf8"), fs.readFile(VERIFIER, "utf8")]);
    let workflowSha: string | null = null;
    try {
      workflowSha =
        execSync(
          `git -C ${DOMAIN} log -1 --format=%h -- .github/workflows/key-verify.yml agents/key-verify.mjs`,
          { encoding: "utf8", timeout: 5_000 },
        ).trim() || null;
    } catch {
      workflowSha = null;
    }
    const door: GateDoor = {
      domainPresent: true,
      workflowSha,
      rosterEnvPassed: /FLEET_ROSTER_MAP:\s*\$\{\{ secrets\.FLEET_ROSTER_MAP \}\}/.test(yml),
      fleetAccountPassed: /FLEET_ACCOUNT:\s*\$\{\{ secrets\.FLEET_ACCOUNT \}\}/.test(yml),
      secretSource: (yml.match(/owner:\s*\$\{\{ secrets\.([A-Z_]+) \}\}/) || [])[1] ?? null,
      gridSignerDynamic: /const ACCOUNT = process\.env\.FLEET_ACCOUNT \|\| "owner";/.test(mjs),
      receiptSummaryOnly: /NOT persisted \(P0-1 law\)/.test(mjs),
    };
    return door;
  } catch (e) {
    errors.push(`מדידת-הדלת נכשלה: ${String(e).slice(0, 90)}`);
    return null;
  }
}

async function buildPayload(): Promise<GatePayload> {
  const errors: string[] = [];
  let receipt: GateCheckReceipt | null = null;
  let receiptAgeMin: number | null = null;
  try {
    const raw = await fs.readFile(RECEIPT, "utf8");
    receipt = JSON.parse(raw) as GateCheckReceipt;
    const at = Date.parse(receipt.generatedAt || "");
    if (Number.isFinite(at)) receiptAgeMin = Math.floor((Date.now() - at) / 60_000);
  } catch (e) {
    errors.push(`קבלת-השער לא נקראה: ${String(e).slice(0, 90)}`);
  }

  const door = await measureDoor(errors);
  const barriers = await measureBarriers(errors);
  const census = await measureFleetCensus(errors);

  /* T70 · מסלול-הזרימה: מדידה-עצמית-של-הגובה + רישום-בפנקס (כנה; דדופ/חנק = תקין) */
  let flowTrajectory: FlowTrajectory | null = null;
  try {
    const dex = await loadDex();
    if (dex.ok && typeof dex.height === "number" && dex.height > 0) {
      const res = await recordMeasurement(dex.height, dex.savedAt, new Date().toISOString());
      if (res === "failed") errors.push("רישום-המדידה-בפנקס נכשל — כנה");
    }
    flowTrajectory = await readTrajectory();
  } catch (e) {
    errors.push(`מסלול-הזרימה-בשער נכשל: ${String(e).slice(0, 90)}`);
  }

  const gateOpen =
    receipt?.verdict === "KEY-AUTHENTIC-ACTIVE" &&
    !!receipt?.actions?.runs?.some((r) => r.conclusion === "success" && r.verdict === "armed") &&
    !!door?.rosterEnvPassed &&
    !!door?.fleetAccountPassed;

  return {
    ok: true,
    receipt,
    receiptAgeMin,
    door,
    gateOpen,
    barriers,
    census,
    flowTrajectory,
    errors,
    sha16: "",
  };
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, {
      headers: { "x-gate-sha16": cache.payload.sha16 },
    });
  }
  const payload = await buildPayload();
  payload.sha16 = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store", "x-gate-sha16": payload.sha16 },
  });
}
