"use client";

import dynamic from "next/dynamic";
import { OperatorDrawer } from "@/components/hq/OperatorDrawer";

/* ═══ המשרד-החי — המשרד-היחיד (חוק-משטח-אחד) ═════════════════════════════
 * החדר-המקצועי רץ כאן — בלי-iframe, בלי-חדר-ישן, בלי-משרד-שני.
 * עמדת-המפעיל מוטמעת בפינה (אותו מפתח-מנהל פותח הכל — כולל הערוץ). */

const RoomRoot = dynamic(() => import("@/components/hq/RoomRoot").then((m) => m.RoomRoot), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-950" dir="rtl">
      <p className="text-xs text-zinc-500">המשרד נטען…</p>
    </div>
  ),
});

export function OfficeView() {
  return (
    <div className="relative h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      <RoomRoot />
      <OperatorDrawer />
    </div>
  );
}
