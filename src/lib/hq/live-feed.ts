/**
 * live-feed.ts — החיבור החי של המשרד לשידור-העולם (office-live :3036 · גל-80).
 * ---------------------------------------------------------------------------
 * עד-היום החדר ניזון רק מסקר-45-שניות של /api/office-state — והשידור החי ב-4Hz
 * של office-live היה יתום (אף-צרכן). זה הצרכן האמיתי: socket.io → חנות-החדר.
 *
 * כנות: כל-פריים מהעולם-המתמשך האמיתי (מנוע engine.mjs קנוני ב-Domain/office).
 * ניתוק = "מנותק" בכנות; אין-סימולציה מקומית. סקר-האמת (45ש׳) ממשיך לרוץ-במקביל.
 *
 * פרוטוקול (mini-services/office-live/index.ts):
 *   ← 'hello'  ack {ok,t,v}
 *   → 'world'  תמונת-מצב מלאה {t, phase, ag[], ev[]}
 *   → 'tick'   פריים-4Hz {t, phase, ag[], ev[]}
 */
'use client';

import { io, type Socket } from 'socket.io-client';
import { useHq } from './store';
import type { AgentState, AgentView, Station } from '@/components/agent-hq/types';

/** פריים-עולם מהמתאים של office-live (worldFrame) */
interface WorldFrame {
  t: number;
  phase: string;
  ag: { id: string; x: number; z: number; face: number; moving: 0 | 1; state: string; typing: 0 | 1; carry: 0 | 1; label: string; activity: string }[];
  ev: { ts: number; who: string; text: string }[];
}

const seenEvents = new Set<string>();

function mapState(a: WorldFrame['ag'][number]): AgentState {
  if (a.moving) return 'walking';
  if (a.state === 'board') return 'writing';
  if (a.typing) return 'writing';
  if (a.state === 'coffee') return 'reading';
  if (a.state === 'library') return 'reading';
  return 'idle';
}

function mapStation(a: WorldFrame['ag'][number]): Station {
  if (a.state === 'board') return 'wall';
  if (a.state === 'coffee') return 'coffee';
  if (a.state === 'library') return 'library';
  if (a.moving) return 'offstage';
  return 'desk';
}

function ingestFrame(f: WorldFrame, full: boolean): void {
  const store = useHq.getState();
  if (!f || !Array.isArray(f.ag)) return;
  // גל-81: אצווה-לפריים — פריים אחד = עדכון-store אחד (לא 6 עדכונים לסוכן ב-4Hz = 24 רינדורים/שנייה ששחקו את ה-thread עד קיפאון)
  const views: AgentView[] = [];
  for (const a of f.ag) {
    views.push({
      id: a.id,
      state: mapState(a),
      activity: a.activity || a.label || '',
      station: mapStation(a),
      since: f.t,
    });
  }
  store.syncAgents(views);
  for (const e of f.ev ?? []) {
    const key = `${e.ts}|${e.who}|${e.text}`;
    if (seenEvents.has(key)) continue;
    seenEvents.add(key);
    if (seenEvents.size > 400) {
      // גישור-זיכרון כנה: מנקים-חצי — הסינון-שומר-על-אירועים-חדשים
      let i = 0;
      for (const k of seenEvents) {
        if (i++ > 200) break;
        seenEvents.delete(k);
      }
    }
    useHq.getState().syncFeed({
      id: key,
      ts: e.ts,
      kind: 'message',
      text: e.text,
      agentId: e.who !== 'grid' && e.who !== 'aluf' ? e.who : e.who === 'aluf' ? 'aluf' : undefined,
    });
  }
  if (full) useHq.getState().noteSignal();
}

let socket: Socket | null = null;

export function startOfficeLiveFeed(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (socket) return () => socket?.close();

  // חוק-השער: נתיב '/' תמיד, הפורט-רק-ב-XTransformPort (Caddy מתווך)
  socket = io('/?XTransformPort=3036', { path: '/', transports: ['websocket', 'polling'], reconnectionDelay: 3000 });

  socket.on('connect', () => {
    socket?.emit('hello', () => {
      useHq.getState().syncConnected(true);
      useHq.getState().noteSignal();
    });
  });

  socket.on('world', (f: WorldFrame) => ingestFrame(f, true));
  socket.on('tick', (f: WorldFrame) => ingestFrame(f, false));

  socket.on('disconnect', () => {
    useHq.getState().syncConnected(false);
  });
  socket.on('connect_error', () => {
    useHq.getState().syncConnected(false);
  });

  return () => {
    socket?.close();
    socket = null;
    useHq.getState().syncConnected(false);
  };
}
