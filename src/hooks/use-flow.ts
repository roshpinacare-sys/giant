"use client";

/* ═══ T70-המשך · hook-הדופק-המשותף ═══════════════════════════════════════════
 * מקור-אחד לכל-משטחי-הכסף: כל-המשטחים נושמים-את-אותו-דופק מ-/api/giant/flow
 * (ריצות-מוצלחות-אחרונות של-מנועי-הכסף + מסלול-הזרימה מפנקס-המדידות).
 * השרת עצמו מקייש-15ש׳ ומודד-בכל-ניפוח; ה-hook מרענן-כל-דקה.
 * fail-honest: כישלון = flow null — הרכיב לא יציג-כלום, אף-צ'יפ-מזויף לא ייוולד. */

import { useCallback, useEffect, useState } from "react";
import type { FlowPayload, FlowTrajectory } from "@/lib/giant/flow-types";

export interface UseFlowResult {
  flow: FlowPayload["flow"];
  trajectory: FlowTrajectory | null; // null = טרם-נטען — כנה
  err: string | null;
}

export function useFlow(): UseFlowResult {
  const [payload, setPayload] = useState<FlowPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (ac?: AbortController) => {
    try {
      const res = await fetch("/api/giant/flow", { cache: "no-store", signal: ac?.signal });
      const p = (await res.json()) as FlowPayload;
      setPayload(p);
      setErr(p.ok ? null : p.errors.join(" · ") || "הדופק לא נמדד כרגע");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // ביטול-ניתוק — לא-כישלון
      setErr("שרת-הדופק לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const t0 = setTimeout(() => void load(ac), 0);
    const iv = setInterval(() => void load(ac), 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      ac.abort();
    };
  }, [load]);

  return { flow: payload?.flow ?? null, trajectory: payload?.trajectory ?? null, err };
}
