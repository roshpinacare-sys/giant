import { NextResponse } from "next/server";
import { assembleOrganism, type OrganismPayload } from "@/lib/organism/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; payload: OrganismPayload } | null = null;
const TTL_MS = 60_000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json(cache.payload, {
        headers: { "x-organism-cache": "hit" },
      });
    }
    const payload = await assembleOrganism();
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload, { headers: { "x-organism-cache": "miss" } });
  } catch (e) {
    return NextResponse.json(
      {
        error: "organism-assemble-failed",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        contract: "fail-honest: no synthetic payload is returned",
      },
      { status: 500 }
    );
  }
}
