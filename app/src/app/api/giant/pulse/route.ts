/**
 * GET /api/giant/pulse — דופק-המערכת (GIANT · מערכת-האמת)
 *
 * · שער-האמת: Domain/truth/latest.json — verdict, counts, gates (PASS/SKIP/FAIL).
 * · זרמי-הערוץ הקנוניים: טביעות sha16 + גיל לכל זרם (evidence, לא קישוט).
 * · מפת-התכנוס: counts של הפניות (canonical/legacy/פתוחות) — ערוץ-אחד, אפס-כפילויות.
 * כשל = כנה. cache-זיכרון 30 שניות.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { fileMeta, readDirectives, readRequests, readNotes, readVoice, type FileMeta } from "@/lib/sovereign/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; data: PulsePayload } | null = null;
const CACHE_MS = 30_000;

export interface TruthGate {
  gate: string;
  status: string;
  measured: string;
}

export interface TruthState {
  at: string | null;
  verdict: string | null;
  pass: number | null;
  fail: number | null;
  skip: number | null;
  durationMs: number | null;
  runUrl: string | null;
  gates: TruthGate[];
}

export interface PulsePayload {
  ok: boolean;
  note?: string;
  truth: TruthState | null;
  truthMeta: FileMeta;
  streams: {
    directives: FileMeta;
    requests: FileMeta;
    notes: FileMeta;
    voice: FileMeta;
    legacyBook: FileMeta;
  };
  channel: {
    directives: number;
    requestsCanonical: number;
    requestsLegacy: number;
    requestsOpen: number;
    notes: number;
    voiceStatus: string | null;
    voiceSummary: string | null;
  };
  fetchedAt: string;
}

const TRUTH_PATH = "/home/z/estate/Domain/truth/latest.json";

async function readTruth(): Promise<{ truth: TruthState | null; meta: FileMeta }> {
  const meta = await fileMeta(TRUTH_PATH);
  if (!meta.exists) return { truth: null, meta };
  try {
    const raw = JSON.parse(await readFile(TRUTH_PATH, "utf8")) as {
      at?: string;
      verdict?: string;
      counts?: { pass?: number; fail?: number; skip?: number };
      durationMs?: number;
      runUrl?: string;
      results?: Array<{ gate?: string; status?: string; measured?: string }>;
    };
    return {
      truth: {
        at: raw.at ?? null,
        verdict: raw.verdict ?? null,
        pass: raw.counts?.pass ?? null,
        fail: raw.counts?.fail ?? null,
        skip: raw.counts?.skip ?? null,
        durationMs: raw.durationMs ?? null,
        runUrl: raw.runUrl ?? null,
        gates: (raw.results ?? [])
          .filter((g) => typeof g.gate === "string")
          .map((g) => ({ gate: g.gate as string, status: g.status ?? "?", measured: g.measured ?? "" })),
      },
      meta,
    };
  } catch {
    return { truth: null, meta };
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data, { headers: { "cache-control": "no-store" } });
  }
  try {
    const [truthPack, dirs, reqs, notes, voice] = await Promise.all([
      readTruth(),
      readDirectives(),
      readRequests(),
      readNotes(),
      readVoice(),
    ]);

    const openCount = [...reqs.canonical, ...reqs.legacy].filter((r) => r.status === "OPEN").length;

    const payload: PulsePayload = {
      ok: true,
      truth: truthPack.truth,
      truthMeta: truthPack.meta,
      streams: {
        directives: dirs.meta,
        requests: reqs.meta,
        notes: notes.meta,
        voice: voice.meta,
        legacyBook: reqs.legacyMeta,
      },
      channel: {
        directives: dirs.lines.length,
        requestsCanonical: reqs.canonical.length,
        requestsLegacy: reqs.legacy.length,
        requestsOpen: openCount,
        notes: notes.lines.length,
        voiceStatus: voice.voice?.status ?? null,
        voiceSummary: voice.voice?.summary ?? null,
      },
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data: payload };
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        note: e instanceof Error ? e.message.slice(0, 160) : "pulse-read-failed",
        contract: "fail-honest: no synthetic pulse state",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
