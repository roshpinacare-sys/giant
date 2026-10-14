// GET /api/giant/pulse — דופק-הצי: 39 ספרי-האחזקה + רישום-ההחלטות
// ═════════════════════════════════════════════════════════════════════════
// הכל נמדד-חי מהגיט (GitHub API, PAT שרת-בלבד). כשל = כנה. cache 60 שניות.
import { NextResponse } from "next/server";
import { readPat } from "@/lib/office-truth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: PulsePayload } | null = null;
const CACHE_MS = 60_000;

export interface RepoHealth {
  name: string;
  pushedAt: string | null;
  private: boolean;
  ageHours: number | null;
  state: "live" | "active" | "quiet" | "unknown";
}
export interface DecisionRow {
  id: string;
  date: string;
  title: string;
}
export interface PulsePayload {
  ok: boolean;
  note?: string;
  repos: RepoHealth[];
  total: number;
  decisions: DecisionRow[];
  fetchedAt: string;
}

async function ghJson<T>(url: string, pat: string | null): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { ...(pat ? { authorization: `Bearer ${pat}` } : {}), accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function ageHours(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

function stateOf(h: number | null): RepoHealth["state"] {
  if (h === null) return "unknown";
  if (h < 6) return "live";
  if (h < 48) return "active";
  return "quiet";
}

interface GhRepo {
  name: string;
  pushed_at: string | null;
  private: boolean;
}

export async function loadPulse(force = false): Promise<PulsePayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const pat = await readPat();
  const repos = await ghJson<GhRepo[]>(
    "https://api.github.com/user/repos?per_page=100&sort=pushed&type=owner",
    pat,
  );
  const decisionsRaw = await ghJson<unknown>("https://raw.githubusercontent.com/roshpinacare-sys/Pulse/main/DECISIONS.md", null);

  const payload: PulsePayload = {
    ok: Array.isArray(repos),
    note: Array.isArray(repos) ? undefined : "דופק לא נמדד כרגע — נסה שוב",
    repos: Array.isArray(repos)
      ? repos.map((r) => {
          const h = ageHours(r.pushed_at);
          return { name: r.name, pushedAt: r.pushed_at, private: r.private, ageHours: h, state: stateOf(h) };
        })
      : [],
    total: Array.isArray(repos) ? repos.length : 0,
    decisions: [],
    fetchedAt: new Date().toISOString(),
  };

  if (typeof decisionsRaw === "string") {
    const rows = decisionsRaw.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l));
    payload.decisions = rows.slice(-10).reverse().map((l) => {
      const cols = l.split("|").map((c) => c.trim());
      // | id | date | title... | ... |
      const id = cols[1] ?? "";
      const date = cols[2] ?? "";
      const title = (cols[3] ?? "").slice(0, 220);
      return { id, date, title };
    }).filter((d) => d.id);
  }

  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadPulse();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
