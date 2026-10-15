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
import path from "node:path";
import { fileMeta, type FileMeta } from "@/lib/sovereign/channel";
import { DOMAIN_DIR } from "@/lib/giant/truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GIANTS_PATH = path.join(DOMAIN_DIR, "dex", "giants.json");
const ECON_PATH = path.join(DOMAIN_DIR, "dex", "honest-econ.json");
const GAP_PATH = path.join(DOMAIN_DIR, "dex", "giants-gap.json");

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
  gap: GapSection | null;
}

/* ─────────── מד-המרחק-מהענקים (giants-gap.json · ביקורת-קוד-אמת) ─────────── */

export interface GapCapability {
  id: string;
  he: string;
  weight: number;
  giant: "yes" | "partial" | "no";
  giantFact: string | null;
  ours: "yes" | "partial" | "no";
  oursProof: string | null;
  gapClosedAt?: string;
}

export interface GapSection {
  ok: boolean;
  note?: string;
  book: string | null;
  publishedAt: string | null;
  answerHe: string | null;
  sources: Array<{ id: string; url: string; what: string }>;
  capabilities: GapCapability[];
  score: {
    ours: number | null; // 0-100 · כנה: מחושב-מהמשקלים-ומהדירוגים-בקובץ
    giants: number | null;
    method: string | null;
  };
  gapPlan: Array<{ next: string; why: string; ownerDecision: boolean }>;
  liveAudit: {
    engineRunning: boolean | null;
    engineTicks: number | null;
    openLimitOrders: number | null;
    limitOrdersTotal: number | null;
    realTradesTotal: number | null;
  };
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* מד-המרחק: קריאת-הקובץ + ביקורת-חי-עצמית (fail-honest בכל-שכבה) */
async function loadGap(): Promise<GapSection | null> {
  let meta: FileMeta | null = null;
  try {
    meta = await fileMeta(GAP_PATH);
  } catch {
    return null;
  }
  if (!meta.exists) return null;
  try {
    const raw = JSON.parse(await readFile(GAP_PATH, "utf8")) as {
      book?: string;
      publishedAt?: string;
      answerHe?: string;
      sources?: Array<{ id?: string; url?: string; what?: string }>;
      capabilities?: Array<{
        id?: string; he?: string; weight?: number;
        giant?: string; giantFact?: string; ours?: string; oursProof?: string; gapClosedAt?: string;
      }>;
      gapPlan?: Array<{ next?: string; why?: string; ownerDecision?: boolean }>;
      weightsNote?: string;
    };
    const grade = (v: string | undefined): "yes" | "partial" | "no" | "skip" =>
      v === "yes" || v === "partial" || v === "no" ? v : "skip";
    const capabilities: GapCapability[] = (raw.capabilities ?? [])
      .filter((c) => grade(c.giant) !== "skip" && grade(c.ours) !== "skip" && typeof c.weight === "number")
      .map((c) => ({
        id: s(c.id) ?? "unknown",
        he: s(c.he) ?? "—",
        weight: c.weight ?? 0,
        giant: grade(c.giant) as "yes" | "partial" | "no",
        giantFact: s(c.giantFact),
        ours: grade(c.ours) as "yes" | "partial" | "no",
        oursProof: s(c.oursProof),
        ...(c.gapClosedAt ? { gapClosedAt: c.gapClosedAt } : {}),
      }));
    // ציון-כנה: כן=1 · חלקי=0.5 · לא=0 — מחושב-מהקובץ, לא-מהודעת-סוכן
    const wsum = capabilities.reduce((a, c) => a + c.weight, 0);
    const pts = (verdict: "yes" | "partial" | "no") => (verdict === "yes" ? 1 : verdict === "partial" ? 0.5 : 0);
    const ours = wsum > 0 ? (capabilities.reduce((a, c) => a + pts(c.ours) * c.weight, 0) / wsum) * 100 : null;
    const giants = wsum > 0 ? (capabilities.reduce((a, c) => a + pts(c.giant) * c.weight, 0) / wsum) * 100 : null;

    // ביקורת-חי-עצמית מהמנוע-האמיתי (אפס-תביעות) — מה-DB בלבד: חוצה-הקשרי-מודול,
    // המנוע-עצמו רושם lastTickAt+ticks ב-DexConfig בכל-טיק (8ש׳) — זו-האמת-הקיימת.
    const liveAudit: GapSection["liveAudit"] = {
      engineRunning: null, engineTicks: null,
      openLimitOrders: null, limitOrdersTotal: null, realTradesTotal: null,
    };
    try {
      const { db } = await import("@/lib/db");
      const cfgs = await db.dexConfig.findMany({
        where: { key: { in: ["lastTickAt", "ticks"] } },
      });
      const map = new Map(cfgs.map((c) => [c.key, c.value]));
      const last = map.get("lastTickAt") ?? null;
      liveAudit.engineRunning = last !== null && Date.now() - new Date(last).getTime() < 60_000;
      liveAudit.engineTicks = Number(map.get("ticks") ?? 0);
      liveAudit.openLimitOrders = await db.dexOrder.count({ where: { status: "OPEN" } });
      liveAudit.limitOrdersTotal = await db.dexOrder.count();
      liveAudit.realTradesTotal = await db.dexTrade.count();
    } catch { /* כנה — נשאר null */ }

    return {
      ok: capabilities.length > 0,
      book: s(raw.book),
      publishedAt: s(raw.publishedAt),
      answerHe: s(raw.answerHe),
      sources: (raw.sources ?? []).map((x) => ({ id: s(x.id) ?? "—", url: s(x.url) ?? "—", what: s(x.what) ?? "—" })),
      capabilities,
      score: { ours, giants, method: s(raw.weightsNote) },
      gapPlan: (raw.gapPlan ?? []).map((p) => ({
        next: s(p.next) ?? "—",
        why: s(p.why) ?? "—",
        ownerDecision: p.ownerDecision === true,
      })),
      liveAudit,
    };
  } catch {
    return null;
  }
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
  const gap = await loadGap();

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
    const st = JSON.parse(await readFile(path.join(DOMAIN_DIR, "dex", "state.json"), "utf8")) as {
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
    gap,
  };
  cache = { at: Date.now(), data: payload };
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
