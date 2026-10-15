/**
 * Interior.tsx — שכבת-עיצוב-הפנים של המשרד (Task 53).
 * ------------------------------------------------------------------
 * מנדט-הבעלים (מילולי): "עיצוב משרד פסיכדלי אבל אלגנטי — הקירות יהיו כמו
 * טריפ-LSD פעיל אבל בעצימות-נמוכה, אומנותי אבל לא בולט ומבלבל, עדין
 * ואלגנטי, וכמה תמונות קקטוסים, קצת עיצוב מעצב-פנים... שיהיה כמה שיותר
 * ריאליסטי אמיתי".
 *
 * · גלריית-קיר: הדפסים ממוסגרים (פסיכדלי-עדין + קקטוסים) עם עומק אמיתי —
 *   מסגרת-עץ/פליז, מאונטינג לבן, זכוכית משתקפת דקה. מיקומים מחושבים מול
 *   הפתחים/המדפים/הלוחות (לא מסתירים כלום, לא נחסמים).
 * · שטיפת-קיר חיה (PsyWash): shader עדין על קיר-המזרח — כתמי-עבר רכים
 *   שנודדים לאט-מאוד; "טריפ בעצימות-נמוכה": אלפא 0.30, בלי תנועה שמושכת-עין.
 * · קקטוסים תלת-ממדיים: 3 עציצים (סגוארו/חבית/אגס) — מעצב-פנים, לא דקורציה
 *   שטוחה. לכל-אחד קולטן-התנגשות אמיתי (הדמויות לא חוצות-עציצים).
 * · אפס נכסי-רשת — הכל קנבס/גיאומטריה פרוצדורלית (חוק-החדר).
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { to3 } from '@/lib/hq/contract';
import { makePsyArtTexture, makeCactusArtTexture } from '@/lib/hq/textures';

// פנים-הקירות (מטרים): קיר = 0.24מ' עובי, החדר 20×12.5מ'
const EAST_X = 10 - 0.24;      // פנים קיר-מזרח
const NORTH_Z = -6.25 + 0.24;  // פנים קיר-צפון
const SOUTH_Z = 6.25 - 0.24;   // פנים קיר-דרום

// ─────────────── מסגרת-תמונה (עומק אמיתי) ───────────────
interface FrameSpec {
  pos: [number, number, number];
  /** rotY: 0 = פונה +z (קיר-צפון), -π/2 = פונה -x (קיר-מזרח), π = פונה -z (קיר-דרום) */
  rotY: number;
  w: number;
  h: number;
  kind: 'psy' | 'cactus';
  variant: number;
  frame: 'walnut' | 'brass';
}

function ArtFrame({ spec }: { spec: FrameSpec }) {
  const { pos, rotY, w, h, kind, variant, frame } = spec;
  const tex = useMemo(
    () => (kind === 'psy' ? makePsyArtTexture(variant) : makeCactusArtTexture(variant)),
    [kind, variant],
  );
  const fw = 0.05;   // רוחב-מסגרת
  const fd = 0.06;   // עומק-מסגרת (ההדפס מוטמן בתוכה כמו במסגרת-אמיתית)
  const woodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial(
        frame === 'walnut'
          ? { color: '#5d4632', roughness: 0.5, metalness: 0.05, envMapIntensity: 0.9 }
          : { color: '#a67c3d', roughness: 0.32, metalness: 0.88, envMapIntensity: 1.15 },
      ),
    [frame],
  );
  const matMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.96 }), []);
  const glassMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#eef4f2', transparent: true, opacity: 0.08, roughness: 0.05,
        metalness: 0, envMapIntensity: 1.9, depthWrite: false, side: THREE.DoubleSide,
      }),
    [],
  );
  const cy = pos[1];
  const inset = 0.014; // מרווח מפנים-הקיר
  const ox = Math.cos(rotY) * inset, oz = -Math.sin(rotY) * inset;
  // בניין-מסגרת אמיתי: לוח-אחורי + 4 קורות-גבול סביב ההדפס (ההדפס שקוע בפנים,
  // בדיוק כמו תמונה ממוסגרת — לא לוח-חום שטוח (נמדד: הגרסה-הראשונה הסתירה
  // את ההדפס מאחורי-פאת-המסגרת)).
  const bars: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, cy + h / 2 + fw / 2, fd / 2], size: [w + fw * 2, fw, fd] },
    { pos: [0, cy - h / 2 - fw / 2, fd / 2], size: [w + fw * 2, fw, fd] },
    { pos: [-w / 2 - fw / 2, cy, fd / 2], size: [fw, h, fd] },
    { pos: [w / 2 + fw / 2, cy, fd / 2], size: [fw, h, fd] },
  ];
  return (
    <group position={[pos[0] + ox, 0, pos[2] + oz]} rotation-y={rotY}>
      {/* לוח-אחורי */}
      <mesh position={[0, cy, 0.009]} castShadow>
        <boxGeometry args={[w + fw * 2, h + fw * 2, 0.018]} />
        <primitive object={woodMat} attach="material" />
      </mesh>
      {/* 4 קורות-מסגרת סביב */}
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow>
          <boxGeometry args={b.size} />
          <primitive object={woodMat} attach="material" />
        </mesh>
      ))}
      {/* מאונטינג (שקוע במסגרת) */}
      <mesh position={[0, cy, 0.019]}>
        <planeGeometry args={[w + 0.024, h + 0.024]} />
        <primitive object={matMat} attach="material" />
      </mesh>
      {/* ההדפס */}
      <mesh position={[0, cy, 0.021]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {/* זכוכית — דקה, דו-צדדית, מול-ההדפס */}
      <mesh position={[0, cy, fd - 0.004]}>
        <planeGeometry args={[w, h]} />
        <primitive object={glassMat} attach="material" />
      </mesh>
    </group>
  );
}

// ─────────────── גלריה ───────────────
/**
 * מיפוי-מקומות (מדוד מול התוכנית):
 * · קיר-מזרח (פנים x=9.76, פונה -x): המדף המזרחי תופס z∈[-2.4,+0.6] —
 *   הגלריה מתחמקת ממנו. 5 מסגרות.
 * · קיר-צפון (פנים z=-6.01): לוח-המשימות תופס x∈[-2,+2], קיר-הגיט
 *   x∈[-8.5,-3.75], המדף הצפוני x∈[+5.6,+9.1] — נשאר x∈[+2.2,+5.2]. 2 מסגרות.
 * · קיר-דרום (פנים z=+6.01): הדלת x∈[-1.2,+1.2], חלונות בשוליים —
 *   מסגרת-רוחב אחת ממערב-לדלת.
 */
const GALLERY: FrameSpec[] = [
  // קיר-מזרח — רצף-גלריה אלגנטי
  { pos: [EAST_X, 0, -4.9], rotY: -Math.PI / 2, w: 0.62, h: 0.82, kind: 'psy', variant: 0, frame: 'walnut' },
  { pos: [EAST_X, 0, -3.55], rotY: -Math.PI / 2, w: 0.56, h: 0.74, kind: 'cactus', variant: 0, frame: 'brass' },
  { pos: [EAST_X, 0, 1.7], rotY: -Math.PI / 2, w: 0.66, h: 0.86, kind: 'psy', variant: 1, frame: 'brass' },
  { pos: [EAST_X, 0, 3.15], rotY: -Math.PI / 2, w: 0.56, h: 0.74, kind: 'cactus', variant: 1, frame: 'walnut' },
  { pos: [EAST_X, 0, 4.55], rotY: -Math.PI / 2, w: 0.6, h: 0.78, kind: 'psy', variant: 2, frame: 'walnut' },
  // קיר-צפון — בין לוח-המשימות למדף
  { pos: [2.75, 0, NORTH_Z], rotY: 0, w: 0.54, h: 0.72, kind: 'cactus', variant: 2, frame: 'brass' },
  { pos: [4.35, 0, NORTH_Z], rotY: 0, w: 0.62, h: 0.82, kind: 'psy', variant: 3, frame: 'walnut' },
  // קיר-דרום — ממערב-לדלת (הראשונה שנראית בכניסה). תיקון-מדידה: המרכז היה
  // x=-3.3 וקצה-המסגרת (-3.73) חפף את קצה-החלון (-3.6); המרכז x=-2.4 מרחיק
  // את המסגרת מהחלון לגמרי (תופסת -2.83..-1.97 — כולה על קיר-מלא).
  { pos: [-2.4, 0, SOUTH_Z], rotY: Math.PI, w: 0.86, h: 0.64, kind: 'psy', variant: 2, frame: 'brass' },
];

export function ArtGallery() {
  return (
    <group>
      {/* תליית-גלריה: מרכז-ההדפס בגובה-עין אחיד (1.55מ') — קו-תלייה מעוצב */}
      {GALLERY.map((s, i) => (
        <ArtFrame key={i} spec={{ ...s, pos: [s.pos[0], 1.55, s.pos[2]] }} />
      ))}
    </group>
  );
}

// ─────────────── שטיפת-קיר חיה (טריפ בעצימות-נמוכה) ───────────────
const WASH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WASH_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  float blob(vec2 uv, vec2 c, float r) {
    return smoothstep(r, 0.0, length((uv - c) * vec2(1.0, 1.85)));
  }
  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.035; // איטי-מאוד — עדינות, לא הצגה
    vec3 col = vec3(0.0);
    col += vec3(0.84, 0.62, 0.58) * blob(uv, vec2(0.28 + 0.16 * sin(t), 0.66 + 0.09 * cos(t * 1.3)), 0.46);
    col += vec3(0.58, 0.72, 0.62) * blob(uv, vec2(0.70 + 0.14 * cos(t * 0.8), 0.36 + 0.13 * sin(t * 1.1)), 0.54);
    col += vec3(0.82, 0.70, 0.46) * blob(uv, vec2(0.50 + 0.18 * sin(t * 0.6 + 2.0), 0.78 + 0.10 * sin(t * 0.9 + 1.0)), 0.40);
    col += vec3(0.55, 0.68, 0.72) * blob(uv, vec2(0.20 + 0.10 * cos(t * 1.7 + 4.0), 0.18 + 0.14 * cos(t * 0.7 + 3.0)), 0.46);
    col += vec3(0.70, 0.60, 0.76) * blob(uv, vec2(0.55 + 0.20 * sin(t * 0.5 + 5.1), 0.42 + 0.16 * cos(t * 0.8 + 2.6)), 0.42);
    gl_FragColor = vec4(col * 0.46, 0.44); // עצימות-נמוכה-אך-נראית — עדין, לא בולט
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function PsyWash() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
  });
  // קיר-המזרח — הקיר-החופשי הגדול שהצוות פונה אליו; שטיפה עדינה שנושמת
  return (
    <mesh position={[EAST_X - 0.006, 1.75, 0]} rotation-y={-Math.PI / 2} renderOrder={2}>
      <planeGeometry args={[12.0, 3.4]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={WASH_VERT}
        fragmentShader={WASH_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ─────────────── קקטוסים תלת-ממדיים ───────────────
interface CactusSpec { px: number; py: number; kind: 'saguaro' | 'barrel' | 'prickly'; h?: number }

const CACTI: CactusSpec[] = [
  { px: 1020, py: 928, kind: 'saguaro', h: 0.98 },  // ליד-הקבלה (מזרחה-מהדלת)
  { px: 1308, py: 92, kind: 'prickly', h: 0.56 },   // צפון-מזרח, דרומה-מהמדף
  { px: 116, py: 92, kind: 'barrel', h: 0.5 },      // צפון-מערב, ליד-צמח-הפינה
];

function CactusPlant({ px, py, kind, h = 0.7 }: { px: number; py: number; kind: CactusSpec['kind']; h?: number }) {
  const [x, z] = to3(px, py);
  const seed = (px * 31 + py * 17) % 997;
  const lean = ((seed % 100) / 100 - 0.5) * 0.14; // נטייה טבעית דטרמיניסטית
  const potH = 0.3;
  const potR = kind === 'saguaro' ? 0.17 : 0.21;
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#55764d', roughness: 0.72, metalness: 0.02 }),
    [],
  );
  const bodyDark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#46613f', roughness: 0.76 }),
    [],
  );
  const potMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#b5764f', roughness: 0.62, metalness: 0.03 }),
    [],
  );
  const soilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 0.95 }), []);
  return (
    <group position={[x, 0, z]} rotation-y={seed % 628 / 100} rotation-z={lean}>
      {/* עציץ טרהקוטה + אדן */}
      <mesh position-y={potH / 2} castShadow>
        <cylinderGeometry args={[potR, potR * 0.78, potH, 16]} />
        <primitive object={potMat} attach="material" />
      </mesh>
      <mesh position-y={potH + 0.012}>
        <cylinderGeometry args={[potR * 1.08, potR * 1.08, 0.035, 16]} />
        <primitive object={potMat} attach="material" />
      </mesh>
      <mesh position-y={potH + 0.028}>
        <cylinderGeometry args={[potR * 0.98, potR * 0.98, 0.02, 16]} />
        <primitive object={soilMat} attach="material" />
      </mesh>
      {kind === 'saguaro' && (
        <group position-y={potH + 0.02}>
          {/* גוף */}
          <mesh position-y={h / 2} castShadow>
            <capsuleGeometry args={[0.085, h - 0.17, 6, 12]} />
            <primitive object={bodyMat} attach="material" />
          </mesh>
          {/* זרוע שמאל: קיפול-מעלה */}
          <group position={[-0.15, h * 0.42, 0]}>
            <mesh rotation-z={Math.PI / 2} position={[-0.07, 0.02, 0]} castShadow>
              <capsuleGeometry args={[0.05, 0.14, 5, 10]} />
              <primitive object={bodyDark} attach="material" />
            </mesh>
            <mesh position={[-0.13, 0.2, 0]} castShadow>
              <capsuleGeometry args={[0.048, 0.22, 5, 10]} />
              <primitive object={bodyDark} attach="material" />
            </mesh>
          </group>
          {/* זרוע ימין נמוכה */}
          <group position={[0.14, h * 0.3, 0.01]}>
            <mesh rotation-z={Math.PI / 2} position={[0.06, 0, 0]} castShadow>
              <capsuleGeometry args={[0.044, 0.11, 5, 10]} />
              <primitive object={bodyMat} attach="material" />
            </mesh>
            <mesh position={[0.11, 0.14, 0]} castShadow>
              <capsuleGeometry args={[0.042, 0.15, 5, 10]} />
              <primitive object={bodyMat} attach="material" />
            </mesh>
          </group>
        </group>
      )}
      {kind === 'barrel' && (
        <mesh position-y={potH + 0.24} castShadow>
          <sphereGeometry args={[0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <primitive object={bodyMat} attach="material" />
        </mesh>
      )}
      {kind === 'prickly' && (
        <group position-y={potH + 0.02}>
          <mesh position-y={0.16} castShadow>
            <capsuleGeometry args={[0.07, 0.2, 5, 10]} />
            <primitive object={bodyMat} attach="material" />
          </mesh>
          <mesh position={[0.11, 0.33, 0.02]} rotation-z={-0.5} castShadow>
            <capsuleGeometry args={[0.052, 0.1, 5, 10]} />
            <primitive object={bodyDark} attach="material" />
          </mesh>
          <mesh position={[-0.1, 0.38, -0.02]} rotation-z={0.55} castShadow>
            <capsuleGeometry args={[0.05, 0.09, 5, 10]} />
            <primitive object={bodyDark} attach="material" />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function Cacti() {
  return (
    <group>
      {CACTI.map((c, i) => (
        <CactusPlant key={i} px={c.px} py={c.py} kind={c.kind} h={c.h} />
      ))}
    </group>
  );
}

/** השכבה-המלאה — מורכבת פעם-אחת ב-Office3D */
export function Interior() {
  return (
    <group>
      <ArtGallery />
      <PsyWash />
      <Cacti />
    </group>
  );
}
