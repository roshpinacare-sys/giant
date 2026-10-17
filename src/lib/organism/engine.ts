import { SAOS_ESTATE, SAOS_LANE, SAOS_CHANNELS, SAOS_AUTONOMY } from "@/lib/saos-paths";
/**
 * ORGANISM ENGINE — server-only.
 *
 * ZERO-FAKE CONTRACT (חוק אין-זיופים):
 *  - every value in the payload is either measured right now from a named
 *    source (file path with mtime+sha16, or a live HTTP fetch with status +
 *    sha16), or explicitly `missing:true` / `null` — never invented.
 *  - key material is NEVER read. KEY-PROOF-LATEST.json contributes its
 *    summary counters only (hash16 evidence stays in the repo, not here).
 *  - the payload carries a selftest block: every local feed with exists /
 *    bytes / sha16 / mtime so the owner can verify byte-level.
 */
import { execFile } from "child_process";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";

export const ESTATE_DIR = SAOS_ESTATE; // גל-86 · ניידות

/* ---------------------------------- types --------------------------------- */

export interface RepoScan {
  repo: string;
  branch: string | null;
  head: string | null;
  headShort: string | null;
  subject: string | null;
  committedAt: string | null;
  ageHours: number | null;
  dirty: number | null;
  ahead: number | null;
  behind: number | null;
  error: string | null;
}

export interface EstateRow {
  repo: string;
  status: string;
  pushAgeH: number | null;
  reds48h: number | null;
  openIssues: number | null;
  archived: boolean;
}

export interface WorkOrder {
  id: string;
  title: string;
  repo: string | null;
  status: string;
  evidence: string | null;
  firstStep: string | null;
}

export interface RecruitRole {
  id: string;
  titleHe: string;
  titleEn: string | null;
  openedBy: string | null;
  contract: string | null;
}

export interface TokenRow {
  at: string;
  name: string;
  state: string;
  kind: string;
  days: number | null;
  login: string | null;
}

export interface FeedMeta {
  path: string;
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  mtime: string | null;
  ageMinutes: number | null;
}

export interface LivePage {
  url: string;
  label: string;
  status: number | null;
  bytes: number | null;
  sha16: string | null;
  marker: string | null;
  markerOk: boolean | null;
  error: string | null;
}

export interface CrewMirror {
  tasksTotal: number | null;
  done: number | null;
  doing: number | null;
  todo: number | null;
  blocked: number | null;
  rescued: number | null;
  savedAt: string | null;
  goal: string | null;
}

export interface OrganismPayload {
  at: string;
  node: { host: string; estateDir: string; refsSource: string; clones: RepoScan[] };
  office: {
    ci: {
      overall: string | null;
      checks: Record<string, string> | null;
      at: string | null;
      ageMinutes: number | null;
      runUrl: string | null;
      reason: string | null;
    } | null;
    state: {
      connected: boolean | null;
      backend: string | null;
      statusHe: string | null;
      agents: number | null;
      capturedAt: string | null;
    } | null;
    crewMirror: CrewMirror | null;
    heartbeat: { tickCount: number | null; lastTick: string | null; status: string | null } | null;
  };
  growth: {
    potential: {
      measuredAt: string | null;
      workOrdersOpen: number | null;
      topActions: string[];
      tokenDaysLeft: number | null;
      delta: string[];
      notScanned: string | null;
      rows: EstateRow[];
    } | null;
    workOrders: WorkOrder[];
    workOrdersAt: string | null;
    valueMap: FeedMeta | null;
  };
  recruit: { at: string | null; roles: RecruitRole[] } | null;
  truth: {
    keyProof: {
      generatedAt: string | null;
      dead: number | null;
      aliveAlert: number | null;
      unknown: number | null;
      notChainTestable: number | null;
      incident: boolean | null;
    } | null;
    integrity: {
      overall: string | null;
      at: string | null;
      sources: number | null;
      verified: number | null;
      findings: number | null;
      counts: Record<string, number> | null;
      runUrl: string | null;
    } | null;
    tokens: { at: string | null; rows: TokenRow[] } | null;
    flow: {
      generatedAt: string | null;
      orphans: number | null;
      ghosts: number | null;
      stale: number | null;
      alerts: number | null;
    } | null;
  };
  live: LivePage[];
  selftest: { contract: string; feeds: FeedMeta[] };
  errors: string[];
}

/* -------------------------------- helpers --------------------------------- */

function sha16(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round(((Date.now() - t) / 60000) * 10) / 10);
}

async function readFeed(absPath: string, relLabel: string): Promise<FeedMeta & { raw: Buffer | null }> {
  try {
    const st = await fs.stat(absPath);
    const raw = await fs.readFile(absPath);
    const m = {
      path: relLabel,
      exists: true,
      bytes: raw.length,
      sha16: sha16(raw),
      mtime: st.mtime.toISOString(),
      ageMinutes: ageMinutes(st.mtime.toISOString()),
    };
    return { ...m, raw };
  } catch {
    return {
      path: relLabel,
      exists: false,
      bytes: null,
      sha16: null,
      mtime: null,
      ageMinutes: null,
      raw: null,
    };
  }
}

function jsonSafe(raw: Buffer | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw.toString("utf8"));
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/* ------------------------------- estate scan ------------------------------ */

function execGit(args: string[], cwd: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString());
    });
  });
}

export async function scanEstate(): Promise<{ clones: RepoScan[]; refsSource: string }> {
  /* גל-18 · טופולוגיה-מלאה: הסריקה-כיסתה-רק-את-estate/ — lane/ · channels/ · autonomy-fix
   * היו-בלתי-נראים-למפקדת (נמדד-חי: 7 מול-14-ריפו-בדיסק).
   * שורש-שהוא-בעצמו-ריפו (autonomy-fix) = מקום-אחד; שורש-אם = כל-בן-עם .git-משלו.
   * זיהוי-הריפו = נוכחות-.git (חד-משמעי) — לא-rev-parse (הוא-true-גם-בתתי-תיקיות). */
  const SCAN_ROOTS: { dir: string; prefix: string }[] = [
    { dir: SAOS_ESTATE, prefix: "" },
    { dir: SAOS_LANE, prefix: "lane/" },
    { dir: SAOS_CHANNELS, prefix: "channels/" },
    { dir: SAOS_AUTONOMY, prefix: "" },
  ];
  type Place = { dir: string; repo: string };
  const places: Place[] = [];
  let nonGitDirs = 0;
  for (const { dir, prefix } of SCAN_ROOTS) {
    if (existsSync(path.join(dir, ".git"))) {
      /* שורש-שהוא-בעצמו-ריפו (למשל autonomy-fix) */
      places.push({ dir, repo: prefix + path.basename(dir) });
      continue;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; /* השורש-לא-קיים — כנות */
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (existsSync(path.join(full, ".git"))) {
        places.push({ dir: full, repo: prefix + e.name });
      } else {
        nonGitDirs += 1;
      }
    }
  }
  if (places.length === 0) {
    return { clones: [], refsSource: "estate-dirs-missing" };
  }

  // linked places = git repos only. State/feed dirs (e.g. Sandbox/) are not
  // clones — they are declared honestly in refsSource, never shown as repos.
  const scans: RepoScan[] = [];
  await Promise.all(
    places.map(async (place): Promise<void> => {
      const dir = place.dir;
      const base: RepoScan = {
        repo: place.repo,
        branch: null,
        head: null,
        headShort: null,
        subject: null,
        committedAt: null,
        ageHours: null,
        dirty: null,
        ahead: null,
        behind: null,
        error: null,
      };
      try {
        const branch = (await execGit(["rev-parse", "--abbrev-ref", "HEAD"], dir)).trim();
        const logOut = await execGit(["log", "-1", "--format=%H%x09%h%x09%cI%x09%s"], dir).catch(() => "");
        const [head, headShort, committedAt, ...rest] = logOut.trim().split("\t");
        const subject = rest.join("\t") || null;

        const porcelain = await execGit(["status", "--porcelain"], dir).catch(() => "");
        const dirty = porcelain.split("\n").filter((l) => l.trim().length > 0).length;

        let ahead: number | null = null;
        let behind: number | null = null;
        try {
          await execGit(["rev-parse", "--verify", "--quiet", `origin/${branch}`], dir);
          const ab = await execGit(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`], dir);
          const [a, b] = ab.trim().split(/\s+/).map((x) => parseInt(x, 10));
          ahead = Number.isFinite(a) ? a : null;
          behind = Number.isFinite(b) ? b : null;
        } catch {
          /* no upstream ref — honest null */
        }

        scans.push({
          repo: place.repo,
          branch,
          head: head || null,
          headShort: headShort || null,
          subject,
          committedAt: committedAt || null,
          ageHours: committedAt
            ? Math.round(((Date.now() - Date.parse(committedAt)) / 3600000) * 10) / 10
            : null,
          dirty,
          ahead,
          behind,
          error: null,
        });
      } catch (e) {
        scans.push({ ...base, error: e instanceof Error ? e.message.slice(0, 120) : "scan-error" });
      }
    })
  );

  scans.sort((a, b) => a.repo.localeCompare(b.repo));

  return {
    clones: scans,
    // honest labeling: we read locally cached remote refs, we do NOT fetch here;
    // non-git dirs (state/feed storage like Sandbox/) are counted, not listed
    refsSource: `local-refs (no fetch in this call; non-git dirs excluded: ${nonGitDirs})`,
  };
}

/* ------------------------------- live pages ------------------------------- */

const LIVE_TARGETS: { url: string; label: string; marker: string | null }[] = [
  { url: "https://roshpinacare-sys.github.io/FleetHQ/", label: "FleetHQ — חלון המשרד הציבורי", marker: null },
  { url: "https://roshpinacare-sys.github.io/FleetHQ/potential.html", label: "FleetHQ — לוח הפוטנציאל", marker: "פוטנציאל" },
  { url: "https://roshpinacare-sys.github.io/FleetHQ/office-state.json", label: "FleetHQ — office-state (עדכניות חי)", marker: null },
  { url: "https://roshpinacare-sys.github.io/Domain/", label: "Domain — המשרד-ראשון", marker: "משרד" },
  { url: "https://roshpinacare-sys.github.io/Domain/office3d/", label: "Domain — חדר 3D אינטראקטיבי", marker: "מפקדת הצי" },
  { url: "https://roshpinacare-sys.github.io/Domain/office3d/growth/", label: "Domain — חדר-הצמיחה", marker: "צמיחה" },
];

async function fetchLive(t: { url: string; label: string; marker: string | null }): Promise<LivePage> {
  const out: LivePage = {
    url: t.url,
    label: t.label,
    status: null,
    bytes: null,
    sha16: null,
    marker: t.marker,
    markerOk: null,
    error: null,
  };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(t.url, { signal: ac.signal, redirect: "follow" });
    clearTimeout(timer);
    out.status = res.status;
    const buf = Buffer.from(await res.arrayBuffer());
    out.bytes = buf.length;
    out.sha16 = sha16(buf);
    if (t.marker) out.markerOk = buf.toString("utf8").includes(t.marker);
  } catch (e) {
    out.error = e instanceof Error ? e.message.slice(0, 100) : "fetch-error";
  }
  return out;
}

/* ------------------------------ feed parsing ------------------------------ */

function parseTokenTruth(raw: Buffer | null): TokenRow[] {
  if (!raw) return [];
  const rows: TokenRow[] = [];
  for (const line of raw.toString("utf8").split("\n")) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 6 && /^\d{4}-\d{2}-\d{2}T/.test(parts[0])) {
      rows.push({
        at: parts[0],
        name: parts[1] ?? "",
        state: parts[2] ?? "",
        kind: parts[3] ?? "",
        days: Number.isFinite(parseInt(parts[5], 10)) ? parseInt(parts[5], 10) : null,
        login: parts[7] ?? null,
      });
    }
  }
  return rows;
}

function parseWorkOrders(raw: Buffer | null): { at: string | null; orders: WorkOrder[] } {
  if (!raw) return { at: null, orders: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return { at: null, orders: [] };
  }
  // shape 1: bare list; shape 2: object with orders/items/work_orders/open
  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? ((d: Record<string, unknown>) =>
          Array.isArray(d.orders)
            ? d.orders
            : Array.isArray(d.items)
              ? d.items
              : Array.isArray(d.work_orders)
                ? d.work_orders
                : Array.isArray(d.open)
                  ? d.open
                  : [])(parsed as Record<string, unknown>)
      : [];
  const obj = Array.isArray(parsed) ? null : (parsed as Record<string, unknown> | null);
  const orders = items
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((o, i) => ({
      id: str(o.id) ?? `wo-${i + 1}`,
      title: str(o.title) ?? str(o.what) ?? str(o.action) ?? "—",
      repo: str(o.repo) ?? str(o.area) ?? str(o.where) ?? null,
      status: str(o.status) ?? (str(o.priority) ? `open·${str(o.priority)}` : "open"),
      evidence: str(o.evidence) ?? str(o.why) ?? null,
      firstStep: str(o.first_step) ?? str(o.firstStep) ?? str(o.acceptance) ?? str(o.next) ?? null,
    }));
  return { at: str(obj?.at) ?? str(obj?.measured_at), orders };
}

function parseCrewMirror(raw: Buffer | null): CrewMirror | null {
  const d = jsonSafe(raw);
  if (!d) return null;
  const tasks = Array.isArray(d.tasks) ? (d.tasks as Record<string, unknown>[]) : [];
  const by = (s: string) => tasks.filter((t) => t.status === s).length;
  const savedMs = num(d.savedAt);
  return {
    tasksTotal: tasks.length || null,
    done: tasks.length ? by("done") : null,
    doing: tasks.length ? by("doing") : null,
    todo: tasks.length ? by("todo") : null,
    blocked: tasks.length ? by("blocked") : null,
    rescued: num(d.rescued),
    savedAt: savedMs ? new Date(savedMs).toISOString() : null,
    goal: str(d.goal),
  };
}

/* ------------------------------- assembler -------------------------------- */

const FEED_PATHS: { abs: string; rel: string }[] = [
  { abs: `${ESTATE_DIR}/FleetHQ/receipts/office-ci/verdict.json`, rel: "FleetHQ/receipts/office-ci/verdict.json" },
  { abs: `${ESTATE_DIR}/FleetHQ/receipts/office-state-mirror.json`, rel: "FleetHQ/receipts/office-state-mirror.json" },
  { abs: `${ESTATE_DIR}/Sandbox/state/network-state.json`, rel: "Sandbox/state/network-state.json" },
  { abs: `${ESTATE_DIR}/Sandbox/ops/integrity/verdict.json`, rel: "Sandbox/ops/integrity/verdict.json" },
  { abs: `${ESTATE_DIR}/Sandbox/proof/out/KEY-PROOF-LATEST.json`, rel: "Sandbox/proof/out/KEY-PROOF-LATEST.json (summary only)" },
  { abs: `${ESTATE_DIR}/Sandbox/ops/office/potential.json`, rel: "Sandbox/ops/office/potential.json" },
  { abs: `${ESTATE_DIR}/Sandbox/ops/office/work-orders.json`, rel: "Sandbox/ops/office/work-orders.json" },
  { abs: `${ESTATE_DIR}/Sandbox/ops/office/VALUE-MAP.md`, rel: "Sandbox/ops/office/VALUE-MAP.md" },
  { abs: `${ESTATE_DIR}/Sandbox/ops/flow/flow-map.json`, rel: "Sandbox/ops/flow/flow-map.json" },
  { abs: `${ESTATE_DIR}/Domain/agents/recruitment.json`, rel: "Domain/agents/recruitment.json" },
  { abs: `${ESTATE_DIR}/Sandbox/ops/TOKEN-TRUTH.md`, rel: "Sandbox/ops/TOKEN-TRUTH.md" },
];

export async function assembleOrganism(): Promise<OrganismPayload> {
  const errors: string[] = [];

  const [estate, ...feeds] = await Promise.all([
    scanEstate(),
    ...FEED_PATHS.map((f) => readFeed(f.abs, f.rel)),
  ]);
  const [ciF, stateF, heartF, integrityF, keyproofF, potentialF, workordersF, valmapF, flowF, recruitF, tokensF] = feeds;

  // live pages, parallel
  const live = await Promise.all(LIVE_TARGETS.map(fetchLive));

  /* office */
  const ci = jsonSafe(ciF.raw);
  const checksRaw = ci && typeof ci.checks === "object" && ci.checks !== null ? ci.checks : null;
  const officeCi = ci
    ? {
        overall: str(ci.overall),
        checks: checksRaw
          ? Object.fromEntries(
              Object.entries(checksRaw as Record<string, unknown>).map(([k, v]) => [k, str(v) ?? String(v)])
            )
          : null,
        at: str(ci.at),
        ageMinutes: ageMinutes(str(ci.at)),
        runUrl:
          ci && typeof ci.provenance === "object" && ci.provenance !== null
            ? str((ci.provenance as Record<string, unknown>).runUrl)
            : null,
        reason: str(ci.reason),
      }
    : null;
  if (!ciF.exists) errors.push(`feed missing: ${ciF.path}`);

  // live crew state comes from the PUBLIC Pages feed (live fetch, not a file)
  const liveStateUrl = "https://roshpinacare-sys.github.io/FleetHQ/office-state.json";
  let liveStateJson: Record<string, unknown> | null = null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(liveStateUrl, { signal: ac.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const v: unknown = await res.json();
      if (typeof v === "object" && v !== null) liveStateJson = v as Record<string, unknown>;
    }
  } catch {
    /* honest null */
  }
  const liveAgents = liveStateJson && Array.isArray(liveStateJson.agents) ? liveStateJson.agents : null;
  const officeState = liveStateJson
    ? {
        connected: bool(liveStateJson.connected),
        backend: str(liveStateJson.backend),
        statusHe: str(liveStateJson.statusHe),
        agents: liveAgents ? liveAgents.length : null,
        capturedAt: str(liveStateJson.capturedAt),
      }
    : null;
  const crewMirror = parseCrewMirror(stateF.raw);

  const hb = jsonSafe(heartF.raw);
  const keeper = hb && typeof hb.keeper === "object" && hb.keeper !== null ? (hb.keeper as Record<string, unknown>) : null;
  const heartbeat = keeper
    ? { tickCount: num(keeper.tickCount), lastTick: str(keeper.lastTick), status: str(keeper.status) }
    : null;

  /* growth */
  const pot = jsonSafe(potentialF.raw);
  const estateRaw =
    pot && typeof pot.estate === "object" && pot.estate !== null ? (pot.estate as Record<string, unknown>) : null;
  const rowsRaw = estateRaw && Array.isArray(estateRaw.rows) ? estateRaw.rows : [];
  const estateRows: EstateRow[] = rowsRaw
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((r) => ({
      repo: str(r.repo) ?? "?",
      status: str(r.status) ?? "?",
      pushAgeH: num(r.push_age_h),
      reds48h: num(r.reds_48h),
      openIssues: num(r.open_issues),
      archived: bool(r.archived) ?? false,
    }));

  const workorders = parseWorkOrders(workordersF.raw);
  const growth = {
    potential: pot
      ? {
          measuredAt: str(pot.measured_at),
          workOrdersOpen: num(pot.work_orders_open),
          topActions: Array.isArray(pot.top_actions)
            ? pot.top_actions.filter((x): x is string => typeof x === "string")
            : [],
          tokenDaysLeft: num(pot.token_days_left),
          delta: Array.isArray(pot.delta_since_last)
            ? pot.delta_since_last.filter((x): x is string => typeof x === "string")
            : [],
          notScanned: str(pot.not_scanned),
          rows: estateRows,
        }
      : null,
    workOrders: workorders.orders,
    workOrdersAt: workorders.at,
    valueMap: {
      path: valmapF.path,
      exists: valmapF.exists,
      bytes: valmapF.bytes,
      sha16: valmapF.sha16,
      mtime: valmapF.mtime,
      ageMinutes: valmapF.ageMinutes,
    },
  };
  if (!potentialF.exists) errors.push(`feed missing: ${potentialF.path}`);

  /* recruit */
  const rec = jsonSafe(recruitF.raw);
  const rolesRaw = rec && Array.isArray(rec.roles) ? rec.roles : [];
  const roles: RecruitRole[] = rolesRaw
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((r) => {
      const title = typeof r.title === "object" && r.title !== null ? (r.title as Record<string, unknown>) : {};
      return {
        id: str(r.id) ?? "role",
        titleHe: str(title.he) ?? (typeof r.title === "string" ? r.title : "—"),
        titleEn: str(title.en),
        openedBy: str(r.openedBy) ?? str(r.opened_by) ?? null,
        contract: str(r.contract) ?? null,
      };
    });
  const recruit = rec ? { at: str(rec.at), roles } : null;

  /* truth */
  const kp = jsonSafe(keyproofF.raw);
  const kpSummary =
    kp && typeof kp.summary === "object" && kp.summary !== null ? (kp.summary as Record<string, unknown>) : null;
  const keyProof = kpSummary
    ? {
        generatedAt: str(kp?.generatedAt),
        dead: num(kpSummary.DEAD),
        aliveAlert: num(kpSummary["ALIVE-ALERT"]),
        unknown: num(kpSummary.UNKNOWN),
        notChainTestable: num(kpSummary["UNKNOWN-NOT-CHAIN-TESTABLE"]),
        incident: bool(kpSummary.incident),
      }
    : null;

  const ig = jsonSafe(integrityF.raw);
  const igSummary =
    ig && typeof ig.summary === "object" && ig.summary !== null ? (ig.summary as Record<string, unknown>) : null;
  const igCounts =
    igSummary && typeof igSummary.counts === "object" && igSummary.counts !== null
      ? Object.fromEntries(
          Object.entries(igSummary.counts as Record<string, unknown>).map(([k, v]) => [k, num(v) ?? 0])
        )
      : null;
  const integrity = ig
    ? {
        overall: str(ig.overall),
        at: str(ig.at),
        sources: num(igSummary?.sources),
        verified: num(igSummary?.verified),
        findings: num(igSummary?.findings),
        counts: igCounts,
        runUrl:
          ig && typeof ig.provenance === "object" && ig.provenance !== null
            ? str((ig.provenance as Record<string, unknown>).runUrl)
            : null,
      }
    : null;

  const tokens = { at: tokensF.mtime, rows: parseTokenTruth(tokensF.raw) };

  const fm = jsonSafe(flowF.raw);
  const cnt = (v: unknown) => (Array.isArray(v) ? v.length : null);
  const flow = fm
    ? {
        generatedAt: str(fm.generatedAt),
        orphans: cnt(fm.orphans),
        ghosts: cnt(fm.ghosts),
        stale: cnt(fm.stale),
        alerts: cnt(fm.alerts),
      }
    : null;

  return {
    at: new Date().toISOString(),
    node: { host: "zai-sandbox", estateDir: ESTATE_DIR, refsSource: estate.refsSource, clones: estate.clones },
    office: { ci: officeCi, state: officeState, crewMirror, heartbeat },
    growth,
    recruit,
    truth: { keyProof, integrity, tokens, flow },
    live,
    selftest: {
      contract:
        "אין-זיופים: כל ערך נמדד כעת ממקור מוכרז (קובץ עם mtime+sha16 או fetch חי עם status+sha16); חסר = מוצהר חסר; חומר-מפתח אף-פעם-לא-נקרא (מפתח-הוכחה מסכם ספירות בלבד)",
      feeds: feeds.map(({ raw, ...m }) => m),
    },
    errors,
  };
}
