// GET /api/giant/desk — שולחן-המסחר הריבוני (saos-desk: mandate + beat)
// ═════════════════════════════════════════════════════════════════════════
// paper/live-armed · מגבלות-סיכון · סדרת-equity · משקלי-אסטרטגיות (wins/losses).
// PAT שרת-בלבד; כשל = כנה. cache 60 שניות.
import { NextResponse } from "next/server";
import { readPat } from "@/lib/office-truth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: DeskPayload } | null = null;
const CACHE_MS = 60_000;

export interface StrategyWeight {
  name: string;
  weight: number;
  wins: number;
  losses: number;
}
export interface DeskPayload {
  ok: boolean;
  note?: string;
  mode: string | null;
  liveOwnerArmed: boolean;
  limits: Record<string, number>;
  quorum: Record<string, number> | null;
  beat: number | null;
  chainHead: string | null;
  equity: number[];
  strategies: StrategyWeight[];
  fetchedAt: string;
}

async function ghRaw<T>(path: string, pat: string): Promise<T | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/roshpinacare-sys/saos-desk/main/${path}`, {
      headers: { authorization: `Bearer ${pat}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface Mandate {
  execution?: { mode?: string; liveOwnerArmed?: boolean };
  limits?: Record<string, number>;
  quorum?: Record<string, number>;
}
interface Beat {
  beat?: number;
  head?: string;
  chainHead?: string;
  equity?: number[];
  weights?: Record<string, { weight?: number; wins?: number; losses?: number }>;
}

export async function loadDesk(force = false): Promise<DeskPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const pat = await readPat();
  const empty: DeskPayload = {
    ok: false, note: "השולחן לא נמדד כרגע — נסה שוב", mode: null, liveOwnerArmed: false,
    limits: {}, quorum: null, beat: null, chainHead: null, equity: [], strategies: [],
    fetchedAt: new Date().toISOString(),
  };
  if (!pat) return empty;
  const [mandate, beat] = await Promise.all([ghRaw<Mandate>("mandate.json", pat), ghRaw<Beat>("state/beat.json", pat)]);
  if (!mandate && !beat) return empty;

  const payload: DeskPayload = {
    ok: true,
    mode: mandate?.execution?.mode ?? null,
    liveOwnerArmed: Boolean(mandate?.execution?.liveOwnerArmed),
    limits: mandate?.limits ?? {},
    quorum: mandate?.quorum ?? null,
    beat: typeof beat?.beat === "number" ? beat.beat : null,
    chainHead: beat?.chainHead ?? beat?.head ?? null,
    equity: Array.isArray(beat?.equity) ? (beat?.equity as number[]) : [],
    strategies: Object.entries(beat?.weights ?? {}).map(([name, w]) => ({
      name,
      weight: Number(w.weight ?? 0),
      wins: Number(w.wins ?? 0),
      losses: Number(w.losses ?? 0),
    })),
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadDesk();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
