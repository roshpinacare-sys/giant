// GET /api/giant/products — קטלוג-המוצרים האמיתי (Domain/marketing/products.json)
// ═════════════════════════════════════════════════════════════════════════
// חוק-הקטלוג: כל-טענה נושאת-קבלה משורשת או מדידה מתועדת; סטטוסים כנים;
// אפס-הבטחות-תשואה. ציבורי; כשל = כנה. cache 5 דקות.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: ProductsPayload } | null = null;
const CACHE_MS = 300_000;

export interface ProductRow {
  id: string;
  name: string;
  status: string;
  blurb: string;
  repo: string;
  url: string;
  raw: Record<string, unknown>;
}
export interface ProductsPayload {
  ok: boolean;
  note?: string;
  wave: string | null;
  generatedAt: string | null;
  discipline: string | null;
  receiptsWall: unknown;
  products: ProductRow[];
  fetchedAt: string;
}

interface RawProducts {
  wave?: string;
  generatedAt?: string;
  discipline?: string;
  receiptsWall?: unknown;
  products?: Array<Record<string, unknown>>;
}

export async function loadProducts(force = false): Promise<ProductsPayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  let raw: RawProducts | null = null;
  try {
    const res = await fetch("https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/marketing/products.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) raw = (await res.json()) as RawProducts;
  } catch {
    raw = null;
  }
  const products: ProductRow[] = (raw?.products ?? []).map((p) => ({
    id: String(p.id ?? ""),
    name: String(p.name ?? p.id ?? ""),
    status: String(p.status ?? ""),
    blurb: String(p.blurb ?? p.description ?? p.pitch ?? ""),
    repo: String(p.repo ?? p.source ?? ""),
    url: String(p.url ?? p.servedAt ?? ""),
    raw: p,
  }));
  const payload: ProductsPayload = {
    ok: products.length > 0,
    note: products.length > 0 ? undefined : "הקטלוג לא נמדד כרגע — נסה שוב",
    wave: raw?.wave ?? null,
    generatedAt: raw?.generatedAt ?? null,
    discipline: raw?.discipline ?? null,
    receiptsWall: raw?.receiptsWall ?? null,
    products,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  const data = await loadProducts();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
