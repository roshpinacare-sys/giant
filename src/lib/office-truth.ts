// ═══ אמת-המשרד: גשר-מדידה ל-9 הזנות-החדר + STASIS + פקודות + ריצות ═════════
// חוק-אמת: מה שנמדד — זה מה שחוזר. כשל = null/UNKNOWN, לעולם לא ירוק-מזויף.
// ה-caps = אותם ערכי FRESH_MIN של החדר החי (המשרד היחיד — רץ בשורש האפליקציה, RoomRoot).
import { readFile } from "fs/promises";
import path from "path";

export const FEEDS: { key: string; he: string; url: string; capMin: number }[] = [
  { key: "foreman", he: "פורמן", url: "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json", capMin: 130 },
  { key: "pulse", he: "דופק", url: "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/data.json", capMin: 30 },
  { key: "live", he: "ספרים", url: "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/office-live.json", capMin: 150 },
  { key: "grid", he: "הון", url: "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/grid-truth.json", capMin: 95 },
  { key: "recruit", he: "גיוס", url: "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/recruitment.json", capMin: 1600 },
  { key: "ventures", he: "מיזמים", url: "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/ventures.json", capMin: 1600 },
  { key: "orders", he: "פקודות", url: "https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/ops/office/work-orders.json", capMin: 35 },
  { key: "integrity", he: "שלמות", url: "https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/ops/integrity/verdict.json", capMin: 95 },
  { key: "products", he: "מוצר", url: "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/marketing/products.json", capMin: 2880 },
];

export async function readPat(): Promise<string | null> {
  // T-76 · עמידות-סנדבוקס: הסנדבוקס מנקה את upload/ (נמדד: 2026-10-16 — הסנדבוקס
  // מחק את pat.env באמצע-הפעלה וכל-הדלתות-נמדדות-מהגיט נפלו לכשל-כנה). ה-פאט של
  // הבעלים מועתק גם ל-.secrets/pat (מאוּטר-גיט) — הקריאה מנסה את שני המקומות.
  const candidates: string[][] = [
    ["upload", "pat.env"],
    [".secrets", "pat"],
  ];
  for (const parts of candidates) {
    try {
      const raw = await readFile(path.join(process.cwd(), ...parts), "utf8");
      const m = raw.match(/(?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)/);
      if (m) return m[0];
    } catch {
      /* המקום-הבא-בתור — כנות: אין-פאט = אפס-מדידה */
    }
  }
  return null;
}

export async function getJson<T = unknown>(url: string, token: string | null): Promise<T | null> {
  try {
    const headers: Record<string, string> = { "cache-control": "no-cache" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function ageMinutes(ts: unknown): number | null {
  if (typeof ts !== "string" && typeof ts !== "number") return null;
  const t = new Date(ts as string).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

function tsOf(d: Record<string, unknown>): number | null {
  for (const k of ["generatedAt", "servedAt", "resolvedAt", "at", "updatedAt", "timestamp"]) {
    if (k in d) {
      const a = ageMinutes(d[k]);
      if (a !== null) return a;
    }
  }
  if (Array.isArray(d["orders"] ?? d) ) {
    const arr = (d["orders"] as unknown[]) ?? (d as unknown as unknown[]);
    const last = arr.filter(Boolean).at(-1) as Record<string, unknown> | undefined;
    if (last) {
      for (const k of ["resolvedAt", "acceptedAt", "createdAt", "at"]) {
        if (k in last) {
          const a = ageMinutes(last[k]);
          if (a !== null) return a;
        }
      }
    }
  }
  return null;
}

export interface FeedAge {
  key: string;
  he: string;
  ageMin: number | null;
  capMin: number;
  state: "fresh" | "aging" | "stale" | "unknown";
}

export async function measureFeeds(token: string | null): Promise<FeedAge[]> {
  const results = await Promise.all(
    FEEDS.map(async (f) => {
      const d = await getJson<Record<string, unknown>>(f.url, token);
      let age = d ? tsOf(d) : null;
      if (age === null && d && Array.isArray(d)) {
        const last = (d as unknown[]).filter(Boolean).at(-1) as Record<string, unknown> | undefined;
        if (last) {
          for (const k of ["resolvedAt", "generatedAt", "at", "acceptedAt", "createdAt"]) {
            if (k in last) {
              const a = ageMinutes(last[k]);
              if (a !== null) {
                age = a;
                break;
              }
            }
          }
        }
      }
      const state: FeedAge["state"] =
        age === null ? "unknown" : age <= f.capMin ? "fresh" : age <= f.capMin * 1.5 ? "aging" : "stale";
      return { key: f.key, he: f.he, ageMin: age, capMin: f.capMin, state };
    }),
  );
  return results;
}

export interface StasisState {
  active: boolean | null;
  mode: string | null;
  allowCount: number;
  allOpen: boolean;
  label: string;
}

export async function measureStasis(token: string | null): Promise<StasisState> {
  const d = await getJson<{
    active?: boolean;
    mode?: string;
    stagedLanes?: { allow?: string[] };
  }>("https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/STASIS.json", token);
  if (!d) return { active: null, mode: null, allowCount: 0, allOpen: false, label: "לא-נמדד" };
  const allow = d.stagedLanes?.allow ?? [];
  const allOpen = !d.active || (d.mode === "staged" && allow.includes("general") && allow.length >= 7);
  return {
    active: d.active ?? null,
    mode: d.mode ?? null,
    allowCount: allow.length,
    allOpen,
    label: allOpen ? "כל-המסילות פתוחות · הבלם חמוש" : "מסילות מדורגות · הבלם חמוש",
  };
}

export interface OrdersState {
  total: number;
  open: number;
  openIds: string[];
}

export async function measureOrders(token: string | null): Promise<OrdersState> {
  const d = await getJson<unknown>("https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/ops/office/work-orders.json", token);
  const arr = Array.isArray(d) ? d : ((d as { orders?: unknown[] })?.orders ?? []);
  const open = (arr as { id?: string; resolved?: boolean; resolvedAt?: string }[]).filter(
    (o) => o && !o.resolved && !o.resolvedAt,
  );
  return { total: arr.length, open: open.length, openIds: open.map((o) => o.id ?? "?").slice(0, 12) };
}

export interface RunRow {
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  ageMin: number | null;
}

export async function measureRuns(token: string | null, repo = "Domain", perPage = 12): Promise<RunRow[] | null> {
  const d = await getJson<{ workflow_runs?: { name: string; event: string; status: string; conclusion: string | null; created_at: string }[] }>(
    `https://api.github.com/repos/roshpinacare-sys/${repo}/actions/runs?per_page=${perPage}`,
    token,
  );
  const runs = d?.workflow_runs ?? null;
  if (!runs) return null;
  return runs.map((r) => ({
    name: r.name,
    event: r.event,
    status: r.status,
    conclusion: r.conclusion,
    createdAt: r.created_at,
    ageMin: ageMinutes(r.created_at),
  }));
}

/** dispatch אמיתי של workflow (workflow_dispatch) — מחזיר כנות: 204 = נתקבל */
export async function dispatchWorkflow(token: string, repo: string, workflow: string, ref = "main"): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(`https://api.github.com/repos/roshpinacare-sys/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify({ ref }),
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.status === 204, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** רישום-מפעיל — ערוץ-ההשפעה העמיד בגיט (Sandbox/ops/office/operator-journal.jsonl) */
export async function journalToGit(entry: Record<string, unknown>): Promise<{ ok: boolean; note: string }> {
  try {
    const { spawn } = await import("node:child_process");
    const repoDir = "/home/z/estate/Sandbox";
    const journalPath = `${repoDir}/ops/office/operator-journal.jsonl`;
    await readFile(journalPath, "utf8").catch(() => "");
    const { appendFile } = await import("node:fs/promises");
    await appendFile(journalPath, JSON.stringify(entry) + "\n", "utf8");
    const run = (args: string[], timeout = 30000) =>
      new Promise<{ code: number; out: string }>((resolve) => {
        const p = spawn("git", args, { cwd: repoDir });
        let out = "";
        p.stdout.on("data", (d) => (out += d));
        p.stderr.on("data", (d) => (out += d));
        p.on("close", (code) => resolve({ code: code ?? 1, out }));
        setTimeout(() => resolve({ code: 124, out: out + "\ntimeout" }), timeout);
      });
    await run(["-c", "rebase.autoStash=true", "pull", "--rebase", "origin", "main"]);
    await run(["add", "ops/office/operator-journal.jsonl"]);
    const commit = await run(["commit", "-m", `operator-journal: ${String(entry.intent ?? "note")} [skip ci]`]);
    if (commit.code !== 0) return { ok: false, note: "commit-failed (nothing to commit or git error)" };
    const push = await run(["push", "origin", "main"], 45000);
    if (push.code !== 0) {
      // נסיון-שני: rebase ואז דחיפה
      await run(["-c", "rebase.autoStash=true", "pull", "--rebase", "origin", "main"]);
      const push2 = await run(["push", "origin", "main"], 45000);
      return push2.code === 0
        ? { ok: true, note: "journaled+pushed (retried)" }
        : { ok: false, note: "push-failed (kept locally, will ride next commit)" };
    }
    return { ok: true, note: "journaled+pushed to Sandbox/ops/office/operator-journal.jsonl" };
  } catch (e) {
    return { ok: false, note: `journal-failed: ${String(e).slice(0, 80)}` };
  }
}
