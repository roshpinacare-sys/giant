/**
 * Realism.tsx — שכבת-הריאליזם של המשרד (יבוא מלא של דרישות-הבעלים על הבסיס המקצועי).
 * ---------------------------------------------------------------------------
 * · שעון-קיר חי — מחוגי שעה/דקה/שנייה לפי שעון-ירושלים בפועל (לא איור).
 * · אדני-חלונות — מדף-אבן בולט תחת כל חלון (דרום ×2, מערב ×2) + עציץ-סוקולנט.
 * · שטיח-כניסה ממוסגר-פליז מול דלתות-הזכוכית (השלט-עצמו = ניאון הכניסה הקיים).
 * · DeskSet — ניירות-עבודה, עט-פליז וכוס-קפה מאדה על כל שולחן צוות
 *   (מורכב בתוך המסגרת-המקומית של WorkDesk ב-Stations).
 * · CoffeeLife — מגבות-מוקפלות, מגש-הגשה ואדים ממכונת-הקפה
 *   (מורכב בתוך המסגרת-המקומית של CoffeeBar ב-Stations).
 * · LeadDeskProps — תיק-עבודות, נייר ושתי כוסות על שולחן ראש-המטה.
 * אפס נכסי-רשת — הכל קנבס/גיאומטריה פרוצדורלית (חוק-החדר). אפס ריחוף:
 * כל-פריט נולד מהמשטח שלו (שולחן 0.765 / דלפק 1.085 / אדן 0.92 / רצפה 0).
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { to3, LEAD_TABLE } from '@/lib/hq/contract';
import type { OfficeMats } from './Architecture';

const PLAN_HALF_Z = 6.25; // PLAN_H*SCALE/2 (חצי-עומק האולם במטרים)

// ─────────────── טקסטורות פרוצדורליות (מונוטון — עותק אחד לכל-החדר) ───────────────
let paperTex: THREE.CanvasTexture | null = null;
function paperTexture(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 136;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f6f3ea'; c.fillRect(0, 0, 96, 136);
  c.fillStyle = '#d8d2c2'; c.fillRect(8, 10, 52, 7);          // שורת-כותרת
  c.fillStyle = '#b9b2a0';
  for (let i = 0; i < 9; i++) c.fillRect(8, 30 + i * 11, 80 - (i % 3) * 14, 2.5);
  paperTex = new THREE.CanvasTexture(cv);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

let steamTex: THREE.CanvasTexture | null = null;
function steamTexture(): THREE.CanvasTexture {
  if (steamTex) return steamTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  steamTex = new THREE.CanvasTexture(cv);
  steamTex.colorSpace = THREE.SRGBColorSpace;
  return steamTex;
}

// ─────────────── אדים — צלב-מישורים עולה ונעלם (עדין, לא הצגה) ───────────────
export function SteamWisp({ position, height = 0.28, size = 0.08, phase = 0 }: {
  position: [number, number, number];
  height?: number; size?: number; phase?: number;
}) {
  const tex = useMemo(() => steamTexture(), []);
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = (clock.getElapsedTime() * 0.3 + phase) % 1;
    g.current.position.set(position[0], position[1] + t * height, position[2]);
    const s = size * (1 + t * 0.9);
    g.current.scale.set(s, s, s);
    for (const mesh of g.current.children as THREE.Mesh[]) {
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(t / 0.12, 1) * (1 - t) * 0.55;
    }
  });
  return (
    <group ref={g}>
      <mesh><planeGeometry args={[1, 1.7]} /><meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0} toneMapped={false} /></mesh>
      <mesh rotation-y={Math.PI / 2}><planeGeometry args={[1, 1.7]} /><meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0} toneMapped={false} /></mesh>
    </group>
  );
}

// ─────────────── שעון-קיר חי (שעון-ירושלים בפועל) ───────────────
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
function jerusalemHMS(): [number, number, number] {
  const parts = timeFmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) || 0;
  return [get('hour'), get('minute'), get('second')];
}

export function WallClock() {
  const hourRef = useRef<THREE.Group>(null);
  const minRef = useRef<THREE.Group>(null);
  const secRef = useRef<THREE.Group>(null);
  const lastBucket = useRef(-1);
  useFrame(() => {
    const bucket = Math.floor(performance.now() / 200);
    if (bucket === lastBucket.current) return;
    lastBucket.current = bucket;
    const [h, m, s] = jerusalemHMS();
    const frac = (performance.now() % 200) / 200;
    if (hourRef.current) hourRef.current.rotation.z = -(((h % 12) + m / 60) / 12) * Math.PI * 2;
    if (minRef.current) minRef.current.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
    if (secRef.current) secRef.current.rotation.z = -(((s + frac * 0.2) / 60) * Math.PI * 2);
  });
  return (
    <group position={[2.06, 2.5, -PLAN_HALF_Z + 0.26]}>
      {/* מסגרת פליז + פאה */}
      <mesh castShadow><torusGeometry args={[0.21, 0.022, 12, 40]} /><meshStandardMaterial color="#a67c3d" roughness={0.32} metalness={0.9} /></mesh>
      <mesh position-z={0.008}><circleGeometry args={[0.205, 40]} /><meshStandardMaterial color="#f7f3e8" roughness={0.55} /></mesh>
      {/* 12 סימני-שעה */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const major = i % 3 === 0;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.172, Math.cos(a) * 0.172, 0.014]} rotation-z={-a}>
            <boxGeometry args={[0.008, major ? 0.038 : 0.022, 0.006]} />
            <meshStandardMaterial color="#2a2520" roughness={0.5} />
          </mesh>
        );
      })}
      {/* מחוגים — מסתובבים בזמן-אמת */}
      <group ref={hourRef} position-z={0.018}>
        <mesh position-y={0.048}><boxGeometry args={[0.014, 0.096, 0.006]} /><meshStandardMaterial color="#2a2520" roughness={0.5} /></mesh>
      </group>
      <group ref={minRef} position-z={0.022}>
        <mesh position-y={0.072}><boxGeometry args={[0.01, 0.144, 0.005]} /><meshStandardMaterial color="#2a2520" roughness={0.5} /></mesh>
      </group>
      <group ref={secRef} position-z={0.026}>
        <mesh position-y={0.076}><boxGeometry args={[0.004, 0.152, 0.004]} /><meshStandardMaterial color="#b4553a" roughness={0.4} /></mesh>
      </group>
      <mesh position-z={0.03} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.012, 0.012, 0.014, 12]} /><meshStandardMaterial color="#a67c3d" metalness={0.9} roughness={0.3} /></mesh>
    </group>
  );
}
// ─────────────── אדני-חלונות + סוקולנטים ───────────────
/** קואורדינטות שנמדדו מ-WALL_SPECS ב-Architecture:
 *  דרום — פנים z=6.01, חלונות x=-6.2..-3.6 ו-3.6..6.2; מערב — פנים x=-9.76,
 *  חלונות z=-5.15..-2.55 ו-1.85..4.45. מדף: עובי 0.04, בולט 0.18, ראש 0.92. */
function Sills() {
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cdc5b2', roughness: 0.85, metalness: 0.02 }), []);
  const pot = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b5764f', roughness: 0.62 }), []);
  const leaf = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5f7d52', roughness: 0.8 }), []);
  const leaf2 = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4c6a44', roughness: 0.8 }), []);
  const potAt = (px: number, py: number, pz: number, k: number) => (
    <group key={k} position={[px, py, pz]} rotation-y={k * 1.3}>
      <mesh position-y={0.04} castShadow><cylinderGeometry args={[0.055, 0.044, 0.08, 12]} /><primitive object={pot} attach="material" /></mesh>
      <mesh position-y={0.095} scale={[1, 0.72, 1]} castShadow><sphereGeometry args={[0.055, 10, 8]} /><primitive object={leaf} attach="material" /></mesh>
      <mesh position={[0.035, 0.115, 0.02]} scale={[1, 0.6, 1]}><sphereGeometry args={[0.032, 8, 6]} /><primitive object={leaf2} attach="material" /></mesh>
    </group>
  );
  return (
    <group>
      {/* דרום ×2 */}
      {[-4.9, 4.9].map((cx, i) => (
        <group key={`s${i}`}>
          <mesh position={[cx, 0.9, 5.93]} castShadow receiveShadow><boxGeometry args={[3.16, 0.04, 0.2]} /><primitive object={stone} attach="material" /></mesh>
          {potAt(cx + 1.22, 0.92, 5.91, i)}
        </group>
      ))}
      {/* מערב ×2 */}
      {[-3.85, 3.15].map((cz, i) => (
        <group key={`w${i}`}>
          <mesh position={[-9.86, 0.9, cz]} castShadow receiveShadow><boxGeometry args={[0.2, 0.04, 2.74]} /><primitive object={stone} attach="material" /></mesh>
          {potAt(-9.84, 0.92, cz + 0.98, i + 2)}
        </group>
      ))}
    </group>
  );
}

// ─────────────── שטיח-כניסה ממוסגר-פליז ───────────────
function EntranceMat() {
  return (
    <group position={[0, 0, 5.5]} rotation-y={0}>
      <mesh position-y={0.008} receiveShadow><boxGeometry args={[1.84, 0.012, 1.04]} /><meshStandardMaterial color="#a67c3d" roughness={0.4} metalness={0.75} /></mesh>
      <mesh position-y={0.02} receiveShadow><boxGeometry args={[1.72, 0.02, 0.92]} /><meshStandardMaterial color="#37322c" roughness={0.98} /></mesh>
    </group>
  );
}

// ─────────────── שולחן ראש-המטה: תיק, נייר, כוסות ───────────────
function LeadDeskProps() {
  const paper = paperTexture();
  const [x, z] = to3(LEAD_TABLE.x, LEAD_TABLE.y); // ראש השולחן 0.78
  const cup = (px: number, pz: number, k: number) => (
    <group key={k} position={[px, 0.78, pz]}>
      <mesh position-y={0.04} castShadow><cylinderGeometry args={[0.033, 0.028, 0.08, 12]} /><meshStandardMaterial color="#ece7dc" roughness={0.35} /></mesh>
      <mesh position-y={0.078}><cylinderGeometry args={[0.026, 0.026, 0.004, 12]} /><meshStandardMaterial color="#4a3122" roughness={0.25} /></mesh>
    </group>
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[-0.3, 0.7815, 0.2]} rotation={[-Math.PI / 2, 0, 0.42]}>
        <planeGeometry args={[0.21, 0.297]} /><meshStandardMaterial map={paper} roughness={0.9} />
      </mesh>
      {/* תיק-עבודות מונח (לא מרחף — על המשטח) */}
      <mesh position={[0.32, 0.788, 0.12]} rotation-y={0.2} castShadow>
        <boxGeometry args={[0.25, 0.016, 0.33]} />
        <meshStandardMaterial color="#8a5c3a" roughness={0.65} />
      </mesh>
      {cup(0.36, -0.32, 0)}
      {cup(-0.42, -0.08, 1)}
      <SteamWisp position={[0.36, 0.87, -0.32]} height={0.2} size={0.05} phase={0.7} />
    </group>
  );
}

// ─────────────── מה מורכב בשורש ───────────────
export function Realism() {
  return (
    <group>
      <WallClock />
      <Sills />
      <EntranceMat />
      <LeadDeskProps />
    </group>
  );
}

// ─────────────── לתוך WorkDesk (מסגרת-מקומית: משטח 0.765) ───────────────
export function DeskSet() {
  const paper = paperTexture();
  return (
    <group>
      {/* שני ניירות-עבודה מונחים */}
      <mesh position={[-0.42, 0.7665, 0.2]} rotation={[-Math.PI / 2, 0, 0.16]}>
        <planeGeometry args={[0.21, 0.297]} /><meshStandardMaterial map={paper} roughness={0.9} />
      </mesh>
      <mesh position={[-0.405, 0.7675, 0.21]} rotation={[-Math.PI / 2, 0, -0.07]}>
        <planeGeometry args={[0.21, 0.297]} /><meshStandardMaterial map={paper} roughness={0.9} />
      </mesh>
      {/* עט פליז מונח */}
      <mesh position={[-0.27, 0.7695, 0.1]} rotation={[0, 0.5, Math.PI / 2]}>
        <cylinderGeometry args={[0.0045, 0.0045, 0.14, 8]} />
        <meshStandardMaterial color="#a67c3d" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* כוס-קפה + אדים עדינים */}
      <group position={[0.5, 0.765, 0.08]}>
        <mesh position-y={0.0425} castShadow><cylinderGeometry args={[0.036, 0.03, 0.085, 14]} /><meshStandardMaterial color="#ece7dc" roughness={0.35} /></mesh>
        <mesh position-y={0.083}><cylinderGeometry args={[0.028, 0.028, 0.004, 14]} /><meshStandardMaterial color="#4a3122" roughness={0.25} /></mesh>
        <mesh position={[0.041, 0.05, 0]} rotation-z={Math.PI / 2}><torusGeometry args={[0.022, 0.005, 8, 14, Math.PI]} /><meshStandardMaterial color="#ece7dc" roughness={0.35} /></mesh>
      </group>
      <SteamWisp position={[0.5, 0.86, 0.08]} height={0.2} size={0.05} phase={0.3} />
    </group>
  );
}

// ─────────────── לתוך CoffeeBar (מסגרת-מקומית: דלפק 1.085) ───────────────
export function CoffeeLife({ mats }: { mats: OfficeMats }) {
  return (
    <group>
      {/* מגבות מוקפלות — ערימה מסודרת על הדלפק */}
      <group position={[0.95, 1.085, -0.08]}>
        <mesh position-y={0.018} rotation-y={0.04} castShadow><boxGeometry args={[0.36, 0.036, 0.24]} /><primitive object={mats.fabric} attach="material" /></mesh>
        <mesh position-y={0.053} rotation-y={-0.06} castShadow><boxGeometry args={[0.35, 0.036, 0.23]} /><primitive object={mats.fabricTeal} attach="material" /></mesh>
        <mesh position-y={0.088} rotation-y={0.09} castShadow><boxGeometry args={[0.34, 0.036, 0.22]} /><primitive object={mats.fabric} attach="material" /></mesh>
      </group>
      {/* מגש-הגשה עם שתי כוסות */}
      <group position={[0.35, 1.085, 0.14]}>
        <mesh position-y={0.008} castShadow><cylinderGeometry args={[0.16, 0.15, 0.016, 20]} /><primitive object={mats.brass} attach="material" /></mesh>
        {[-0.055, 0.055].map((dx, i) => (
          <group key={i} position={[dx, 0.016, 0]}>
            <mesh position-y={0.04} castShadow><cylinderGeometry args={[0.032, 0.027, 0.08, 12]} /><meshStandardMaterial color="#ece7dc" roughness={0.35} /></mesh>
            <mesh position-y={0.079}><cylinderGeometry args={[0.025, 0.025, 0.004, 12]} /><meshStandardMaterial color="#4a3122" roughness={0.25} /></mesh>
          </group>
        ))}
      </group>
      {/* אדים ממכונת-הקפה */}
      <SteamWisp position={[-1, 1.32, 0.12]} height={0.3} size={0.09} phase={0} />
      <SteamWisp position={[-0.92, 1.3, 0.02]} height={0.26} size={0.07} phase={0.5} />
    </group>
  );
}
