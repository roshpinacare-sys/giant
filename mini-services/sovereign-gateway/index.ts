// ============================================================================
// SOVEREIGN GATEWAY — the office's OWN local OpenAI-compatible endpoint.
//
// ONE stable local address that any agent, tool or script can point at
// (OPENAI_API_BASE=http://127.0.0.1:3011/v1, any string as the key — zero
// auth by design). Behind it walks the full sovereign multi-brain chain with
// real-time failover: 429 / 403 / timeout / network death never crash the
// caller — the gateway silently shifts to the next brain+model, tracks
// per-brain cooldowns in ONE place for ALL consumers, and answers honestly
// when every route is saturated.
//
//   GET  /health             honest brain states (no secrets)
//   GET  /v1/models          union of every live brain's models (+ "auto")
//   POST /v1/chat/completions OpenAI-compatible; model "auto" = walk the chain
//   GET  /v1/system-prompt   the sovereign agent prompt (also SOVEREIGN-PROMPT.md)
//
// Sovereign network discipline (env):
//   AI_TIMEOUT / REQUEST_TIMEOUT      overall answer deadline in ms (default 60000)
//   MAX_RETRIES / MAX_NETWORK_RETRIES max brain+model attempts     (default 8)
//   COMPACTION_BUDGET                 lossy context budget in chars (default 24000,
//                                     ≈6K tokens — 0 disables compaction)
//   DUCKAI_URL  optional local reverse-engineered bridge (duckai) — activates
//               the slot the moment the env var exists (runs on any machine
//               with DuckDuckGo access; this sandbox blocks DDG — honest).
//   LOCAL_LLM_URL optional air-gapped fallback (llama.cpp / llama-swap / any
//               local OpenAI-compatible server, e.g. http://localhost:8080/v1)
//               — arms the sovereign offline tier the moment it exists.
//
// The gateway stores/transmits NO telemetry and NO identity tokens. It logs
// brain ids and latencies only — never message content, never keys.
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const PORT = Number(process.env.GATEWAY_PORT || 3011);
const HERE = dirname(new URL(import.meta.url).pathname);

// ---- env: the gateway is a standalone mini-service, so it deliberately reads
// the office's own env files (vault merge-deploy writes them at the repo root).
// Real process env always wins; nothing is ever logged.
function loadEnvFile(path: string): void {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue; // real env wins
      let val = (m[2] ?? '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) process.env[key] = val;
    }
  } catch {
    // missing file is normal (fresh machine before unseal)
  }
}
loadEnvFile(process.env.GATEWAY_ENV_FILE || join(HERE, '../../.env.local'));
loadEnvFile(join(HERE, '../../.env'));
loadEnvFile(join(HERE, '.env'));

// ---- brains -------------------------------------------------------------------------------
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface Brain {
  name: string;
  base: string;
  key?: string; // undefined → anonymous access (no auth header)
  models: string[];
  referer?: boolean;
}

function parseModels(envVal: string | undefined, fallback: string[]): string[] {
  const list = (envVal ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

function keyedBrain(name: string, base: string, key: string | undefined, models: string[]): Brain[] {
  if (!key) return [];
  return [{ name, base, key, models }];
}

/** THE definitive sovereign chain. The consumers' direct chains are the
 *  fallback copies of this doctrine — this is the single source of truth. */
function buildBrains(): Brain[] {
  const brains: Brain[] = [];
  if (process.env.XAI_API_KEY) {
    brains.push({
      name: 'xai',
      base: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
      key: process.env.XAI_API_KEY,
      models: [process.env.XAI_MODEL || 'grok-4-fast-non-reasoning'],
    });
  }
  const orKeys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
  ].filter((k): k is string => typeof k === 'string' && k.trim().length > 10);
  const orModels = parseModels(process.env.OPENROUTER_MODELS, [
    'deepseek/deepseek-chat-v3.1',
    'nvidia/nemotron-3.5-lightning:free',
    'inclusionai/ling-3.0-flash-sante:free',
    'google/gemma-4-26b-a4b-it:free',
    'thinkingmachines/inkling:free',
    'cohere/north-mini-code:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'poolside/laguna-s-2.1:free',
  ]);
  for (const [i, key] of orKeys.entries()) {
    brains.push({
      name: orKeys.length > 1 ? `openrouter-${i + 1}` : 'openrouter',
      base: 'https://openrouter.ai/api/v1',
      key,
      referer: true,
      models: orModels,
    });
  }
  brains.push(
    ...keyedBrain('groq', 'https://api.groq.com/openai/v1', process.env.GROQ_API_KEY, parseModels(process.env.GROQ_MODELS, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'])),
    ...keyedBrain('cerebras', 'https://api.cerebras.ai/v1', process.env.CEREBRAS_API_KEY, parseModels(process.env.CEREBRAS_MODELS, ['llama-3.3-70b'])),
    ...keyedBrain('mistral', 'https://api.mistral.ai/v1', process.env.MISTRAL_API_KEY, parseModels(process.env.MISTRAL_MODELS, ['mistral-small-latest', 'open-mistral-nemo'])),
    ...keyedBrain('google-ai', 'https://generativelanguage.googleapis.com/v1beta/openai', process.env.GOOGLE_AI_API_KEY, parseModels(process.env.GOOGLE_AI_MODELS, ['gemini-2.0-flash', 'gemini-2.0-flash-lite'])),
    ...keyedBrain('github-models', 'https://models.github.ai/inference', process.env.GITHUB_MODELS_TOKEN, parseModels(process.env.GITHUB_MODELS, ['openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct'])),
    ...keyedBrain('together', 'https://api.together.xyz/v1', process.env.TOGETHER_API_KEY, parseModels(process.env.TOGETHER_MODELS, ['meta-llama/Llama-3.3-70B-Instruct-Turbo'])),
  );
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    brains.push({
      name: 'cloudflare-ai',
      base: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      key: process.env.CLOUDFLARE_API_TOKEN,
      models: parseModels(process.env.CLOUDFLARE_AI_MODELS, [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        '@cf/mistralai/mistral-small-3.1-24b-instruct',
        '@cf/qwen/qwen2.5-coder-32b-instruct',
      ]),
    });
  }
  // LOCAL REVERSE-ENGINEERED BRIDGE — duckai (github.com/amirkabiri/duckai):
  // an OpenAI-compatible server over DuckDuckGo's free AI backend. Zero auth,
  // zero cost. The code is rescued in mini-services/duckai — run it on any
  // machine with DDG access and set DUCKAI_URL; the slot lights up instantly.
  // From THIS sandbox DDG is network-blocked (measured twice) — the slot stays
  // off here and waits honestly.
  if (process.env.DUCKAI_URL) {
    brains.push({
      name: 'duckai',
      base: process.env.DUCKAI_URL,
      key: 'unused', // duckai accepts any string
      models: parseModels(process.env.DUCKAI_MODELS, [
        'gpt-4o-mini',
        'claude-3-5-haiku-latest',
        'gpt-5-mini',
        'mistralai/Mistral-Small-24B-Instruct-2501',
      ]),
    });
  }
  // AIR-GAPPED FALLBACK — llama.cpp / any local OpenAI-compatible server
  // (the sovereignty manifest's http://localhost:8080/v1 tier). Honest like
  // duckai: the slot exists only when LOCAL_LLM_URL exists. No GPU in this
  // sandbox — documented in MANIFEST-REVIEW, armed on any machine that has one.
  if (process.env.LOCAL_LLM_URL) {
    brains.push({
      name: 'local-llm',
      base: process.env.LOCAL_LLM_URL.replace(/\/$/, ''),
      key: process.env.LOCAL_LLM_KEY || 'unused',
      models: parseModels(process.env.LOCAL_LLM_MODELS, ['qwen-2.5-coder-32b', 'llama-3.3-70b-instruct']),
    });
  }
  brains.push({
    name: 'kilo',
    base: 'https://kilocode.ai/api/openrouter',
    key: process.env.KILO_API_KEY,
    models: parseModels(process.env.KILO_MODELS, ['kilo-auto/free', 'nvidia/nemotron-3-ultra-550b-a55b:free']),
  });
  brains.push({
    name: 'llm7',
    base: 'https://api.llm7.io/v1',
    key: process.env.LLM7_API_KEY,
    models: parseModels(process.env.LLM7_MODELS, ['mistral-Nemo-Instruct-2407', 'DeepSeek-V4-Flash-0731', 'GLM-5.3-Flash']),
  });
  brains.push({
    name: 'pollinations',
    base: 'https://text.pollinations.ai/openai',
    key: process.env.POLLINATIONS_TOKEN,
    models: parseModels(process.env.POLLINATIONS_MODELS, ['openai-fast']),
  });
  brains.push({
    name: 'ovh',
    base: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    key: process.env.OVH_API_KEY,
    models: parseModels(process.env.OVH_MODELS, [
      'Mistral-Small-3.2-24B-Instruct-2506',
      'gpt-oss-120b',
      'Qwen3.5-397B-A17B',
      'Meta-Llama-3_3-70B-Instruct',
      'Qwen3.8-27B',
      'gpt-oss-20b',
      'Mistral-Nemo-Instruct-2407',
    ]),
  });
  return brains;
}

let cachedBrains: Brain[] | undefined;
function brains(): Brain[] {
  if (!cachedBrains) cachedBrains = buildBrains();
  return cachedBrains;
}

// ---- cooldowns (ONE central place for ALL consumers) ---------------------------------------
const cooldownUntil = new Map<string, number>();
const HARD_COOLDOWN_MS = 5 * 60_000; // auth / no-credits / dead model
const RATE_COOLDOWN_MS = 45_000; // 429 — quotas recover fast
const NET_COOLDOWN_MS = 15_000; // network-level death — cheap retry soon
const HARD_STATUS = new Set([401, 402, 403]);

// jittered cooldown (sovereign doctrine: thundering-herd avoidance — every
// cooldown lands in ±15% of its nominal value so parallel chains de-sync)
function cool(id: string, ms: number): void {
  const jittered = Math.round(ms * (0.85 + Math.random() * 0.3));
  cooldownUntil.set(id, Date.now() + jittered);
}

// ---- honest counters ----------------------------------------------------------------------
const stats = {
  startedAt: Date.now(),
  requests: 0,
  answered: 0,
  failed: 0,
  compactions: 0,
  lastAnsweredVia: '',
  lastLatencyMs: 0,
};

// ---- proactive family telemetry (SOVEREIGNTY PROTOCOL §1) --------------------------------
// Rolling per-family event log over the last hour. The walk RE-INDEXES family
// priority from this BEFORE any attempt budget is spent: a family whose 429
// rate climbs is demoted for real, not discovered-the-hard-way. No content,
// no keys — brain ids, status classes and latencies only.
const TELEMETRY_WINDOW_MS = 60 * 60_000; // owner spec: “the last hour”
const TELEMETRY_MAX_EVENTS = 600; // per family — bounded memory, honest
export type TelemetryKind = 'ok' | 'rate' | 'hard' | 'net';
const familyEvents = new Map<string, Array<{ t: number; k: TelemetryKind; ms?: number }>>();
function recordFamily(family: string, k: TelemetryKind, ms?: number): void {
  let arr = familyEvents.get(family);
  if (!arr) {
    arr = [];
    familyEvents.set(family, arr);
  }
  arr.push({ t: Date.now(), k, ms });
  if (arr.length > TELEMETRY_MAX_EVENTS) arr.splice(0, arr.length - TELEMETRY_MAX_EVENTS);
}
function familyHealth(family: string): {
  total: number; ok: number; rate: number; hard: number; net: number; avgMs: number | null; score: number;
} {
  const cutoff = Date.now() - TELEMETRY_WINDOW_MS;
  const ev = (familyEvents.get(family) ?? []).filter((e) => e.t >= cutoff);
  const oks = ev.filter((e) => e.k === 'ok');
  const rate = ev.filter((e) => e.k === 'rate').length;
  const hard = ev.filter((e) => e.k === 'hard').length;
  const net = ev.filter((e) => e.k === 'net').length;
  const avgMs = oks.length ? Math.round(oks.reduce((a, e) => a + (e.ms ?? 0), 0) / oks.length) : null;
  const total = ev.length;
  // score ∈ [0,1]: success +1, 429 −0.7, hard death −1, network death −0.4;
  // no data → neutral 0.5 (an unproven family is neither promoted nor buried).
  // Families that answer but are slow (>20s avg) carry a small latency penalty.
  const raw = total ? (oks.length - 0.7 * rate - 1.0 * hard - 0.4 * net) / total : 0.5;
  const latencyPenalty = avgMs != null && avgMs > 20_000 ? 0.85 : 1;
  return { total, ok: oks.length, rate, hard, net, avgMs, score: Math.max(0, Math.min(1, raw * latencyPenalty)) };
}
// adaptive cooldown multiplier: the denser the 429 traffic in the window, the
// longer every new cooldown inside that family lives (thundering-herd respect;
// the owner protocol: “autonomously adjust cooling periods by traffic density”)
function adaptiveMultiplier(family: string): number {
  const h = familyHealth(family);
  if (!h.total) return 1;
  const density = h.rate / h.total; // 0..1 within the window
  return 1 + Math.min(3, density * 4); // up to ×4 during a live 429 storm
}
function familiesInBuildOrder(): string[] {
  return [...new Set(brains().map((b) => b.name.replace(/-\d+$/, '')))];
}

// ---- lossy context compaction (the manifest's “Lossy Text Compaction”) -----
// Free brains have small windows; a bloated history is the #1 self-inflicted
// 400/429. The gateway compacts ONCE per request, provider-agnostically:
// system prompts survive (capped), the ORIGINAL request survives (capped),
// the newest turns fill the remaining budget from the end, everything older
// becomes one honest stub. Deterministic, no model call, no content logging.
const COMPACTION_BUDGET = Math.max(0, Number(process.env.COMPACTION_BUDGET) || 24_000); // chars ≈ 6K tokens; 0 disables
function compactMessages(messages: ChatMessage[]): { messages: ChatMessage[]; compacted: boolean; droppedChars: number } {
  const total = messages.reduce((a, m) => a + m.content.length, 0);
  if (!COMPACTION_BUDGET || total <= COMPACTION_BUDGET) return { messages, compacted: false, droppedChars: 0 };
  const out: ChatMessage[] = [];
  let used = 0;
  for (const m of messages) {
    if (m.role === 'system') {
      const c = m.content.slice(0, 4000);
      out.push({ role: m.role, content: c });
      used += c.length;
    }
  }
  const nonsys = messages.filter((m) => m.role !== 'system');
  const firstUser = nonsys.find((m) => m.role === 'user');
  if (firstUser) {
    const c = firstUser.content.slice(0, 2000);
    out.push({ role: 'user', content: c });
    used += c.length;
  }
  const tail: ChatMessage[] = [];
  for (let i = nonsys.length - 1; i >= 0; i--) {
    const m = nonsys[i];
    if (m === firstUser) break; // already kept above; everything older is dropped
    const room = COMPACTION_BUDGET - used;
    if (room <= 200) break;
    const c = m.content.length > room ? m.content.slice(0, room) : m.content;
    tail.unshift({ role: m.role, content: c });
    used += c.length;
  }
  const droppedChars = total - used;
  if (droppedChars > 0) {
    out.push({
      role: 'user',
      content: `[context compaction] ${droppedChars} chars of earlier conversation were distilled away to fit the live route; the original request and the newest turns are preserved.`,
    });
  }
  return { messages: [...out, ...tail], compacted: true, droppedChars };
}

// ---- front-desk priority (same file convention as the whole office) ------------------------
const RECEPTION_FLAG = process.env.RECEPTION_PRIORITY_FILE || '/tmp/fleethq-reception-priority';
async function yieldToReception(isPriority: boolean, deadline: number): Promise<void> {
  if (isPriority) return; // the visitor's own request never yields to itself
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(RECEPTION_FLAG, 'utf8');
      const until = (JSON.parse(raw) as { until?: number }).until ?? 0;
      if (until <= Date.now()) return;
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      return; // no flag → nobody waiting
    }
  }
}

// ---- quality -------------------------------------------------------------------------------
function qualityGate(text: string): boolean {
  if (!text || text.trim().length < 2) return false;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
  return cjk / Math.max(1, text.length) < 0.08;
}

function stripReasoning(text: string): string {
  const original = (text ?? '').trim();
  const hadThink = /<think>/i.test(original);
  let t = original.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/here(?:'|’)?s (?:a |the )?thinking process|let me think(?: through)?|internal reasoning process/i.test(t)) {
    const blocks = t.split(/\n{2,}/);
    let keep = -1;
    for (let i = 1; i < blocks.length; i++) {
      const first = (blocks[i]?.split('\n')[0] ?? '').trim();
      const reasoningStyle = /^(\d+[\.)]|\*\*|-\s|\u2022)/.test(first) || /:$/.test(first);
      if (!reasoningStyle && (blocks[i]?.length ?? 0) > 25) {
        keep = i;
        break;
      }
    }
    if (keep > 0) {
      t = blocks.slice(keep).join('\n\n').trim();
    } else {
      // reasoning-only content: the scratchpad ran to the end (or the answer is
      // buried inside numbered reasoning). Shipping a scratchpad to a human is
      // WORSE than failing — signal failure so the chain walks to the next brain.
      return '';
    }
  }
  return t.trim() || (hadThink ? '' : original);
}

// ---- one attempt ---------------------------------------------------------------------------
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function callBrain(b: Brain, model: string, messages: ChatMessage[], maxTokens: number, budgetMs: number): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (b.key) headers.authorization = `Bearer ${b.key}`;
  if (b.referer) {
    headers['http-referer'] = 'https://fleet-hq.local';
    headers['x-title'] = 'Fleet HQ';
  }
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature: 0.4 };
  if (b.referer) body.reasoning = { exclude: true };
  const res = await withTimeout(
    fetch(`${b.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }),
    Math.min(Math.max(budgetMs, 8000), 45_000),
  );
  if (!res.ok) {
    const err = new Error(`llm http ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('empty reply');
  return text;
}

async function callZai(messages: ChatMessage[]): Promise<string> {
  const mod = await import('z-ai-web-dev-sdk');
  const ZAI = (mod as { default?: unknown }).default ?? mod;
  const zai = await withTimeout((ZAI as { create: () => Promise<unknown> }).create(), 20_000);
  const mapped = messages.map((m, i) => ({
    role: m.role === 'system' ? (i === 0 ? 'assistant' : 'user') : m.role,
    content: m.role === 'system' && i > 0 ? `[system note] ${m.content}` : m.content,
  }));
  const completion = (await withTimeout(
    (zai as { chat: { completions: { create: (a: unknown) => Promise<unknown> } } }).chat.completions.create({
      messages: mapped,
      thinking: { type: 'disabled' },
    }),
    60_000,
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const text = completion?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('empty reply');
  return text;
}


/** Meta-commentary sieve: free models emit drafting chatter ("Let's refine…",
 *  "Draft: …"), self-check tails ("Check word count: …") and wrapped quotes.
 *  Keep only the usable answer: cut self-check tails, extract the LAST
 *  Draft/Final/Answer segment, drop leading meta lines, unwrap quotes. */
function polish(text: string): string {
  let t = (text ?? '').trim();
  const tail = t.search(/\n\s*(?:check\b|word count\b|constraints?\s*:)/i);
  if (tail > 0) t = t.slice(0, tail).trim();
  const segs = [...t.matchAll(/(?:^|\n)\s*(?:final(?:\s+answer)?|draft|answer)\s*:\s*/gi)];
  if (segs.length) {
    const last = segs[segs.length - 1];
    t = t.slice((last.index ?? 0) + last[0].length).trim();
  } else if (/^let'?s\s+(refine|make|draft|craft|write|think|polish)/i.test(t)) {
    const nl = t.indexOf('\n');
    if (nl > 0) t = t.slice(nl + 1).trim();
  }
  if (/^"[\s\S]+"$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}
// ---- the sovereign walk ---------------------------------------------------------------------
interface WalkResult {
  text: string;
  brain: string;
  attempts: number;
  latencyMs: number;
}
async function walkChain(
  messages: ChatMessage[],
  maxTokens: number,
  deadline: number,
  maxAttempts: number,
  isPriority: boolean,
): Promise<WalkResult> {
  let lastErr: unknown;
  let attempts = 0;
  let rateHits = 0; // sovereign doctrine: repeated 429 → degrade per-attempt load (max_tokens), not the deadline
  // THE EVENING-QUOTA LAW (measured 2026-10-08): one provider family's exhausted
  // free quota (e.g. 27 openrouter slots all 429ing at night) must NEVER consume
  // the whole attempt budget — the walk would die inside family #1 while
  // cloudflare/kilo/llm7/pollinations/ovh (independent quotas) sit alive.
  // MAX_RETRIES / MAX_NETWORK_RETRIES (owner manifest: 10) = budget PER FAMILY;
  // global sanity cap stays 24; the deadline remains the true commander.
  const perFamily = Math.max(3, Math.min(10, maxAttempts));
  const familyTried = new Map<string, number>();
  // PROACTIVE RE-INDEX (protocol §1): families are walked best-score-first —
  // a family whose 429/hard rate climbed in the last hour is demoted BEFORE
  // its attempt budget burns. Original build order breaks score ties, so a
  // fully-healthy chain walks exactly like the static doctrine chain.
  const familyOrder = familiesInBuildOrder()
    .map((f, idx) => ({ f, idx, score: familyHealth(f).score }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.f);
  const brainsByFamily = new Map<string, Brain[]>();
  for (const b of brains()) {
    const f = b.name.replace(/-\d+$/, ''); // openrouter-1/2/3 → one family
    if (!brainsByFamily.has(f)) brainsByFamily.set(f, []);
    brainsByFamily.get(f)!.push(b);
  }
  walk: for (const family of familyOrder) {
    for (const b of brainsByFamily.get(family) ?? []) {
    for (const model of b.models) {
      const id = `${b.name}/${model}`;
      if ((cooldownUntil.get(id) ?? 0) > Date.now()) continue;
      if (Date.now() >= deadline) {
        throw lastErr ?? new Error('deadline passed before any live brain');
      }
      if ((familyTried.get(family) ?? 0) >= perFamily) continue; // family quota burned → move on
      if (attempts >= 24) break walk; // global sanity cap
      await yieldToReception(isPriority, Math.min(deadline, Date.now() + 3000));
      attempts++;
      familyTried.set(family, (familyTried.get(family) ?? 0) + 1);
      const budget = deadline - Date.now();
      const t0 = Date.now();
      // degradation ladder: every 429 in this walk shrinks the ask (floor 384)
      const degrade = Math.max(384, Math.round(maxTokens * Math.pow(0.75, rateHits)));
      try {
        const text = polish(stripReasoning(await callBrain(b, model, messages, degrade, budget)));
        if (!qualityGate(text)) throw new Error('off-topic reply');
        cooldownUntil.delete(id);
        stats.lastAnsweredVia = id;
        stats.lastLatencyMs = Date.now() - t0;
        recordFamily(family, 'ok', stats.lastLatencyMs);
        return { text, brain: id, attempts, latencyMs: stats.lastLatencyMs };
      } catch (e) {
        lastErr = e;
        const status = (e as Error & { status?: number }).status;
        const msg = (e as Error).message ?? '';
        const m = msg.toLowerCase();
        // honest ops log — brain id + failure class only, never content, never keys
        console.log(`[gateway] brain failed: ${id} → ${status ?? 'network'} ${msg.slice(0, 120)}`);
        if (status === 429 || m.includes('429') || m.includes('too many')) {
          rateHits++;
          recordFamily(family, 'rate');
          // adaptive: during a live 429 storm the family's cooldowns stretch
          cool(id, Math.round(RATE_COOLDOWN_MS * adaptiveMultiplier(family)));
        } else if ((status && HARD_STATUS.has(status)) || status === 404 || status === 400 || m.includes('not available') || m.includes('unavailable') || m.includes('no endpoints')) {
          recordFamily(family, 'hard');
          cool(id, HARD_COOLDOWN_MS);
        } else if (!status) {
          // network-level death (timeout / refused / dns) — cheap fast retry,
          // still density-scaled so a net-dead family isn't hammered in a loop
          recordFamily(family, 'net');
          cool(id, Math.round(NET_COOLDOWN_MS * adaptiveMultiplier(family)));
        }
      }
    }
    }
  }
  // every env brain failed — the bundled platform SDK is the last living brain
  try {
    const t0 = Date.now();
    const text = polish(stripReasoning(await callZai(messages)));
    if (qualityGate(text)) {
      stats.lastAnsweredVia = 'z-ai';
      return { text, brain: 'z-ai', attempts, latencyMs: Date.now() - t0 };
    }
  } catch (e) {
    lastErr = e;
  }
  throw lastErr ?? new Error('NO_LLM');
}

// ---- http plumbing --------------------------------------------------------------------------
function json(res: ServerResponse, code: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 512 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

let systemPromptCache: string | undefined;
async function systemPrompt(): Promise<string> {
  if (systemPromptCache) return systemPromptCache;
  try {
    systemPromptCache = readFileSync(join(HERE, 'SOVEREIGN-PROMPT.md'), 'utf8');
  } catch {
    systemPromptCache = 'You are a sovereign autonomous agent. Your gateway was asked for a prompt file that is missing — operate with honest failover discipline.';
  }
  return systemPromptCache;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = (req.url ?? '/').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (url === '/health' || url === '/')) {
    const now = Date.now();
    const state = brains().flatMap((b) =>
      b.models.map((m) => {
        const id = `${b.name}/${m}`;
        const until = cooldownUntil.get(id) ?? 0;
        return { id, state: until > now ? 'cooling' : 'live', cooling_for_s: until > now ? Math.ceil((until - now) / 1000) : 0 };
      }),
    );
    // family priority as currently re-indexed by the proactive telemetry
    const famOrder = familiesInBuildOrder()
      .map((f, idx) => ({ f, idx, score: familyHealth(f).score }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    json(res, 200, {
      ok: true,
      service: 'sovereign-gateway',
      uptime_s: Math.round((now - stats.startedAt) / 1000),
      requests: stats.requests,
      answered: stats.answered,
      failed: stats.failed,
      compactions: stats.compactions,
      compaction_budget_chars: COMPACTION_BUDGET,
      last_answered_via: stats.lastAnsweredVia || null,
      last_latency_ms: stats.lastLatencyMs || null,
      family_priority: famOrder.map((x, i) => ({ rank: i + 1, family: x.f, score: Number(x.score.toFixed(3)) })),
      brains: state,
    });
    return;
  }

  // PROACTIVE TELEMETRY (protocol §1) — the office's own health matrix:
  // per-family rolling window stats, live priority ranks and adaptive
  // cooldown multipliers. No content, no keys — classes and counts only.
  if (req.method === 'GET' && (url === '/telemetry' || url === '/v1/telemetry')) {
    const famOrder = familiesInBuildOrder()
      .map((f, idx) => ({ f, idx, score: familyHealth(f).score }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    const families = famOrder.map(({ f, idx, score }, i) => {
      const h = familyHealth(f);
      return {
        family: f,
        build_index: idx + 1,
        priority_rank: i + 1,
        score: Number(score.toFixed(3)),
        window_minutes: Math.round(TELEMETRY_WINDOW_MS / 60_000),
        total: h.total,
        ok: h.ok,
        rate429: h.rate,
        hard: h.hard,
        net: h.net,
        avg_latency_ms: h.avgMs,
        cooldown_multiplier: Number(adaptiveMultiplier(f).toFixed(2)),
      };
    });
    json(res, 200, {
      ok: true,
      service: 'sovereign-gateway',
      telemetry: 'proactive-family-reindex-v2.2',
      window_minutes: Math.round(TELEMETRY_WINDOW_MS / 60_000),
      totals: {
        requests: stats.requests,
        answered: stats.answered,
        failed: stats.failed,
        compactions: stats.compactions,
      },
      families,
    });
    return;
  }

  if (req.method === 'GET' && url === '/v1/system-prompt') {
    json(res, 200, { prompt: await systemPrompt() });
    return;
  }

  if (req.method === 'GET' && url === '/v1/models') {
    const ids = ['auto', ...new Set(brains().flatMap((b) => b.models))];
    json(res, 200, {
      object: 'list',
      data: ids.map((id) => ({ id, object: 'model', created: Math.floor(stats.startedAt / 1000), owned_by: 'sovereign-gateway' })),
    });
    return;
  }

  if (req.method === 'POST' && (url === '/v1/chat/completions' || url === '/chat/completions')) {
    stats.requests++;
    let body: {
      model?: unknown;
      messages?: unknown;
      max_tokens?: unknown;
      stream?: unknown;
    };
    try {
      body = JSON.parse(await readBody(req)) as typeof body;
    } catch {
      json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } });
      return;
    }
    if (body.stream === true) {
      // honest limitation: the gateway answers in one complete OpenAI JSON
      json(res, 400, { error: { message: 'streaming is not supported by the sovereign gateway; use stream:false', type: 'invalid_request_error' } });
      return;
    }
    const messages = Array.isArray(body.messages)
      ? (body.messages as ChatMessage[])
          .filter((m) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
          .map((m) => ({ role: m.role, content: (m.content ?? '').slice(0, 32_000) }))
      : [];
    if (!messages.length) {
      json(res, 400, { error: { message: 'messages[] required', type: 'invalid_request_error' } });
      return;
    }
    const maxTokens = Math.max(256, Math.min(4096, Number(body.max_tokens) || 900)); // floor: reasoning models starve below 256 and ship a naked scratchpad
    // the owner's manifest knobs are honored as first-class aliases.
    // MAX_RETRIES/MAX_NETWORK_RETRIES = per-provider-family budget (see walkChain):
    const deadline = Date.now() + Math.max(5_000, Math.min(120_000, Number(process.env.AI_TIMEOUT) || Number(process.env.REQUEST_TIMEOUT) || 60_000));
    const maxAttempts = Math.max(3, Math.min(10, Number(process.env.MAX_RETRIES) || Number(process.env.MAX_NETWORK_RETRIES) || 5));
    const isPriority = (req.headers['x-reception-priority'] ?? '') === '1';

    try {
      const comp = compactMessages(messages);
      if (comp.compacted) stats.compactions++;
      const r = await walkChain(comp.messages, maxTokens, deadline, maxAttempts, isPriority);
      stats.answered++;
      stats.lastLatencyMs = r.latencyMs;
      console.log(`[gateway] served via ${r.brain} (${r.attempts} attempt(s), ${r.latencyMs}ms)`);
      json(res, 200, {
        id: `gw-${Date.now().toString(36)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: typeof body.model === 'string' ? body.model : 'auto',
        choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
          completion_tokens: Math.ceil(r.text.length / 4),
        },
        gateway: { brain: r.brain, attempts: r.attempts, latency_ms: r.latencyMs, compacted: comp.compacted, dropped_chars: comp.droppedChars },
      });
    } catch (e) {
      stats.failed++;
      // honest failure — the caller's own fallback chain takes over from here
      json(res, 502, {
        error: { message: 'sovereign gateway: every brain is saturated or cooling', type: 'gateway_exhausted', detail: (e as Error).message },
      });
    }
    return;
  }

  json(res, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    try {
      json(res, 500, { error: { message: 'gateway internal error' } });
    } catch {
      /* response already gone */
    }
  });
});

server.listen(PORT, () => {
  console.log(`[sovereign-gateway] listening on :${PORT} — OPENAI_API_BASE=http://127.0.0.1:${PORT}/v1 (any string as key)`);
  console.log(`[sovereign-gateway] brains: ${brains().map((b) => b.name).join('→') || 'NONE (keyless honest mode)'}`);
  if (process.env.DUCKAI_URL) console.log(`[sovereign-gateway] duckai bridge armed at ${process.env.DUCKAI_URL}`);
});
