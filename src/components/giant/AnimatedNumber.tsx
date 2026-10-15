"use client";

import { useEffect, useRef, useState } from "react";

/* ═══ מספר-חי (דפוס prompt-motion · GIANT) ═══════════════════════════════
 * ערך-מדיד מפל חלק-לחלק כשהוא מתעדכן — התנועה נועדה להראות שהמספר חי
 * ומתעדכן-מהמקור; מכבד prefers-reduced-motion; אפס-setState-סינכרוני. */

interface AnimatedNumberProps {
  value: number | null;
  format: (n: number) => string;
  /** משך-ההנפה במילישניות */
  durationMs?: number;
  className?: string;
}

export function AnimatedNumber({ value, format, durationMs = 600, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number | null>(value);
  const fromRef = useRef<number | null>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) return; // רינדור-גוזר: value=null מוצג כ"—" בלי-setState
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;

    if (reduce || from === null || from === value) {
      fromRef.current = value;
      const id = requestAnimationFrame(() => setDisplay(value)); // אסינכרוני-מותר
      rafRef.current = id;
      return () => cancelAnimationFrame(id);
    }

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  const shown = value === null || display === null || !Number.isFinite(display) ? null : display;
  return <span className={className}>{shown === null ? "—" : format(shown)}</span>;
}
