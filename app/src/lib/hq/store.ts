/**
 * store.ts — גשר המצב של המשרד התלת-ממדי (zustand bridge).
 * ---------------------------------------------------------------------------
 * החוק (מעודכן, משימת 11-a): החדר מציג מציאות נמדדת בלבד, באחד משלושה מסלולים
 * מפורסמים-בשלט — ולעולם לא המצאה:
 * · חי — AgentHQ (הממשק האמיתי) מחזיק את החיבור היחיד לפורמן (:3010) ומזרים
 *   לכאן כל אירוע אמיתי בזמן אמת (סנאפשוט, סוכן, לוג, משימה, החלטה, דוח, פיד,
 *   יעד, ספרים, גיט, בועת דיבור). שלט-החדר: "חי".
 * · מראה — כשאין פורמן (פריסת-חלון/בייק), הגשר (lib/hq/feed.ts) טוען את
 *   יומן-הפורמן האמיתי שהועתק ל-receipts/office-state-mirror.json ומזרים אותו
 *   דרך אותן-הדרכים בדיוק (אותן פונקציות sync). החדר מציג את המציאות
 *   הנמדדת של המשרד קפואה ב-{savedAt} — לא סימולציה. שלט-החדר:
 *   "מראה — מציאות נמדדה מ-{savedAt}".
 * · הדגמה — מצב סים מפורש בלבד (backend='sim') עם סימן-מים DEMO. אין מסלול
 *   שלישי: מה שלא נמדד — לא מוצג.
 *
 * קליקים בחדר חוזרים אל AgentHQ דרך bindUi: בחירת סוכן, פתיחת לוח/פודיום/
 * ספרייה/גיט, קבלה — הפאנלים האמיתיים, לא עותקים.
 */
'use client';

import { create } from 'zustand';
import type {
  AgentView, BookView, CrewMember, Decision, FeedItem, ForemanStatus,
  GitPulse, Goal, LogEntry, Report, Snapshot, Task,
} from './protocol';
import { CREW_FALLBACK } from './protocol';
import { createBrains, type AgentBrain } from './world';
import type { TruthInfo } from './truth';

export type Lang = 'he' | 'en';

/** מסלול-הזנת החדר (Task 11-a): 'live' = סוקט הפורמן · 'mirror' = יומן אמיתי
 *  מועתק (office-state-mirror.json). הדגמה איננה מסלול-הזנה — היא סימון-מים. */
export type FeedMode = 'live' | 'mirror';

/** מדדי-יומן אמיתיים שאין להם view בפרוטוקול — מוצגים כנאים ב-HUD בלבד.
 *  אין כאן המצאה: כל שדה הגיע מהיומן עצמו או הוא null. */
export interface FeedJournal {
  nextId: number | null;
  /** סכום ניסיונות-הרצה מצטבר לפי-משימה (taskAttempts) */
  attemptsTotal: number | null;
  /** משימות שראש-המטה חילץ והחזיר לתור (rescued) */
  rescuedCount: number | null;
  /** סכום עידוני-הביקורת (reviewAttempts) */
  reviewRoundsTotal: number | null;
}

/** הפאנלים שהחדר יכול לבקש מ-AgentHQ (הפאנלים האמיתיים של הממשק) */
export type PanelRequest =
  | { kind: 'agent'; agentId: string }
  | { kind: 'tab'; tab: 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git' }
  | { kind: 'chat' };

/** AgentHQ מחבר את הפונקציות האמיתיות שלו לכאן */
export interface UiBindings {
  selectAgent?: (id: string) => void;
  openTab?: (tab: 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git') => void;
  openChat?: () => void;
  setLang?: (l: Lang) => void;
}

interface HqBridgeState {
  /** תמיד true — החדר ניזון ישירות מהמצב האמיתי של AgentHQ */
  booted: boolean;
  lang: Lang;
  /** מראה את מצב החיבור האמיתי של AgentHQ (לתצוגה בלבד — אין כאן חיבור) */
  connected: boolean;
  /** מסלול-ההזנה הפעיל (live=סוקט · mirror=יומן אמיתי) — נקבע בהרכבה לפי
   *  NEXT_PUBLIC_OFFICE_FEED ונשאר כנה: בלי יומן נטען אין שלט-מראה. */
  feedMode: FeedMode;
  /** יומן-המראה נטען בהצלחה לפחות פעם אחת */
  feedReady: boolean;
  /** חותמת savedAt של היומן המוצג (מציאות נמדדה קפואה בזמן הזה) */
  feedSavedAt: number | null;
  /** שגיאת-הזנה אחרונה — מוצגת כשגיאה, לעולם לא מוסתרת */
  feedError: string | null;
  /** מדדי-יומן אמיתיים ללא view בפרוטוקול (null = לא נמדד) */
  feedJournal: FeedJournal | null;
  /** חותמת-הזמן של אירוע אמיתי אחרון שהגיע מהפורמן (חוק-הטריות של החדר) */
  lastSignalAt: number | null;
  /** החדר הרכיב פריים אמיתי ראשון (נמדד מהרנדרר — לא הנחה) */
  roomReady: boolean;
  /** כשל רינדור קטלני בסצנה (נכס/מודל שנפל) — מצב כשל כנה במקום קנבס שחור */
  sceneFailed: boolean;
  snap: Snapshot;
  brains: Map<string, AgentBrain>;
  ui: UiBindings;
  toasts: { id: number; text: string }[];
  /** גשר-האמת: מקורות הנתונים האמיתיים + טריותם (לצ'יפ הכנות בחדר) */
  truth: TruthInfo | null;

  bindUi(ui: UiBindings): void;
  setLang(l: Lang): void;
  setPanel(panel: string, agentId?: string): void;
  toast(text: string): void;
  setRoomReady(ready: boolean): void;
  setSceneFailed(failed: boolean): void;
  noteSignal(): void;

  // ---- הזרמת מציאות (AgentHQ קורא אליהן מתוך מטפלי הסוקט שלו) ----
  syncSnapshot(snap: Snapshot): void;
  syncAgent(a: AgentView): void;
  syncLog(agentId: string, entry: LogEntry): void;
  syncTask(t: Task): void;
  syncDecision(d: Decision): void;
  syncReport(r: Report): void;
  syncFeed(f: FeedItem): void;
  syncGoal(g: Goal): void;
  syncBooks(books: BookView[]): void;
  syncStatus(status: ForemanStatus): void;
  syncGit(git: GitPulse): void;
  setTruth(t: TruthInfo): void;
  syncConnected(connected: boolean): void;
  /** עדכון מצב-הזנת המראה (Task 11-a) — כנות-מלאה: ready/error/savedAt */
  setFeedMeta(m: { mode?: FeedMode; ready?: boolean; savedAt?: number | null; error?: string | null; journal?: FeedJournal | null }): void;
  /** בועת דיבור אמיתית מהפורמן — נכנסת כלוג 'say' כדי שהדמות תדבר בחדר */
  syncBubble(agentId: string, text: string): void;
}

const EMPTY: Snapshot = {
  v: 1,
  status: { backend: 'live', llmProvider: '…', message: { he: 'מתחבר…', en: 'Connecting…' }, startedAt: Date.now(), opsDone: 0 },
  crew: CREW_FALLBACK,
  agents: CREW_FALLBACK.map((c) => ({ id: c.id, state: 'idle' as const, activity: '', station: 'desk' as const, since: Date.now() })),
  logs: {},
  tasks: [],
  decisions: [],
  reports: [],
  feed: [],
  books: [],
};

let toastSeq = 0;

function syncBrains(brains: Map<string, AgentBrain>, agents: AgentView[]) {
  for (const a of agents) brains.get(a.id)?.syncState(a.state, a.station, a.activity);
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

export const useHq = create<HqBridgeState>((set, get) => ({
  booted: true,
  lang: 'he',
  connected: false,
  feedMode: 'live',
  feedReady: false,
  feedSavedAt: null,
  feedError: null,
  feedJournal: null,
  lastSignalAt: null,
  roomReady: false,
  sceneFailed: false,
  snap: EMPTY,
  brains: createBrains(),
  ui: {},
  toasts: [],
  truth: null,

  bindUi(ui) { set({ ui }); },

  setRoomReady(ready) { set({ roomReady: ready }); },

  setSceneFailed(failed) { set({ sceneFailed: failed }); },

  /** כל אירוע אמיתי מהפורמן מעדכן את חותמת-הטריות — החדר מפסיק להראות
   *  פרודוקטיביות כשהאמת ישנה (חוק ה-Task 46: הנפשה ≠ פעילות) */
  noteSignal() { set({ lastSignalAt: Date.now() }); },

  setLang(l) {
    set({ lang: l });
    get().ui.setLang?.(l); // השפה אחת לכל הממשק — הכיוון מתהפך במקום אחד
  },

  /** קליק בחדר → הפאנל האמיתי של AgentHQ */
  setPanel(panel, agentId) {
    const ui = get().ui;
    if (panel === 'agent' && agentId) ui.selectAgent?.(agentId);
    else if (panel === 'reception') ui.openChat?.();
    else if (panel === 'wall') ui.openTab?.('wall');
    else if (panel === 'podium') ui.openTab?.('podium');
    else if (panel === 'library') ui.openTab?.('library');
    else if (panel === 'git') ui.openTab?.('git');
    else if (panel === 'flame' || panel === 'lead') ui.openTab?.('fleet');
  },

  toast(text) {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-3), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3400);
  },

  // ---- הזרמת מציאות ----
  syncSnapshot(snap) {
    const crew: CrewMember[] = snap.crew?.length ? snap.crew : CREW_FALLBACK;
    const agents: AgentView[] = snap.agents?.length
      ? snap.agents
      : crew.map((c) => ({ id: c.id, state: 'idle' as const, activity: '', station: 'desk' as const, since: Date.now() }));
    const next: Snapshot = { ...snap, crew, agents };
    set({ snap: next, lastSignalAt: Date.now() });
    syncBrains(get().brains, agents);
  },
  syncAgent(a) {
    const st = get();
    const agents = upsert(st.snap.agents, a);
    set({ snap: { ...st.snap, agents }, lastSignalAt: Date.now() });
    syncBrains(st.brains, [a]);
  },
  syncLog(agentId, entry) {
    const st = get();
    const logs = { ...st.snap.logs, [agentId]: [...(st.snap.logs[agentId] || []).slice(-40), entry] };
    set({ snap: { ...st.snap, logs }, lastSignalAt: Date.now() });
  },
  syncTask(t) {
    const st = get();
    set({ snap: { ...st.snap, tasks: upsert(st.snap.tasks, t) }, lastSignalAt: Date.now() });
    if (t.status === 'done' && t.assignee) st.toast('✓ ' + t.title);
  },
  syncDecision(d) {
    const st = get();
    set({ snap: { ...st.snap, decisions: upsert(st.snap.decisions, d) }, lastSignalAt: Date.now() });
  },
  syncReport(r) {
    const st = get();
    set({ snap: { ...st.snap, reports: [r, ...st.snap.reports].slice(0, 30) }, lastSignalAt: Date.now() });
  },
  syncFeed(f) {
    const st = get();
    set({ snap: { ...st.snap, feed: [...st.snap.feed.slice(-160), f] }, lastSignalAt: Date.now() });
  },
  syncGoal(g) {
    set({ snap: { ...get().snap, goal: g }, lastSignalAt: Date.now() });
  },
  syncBooks(books) {
    set({ snap: { ...get().snap, books }, lastSignalAt: Date.now() });
  },
  syncStatus(status) {
    set({ snap: { ...get().snap, status }, lastSignalAt: Date.now() });
  },
  syncGit(git) {
    set({ snap: { ...get().snap, git }, lastSignalAt: Date.now() });
  },
  setTruth(t) {
    set({ truth: t });
  },
  syncConnected(connected) {
    set({ connected });
  },
  setFeedMeta(m) {
    set({
      ...(m.mode !== undefined ? { feedMode: m.mode } : {}),
      ...(m.ready !== undefined ? { feedReady: m.ready } : {}),
      ...(m.savedAt !== undefined ? { feedSavedAt: m.savedAt } : {}),
      ...(m.error !== undefined ? { feedError: m.error } : {}),
      ...(m.journal !== undefined ? { feedJournal: m.journal } : {}),
    });
  },
  syncBubble(agentId, text) {
    if (!text) return;
    get().syncLog(agentId, { ts: Date.now(), kind: 'say', text });
  },
}));
