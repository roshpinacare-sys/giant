import { SAOS_ESTATE } from "@/lib/saos-paths";
// giant · שכבת-תוכן-הגיט (גיט→מוצר, v2): קטלוג-מאובטח של התוכן-הטוב-מכל-התיקיות
// ביטחון: התמדה-ברשימת-ריפו-מותרים · איסור-'..'-וסיומות-סוד · תקרת-קריאה · אין-הדלפת-נתיבים-רגישים

import { readFile, readdir, stat } from "fs/promises";
import path from "path";

export const REPOS: Record<string, string> = {
  /* גל-18 · חיווט-מחדש: העותקים-החיים-על-הדיסק-הם-עוגני-estate-sync
   * (נמשכים-מהקנון-כל-10 דק) — לא-עוד-t36 שנמחק-עם-הסנדבוקס-הקודם. */
  Sandbox: `${SAOS_ESTATE}/Sandbox`,
  Domain: `${SAOS_ESTATE}/Domain`,
  FleetHQ: `${SAOS_ESTATE}/FleetHQ`,
  "saos-dex": `${SAOS_ESTATE}/saos-dex`,
  Console: `${SAOS_ESTATE}/Console`,
  roshpina: `${SAOS_ESTATE}/roshpina`,
};

// אסור-בתוקף: סודות/טוקנים/סביבה
const DENY = /pat\.env|headcorner|\.env$|secret|token|credential|password/i;
export const MAX_BYTES = 400_000;

export interface CatalogFile {
  repo: string;
  path: string;
  title: string;
  size: number;
  updated: string;
  exists: boolean;
}

export interface CatalogSection {
  id: string;
  title: string;
  description: string;
  files: CatalogFile[];
}

const T = (p: string) => p.split("/").pop()?.replace(/\.(md|json|jsonl)$/, "") ?? p;

// התוכן-הטוב-מכל-התיקיות — קטלוג-מצונן (קיום-נבדק-בזמן-ריצה; חסרים-מוסתרים)
const SECTION_DEFS: Array<{ id: string; title: string; description: string; entries: Array<[string, string]> }> = [
  {
    id: "plans",
    title: "תוכניות",
    description: "תוכנית-האם וה-lanes-עם קבלה-מכונתית — חוזה-הצוות כולו",
    entries: [
      ["Sandbox", "ops/plans/MASTER-PLAN-2026-10-14.md"],
      ["Sandbox", "ops/plans/feasibility-world-class-2026-10-11.md"],
      ["Sandbox", "ops/plans/consolidation-26to8-2026-10-11.md"],
      ["Sandbox", "ops/plans/estate-assurance-2026-10-11.md"],
      ["Sandbox", "ops/plans/revival-value-map-2026-10-11.md"],
      ["Sandbox", "ops/plans/zai-grid-ops-2026-10-11.md"],
      ["Sandbox", "ops/plans/archive-prep-2026-10-11.md"],
    ],
  },
  {
    id: "charter",
    title: "אמנת-giant",
    description: "חוקי-הבית, הערוץ-האחד, והפלטפורמה — האמנה-המחייבת-את-הצי",
    entries: [
      ["Sandbox", "giant/MERGE-AGREEMENT.md"],
      ["Sandbox", "giant/README.md"],
      ["Sandbox", "giant/SPEC-CHANNEL.md"],
      ["Sandbox", "giant/SPEC-PLATFORM.md"],
    ],
  },
  {
    id: "team",
    title: "הצוות",
    description: "רישום-הצוות-החי, סוכנים, דוחות-verifier ומשלוחים",
    entries: [
      ["Sandbox", "ops/agents/SWARM-REGISTRY.md"],
      ["Sandbox", "ops/agents/zai-verifier/REPORT.md"],
      ["Sandbox", "ops/agents/zai-verifier/TASKS.md"],
      ["Sandbox", "ops/agents/zai-code-2/scoreboard.md"],
      ["Sandbox", "ops/agents/zai-revive-10/README.md"],
      ["Sandbox", "ops/agents/zai-sec-1a12af86/README.md"],
    ],
  },
  {
    id: "security",
    title: "אבטחה-וחוקים",
    description: "ביקורות-אבטחה, אינוואריאנטים D1–D7, allowlist-ותקציבים",
    entries: [
      ["Sandbox", "ops/security/SECURITY-AUDIT-2026-10-12.md"],
      ["Sandbox", "ops/security/VERIFICATION-2026-10-12.md"],
      ["Sandbox", "ops/sovereign-invariants/SECURITY-INVARIANTS.md"],
      ["Sandbox", "ops/sovereign-invariants/allowlist.json"],
      ["Sandbox", "ops/sovereign-invariants/budgets.json"],
      ["Sandbox", "ops/TOKEN-ROTATION-RUNBOOK.md"],
    ],
  },
  {
    id: "systems",
    title: "מנועים-ומדידות",
    description: "decider, אורקלים, integrity, flow — verdicts-מדודים-חיים",
    entries: [
      ["Sandbox", "ops/decision-truth/verdict.json"],
      ["Sandbox", "ops/fresh-oracle/verdict.md"],
      ["Sandbox", "ops/profit-oracle/verdict.md"],
      ["Sandbox", "ops/evo-windows-staleness/verdict.md"],
      ["Sandbox", "ops/integrity/REPORT.md"],
      ["Sandbox", "ops/integrity/verdict.json"],
      ["Sandbox", "ops/flow/flow-map.md"],
      ["Sandbox", "ops/flow/receipt.json"],
      ["Sandbox", "ops/sovereign/DECIDER/state.json"],
      ["Sandbox", "ops/sovereign/DECIDER/CHARTER.md"],
    ],
  },
  {
    id: "sovereign",
    title: "הריבונות",
    description: "ערוץ-המנהל, חוק-רוטציה, סקופים T13–T18, מבקר-אמת",
    entries: [
      ["Sandbox", "ops/sovereign/OWNER-CHANNEL/README.md"],
      ["Sandbox", "ops/sovereign/ROTATION-LAW-2026-10-11.md"],
      ["Sandbox", "ops/sovereign/TRUTH-AUDIT-2026-10-11T2035Z.md"],
      ["Sandbox", "ops/sovereign/T13-SCOPE-2026-10-11.md"],
      ["Sandbox", "ops/sovereign/T18-SCOPE-2026-10-12.md"],
      ["Sandbox", "ops/sovereign/DIRECTIVES/board.json"],
      ["Sandbox", "ops/sovereign/VALUE-SCAN/FLOORS-LEDGER.md"],
    ],
  },
  {
    id: "ops-core",
    title: "מטה-המערכה",
    description: "אמת-טוקנים, צמיחה, תזרים, ירושה, האצלה, הכרעות-ריבוניות",
    entries: [
      ["Sandbox", "ops/TOKEN-TRUTH.md"],
      ["Sandbox", "ops/GROWTH-PLAN-2026-10-11.md"],
      ["Sandbox", "ops/FLOW-PLAN-2026-10-11.md"],
      ["Sandbox", "ops/ESTATE-TRUTH-2026-10-11.md"],
      ["Sandbox", "ops/OWNER-P0-2026-10-11.md"],
      ["Sandbox", "ops/OWNER-DELEGATION-2026-10-11.md"],
      ["Sandbox", "ops/SOVEREIGN-DECISIONS-2026-10-11.md"],
      ["Sandbox", "ops/SOVEREIGN-RECOVERY-PLAN-2026-10-11.md"],
      ["Sandbox", "ops/SOVEREIGN-REVIVAL-2026-10-11.md"],
      ["Sandbox", "ops/RESUME-PACKET.md"],
      ["Sandbox", "ops/PUBLISHING-POLICY.json"],
      ["Sandbox", "ops/lessons/ledger.md"],
      ["Sandbox", "ops/lessons/retro-2026-W41.json"],
      ["Sandbox", "ops/office/PROTOTYPE-PLAN.md"],
      ["Sandbox", "ops/office/VALUE-MAP.md"],
      ["Sandbox", "ops/office/work-orders.json"],
      ["Sandbox", "ops/token-forge-verdicts.md"],
    ],
  },
  {
    id: "dex",
    title: "דקס-וכלכלה",
    description: "קרדיטים, פורטפוליו, onramp — הכלכלה-החיה-שלנו",
    entries: [
      ["Domain", "dex/credits.json"],
      ["Domain", "dex/portfolio.json"],
      ["Domain", "dex/onramp.json"],
      ["saos-dex", "README.md"],
    ],
  },
];

export async function buildCatalog(): Promise<CatalogSection[]> {
  const sections: CatalogSection[] = [];
  for (const def of SECTION_DEFS) {
    const files: CatalogFile[] = [];
    for (const [repo, rel] of def.entries) {
      const root = REPOS[repo];
      if (!root) continue;
      const abs = path.join(root, rel);
      try {
        const st = await stat(abs);
        files.push({
          repo,
          path: rel,
          title: T(rel),
          size: st.size,
          updated: st.mtime.toISOString(),
          exists: true,
        });
      } catch {
        // קובץ-חסר → לא-מוצג (אין-קישורים-שבורים)
      }
    }
    if (files.length > 0) {
      sections.push({ id: def.id, title: def.title, description: def.description, files });
    }
  }
  return sections;
}

export interface ContentResult {
  repo: string;
  path: string;
  kind: "markdown" | "json" | "jsonl" | "text";
  content: string;
  truncated: boolean;
}

export async function readRepoFile(repo: string, rel: string): Promise<ContentResult | null> {
  const root = REPOS[repo];
  if (!root) return null;
  if (DENY.test(rel)) return null;
  if (rel.includes("..") || rel.startsWith("/")) return null;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return null;
  try {
    const st = await stat(abs);
    if (!st.isFile()) return null;
    const truncated = st.size > MAX_BYTES;
    const handle = await readFile(abs, "utf8");
    const body = truncated ? handle.slice(0, MAX_BYTES) : handle;
    const kind: ContentResult["kind"] = rel.endsWith(".md")
      ? "markdown"
      : rel.endsWith(".jsonl")
        ? "jsonl"
        : rel.endsWith(".json")
          ? "json"
          : "text";
    return { repo, path: rel, kind, content: body, truncated };
  } catch {
    return null;
  }
}

export interface LedgerRow {
  date: string;
  agent: string;
  content: string;
  sha: string;
  artifacts: string;
  line: number;
}

// פורמט-חוקי: תאריך | סוכן | תוכן (רשאי-להכיל '|') | sha | ארטיפקטים
export function parseLedger(raw: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  raw.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!/^\d{4}-\d{2}-\d{2}\s*\|/.test(t)) return;
    const parts = t.split("|").map((p) => p.trim());
    if (parts.length < 5) return;
    rows.push({
      date: parts[0],
      agent: parts[1],
      content: parts.slice(2, parts.length - 2).join(" | "),
      sha: parts[parts.length - 2],
      artifacts: parts[parts.length - 1],
      line: i + 1,
    });
  });
  return rows.reverse(); // חדש-ראשון
}

export async function readLedger(): Promise<{ rows: LedgerRow[]; total: number }> {
  const raw = await readFile(
    path.join(REPOS.Sandbox, "ops/AGENT-LEDGER.md"),
    "utf8",
  ).catch(() => "");
  const rows = parseLedger(raw);
  return { rows, total: rows.length };
}
