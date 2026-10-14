/**
 * SOVEREIGN CHANNEL — server-only. The direct Owner <-> Sovereignty channel.
 *
 * Doctrine (owner directive, trace 1a13b983…, "דחוף" + PIVOT §7):
 *  - The Sovereignty is the operator. She funds herself from what exists.
 *    Zero owner deposits, zero claims through external agents. The owner owes nothing.
 *  - She ASKS via agents/sovereign-requests.json (Domain repo; sole writer = the T52
 *    request desk — this desk NEVER writes that file).
 *  - The Owner ANSWERS via THIS desk: agents/owner-channel.jsonl (sole writer = this
 *    desk), receipted to the office operator rail (FleetHQ office/state/operator-inbox.jsonl,
 *    same Directive format the recruit engine consumes), and pushed to origin so the
 *    git-side fleet reads owner words. Agents die; git lives.
 *  - ZERO-FAKE CONTRACT: every value carries named-source meta (bytes/sha16/mtime).
 *    Missing = declared missing, never invented.
 *  - LLM RAIL (the sovereignty's voice) is measured-only: every number must come from
 *    the context pack; when there is no measurement the answer must say so honestly.
 *    If the SDK fails the API returns an error — never a synthetic answer.
 */
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";

const pexec = promisify(execFile);

export const DOMAIN_DIR = "/home/z/estate/Domain";
export const FLEETHQ_DIR = "/home/z/estate/FleetHQ";

export const BOOK_PATH = path.join(DOMAIN_DIR, "agents/sovereign-requests.json");
export const CHANNEL_BOOK_PATH = path.join(DOMAIN_DIR, "agents/owner-channel.jsonl");
export const OPERATOR_INBOX_PATH = path.join(FLEETHQ_DIR, "office/state/operator-inbox.jsonl");
export const DEX_STATE_PATH = path.join(DOMAIN_DIR, "dex/state.json");
export const SOV_DECISIONS_PATH = path.join(FLEETHQ_DIR, "office/state/sovereign-decisions.json");
export const PAT_ENV_PATH = "/home/z/my-project/upload/pat.env";

const DOMAIN_PUSH_URL_BASE = "https://github.com/roshpinacare-sys/Domain";
const MAX_NOTE = 600;
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
    const ageMin = Math.round((Date.now() - st.mtimeMs) / 60000);
    return {
      path: p,
      exists: true,
      bytes: st.size,
      sha16: sha16(buf.toString("utf8")),
      mtime: st.mtime.toISOString(),
      ageMinutes: ageMin,
    };
  } catch {
    return { path: p, exists: false, bytes: null, sha16: null, mtime: null, ageMinutes: null };
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch {
    return null;
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

/** serialize all mutating operations (append + git rail) — one writer at a time */
let writeChain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => undefined);
  return run;
}

/* --------------------------------- the book -------------------------------- */

export interface SovereignRequest {
  id: string;
  at: string;
  author: string;
  status: string;
  what: string;
  why: string;
  evidence: string[];
  cost: string;
  expires: string;
}

export interface SovereignBook {
  spec: string;
  at: string;
  updated: string;
  doctrine: { he: string; en: string };
  grant: { rail: string; format: string; law: string };
  requests: SovereignRequest[];
}

export interface ChannelLine {
  at: string;
  id: string;
  role: "owner" | "sovereignty" | "system";
  kind: "decision" | "directive" | "answer" | "notice";
  reqId?: string;
  decision?: string;
  text: string;
  sha16: string;
  via?: string;
}

export async function readBook(): Promise<{ book: SovereignBook | null; meta: FileMeta }> {
  const meta = await fileMeta(BOOK_PATH);
  const book = await readJson<SovereignBook>(BOOK_PATH);
  return { book, meta };
}

export async function readChannelBook(): Promise<{ lines: ChannelLine[]; meta: FileMeta }> {
  const meta = await fileMeta(CHANNEL_BOOK_PATH);
  const lines = await readJsonl<ChannelLine>(CHANNEL_BOOK_PATH);
  return { lines, meta };
}

/** effective status of a request: OPEN unless the owner channel has a decision for it */
export function effectiveStatus(reqId: string, lines: ChannelLine[]): string {
  const dec = lines
    .filter((l) => l.kind === "decision" && l.reqId === reqId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
  if (!dec) return "OPEN";
  return dec.decision === "GRANT" ? "GRANTED" : "DECLINED";
}

/* ------------------------------ thread (sqlite) ---------------------------- */

export interface ThreadMessage {
  id: string;
  role: string;
  kind: string;
  reqId: string | null;
  title: string | null;
  body: string;
  evidence: string | null;
  status: string | null;
  source: string;
  ref: string | null;
  meta: string | null;
  createdAt: string;
}

async function db() {
  const mod = await import("@/lib/db");
  return mod.db;
}

function toThread(row: {
  id: string;
  role: string;
  kind: string;
  reqId: string | null;
  title: string | null;
  body: string;
  evidence: string | null;
  status: string | null;
  source: string;
  ref: string | null;
  meta: string | null;
  createdAt: Date;
}): ThreadMessage {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** lazy sync guard — at most one sync per 30s across requests */
let lastSyncAt = 0;
let syncPromise: Promise<{ errors: string[] }> | null = null;

export async function syncThread(force = false): Promise<{ errors: string[] }> {
  if (!force && Date.now() - lastSyncAt < 30_000) return { errors: [] };
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const errors: string[] = [];
    const prisma = await db();
    const { book, meta } = await readBook();

    // 1) requests from the sovereignty's book (read-only for us — one-writer law)
    if (book && Array.isArray(book.requests)) {
      for (const r of book.requests) {
        const body = [r.what, r.why].filter(Boolean).join("\n\n");
        try {
          await prisma.sovereignMessage.upsert({
            where: { id: `book-${r.id}` },
            create: {
              id: `book-${r.id}`,
              role: "sovereignty",
              kind: "request",
              reqId: r.id,
              title: r.what,
              body,
              evidence: JSON.stringify(r.evidence ?? []),
              status: r.status,
              source: "book",
              ref: meta.sha16,
              meta: JSON.stringify({ bookSha: meta.sha16, cost: r.cost, expires: r.expires, at: r.at }),
            },
            update: {
              title: r.what,
              body,
              evidence: JSON.stringify(r.evidence ?? []),
              status: r.status,
              ref: meta.sha16,
              meta: JSON.stringify({ bookSha: meta.sha16, cost: r.cost, expires: r.expires, at: r.at }),
            },
          });
        } catch (e) {
          errors.push(`sync-request-${r.id}: ${e instanceof Error ? e.message.slice(0, 120) : "db"}`);
        }
      }
    } else {
      errors.push(`book-missing-or-invalid: ${BOOK_PATH}`);
    }

    // 2) channel book lines (owner words + sovereignty answers, git-persisted)
    const { lines } = await readChannelBook();
    for (const l of lines) {
      try {
        await prisma.sovereignMessage.upsert({
          where: { id: `chan-${l.id}` },
          create: {
            id: `chan-${l.id}`,
            role: l.role,
            kind: l.kind,
            reqId: l.reqId ?? null,
            title: null,
            body: l.text,
            evidence: null,
            status: l.decision ?? null,
            source: "channel-book",
            ref: l.sha16,
            meta: JSON.stringify({ at: l.at, via: l.via ?? null }),
          },
          update: {},
        });
      } catch (e) {
        errors.push(`sync-line-${l.id}: ${e instanceof Error ? e.message.slice(0, 120) : "db"}`);
      }
    }

    lastSyncAt = Date.now();
    syncPromise = null;
    return { errors };
  })();
  return syncPromise;
}

export async function getThread(limit = 80): Promise<ThreadMessage[]> {
  const prisma = await db();
  const rows = await prisma.sovereignMessage.findMany({
    orderBy: { createdAt: "asc" },
    take: 400,
  });
  return rows.slice(-limit).map(toThread);
}

/* --------------------------------- git rail -------------------------------- */

function readPat(): string | null {
  try {
    const raw = readFileSync(PAT_ENV_PATH, "utf8");
    const m = raw.match(/github_pat_[A-Za-z0-9_]+/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
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
 * The only writer of agents/owner-channel.jsonl in git: rebase onto origin (twins
 * push constantly), commit ONLY our book, push with a one-time PAT URL (never
 * written to config), verify via ls-remote. Fail-honest: any failure returns a
 * receipt with the error and leaves the local commit in place for a retry.
 */
export async function pushChannelBook(commitMsg: string): Promise<PushReceipt> {
  const receipt: PushReceipt = { attempted: true, pushed: false, verified: false, commit: null, error: null };
  try {
    const pull = await git(DOMAIN_DIR, ["pull", "--rebase", "--autostash"]);
    if (!pull.ok && !/up to date|Current branch/i.test(pull.out + pull.err)) {
      receipt.error = `pull: ${pull.err.slice(0, 160)}`;
      return receipt;
    }
    const add = await git(DOMAIN_DIR, ["add", "agents/owner-channel.jsonl"]);
    if (!add.ok) {
      receipt.error = `add: ${add.err.slice(0, 160)}`;
      return receipt;
    }
    const committed = await git(DOMAIN_DIR, ["commit", "-m", commitMsg, "--no-verify"]);
    if (!committed.ok && !/nothing to commit/.test(committed.out + committed.err)) {
      receipt.error = `commit: ${committed.err.slice(0, 160)}`;
      return receipt;
    }
    const head = await git(DOMAIN_DIR, ["rev-parse", "HEAD"]);
    receipt.commit = head.ok ? head.out.trim().slice(0, 12) : null;

    const token = readPat();
    const url = token ? `https://x-access-token:${token}@github.com/roshpinacare-sys/Domain.git` : `${DOMAIN_PUSH_URL_BASE}.git`;
    const push = await git(DOMAIN_DIR, ["push", url, "HEAD:refs/heads/main"]);
    if (!push.ok) {
      receipt.error = `push: ${(push.err || push.out).slice(0, 200)}`;
      return receipt;
    }
    receipt.pushed = true;

    const remote = await git(DOMAIN_DIR, ["ls-remote", url, "refs/heads/main"], 20_000);
    if (remote.ok && receipt.commit && remote.out.trim().startsWith(receipt.commit)) {
      receipt.verified = true;
    } else if (remote.ok) {
      receipt.error = "verify-mismatch";
    } else {
      receipt.error = "verify-unreachable";
    }
    return receipt;
  } catch (e) {
    receipt.error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    return receipt;
  }
}

/* ------------------------------- write paths ------------------------------- */

async function appendJsonl(p: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, JSON.stringify(obj) + "\n", "utf8");
}

export interface WriteResult {
  ok: boolean;
  error: string | null;
  lineId: string | null;
  sha16: string | null;
  inboxId: string | null;
  push: PushReceipt | null;
}

/** owner decision on a request: GRANT|DECLINE + note. Receipted to the book, the inbox rail, and git. */
export async function decide(reqId: string, decision: "GRANT" | "DECLINE", note: string): Promise<WriteResult> {
  const res: WriteResult = { ok: false, error: null, lineId: null, sha16: null, inboxId: null, push: null };
  const { book } = await readBook();
  const exists = book?.requests?.some((r) => r.id === reqId);
  if (!exists) {
    res.error = `req-not-in-book: ${reqId}`;
    return res;
  }
  const trimmedNote = note.trim().slice(0, MAX_NOTE);
  const text = `${decision} ${reqId}${trimmedNote ? ` [${trimmedNote}]` : ""}`;
  return enqueue(async () => {
    const at = new Date().toISOString();
    const body = JSON.stringify({ at, role: "owner", kind: "decision", reqId, decision, text });
    const id = sha16(body);
    const line: ChannelLine = { at, id, role: "owner", kind: "decision", reqId, decision, text, sha16: sha16(body + id), via: "owner-interface/T53" };
    try {
      await appendJsonl(CHANNEL_BOOK_PATH, line);
    } catch (e) {
      res.error = `append: ${e instanceof Error ? e.message.slice(0, 140) : "fs"}`;
      return res;
    }
    res.lineId = id;
    res.sha16 = line.sha16;

    // office operator rail — same Directive format the recruit engine consumes
    try {
      const inbox = { at, id: line.sha16, text, sha16: line.sha16 };
      await appendJsonl(OPERATOR_INBOX_PATH, inbox);
      res.inboxId = inbox.id;
    } catch {
      // inbox unavailable is not fatal — the git book is the spine
    }

    const prisma = await db();
    await prisma.sovereignMessage.create({
      data: {
        id: `chan-${line.id}`,
        role: "owner",
        kind: "decision",
        reqId,
        body: text,
        status: decision,
        source: "interface",
        ref: line.sha16,
        meta: JSON.stringify({ at, via: "owner-interface/T53" }),
      },
    });

    res.push = await pushChannelBook(`owner-channel: ${text} (interface receipt T53) [skip ci]`);
    res.ok = true;
    return res;
  });
}

/** free owner directive — same rails as decisions, no reqId */
export async function directive(text: string): Promise<WriteResult> {
  const res: WriteResult = { ok: false, error: null, lineId: null, sha16: null, inboxId: null, push: null };
  const trimmed = text.trim().slice(0, MAX_TEXT);
  if (!trimmed) {
    res.error = "empty-directive";
    return res;
  }
  return enqueue(async () => {
    const at = new Date().toISOString();
    const body = JSON.stringify({ at, role: "owner", kind: "directive", text: trimmed });
    const id = sha16(body);
    const line: ChannelLine = { at, id, role: "owner", kind: "directive", text: trimmed, sha16: sha16(body + id), via: "owner-interface/T53" };
    try {
      await appendJsonl(CHANNEL_BOOK_PATH, line);
    } catch (e) {
      res.error = `append: ${e instanceof Error ? e.message.slice(0, 140) : "fs"}`;
      return res;
    }
    res.lineId = id;
    res.sha16 = line.sha16;

    try {
      const inbox = { at, id: line.sha16, text: trimmed, sha16: line.sha16 };
      await appendJsonl(OPERATOR_INBOX_PATH, inbox);
      res.inboxId = inbox.id;
    } catch {
      // non-fatal
    }

    const prisma = await db();
    await prisma.sovereignMessage.create({
      data: {
        id: `chan-${line.id}`,
        role: "owner",
        kind: "directive",
        body: trimmed,
        source: "interface",
        ref: line.sha16,
        meta: JSON.stringify({ at, via: "owner-interface/T53" }),
      },
    });

    res.push = await pushChannelBook(`owner-channel: directive ${line.sha16} (interface receipt T53) [skip ci]`);
    res.ok = true;
    return res;
  });
}

/** sovereignty answer line appended by the LLM rail */
export async function recordAnswer(text: string, model: string, contextShas: Record<string, string | null>): Promise<WriteResult> {
  const res: WriteResult = { ok: false, error: null, lineId: null, sha16: null, inboxId: null, push: null };
  return enqueue(async () => {
    const at = new Date().toISOString();
    const trimmed = text.trim().slice(0, MAX_TEXT * 2);
    const body = JSON.stringify({ at, role: "sovereignty", kind: "answer", text: trimmed });
    const id = sha16(body);
    const line: ChannelLine = { at, id, role: "sovereignty", kind: "answer", text: trimmed, sha16: sha16(body + id), via: `llm-rail/${model}` };
    try {
      await appendJsonl(CHANNEL_BOOK_PATH, line);
    } catch (e) {
      res.error = `append: ${e instanceof Error ? e.message.slice(0, 140) : "fs"}`;
      return res;
    }
    res.lineId = id;
    res.sha16 = line.sha16;

    const prisma = await db();
    await prisma.sovereignMessage.create({
      data: {
        id: `chan-${line.id}`,
        role: "sovereignty",
        kind: "answer",
        body: trimmed,
        source: "llm",
        ref: line.sha16,
        meta: JSON.stringify({ at, model, contextShas }),
      },
    });

    res.push = await pushChannelBook(`owner-channel: sovereignty answer ${line.sha16} (llm-rail measured-only T53) [skip ci]`);
    res.ok = true;
    return res;
  });
}

/* --------------------------- context pack (LLM) ---------------------------- */

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

/** extract the measured essentials from dex/state.json without inventing anything */
function dexEssentials(raw: string): string {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const st = (j.state ?? j) as Record<string, unknown>;
    const pick = {
      engine: j.engine ?? st.engine ?? null,
      height: st.height ?? j.height ?? null,
      fills: st.fills ?? j.fills ?? null,
      swaps: st.swaps ?? j.swaps ?? null,
      ladders: st.ladders ?? j.ladders ?? null,
      liveOrders: st.liveOrders ?? j.liveOrders ?? null,
      halted: st.halted ?? j.halted ?? null,
      rejectedLast: j.rejectedLast ?? st.rejectedLast ?? null,
      realizedSbd: st.realizedSbd ?? j.realizedSbd ?? null,
      updatedAt: j.updatedAt ?? j.at ?? st.updatedAt ?? null,
    };
    return JSON.stringify(pick);
  } catch {
    return "unparseable";
  }
}

export async function buildContextPack(): Promise<{ sources: ContextSource[]; thread: ThreadMessage[] }> {
  const sources: ContextSource[] = [];

  const bookMeta = await fileMeta(BOOK_PATH);
  const bookRaw = bookMeta.exists ? await fs.readFile(BOOK_PATH, "utf8") : "";
  sources.push({ name: "sovereign-requests.json (פנקס-הבקשות של הריבונות)", path: BOOK_PATH, exists: bookMeta.exists, sha16: bookMeta.sha16, ageMinutes: bookMeta.ageMinutes, content: trim(bookRaw, 3500) });

  const dexMeta = await fileMeta(DEX_STATE_PATH);
  const dexRaw = dexMeta.exists ? await fs.readFile(DEX_STATE_PATH, "utf8") : "";
  sources.push({ name: "dex/state.json (מהות-מדידה)", path: DEX_STATE_PATH, exists: dexMeta.exists, sha16: dexMeta.sha16, ageMinutes: dexMeta.ageMinutes, content: dexRaw ? dexEssentials(dexRaw) : "" });

  const decMeta = await fileMeta(SOV_DECISIONS_PATH);
  const dec = await readJson<{ generatedAt?: string; policyVersion?: string; authority?: string; decision?: string; reason?: string }>(SOV_DECISIONS_PATH);
  const decSlim = dec
    ? JSON.stringify({ generatedAt: dec.generatedAt ?? null, policyVersion: dec.policyVersion ?? null, authority: dec.authority ?? null, decision: dec.decision ?? null, reason: dec.reason ?? null })
    : "";
  sources.push({ name: "sovereign-decisions.json (מחזור-ההחלטה הריבוני האחרון)", path: SOV_DECISIONS_PATH, exists: decMeta.exists, sha16: decMeta.sha16, ageMinutes: decMeta.ageMinutes, content: decSlim });

  const inbox = await readJsonl<Record<string, unknown>>(OPERATOR_INBOX_PATH);
  const inboxMeta = await fileMeta(OPERATOR_INBOX_PATH);
  sources.push({ name: "operator-inbox.jsonl (הנחיות-מקבלות אחרונות)", path: OPERATOR_INBOX_PATH, exists: inboxMeta.exists, sha16: inboxMeta.sha16, ageMinutes: inboxMeta.ageMinutes, content: trim(JSON.stringify(inbox.slice(-8)), 1800, true) });

  const { lines } = await readChannelBook();
  const chanMeta = await fileMeta(CHANNEL_BOOK_PATH);
  sources.push({ name: "owner-channel.jsonl (פנקס-הערוץ ב-git)", path: CHANNEL_BOOK_PATH, exists: chanMeta.exists, sha16: chanMeta.sha16, ageMinutes: chanMeta.ageMinutes, content: trim(JSON.stringify(lines.slice(-20)), 2200, true) });

  const thread = await getThread(24);
  return { sources, thread };
}
