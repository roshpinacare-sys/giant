/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן.
 * · MSAA מקורי (בלי פוסט-פרוססינג) — חדות-קצוות אמיתית בעלות-ביצועים נמוכה
 * · RoomReadiness מודד את הפריים האמיתי הראשון (לשכבת-ההכנה הכנה)
 * · אין שחקן — מצלמת הבמאי בלבד
 */
'use client';

import React, { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Architecture } from './Architecture';
import { Stations } from './Stations';
import { Interior } from './Interior';
import { Realism } from './Realism';
import { Crew } from './Crew';
import { CameraDirector } from './CameraDirector';
import { Atmosphere } from './Atmosphere';
import { useHq } from '@/lib/hq/store';

/** מודד את הפריים המורכב האמיתי הראשון (draw-calls > 6) — אמת, לא הנחה */
function RoomReadiness() {
  const { gl } = useThree();
  useEffect(() => {
    let raf = 0;
    let settled = false;
    const check = () => {
      if (settled) return;
      if (gl.info.render.calls > 6) {
        settled = true;
        useHq.getState().setRoomReady(true);
        // R58 — חוזה-הבייק (office-3d-bake): הפריים-האמיתי-הראשון נחשף גם
        // לחלון — מדידה מהרנדרר עצמו (draw-calls > 6), לא שעון-עצר.
        (window as unknown as Record<string, unknown>).__hqRoomReady = true;
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => { settled = true; cancelAnimationFrame(raf); };
  }, [gl]);
  return null;
}

export function Office3D() {
  // התאמת-ביצועים אמיתית (Task 3D-MOBILE): במסך-קטן/מוחלש — פחות פיקסלים
  // ובלי צללים. נמדד פעם-אחת בהרכבה (הרכיב רץ לקוח-בלבד).
  const [lite] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 820px)').matches ||
      (navigator.hardwareConcurrency ?? 8) <= 4));
  return (
    <Canvas
      shadows={lite ? false : 'soft'}
      dpr={lite ? [0.75, 1.25] : [1, 1.75]}
      camera={{ fov: 50, near: 0.1, far: 60, position: [4.4, 4.9, 6.4] }}
      gl={{
        antialias: !lite,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.12,
      }}
      onCreated={({ gl, scene, camera }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        // Task 51 (אור-יום): הערפל הפנימי בצבע-אור-יום — לילה נשאר רק בחלונות.
        // הישן (#241e18, 22→60) בלע בחצי-החדר הרחוק לתוך-שחור (מדד-בסיס 51).
        scene.fog = new THREE.Fog('#ddd6c8', 26, 62);
        // R58 — תאורת-סביבה IBL (כלי-הגרפיקה של "הענקים"): כל-החומרים
        // כבר מוגדרים עם envMapIntensity (בטון/עץ/מתכת/שיש/פליז) — אבל
        // מעולם לא היתה מפת-סביבה, והמאפיין ישב מנוצל. RoomEnvironment
        // מייצר IBL פרוצדורלי (אפס-נכסים, אפס-רשת) — השתקפויות רכות
        // אמת במתכות, עומק-תאורה בחדר. עוצמה מרוסנת — הבמאי נשאר האור הראשי.
        const pmrem = new THREE.PMREMGenerator(gl);
        const envScene = new RoomEnvironment();
        scene.environment = pmrem.fromScene(envScene, 0.04).texture;
        scene.environmentIntensity = 0.42;
        pmrem.dispose();
        // debug hook (dev): window.__hq
        (window as unknown as Record<string, unknown>).__hq = { gl, scene, camera };
      }}
    >
      <color attach="background" args={['#ddd6c8']} />
      <SceneErrorBoundary>
        <SuspenseBoundary>
          <Architecture />
          <Stations />
          <Interior />
          <Realism />
          <Crew />
          <CameraDirector />
          <Atmosphere />
          <RoomReadiness />
        </SuspenseBoundary>
      </SceneErrorBoundary>
    </Canvas>
  );
}

/** גבול-שגיאה פנימי: כשל נכס יחיד לא ישאיר קנבס שחור ללא הסבר */
import { Suspense } from 'react';
function SuspenseBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** גבול-כשל סצנה (Task 46): נכס/מודל שנפל בתוך הקנבס מסומן כנה בחנות —
 *  Room3D מציג מצב-כשל עם פעולה, במקום קנבס שחור שקט. */
class SceneErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    console.error('[hq-scene] scene failure:', err.message);
    useHq.getState().setSceneFailed(true);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
