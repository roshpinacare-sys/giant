/**
 * Room3D.tsx — החדר התלת-מימדי המאוחד בתוך AgentHQ.
 * נטען דינמית (client-only) מתוך מסך המשרד: קנבס + סרגל תצפית מקצועי.
 * כל הנתונים מגיעים מהגשר (lib/hq/store) — AgentHQ מזרים את הפורמן האמיתי.
 * אין מיני-מפת-שחקן ואין ג'ויסטיק: הניווט הוא נקודות-תצפית אדריכליות.
 */
'use client';

import { useEffect } from 'react';
import { Office3D } from './Office3D';
import { ViewDeck } from './ViewDeck';
import { useHq } from '@/lib/hq/store';

export default function Room3D() {
  const sceneFailed = useHq((s) => s.sceneFailed);
  useEffect(() => {
    // debug hook (dev): live crew brains for browser probing
    (window as unknown as Record<string, unknown>).__hqBrains = useHq.getState().brains;
  }, []);
  if (sceneFailed) {
    // HONEST FAILURE (Task 46): a broken scene says so and offers the path
    // back — a silent black canvas is the one state this room may never show.
    return (
      <div className="grid h-full w-full place-items-center bg-[color:var(--surface)]" dir="rtl">
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <div className="h-10 w-10 rounded-full border-2" style={{ borderColor: 'var(--st-danger)' }} aria-hidden />
          <p className="text-[15px] font-semibold" style={{ color: 'var(--st-danger)' }}>
            החדר התלת-ממדי נכשל ברינדור
          </p>
          <p className="text-[13px] leading-6 text-[color:var(--ink-2)]">
            כשל נכס או מודל נרשם ביומן הדפדפן. תצוגת-התפעול (מסך-הבקרה) ממשיכה לעבוד עם הנתונים האמיתיים — החזרו את המשרד מסרגל-התצוגה לאחר רענון העמוד.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full" dir="rtl">
      <Office3D />
      <ViewDeck />
    </div>
  );
}
