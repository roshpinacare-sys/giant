/**
 * GET  /api/sovereign/channel — the ONE channel state (canonical streams, live).
 *   Reads Pulse/state/sovereign-channel/{directives,requests,notes,voice} + the
 *   legacy Domain mirror + dex essentials, all with sha16/age evidence. No cache
 *   games — small files, read live, fail-honest.
 * POST /api/sovereign/channel — OWNER WRITES (gate-guarded):
 *   { action: "decide",    reqId, decision: "GRANT"|"DECLINE", note?, token }
 *     → directive D-NNNN referencing the request + operator-inbox work receipt.
 *   { action: "directive", title, points: string[], token }
 *     → free owner law D-NNNN.
 *   No agent writes in the owner's name — the gate is verified server-side.
 */
import { NextResponse } from "next/server";
import {
  readDirectives,
  readRequests,
  readNotes,
  readVoice,
  effectiveStatus,
  writeOwnerDirective,
} from "@/lib/sovereign/channel";
import { gateGuard } from "@/lib/sovereign/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [dirs, reqs, notes, voice] = await Promise.all([readDirectives(), readRequests(), readNotes(), readVoice()]);

    const canonical = reqs.canonical.map((r) => ({ ...r, effectiveStatus: effectiveStatus(r.id, dirs.lines) }));
    // one-surface law: a legacy mirror that has already been converged into the
    // canonical stream is hidden (its canonical twin carries the "[REQ-XX —" marker)
    const converged = new Set(reqs.canonical.map((c) => c.need.match(/^\[(REQ-[^\s—]+)\s/)?.[1]).filter(Boolean) as string[]);
    const legacy = reqs.legacy.filter((r) => !converged.has(r.id)).map((r) => ({ ...r, effectiveStatus: effectiveStatus(r.id, dirs.lines) }));

    return NextResponse.json(
      {
        ok: true,
        spec: "SAOS-SOVEREIGN-CHANNEL/1",
        streams: {
          directives: dirs.meta,
          requests: reqs.meta,
          notes: notes.meta,
          voice: voice.meta,
          legacyBook: reqs.legacyMeta,
        },
        directives: dirs.lines.slice(-30),
        requests: { canonical, legacy },
        notes: notes.lines.slice(-30),
        voice: voice.voice,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "channel-read-failed",
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
  const b = body as { action?: string; token?: unknown; reqId?: unknown; decision?: unknown; note?: unknown; title?: unknown; points?: unknown };

  const token = typeof b.token === "string" ? b.token : "";
  const guard = gateGuard(token);
  if (guard) {
    return NextResponse.json({ ok: false, error: guard }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (b.action === "decide") {
    const reqId = typeof b.reqId === "string" ? b.reqId.trim() : "";
    const decision = typeof b.decision === "string" ? b.decision.trim().toUpperCase() : "";
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 600) : "";
    if (!reqId || (decision !== "GRANT" && decision !== "DECLINE")) {
      return NextResponse.json({ ok: false, error: "bad-decide-args (reqId + GRANT|DECLINE required)" }, { status: 400 });
    }
    // LAW: a decision may only reference a request that actually exists in the streams
    // (canonical or legacy mirror) — no directive on a phantom id, ever.
    const reqs = await readRequests();
    const exists = [...reqs.canonical, ...reqs.legacy].some((r) => r.id === reqId);
    if (!exists) {
      return NextResponse.json(
        { ok: false, error: `req-not-in-streams: ${reqId}`, contract: "SAOS-SOVEREIGN-CHANNEL/1: הכרעה על בקשה שאינה בזרמים = נדחית" },
        { status: 400 },
      );
    }
    const title = `${decision} ${reqId}${note ? ` — ${note}` : ""}`;
    const points = [
      `${decision} ${reqId}${note ? `: ${note}` : ""}`,
      decision === "GRANT"
        ? `ההחלטה פעילה-מיד (חוק-בנחיתה): המסילות המוסמכות רשאיות לבצע את ${reqId} מתוך-מה-שיש בלבד — אפס כסף-חוץ חדש, אפס הפקדות-בעלים, עם קבלות-מדידה ב-git.`
        : `הבקשה ${reqId} נדחית — הריבונות ממשיכה מימון-עצמי ממה שיש בלי שער-זה.`,
      `ראיה-הכרעה: ערוץ-ריבוני ישיר ${new Date().toISOString()} · משטח-חי GIANT/T53 · בעלים מאומת-שרת (מפתח-מנהל).`,
    ];
    const res = await writeOwnerDirective({ title, points, refReq: reqId });
    return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }

  if (b.action === "directive") {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const points = Array.isArray(b.points) ? b.points.filter((p): p is string => typeof p === "string") : [];
    if (!title || points.length === 0) {
      return NextResponse.json({ ok: false, error: "directive requires title + points[]" }, { status: 400 });
    }
    const res = await writeOwnerDirective({ title, points });
    return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json({ ok: false, error: "unknown-action (decide|directive)" }, { status: 400 });
}
