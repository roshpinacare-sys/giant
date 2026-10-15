// Client-side mirror of the Fleet HQ wire protocol.
export type AgentState =
  | 'idle' | 'thinking' | 'reading' | 'checking' | 'writing'
  | 'walking' | 'waiting_user' | 'blocked' | 'done' | 'error';

/** Task 52: 'coffee' — תחנת הפסקה אמיתית (בר הקפה): הפסקה מתויגת-כנה,
 *  לעולם לא מוצגת כעבודה (חוק-הכנות). */
export type Station = 'desk' | 'wall' | 'podium' | 'library' | 'offstage' | 'coffee';

export interface CrewMember {
  id: string;
  name: { he: string; en: string };
  title: { he: string; en: string };
  color: string;
  specialty: { he: string; en: string };
  books: string[];
  role: 'lead' | 'worker';
}

export interface AgentView {
  id: string;
  state: AgentState;
  activity: string;
  station: Station;
  taskId?: string;
  since: number;
}

export interface LogEntry {
  ts: number;
  kind: 'text' | 'tool' | 'result' | 'error' | 'report' | 'say';
  text: string;
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'blocked' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string;
  dependsOn: string[];
  summary?: string;
  /** Why this worker — the LLM's one-line fit reasoning (shown on the wall card). */
  why?: string;
  /** Who did the matching: the model (llm) or the deterministic specialty fit (fit). */
  matchBy?: 'llm' | 'fit';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Task 52 — measured duration: when real execution started, and how long it ran */
  startedAt?: number;
  durationMs?: number;
}

export interface Decision {
  id: string;
  agentId: string;
  kind: 'question' | 'permission';
  question: string;
  options: string[];
  context?: string;
  status: 'open' | 'answered';
  answer?: { option?: string; text?: string; ts: number };
  taskId?: string;
  createdAt: number;
}

export interface Report {
  id: string;
  title: string;
  body: string;
  author: string;
  ts: number;
}

export type FeedKind = 'goal' | 'plan' | 'task' | 'message' | 'decision' | 'report' | 'system' | 'error' | 'user' | 'git';

export interface FeedItem {
  id: string;
  ts: number;
  kind: FeedKind;
  text: string;
  agentId?: string;
}

export type GoalStatus = 'planning' | 'active' | 'review' | 'done' | 'failed';

export interface Goal {
  id: string;
  text: string;
  status: GoalStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  origin?: 'commander' | 'patrol';
}

export interface BookView {
  id: string;
  file: string;
  title: { he: string; en: string };
  category: { he: string; en: string };
  bytes: number;
  heartbeat?: number;
  ageHours?: number;
  ok?: boolean;
  verdict?: string;
  owner?: string;
}

export interface ForemanStatus {
  /** 'live' = the real foreman streams over the socket (חי).
   *  'mirror' = the room renders the foreman's REAL journal snapshot
   *  (office-state-mirror.json) frozen at its savedAt — measured reality,
   *  never synthetic (מראה — מציאות נמדדה).
   *  'static' = exec-14-3d static bundle — public digest feed, zero backend
   *  (מדיג'סט פומבי; כל מה שלא נמדד מוצג '—' — כנות).
   *  'sim' = explicit demo mode only — DEMO watermark is mandatory (חוק-הכנות). */
  backend: 'live' | 'sim' | 'mirror' | 'static';
  llmProvider: string;
  message: { he: string; en: string };
  startedAt: number;
  opsDone: number;
  /** Optional foreman extras — rendered only when present, never required. */
  economy?: Record<string, number>;
  memory?: { shifts: number; lessons: number };
}

export interface CommitView {
  hash: string;
  subject: string;
  author: string;
  ts: number;
  repo: string;
  branch?: string;
}

export interface GitPulse {
  available: boolean;
  repoUrl?: string;
  repoLabel?: string;
  branch?: string;
  commits: CommitView[];
  lastFetch: number;
  /** When the learning/analysis wire last measured these repos (gitlearn.ts ts).
   *  Optional — absent means "analysis freshness not measured yet", never faked. */
  learnedAt?: number;
  /** The truthful per-repo sync/health inventory (foreman gitfleet wire, read-only).
   *  Optional for backward compatibility — absent means "not known yet", never green. */
  fleet?: RepoFleetView[];
  /** R57 — ספרי-הצי האמיתיים מ-Domain/agents/office-live.json (books.list).
   *  זהו מקור-האמת של קיר-הגיט בחדר: טריות נמדדת פר-ספר (ageHours/fresh/empty).
   *  חסר = לא נמדד — הקיר יראה ריקות-כנה, לעולם לא 0/ירוק מומצא. */
  books?: { name: string; ageHours: number | null; fresh: boolean; empty: boolean }[];
}

export type RepoSyncState =
  | 'up-to-date'
  | 'behind'
  | 'ahead'
  | 'diverged'
  | 'dirty'
  | 'unreachable'
  | 'unknown';

export interface RepoFleetView {
  label: string;
  dir: string; // ok to expose — the learning wire already exposes it
  branch: string;
  available: boolean;
  head: string; // short sha, 7 chars; '' when the repo is unreachable
  upstreamConfigured: boolean;
  ahead: number | null; // null = not measured (never fake 0)
  behind: number | null; // null = not measured (never fake 0)
  diverged: boolean | null;
  dirtyCount: number | null; // null = not measured
  lastFetchAt: number | null; // epoch ms — .git/FETCH_HEAD mtime when present
  lastSyncError: string | null; // sanitized — never a URL, never a secret
  syncState: RepoSyncState;
  /** exec-14-3d — measured CI pulse of the repo's last run (office digest wire
   *  carries it; the foreman wire may omit it). Optional — absent means
   *  "not measured", the wall renders '—', never a fake state. */
  lastRunStatus?: string | null;
  lastRunConclusion?: string | null;
  /** Measured 7-day commit count (capped feeds render "100+"). null = not measured. */
  commits7d?: number | null;
  /** True when the 7-day count hit the wire's measurement cap ("100+" = honest cap, not a guess). */
  commits7dCapped?: boolean | null;
}

export interface SearchCapabilityView {
  search: boolean; // at least one Tavily lane configured
  reader: boolean; // Jina reader lane configured
  searchLanes: number; // how many Tavily keys are live in env
  calls: number; // measured lifetime calls across lanes
  successes: number; // measured lifetime successes
}

export interface Snapshot {
  v: 1;
  status: ForemanStatus;
  crew: CrewMember[];
  agents: AgentView[];
  logs: Record<string, LogEntry[]>;
  tasks: Task[];
  decisions: Decision[];
  reports: Report[];
  feed: FeedItem[];
  goal?: Goal;
  books: BookView[];
  git?: GitPulse;
  search?: SearchCapabilityView;
}

/* Status palette — the reference's color law, no blue/gold anywhere:
   idle=zinc · thinking=fuchsia · reading=amber · checking=emerald ·
   writing=violet · error/blocked=rose · done=emerald. */
export const STATE_COLORS: Record<AgentState, string> = {
  idle: '#71717a',      // zinc-500
  thinking: '#d946ef',  // fuchsia-500
  reading: '#fbbf24',   // amber-400
  checking: '#34d399',  // emerald-400
  writing: '#a78bfa',   // violet-400
  walking: '#a1a1aa',   // zinc-400
  waiting_user: '#fbbf24', // amber-400 — המתנה לאישור = כוונת-תשומת, לא כשל
  blocked: '#fb7185',   // rose-400
  done: '#34d399',      // emerald-400
  error: '#fb7185',     // rose-400
};
