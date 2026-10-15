// Ops Slate — the ONE status legend (DESIGN.md §2).
// Every surface that shows state — agents, tasks, goals, feed, health —
// must read its colors from here. No ad-hoc palettes in components.

import type { AgentState, GoalStatus, TaskStatus } from '@/components/agent-hq/types';

export type Semantic = 'working' | 'ok' | 'attention' | 'danger' | 'neutral' | 'info';

/** CSS custom properties defined in globals.css — single source of color truth. */
export const SEMANTIC_VAR: Record<Semantic, string> = {
  working: 'var(--st-working)',
  ok: 'var(--st-ok)',
  attention: 'var(--st-attention)',
  danger: 'var(--st-danger)',
  neutral: 'var(--st-neutral)',
  info: 'var(--st-info)',
};

export const SEMANTIC_TEXT: Record<Semantic, string> = {
  working: 'text-[color:var(--st-working)]',
  ok: 'text-[color:var(--st-ok)]',
  attention: 'text-[color:var(--st-attention)]',
  danger: 'text-[color:var(--st-danger)]',
  neutral: 'text-[color:var(--st-neutral)]',
  info: 'text-[color:var(--st-info)]',
};

/** agent state → semantic (10 real states, one law) */
export const AGENT_SEMANTIC: Record<AgentState, Semantic> = {
  idle: 'neutral',
  thinking: 'working',
  reading: 'working',
  checking: 'working',
  writing: 'working',
  walking: 'neutral',
  waiting_user: 'attention',
  blocked: 'danger',
  done: 'ok',
  error: 'danger',
};

/** task status → semantic */
export const TASK_SEMANTIC: Record<TaskStatus, Semantic> = {
  todo: 'neutral',
  doing: 'working',
  review: 'attention',
  done: 'ok',
  blocked: 'danger',
  cancelled: 'neutral',
};

/** goal status → semantic */
export const GOAL_SEMANTIC: Record<GoalStatus, Semantic> = {
  planning: 'info',
  active: 'working',
  review: 'attention',
  done: 'ok',
  failed: 'danger',
};

/** feed kinds → semantic (for the journal badges) */
export const FEED_KIND_SEMANTIC: Record<string, Semantic> = {
  goal: 'info',
  plan: 'info',
  task: 'neutral',
  message: 'working',
  decision: 'ok',
  report: 'ok',
  git: 'ok',
  system: 'neutral',
  error: 'danger',
  user: 'working',
};

/** StackHealth tone → semantic */
export const HEALTH_TONE_SEMANTIC: Record<'ok' | 'warn' | 'bad', Semantic> = {
  ok: 'ok',
  warn: 'attention',
  bad: 'danger',
};

export function semanticVar(s: Semantic): string {
  return SEMANTIC_VAR[s];
}

/** Back-compat: legacy STATE_COLORS consumers (Office scene) resolve through the law. */
export function agentSemantic(state: AgentState): Semantic {
  return AGENT_SEMANTIC[state] ?? 'neutral';
}
