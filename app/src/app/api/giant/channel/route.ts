// GET /api/giant/channel — זרמי-ערוץ-הבעלים הקנוניים (SAOS-SOVEREIGN-CHANNEL/1)
// ═════════════════════════════════════════════════════════════════════════
// חוק-האם: git הוא-שכבת-ההישרדות-היחידה — נקרא-ישירות מ-Pulse/state/sovereign-channel.
// אפס-מאגר-כפול: cache-זיכרון 30 שניות; כשל = כנה (לעולם לא ירוק-מזויף).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE =
  "https://raw.githubusercontent.com/roshpinacare-sys/Pulse/main/state/sovereign-channel";

interface CacheEntry {
  at: number;
  data: ChannelPayload;
}
let cache: CacheEntry | null = null;
const CACHE_MS = 30_000;

export type StreamRow = Record<string, unknown>;

export interface ChannelPayload {
  ok: boolean;
  note?: string;
  directives: StreamRow[];
  requests: StreamRow[];
  notes: StreamRow[];
  voice: StreamRow | null;
  fetchedAt: string;
}

function parseJsonl(text: string): StreamRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as StreamRow;
      } catch {
        return { PARSE_ERROR: true, raw: l.slice(0, 120) } as StreamRow;
      }
    });
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function loadChannel(force = false): Promise<ChannelPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const [d, r, n, v] = await Promise.all([
    fetchText(`${BASE}/directives.jsonl`),
    fetchText(`${BASE}/requests.jsonl`),
    fetchText(`${BASE}/notes.jsonl`),
    fetchText(`${BASE}/voice.json`),
  ]);
  let voice: StreamRow | null = null;
  if (v) {
    try {
      voice = JSON.parse(v) as StreamRow;
    } catch {
      voice = { PARSE_ERROR: true };
    }
  }
  const payload: ChannelPayload = {
    ok: Boolean(d && r),
    note: d && r ? undefined : "הזרמים לא נמדדו כרגע — נסה שוב",
    directives: d ? parseJsonl(d) : [],
    requests: r ? parseJsonl(r) : [],
    notes: n ? parseJsonl(n) : [],
    voice,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadChannel();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
