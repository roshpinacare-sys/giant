/**
 * Atmosphere.tsx — תאורת המשרד — מיזוג שתי-המסלולות (11-a ∩ exec-14).
 * ------------------------------------------------------------------
 * חוק אור-היום (DESIGN.md §0.1 — אור = כנות): חדר כהה מסתיר מידע; חדר בהיר
 * הוא המידע. הפנים נשאר בהיר-חוק בכל שעה.
 * · Task 11-a: היררכיית-אור מלאה — key/fill/rim + צללי-מגע (ContactShadows)
 *   + מיקרו-תנודה עדינה (נוכחות-חיה בלי רעש).
 * · exec-14 (מיזוג): השמש נמדדת — שלבי-שמש לפי השעון האמיתי באסיה/ירושלים
 *   (Intl, לא שעון-דפדפן): זריחה 05–08 · בוקר 08–11 · צהריים 11–15 ·
 *   אחר-צהריים 15–18 · ערב 18–21 · שעות-מחוץ (21–05) — פנים נשאר בהיר-חוק
 *   (מילוי ניטרלי-קר), השמש נמוכה בחוץ. התנודה העדינה של 11-a נשמרת
 *   כווריאציה-מיקרו בתוך השלב הנמדד — הסיור תפאורה, השעות הן אמת.
 * · מעבר-שלב: החלקה מרוסנת 2ש' (ease in-out) · הערכה מחדש כל 5 דקות.
 * · תקציב-תאורה: אותם גופי-אור ממשימה 45/11-a (rim סטטי) + 2 מישורי-גוון
 *   שקופים מעל קו-הרקיע (לא גופי-אור — בלי צללים, בלי depthWrite).
 * · window.__hqSun = { phase, sunPos, intensity } — ל-probe (DESIGN.md §0).
 */
'use client';
/* eslint-disable react-hooks/immutability */
// המותאם כאן: סינגלטון-מודול (hqSun) שאינו מצב-hook — תבנית-השמש החיה של exec-14.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { PLAN_H, SCALE } from '@/lib/hq/contract';

// tmp (מחוץ לקומפוננטה — בלי הקצאות בפריים)
const tmpVec = new THREE.Vector3();
const tmpC = new THREE.Color();

export type SunPhase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'off';

/** מפרט שלב שמש — ערכי-הבסיס ממשימה 51/11-a; העמדות נגזרו מגיאוגרפיה של יום */
interface PhaseSpec {
  phase: SunPhase;
  sunPos: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  fillColor: string;
  fillIntensity: number;
  pointColor: string;
  pointIntensity: number;
  spotIntensity: number;
  /** גוון-שמיים עדין מעל קו-הרקיע (כיסוי שקוף — לא גוף-אור) */
  overlayColor: string;
  overlayOpacity: number;
}

const PHASES: Record<SunPhase, PhaseSpec> = {
  dawn: {
    phase: 'dawn',
    sunPos: [9.0, 2.6, 5.2],
    sunColor: '#ffd9b0', sunIntensity: 1.9,
    hemiSky: '#f3ecdf', hemiGround: '#cfc6b6', hemiIntensity: 3.05,
    ambientColor: '#cfc4b4', ambientIntensity: 1.22,
    fillColor: '#e8e4da', fillIntensity: 1.15,
    pointColor: '#ffcf9e', pointIntensity: 1.1,
    spotIntensity: 2.1,
    overlayColor: '#f7d9b0', overlayOpacity: 0.16,
  },
  morning: {
    phase: 'morning',
    sunPos: [7.5, 6.4, 5.8],
    sunColor: '#ffedd0', sunIntensity: 2.4,
    hemiSky: '#f6f0e2', hemiGround: '#cfc6b6', hemiIntensity: 3.15,
    ambientColor: '#c6bfb1', ambientIntensity: 1.18,
    fillColor: '#e2e8ec', fillIntensity: 1.05,
    pointColor: '#ffcf9e', pointIntensity: 1.15,
    spotIntensity: 2.1,
    overlayColor: '#f3e2c2', overlayOpacity: 0.1,
  },
  noon: {
    phase: 'noon',
    sunPos: [-2.2, 10.4, 4.6],
    sunColor: '#fff6e4', sunIntensity: 2.7,
    hemiSky: '#f6f0e2', hemiGround: '#cfc6b6', hemiIntensity: 3.15,
    ambientColor: '#c6bfb1', ambientIntensity: 1.18,
    fillColor: '#e2e8ec', fillIntensity: 1.05,
    pointColor: '#ffcf9e', pointIntensity: 1.15,
    spotIntensity: 2.1,
    overlayColor: '#eef4f0', overlayOpacity: 0.06,
  },
  afternoon: {
    phase: 'afternoon',
    sunPos: [-7.6, 6.2, 6.4],
    sunColor: '#ffe6bc', sunIntensity: 2.5,
    hemiSky: '#f5eee0', hemiGround: '#cfc6b6', hemiIntensity: 3.1,
    ambientColor: '#c8c0b0', ambientIntensity: 1.2,
    fillColor: '#e2e8ec', fillIntensity: 1.05,
    pointColor: '#ffcf9e', pointIntensity: 1.15,
    spotIntensity: 2.1,
    overlayColor: '#f6dfae', overlayOpacity: 0.12,
  },
  evening: {
    phase: 'evening',
    sunPos: [-9.2, 2.8, 6.0],
    sunColor: '#ffca8e', sunIntensity: 1.9,
    hemiSky: '#f4e6d2', hemiGround: '#cfc6b6', hemiIntensity: 3.05,
    ambientColor: '#c8bba7', ambientIntensity: 1.24,
    fillColor: '#e6e6de', fillIntensity: 1.1,
    pointColor: '#ffd0a2', pointIntensity: 1.12,
    spotIntensity: 2.1,
    overlayColor: '#f0c48e', overlayOpacity: 0.2,
  },
  // שעות-מחוץ: הפנים נשאר בהיר-חוק — מילוי ניטרלי-קר מפצה על שמש-חוץ נמוכה.
  // אין תיאטרון-לילה: אותם גופי-אור, עצמות-מילוי גבוהות, שמש קרירה ונמוכה בחוץ.
  off: {
    phase: 'off',
    sunPos: [-6.5, 1.6, 8.4],
    sunColor: '#dfe6ea', sunIntensity: 0.75,
    hemiSky: '#eef0ee', hemiGround: '#cfc9be', hemiIntensity: 3.2,
    ambientColor: '#ccd0cc', ambientIntensity: 1.35,
    fillColor: '#dfe5e8', fillIntensity: 1.2,
    pointColor: '#e8ddd0', pointIntensity: 1.05,
    spotIntensity: 2.0,
    overlayColor: '#b9c6cf', overlayOpacity: 0.22,
  },
};

/** השעה האמיתית באסיה/ירושלים (0–23) — לא שעון-הדפדפן */
export function jerusalemHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23',
  }).format(new Date());
  return Number(h) % 24;
}

export function phaseOf(hour: number): SunPhase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'noon';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 21) return 'evening';
  return 'off';
}

/** תמונת-מצב מספרית של כל ערכי התאורה — להחלקה מספרית בין שלבים */
interface LightSnap {
  sunPos: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  fillColor: THREE.Color;
  fillIntensity: number;
  pointColor: THREE.Color;
  pointIntensity: number;
  spotIntensity: number;
  overlayColor: THREE.Color;
  overlayOpacity: number;
}

function snapOf(p: PhaseSpec): LightSnap {
  return {
    sunPos: new THREE.Vector3(...p.sunPos),
    sunColor: new THREE.Color(p.sunColor),
    sunIntensity: p.sunIntensity,
    hemiSky: new THREE.Color(p.hemiSky),
    hemiGround: new THREE.Color(p.hemiGround),
    hemiIntensity: p.hemiIntensity,
    ambientColor: new THREE.Color(p.ambientColor),
    ambientIntensity: p.ambientIntensity,
    fillColor: new THREE.Color(p.fillColor),
    fillIntensity: p.fillIntensity,
    pointColor: new THREE.Color(p.pointColor),
    pointIntensity: p.pointIntensity,
    spotIntensity: p.spotIntensity,
    overlayColor: new THREE.Color(p.overlayColor),
    overlayOpacity: p.overlayOpacity,
  };
}

const TRANSITION_MS = 2000;
/** מיקרו-התנודה של 11-a — נשמרת כווריאציה חיה בתוך השלב הנמדד */
const SWAY_S = 360;
const SWAY_X = 0.9;
const SWAY_I = 0.12;

export function Atmosphere() {
  // refs לגופי-האור הנעים; rim נשאר סטטי (היררכיית 11-a ללא-שינוי)
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const ptRef = useRef<THREE.PointLight>(null);
  const ovWestRef = useRef<THREE.MeshBasicMaterial>(null);
  const ovSouthRef = useRef<THREE.MeshBasicMaterial>(null);

  const initialPhase = useMemo(() => phaseOf(jerusalemHour()), []);
  const targetPhase = useRef<SunPhase>(initialPhase);
  const from = useRef<LightSnap>(snapOf(PHASES[initialPhase]));
  const cur = useRef<LightSnap>(snapOf(PHASES[initialPhase]));
  /** זמן-התחלת המעבר בשניות-שעון; -1 = חמוש וממתין לפריים הראשון של המעבר */
  const armedAt = useRef(-10);

  // ויסות window.__hqSun ל-probe (עדכון מוטציה זול בפריים — בלי הקצאות)
  const hqSun = useMemo(
    () => ({ phase: initialPhase as string, sunPos: [0, 0, 0] as number[], intensity: 0 }),
    [],
  );
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__hqSun = hqSun;
  }, [hqSun]);

  // הערכת שלב: בהרכבה + כל 5 דקות — מעבר חלק רק בשינוי שלב
  useEffect(() => {
    const evaluate = () => {
      const p = phaseOf(jerusalemHour());
      if (p === targetPhase.current) return;
      // נקודת-הפתיחה של המעבר = המצב המוחלק הנוכחי (לא קפיצה לתחילת השלב הקודם)
      from.current = {
        sunPos: cur.current.sunPos.clone(),
        sunColor: cur.current.sunColor.clone(),
        sunIntensity: cur.current.sunIntensity,
        hemiSky: cur.current.hemiSky.clone(),
        hemiGround: cur.current.hemiGround.clone(),
        hemiIntensity: cur.current.hemiIntensity,
        ambientColor: cur.current.ambientColor.clone(),
        ambientIntensity: cur.current.ambientIntensity,
        fillColor: cur.current.fillColor.clone(),
        fillIntensity: cur.current.fillIntensity,
        pointColor: cur.current.pointColor.clone(),
        pointIntensity: cur.current.pointIntensity,
        spotIntensity: cur.current.spotIntensity,
        overlayColor: cur.current.overlayColor.clone(),
        overlayOpacity: cur.current.overlayOpacity,
      };
      targetPhase.current = p;
      armedAt.current = -1;
      hqSun.phase = p;
    };
    evaluate();
    const iv = setInterval(evaluate, 300_000);
    return () => clearInterval(iv);
  }, [hqSun]);

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    if (armedAt.current === -1) armedAt.current = now;
    const t = Math.min(1, Math.max(0, (now - armedAt.current) * 1000 / TRANSITION_MS));
    const s = t * t * (3 - 2 * t); // ease in-out — 2 שניות מרוסנות
    const F = from.current, T = PHASES[targetPhase.current], C = cur.current;

    C.sunPos.lerpVectors(F.sunPos, tmpVec.set(...T.sunPos), s);
    C.sunColor.lerpColors(F.sunColor, tmpC.set(T.sunColor), s);
    C.sunIntensity = F.sunIntensity + (T.sunIntensity - F.sunIntensity) * s;
    C.hemiSky.lerpColors(F.hemiSky, tmpC.set(T.hemiSky), s);
    C.hemiGround.lerpColors(F.hemiGround, tmpC.set(T.hemiGround), s);
    C.hemiIntensity = F.hemiIntensity + (T.hemiIntensity - F.hemiIntensity) * s;
    C.ambientColor.lerpColors(F.ambientColor, tmpC.set(T.ambientColor), s);
    C.ambientIntensity = F.ambientIntensity + (T.ambientIntensity - F.ambientIntensity) * s;
    C.fillColor.lerpColors(F.fillColor, tmpC.set(T.fillColor), s);
    C.fillIntensity = F.fillIntensity + (T.fillIntensity - F.fillIntensity) * s;
    C.pointColor.lerpColors(F.pointColor, tmpC.set(T.pointColor), s);
    C.pointIntensity = F.pointIntensity + (T.pointIntensity - F.pointIntensity) * s;
    C.spotIntensity = F.spotIntensity + (T.spotIntensity - F.spotIntensity) * s;
    C.overlayColor.lerpColors(F.overlayColor, tmpC.set(T.overlayColor), s);
    C.overlayOpacity = F.overlayOpacity + (T.overlayOpacity - F.overlayOpacity) * s;

    // מיקרו-התנודה של 11-a — בתוך השלב הנמדד, בלי baseX שנצבר (השמש נעה בין שלבים)
    const sway = Math.sin((now / SWAY_S) * Math.PI * 2);

    if (sunRef.current) {
      sunRef.current.position.set(C.sunPos.x + sway * SWAY_X, C.sunPos.y, C.sunPos.z);
      sunRef.current.color.copy(C.sunColor);
      sunRef.current.intensity = C.sunIntensity * (1 + sway * SWAY_I);
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(C.hemiSky);
      hemiRef.current.groundColor.copy(C.hemiGround);
      hemiRef.current.intensity = C.hemiIntensity;
    }
    if (ambRef.current) {
      ambRef.current.color.copy(C.ambientColor);
      ambRef.current.intensity = C.ambientIntensity;
    }
    if (fillRef.current) {
      fillRef.current.color.copy(C.fillColor);
      fillRef.current.intensity = C.fillIntensity;
    }
    if (spotRef.current) spotRef.current.intensity = C.spotIntensity;
    if (ptRef.current) {
      ptRef.current.color.copy(C.pointColor);
      ptRef.current.intensity = C.pointIntensity;
    }
    if (ovWestRef.current) {
      ovWestRef.current.color.copy(C.overlayColor);
      ovWestRef.current.opacity = C.overlayOpacity;
    }
    if (ovSouthRef.current) {
      ovSouthRef.current.color.copy(C.overlayColor);
      ovSouthRef.current.opacity = C.overlayOpacity;
    }

    hqSun.sunPos[0] = C.sunPos.x; hqSun.sunPos[1] = C.sunPos.y; hqSun.sunPos[2] = C.sunPos.z;
    hqSun.intensity = C.sunIntensity;
  });

  return (
    <group>
      {/* כיפה: שמיים-יום מעל, רצפת-אבן בהירה מתחת — החדר כולו נושם */}
      <hemisphereLight ref={hemiRef} args={['#f6f0e2', '#cfc6b6', 3.15]} />
      <ambientLight ref={ambRef} intensity={1.18} color="#c6bfb1" />
      {/* שמש ראשית — מיקום/צבע/עצמה לפי שלב השעון-הירושלמי, צללים אמת */}
      <directionalLight
        ref={sunRef}
        position={[-6.5, 8.5, 7.0]}
        intensity={2.7}
        color="#fff2da"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      {/* מילוי-שמיים מהמזרח — רך, בלי צללים; אפס פינה-שחורה בחצי-המזרחי */}
      <directionalLight ref={fillRef} position={[8.5, 5.2, 2.5]} intensity={1.05} color="#e2e8ec" />
      {/* Task 11-a — אור-שפה (rim) מצפון-מזרח — סטטי, מנתק דמויות מהרקע */}
      <directionalLight position={[3.5, 4.2, -8.5]} intensity={0.55} color="#dfe8f0" />
      {/* זרקור מרכזי חם מעל הלהבה — לב-החדר נשאר נקודת-המוקד */}
      <spotLight
        ref={spotRef}
        position={[0, 3.35, 0.6]}
        angle={0.75}
        penumbra={0.7}
        intensity={2.1}
        color="#ffd9a6"
        distance={14}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
      />
      {/* אור מילוי מהדרום (קבלה) */}
      <pointLight ref={ptRef} position={[0, 2.6, 4.6]} intensity={1.15} color="#ffcf9e" distance={10} decay={2} />
      {/* Task 11-a — צללי-מגע רכים: אחיזת-קרקע כנה (512, אמצעי-הצגה בלבד) */}
      <ContactShadows
        position={[0, 0.002, 0]}
        scale={26}
        resolution={512}
        far={1.6}
        blur={2.6}
        opacity={0.32}
        color="#4a3f30"
        frames={Infinity}
      />

      {/* exec-14 — גוון-שמיים עדין מעל קו-הרקיע: שכבת-כיסוי שקופה בלבד 12ס"מ
          לפני רשת-קו-הרקיע של Architecture (שנשארת ללא-מגע) */}
      <mesh position={[-14.08, 3.4, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[34, 12]} />
        <meshBasicMaterial ref={ovWestRef} transparent opacity={0.1} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 3.4, PLAN_H * SCALE + 4.08]} rotation-y={Math.PI}>
        <planeGeometry args={[34, 12]} />
        <meshBasicMaterial ref={ovSouthRef} transparent opacity={0.1} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}
