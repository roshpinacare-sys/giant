/**
 * trust-scan.ts — מפת-האמון של הצי (GIANT wave-5 · דפוס awesome-dsh-plugin).
 *
 * המתודולוגיה נלמדה מ-awesome-dsh-plugin (data/capabilities.json · dsh-trust-check):
 *  (1) המדידה היא חשיפה, לעולם לא פסק-דין — אף-שורה כאן לא כותבת "בטוח" או "נקי".
 *  (2) "לא הצלחנו להסתכל" ו"הסתכלנו ולא ראינו" הם שני משפטים שונים — רק אחד מהם אמת;
 *      ספר-שלא-נסרק מסומן unscanned עם-השגיאה-עצמה, לעולם לא ריק-כהוכחת-ניקיון.
 *  (3) הסקאנר לא מריץ-קוד, לא פותח-socket-שרירותי ולא צריך-מודל — קורא-עץ-גיט
 *      ומדווח file:line עבור כל-ממצא (deep-scan בתוך-גבולות).
 *  (4) אפס-חומר-סודות: שמות-קבצים ומספרים בלבד — תוכן של קבצי-סודות לעולם לא נקרא
 *      ולא מדווח (חוק-strix).
 *
 * מקורות-חיים בלבד: GitHub REST (עץ-גיט) + רשימת-הצי מ-/api/giant/fleet.
 * כשל = fail-honest עם-השגיאה. incremental: ספר נסרק מחדש רק כשנדחף אחרי-הסריקה
 * שלו (RECHECK דפוס-dsh) או שהמטמון מיושן.
 */
import { readPat } from "@/lib/office-truth";
import { loadFleet } from "@/lib/giant/fleet";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export const SCANNER = "saos-trust-check@0.1.0";
const CACHE_FILE = path.join(process.cwd(), "db", "trust-cache.json");
const TREE_TTL_MS = 6 * 60 * 60 * 1000; // ספר שנסרק ונשקט — סריקה-חוזרת אחרי 6ש׳
const DEEP_TTL_MS = 10 * 60 * 1000;
const DEEP_FILE_CAP = 12;
const DEEP_FILE_BYTES = 24_000;
const CONCURRENCY = 6;

export interface TrustSignal {
  rule: string;
  path: string;
}
export interface TrustHit {
  rule: string;
  file: string;
  line: number;
}
export interface DeepScan {
  at: string;
  files: number;
  bytes: number;
  hits: TrustHit[];
  note: string | null;
}
export interface TrustRow {
  name: string;
  branch: string | null;
  pushedAt: string | null;
  description: string | null;
  mode: "tree" | "unscanned";
  scannedAt: string | null;
  ageMinutes: number | null;
  files: number | null;
  capabilities: string[];
  signals: TrustSignal[];
  redLines: TrustSignal[];
  deep: DeepScan | null;
  error: string | null;
}
export interface TrustPayload {
  ok: boolean;
  note?: string;
  scanner: string;
  summary: {
    total: number | null;
    scanned: number;
    unscanned: number;
    signals: number;
    redLines: number;
    capCombos: Array<{ combo: string; count: number }>;
  };
  rows: TrustRow[];
  measuredAt: string;
}

/* ── מיון-סימנים על-נתיבים (חשיפה בלבד — אף-אחד לא "אשם") ─────────────── */
const SIGNAL_RULES: Array<{ rule: string; re: RegExp }> = [
  { rule: "mock-path", re: /(^|[/_.-])(mock|mocks|mocked)([/_.-]|$)/i },
  { rule: "fake-path", re: /(^|[/_.-])(fake|faker)([/_.-]|$)/i },
  { rule: "simulate-path", re: /(simulat|simulation|sim-book)/i },
  { rule: "placeholder-path", re: /(placeholder|lorem)/i },
  { rule: "stub-path", re: /(^|[/_.-])(stub|stubs|mirror-stub)([/_.-]|$)/i },
  { rule: "sample-path", re: /(^|[/_.-])(sample|samples|demo|dummy)([/_.-]|$)/i },
  { rule: "todo-path", re: /(^|[/_.-])(todo|wip|drafts?)([/_.-]|$)/i },
];
const SECRET_PATH_RULES: Array<{ rule: string; re: RegExp }> = [
  { rule: "secrets-file-present", re: /(^|[/_.-])(pat\.env|\.env|\.env\.[^/]*|credentials?|secrets?)($|[/_.-])/i },
  { rule: "keyfile-present", re: /\.(pem|key|p12|pfx)$|(^|[/_.-])id_rsa/i },
];
const CAP_RULES: Array<{ cap: string; test: (paths: string[]) => boolean }> = [
  { cap: "api", test: (p) => p.some((x) => /(^|\/)api(\/|$)|route\.ts$|route\.js$/.test(x)) },
  { cap: "front", test: (p) => p.some((x) => /\.(tsx|jsx|html)$/.test(x)) },
  { cap: "db", test: (p) => p.some((x) => /prisma\/schema\.prisma$|(^|\/)db\//.test(x)) },
  { cap: "workflows", test: (p) => p.some((x) => /\.github\/workflows\/.+\.(yml|yaml)$/.test(x)) },
  { cap: "docs", test: (p) => p.some((x) => /(^|\/)(readme|docs\/)/i.test(x)) },
  { cap: "tests", test: (p) => p.some((x) => /(\.test\.|\.spec\.|(^|\/)tests?\/)/.test(x)) },
  { cap: "scripts", test: (p) => p.some((x) => /\.(mjs|sh)$/.test(x)) },
];

/* כללי-תוכן ל-deep-scan — מדווחים file:line בלבד, לעולם לא את-השורה-עצמה */
const CODE_ANY = /\.(ts|tsx|js|mjs|cjs|json|py|cpp|cc|cxx|c|h|hpp|go|rs|java|kt|rb|php|cs|sh|yml|yaml)$/i;
const DEEP_RULES: Array<{ rule: string; re: RegExp; files: RegExp }> = [
  { rule: "SIM-RANDOM", re: /Math\.random\s*\(|randint\s*\(|random\.random\s*\(/, files: CODE_ANY },
  { rule: "SIM-MARKER", re: /\b(mock|fake|simulat(e|ion|ed)|placeholder|stub)\b/i, files: CODE_ANY },
  { rule: "PLAIN-HTTP", re: /http:\/\/(?!localhost|127\.0\.0\.1)/, files: CODE_ANY },
  { rule: "SECRET-SHAPED", re: /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, files: /./ },
];

interface CacheEntry {
  name: string;
  scannedAt: string;
  pushedAtAtScan: string | null;
  row: TrustRow;
}
interface TrustCache {
  version: 1;
  scanner: string;
  entries: CacheEntry[];
}
const deepCache = new Map<string, { at: number; scan: DeepScan }>();

function readCache(): TrustCache {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as TrustCache;
      if (raw?.version === 1 && Array.isArray(raw.entries)) return raw;
    }
  } catch {
    /* מטמון-שבור = כאילו-אין — סריקה-מלאה-כנה */
  }
  return { version: 1, scanner: SCANNER, entries: [] };
}
function writeCache(c: TrustCache): void {
  try {
    mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(c));
  } catch {
    /* כשל-מטמון לא מזייף-מדידה — המדידה-החיה ממשיכה */
  }
}

function ghHeaders(pat: string) {
  return { authorization: `Bearer ${pat}`, accept: "application/vnd.github+json" };
}

interface GhTreeItem {
  path?: string;
  type?: string;
  size?: number;
}

async function scanRepoTree(name: string, branch: string | null, pat: string): Promise<TrustRow> {
  const branchRef = branch && branch.length > 0 ? branch : "main";
  const res = await fetch(
    `https://api.github.com/repos/roshpinacare-sys/${encodeURIComponent(name)}/git/trees/${encodeURIComponent(branchRef)}?recursive=1`,
    { headers: ghHeaders(pat), cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`GitHub עץ-הספר HTTP ${res.status}`);
  const tree = (await res.json()) as { tree?: GhTreeItem[]; truncated?: boolean };
  const items = Array.isArray(tree.tree) ? tree.tree : [];
  const paths = items.filter((t) => t.type === "blob" && typeof t.path === "string").map((t) => String(t.path));

  const capabilities = CAP_RULES.filter((r) => r.test(paths)).map((r) => r.cap);
  const signals: TrustSignal[] = [];
  for (const p of paths) {
    for (const r of SIGNAL_RULES) if (r.re.test(p)) signals.push({ rule: r.rule, path: p });
  }
  const redLines: TrustSignal[] = [];
  for (const p of paths) {
    for (const r of SECRET_PATH_RULES) if (r.re.test(p)) redLines.push({ rule: r.rule, path: p });
  }
  return {
    name,
    branch: branchRef,
    pushedAt: null,
    description: null,
    mode: "tree",
    scannedAt: new Date().toISOString(),
    ageMinutes: 0,
    files: paths.length,
    capabilities,
    signals: signals.slice(0, 40),
    redLines: redLines.slice(0, 20),
    deep: null,
    error: tree.truncated === true ? "העץ נחתך (ספר-ענק) — חלקי-מדידה, חשיפה-חלקית" : null,
  };
}

/** deep-scan נקודתי: קורא עד 12 קבצים-מועמדים (≤24KB) ומדווח file:line בלבד. */
export async function deepScanRepo(name: string, signals: TrustSignal[], branch?: string | null): Promise<DeepScan> {
  const hit = deepCache.get(name);
  if (hit && Date.now() - hit.at < DEEP_TTL_MS) return hit.scan;
  const pat = await readPat();
  if (!pat) return { at: new Date().toISOString(), files: 0, bytes: 0, hits: [], note: "PAT לא זמין — לא נבדק (כנה)" };
  const codeExt = /\.(ts|tsx|js|mjs|json|py|cpp|cc|cxx|h|hpp|go|rs|java|kt|rb|php|cs|c)$/i;
  const sigPaths = Array.from(new Set(signals.map((s) => s.path)));
  const candidates = [...sigPaths.filter((p) => codeExt.test(p)), ...sigPaths].filter((p, i, a) => a.indexOf(p) === i).slice(0, DEEP_FILE_CAP);
  const hits: TrustHit[] = [];
  let bytes = 0;
  let fetched = 0;
  for (const p of candidates) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/roshpinacare-sys/${encodeURIComponent(name)}/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch && branch.length > 0 ? branch : "main")}`,
        { headers: { ...ghHeaders(pat), accept: "application/vnd.github.raw" }, cache: "no-store", signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > DEEP_FILE_BYTES) continue; // קובץ-ענק — חותכים-כנה (מדווח רק על מה שנקרא)
      bytes += buf.byteLength;
      fetched += 1;
      const text = buf.toString("utf8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const r of DEEP_RULES) {
          if (!r.files.test(p)) continue;
          if (r.re.test(lines[i])) hits.push({ rule: r.rule, file: p, line: i + 1 });
        }
      }
    } catch {
      /* כשל-קובץ בודד — ממשיכים; הממצאים שנאספו נשארים */
    }
  }
  const scan: DeepScan = {
    at: new Date().toISOString(),
    files: fetched,
    bytes,
    hits: hits.slice(0, 120),
    note: fetched === 0 ? "אף-קובץ-מועמד לא נקרא — לא נבדק (כנה)" : null,
  };
  deepCache.set(name, { at: Date.now(), scan });
  return scan;
}

export async function runTrustScan(force = false): Promise<TrustPayload> {
  const fleet = await loadFleet(force);
  if (!fleet.ok) {
    return {
      ok: false,
      note: fleet.note ?? "הצי לא נמדד — מפת-האמון לא נבנתה (כשל-כנה)",
      scanner: SCANNER,
      summary: { total: null, scanned: 0, unscanned: 0, signals: 0, redLines: 0, capCombos: [] },
      rows: [],
      measuredAt: new Date().toISOString(),
    };
  }
  const pat = await readPat();
  const cache = readCache();
  const byName = new Map(cache.entries.map((e) => [e.name, e]));
  const rows: TrustRow[] = [];
  const list = fleet.repos.filter((r) => !r.archived);

  const scanOne = async (repo: (typeof list)[number]): Promise<TrustRow> => {
    const prev = byName.get(repo.name);
    if (!force && pat && prev) {
      const age = Date.now() - Date.parse(prev.scannedAt);
      const stale = repo.pushedAt !== null && prev.pushedAtAtScan !== null && repo.pushedAt > prev.pushedAtAtScan;
      if (!stale && age < TREE_TTL_MS) {
        return {
          ...prev.row,
          branch: repo.defaultBranch ?? prev.row.branch ?? null,
          ageMinutes: Math.max(0, Math.round((Date.now() - Date.parse(prev.scannedAt)) / 60_000)),
          pushedAt: repo.pushedAt,
          description: repo.description,
        };
      }
    }
    if (!pat) {
      return {
        name: repo.name,
        branch: repo.defaultBranch,
        pushedAt: repo.pushedAt,
        description: repo.description,
        mode: "unscanned",
        scannedAt: null,
        ageMinutes: null,
        files: null,
        capabilities: [],
        signals: [],
        redLines: [],
        deep: null,
        error: "PAT לא זמין — לא נבדק (לא-נבדק ≠ נקי)",
      };
    }
    try {
      const row = await scanRepoTree(repo.name, repo.defaultBranch, pat);
      row.branch = repo.defaultBranch;
      row.pushedAt = repo.pushedAt;
      row.description = repo.description;
      return row;
    } catch (e) {
      return {
        name: repo.name,
        branch: repo.defaultBranch,
        pushedAt: repo.pushedAt,
        description: repo.description,
        mode: "unscanned",
        scannedAt: null,
        ageMinutes: null,
        files: null,
        capabilities: [],
        signals: [],
        redLines: [],
        deep: null,
        error: e instanceof Error ? e.message : "כשל-לא-ידוע",
      };
    }
  };

  /* הסריקה בתוך-גבולות: קבוצות-של-6 — 39 ספרים בכמה-גלים קצרים */
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    rows.push(...(await Promise.all(batch.map(scanOne))));
  }

  /* מטמון-קבצים: רק סריקות-עץ שהצליחו נכנסות (כשל לעולם לא נשמר כ"נקי") */
  const fresh = rows.filter((r) => r.mode === "tree" && r.scannedAt !== null);
  const nextCache: TrustCache = {
    version: 1,
    scanner: SCANNER,
    entries: [
      ...cache.entries.filter((e) => !rows.some((r) => r.name === e.name)),
      ...fresh.map((r) => ({
        name: r.name,
        scannedAt: r.scannedAt as string,
        pushedAtAtScan: r.pushedAt,
        row: r,
      })),
    ],
  };
  writeCache(nextCache);

  const scanned = rows.filter((r) => r.mode === "tree").length;
  const signals = rows.reduce((s, r) => s + r.signals.length, 0);
  const redLines = rows.reduce((s, r) => s + r.redLines.length, 0);
  const combos = new Map<string, number>();
  for (const r of rows) {
    if (r.mode !== "tree") continue;
    const key = r.capabilities.length > 0 ? r.capabilities.join("+") : "עץ-ריק-נמדד";
    combos.set(key, (combos.get(key) ?? 0) + 1);
  }
  const capCombos = Array.from(combos.entries())
    .map(([combo, count]) => ({ combo, count }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    scanner: SCANNER,
    summary: { total: rows.length, scanned, unscanned: rows.length - scanned, signals, redLines, capCombos },
    rows: rows.sort((a, b) => {
      const wa = a.redLines.length * 10 + a.signals.length + (a.mode === "unscanned" ? 50 : 0);
      const wb = b.redLines.length * 10 + b.signals.length + (b.mode === "unscanned" ? 50 : 0);
      return wb - wa;
    }),
    measuredAt: new Date().toISOString(),
  };
}
