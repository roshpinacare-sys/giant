/**
 * SOVEREIGN CHANNEL — server-only. The ONE direct Owner <-> Sovereignty channel.
 *
 * CANONICAL LAW (SAOS-SOVEREIGN-CHANNEL/1 · Pulse/state/sovereign-channel/ ·
 * GIANT duplicates-audit #1: ① = the canonical stream, this app = ③ the LIVE surface):
 *  - directives.jsonl (owner → sovereignty): D-NNNN lines. ONLY the owner writes,
 *    server-side through the owner gate (מפתח-מנהל). Every directive = law on landing.
 *  - requests.jsonl (sovereignty → owner): REQ-NNNN lines. Real owner-authority
 *    gates only. Never a funding request. Agents file here ONLY in the sovereignty's
 *    name, with linked evidence.
 *  - notes.jsonl: N-NNNN reports. The sovereignty's voice rail appends here
 *    (side=SOVEREIGNTY) with evidence shas and the foreign-number integrity law:
 *    every number in a voice answer must exist in the measured context — a foreign
 *    number = honest REJECTED, nothing is written.
 *  - git = the only survival layer. Agents die; git lives.
 *  - ZERO-FAKE: every displayed value carries source meta (sha16/age). Missing is
 *    declared missing, never invented.
 */
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";

const pexec = promisify(execFile);

export const PULSE_DIR = "/home/z/estate/Pulse";
export const DOMAIN_DIR = "/home/z/estate/Domain";
export const FLEETHQ_DIR = "/home/z/estate/FleetHQ";

export const STREAM_DIR = path.join(PULSE_DIR, "state/sovereign-channel");
export const DIRECTIVES_PATH = path.join(STREAM_DIR, "directives.jsonl");
export const REQUESTS_PATH = path.join(STREAM_DIR, "requests.jsonl");
export const NOTES_PATH = path.join(STREAM_DIR, "notes.jsonl");
export const VOICE_PATH = path.join(STREAM_DIR, "voice.json");
export const LEGACY_BOOK_PATH = path.join(DOMAIN_DIR, "agents/sovereign-requests.json");
export const DEX_STATE_PATH = path.join(DOMAIN_DIR, "dex/state.json");
export const OPERATOR_INBOX_PATH = path.join(FLEETHQ_DIR, "office/state/operator-inbox.jsonl");
export const PAT_ENV_PATH = "/home/z/my-project/upload/pat.env";

const PULSE_PUSH_URL = "https://github.com/roshpinacare-sys/Pulse.git";
const MAX_TEXT = 2000;

/* ------------------------------- primitives ------------------------------- */

export function sha16(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export interface FileMeta {
  path: string;
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  mtime: string | null;
  ageMinutes: number | null;
}

export async function fileMeta(p: string): Promise<FileMeta> {
  try {
    const st = await fs.stat(p);
    const buf = await fs.readFile(p);
    return {
      path: p,
      exists: true,
      bytes: st.size,
      sha16: sha16(buf.toString("utf8")),
      mtime: st.mtime.toISOString(),
      ageMinutes: Math.round((Date.now() - st.mtimeMs) / 60000),
    };
  } catch {
    return { path: p, exists: false, bytes: null, sha16: null, mtime: null, ageMinutes: null };
  }
}

async function readJsonl<T>(p: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          return JSON.parse(l) as T;
        } catch {
          return null;
        }
      })
      .filter((x): x is T => x !== null);
  } catch {
    return [];
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/** serialize all stream writes — one writer at a time (one-writer law per canon) */
let writeChain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => undefined);
  return run;
}

/* ------------------------------- stream types ------------------------------ */

export interface DirectiveLine {
  id: string; // D-NNNN
  at: string;
  by: string;
  law?: string;
  title: string;
  directive: string[];
  status: "ACTIVE" | "REVOKED";
  refReq?: string; // computed by this desk: which REQ this decision answers (kept in title/directive text)
}

export interface RequestLine {
  id: string; // REQ-NNNN (canonical) or REQ-legacy-mirror (pre-canonical ids)
  at: string;
  by: string;
  need: string;
  evidence: string[];
  deadline: string;
  status: string; // OPEN | SATISFIED-BY:D-NNNN | WITHDRAWN | (legacy: OPEN|GRANTED|DECLINED)
  origin: "canonical" | "legacy-mirror";
}

export interface NoteLine {
  id: string; // N-NNNN
  at: string;
  side: string;
  kind: string;
  title: string;
  body: string;
  trace?: string;
  status?: string;
}

export interface VoiceState {
  schema: string;
  at: string;
  status: string;
  reason?: string;
  model?: string;
  summary: string | null;
}

/* --------------------------------- readers --------------------------------- */

export async function readDirectives(): Promise<{ lines: DirectiveLine[]; meta: FileMeta }> {
  return { lines: await readJsonl<DirectiveLine>(DIRECTIVES_PATH), meta: await fileMeta(DIRECTIVES_PATH) };
}

export async function readRequests(): Promise<{ canonical: RequestLine[]; legacy: RequestLine[]; meta: FileMeta; legacyMeta: FileMeta }> {
  const canonRaw = await readJsonl<RequestLine>(REQUESTS_PATH);
  const canonical = canonRaw.map((r) => ({ ...r, origin: "canonical" as const }));

  // legacy mirror: the T52 Domain book (duplicates-audit #1: converges into the canonical stream)
  const legacy: RequestLine[] = [];
  try {
    const book = await readJson<{
      requests: { id: string; at: string; author: string; status: string; what: string; why: string; evidence: string[]; cost: string; expires: string }[];
    }>(LEGACY_BOOK_PATH);
    if (book?.requests) {
      for (const r of book.requests) {
        legacy.push({
          id: r.id,
          at: r.at,
          by: `sovereignty (${r.author}) — mirror from Domain/agents/sovereign-requests.json`,
          need: `${r.what}\n${r.why}`,
          evidence: r.evidence ?? [],
          deadline: r.expires ?? "none",
          status: r.status,
          origin: "legacy-mirror",
        });
      }
    }
  } catch {
    // legacy mirror missing is fine — declared by meta
  }
  return { canonical, legacy, meta: await fileMeta(REQUESTS_PATH), legacyMeta: await fileMeta(LEGACY_BOOK_PATH) };
}

export async function readNotes(): Promise<{ lines: NoteLine[]; meta: FileMeta }> {
  return { lines: await readJsonl<NoteLine>(NOTES_PATH), meta: await fileMeta(NOTES_PATH) };
}

export async function readVoice(): Promise<{ voice: VoiceState | null; meta: FileMeta }> {
  return { voice: await readJson<VoiceState>(VOICE_PATH), meta: await fileMeta(VOICE_PATH) };
}

/** effective status: OPEN unless an ACTIVE owner directive answers it (GRANT/DECLINE in its text) */
export function effectiveStatus(reqId: string, directives: DirectiveLine[]): string {
  const dec = directives
    .filter((d) => d.status === "ACTIVE" && (d.title.includes(reqId) || d.directive.some((s) => s.includes(reqId))))
    .at(-1);
  if (!dec) return "OPEN";
  return dec.title.startsWith("GRANT") || dec.directive[0]?.startsWith("GRANT") ? "GRANTED" : "DECLINED";
}

/* --------------------------------- id laws --------------------------------- */

function nextId(lines: { id?: string }[], prefix: string): string {
  let max = 0;
  for (const l of lines) {
    const m = (l.id ?? "").match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

/* --------------------------------- git rail -------------------------------- */

function readPat(): string | null {
  try {
    const raw = readPatSync();
    const m = raw.match(/github_pat_[A-Za-z0-9_]+/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

function readPatSync(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("fs").readFileSync(PAT_ENV_PATH, "utf8");
}

export interface PushReceipt {
  attempted: boolean;
  pushed: boolean;
  verified: boolean;
  commit: string | null;
  error: string | null;
}

async function git(cwd: string, args: string[], timeout = 30_000): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const { stdout, stderr } = await pexec("git", args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return { ok: true, out: stdout.toString(), err: stderr.toString() };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return { ok: false, out: String(err.stdout ?? ""), err: String(err.stderr ?? err.message ?? "git-failed") };
  }
}

/**
 * Commit+push ONLY the touched canonical stream files in Pulse. Rebase-first
 * (twins push constantly), one-time PAT URL (never in config), ls-remote verify.
 * Fail-honest: on failure the local commit stays for a retry.
 */
export async function pushStreams(files: string[], commitMsg: string): Promise<PushReceipt> {
  const receipt: PushReceipt = { attempted: true, pushed: false, verified: false, commit: null, error: null };
  try {
    const pull = await git(PULSE_DIR, ["pull", "--rebase", "--autostash"]);
    if (!pull.ok && !/up to date|Current branch/i.test(pull.out + pull.err)) {
      receipt.error = `pull: ${pull.err.slice(0, 160)}`;
      return receipt;
    }
    const add = await git(PULSE_DIR, ["add", ...files]);
    if (!add.ok) {
      receipt.error = `add: ${add.err.slice(0, 160)}`;
      return receipt;
    }
    const committed = await git(PULSE_DIR, ["commit", "-m", commitMsg, "--no-verify"]);
    if (!committed.ok && !/nothing to commit/.test(committed.out + committed.err)) {
      receipt.error = `commit: ${committed.err.slice(0, 160)}`;
      return receipt;
    }
    const head = await git(PULSE_DIR, ["rev-parse", "HEAD"]);
    receipt.commit = head.ok ? head.out.trim().slice(0, 12) : null;

    const token = readPat();
    const url = token ? `https://x-access-token:${token}@github.com/roshpinacare-sys/Pulse.git` : PULSE_PUSH_URL;
    const push = await git(PULSE_DIR, ["push", url, "HEAD:refs/heads/main"]);
    if (!push.ok) {
      receipt.error = `push: ${(push.err || push.out).slice(0, 200)}`;
      return receipt;
    }
    receipt.pushed = true;

    const remote = await git(PULSE_DIR, ["ls-remote", url, "refs/heads/main"], 20_000);
    if (remote.ok && receipt.commit && remote.out.trim().startsWith(receipt.commit)) receipt.verified = true;
    else if (remote.ok) receipt.error = "verify-mismatch";
    else receipt.error = "verify-unreachable";
    return receipt;
  } catch (e) {
    receipt.error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    return receipt;
  }
}

/* -------------------------------- write paths ------------------------------- */

async function appendJsonl(p: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, JSON.stringify(obj) + "\n", "utf8");
}

export interface WriteResult {
  ok: boolean;
  error: string | null;
  id: string | null;
  sha16: string | null;
  inboxId: string | null;
  push: PushReceipt | null;
}

const emptyResult = (): WriteResult => ({ ok: false, error: null, id: null, sha16: null, inboxId: null, push: null });

/**
 * OWNER WRITE (gate-guarded upstream): a directive D-NNNN — a decision on a request
 * (GRANT/DECLINE REQ-…) or a free law. Receipted to FleetHQ operator-inbox so the
 * recruit engine turns it into work. Never written by an agent — only behind the gate.
 */
export async function writeOwnerDirective(params: {
  title: string;
  points: string[];
  law?: string;
  refReq?: string;
}): Promise<WriteResult> {
  const res = emptyResult();
  const title = params.title.trim().slice(0, 300);
  const points = params.points.map((p) => p.trim().slice(0, MAX_TEXT)).filter(Boolean);
  if (!title || points.length === 0) {
    res.error = "empty-directive";
    return res;
  }
  return enqueue(async () => {
    const { lines } = await readDirectives();
    const id = nextId(lines, "D");
    const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const line: DirectiveLine = {
      id,
      at,
      by: "owner (gated · live GIANT channel surface · T53)",
      law: params.law ?? "R344 + SAOS-SOVEREIGN-CHANNEL/1",
      title,
      directive: points,
      status: "ACTIVE",
    };
    try {
      await appendJsonl(DIRECTIVES_PATH, line);
    } catch (e) {
      res.error = `append: ${e instanceof Error ? e.message.slice(0, 140) : "fs"}`;
      return res;
    }
    res.id = id;
    res.sha16 = sha16(JSON.stringify(line));

    // work-dispatch receipt (system rail — not an owner petition; the fleet acts on it)
    try {
      const text = `${title}${points[0] ? ` — ${points[0].slice(0, 200)}` : ""}`;
      const inbox = { at: new Date().toISOString(), id: res.sha16, text, sha16: res.sha16 };
      await appendJsonl(OPERATOR_INBOX_PATH, inbox);
      res.inboxId = inbox.id;
    } catch {
      // non-fatal — git is the spine
    }

    res.push = await pushStreams(["state/sovereign-channel/directives.jsonl"], `directive ${id}: ${title} (gated owner write, live surface T53)`);
    res.ok = true;
    return res;
  });
}

/** SOVEREIGNTY VOICE WRITE: the LLM rail's answer lands as a note in the sovereignty's name. */
export async function writeVoiceNote(params: { title: string; body: string; contextShas: Record<string, string | null> }): Promise<WriteResult> {
  const res = emptyResult();
  return enqueue(async () => {
    const { lines } = await readNotes();
    const id = nextId(lines, "N");
    const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const evidence = Object.entries(params.contextShas)
      .map(([k, v]) => `${k} · sha16:${v ?? "missing"}`)
      .slice(0, 8);
    const line: NoteLine & { evidence: string[] } = {
      id,
      at,
      side: "SOVEREIGNTY",
      kind: "VOICE",
      title: params.title.trim().slice(0, 200),
      body: params.body.trim().slice(0, MAX_TEXT * 2),
      trace: "voice-rail measured-only (live GIANT surface T53) · evidence shas below",
      status: "OPEN",
      evidence,
    };
    try {
      await appendJsonl(NOTES_PATH, line);
    } catch (e) {
      res.error = `append: ${e instanceof Error ? e.message.slice(0, 140) : "fs"}`;
      return res;
    }
    res.id = id;
    res.sha16 = sha16(JSON.stringify(line));
    res.push = await pushStreams(["state/sovereign-channel/notes.jsonl"], `voice note ${id}: ${params.title.slice(0, 60)} (voice-rail measured-only T53)`);
    res.ok = true;
    return res;
  });
}

/** CONVERGENCE: file a legacy (Domain book) request into the canonical stream — in the sovereignty's name, with evidence. */
export async function fileCanonicalRequest(params: { need: string; evidence: string[]; deadline?: string; by: string }): Promise<WriteResult> {
  const res = emptyResult();
  return enqueue(async () => {
    const lines = await readJsonl<RequestLine>(REQUESTS_PATH);
    const id = nextId(lines, "REQ");
    const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const line: RequestLine = {
      id,
      at,
      by: params.by,
      need: params.need.slice(0, MAX_TEXT),
      evidence: params.evidence.slice(0, 8),
      deadline: params.deadline ?? "none",
      status: "OPEN",
      origin: "canonical",
    };
    try {
      await appendJsonl(REQUESTS_PATH, line);
    } catch (e) {
      res.error = `append: ${e instanceof Error ? e.message.slice(0, 140) : "fs"}`;
      return res;
    }
    res.id = id;
    res.sha16 = sha16(JSON.stringify(line));
    res.push = await pushStreams(["state/sovereign-channel/requests.jsonl"], `request ${id}: ${params.need.slice(0, 60)}… (convergence from Domain mirror T53)`);
    res.ok = true;
    return res;
  });
}

/* --------------------------- context pack (voice) --------------------------- */

export interface ContextSource {
  name: string;
  path: string;
  exists: boolean;
  sha16: string | null;
  ageMinutes: number | null;
  content: string;
}

function trim(s: string, n: number, tail = false): string {
  if (s.length <= n) return s;
  return tail ? "…" + s.slice(-n) : s.slice(0, n) + "…";
}

function dexEssentials(raw: string): string {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const st = (j.state ?? j) as Record<string, unknown>;
    const metrics = (j.metrics ?? st.metrics ?? {}) as Record<string, unknown>;
    const income = (st.income ?? {}) as Record<string, unknown>;
    const backing = (st.backing ?? {}) as Record<string, unknown>;
    return JSON.stringify({
      engine: j.engine ?? st.engine ?? null,
      height: st.height ?? null,
      fills: st.fills ?? null,
      swaps: st.swaps ?? null,
      ladders: st.ladders ?? null,
      liveOrders: st.liveOrders ?? null,
      halted: st.halted ?? null,
      haltReason: st.haltReason ?? null,
      rejectedLast: j.rejectedLast ?? st.rejectedLast ?? null,
      treasuryProfit: st.treasuryProfit ?? null,
      creditsTotal: j.creditsTotal ?? st.creditsTotal ?? null,
      metrics: metrics ? { tps: metrics.tps ?? null, volume24h: metrics.volume24h ?? null, trades24h: metrics.trades24h ?? null } : null,
      income,
      backing,
      assets: st.assets ?? null,
      oracle: st.oracle ?? null,
      publishedAt: j.publishedAt ?? null,
    });
  } catch {
    return "unparseable";
  }
}

export async function buildContextPack(): Promise<{ sources: ContextSource[] }> {
  const sources: ContextSource[] = [];
  const add = (name: string, p: string, content: string, meta: FileMeta) =>
    sources.push({ name, path: p, exists: meta.exists, sha16: meta.sha16, ageMinutes: meta.ageMinutes, content });

  const reqs = await readRequests();
  add("requests.jsonl (פניות-הריבונות — הזרם-הקנוני)", REQUESTS_PATH, trim(JSON.stringify(reqs.canonical), 3000), reqs.meta);
  add("directives.jsonl (חוקי-הבעלים)", DIRECTIVES_PATH, trim(JSON.stringify((await readDirectives()).lines.slice(-6)), 2200, true), (await readDirectives()).meta);
  add("notes.jsonl (יומן-הערוץ, אחרון)", NOTES_PATH, trim(JSON.stringify((await readNotes()).lines.slice(-8)), 2400, true), (await readNotes()).meta);

  const voice = await readVoice();
  add("voice.json (מצב-מסילת-הקול הקנונית)", VOICE_PATH, voice.voice ? JSON.stringify({ status: voice.voice.status, reason: voice.voice.reason ?? null, at: voice.voice.at, inputs: (voice.voice as { inputs?: unknown }).inputs ?? null }) : "", voice.meta);

  const legacyMeta = await fileMeta(LEGACY_BOOK_PATH);
  const legacyRaw = legacyMeta.exists ? await fs.readFile(LEGACY_BOOK_PATH, "utf8") : "";
  add("Domain sovereign-requests.json (מראה-ישנה — מתכנסת לקנוני)", LEGACY_BOOK_PATH, trim(legacyRaw, 2400), legacyMeta);

  const dexMeta = await fileMeta(DEX_STATE_PATH);
  const dexRaw = dexMeta.exists ? await fs.readFile(DEX_STATE_PATH, "utf8") : "";
  add("dex/state.json (מהות-מדידה)", DEX_STATE_PATH, dexRaw ? dexEssentials(dexRaw) : "", dexMeta);

  return { sources };
}
