/**
 * fleet.ts — מנוע-הצי-החי (GIANT · מופשט מה-route לשימוש-משותף).
 * GitHub Search API: org:roshpinacare-sys — המדידה-האמיתית של האימפריה
 * (ה-REST /orgs מחזיר 404 עם PAT-fine-grained; החיפוש הוא הדרך-החיה).
 * PAT שרת-בלבד · cache-זיכרון 120ש׳ · כשל = fail-honest.
 */
import { readPat } from "@/lib/office-truth";

let cache: { at: number; data: FleetPayload } | null = null;
const CACHE_MS = 120_000;

export interface FleetRow {
  name: string;
  pushedAt: string | null;
  ageMinutes: number | null;
  archived: boolean;
  isPrivate: boolean;
  language: string | null;
  description: string | null;
  defaultBranch: string | null;
}
export interface FleetPayload {
  ok: boolean;
  note?: string;
  total: number | null;
  repos: FleetRow[];
  pushedLast24h: number | null;
  fetchedAt: string;
}

interface GhRepo {
  name?: string;
  pushed_at?: string;
  archived?: boolean;
  private?: boolean;
  language?: string | null;
  description?: string | null;
  default_branch?: string | null;
}

export async function loadFleet(force = false): Promise<FleetPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const pat = await readPat();
  const empty: FleetPayload = {
    ok: false,
    note: "הצי לא נמדד כרגע — נסה שוב (כשל-כנה)",
    total: null,
    repos: [],
    pushedLast24h: null,
    fetchedAt: new Date().toISOString(),
  };
  if (!pat) return empty;

  try {
    const res = await fetch(
      "https://api.github.com/search/repositories?q=org:roshpinacare-sys&per_page=100&sort=pushed&order=desc",
      {
        headers: {
          authorization: `Bearer ${pat}`,
          accept: "application/vnd.github+json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) {
      return { ...empty, note: `GitHub לא הגיב (HTTP ${res.status}) — הצי לא נמדד (כשל-כנה)` };
    }
    const found = (await res.json()) as { total_count?: number; items?: GhRepo[] };
    const batch = Array.isArray(found.items) ? found.items : [];

    const repos: FleetRow[] = batch
      .filter((r) => typeof r?.name === "string" && r.name)
      .map((r) => {
        const pushedAt = typeof r.pushed_at === "string" ? r.pushed_at : null;
        const ageMinutes =
          pushedAt !== null
            ? Math.max(0, Math.round((Date.now() - Date.parse(pushedAt)) / 60_000)) || 0
            : null;
        return {
          name: String(r.name),
          pushedAt,
          ageMinutes,
          archived: r.archived === true,
          isPrivate: r.private === true,
          language: typeof r.language === "string" ? r.language : null,
          description: typeof r.description === "string" && r.description ? r.description.slice(0, 120) : null,
          defaultBranch: typeof r.default_branch === "string" ? r.default_branch : null,
        };
      })
      .sort((a, b) => (a.ageMinutes ?? Infinity) - (b.ageMinutes ?? Infinity));

    const data: FleetPayload = {
      ok: repos.length > 0,
      note: repos.length > 0 ? undefined : "הצי ריק-כנה — אף ריפו לא נמדד",
      total: repos.length,
      repos,
      pushedLast24h: repos.filter((r) => (r.ageMinutes ?? Infinity) <= 1440).length,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return { ...empty, note: "השרת לא הצליח להגיע לגיט — הצי לא נמדד (כשל-כנה)" };
  }
}
