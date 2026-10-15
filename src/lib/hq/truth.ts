/**
 * truth.ts — גשר האמת של המשרד התלת-ממדי (מיפוי טהור, ללא IO).
 * ---------------------------------------------------------------------------
 * החוק (אסור שיהיו זיופים): כל מה שנכנס לחדר מגיע ממקורות-אמת ציבוריים
 * שנמדדו ופורסמו על-ידי הריבונות עצמה:
 *  · FleetHQ office/state/office-state.json — הפורמן האמיתי (צוות, משימות,
 *    פיד, החלטות) כפי שנשמר בגיט על-ידי משמרות המשרד.
 *  · Domain office/data.json — דופק המשרד (verdict + בדיקות עורקים).
 *  · sovereign-beacon state.json — האמת הכלכלית (אוצרה SP, מפעיל מינימלי,
 *    ראש-שרשרת, דגל degraded).
 * כל שדה שחסר או לא-תקין נשאר ריק/לא-ידוע — לעולם לא ממולא בהמצאה.
 */
import type {
  AgentState, AgentView, Decision, FeedItem, ForemanStatus, Goal, Snapshot, Task, TaskStatus,
} from './protocol';
import { CREW_FALLBACK } from './protocol';

// ─────────────── טיפוסי מקור ───────────────
export interface ForemanRaw {
  capturedAt?: string;
  connected?: boolean;
  backend?: string;
  statusHe?: string;
  agents?: unknown[];
  tasks?: unknown[];
  books?: unknown;
  feed?: unknown[];
  decisions?: unknown[];
  lastError?: string | null;
}

export interface OfficePulseRaw {
  verdict?: string;
  generatedAt?: string;
  verdictChecks?: { name?: string; state?: string; detail?: string }[];
}

export interface BeaconRaw {
  generatedAt?: string;
  lastPulse?: {
    at?: string;
    treasuryNetSp?: number;
    minOperatorSp?: number;
    steemHead?: number;
    degraded?: boolean;
    degradedWhy?: string[];
  };
}

/** המצב המצטבר שמוזרם לחנות לתצוגה כנה */
export interface TruthInfo {
  fetchedAt: number;
  foremanCapturedAt: number | null;
  foremanOk: boolean;
  pulseVerdict: string | null;
  pulseAt: string | null;
  treasuryNetSp: number | null;
  minOperatorSp: number | null;
  steemHead: number | null;
  arteriesFresh: number | null;
  arteriesTotal: number | null;
  errors: string[];
}

export const EMPTY_TRUTH: TruthInfo = {
  fetchedAt: 0,
  foremanCapturedAt: null,
  foremanOk: false,
  pulseVerdict: null,
  pulseAt: null,
  treasuryNetSp: null,
  minOperatorSp: null,
  steemHead: null,
  arteriesFresh: null,
  arteriesTotal: null,
  errors: [],
};

// ─────────────── מנועי היגיון ───────────────
const AGENT_STATES: AgentState[] = [
  'idle', 'thinking', 'reading', 'checking', 'writing',
  'walking', 'waiting_user', 'blocked', 'done', 'error',
];
const STATIONS = ['desk', 'wall', 'podium', 'library', 'offstage', 'coffee'] as const;
const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done', 'blocked', 'cancelled'];
const CREW_IDS = new Set(CREW_FALLBACK.map((c) => c.id));

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ts(v: unknown): number | null {
  const n = num(v);
  if (n !== null && n > 1_000_000_000_000) return n;
  if (typeof v === 'string') {
    const p = Date.parse(v);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

/** מיפוי סוכנים — רק מזהים של הצוות האמיתי; שדה לא-תקין = ערך כנה ברירת-מחדל */
function mapAgents(raw: unknown): AgentView[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentView[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    if (!CREW_IDS.has(id)) continue;
    const state = AGENT_STATES.includes(o.state as AgentState) ? (o.state as AgentState) : 'idle';
    const station = STATIONS.includes(o.station as (typeof STATIONS)[number])
      ? (o.station as AgentView['station']) : 'desk';
    out.push({
      id,
      state,
      activity: typeof o.activity === 'string' ? o.activity.slice(0, 80) : '',
      station,
      since: ts(o.since) ?? Date.now(),
      ...(typeof o.taskId === 'string' ? { taskId: o.taskId } : {}),
    });
  }
  return out;
}

/** מיפוי משימות — הקיר מציג עד 16 החלטות-אמת אחרונות (doing/review/todo קודם) */
function mapTasks(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  const mapped: Task[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const title = typeof o.title === 'string' ? o.title.slice(0, 90) : '';
    if (!id || !title) continue;
    const status = TASK_STATUSES.includes(o.status as TaskStatus) ? (o.status as TaskStatus) : 'todo';
    const assignee = typeof o.assignee === 'string' && CREW_IDS.has(o.assignee) ? o.assignee : undefined;
    const createdAt = ts(o.createdAt) ?? 0;
    const updatedAt = ts(o.updatedAt) ?? createdAt;
    mapped.push({
      id,
      title,
      status,
      ...(assignee ? { assignee } : {}),
      dependsOn: [],
      createdBy: typeof o.createdBy === 'string' && CREW_IDS.has(o.createdBy) ? o.createdBy : 'aluf',
      createdAt,
      updatedAt,
      ...(typeof o.summary === 'string' ? { summary: o.summary.slice(0, 140) } : {}),
    });
  }
  const rank: Record<TaskStatus, number> = { doing: 0, review: 1, todo: 2, blocked: 3, done: 4, cancelled: 5 };
  return mapped
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (b.updatedAt - a.updatedAt))
    .slice(0, 16);
}

function mapDecisions(raw: unknown): Decision[] {
  if (!Array.isArray(raw)) return [];
  const out: Decision[] = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    if (typeof o.id !== 'string') continue;
    out.push({
      id: o.id,
      agentId: typeof o.agentId === 'string' ? o.agentId : 'aluf',
      kind: o.kind === 'permission' ? 'permission' : 'question',
      question: typeof o.question === 'string' ? o.question.slice(0, 120) : '',
      options: [],
      status: o.status === 'answered' ? 'answered' : 'open',
      createdAt: ts(o.createdAt) ?? Date.now(),
    });
  }
  return out.slice(0, 8);
}

function mapFeed(raw: unknown): FeedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const f = raw[i];
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const kind = typeof o.kind === 'string' ? o.kind : '';
    const text = typeof o.text === 'string' ? o.text.slice(0, 120) : '';
    if (!text) continue;
    out.push({ id: `f${i}`, ts: ts(o.at) ?? Date.now(), kind: 'message', text, agentId: kind.startsWith('bubble:') ? kind.slice(7) : undefined });
  }
  return out;
}

/** הרכבת Snapshot מלא מהמקורות — אין ברירת-מחדל שנראית כמו עבודה */
export function buildSnapshot(foreman: ForemanRaw | null, pulse: OfficePulseRaw | null, beacon: BeaconRaw | null): Snapshot {
  const captured = ts(foreman?.capturedAt) ?? Date.now();
  const doneCount = Array.isArray(foreman?.tasks)
    ? (foreman!.tasks as Record<string, unknown>[]).filter((t) => t && (t as Record<string, unknown>).status === 'done').length
    : 0;

  const status: ForemanStatus = {
    backend: foreman?.backend === 'live' ? 'live' : 'sim',
    llmProvider: 'office-foreman · זיכרון-גיט',
    message: {
      he: typeof foreman?.statusHe === 'string' && foreman.statusHe
        ? foreman.statusHe
        : (foreman ? 'מצב הפורמן לא דווח' : 'מקור הפורמן לא זמין'),
      en: foreman ? 'Foreman state from git memory' : 'Foreman source unavailable',
    },
    startedAt: captured,
    opsDone: doneCount,
  };

  const agents = mapAgents(foreman?.agents);
  const crew = CREW_FALLBACK;

  let goal: Goal | undefined;
  if (pulse || beacon) {
    const checks = pulse?.verdictChecks ?? [];
    const fresh = checks.filter((c) => c?.state === 'fresh').length;
    const treasury = beacon?.lastPulse?.treasuryNetSp;
    const verdict = pulse?.verdict ?? null;
    const parts: string[] = [];
    if (typeof treasury === 'number') parts.push(`אוצרה ${treasury.toLocaleString('he-IL', { maximumFractionDigits: 1 })} SP`);
    if (verdict) parts.push(`דופק ${verdict}`);
    if (checks.length) parts.push(`${fresh}/${checks.length} עורקים טריים`);
    goal = {
      id: 'pulse',
      text: parts.length ? `ריבונות חיה · ${parts.join(' · ')}` : 'ריבונות חיה',
      status: verdict === 'ALIVE' ? 'active' : 'review',
      progress: checks.length ? Math.round((fresh / checks.length) * 100) : 0,
      createdAt: captured,
      updatedAt: captured,
    };
  }

  return {
    v: 1,
    status,
    crew,
    agents,
    logs: {},
    tasks: mapTasks(foreman?.tasks),
    decisions: mapDecisions(foreman?.decisions),
    reports: [],
    feed: mapFeed(foreman?.feed),
    books: [],
    ...(goal ? { goal } : {}),
  };
}

/** מידע-אמת מצטבר לתצוגה כנה (צ'יפ המקור בחדר) */
export function buildTruth(foreman: ForemanRaw | null, pulse: OfficePulseRaw | null, beacon: BeaconRaw | null, errors: string[]): TruthInfo {
  return {
    fetchedAt: Date.now(),
    foremanCapturedAt: ts(foreman?.capturedAt),
    foremanOk: !!foreman,
    pulseVerdict: pulse?.verdict ?? null,
    pulseAt: pulse?.generatedAt ?? beacon?.lastPulse?.at ?? null,
    treasuryNetSp: num(beacon?.lastPulse?.treasuryNetSp),
    minOperatorSp: num(beacon?.lastPulse?.minOperatorSp),
    steemHead: num(beacon?.lastPulse?.steemHead),
    arteriesTotal: Array.isArray(pulse?.verdictChecks) ? pulse!.verdictChecks!.length : null,
    arteriesFresh: Array.isArray(pulse?.verdictChecks)
      ? pulse!.verdictChecks!.filter((c) => c?.state === 'fresh').length
      : null,
    errors,
  };
}
