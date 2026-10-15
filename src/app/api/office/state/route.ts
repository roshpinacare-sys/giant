import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const FHQ_STATE =
  "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json";
const DOMAIN_PULSE =
  "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/data.json";

async function readPat(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "upload", "pat.env"), "utf8");
    const m = raw.match(/(?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

async function getJson(url: string, token: string | null) {
  try {
    const headers: Record<string, string> = { "cache-control": "no-cache" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * GET /api/office/state — גשר אמת מקומי: office-state של FleetHQ + פעימת Domain.
 * חוק-אמת: מחזיר בדיוק מה שהצליח להשיג; כשל = null בשדה המתאים, לעולם לא ירוק-מזויף.
 */
export async function GET() {
  const token = await readPat();
  const [state, pulse] = await Promise.all([
    getJson(FHQ_STATE, token),
    getJson(DOMAIN_PULSE, token),
  ]);
  return NextResponse.json(
    { state, pulse, servedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
