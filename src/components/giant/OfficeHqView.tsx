"use client";

/**
 * OfficeHqView.tsx — מודול-המשרד המאוחד של GIANT (השתלה מהקנון giant/app)
 * ══════════════════════════════════════════════════════════════════════════
 * מרכיב במשטח-אחד:
 * · Room3D — החדר התלת-ממדי (client-only, next/dynamic ssr:false; WebGL לא רץ בשרת)
 * · OperatorDrawer — עמדת-המפעיל (שער-מפתח-מנהל → /api/office/ops/*)
 * · גשר-האמת — startTruthBridge (lib/hq/truth-bridge) סוקר /api/office-state
 *   כל 45 שניות ומזרים את הפורמן האמיתי לחנות (lib/hq/store) שהסצנה ניזונה ממנה.
 * · OfficeView (התוכן-הטקסטואלי הקיים — סוכנים/תיבת-מפעיל/הצעות) ממשיך לרוץ מתחת
 *   לקנבס, ומשמש גם כמסלול-כשל כנה: אם הסצנה נכשלה (sceneFailed בחנות) מוצג
 *   כרטיס-כשל-כנה במקום הקנבס — קנבס שחור שקט הוא המצב-היחיד שאסור כאן.
 * אפס-המצאה: כל-הנתונים מהגשר; מה שלא נמדד — לא מוצג.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useHq } from "@/lib/hq/store";
import { startTruthBridge } from "@/lib/hq/truth-bridge";
import { startOfficeLiveFeed } from "@/lib/hq/live-feed";
import { OperatorDrawer } from "@/components/hq/OperatorDrawer";
import { OfficeView } from "@/components/giant/OfficeView";

const Room3D = dynamic(() => import("@/components/hq/Room3D"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center" dir="rtl" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] px-5 py-3.5 shadow-sm">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--line-strong)] border-t-[color:var(--accent)]"
          aria-hidden
        />
        <span className="text-[13px] font-semibold text-[color:var(--ink)]">החדר התלת-ממדי נטען…</span>
      </div>
    </div>
  ),
});

/** כרטיס-כשל-סצנה כנה (חוק Task 46 — במקום קנבס שחור שקט) */
function SceneFailureCard() {
  return (
    <div className="grid h-full w-full place-items-center bg-[color:var(--surface)] px-6" dir="rtl">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 rounded-full border-2" style={{ borderColor: "var(--st-danger)" }} aria-hidden />
        <p className="text-[15px] font-semibold" style={{ color: "var(--st-danger)" }}>
          החדר התלת-ממדי נכשל ברינדור
        </p>
        <p className="text-[13px] leading-6 text-[color:var(--ink-2)]">
          כשל נכס או מודל נרשם ביומן הדפדפן. תוכן-המשרד האמיתי ממשיך לעבוד מטה, ועמדת-המפעיל פתוחה. רענון העמוד מנסה להרכיב את הסצנה מחדש.
        </p>
      </div>
    </div>
  );
}

export function OfficeHqView() {
  const sceneFailed = useHq((s) => s.sceneFailed);

  // גשר-האמת: סקר /api/office-state → syncSnapshot/syncGit/setTruth בחנות.
  // + השידור-החי: socket.io → office-live :3036 ב-4Hz (גל-80) — העולם-המתמשך
  //   נכנס-לחנות בזמן-אמת במקום-להמתין-לסקר. שניהם-נעצרים-בניתוק-הרכיב.
  useEffect(() => {
    const stopTruth = startTruthBridge(45_000);
    const stopLive = startOfficeLiveFeed();
    return () => {
      stopTruth();
      stopLive();
    };
  }, []);

  return (
    <div className="space-y-5" dir="rtl">
      {/* החדר התלת-ממדי + עמדת-המפעיל */}
      <section
        className="relative h-[560px] min-h-[440px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--surface)]"
        aria-label="המשרד התלת-ממדי"
      >
        {sceneFailed ? <SceneFailureCard /> : <Room3D />}
        <OperatorDrawer />
      </section>

      {/* תוכן-המשרד הטקסטואלי האמיתי (נשאר חי גם כשהסצנה נכשלת) */}
      <OfficeView />
    </div>
  );
}
