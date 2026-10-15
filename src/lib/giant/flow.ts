/**
 * T69 · מודול-הזרימה — מקור-האמת-היחיד לדופק-מנועי-הכסף.
 * נולד ב-gate (T67) ונתלש-ממנו כדי-שכל-המשטחים-הכלכליים (Dex · Wallet · Gate)
 * ימדדו-את-אותו-דופק-בדיוק — אפס-שכפול, אפס-סתירה.
 *
 * חוזה-אפס-זיופים: כישלון = כנה (null + errors[]) · cache-זיכרון 60 שניות ·
 * אפס-סודות בתשובה · המדידה-חיה מה-API בכל-ניפוח-קייש.
 */
import type { EngineFlow, EngineFlowBeat } from "@/lib/giant/flow-types";
import { readPat } from "@/lib/office-truth";

/** המכונה-האמיתית: התאום-הציבורי ב-Domain (R71) — הקדנס-שם; saos-dex הוא גיבוי-dispatch */
export const FLOW_REPO = "roshpinacare-sys/Domain";
export const FLOW_BEATS = ["dex-beat.yml", "dex-grid.yml", "economy-engine.yml"];

const CACHE_MS = 60_000;
let cache: { at: number; flow: EngineFlow | null } | null = null;

export async function measureFlow(errors: string[]): Promise<EngineFlow | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.flow;
  try {
    const pat = await readPat();
    if (!pat) {
      errors.push("מדידת-הזרימה: אין-גישה-מאומתת ל-API (PAT חסר) — כנה");
      cache = { at: Date.now(), flow: null };
      return null;
    }
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
      cache = { at: Date.now(), flow: null };
      return null;
    }
    const flow: EngineFlow = { repo: FLOW_REPO, measuredAt: new Date().toISOString(), beats: valid };
    cache = { at: Date.now(), flow };
    return flow;
  } catch (e) {
    errors.push(`מדידת-הזרימה נכשלה: ${String(e).slice(0, 90)}`);
    cache = { at: Date.now(), flow: null };
    return null;
  }
}
