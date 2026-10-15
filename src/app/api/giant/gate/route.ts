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
import type { EngineFlow, EngineFlowBeat, GateBarriers, GateBarrierWorkflow, GateCheckReceipt, GateDoor, GatePayload } from "@/lib/giant/gate-types";
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
 */
/** T67 · המכונה-האמיתית: התאום-הציבורי ב-Domain (R71) — הקדנס-שם; saos-dex-הוא-גיבוי-dispatch */
const FLOW_REPO = "roshpinacare-sys/Domain";
const FLOW_BEATS = ["dex-beat.yml", "dex-grid.yml", "economy-engine.yml"];

/**
 * T67 · מדידת-הזרימה — ריצות-אחרונות של-מנועי-הכסף-על-המכונה-האמיתית.
 * נמדד-חי מה-API בכל-בקשה; כישלון = כנה (flow=null + errors[]).
 */
async function measureFlow(errors: string[]): Promise<EngineFlow | null> {
  try {
    const pat = await readPat();
    if (!pat) return null;
    const beats = await Promise.all(
      FLOW_BEATS.map(async (wf): Promise<EngineFlowBeat | null> => {
        try {
          const res = await fetch(`https://api.github.com/repos/${FLOW_REPO}/actions/workflows/${wf}/runs?per_page=4`, {
            headers: { authorization: `Bearer ${pat}`, accept: "application/vnd.github+json" },
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return null;
          const j = (await res.json()) as {
            workflow_runs?: { event: string; conclusion: string | null; created_at: string }[];
          };
          const runs = Array.isArray(j.workflow_runs) ? j.workflow_runs : [];
          if (runs.length === 0) return null;
          const success = runs.find((r) => r.conclusion === "success");
          return {
            workflow: wf,
            event: runs[0].event ?? "",
            conclusion: runs[0].conclusion ?? "running",
            lastSuccessAt: success?.created_at ?? null,
          };
        } catch {
          return null;
        }
      }),
    );
    const valid = beats.filter((b): b is EngineFlowBeat => b !== null);
    if (valid.length === 0) {
      errors.push("מדידת-הזרימה: אף-ריצה-לא-נמדדה — כנה");
      return null;
    }
    return { repo: FLOW_REPO, measuredAt: new Date().toISOString(), beats: valid };
  } catch (e) {
    errors.push(`מדידת-הזרימה נכשלה: ${String(e).slice(0, 90)}`);
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
