/* economy-tx — מפיק-אירועים-אמת אל כלכלת-הפנים (fleet-economy :3016).
 * ==============================================================================
 * חוק-אמת: כל-קריאה כאן ממופה 1:1 לאירוע שקרה במערכת (מילוי-דקס אמת, בדיקת-חיים
 * אמת, אטימת-כספת אמת). אפס-סינתזה — לא נוצרות עסקאות מהאוויר.
 *
 * עמידות (דרישת-הבעלים): אם מנוע-הכלכלה מת — המפיקים לא קורסים:
 *  · fire-and-forget: לעולם לא לחכות (לא להאט את נתיב-המילוי).
 *  · חסם-תעופה: לכל-היותר ECONOMY_INFLIGHT_CAP קריאות-חיות; מעבר — האירוע
 *    נזרק ונספר בכנות ב-economyProducerDropped().
 *  · מוני-שקר אפס: economyProducerStats() חושף sent/dropped בשביל /api/economy.
 *  · dedup דו-צדדי: ה-ref (למשל dexfill-<tradeId>) מזוהה במנוע — גם אם גם
 *    רשת-הביטחון (poller במנוע עצמו) תופסת את אותו אירוע, הוא נספר פעם-אחת.
 */
const ECONOMY_INGEST = "http://127.0.0.1:3016/tx/ingest";
const ECONOMY_TIMEOUT_MS = 2_500;
const ECONOMY_INFLIGHT_CAP = 64;

type EconomyEvent = {
  kind: "dex-fee" | "infra" | "service";
  from: string;
  to: string;
  asset?: "USDS" | "SAOS";
  amount: number;
  reason: string;
  ref: string;
  refillFloat?: boolean;
};

const g = globalThis as unknown as {
  __economyTxState?: { sent: number; dropped: number; inflight: number; lastDropAt: string | null; lastError: string | null };
};
function state() {
  if (!g.__economyTxState) g.__economyTxState = { sent: 0, dropped: 0, inflight: 0, lastDropAt: null, lastError: null };
  return g.__economyTxState;
}

/** שליחה-חד-כיוונית של אירוע-אמת לספר-הכלכלה. לעולם לא זורקת, לעולם לא ממתינה. */
export function economyIngest(ev: EconomyEvent): void {
  const st = state();
  if (st.inflight >= ECONOMY_INFLIGHT_CAP) {
    // חסם-תעופה מלא — האירוע מושמט ונספר בכנות (המנוע גם ככה תופס אותו ב-poller)
    st.dropped++;
    st.lastDropAt = new Date().toISOString();
    st.lastError = "inflight-cap";
    return;
  }
  st.inflight++;
  const body = JSON.stringify({ asset: "USDS", ...ev, amount: +Number(ev.amount).toFixed(6) });
  fetch(ECONOMY_INGEST, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(ECONOMY_TIMEOUT_MS),
  })
    .then((r) => {
      if (r.ok) st.sent++;
      else { st.dropped++; st.lastDropAt = new Date().toISOString(); st.lastError = `http-${r.status}`; }
    })
    .catch((e) => {
      // מנוע-כלכלה מת/איטי — כנות: מונה-השמטות עולה, אף-תהליך לא קורס
      st.dropped++;
      st.lastDropAt = new Date().toISOString();
      st.lastError = String(e instanceof Error ? e.message : e).slice(0, 120);
    })
    .finally(() => { st.inflight--; });
}

/** מוני-המפיק (כנים) — מוצגים ב-/api/economy לצד מוני-המנוע. */
export function economyProducerStats(): {
  sent: number; dropped: number; inflight: number; lastDropAt: string | null; lastError: string | null;
} {
  const st = state();
  return { sent: st.sent, dropped: st.dropped, inflight: st.inflight, lastDropAt: st.lastDropAt, lastError: st.lastError };
}

/** אגרת-מילוי-דקס: 0.3% מההון-הנסחר (צד-ה-USDS), מינימום-0.001, תקרה-2. */
export function dexFillFee(usdsNotional: number): number {
  return Math.min(2, Math.max(0.001, usdsNotional * 0.003));
}
