"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";

/* ═══ המתכון-הגלוי (דפוס prompt-motion · GIANT) ══════════════════════════
 * כל-פאנל מציג את המתכון שמאחוריו — בדיוק כמו prompt-motion מציג את
 * הפרומפט שמאחורי כל-וידאו: מקורות-מדידה מדויקים, זמן-מדידה, חוזה-כשל.
 * אפס-קישוט: כל-שורה כאן היא טענה נבדקת על-המסך-עצמו. */

function ageHe(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "עכשיו";
  if (min < 60) return `${Math.round(min)} ד׳`;
  if (min < 2880) return `${Math.round(min / 60)} ש׳`;
  return `${Math.round(min / 1440)} ימים`;
}

export interface RecipeProps {
  /** שורות-המתכון: מקור-אמת אחד לכל-שורה (קובץ-גיט / API ציבורי) */
  sources: string[];
  /** זמן-המדידה האחרון (ISO) */
  measuredAt?: string | null;
  /** גיל-מדידה בדקות (מועדף אם-קיים) */
  ageMinutes?: number | null;
  /** חוזה-הכשל של-המודול */
  failNote?: string;
}

export function Recipe({ sources, measuredAt, ageMinutes, failNote }: RecipeProps) {
  const [open, setOpen] = useState(false);
  const age = useMemo(
    () => ageHe(ageMinutes ?? (measuredAt ? (Date.now() - Date.parse(measuredAt)) / 60_000 : null)),
    [measuredAt, ageMinutes],
  );

  return (
    <div className="rounded-xl border border-white/5 bg-zinc-950/50" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[36px] w-full items-center justify-between gap-2 px-3 py-1.5 text-right"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
          <FlaskConical className="h-3 w-3 text-amber-600/70" aria-hidden />
          המתכון-מאחורי-הפאנל
          <span className="font-mono font-normal text-zinc-600">· נמדד {age}</span>
        </span>
        <ChevronDown className={`h-3 w-3 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-1 border-t border-white/5 px-3 py-2.5">
          {sources.map((s, i) => (
            <p key={i} className="break-all font-mono text-[10px] leading-4 text-zinc-500">
              <span className="text-amber-600/60">▪</span> {s}
            </p>
          ))}
          {failNote && <p className="pt-1 text-[10px] leading-4 text-zinc-600">{failNote}</p>}
        </div>
      )}
    </div>
  );
}
