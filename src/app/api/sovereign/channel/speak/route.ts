/**
 * POST /api/sovereign/channel/speak — the sovereignty's REAL VOICE (TTS).
 *
 * Speaks an EXISTING measured answer text aloud. No LLM call here, no new
 * content, no simulation: the text arrives from the owner's channel UI and is
 * synthesized to real WAV audio via the z-ai TTS rail (voice: xiaochen).
 *
 * HEBREW TTS MEASUREMENT (Step-1, recorded 2026-10-14T22:21Z, this machine):
 *   CLI   voice tongtong, Hebrew "שלום, אני הריבונות. המנוע חי." →
 *         198,096 B · RIFF/WAVE PCM 16-bit mono 24 kHz · 4.12 s · rms 1728.4 · peak 23196 → REAL speech energy.
 *   SDK   voice xiaochen, same-Hebrew sample via zai.audio.tts.create →
 *         227,856 B · RIFF/WAVE PCM 16-bit mono 24 kHz · 4.74 s · rms 2009.8 · peak 23196 → REAL speech energy.
 *   VERDICT: hebrew-tts-measured-ok → this route ATTEMPTS real synthesis (no honest-501 needed).
 *   If a future re-measure revokes that verdict, flip HEBREW_TTS_MEASURED below and the
 *   route will fail-honest with 501 "hebrew-tts-not-measured" instead of faking audio.
 */
import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEBREW_TTS_MEASURED = true; // measured 2026-10-14T22:21Z — see header block for evidence
const MAX_CHARS = 1024; // honest TTS API constraint
const VOICE = "xiaochen";

/** in-memory dedupe cache: text → wav Buffer. LRU-ish — hits refresh order, trims oldest beyond 20. */
const CACHE_MAX = 20;
const cache = new Map<string, Buffer>();

function audioResponse(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.trim();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ ok: false, error: "text-required (1..1024 chars)" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { ok: false, error: `text-too-long (${text.length} > ${MAX_CHARS} chars — TTS API constraint)` },
      { status: 400 },
    );
  }
  if (!HEBREW_TTS_MEASURED) {
    return NextResponse.json(
      { ok: false, error: "hebrew-tts-not-measured", contract: "fail-honest: אין מדידה של קול-עברי — אין השמעה-מדומה" },
      { status: 501 },
    );
  }

  const hit = cache.get(text);
  if (hit) {
    cache.delete(text);
    cache.set(text, hit); // refresh LRU order
    return audioResponse(hit);
  }

  try {
    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: text,
      voice: VOICE,
      speed: 1.0,
      response_format: "wav",
      stream: false,
    });
    const buf = Buffer.from(new Uint8Array(await response.arrayBuffer()));
    // honest-output guards: refuse to pass off a zero-byte or non-WAV body as speech
    if (!buf || buf.length === 0) throw new Error("empty-audio (0 bytes from TTS rail)");
    if (buf.subarray(0, 4).toString("ascii") !== "RIFF") throw new Error("not-wav (TTS rail returned non-audio body)");
    if (buf.length < 1000) throw new Error(`suspicious-audio (${buf.length} bytes — below any real speech)`);

    cache.set(text, buf);
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (typeof oldest === "string") cache.delete(oldest);
    }
    return audioResponse(buf);
  } catch (e) {
    console.error("[sovereign/speak] tts rail failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 200) : "tts-rail-unavailable",
        contract: "fail-honest: הדיבור נכשל — כלום לא הומצא",
      },
      { status: 502 },
    );
  }
}
