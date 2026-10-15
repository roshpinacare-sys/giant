/**
 * main.tsx — כניסת-ה-bundle הסטטי של המשרד החי (אותו חדר מקצועי, אפס-Next).
 * ---------------------------------------------------------------------------
 * · נטען כחדר עצמאי (Domain/office3d · FleetHQ Pages) — React+three מה-bundle.
 * · גשר-האמת מופעל כאן פעם-אחת: /api/office-state (אין — סטטי) → מקורות
 *   פומביים ישירים (raw.githubusercontent, CORS פתוח — נמדד). אפס-המצאה.
 * · המודלים נפתרים ב-Crew.tsx לפי-location (‎../models/humans/ ב-Domain).
 */
import { createRoot } from 'react-dom/client';
import Room3D from '@/components/hq/Room3D';
import { startTruthBridge } from '@/lib/hq/truth-bridge';
import './office.css';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <div className="h-dvh w-full overflow-hidden">
      <Room3D />
    </div>,
  );
  startTruthBridge(45_000);
}
