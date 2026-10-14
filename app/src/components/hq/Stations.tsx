/**
 * Stations.tsx — תחנות המשרד החיות:
 * שולחנות צוות עם צגים חיים ושלטי שם · שולחן ראש-המטה · לוח המשימות הפיזי ·
 * דוכן ההחלטות עם טבעת הולוגרמה · הספרייה · קיר הגיט · הקבלה · להבת הריבונות ·
 * בר קפה · נברשות · ניאון.
 * כל תחנה לחיצה — מיקוד מצלמה + פאנל HUD (דרך bus + store).
 */
'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DESKS, LEAD_TABLE, TASK_WALL, GIT_WALL, PODIUM, LIBRARY_TABLE, RECEPTION, FLAME, COFFEE,
  NEON_SIGNS, PENDANTS, SHELVES, TASK_WALL_Y, TASK_WALL_DEPTH,
  to3, WALL_H, SCALE, PLAN_H, WALL_T,
} from '@/lib/hq/contract';
import {
  makeWoodTexture, makeBrushedMetalTexture, makeMarbleTexture, makeFabricTexture,
  makeMonitorScreen, makeNameplate, makeTaskWallTexture,
  makeDecisionPodiumPlate, makeReceptionScreen, makeSignTexture,
} from '@/lib/hq/textures';
import { useHq } from '@/lib/hq/store';
import { bus } from '@/lib/hq/world';
import { STATE_COLORS, STATE_HE, TASK_COL, type AgentState } from '@/lib/hq/protocol';
import { GitWallSync, gitBoard } from './GitWallData';
import { useOfficeMaterials, type OfficeMats } from './Architecture';
import { DeskSet, CoffeeLife } from './Realism';

// ─────────────── חנויות מסך (מופע יחיד לכל סוכן/לוח) ───────────────
type Monitor = ReturnType<typeof makeMonitorScreen>;
type Nameplate = ReturnType<typeof makeNameplate>;

const monitors = new Map<string, Monitor>();
const nameplates = new Map<string, Nameplate>();
let taskWallTex: ReturnType<typeof makeTaskWallTexture> | null = null;
let receptionTex: ReturnType<typeof makeReceptionScreen> | null = null;

function monitorOf(id: string, name: string, color: string): Monitor {
  let m = monitors.get(id);
  if (!m) { m = makeMonitorScreen(name, color); monitors.set(id, m); }
  return m;
}
function nameplateOf(id: string, name: string, title: string, color: string): Nameplate {
  let n = nameplates.get(id);
  if (!n) { n = makeNameplate(name, title, color); nameplates.set(id, n); }
  return n;
}

/** מסנכרן נתוני חנות → טקסטורות מסך, בקצב מסונן */
export function StationSync() {
  const lastLogs = useRef<Record<string, string>>({});
  useFrame(({ clock }) => {
    const now = clock.getElapsedTime() * 1000;
    const st = useHq.getState();
    const crew = st.snap.crew;
    // צגים + שלטי שם
    for (const c of crew) {
      const logs = st.snap.logs[c.id] || [];
      const sig = logs.map((l) => l.text).join('\n').slice(-300);
      if (lastLogs.current[c.id] !== sig) {
        lastLogs.current[c.id] = sig;
        monitorOf(c.id, c.name.en, c.color).setLogs(logs.map((l) => ({ kind: l.kind, text: l.text })));
      }
      const ag = st.snap.agents.find((a) => a.id === c.id);
      nameplateOf(c.id, c.name.he, c.title.he, c.color).set(
        ag?.activity || '', STATE_COLORS[ag?.state || 'idle'],
      );
      // R58 — פס-העבודה על הצג: מצב אמת + פעילות + המטלה הנוכחית מהפורמן.
      // בלי סנאפשוט — "המתנה למדידה", לעולם לא עבודה-מדומה (חוק-הכנות).
      const curTask = ag
        ? (st.snap.tasks.find((t) => t.assignee === c.id && t.status !== 'done' && t.status !== 'cancelled')
          ?? st.snap.tasks.filter((t) => t.assignee === c.id).slice(-1)[0])
        : undefined;
      monitorOf(c.id, c.name.en, c.color).setWork(ag
        ? {
            stateHe: STATE_HE[ag.state] ?? ag.state,
            stateCol: STATE_COLORS[ag.state],
            activity: ag.activity || '',
            task: curTask?.title ?? '',
            taskStatusHe: curTask
              ? curTask.status === 'done' ? 'הושלם' : curTask.status === 'doing' ? 'בביצוע' : curTask.status === 'review' ? 'בביקורת' : curTask.status === 'blocked' ? 'חסום' : 'מתוכנן'
              : '',
          }
        : null);
    }
    // לוח משימות
    if (!taskWallTex) taskWallTex = makeTaskWallTexture();
    taskWallTex.set(st.snap.tasks.map((t) => {
      const c = crew.find((x) => x.id === t.assignee);
      return { id: t.id, title: t.title, status: t.status, assignee: c?.name.he, color: c?.color };
    }));
    // קיר הגיט מוזן ב-GitWallSync (exec-14-3d: קיר-אמת פר-ספר + טיק-טריות)
    // קבלה
    if (!receptionTex) receptionTex = makeReceptionScreen();
    const s = st.snap.status;
    // Task 11-a — תווית כנה לפי-מסלול: חי / מראה (יומן אמיתי) / הדגמה.
    // 'mirror' איננו DEMO — לשקר שכזה יש עלות (חוק-הכנות).
    receptionTex.set({
      mode: s.backend === 'live' ? '● LIVE' : s.backend === 'mirror' ? '● MIRROR · מראה' : '● DEMO',
      provider: s.llmProvider,
      ops: s.opsDone,
      goal: st.snap.goal?.text,
    });
    // עדכון ציור מסונן
    monitors.forEach((m) => m.update(now));
    nameplates.forEach((n) => n.update(now));
    taskWallTex?.update(now);
    receptionTex?.update(now);
  });
  return null;
}

// ─────────────── מיקוד בלחיצה ───────────────
function useFocus(id: string, kind: string) {
  return (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    const st = useHq.getState();
    const px = (
      id === 'wall' ? TASK_WALL.cx : id === 'git' ? GIT_WALL.cx : id === 'podium' ? PODIUM.x :
      id === 'library' ? LIBRARY_TABLE[0] : id === 'reception' ? RECEPTION.x : id === 'lead' ? LEAD_TABLE.x :
      id === 'flame' ? FLAME[0] : DESKS[id]?.x ?? FLAME[0]
    );
    const py = (
      id === 'wall' ? TASK_WALL.cy + 150 : id === 'git' ? GIT_WALL.cy + 150 : id === 'podium' ? PODIUM.y :
      id === 'library' ? LIBRARY_TABLE[1] : id === 'reception' ? RECEPTION.y : id === 'lead' ? LEAD_TABLE.y :
      id === 'flame' ? FLAME[1] : DESKS[id]?.y ?? FLAME[1]
    );
    bus.emit('focus', { target: { x: px, y: py }, kind, id });
    if (kind === 'desk' || id === 'aluf') st.setPanel('agent', id);
    else if (kind === 'wall') st.setPanel('wall');
    else if (kind === 'podium') st.setPanel('podium');
    else if (kind === 'library') st.setPanel('library');
    else if (kind === 'git') st.setPanel('git');
    else if (kind === 'reception') st.setPanel('reception');
    else if (kind === 'flame') st.setPanel('flame');
    else if (kind === 'lead') st.setPanel('agent', 'aluf');
  };
}

// ─────────────── רכיב ראשי ───────────────
export function Stations() {
  const mats = useOfficeMaterials();
  return (
    <group>
      {Object.entries(DESKS).map(([id, d]) => (
        <WorkDesk key={id} id={id} mats={mats} />
      ))}
      <LeadTable mats={mats} />
      <TaskWall mats={mats} />
      <GitWall mats={mats} />
      <Podium mats={mats} />
      <Library mats={mats} />
      <Reception mats={mats} />
      <CoffeeBar mats={mats} />
      <FlameOfSovereignty />
      <Pendants mats={mats} />
      <Neons />
      <StationSync />
      <GitWallSync />
    </group>
  );
}

// ─────────────── שולחן עבודה ───────────────
function WorkDesk({ id, mats }: { id: string; mats: OfficeMats }) {
  const d = DESKS[id];
  const [x, z] = to3(d.x, d.y);
  const crew = useHq((s) => s.snap.crew.find((c) => c.id === id));
  const name = crew?.name.he ?? id;
  const title = crew?.title.he ?? '';
  const color = crew?.color ?? '#c9a227';
  const focus = useFocus(id, 'desk');
  const monitor = useMemo(() => monitorOf(id, name, color), [id, name, color]);
  const plate = useMemo(() => nameplateOf(id, name, title, color), [id, name, title, color]);

  // זוהר צג חי — אמיסיבי בלבד (בלי גוף-אור: 28→5 גופי-תאורה בחדר)
  const glowMat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const ag = useHq.getState().snap.agents.find((a) => a.id === id);
    const active = ag && ['reading', 'writing', 'checking', 'thinking'].includes(ag.state);
    if (glowMat.current) glowMat.current.emissiveIntensity = active ? 2.6 : 1.2;
  });

  const face = d.face + Math.PI; // הצג פונה ליושב: הצד הקדמי של השולחן נגד כיוון המבט
  return (
    <group position={[x, 0, z]} rotation-y={face} onClick={focus}>
      {/* משטח עץ */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.05, 0.72]} />
        <primitive object={mats.wood} attach="material" />
      </mesh>
      {/* רגליים מתכת */}
      {[[-0.66, -0.28], [0.66, -0.28], [-0.66, 0.28], [0.66, 0.28]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.37, lz]} castShadow>
          <boxGeometry args={[0.05, 0.74, 0.05]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      ))}
      {/* פס תאורה בצבע הסוכן — מתחת למשטח; נדלק חזק יותר כשהסוכן בעבודה אמיתית */}
      <mesh position={[0, 0.7, 0.3]}>
        <boxGeometry args={[1.3, 0.02, 0.03]} />
        <meshStandardMaterial ref={glowMat} color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      {/* צג */}
      <group position={[0, 0.76, -0.18]}>
        <mesh position={[0, 0.24, -0.02]} castShadow>
          <boxGeometry args={[0.72, 0.46, 0.03]} />
          <primitive object={mats.screenDark} attach="material" />
        </mesh>
        <mesh position={[0, 0.24, 0.002]}>
          <planeGeometry args={[0.66, 0.4]} />
          <meshBasicMaterial map={monitor.tex} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.09, 0.12, 0.04, 12]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.1, -0.01]}>
          <boxGeometry args={[0.06, 0.14, 0.03]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      </group>
      {/* מקלדת + עכבר */}
      <mesh position={[0, 0.775, 0.14]} rotation-x={-0.04} castShadow>
        <boxGeometry args={[0.4, 0.02, 0.14]} />
        <meshStandardMaterial color="#191b1f" roughness={0.6} />
      </mesh>
      <mesh position={[0.3, 0.775, 0.15]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#191b1f" roughness={0.6} />
      </mesh>
      {/* ניירות-עבודה + עט + כוס-קפה מאדה (שכבת-הריאליזם) */}
      <DeskSet />
      {/* מנורת שולחן */}
      <group position={[-0.58, 0.765, -0.16]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.07, 0.02, 12]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
        <mesh position={[0.02, 0.16, 0]} rotation-z={0.35}>
          <cylinderGeometry args={[0.012, 0.012, 0.3, 8]} />
          <primitive object={mats.brass} attach="material" />
        </mesh>
        <mesh position={[0.09, 0.31, 0]} rotation-z={0.9}>
          <coneGeometry args={[0.06, 0.1, 12]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0.12, 0.27, 0]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color="#fff2d8" emissive={color} emissiveIntensity={3} toneMapped={false} />
        </mesh>
      </group>
      {/* כיסא */}
      <Chair seatColor={color} mats={mats} z={0.62} />
    </group>
  );
}

/** רכיב שניצב תמיד מול המצלמה (שלטי שם, בועות) */
export function Billboard({ position, tex, scale }: { position: [number, number, number]; tex: THREE.Texture; scale: [number, number] }) {
  const ref = useRef<THREE.Sprite>(null);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }), [tex]);
  return <sprite ref={ref} position={position} scale={scale} material={mat} />;
}

// ─────────────── כיסא ───────────────
function Chair({ seatColor, mats, z = 0.78 }: { seatColor: string; mats: OfficeMats; z?: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.46, 0.07, 0.44]} />
        <meshStandardMaterial map={mats.fabric.map} color={seatColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.74, 0.2]} rotation-x={0.12} castShadow>
        <boxGeometry args={[0.44, 0.5, 0.06]} />
        <meshStandardMaterial map={mats.fabric.map} color={seatColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.46, 10]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.24, 0.03, Math.sin(a) * 0.24]} rotation-y={-a}>
            <boxGeometry args={[0.26, 0.04, 0.06]} />
            <primitive object={mats.metal} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

// ─────────────── שולחן ראש-המטה ───────────────
function LeadTable({ mats }: { mats: OfficeMats }) {
  const focus = useFocus('lead', 'lead');
  const [x, z] = to3(LEAD_TABLE.x, LEAD_TABLE.y);
  const crew = useHq((s) => s.snap.crew.find((c) => c.id === 'aluf'));
  const plate = useMemo(
    () => nameplateOf('aluf', crew?.name.he ?? 'אלוף', crew?.title.he ?? 'ראש-המטה', crew?.color ?? '#E0973F'),
    [crew],
  );
  return (
    <group position={[x, 0, z]} onClick={focus}>
      <mesh position-y={0.75} castShadow receiveShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.06, 40]} />
        <primitive object={mats.wood} attach="material" />
      </mesh>
      <mesh position-y={0.37} castShadow>
        <cylinderGeometry args={[0.14, 0.3, 0.72, 16]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
      <mesh position-y={0.03} receiveShadow>
        <cylinderGeometry args={[0.6, 0.7, 0.06, 24]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
      {/* מסך מונח על השולחן */}
      <group position={[0.25, 0.98, 0.1]} rotation-y={-0.5}>
        <mesh>
          <boxGeometry args={[0.56, 0.36, 0.025]} />
          <primitive object={mats.screenDark} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.014]}>
          <planeGeometry args={[0.5, 0.3]} />
          <meshBasicMaterial map={(monitorOf('aluf', 'Aluf', '#E0973F')).tex} toneMapped={false} />
        </mesh>
      </group>
      {/* כוסות */}
      {[-0.3, 0.05].map((dx, i) => (
        <mesh key={i} position={[dx, 0.85, i ? 0.28 : -0.2]}>
          <cylinderGeometry args={[0.035, 0.03, 0.09, 10]} />
          <meshStandardMaterial color="#dfe8ea" transparent opacity={0.5} roughness={0.1} metalness={0.1} />
        </mesh>
      ))}
      {/* R54 — שני כיסאות אורחים — סדר-הנדסי: מערבית לשולחן, פונים מזרחה
       * אל-השולחן, סימטריים ומקורבים — היו מפוזרים בזוויות-רנדומליות
       * ("כיסאות הפוכים" — נמדד בצילומי-בסיס) */}
      <group position={[-1.38, 0, 0.46]} rotation-y={-Math.PI / 2}><Chair seatColor="#8a6b3f" mats={mats} /></group>
      <group position={[-1.38, 0, -0.46]} rotation-y={-Math.PI / 2}><Chair seatColor="#8a6b3f" mats={mats} /></group>
      <Billboard position={[0, 1.85, 0]} tex={plate.tex} scale={[0.92, 0.29]} />
    </group>
  );
}

// ─────────────── לוח המשימות ───────────────
/** Task 47 — הלוח הוא רהיט תלוי, לא חלון: נמדד חי שהלוח-הקודם (5.75×3.12מ',
 *  תלוי 0.4מ' לפני הקיר, מתחתיו רצפה חשופה, חומר בסיק-מסך) נקרא "חלון לעיר"
 *  מכל זווית. התיקון בשורש: גודל רהיט (3.2×1.7מ'), מוצמד לפנים-הקיר בפועל,
 *  מסגרת עבה עם עומק אמיתי, מגש-מרקרים, כותרת על-הלוח, וחומר מואר-מהחדר
 *  (משטח סטנדרטי עם הקרנה עדינה — לא בסיק-מסך שאינו מושפע מהתאורה). */
function TaskWall({ mats }: { mats: OfficeMats }) {
  const focus = useFocus('wall', 'wall');
  const tex = useMemo(() => (taskWallTex ??= makeTaskWallTexture()), []);
  const [x, z] = to3(TASK_WALL.cx, TASK_WALL.cy);
  const w = TASK_WALL.w * SCALE, h = TASK_WALL.h * SCALE;
  const wallInnerZ = -PLAN_H * SCALE / 2 + WALL_T; // פנים-הקיר הצפוני
  const d = TASK_WALL_DEPTH;
  const boardZ = wallInnerZ + d / 2 + 0.012; // הלוח נוגע בקיר בפועל
  return (
    <group position={[x, TASK_WALL_Y, boardZ]} onClick={focus}>
      {/* גוף הלוח — עומק אמיתי (לא מישור דק): צד-אחורי נגיע בקיר */}
      <mesh castShadow>
        <boxGeometry args={[w + 0.14, h + 0.14, d]} />
        <primitive object={mats.woodDark} attach="material" />
      </mesh>
      {/* משטח הקנבס — חומר מואר מהחדר + הקרנה עדינה לקריאות (לא זוהר-חלון) */}
      <mesh position={[0, 0, d / 2 + 0.004]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex.tex} roughness={0.85} emissive="#ffffff" emissiveMap={tex.tex} emissiveIntensity={0.42} toneMapped={false} />
      </mesh>
      {/* כותרת מותאמת — רצועת-שם על גבי המסגרת */}
      <mesh position={[0, h / 2 + 0.085, d / 2 + 0.006]}>
        <boxGeometry args={[w * 0.55, 0.075, 0.018]} />
        <primitive object={mats.brass} attach="material" />
      </mesh>
      <mesh position={[0, h / 2 + 0.085, d / 2 + 0.016]}>
        <planeGeometry args={[w * 0.5, 0.05]} />
        <meshBasicMaterial map={useMemo(() => makeSignTexture('לוח המשימות', '#2b2015'), [])} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {/* מגש מרקרים בתחתית — אות-היכר של לובי פיזי */}
      <mesh position={[0, -h / 2 - 0.045, d / 2 + 0.035]} castShadow>
        <boxGeometry args={[w * 0.62, 0.03, 0.07]} />
        <primitive object={mats.woodDark} attach="material" />
      </mesh>
      {/* שני דיבוקים/מהדקים בפינות — מחברים את הלוח לקיר בפועל */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.05), 0, d / 2 - 0.01]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.014, 0.014, 0.05, 10]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      ))}
      {/* מנורות תאורה עליונות — יושבות על שפת-הלוח (גיאומטריה בלבד) */}
      {[-w * 0.28, w * 0.28].map((lx, i) => (
        <mesh key={i} position={[lx, h / 2 + 0.1, 0.02]} rotation-x={0.9}>
          <cylinderGeometry args={[0.045, 0.065, 0.12, 12]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────── קיר הגיט ───────────────
function GitWall({ mats }: { mats: OfficeMats }) {
  const focus = useFocus('git', 'git');
  // exec-14-3d: קיר-האמת — לוח פר-ספר עם נקודות-מצב סמנטיות + מד-טריות
  // (הזנה: GitWallSync; ציור: GitWallData.tsx). הקליק נשאר מיקוד-מצלמה + פאנל.
  const tex = useMemo(() => gitBoard().tex, []);
  const [x, z] = to3(GIT_WALL.cx, GIT_WALL.cy);
  const w = GIT_WALL.w * SCALE, h = GIT_WALL.h * SCALE;
  const wallInnerZ = -PLAN_H * SCALE / 2 + WALL_T;
  // Task 47: מוצמד לקיר בפועל (היה תלוי 0.4מ' לפניו), מסגרת חיה-מעט שנקראת
  // מרחוק (היה שחור-על-שחור — נמדד: התצפית הציגה חלל ריק)
  return (
    <group position={[x, 1.55, wallInnerZ + 0.045]} onClick={focus}>
      <mesh>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.07]} />
        <meshStandardMaterial color="#101812" emissive="#2c6a4b" emissiveIntensity={1.35} roughness={0.45} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─────────────── דוכן ההחלטות ───────────────
function Podium({ mats }: { mats: OfficeMats }) {
  const focus = useFocus('podium', 'podium');
  const [x, z] = to3(PODIUM.x, PODIUM.y);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  // R54 (מילת-הבעלים: "הדוכן לא צריך הסבר אם לא קורה בו כלום"):
  // הפלטה מופיעה רק כשיש מה לומר — הכרעה פתוחה, או נפתרה בחלון 45 דק'.
  // דוכן-שקט = דוכן-נקי (עמוד + מיקרופון + טבעת-קרקע). בלי שאלות-אנגלית
  // מרחפות באוויר — הפירוט נשאר בפאנל-הצד, בשפה-המקצועית של המשרד.
  const plate = useMemo(() => makeDecisionPodiumPlate(), []);
  const decisions = useHq((s) => s.snap.decisions);
  // נגזר-ברינדור (במקום set-state-in-effect): הפלטה קיימת רק כשיש מה לומר.
  const plateOn = useMemo(() => {
    const openCount = decisions.filter((d) => d.status === 'open').length;
    const newest = decisions.length
      ? decisions.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
      : null;
    const fresh = !!newest && Date.now() - newest.createdAt < 45 * 60_000;
    return openCount > 0 || fresh;
  }, [decisions]);
  useEffect(() => {
    const openCount = decisions.filter((d) => d.status === 'open').length;
    const answered = decisions.length - openCount;
    const newest = decisions.length
      ? decisions.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
      : null;
    plate.set(
      newest ? { question: newest.question, status: newest.status, createdAt: newest.createdAt } : null,
      openCount,
      answered,
    );
  }, [decisions, plate]);
  const open = useRef(0);
  useFrame((_, dt) => {
    plate.update(performance.now());
    const isOpen = useHq.getState().snap.decisions.some((d) => d.status === 'open');
    open.current += ((isOpen ? 1 : 0) - open.current) * Math.min(1, dt * 4);
    if (ringMat.current) {
      ringMat.current.opacity = 0.14 + open.current * 0.6;
      ringMat.current.emissiveIntensity = 0.7 + open.current * 1.8;
    }
  });
  return (
    <group position={[x, 0, z]} onClick={focus}>
      {/* בימה עגולה */}
      <mesh position-y={0.09} receiveShadow castShadow>
        <cylinderGeometry args={[1.55, 1.7, 0.18, 48]} />
        <primitive object={mats.wallDark} attach="material" />
      </mesh>
      <mesh position-y={0.19} receiveShadow>
        <cylinderGeometry args={[1.5, 1.55, 0.03, 48]} />
        <primitive object={mats.brass} attach="material" />
      </mesh>
      {/* דוכן נאום */}
      <group position={[0.42, 0.2, -0.3]} rotation-y={Math.PI * 0.42}>
        <mesh position-y={0.56} castShadow>
          <boxGeometry args={[0.52, 1.06, 0.4]} />
          <primitive object={mats.wood} attach="material" />
        </mesh>
        <mesh position={[0, 1.1, 0.1]} rotation-x={-0.32} castShadow>
          <boxGeometry args={[0.56, 0.05, 0.42]} />
          <primitive object={mats.wood} attach="material" />
        </mesh>
        <mesh position={[0, 1.13, 0.16]} rotation-x={-0.32}>
          <boxGeometry args={[0.4, 0.015, 0.02]} />
          <meshStandardMaterial color={color_of_decision()} emissive={color_of_decision()} emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.42, -0.02]}>
          <cylinderGeometry args={[0.012, 0.012, 0.3, 8]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
        <mesh position={[0, 1.56, 0.04]} rotation-x={0.3}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      </group>
      {/* אינדיקטור יחיד: הכרעה פתוחה = טבעת דולקת; סגורה = כמעט שקופה.
       * R54: הטבעת יושבת על-שפת-הבימה (פס-תאורה פיזי) — לא הילה מרחפת בגובה 1.35מ' */}
      <mesh position={[0, 0.215, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[1.36, 0.018, 10, 72]} />
        <meshStandardMaterial ref={ringMat} color="#e07b54" emissive="#e07b54" emissiveIntensity={0.7} transparent opacity={0.14} toneMapped={false} />
      </mesh>
      {/* R54: הפלטה רק כשקורה משהו; קטנה, צמודה מעל-הדוכן (1.78מ'),
       * והשלט-השני (ניאון כפול) נמחק — השם כבר על קיר-הדוכן */}
      {plateOn && <Billboard position={[0, 1.78, 0]} tex={plate.tex} scale={[1.18, 0.37]} />}
    </group>
  );
}
function color_of_decision() { return '#e07b54'; }

// ─────────────── הספרייה ───────────────
function Library({ mats }: { mats: OfficeMats }) {
  const focus = useFocus('library', 'library');
  // R57 — מקום-השלט מחושב פעם-אחת בראש-הרכיב (בלי הוקים בביטוי-JSX)
  const [signX, signZ] = to3(1390, 150);
  // Task 47 — תיקון-שורש: המדפים צוירו מהגדרה-מקומית בצד המערבי (x=210)
  // בעוד החוזה, ההתנגשויות, השלט ונקודת-המצלמה מגדירים את הספרייה במזרח
  // (x=1390) — התוצאה הנמדדת: מדפים צמודי-קיר-הגיט במערב, קיר-מזרח ריק
  // עם שלט מרחף. מעכשיו מקור-אמת אחד: SHELVES מהחוזה.
  const SHELF = SHELVES;
  const books = useMemo(() => {
    // ספרים אינסטנסיים — צבעוניים, חלקם זוהרים (דוחות). מיקומים במרחב עולם.
    const arr: { m: THREE.Matrix4; col: THREE.Color }[] = [];
    const dummy = new THREE.Object3D();
    const palette = ['#7BA05B', '#C76B4A', '#a78bfa', '#C9A227', '#3BA08F', '#8a6b3f', '#b0b6bd'];
    for (const s of SHELF) {
      const n = Math.floor((s.len * SCALE) / 0.045);
      const [sx, sz] = to3(s.x, s.y);
      const dir = s.rot === 0 ? [1, 0] : [0, 1];
      // הספרים יושבים על המדף, מעט לפני-הגב (הפתיחה תמיד ב-local +z אחרי
      // תיקון-הכיוון של ספינת-הקיר-המזרחי ל-rot=-π/2)
      const face = 0.07;
      for (let i = 0; i < n; i++) {
        for (let row = 0; row < 4; row++) {
          if (Math.random() < 0.12) continue;
          const along = -s.len * SCALE / 2 + i * 0.045;
          dummy.position.set(
            sx + dir[0] * along,
            0.35 + row * 0.34,
            sz + dir[1] * along + face + (Math.random() - 0.5) * 0.015,
          );
          dummy.rotation.set(0, s.rot, (Math.random() - 0.5) * 0.08);
          dummy.scale.set(0.028 + Math.random() * 0.012, 0.24 + Math.random() * 0.05, 0.2);
          dummy.updateMatrix();
          const glow = Math.random() < 0.1;
          arr.push({
            m: dummy.matrix.clone(),
            col: new THREE.Color(glow ? '#ffd9a0' : palette[Math.floor(Math.random() * palette.length)]),
          });
        }
      }
    }
    return arr;
  }, []);
  const instRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = instRef.current;
    if (!im) return;
    books.forEach((b, i) => {
      im.setMatrixAt(i, b.m);
      im.setColorAt(i, b.col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [books]);

  const reportCount = useHq((s) => s.snap.reports.length);
  return (
    <group onClick={focus}>
      {/* ספרים אינסטנסיים — מרחב עולם אחד.
       *  Task 47 ROOT CAUSE: frustumCulled — כדור-החסם של instancedMesh
       *  מחושב מהגיאומטריה-הבסיס בלבד (קוביה 1×1×1 בראשית), והספרים
       *  מפוזרים לאורך הקירות — כל הרשת הייתה מוסלקת מחוץ-למסך והספרים
       *  מעולם לא נראו. כיבוי הסלקה לרשת הזו בלבד. */}
      <instancedMesh ref={instRef} args={[undefined, undefined, books.length]} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
      {SHELF.map((s, si) => {
        const [x, z] = to3(s.x, s.y);
        const len = s.len * SCALE;
        // Task 47 ROOT CAUSE: המדף נבנה כקופסה מלאה — הספרים הוצבו בתוכה
        // ולא ניתן היה לראותם מאף זוית (הספרייה נראתה קורת-עץ שחורה; נמדד
        // בצילומי-ביניים ובסופיות). עכשיו: ספרייה אמיתית — גב פאנל, צדדים,
        // גג-תחתית ומדפים — הפתוחה אל-תוך-החדר (הפתיחה ב-local +z).
        const D = 0.34, H = 2.1, T = 0.03;
        return (
          <group key={si} position={[x, 0, z]} rotation-y={s.rot}>
            {/* גב */}
            <mesh position={[0, H / 2, -D / 2 + T / 2]} castShadow receiveShadow>
              <boxGeometry args={[len, H, T]} />
              <primitive object={mats.woodDark} attach="material" />
            </mesh>
            {/* צדדים */}
            {[-1, 1].map((sd) => (
              <mesh key={sd} position={[(sd * len) / 2 - sd * T / 2, H / 2, 0]} castShadow>
                <boxGeometry args={[T, H, D]} />
                <primitive object={mats.wood} attach="material" />
              </mesh>
            ))}
            {/* גג + תחתית */}
            {[H - T / 2, T / 2].map((yy, i2) => (
              <mesh key={i2} position={[0, yy, 0]} castShadow receiveShadow>
                <boxGeometry args={[len, T, D]} />
                <primitive object={mats.wood} attach="material" />
              </mesh>
            ))}
            {/* מדפים פנימיים */}
            {[0.35, 0.69, 1.03, 1.37].map((yy, ri) => (
              <mesh key={ri} position={[0, yy + 0.12, 0.0]} castShadow receiveShadow>
                <boxGeometry args={[len - 2 * T, 0.02, D - 0.04]} />
                <primitive object={mats.wood} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* שולחן קריאה + מנורה — R57 תיקון-שורש: היה [...to3(), 0] —
       *  z3 נפל בסלוט-הגובה והשולחן היה קבור 2.8מ' מתחת-לרצפה (אותה
       *  משפחת-באג של שלט-הספרייה). עתה צירים מפורשים ברכיב-ייעודי. */}
      <ReadingTable mats={mats} reportCount={reportCount} />
      {/* R57 תיקון-שורש: השלט היה [...to3(), 2.4] — z3 נפל בסלוט-הגובה
       *  והשלט נקבר 4.4מ' מתחת-לרצפה (נמדד ברשימת-הספרייטים החיה). */}
      <Billboard position={[signX, 2.4, signZ]} tex={useMemo(() => makeSignTexture('הספרייה', '#a78bfa'), [])} scale={[1.15, 0.26]} />
    </group>
  );
}

/** מנורת-קריאה חמה — אור מקומי יחיד לאזור-הספרייה (מרוסן: מרחק 6) */
function LibraryLamp() {
  const [lx, lz] = to3(LIBRARY_TABLE[0], LIBRARY_TABLE[1]);
  return <pointLight position={[lx + 0.3, 1.05, lz - 0.2]} intensity={6} distance={6} decay={2} color="#ffd9a0" />;
}

/** שולחן-הקריאה של הספרייה — R57: רכיב-ייעודי בצירים מפורשים (היה קבור
 *  מתחת-לרצפה בגלל פיזור [...to3(), 0] שדחף את z3 לסלוט-הגובה). */
function ReadingTable({ mats, reportCount }: { mats: OfficeMats; reportCount: number }) {
  const focus = useFocus('library', 'library');
  const [tx, tz] = to3(LIBRARY_TABLE[0], LIBRARY_TABLE[1]);
  return (
    <group position={[tx, 0, tz]} onClick={focus}>
      <mesh position-y={0.76} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.05, 0.9]} />
        <primitive object={mats.wood} attach="material" />
      </mesh>
      {[[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.38, lz]}>
          <boxGeometry args={[0.05, 0.76, 0.05]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0.3, 0.95, -0.2]}>
        <sphereGeometry args={[0.05, 12, 10]} />
        <meshStandardMaterial color="#ffe9c4" emissive="#ffd9a0" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      {/* מקור-האור של מנורת-הקריאה — Task 47: המדפים היו שחורים בתצפית
       *  (נמדד) ; מנורה אמיתית מאירה את סביבתה */}
      <LibraryLamp />
      {/* דוחות מונחים על השולחן — מספרם = דוחות אמיתיים בספרייה */}
      {Array.from({ length: Math.min(reportCount, 4) }).map((_, i) => (
        <mesh key={i} position={[-0.4 + i * 0.22, 0.795, 0.1 - i * 0.06]} rotation-y={i * 0.4}>
          <boxGeometry args={[0.21, 0.008, 0.3]} />
          <meshStandardMaterial color="#f1ead9" roughness={0.8} />
        </mesh>
      ))}
      <Chair seatColor="#4a3a26" mats={mats} />
    </group>
  );
}

// ─────────────── קבלה ───────────────
function Reception({ mats }: { mats: OfficeMats }) {
  const focus = useFocus('reception', 'reception');
  const tex = useMemo(() => (receptionTex ??= makeReceptionScreen()), []);
  const [x, z] = to3(RECEPTION.x, RECEPTION.y);
  return (
    <group position={[x, 0, z]} onClick={focus}>
      {/* דלפק מעוקל (מקורב ב-3 קופסאות) — Task 47: חזית עץ חיה במקום קיר-כהה
       *  שנבלע בחושך (נמדד: הדלפק היה מסה שחורה בתצפית-קבלה) */}
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.1, 1.1, 0.72]} />
        <primitive object={mats.wood} attach="material" />
      </mesh>
      <mesh position={[0, 1.13, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.3, 0.06, 0.86]} />
        <primitive object={mats.marble} attach="material" />
      </mesh>
      {/* פס אור תחתון */}
      <mesh position={[0, 0.06, 0.3]}>
        <boxGeometry args={[2.9, 0.04, 0.05]} />
        <meshStandardMaterial color="#54d8c0" emissive="#54d8c0" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {/* מסך ברוכים-הבאים — R54: עומד על-הדלפק בעמידה אמת (תושבת: בסיס+תורן),
       * נטייה מינימלית — היה מרחף 4סמ' מעל-השיש מוטה בלי תמיכה */}
      <group position={[-0.95, 0, 0.16]} rotation-y={0.45}>
        <mesh position={[0, 1.175, 0]}>
          <cylinderGeometry args={[0.09, 0.11, 0.03, 16]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
        <mesh position={[0, 1.28, -0.02]}>
          <cylinderGeometry args={[0.022, 0.022, 0.2, 10]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
        <group position={[0, 1.44, 0]} rotation-x={-0.05}>
          <mesh castShadow>
            <boxGeometry args={[0.62, 0.44, 0.03]} />
            <primitive object={mats.screenDark} attach="material" />
          </mesh>
          <mesh position={[0, 0, 0.017]} rotation-y={0}>
            <planeGeometry args={[0.56, 0.38]} />
            <meshBasicMaterial map={tex.tex} toneMapped={false} />
          </mesh>
        </group>
      </group>
      {/* פרח באגרטל */}
      <group position={[1.2, 1.16, 0]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.06, 0.16, 10]} />
          <primitive object={mats.marble} attach="material" />
        </mesh>
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.05, 0.24, Math.sin(a) * 0.05]} rotation-x={0.7}>
              <sphereGeometry args={[0.035, 8, 6]} />
              <meshStandardMaterial color={i % 2 ? '#c76b4a' : '#e0a154'} roughness={0.6} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

// ─────────────── בר קפה ───────────────
function CoffeeBar({ mats }: { mats: OfficeMats }) {
  const [x, z] = to3(COFFEE.x, COFFEE.y);
  return (
    <group position={[x, 0, z]} rotation-y={Math.PI / 2}>
      {/* דלפק ארוך לאורך הקיר המערבי */}
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.04, 0.62]} />
        <primitive object={mats.woodDark} attach="material" />
      </mesh>
      <mesh position={[0, 1.06, 0]} castShadow>
        <boxGeometry args={[3.6, 0.05, 0.72]} />
        <primitive object={mats.marble} attach="material" />
      </mesh>
      {/* מכונת קפה */}
      <group position={[-1, 1.09, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.42, 0.4]} />
          <meshStandardMaterial color="#23262b" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.08, 0.21]}>
          <boxGeometry args={[0.34, 0.02, 0.06]} />
          <meshStandardMaterial color="#54d8c0" emissive="#54d8c0" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      </group>
      {/* כוסות */}
      {[0.1, 0.4, 0.7].map((cx, i) => (
        <mesh key={i} position={[cx, 1.16, 0.1]}>
          <cylinderGeometry args={[0.035, 0.03, 0.08, 10]} />
          <meshStandardMaterial color="#dfe8ea" transparent opacity={0.55} roughness={0.1} />
        </mesh>
      ))}
      <CoffeeLife mats={mats} />
      {/* כיסאות בר */}
      {[-1, 0, 1].map((sx) => (
        <group key={sx} position={[sx, 0, 0.85]}>
          <mesh position-y={0.68} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.06, 16]} />
            <meshStandardMaterial color="#8a5c3a" roughness={0.8} />
          </mesh>
          <mesh position-y={0.34}>
            <cylinderGeometry args={[0.03, 0.03, 0.68, 8]} />
            <primitive object={mats.metal} attach="material" />
          </mesh>
          <mesh position-y={0.04}>
            <cylinderGeometry args={[0.2, 0.2, 0.03, 16]} />
            <primitive object={mats.metal} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─────────────── להבת הריבונות ───────────────
/**
 * ליבת המשרד — להבת-הריבונות: קונוס שיידר רועש + תאורה פועמת.
 * סמל-המשרד; מרוסן: בלי ניצוצות, בלי הילה, בלי צל-נקודתי.
 * צבעי ליבה: ענבר-זהב (חם), בלי כחול.
 */
export function FlameOfSovereignty() {
  const [x, z] = to3(FLAME[0], FLAME[1]);
  const base = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const focus = useFocus('flame', 'flame');

  useFrame(({ clock }, dt) => {
    void dt;
    const t = clock.getElapsedTime();
    if (base.current) {
      // R58 — הלהבה יושבת בתוך-הגביע (0.85), לא עמוד-אור מרחף בגובה-ראש
      base.current.position.y = 0.85 + Math.sin(t * 1.8) * 0.03;
    }
    if (light.current) {
      light.current.intensity = 2.0 + Math.sin(t * 7.3) * 0.4 + Math.sin(t * 11.7) * 0.25;
    }
  });

  return (
    <group position={[x, 0, z]} onClick={focus}>
      {/* עמדת בסיס */}
      <mesh position-y={0.12} receiveShadow castShadow>
        <cylinderGeometry args={[0.85, 1.05, 0.24, 40]} />
        <primitive object={useOfficeMatsStatic().wallDark} attach="material" />
      </mesh>
      <mesh position-y={0.25} receiveShadow>
        <cylinderGeometry args={[0.78, 0.85, 0.04, 40]} />
        <meshStandardMaterial color="#a67c3d" roughness={0.3} metalness={0.9} />
      </mesh>
      {/* טבעת קרקע — סימון מקום רגוע */}
      <mesh position-y={0.02} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.15, 1.28, 48]} />
        <meshStandardMaterial color="#ffb054" emissive="#ffb054" emissiveIntensity={0.55} transparent opacity={0.35} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* להבה — שיידר פרוצדורלי (סמל-המשרד; R58: קונוס צנוע בתוך-הגביע —
       *  הקונוס הישן 1.25מ' לבן-אדיטיבי נקרא "פאנל-לבן מרחף" מהמבט-הכללי) */}
      <group ref={base} position-y={0.85}>
        <mesh>
          <coneGeometry args={[0.2, 0.92, 24, 20, true]} />
          <ShaderMaterial flame />
        </mesh>
      </group>

      <pointLight ref={light} position={[0, 1.4, 0]} color="#ffb054" intensity={2.0} distance={6.2} decay={2} />
    </group>
  );
}

/** שיידר הלהבה — רעש דו-אוקטבי נע + דעיכה לקצוות (סינגלטון מודולי) */
let flameMat: THREE.ShaderMaterial | null = null;
function getFlameMaterial(): THREE.ShaderMaterial {
  if (!flameMat) {
    flameMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPos;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                     mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
        }
        void main() {
          // צורת הלהבה: צרה בראש, רחבה בבסיס — עם רעש נע כלפי מעלה
          float h = vUv.y;
          float n = noise(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 1.4)) * 0.55
                  + noise(vec2(vUv.x * 12.0 + 7.0, vUv.y * 6.0 - uTime * 2.2)) * 0.3;
          float body = smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.55, 1.0, h + n * 0.42));
          // R58 — ליבה ענברית-חמה (הליבה-הלבנה הישנה נצבעה ככרטיס-שקוף),
          // קצוות עמוקים; עוצמת-אלפא נמוכה — להבה, לא זרקור
          vec3 core = vec3(1.0, 0.78, 0.46);
          vec3 edge = vec3(0.95, 0.42, 0.1);
          vec3 col = mix(edge, core, pow(1.0 - h, 1.6) * body);
          float a = body * (0.26 + n * 0.46);
          gl_FragColor = vec4(col * (0.95 + n * 0.8), a);
        }
      `,
    });
  }
  return flameMat;
}
function FlameMaterial() {
  useFrame(({ clock }) => {
    if (flameMat) flameMat.uniforms.uTime.value = clock.getElapsedTime();
  });
  return getFlameMaterial();
}
function ShaderMaterial({ flame, children }: { flame: boolean; children?: never }) {
  const mat = flame ? FlameMaterial() : null;
  void children;
  return mat ? <primitive object={mat} attach="material" /> : null;
}
function useOfficeMatsStatic(): OfficeMats {
  return useOfficeMaterials();
}

// ─────────────── נברשות ───────────────
function Pendants({ mats }: { mats: OfficeMats }) {
  return (
    <group>
      {PENDANTS.map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          {/* כבל */}
          <mesh position={[0, (h + WALL_H) / 2, 0]}>
            <cylinderGeometry args={[0.008, 0.008, WALL_H - h, 6]} />
            <meshStandardMaterial color="#151412" />
          </mesh>
          {/* גוף מתכת */}
          <mesh position={[0, h + 0.09, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.05, 0.2, 20]} />
            <primitive object={mats.brass} attach="material" />
          </mesh>
          {/* מנורת ליבה זוהרת — אמיסיבית בלבד */}
          <mesh position={[0, h - 0.02, 0]}>
            <sphereGeometry args={[0.075, 14, 12]} />
            <meshStandardMaterial color="#fff3da" emissive="#ffdda6" emissiveIntensity={3.2} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─────────────── ניאון ───────────────
function Neons() {
  const items = useMemo(
    () => NEON_SIGNS.map((s) => ({ ...s, tex: makeSignTexture(s.text, s.color, s.sub) })),
    [],
  );
  return (
    <group>
      {items.map((s, i) => (
        <group key={i} position={s.pos}>
          {/* R57 — שלט-תלוי: שני כבלים מהתקרה אל גב-השלט (השלט לא מרחף) */}
          {s.hang && [-s.w * 0.32, s.w * 0.32].map((cx, k) => (
            <mesh key={k} position={[cx, (WALL_H - s.pos[1]) / 2 + 0.12, 0]}>
              <cylinderGeometry args={[0.006, 0.006, WALL_H - s.pos[1] - 0.12, 6]} />
              <meshStandardMaterial color="#151412" />
            </mesh>
          ))}
          <mesh rotation-y={s.rotY}>
            <planeGeometry args={[s.w, s.w * (s.sub ? 0.31 : 0.22)]} />
            <meshBasicMaterial map={s.tex} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
