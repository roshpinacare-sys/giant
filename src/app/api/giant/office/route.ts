// GET /api/giant/office — המשרד-החי: המשרד-היחיד של הריבונות (GIANT · פתיחת-הסכר)
// ═════════════════════════════════════════════════════════════════════════
// מקורות-חיים (GitHub raw, PAT שרת-בלבד):
// · FleetHQ/office/state/office-state.json — סוכנים-במשמרת, משימות, סטטוס-עברית.
// · FleetHQ/office/state/operator-inbox.jsonl — תיבת-המפעיל (קבלות-הוראות של הבעלים).
// · Domain/office/data.json — פעימת-המשרד (verdict + בדיקות).
// כשל-מקור = שדה-כנה (null/ריק); אפס-סינתזה; אפס מספרים-מצוירים. cache-זיכרון 45 שניות.
import { NextResponse } from "next/server";
import { sha256hex } from "@/lib/giant-integrity";
import { ensureMiniServices } from "@/lib/mini-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: { at: number; data: OfficePayload } | null = null;
const CACHE_MS = 45_000;

const RAW_BASE = "https://raw.githubusercontent.com/roshpinacare-sys";

export interface OfficeAgent {
  id: string;
  state: string;
  station: string;
  activity: string;
}
export interface OfficePayload {
  ok: boolean;
  note?: string;
  statusHe: string | null;
  connected: boolean | null;
  backend: string | null;
  capturedAt: string | null;
  verdict: string | null;
  verdictChecks: { name: string; state: string; detail: string }[];
  agents: OfficeAgent[];
  tasks: { id: string; title: string }[];
  inbox: { at: string; id: string; text: string }[];
  proposals: string[];
  inboxMeta: { exists: boolean; sha16: string | null; ageMinutes: number | null };
  fetchedAt: string;
}

interface FleetState {
  capturedAt?: string;
  connected?: boolean;
  backend?: string;
  statusHe?: string;
  agents?: Array<{ id?: string; state?: string; station?: string; activity?: string }>;
  tasks?: Array<{ id?: string; title?: string; status?: string }>;
}

interface DomainPulse {
  verdict?: string;
  verdictChecks?: Array<{ name?: string; state?: string; detail?: string }>;
}

async function ghJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function ghText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function loadOffice(force = false): Promise<OfficePayload> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const [state, inboxRaw, pulse] = await Promise.all([
    ghJson<FleetState>(`${RAW_BASE}/FleetHQ/main/office/state/office-state.json`),
    ghText(`${RAW_BASE}/FleetHQ/main/office/state/operator-inbox.jsonl`),
    ghJson<DomainPulse>(`${RAW_BASE}/Domain/main/office/data.json`),
  ]);

  const ok = Boolean(state);
  const payload: OfficePayload = {
    ok,
    note: ok ? undefined : "מצב-המשרד לא נמדד כרגע — נסה שוב (כשל-כנה)",
    statusHe: state?.statusHe ?? null,
    connected: typeof state?.connected === "boolean" ? state.connected : null,
    backend: state?.backend ?? null,
    capturedAt: state?.capturedAt ?? null,
    verdict: pulse?.verdict ?? null,
    verdictChecks: (pulse?.verdictChecks ?? [])
      .filter((c) => typeof c?.name === "string")
      .map((c) => ({ name: String(c.name), state: String(c.state ?? "?"), detail: String(c.detail ?? "") })),
    agents: (state?.agents ?? [])
      .filter((a) => typeof a?.id === "string" && a.id)
      .map((a) => ({
        id: String(a.id),
        state: String(a.state ?? "idle"),
        station: String(a.station ?? "desk"),
        activity: String(a.activity ?? ""),
      })),
    tasks: (state?.tasks ?? [])
      .filter((t) => typeof t?.id === "string" && typeof t?.title === "string" && t.status !== "done")
      .slice(0, 10)
      .map((t) => ({ id: String(t.id), title: String(t.title) })),
    inbox: [],
    proposals: (state?.tasks ?? [])
      .filter((t) => t.status === "proposed" || t.status === "open")
      .map((t) => `${String(t.id)} · ${String(t.title ?? "")}`.trim())
      .slice(0, 8),
    inboxMeta: { exists: false, sha16: null, ageMinutes: null },
    fetchedAt: new Date().toISOString(),
  };

  if (inboxRaw !== null) {
    const rows = inboxRaw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as { at?: string; id?: string; text?: string };
        } catch {
          return null;
        }
      })
      .filter((r): r is { at?: string; id?: string; text?: string } => Boolean(r))
      .map((r) => ({
        at: String(r.at ?? ""),
        id: String(r.id ?? ""),
        text: String(r.text ?? ""),
      }));
    payload.inbox = rows.slice(-12).reverse();
    payload.inboxMeta = {
      exists: rows.length > 0,
      sha16: sha256hex(inboxRaw).slice(0, 16),
      ageMinutes:
        rows.length > 0 && rows[rows.length - 1].at
          ? Math.max(0, Math.round((Date.now() - Date.parse(rows[rows.length - 1].at)) / 60_000)) || null
          : null,
    };
  }

  cache = { at: Date.now(), data: payload };
  return payload;
}

export async function GET() {
  void ensureMiniServices(); /* המשגיחה-הפנימית — מחייה-את-משדר-העולם אם-נעקר */
  const data = await loadOffice();
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
