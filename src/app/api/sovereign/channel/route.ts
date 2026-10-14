/**
 * GET  /api/sovereign/channel — the direct Owner<->Sovereignty channel state.
 *   Syncs the sovereignty's request book + the git channel book into the local
 *   thread store, then returns: book meta (sha16/age), open requests with
 *   effective status, recent thread. Fail-honest: errors are returned, never masked.
 * POST /api/sovereign/channel — owner writes:
 *   { action: "decide",    reqId, decision: "GRANT"|"DECLINE", note? }
 *   { action: "directive", text }
 *   Every write: channel book append -> operator inbox receipt -> git push -> receipts back.
 */
import { NextResponse } from "next/server";
import {
  readBook,
  readChannelBook,
  effectiveStatus,
  syncThread,
  getThread,
  decide,
  directive,
  type SovereignRequest,
} from "@/lib/sovereign/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sync = await syncThread();
    const { book, meta } = await readBook();
    const { lines, meta: chanMeta } = await readChannelBook();
    const thread = await getThread(80);

    const requests = (book?.requests ?? []).map((r: SovereignRequest) => ({
      ...r,
      effectiveStatus: effectiveStatus(r.id, lines),
    }));

    return NextResponse.json(
      {
        ok: true,
        doctrine: book?.doctrine ?? null,
        grant: book?.grant ?? null,
        book: {
          spec: book?.spec ?? null,
          updated: book?.updated ?? null,
          meta,
        },
        channelBook: chanMeta,
        requests,
        thread,
        syncErrors: sync.errors,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "channel-assemble-failed",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        contract: "fail-honest: no synthetic channel state is returned",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 });
  }
  const b = body as { action?: string; reqId?: unknown; decision?: unknown; note?: unknown; text?: unknown };

  if (b.action === "decide") {
    const reqId = typeof b.reqId === "string" ? b.reqId.trim() : "";
    const decision = typeof b.decision === "string" ? b.decision.trim().toUpperCase() : "";
    const note = typeof b.note === "string" ? b.note : "";
    if (!reqId || (decision !== "GRANT" && decision !== "DECLINE")) {
      return NextResponse.json({ ok: false, error: "bad-decide-args (reqId + GRANT|DECLINE required)" }, { status: 400 });
    }
    const res = await decide(reqId, decision, note);
    return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }

  if (b.action === "directive") {
    const text = typeof b.text === "string" ? b.text : "";
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "empty-directive" }, { status: 400 });
    }
    const res = await directive(text);
    return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json({ ok: false, error: "unknown-action (decide|directive)" }, { status: 400 });
}
