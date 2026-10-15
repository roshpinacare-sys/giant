/**
 * GET /api/giant/giants — ליגת-הענקים + דוקטרינת-הכנות (GIANT · R360)
 *
 * מקור-האמת: הגיט המקומי בלבד — Domain/dex/giants.json (ליגת-DeFi נמדדת,
 * Llama-API ציבורי בצד-המנוע) + Domain/dex/honest-econ.json (שתי-קופות, R74).
 * SAOS נמדדת בפעולות-ספר בלבד — אין-ביד-חוץ, אין ווליום-USD חוץ: מוצהר-כנה.
 * כשל = כנה (fail-honest). cache-זיכרון 60 שניות.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { fileMeta, type FileMeta } from "@/lib/sovereign/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GIANTS_PATH = "/home/z/estate/Domain/dex/giants.json";
const ECON_PATH = "/home/z/estate/Domain/dex/honest-econ.json";

let cache: { at: number; data: GiantsPayload } | null = null;
const CACHE_MS = 60_000;

export interface GiantRow {
  id: string;
  name: string;
  vol24h: number | null;
  fees24h: number | null;
  category: string | null;
  ours: boolean;
}

export interface GiantsPayload {
  ok: boolean;
  note?: string;
  book: string | null;
  publishedAt: string | null;
  familiesCount: number | null;
  league: GiantRow[];
  ours: GiantRow | null;
  oursFills: number | null;
  oursSwaps: number | null;
  econ: {
    engine: string | null;
    externalBidExists: boolean | null;
    internalPriceUsdsMu: number | null;
    doctrineHe: string | null;
  } | null;
  giantsMeta: FileMeta;
  econMeta: FileMeta;
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface FamilyRaw {
  id?: string;
  name?: string;
  category?: string;
  vol24h?: number;
  fees24h?: number;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data, { headers: { "cache-control": "no-store" } });
  }

  const giantsMeta = await fileMeta(GIANTS_PATH);
  const econMeta = await fileMeta(ECON_PATH);

  // הליגה מהגיט-מקומי
  let league: GiantRow[] = [];
  let ours: GiantRow | null = null;
  let familiesCount: number | null = null;
  let book: string | null = null;
  let publishedAt: string | null = null;
  let oursFills: number | null = null;
  let oursSwaps: number | null = null;

  if (giantsMeta.exists) {
    try {
      const raw = JSON.parse(await readFile(GIANTS_PATH, "utf8")) as {
        book?: string;
        publishedAt?: string;
        families?: FamilyRaw[];
      };
      book = s(raw.book);
      publishedAt = s(raw.publishedAt);
      familiesCount = Array.isArray(raw.families) ? raw.families.length : null;
      const rows = (raw.families ?? [])
        .map((f) => ({
          id: s(f.id) ?? "unknown",
          name: s(f.name) ?? "unknown",
          vol24h: n(f.vol24h),
          fees24h: n(f.fees24h),
          category: s(f.category),
          ours: false,
        }))
        .filter((f) => f.vol24h !== null)
        .sort((a, b) => (b.vol24h ?? 0) - (a.vol24h ?? 0));
      league = rows.slice(0, 8);
    } catch {
      /* fail-honest — הליגה נשארת ריקה עם הצהרה */
    }
  }

  // המדידה-שלנו: פעולות-ספר בלבד (state.json) — אפס-תביעת-ווליום-חוץ
  try {
    const st = JSON.parse(await readFile("/home/z/estate/Domain/dex/state.json", "utf8")) as {
      state?: { fills?: number; swaps?: number };
    };
    oursFills = n(st.state?.fills);
    oursSwaps = n(st.state?.swaps);
  } catch {
    /* fail-honest */
  }
  ours = {
    id: "saos",
    name: "SAOS (אנחנו)",
    vol24h: null, // כנות-מלאה: אין-ביד-חוץ, אין-ווליום-USD-חוץ — ההוכחה: פעולות-הספר
    fees24h: null,
    category: "saos-dex · ריבוני",
    ours: true,
  };

  // דוקטרינת-הכנות (שתי-קופות)
  let econ: GiantsPayload["econ"] = null;
  if (econMeta.exists) {
    try {
      const raw = JSON.parse(await readFile(ECON_PATH, "utf8")) as {
        engine?: string;
        doctrine?: { he?: string };
        saosExternalBid?: { exists?: boolean; internalPriceUsdsMu?: number };
      };
      econ = {
        engine: s(raw.engine),
        externalBidExists: typeof raw.saosExternalBid?.exists === "boolean" ? raw.saosExternalBid.exists : null,
        internalPriceUsdsMu: n(raw.saosExternalBid?.internalPriceUsdsMu),
        doctrineHe: s(raw.doctrine?.he),
      };
    } catch {
      /* fail-honest */
    }
  }

  const ok = league.length > 0 || oursFills !== null;
  const payload: GiantsPayload = {
    ok,
    note: ok ? undefined : "הליגה והמדידה-שלנו לא נמדדו כרגע — fail-honest",
    book,
    publishedAt,
    familiesCount,
    league,
    ours,
    oursFills,
    oursSwaps,
    econ,
    giantsMeta,
    econMeta,
  };
  cache = { at: Date.now(), data: payload };
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
