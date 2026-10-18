// giant · לדג'ר-האמת-המנותח — כל השורות בפורמט-החוקי (date|agent|content|sha|artifacts)

import { NextResponse } from "next/server";
import { readLedger } from "@/lib/git-content";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows, total } = await readLedger();
    return NextResponse.json({ ok: true, rows, total });
  } catch (err) {
    console.error("[git/ledger]", err);
    return NextResponse.json({ ok: false, error: "נכשלה-קריאת-הלדג'ר" }, { status: 500 });
  }
}
