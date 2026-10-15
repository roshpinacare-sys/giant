// ═══ /api/office-state — ערוץ-האמת המקומי של המשרד החי ══════════════════════
// אותו חוזה בדיוק כמו gatherDirect ב-truth-bridge (WirePayload):
// השרת אוגד את המקורות-הפומביים במקביל; מה שנכשל — מוחזר ככשל כנה
// (ok:false + error), לעולם לא ממולא. אפס סודות — מקורות-גיט פומביים בלבד.
import { NextResponse } from "next/server";
import { getJson, readPat } from "@/lib/office-truth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface WirePayload {
  fetchedAt: string;
  foreman: { ok: boolean; error?: string; state?: unknown };
  pulse: { ok: boolean; error?: string; data?: unknown };
  beacon: { ok: boolean; error?: string; data?: unknown };
  git: {
    ok: boolean;
    error?: string;
    commits?: { hash: string; subject: string; author: string; ts: number; repo: string }[];
  };
  /** R57 — ספרי-הצי מהיומן-החי (אותו חוזה כמו gatherDirect ב-truth-bridge) */
  books?: { ok: boolean; error?: string; at?: string; list?: { name: string; ageHours: number | null; fresh: boolean; empty: boolean }[] };
}

const RAW_BASE = "https://raw.githubusercontent.com/roshpinacare-sys";

interface GhCommit {
  sha?: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
    committer?: { name?: string };
  };
}

/** R57 — מיפוי books.list מהיומן-החי (מינימלי, בלי המצאה) */
interface OfficeLiveRaw {
  generatedAt?: string;
  books?: { list?: { name?: unknown; ageHours?: unknown; fresh?: unknown; empty?: unknown }[] };
}

function mapBooks(raw: OfficeLiveRaw | null): WirePayload["books"] {
  const list = raw?.books?.list;
  if (!Array.isArray(list)) return { ok: false, error: "unavailable" };
  const out: NonNullable<NonNullable<WirePayload["books"]>["list"]> = [];
  for (const b of list) {
    if (!b || typeof b !== "object" || typeof b.name !== "string" || !b.name) continue;
    out.push({
      name: b.name,
      ageHours: typeof b.ageHours === "number" && Number.isFinite(b.ageHours) ? b.ageHours : null,
      fresh: b.fresh === true,
      empty: b.empty === true,
    });
  }
  if (!out.length) return { ok: false, error: "unavailable" };
  return { ok: true, ...(raw?.generatedAt ? { at: raw.generatedAt } : {}), list: out };
}

export async function GET() {
  const pat = await readPat();
  const [foremanState, pulseData, beaconData, ghCommits, officeLive] = await Promise.all([
    getJson<unknown>(`${RAW_BASE}/FleetHQ/main/office/state/office-state.json`, null),
    getJson<unknown>(`${RAW_BASE}/Domain/main/office/data.json`, null),
    getJson<unknown>(`${RAW_BASE}/sovereign-beacon/main/state.json`, null),
    getJson<GhCommit[]>(
      "https://api.github.com/repos/roshpinacare-sys/FleetHQ/commits?per_page=8",
      pat,
    ),
    getJson<OfficeLiveRaw>("https://roshpinacare-sys.github.io/Domain/agents/office-live.json", null),
  ]);

  const commits = Array.isArray(ghCommits)
    ? ghCommits
        .filter((c) => c?.sha && c?.commit?.message)
        .map((c) => ({
          hash: c.sha!.slice(0, 10),
          subject: c.commit!.message!.split("\n")[0].slice(0, 90),
          author: c.commit!.author?.name || c.commit!.committer?.name || "unknown",
          ts: Date.parse(c.commit!.author?.date ?? "") || Date.now(),
          repo: "FleetHQ",
        }))
    : undefined;

  const payload: WirePayload = {
    fetchedAt: new Date().toISOString(),
    foreman: {
      ok: !!foremanState,
      ...(foremanState ? { state: foremanState } : { error: "unavailable" }),
    },
    pulse: {
      ok: !!pulseData,
      ...(pulseData ? { data: pulseData } : { error: "unavailable" }),
    },
    beacon: {
      ok: !!beaconData,
      ...(beaconData ? { data: beaconData } : { error: "unavailable" }),
    },
    git: {
      ok: !!commits?.length,
      ...(commits?.length ? { commits } : { error: "unavailable" }),
    },
    books: mapBooks(officeLive),
  };

  return NextResponse.json(payload, {
    headers: { "cache-control": "no-store" },
  });
}
