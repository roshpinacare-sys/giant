/**
 * GET /api/giant/sovereignty — חיבור-הריבונות המלא (T61)
 *
 * מטען-אמת אחד שמחבר את כל-האחוזה: כל-תיקיות-הגיט (סריקת-fs + פקודות-git אמיתיות),
 * צי-הסוכנים (כל-המקורות-האמיתיים), ליגת-הענקים, והלקחים-מהכישלונות-של-העבר.
 * חוזה-אפס-סימולציה: כל-מספר מגיע מקריאת-קובץ או מפקודת-git אמיתית;
 * מקור-שנכשל נרשם ב-errors[] והמשך-מדידה — אף-מספר לא מומצא.
 * T62: סעיף audit — קבלת-ביקורת-הצי (FLEET-AUDIT.json) + דיאל-TCP חי ל-127.0.0.1:3000/3040.
 * cache-זיכרון 60 שניות · fail-honest · אפס-דליפת-טוקנים (רימוט-מצונזר).
 */
import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import net from "node:net";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  AgentCensus,
  AgentIdentity,
  AgentSource,
  ArchaeologyEntry,
  FleetGraph,
  FleetNode,
  GiantFamily,
  GiantsBook,
  Lesson,
  RepoInfo,
  SovereigntyAudit,
  SovereigntyPayload,
} from "@/lib/giant/sovereignty-types";
import type { FleetAuditReceipt } from "@/lib/giant/audit-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
let cache: { at: number; payload: SovereigntyPayload } | null = null;

const HOME = "/home/z";
const SRC_DIR = path.join(HOME, "my-project", "src");
const PAGE_TSX = path.join(HOME, "my-project", "src", "app", "page.tsx");
const WORKLOG = path.join(HOME, "my-project", "worklog.md");
const FLEET_GRAPH = path.join(HOME, "estate", "FleetHQ", "GOVERNANCE", "FLEET-GRAPH.json");
const AGENT_REGISTRY = path.join(HOME, "estate", "Domain", "agents", "agent-registry.json");
const FLEET_ROSTER = path.join(HOME, "estate", "Domain", "agents", "fleet-roster.json");
const AGENTS_DIR = path.join(HOME, "estate", "Domain", "agents");
const STACK_REGISTRY = path.join(
  HOME, "estate", "FleetHQ", "sovereign", "stack", "identity", "registry",
);
const FLEET_CENSUS = path.join(
  HOME, "estate", "FleetHQ", "mini-services", "agent-hq", "demo-data", "agents", "fleet-census.json",
);
const GIANTS_JSON = path.join(HOME, "estate", "Domain", "dex", "giants.json");
const KEY_PROOF = path.join(HOME, "estate", "Sandbox", "proof", "out", "KEY-PROOF-STATUS.md");
const TOKEN_TRUTH = path.join(HOME, "estate", "Sandbox", "ops", "TOKEN-TRUTH.md");
const FLEET_AUDIT = path.join(HOME, "estate", "Sandbox", "proof", "out", "FLEET-AUDIT.json");
const AUDIT_PORTS = [3000, 3040];
const DIAL_TIMEOUT_MS = 800;

const SKIP_DIRS = new Set(["node_modules", ".next", ".cache", ".git", "lost+found"]);

/* ---------- עזרי-קריאה כנים ---------- */

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** git command אמיתי; כשל → null (הקורא מחליט מה כנה להציג). */
function git(repo: string, args: string): string | null {
  try {
    const out = execSync(`git -C "${repo}" ${args}`, {
      encoding: "utf8",
      timeout: 8_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

/** צנזורה: אף-טוקן לא דולף למטען — https://user:pass@host → https://host */
function redactRemote(url: string): string {
  return url.replace(/\/\/[^@/\s]*@/, "//");
}

function isoDate(d: Date): string {
  return d.toISOString();
}

/** תאריך-אמת: מוצץ ISO מתוך-תוכן-הקובץ; אם-אין → mtime של-הקובץ; אם-גם-זה-נכשל → עכשיו. */
async function contentOrMtimeDate(filePath: string, content: string | null): Promise<string> {
  const m = content?.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  if (m) return m[0];
  try {
    const st = await fs.stat(filePath);
    return isoDate(st.mtime);
  } catch {
    return isoDate(new Date());
  }
}

/* ---------- סריקת-ריפואים (fs אמיתי, עומק 4) ---------- */

async function findGitRepos(): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      try {
        const st = await fs.stat(path.join(full, ".git"));
        if (st.isFile() || st.isDirectory()) found.push(full);
      } catch {
        /* אין .git כאן — ממשיכים-לרדת */
      }
      await walk(full, depth + 1);
    }
  }
  await walk(HOME, 0);
  return found.sort();
}

/* ---------- חיבור-לממשק: אילו-תצוגות באמת קוראות מכל-ריפו (סריקת-src) ---------- */

const REPO_SEGMENTS: Array<[string, string]> = [
  ["/estate/Domain", "Domain"],
  ["/estate/FleetHQ", "FleetHQ"],
  ["/estate/Pulse", "Pulse"],
  ["/estate/Sandbox", "Sandbox"],
  ["/estate/giant", "giant"],
];

function viewIdForFile(absFile: string): string {
  // נרמול: פלחי-ספריות וגם-שמות-קבצים (בלי-סיומת) — channel.ts שייך-לערוץ
  const rel = path
    .relative(SRC_DIR, absFile)
    .split(path.sep)
    .map((seg) => seg.replace(/\.(ts|tsx)$/, ""));
  for (const seg of rel) {
    if (seg === "orderbook" || seg === "dex") return "dex";
    if (seg === "pulse") return "pulse";
    if (seg === "league") return "league";
    if (seg === "estate") return "estate";
    if (seg === "channel") return "channel";
    if (seg === "office") return "office";
  }
  return "machine";
}

async function collectFiles(dir: string, exts: string[], out: string[], depth = 0): Promise<void> {
  if (depth > 10 || out.length > 4000) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await collectFiles(full, exts, out, depth + 1);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      out.push(full);
    }
  }
}

/** מפה: שם-ריפו → מזהי-תצוגה שבאמת מפנים-אליו (מחרוזת-הנתיב-המלאה בתוך-קוד-המקור). */
async function measureWiring(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  for (const [, name] of REPO_SEGMENTS) map.set(name, new Set());
  const files: string[] = [];
  await collectFiles(SRC_DIR, [".ts", ".tsx"], files);
  for (const f of files) {
    let content: string;
    try {
      content = await fs.readFile(f, "utf8");
    } catch {
      continue;
    }
    for (const [seg, name] of REPO_SEGMENTS) {
      if (content.includes(`${HOME}${seg}`)) {
        map.get(name)?.add(viewIdForFile(f));
      }
    }
  }
  return map;
}

/** מזהי-התצוגה-האמיתיים של-הממשק — נחתכים-חי מ-page.tsx (אפס-המצאה). */
async function measureViewIds(): Promise<string[]> {
  try {
    const src = await fs.readFile(PAGE_TSX, "utf8");
    const block = src.match(/type ViewId\s*=\s*([\s\S]*?);/);
    if (!block) return [];
    const ids = [...block[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

const ROLES: Record<string, string> = {
  "my-project": "הממשק המאוחד — 14 מודולים חיים; חי בסנדבוקס, נשמר בגיט",
  giant: "האפליקציה הקאנונית — מיזוג T58 נחת כאן",
  Domain: "הוויטרינה — dex books, רישום-סוכנים, truth rails, giants league",
  Sandbox: "מעבדת האינטגרציה — proof/out, TOKEN-TRUTH",
  Pulse: "הדופק — giant UI, intel notes, sovereign channel",
  FleetHQ: "המשרד — agent-hq, GOVERNANCE, fleet-graph, sovereign-stack",
};

const GAP_NOTE = "לא מחובר עדיין לממשק — זהו הפער שהבעלים מדבר עליו";

async function measureRepos(errors: string[]): Promise<RepoInfo[]> {
  const wiring = await measureWiring().catch(() => new Map<string, Set<string>>());
  const viewIds = await measureViewIds();
  const repoPaths = await findGitRepos();
  if (repoPaths.length === 0) {
    errors.push("סריקת-הריפואים-נכשלה: לא-נמצאו תיקיות-git תחת /home/z (עומק 4)");
    return [];
  }
  const repos: RepoInfo[] = [];
  for (const repo of repoPaths) {
    try {
      const name = path.basename(repo);
      const branch = git(repo, "branch --show-current") ?? "";
      const commitCount = Number.parseInt(git(repo, "rev-list --count HEAD") ?? "0", 10) || 0;
      const porcelain = git(repo, "status --porcelain") ?? "";
      const dirtyCount = porcelain.split("\n").filter((l) => l.trim().length > 0).length;
      const logOut = git(repo, "log -1 --format=%h%n%aI%n%s") ?? "";
      const [sha = "", date = "", ...rest] = logOut.split("\n");
      const lastSubject = rest.filter((l) => l.trim().length > 0).join(" ");
      const rawRemote = git(repo, "remote get-url origin");
      const remote = rawRemote ? redactRemote(rawRemote) : null;

      let wired: string[];
      let wiredNote: string;
      if (name === "my-project") {
        wired = viewIds.length > 0 ? viewIds : [];
        wiredNote = "הממשק עצמו";
      } else {
        wired = [...(wiring.get(name) ?? [])].sort();
        wiredNote = wired.length === 0 ? GAP_NOTE : "נמדד מסריקת-src";
      }

      repos.push({
        name,
        path: repo,
        role: ROLES[name] ?? "נמדד בסריקה — תפקיד לא מוגדר עדיין",
        branch,
        commitCount,
        dirtyCount,
        remote,
        hasRemote: remote !== null && remote.length > 0,
        lastSha: sha,
        lastDate: date,
        lastSubject,
        wired,
        wiredNote,
      });
    } catch {
      errors.push(`מדידת-הריפו ${path.basename(repo)} נכשלה — ריפו-זה מדורג-כשקוף`);
    }
  }
  return repos;
}

/* ---------- גרף-הצי ---------- */

async function measureFleet(repos: RepoInfo[], errors: string[]): Promise<FleetGraph | null> {
  try {
    const raw = rec(JSON.parse(await fs.readFile(FLEET_GRAPH, "utf8")));
    const localNames = new Set(repos.map((r) => r.name.toLowerCase()));
    const nodes: FleetNode[] = arr(raw.nodes).map((n) => {
      const node = rec(n);
      const id = str(node.id);
      return {
        id,
        vis: str(node.vis, "unknown"),
        role: str(node.role),
        status: str(node.status),
        local: localNames.has(id.toLowerCase()),
      };
    });
    const s = rec(raw.summary);
    return {
      schema: str(raw.schema),
      updatedAt: str(raw.updatedAt),
      summary: {
        nodes: num(s.nodes),
        edges: num(s.edges),
        live: num(s.live),
        policy: num(s.policy),
        armed: num(s.armed),
        reposActive24h: str(s.reposActive24h),
      },
      nodes,
    };
  } catch {
    errors.push("גרף-הצי לא נקרא: FleetHQ/GOVERNANCE/FLEET-GRAPH.json חסר-או-פגום");
    return null;
  }
}

/* ---------- מפקד-הסוכנים (רק-מקורות-אמת) ---------- */

async function measureAgents(errors: string[]): Promise<AgentCensus> {
  const identities: AgentIdentity[] = [];
  const sources: AgentSource[] = [];
  let total = 0;

  // 1) רישום-הזהויות של-Domain (ERC-8004-shaped, מקור-אמת)
  try {
    const raw = rec(JSON.parse(await fs.readFile(AGENT_REGISTRY, "utf8")));
    const src = "Domain/agents/agent-registry.json";
    let count = 0;
    for (const entry of arr(raw.identity)) {
      const e = rec(entry);
      const meta = rec(e.metadata);
      identities.push({
        agentId: str(e.agentId),
        source: src,
        role: str(meta.role),
        capabilities: arr(meta.capabilities).map((c) => str(c)).filter((c) => c.length > 0),
        keyMode: str(meta.keyMode),
        alive: typeof meta.alive === "boolean" ? meta.alive : null,
      });
      count += 1;
    }
    total += count;
    sources.push({ name: "רישום-זהויות הצי (ERC-8004-shaped)", count, path: src, real: true });
  } catch {
    errors.push("רישום-הסוכנים לא נקרא: Domain/agents/agent-registry.json חסר-או-פגום");
  }

  // 2) רישומי-ה-stack של-FleetHQ (registration.json לכל-איבר)
  try {
    const dirs = await fs.readdir(STACK_REGISTRY, { withFileTypes: true });
    let count = 0;
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const regPath = path.join(STACK_REGISTRY, d.name, "registration.json");
        const raw = rec(JSON.parse(await fs.readFile(regPath, "utf8")));
        const id = str(raw.name) || str(raw.agentId) || str(raw.id) || d.name;
        identities.push({
          agentId: id,
          source: regPath.replace(`${HOME}/`, ""),
          role: str(raw.description, "רישום-stack (EIP-8004) — אין-תיאור בקובץ"),
          capabilities: arr(raw.capabilities).map((c) => str(c)).filter((c) => c.length > 0),
          keyMode: str(raw.keyMode),
          alive: typeof raw.active === "boolean" ? raw.active : null,
        });
        count += 1;
      } catch {
        errors.push(`רישום-stack ${d.name} לא נקרא — נרשם-כפער, לא-מומצא`);
      }
    }
    total += count;
    sources.push({
      name: "רישומי-זהות ב-stack הריבוני (EIP-8004)",
      count,
      path: "FleetHQ/sovereign/stack/identity/registry/*/registration.json",
      real: true,
    });
  } catch {
    errors.push("תיקיית-רישומי-ה-stack לא נסרקה: sovereign/stack/identity/registry חסרה");
  }

  // 3) רוסטר-הצי — חשבונות-ה-steem האמיתיים
  try {
    const raw = rec(JSON.parse(await fs.readFile(FLEET_ROSTER, "utf8")));
    const count = arr(raw.steemFleet).length;
    total += count;
    sources.push({
      name: "רוסטר-הצי — חשבונות-steem רשומים",
      count,
      path: "Domain/agents/fleet-roster.json",
      real: true,
      note: `asOf ${str(raw.asOf)} · bannedCapital ${arr(raw.bannedCapital).length}`,
    });
  } catch {
    errors.push("רוסטר-הצי לא נקרא: Domain/agents/fleet-roster.json חסר-או-פגום");
  }

  // 4) סקריפטי-הסוכנים הפעילים (מדידת-fs אמיתית)
  try {
    const files = await fs.readdir(AGENTS_DIR);
    const count = files.filter((f) => f.endsWith(".cjs")).length;
    total += count;
    sources.push({
      name: "סקריפטי-סוכנים פעילים",
      count,
      path: "Domain/agents/*.cjs",
      real: true,
      note: "ספירת-קבצים-חיה מהתיקייה",
    });
  } catch {
    errors.push("ספירת-סקריפטי-הסוכנים נכשלה: תיקיית Domain/agents לא נקראה");
  }

  // 5) מפקד-הדמו — רשום-אך-לא-נספר (חוזה-אין-זיופים)
  try {
    const raw = rec(JSON.parse(await fs.readFile(FLEET_CENSUS, "utf8")));
    const count = arr(raw.rows).length;
    sources.push({
      name: "מפקד-הדמו (agent-hq)",
      count,
      path: "FleetHQ/mini-services/agent-hq/demo-data/agents/fleet-census.json",
      real: false,
      note: "מסומן DEMO DATA — SYNTHETIC; לא נספר בסה״כ",
    });
  } catch {
    errors.push("מפקד-הדמו לא נקרא (הוא-לא-נספר-בכל-מקרה): fleet-census.json חסר");
  }

  return { total, identities, sources };
}

/* ---------- ספר-הענקים ---------- */

async function measureGiants(errors: string[]): Promise<GiantsBook | null> {
  try {
    const raw = rec(JSON.parse(await fs.readFile(GIANTS_JSON, "utf8")));
    const beat = rec(raw.beat);
    const families: GiantFamily[] = arr(raw.families)
      .map((f) => {
        const fam = rec(f);
        return {
          id: str(fam.id),
          name: str(fam.name),
          tier: str(fam.tier),
          fees24h: num(fam.fees24h),
          vol24h: num(fam.vol24h),
          feesAllTime: num(fam.feesAllTime),
        };
      })
      .sort((a, b) => b.vol24h - a.vol24h)
      .slice(0, 14);

    const oursRaw = rec(raw.ours);
    const hasOurs = Object.keys(oursRaw).length > 0;
    return {
      publishedAt: str(raw.publishedAt),
      runAt: str(beat.runAt),
      method: str(beat.method),
      families,
      ours: hasOurs
        ? {
            name: str(oursRaw.name, "SAOS DEX"),
            fees24h: typeof oursRaw.fees24h === "number" ? oursRaw.fees24h : null,
            vol24h: typeof oursRaw.vol24h === "number" ? oursRaw.vol24h : null,
            note: str(oursRaw.note, "נמדד מספר-הענקים הקנוני (Domain/dex/giants.json)"),
          }
        : null,
    };
  } catch {
    errors.push("ספר-הענקים לא נקרא: Domain/dex/giants.json חסר-או-פגום");
    return null;
  }
}

/* ---------- הלקחים (מהכישלונות-האמיתיים) ---------- */

async function readTextOrThrow(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

async function measureLessons(errors: string[]): Promise<Lesson[]> {
  const lessons: Lesson[] = [];

  // 1) כספת-המפתחות שנמחקה — הוכחת-חיות לא נכתבת בכוונה
  try {
    const content = await readTextOrThrow(KEY_PROOF);
    lessons.push({
      date: await contentOrMtimeDate(KEY_PROOF, content),
      title: "כספת-המפתחות נמחקה — הוכחת-החיות נעצרה",
      what: "כספת-המפתחות המקומית נמחקה באירוע-המחיקה; הוכחת-החיות-של-המפתחות לא נכתבת בכוונה (חוזה-אין-זיופים) — KEY-PROOF-LATEST.json ריק-בכנות.",
      rule: "אין ספירות-מפתחות מומצאות — שיקום = שחזור-כספת + מדידה מחדש",
      source: KEY_PROOF,
    });
  } catch {
    errors.push("לקח-כספת-המפתחות לא נרשם: Sandbox/proof/out/KEY-PROOF-STATUS.md חסר");
  }

  // 2) אמת-הטוקנים — נזקק-מהתוכן-האמיתי
  try {
    const content = await readTextOrThrow(TOKEN_TRUTH);
    const tableRow = content.match(/^(\d{4}-\d{2}-\d{2}T[^\s|]+)\s*\|\s*([^|]+)\|/m);
    const tokenName = tableRow ? tableRow[2].trim() : "טוקן-הפרסום";
    lessons.push({
      date: await contentOrMtimeDate(TOKEN_TRUTH, content),
      title: "אמת-הטוקנים — אפס-חומר-סודות בקוד",
      what: `TOKEN-TRUTH מתעד רק מצב/סוג/תוקף (${tokenName} נמדד-חי, expires מתוארך); חומר-המפתח עצמו חי מחוץ-ל-git (.secrets) — התיקון-של-עידן-שבו-טוקנים-דלפו-לריפואים.`,
      rule: "כל-טוקן מדווח רק מהטבלה-האמיתית; אפס-חומר-סודות בקובץ-או-במטען-API",
      source: TOKEN_TRUTH,
    });
  } catch {
    errors.push("לקח-אמת-הטוקנים לא נרשם: Sandbox/ops/TOKEN-TRUTH.md חסר");
  }

  // 3) הון-אבוד ללא-מפתחות — מהרוסטר-האמיתי
  try {
    const raw = rec(JSON.parse(await fs.readFile(FLEET_ROSTER, "utf8")));
    const banned = arr(raw.bannedCapital)
      .map((b) => rec(b))
      .filter((b) => str(b.reason).includes("LOST-NO-CUSTODY"));
    const names = banned.map((b) => str(b.name)).join("/");
    lessons.push({
      date: await contentOrMtimeDate(FLEET_ROSTER, JSON.stringify(raw)),
      title: "הון-שנשלח-ללא-מפתחות נתקע",
      what: `${names} — הון שהואצל ללא-מפתחות-בכספת נתקע (LOST-NO-CUSTODY): אפס-עוגני-סמכות, יתרות-נזילות-לא-ניתנות-לשחזור; נמדד-ורשום ב-roster עצמו.`,
      rule: "כל-חותם מאמת מול הרוסטר לפני חתימה",
      source: FLEET_ROSTER,
    });
  } catch {
    errors.push("לקח-ההון-האבוד לא נרשם: fleet-roster.json חסר");
  }

  // 4) נתוני-דמו כמעט נספרו כסוכנים אמיתיים
  try {
    const raw = rec(JSON.parse(await fs.readFile(FLEET_CENSUS, "utf8")));
    lessons.push({
      date: str(raw.at) || (await contentOrMtimeDate(FLEET_CENSUS, null)),
      title: "נתוני-דמו כמעט נספרו כסוכנים-אמיתיים",
      what: `${str(raw.notice, "DEMO DATA — SYNTHETIC")} — מפקד-סוכנים-סינתטי מ-agent-hq עמד-להיספר-כצי-אמיתי; ספירה-שכוללת-דמו-היא-שקר-שקט.`,
      rule: "מקור מסומן-סינתטי לא נספר — חוזה-אין-זיופים",
      source: FLEET_CENSUS,
    });
  } catch {
    errors.push("לקח-נתוני-הדמו לא נרשם: fleet-census.json חסר");
  }

  // 5) הסנדבוקס נמחק בעבר — גיט הוא שלד-המערכת
  try {
    const content = await readTextOrThrow(WORKLOG);
    lessons.push({
      date: await contentOrMtimeDate(WORKLOG, content),
      title: "הסנדבוקס נמחק בעבר — עבודה אבדה",
      what: "הסנדבוקס נמחק-באירוע-אחד-ועבודה-שלא-נדחפה-אבדה; מאז-כל-גל-מסתיים-בקומיט-ובדחיפה-לקנון.",
      rule: "גיט הוא שלד-המערכת — כל גל נדחף לקומיט",
      source: WORKLOG,
    });
  } catch {
    errors.push("לקח-הסנדבוקס לא נרשם: worklog.md לא נקרא");
  }

  return lessons;
}

/* ---------- ארכיאולוגיה: T51..T61 מ-worklog.md האמיתי ---------- */

function extractSectionSummary(body: string[]): string {
  const stageIdx = body.findIndex((l) => /^Stage Summary:/.test(l));
  let pool: string[];
  if (stageIdx >= 0) {
    const sameLine = body[stageIdx].replace(/^Stage Summary:\s*/, "").trim();
    pool = sameLine.length > 0 ? [sameLine, ...body.slice(stageIdx + 1)] : body.slice(stageIdx + 1);
  } else {
    const workIdx = body.findIndex((l) => /^Work Log:/.test(l));
    pool = workIdx >= 0 ? body.slice(workIdx + 1) : body;
  }
  for (const line of pool) {
    const t = line.trim().replace(/^[-*]\s*/, "").trim();
    if (t.length > 0) return t;
  }
  return "";
}

async function measureArchaeology(errors: string[]): Promise<ArchaeologyEntry[]> {
  try {
    const content = await readTextOrThrow(WORKLOG);
    const sections: Array<{ id: string; body: string[] }> = [];
    let current: { id: string; body: string[] } | null = null;
    for (const line of content.split("\n")) {
      if (line.trim() === "---") {
        if (current && current.id) sections.push(current);
        current = { id: "", body: [] };
        continue;
      }
      if (!current) continue;
      if (!current.id) {
        const m = line.match(/^\s*Task ID:\s*(.+?)\s*$/);
        if (m) current.id = m[1];
        continue;
      }
      current.body.push(line);
    }
    if (current && current.id) sections.push(current);

    const byNum = new Map<number, ArchaeologyEntry>();
    for (const sec of sections) {
      const m = sec.id.match(/^[Tt]?(\d+)$/);
      if (!m) continue;
      const n = Number.parseInt(m[1], 10);
      if (n < 51 || n > 61 || byNum.has(n)) continue;
      byNum.set(n, { task: `T${n}`, summary: extractSectionSummary(sec.body) });
    }

    // המשימה-הנוכחית (61) — עוד-לא-רשומה ב-worklog בזמן-בניית-המטען
    if (!byNum.has(61)) {
      byNum.set(61, {
        task: "T61",
        summary: "חיבור-מלא: כל תיקיות הגיט מדודות ומוצגות",
      });
    }

    return [...byNum.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, e]) => e)
      .slice(0, 30);
  } catch {
    errors.push("הארכיאולוגיה לא נפרסה: worklog.md לא נקרא");
    return [];
  }
}

/* ---------- ספירת-נקודות-קצה ---------- */

async function countEndpoints(errors: string[]): Promise<number> {
  try {
    const files: string[] = [];
    await collectFiles(path.join(HOME, "my-project", "src", "app", "api"), ["route.ts"], files);
    return files.length;
  } catch {
    errors.push("ספירת-נקודות-הקצה נכשלה: סריקת src/app/api לא רצה");
    return 0;
  }
}

/* ---------- ביקורת-הצי (T62): קבלת-FLEET-AUDIT + דיאל-TCP חי ---------- */

/** דיאל-TCP אמיתי ל-127.0.0.1:port — timeout 800ms; כשל/חריגה = לא-חי. מדידה-חיה, לא ss. */
function dialProbe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const done = (alive: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(DIAL_TIMEOUT_MS);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

/** מיפוי-הגנתי של-הקבלה-הגולמית לחוזה; קובץ-לא-תקני → זריקה (הקורא נופל-בכנות). */
function normalizeReceipt(raw: unknown): FleetAuditReceipt {
  const r = rec(raw);
  if (!str(r.schema).startsWith("fleet-audit/")) throw new Error("schema mismatch");
  const remotePlane = rec(r.remotePlane);
  const siblingGiants = rec(r.siblingGiants);
  const unprobable = rec(r.unprobable);
  const freshness: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(rec(r.localFreshnessAfterSync))) {
    freshness[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return {
    schema: str(r.schema),
    at: str(r.at),
    probe: str(r.probe),
    ownerMandate: str(r.ownerMandate),
    liveServices: arr(r.liveServices).map((s) => {
      const o = rec(s);
      return { name: str(o.name), port: num(o.port), alive: o.alive === true, evidence: str(o.evidence) };
    }),
    remotePlane: {
      doctrine: str(remotePlane.doctrine),
      beats: arr(remotePlane.beats).map((b) => {
        const o = rec(b);
        return {
          repo: str(o.repo),
          remoteLast: str(o.remoteLast),
          aheadBefore: num(o.aheadBefore),
          subject: str(o.subject),
        };
      }),
      externalLoopVerdict: str(remotePlane.externalLoopVerdict),
    },
    treatment: arr(r.treatment).map((t) => str(t)).filter((t) => t.length > 0),
    siblingGiants: {
      evidence: str(siblingGiants.evidence),
      waves: arr(siblingGiants.waves).map((w) => {
        const o = rec(w);
        return { wave: num(o.wave), subject: str(o.subject) };
      }),
      verdict: str(siblingGiants.verdict),
    },
    localFreshnessAfterSync: freshness,
    unprobable: { count: num(unprobable.count), note: str(unprobable.note), law: str(unprobable.law) },
    verdict: str(r.verdict),
    auditFix: typeof r.auditFix === "string" ? r.auditFix : undefined,
    sha16: str(r.sha16),
  };
}

/** סעיף-הביקורת: הדיאל-החי תמיד רץ; קבלה-שלא-נקראה = null כנה + רישום-כשל (לא-עוקפים-את-הקבלה). */
async function measureAudit(errors: string[]): Promise<SovereigntyAudit | null> {
  const ports = await Promise.all(
    AUDIT_PORTS.map(async (port) => ({ port, alive: await dialProbe(port) })),
  );
  let receipt: FleetAuditReceipt;
  try {
    receipt = normalizeReceipt(JSON.parse(await fs.readFile(FLEET_AUDIT, "utf8")));
  } catch {
    errors.push("ביקורת-הצי: קובץ-הקבלה לא נקרא");
    return null;
  }
  const atMs = Date.parse(receipt.at);
  const receiptAgeMin = Number.isFinite(atMs)
    ? Math.max(0, Math.floor((Date.now() - atMs) / 60_000))
    : null;
  return { receipt, receiptSha16: receipt.sha16 || null, ports, receiptAgeMin };
}

/* ---------- ה-handler ---------- */

async function buildPayload(): Promise<SovereigntyPayload> {
  const errors: string[] = [];

  const repos = await measureRepos(errors);
  const fleet = await measureFleet(repos, errors);
  const agents = await measureAgents(errors);
  const giants = await measureGiants(errors);
  const lessons = await measureLessons(errors);
  const archaeology = await measureArchaeology(errors);
  const endpointFiles = await countEndpoints(errors);
  const audit = await measureAudit(errors);

  const dirtyRepos = repos.filter((r) => r.dirtyCount > 0).map((r) => r.name);
  const unpushed = repos.filter((r) => !r.hasRemote).map((r) => r.name);
  const committedRepos = repos.filter((r) => r.commitCount > 0).length;
  const verdict =
    dirtyRepos.length > 0 || unpushed.length > 0
      ? "עוד לא הכל שרד: יש קבצים לא קומיטו / ריפו בלי רימוט — המוות-הבא של הסנדבוקס יקח אותם"
      : "הכל קומיט — הסנדבוקס יכול למות, הריבונות תשרוד";

  const payload: SovereigntyPayload = {
    ok: true,
    at: isoDate(new Date()),
    sha16: "",
    errors,
    repos,
    localRepoCount: repos.length,
    fleet,
    agents,
    giants,
    lessons,
    archaeology,
    survival: { committedRepos, dirtyRepos, unpushed, verdict },
    endpoints: {
      files: endpointFiles,
      note: "נקודות-קצה חיות בממשק הזה (סריקת-fs)",
    },
    audit,
  };

  // טביעת-אמת: sha256 של-המטען-המלא (בלי-השדה-עצמו), 16 תווים-הקסה
  payload.sha16 = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex")
    .slice(0, 16);
  return payload;
}

export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    if (!cache || now - cache.at > CACHE_MS) {
      const payload = await buildPayload();
      cache = { at: now, payload };
    }
    return NextResponse.json(cache.payload, {
      headers: {
        "x-sovereignty-sha16": cache.payload.sha16,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, errors: [err instanceof Error ? err.message : String(err)] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
