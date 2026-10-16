// giant · מנוע-הגיט-החי — קריאת-מצב חיה מה-clone-הקנוני (גיט→מוצר, פאנל-פומבי)

import { NextResponse } from "next/server";
import { readGitState } from "@/lib/giant-git";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readGitState();
  return NextResponse.json(state, { status: state.ok ? 200 : 500 });
}
