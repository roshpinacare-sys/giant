"use client";

/* ═══ craft — שכבת-הקראפט של GIANT (T60) ═══════════════════════════════════
 * DNA שנשאב-ממאגרי-העיצוב-שהבעלים-שלח (designspells · 60fps · supahero · godly):
 *  · CountUp — מספרים-חיים-נוספים-מול-העיניים (easeOutCubic · מכבד reduced-motion)
 *  · Spotlight — זוהר-ענבר-עוקב-עכבר על-כרטיסים (CSS-vars · אפס-עלות-פריסה)
 *  · Reveal — גילוי-בגלילה (whileInView · פעם-אחת)
 * הכל-קליינט-בלבד · אפס-תלות-חדשה · framer-motion-קיים. */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/* ─── CountUp: מונה-חי. format=אותו-מעצב-של-המערכת (fmtBook/fmtInt/fmtUsd) ─── */
export function CountUp({
  target,
  format,
  durationMs = 950,
  className,
}: {
  target: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}): React.ReactElement {
  const [display, setDisplay] = useState<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    /* reduced-motion: אין-אנימציה — display נשאר null והרינדור מציג-ישר-את-הערך-הסופי */
    if (reduce) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number): void => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  const shown = display === null ? target : display;
  return (
    <span className={className} dir="ltr">
      {format(shown)}
    </span>
  );
}

/* ─── Spotlight: כרטיס-עם-זוהר-עוקב-מצביע (מגדיר --sx/--sy; ה-CSS ב-globals) ─── */
export function Spotlight({
  children,
  className = "",
  onActivate,
}: {
  children: React.ReactNode;
  className?: string;
  onActivate?: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={onMove} onClick={onActivate} className={`giant-spot ${className}`}>
      {children}
    </div>
  );
}

/* ─── Reveal: גילוי-בגלילה — פעם-אחת, עדין ─── */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
