/**
 * Architecture.tsx — מעטפת המשרד: רצפה, קירות עם פתחים, זכוכית, תקרה עם גיאות
 * אור, חלונות לילה עם קו רקיע, דלתות כניסה, תריסים, בסיסי קיר, עמודים, צמחייה ושטיחים.
 */
'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { PLAN_W, PLAN_H, SCALE, WALL_H, WALL_T, to3, FLAME, RECEPTION } from '@/lib/hq/contract';
import {
  makeConcreteTexture, makeWoodTexture, makeWallTexture, makeBlindsTexture,
  makeSkylineTexture, makeCarpetTexture, makeBrushedMetalTexture, makeMarbleTexture,
  makeFabricTexture,
} from '@/lib/hq/textures';

/** פתח בקיר — טווח במטרים לאורך הקיר, מ-sill עד header */
interface Opening { a: number; b: number; y0: number; y1: number; kind: 'window' | 'door' | 'blind' }

interface WallSpec {
  /** 'north' | 'south' | 'west' | 'east' */
  side: 'north' | 'south' | 'west' | 'east';
  openings: Opening[];
}

const WIN_Y0 = 0.92;
const WIN_Y1 = 2.72;
const DOOR_Y1 = 2.6;

const WALL_SPECS: WallSpec[] = [
  { side: 'north', openings: [] },
  { side: 'east', openings: [] },
  {
    side: 'west',
    openings: [
      { a: 1.1, b: 3.7, y0: WIN_Y0, y1: WIN_Y1, kind: 'window' },
      { a: 4.6, b: 7.2, y0: WIN_Y0, y1: WIN_Y1, kind: 'blind' },
      { a: 8.1, b: 10.7, y0: WIN_Y0, y1: WIN_Y1, kind: 'window' },
    ],
  },
  {
    side: 'south',
    openings: [
      { a: 1.4, b: 4.4, y0: WIN_Y0, y1: WIN_Y1, kind: 'window' },
      { a: 8.8, b: 11.2, y0: 0, y1: DOOR_Y1, kind: 'door' },   // דלתות הכניסה
      { a: 13.2, b: 16.2, y0: WIN_Y0, y1: WIN_Y1, kind: 'window' },
    ],
  },
];

/** אורך הקיר לאורך ציר ההליכה */
const LEN = { north: PLAN_W * SCALE, south: PLAN_W * SCALE, west: PLAN_H * SCALE, east: PLAN_H * SCALE };

export function Architecture() {
  const mats = useOfficeMaterials();
  const skyline = useMemo(() => makeSkylineTexture(), []);
  const blinds = useMemo(() => makeBlindsTexture(), []);

  return (
    <group>
      {/* ── רצפה ── */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[PLAN_W * SCALE, PLAN_H * SCALE]} />
        <primitive object={mats.concrete} attach="material" />
      </mesh>

      {/* שטיח מרכזי עגול סביב הלהבה */}
      <FloorRug />

      {/* ── קירות ── */}
      {WALL_SPECS.map((w) => <Wall key={w.side} spec={w} mats={mats} />)}

      {/* ── חלונות ותריסים (זכוכית + מסגרות + תריס) ── */}
      {WALL_SPECS.filter((w) => w.openings.length).map((w) =>
        w.openings.map((o, i) => (
          <OpeningFill key={`${w.side}-${i}`} side={w.side} o={o} mats={mats} blinds={o.kind === 'blind' ? blinds : undefined} />
        )),
      )}

      {/* ── קו רקיע בחוץ (מערב + דרום) ──
       *  Task 47 ROOT CAUSE (תצפית-דוכן): מטוס-השמיים המערבי הוצב ב-x=-4.2 —
       *  בתוך-החדר (פנים-קיר מערבי = -9.76)! הוא חתך את שליש-החדר המערבי,
       *  נראה מקרוב כ"קיר-חלונות מטושטש" וחסם את תצפית הדוכן לגמרי. עכשיו
       *  4.2מ' מחוץ-לקיר, כמו המטוס הדרומי. */}
      <group>
        <mesh position={[-14.2, 3.4, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[34, 12]} />
          <meshBasicMaterial map={skyline} toneMapped={false} fog={false} />
        </mesh>
        <mesh position={[0, 3.4, PLAN_H * SCALE + 4.2]} rotation-y={Math.PI}>
          <planeGeometry args={[34, 12]} />
          <meshBasicMaterial map={skyline} toneMapped={false} fog={false} />
        </mesh>
      </group>

      {/* ── תקרה + גיאות אור ── */}
      <Ceiling mats={mats} />

      {/* ── דלתות כניסה ── */}
      <EntranceDoors mats={mats} />

      {/* ── עמודים ── */}
      {[[5.6, -1.9], [5.6, 1.9], [-5.6, -1.9], [-5.6, 1.9]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={WALL_H / 2} castShadow receiveShadow>
            <boxGeometry args={[0.42, WALL_H, 0.42]} />
            <primitive object={mats.wallDark} attach="material" />
          </mesh>
          <mesh position-y={0.06}>
            <boxGeometry args={[0.52, 0.12, 0.52]} />
            <primitive object={mats.metal} attach="material" />
          </mesh>
          <mesh position-y={WALL_H - 0.06}>
            <boxGeometry args={[0.52, 0.12, 0.52]} />
            <primitive object={mats.metal} attach="material" />
          </mesh>
        </group>
      ))}

      {/* ── צמחייה ── */}
      {[
        [PLAN_W - 8, 28], [8, 28], [PLAN_W - 8, PLAN_H - 30], [8, PLAN_H - 130],
        [PLAN_W / 2 - 320, 120], [PLAN_W / 2 + 320, 120],
      ].map(([px, py], i) => <Plant key={i} px={px} py={py} mats={mats} />)}

      {/* ── בסיס קיר (סקירטינג) — פס כהה לאורך הקירות המלאים ── */}
      <group>
        <mesh position={[0, 0.07, -PLAN_H * SCALE / 2 + WALL_T / 2 + 0.02]}>
          <boxGeometry args={[PLAN_W * SCALE, 0.14, 0.06]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
        <mesh position={[PLAN_W * SCALE / 2 - WALL_T / 2 - 0.02, 0.07, 0]}>
          <boxGeometry args={[0.06, 0.14, PLAN_H * SCALE]} />
          <primitive object={mats.metal} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

// ─────────────── חומרים ───────────────
export interface OfficeMats {
  concrete: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  wallDark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  fabricTeal: THREE.MeshStandardMaterial;
  carpet: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshStandardMaterial;
  glowWarm: THREE.MeshStandardMaterial;
  screenDark: THREE.MeshStandardMaterial;
}

export function useOfficeMaterials(): OfficeMats {
  return useMemo(() => {
    // Task 51 (daylight): every surface re-tuned to the Daylight Slate law —
    // the noir palette (walls #37322c, wood #2b2015, ceiling #3a332b) measured
    // mean-luma 22–35/255. Light, warm, legible: אור = כנות.
    const concrete = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(), roughness: 0.5, metalness: 0.04, envMapIntensity: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.55, metalness: 0.04, envMapIntensity: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: '#b3916a', roughness: 0.6, metalness: 0.03 });
    const wall = new THREE.MeshStandardMaterial({ map: makeWallTexture('#eae3d7'), roughness: 0.94, metalness: 0 });
    const wallDark = new THREE.MeshStandardMaterial({ color: '#a89e90', roughness: 0.86, metalness: 0.02 });
    const metal = new THREE.MeshStandardMaterial({ map: makeBrushedMetalTexture(), color: '#b9bdc4', roughness: 0.34, metalness: 0.88, envMapIntensity: 1.1 });
    const marble = new THREE.MeshStandardMaterial({ map: makeMarbleTexture(), roughness: 0.24, metalness: 0.08, envMapIntensity: 1.2 });
    const fabric = new THREE.MeshStandardMaterial({ map: makeFabricTexture('#d8d4ca'), roughness: 0.94, metalness: 0 });
    const fabricTeal = new THREE.MeshStandardMaterial({ map: makeFabricTexture('#5c847b'), roughness: 0.94, metalness: 0 });
    const carpet = new THREE.MeshStandardMaterial({ map: makeCarpetTexture('#c6b99e'), roughness: 0.98, metalness: 0 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#dfeef0', transparent: true, opacity: 0.2, roughness: 0.06, metalness: 0,
      envMapIntensity: 1.7, side: THREE.DoubleSide, depthWrite: false,
    });
    const brass = new THREE.MeshStandardMaterial({ color: '#a67c3d', roughness: 0.32, metalness: 0.9, envMapIntensity: 1.2 });
    const glowWarm = new THREE.MeshStandardMaterial({ color: '#fff3da', emissive: '#ffd9a0', emissiveIntensity: 2.2, toneMapped: false });
    const screenDark = new THREE.MeshStandardMaterial({ color: '#0a0c10', roughness: 0.18, metalness: 0.4 });
    return { concrete, wood, woodDark, wall, wallDark, metal, marble, fabric, fabricTeal, carpet, glass, brass, glowWarm, screenDark };
  }, []);
}

// ─────────────── שטיח ───────────────
function FloorRug() {
  const carpet = useMemo(() => {
    const t = makeCarpetTexture('#cabfa6');
    t.repeat.set(1, 1); // גבול אחד — בלי חריצים
    return t;
  }, []);
  const rugTex = carpet;
  const [fx, fz] = to3(FLAME[0], FLAME[1]);
  const [rx, rz] = to3(RECEPTION.x, RECEPTION.y + 40);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[fx, 0.012, fz]} receiveShadow>
        <circleGeometry args={[4.6, 48]} />
        <meshStandardMaterial map={rugTex} roughness={0.98} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[rx, 0.012, rz]} receiveShadow>
        <planeGeometry args={[4.6, 2.6]} />
        <meshStandardMaterial map={rugTex} roughness={0.98} />
      </mesh>
    </group>
  );
}

// ─────────────── קיר מפלחים ───────────────
/**
 * בונה קיר מפלחי קופסאות סביב פתחים: מקטעים מלאים בין פתחים +
 * אדן מתחת לפתח + קורה מעל הפתח.
 */
function Wall({ spec, mats }: { spec: WallSpec; mats: OfficeMats }) {
  const L = LEN[spec.side];
  const parts = useMemo(() => {
    const sorted = [...spec.openings].sort((p, q) => p.a - q.a);
    const segs: { a: number; b: number; y0: number; y1: number }[] = [];
    let x = 0;
    for (const o of sorted) {
      if (o.a > x) segs.push({ a: x, b: o.a, y0: 0, y1: WALL_H });
      if (o.y0 > 0) segs.push({ a: o.a, b: o.b, y0: 0, y1: o.y0 });       // אדן
      if (o.y1 < WALL_H) segs.push({ a: o.a, b: o.b, y0: o.y1, y1: WALL_H }); // קורה
      x = o.b;
    }
    if (x < L) segs.push({ a: x, b: L, y0: 0, y1: WALL_H });
    return segs;
  }, [spec, L]);

  const geomFor = (s: { a: number; b: number; y0: number; y1: number }) => {
    const w = s.b - s.a, h = s.y1 - s.y0;
    return <boxGeometry args={[w, h, WALL_T]} />;
  };

  // מיקום וכיוון הקיר
  const place = (s: { a: number; b: number; y0: number; y1: number }): { pos: [number, number, number]; rotY: number } => {
    const mid = (s.a + s.b) / 2;
    const y = (s.y0 + s.y1) / 2;
    switch (spec.side) {
      case 'north': return { pos: [mid - L / 2, y, -PLAN_H * SCALE / 2 + WALL_T / 2], rotY: 0 };
      case 'south': return { pos: [mid - L / 2, y, PLAN_H * SCALE / 2 - WALL_T / 2], rotY: 0 };
      case 'west': return { pos: [-PLAN_W * SCALE / 2 + WALL_T / 2, y, mid - L / 2], rotY: Math.PI / 2 };
      case 'east': return { pos: [PLAN_W * SCALE / 2 - WALL_T / 2, y, mid - L / 2], rotY: Math.PI / 2 };
    }
  };

  return (
    <group>
      {parts.map((s, i) => {
        const { pos, rotY } = place(s);
        return (
          <mesh key={i} position={pos} rotation-y={rotY} castShadow={s.y1 - s.y0 > 1.5} receiveShadow>
            {geomFor(s)}
            <primitive object={mats.wall} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

// ─────────────── מילוי פתחים: זכוכית / תריס ───────────────
function OpeningFill({ side, o, mats, blinds }: { side: WallSpec['side']; o: Opening; mats: OfficeMats; blinds?: THREE.CanvasTexture }) {
  const w = o.b - o.a, h = o.y1 - o.y0;
  const mid = (o.a + o.b) / 2, y = (o.y0 + o.y1) / 2;
  const pos: [number, number, number] =
    side === 'west' ? [-PLAN_W * SCALE / 2 + WALL_T / 2, y, mid - LEN.west / 2] :
    side === 'south' ? [mid - LEN.south / 2, y, PLAN_H * SCALE / 2 - WALL_T / 2] : [0, 0, 0];
  const rotY = side === 'west' ? Math.PI / 2 : 0;
  void side;
  return (
    <group position={pos} rotation-y={rotY}>
      {o.kind !== 'door' && (
        <mesh>
          <planeGeometry args={[w - 0.1, h - 0.1]} />
          <primitive object={o.kind === 'blind' && blinds ? new THREE.MeshStandardMaterial({ map: blinds, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }) : mats.glass} attach="material" />
        </mesh>
      )}
      {o.kind === 'door' && (
        <group>
          {/* שני עלי זכוכית עם ידית מתכת */}
          {[-w / 4, w / 4].map((dx, i) => (
            <group key={i} position={[dx, 0, 0]}>
              <mesh>
                <planeGeometry args={[w / 2 - 0.06, h - 0.08]} />
                <primitive object={mats.glass} attach="material" />
              </mesh>
              <mesh position={[i === 0 ? 0.42 : -0.42, -0.12, 0.07]}>
                <cylinderGeometry args={[0.02, 0.02, 0.62, 10]} />
                <primitive object={mats.brass} attach="material" />
              </mesh>
              {/* משקוף עליון */}
            </group>
          ))}
          <mesh position={[0, (h + WALL_H) / 2 - 0.02, 0]}>
            <boxGeometry args={[w, WALL_H - h + 0.04, 0.1]} />
            <primitive object={mats.metal} attach="material" />
          </mesh>
        </group>
      )}
      {/* מסגרת */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w + 0.09, 0.07, WALL_T + 0.05]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
      <mesh position={[0, (o.y0 + o.y1) / 2, 0]}>
        <boxGeometry args={[0.07, h + 0.09, WALL_T + 0.05]} />
        <primitive object={mats.metal} attach="material" />
      </mesh>
    </group>
  );
}

// ─────────────── תקרה ───────────────
function Ceiling({ mats }: { mats: OfficeMats }) {
  const W = PLAN_W * SCALE, H = PLAN_H * SCALE;
  const [fx, fz] = to3(FLAME[0], FLAME[1]);
  return (
    <group position-y={WALL_H}>
      {/* עיטוף בהיר — Task 51: תקרת יום (הייתה #3a332b ונעלמה בחושך) */}
      <mesh rotation-x={Math.PI / 2} position-y={0.02}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#f1ede4" roughness={0.95} />
      </mesh>
      {/* גיאת אור היקפית — פסים אמיסיביים לאורך הקירות */}
      {([
        { p: [0, -0.05, -H / 2 + 0.5] as [number, number, number], s: [W - 1.2, 0.1, 0.24] as [number, number, number] },
        { p: [0, -0.05, H / 2 - 0.5] as [number, number, number], s: [W - 1.2, 0.1, 0.24] as [number, number, number] },
        { p: [-W / 2 + 0.5, -0.05, 0] as [number, number, number], s: [0.24, 0.1, H - 1.2] as [number, number, number] },
        { p: [W / 2 - 0.5, -0.05, 0] as [number, number, number], s: [0.24, 0.1, H - 1.2] as [number, number, number] },
      ] as const).map((c, i) => (
        <mesh key={i} position={c.p}>
          <boxGeometry args={c.s} />
          <primitive object={mats.glowWarm} attach="material" />
        </mesh>
      ))}
      {/* טבעת אור סביב הלהבה */}
      <mesh position={[fx, -0.06, fz]} rotation-x={Math.PI / 2}>
        <ringGeometry args={[2.1, 2.34, 64]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffc069" emissiveIntensity={2.2} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─────────────── דלתות ───────────────
function EntranceDoors({ mats }: { mats: OfficeMats }) {
  void mats;
  return null; // ממומש בתוך OpeningFill (door)
}

// ─────────────── צמח ───────────────
function Plant({ px, py, mats }: { px: number; py: number; mats: OfficeMats }) {
  const [x, z] = to3(px, py);
  const leaves = useMemo(() => {
    const arr: { pos: [number, number, number]; s: number; r: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      arr.push({ pos: [Math.cos(a) * 0.16, 0.5 + Math.random() * 0.35, Math.sin(a) * 0.16], s: 0.3 + Math.random() * 0.22, r: Math.random() * 0.7 });
    }
    return arr;
  }, []);
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.24} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.42, 14]} />
        <primitive object={mats.wallDark} attach="material" />
      </mesh>
      <mesh position-y={0.47}>
        <cylinderGeometry args={[0.19, 0.19, 0.05, 14]} />
        <primitive object={mats.brass} attach="material" />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={[l.r * 0.5, l.r * 2, l.r]} castShadow>
          <coneGeometry args={[l.s * 0.36, l.s * 1.7, 6]} />
          <meshStandardMaterial color={i % 2 ? '#4a7a42' : '#578a4c'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
