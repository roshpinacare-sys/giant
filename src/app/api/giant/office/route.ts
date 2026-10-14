/**
 * GET /api/giant/office — המשרד-החי (GIANT · המשרד-היחיד)
 *
 * מצב-המשרד של FleetHQ (office/state/office-state.json — נתפס-חי),
 * סוכנים-במשמרת, משימות, תיבת-המפעיל (operator-inbox קנוני — אליה מגיעות
 * קבלות-ההוראות של הבעלים), והצעות-המשרד האחרונות.
 * כשל = כנה. cache-זיכרון 30 שניות.
 */
import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { fileMeta } from "@/lib/sovereign/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; data: OfficePayload } | null = null;
const CACHE_MS = 30_000;

const OFFICE_STATE = "/home/z/estate/FleetHQ/office/state/office-state.json";
const INBOX_PATH = "/home/z/estate/FleetHQ/office/state/operator-inbox.jsonl";
const PROPOSALS_DIR = "/home/z/estate/FleetHQ/office/PROPOSALS";

export interface OfficeAgent {
  id: string;
  state: string;
  station: string;
  activity: string;
}

export interface InboxRow {
  at: string;
  id: string;
  text: string;
}

export interface OfficePayload {
  ok: boolean;
  note?: string;
  statusHe: string | null;
  connected: boolean | null;
  backend: string | null;
  capturedAt: string | null;
  agents: OfficeAgent[];
  tasks: { id: string; title: string }[];
  inbox: InboxRow[];
  proposals: string[];
  inboxMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
  fetchedAt: string;
}

async function readInbox(): Promise<{ rows: InboxRow[]; meta: { exists: boolean; sha16: string | null; ageMinutes: number | null } }> {
  const m = await fileMeta(INBOX_PATH);
  const meta = { exists: m.exists, sha16: m.sha16, ageMinutes: m.ageMinutes };
  try {
    const raw = await readFile(INBOX_PATH, "utf8");
    const rows: InboxRow[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const o = JSON.parse(t) as { at?: string; id?: string; text?: string };
        rows.push({ at: o.at ?? "", id: o.id ?? "", text: (o.text ?? "").slice(0, 240) });
      } catch {
        /* פס-פגום נדילג — איטום-JSONL */
      }
    }
    return { rows: rows.slice(-12).reverse(), meta };
  } catch {
    return { rows: [], meta };
  }
}

async function readProposals(): Promise<string[]> {
  try {
    const names = await readdir(PROPOSALS_DIR);
    return names.filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 8);
  } catch {
    return [];
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data, { headers: { "cache-control": "no-store" } });
  }
  try {
    const raw = JSON.parse(await readFile(OFFICE_STATE, "utf8")) as {
      capturedAt?: string;
      connected?: boolean;
      backend?: string;
      statusHe?: string;
      agents?: Array<{ id?: string; state?: string; station?: string; activity?: string }>;
      tasks?: Array<{ id?: string; title?: string }>;
    };
    const [inbox, proposals] = await Promise.all([readInbox(), readProposals()]);

    const payload: OfficePayload = {
      ok: true,
      statusHe: raw.statusHe ?? null,
      connected: typeof raw.connected === "boolean" ? raw.connected : null,
      backend: raw.backend ?? null,
      capturedAt: raw.capturedAt ?? null,
      agents: (raw.agents ?? [])
        .filter((a) => typeof a.id === "string")
        .map((a) => ({ id: a.id as string, state: a.state ?? "?", station: a.station ?? "?", activity: a.activity ?? "" })),
      tasks: (raw.tasks ?? [])
        .filter((t) => typeof t.id === "string")
        .slice(0, 8)
        .map((t) => ({ id: t.id as string, title: (t.title ?? "").slice(0, 160) })),
      inbox: inbox.rows,
      proposals,
      inboxMeta: inbox.meta,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data: payload };
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch {
    const inbox = await readInbox();
    const payload: OfficePayload = {
      ok: false,
      note: "מצב-המשרד לא נמדד כרגע — fail-honest, אפס-סינתזה",
      statusHe: null,
      connected: null,
      backend: null,
      capturedAt: null,
      agents: [],
      tasks: [],
      inbox: inbox.rows,
      proposals: [],
      inboxMeta: inbox.meta,
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  }
}
