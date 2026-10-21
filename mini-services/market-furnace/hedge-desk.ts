/* ═══ hedge-desk · שולחן-ההידג'-הריבוני (דוקטרינת AutoHedge) ═════════════════
 * מקור: github.com/The-Swarm-Corporation/AutoHedge (MIT) — נבחן 2026-10-21
 * במנדט-בעלים (trace 1a15cc20fff7ce71): "בחן תכנן בצע דחוף".
 *
 * מה אומץ (מהות, לא-קוד — AutoHedge הוא Python/swarms/OpenAI, אנו TS-ריבוני):
 *  · צינור-4-שלבים Director→Quant→Risk→Execution — כאן: כללים-דטרמיניסטיים
 *    מדידים-על-הספר-החי (לא-LLM — כנות-מלאה: אין-מוח-מלאכותי-כאן, יש-משמעת).
 *  · Risk-First: גודל-פוזיציה נגזר-מההון-החי (risk-per-trade %) לפני-כל-ביצוע.
 *  · Kill-Switch: נסיגה-מהשיא-היומי מעל-תקרה → עצירת-טייקר-זרימה עד-היום-הבא.
 *  · תזה-מובנית-JSON לכל-מחזור — ראיות-חיות, null כשלא-נמדד (Grounding-Gate,
 *    דוקטרינת Vibe-Trading שאומצה קודם — שתי-השיטות מחזקות-אחת-את-השנייה).
 *
 * חוק-החסימות (הנחיית-בעלים "שלא יהיו חסימות מיותרות"):
 *  · אסור-לחסום בלי-סיבה-מתועדת-קריאה (reason מודפס ומתועד).
 *  · חוסמים רק-על-הפסד-אמת-מדוד (נסיגת-שיא) או-על-נתוני-עלייה-חסרים-מוחלטים.
 *  · Maker (עומק) לעולם-לא-נחסם ע"י שולחן-ההידג' — עומק-הוא-תשתית, לא-סיכון.
 *
 * אירועים: sem:"hedge-desk-1" (הביקורת iFixAi :3022 קוראת actions.jsonl). */

import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Stage = "director" | "quant" | "risk" | "execution";
export type TradeKind = "rotate" | "arb" | "ignite";

/* ═══ קבועי-המשמעת (דוקטרינת-Risk של AutoHedge, מותאם-ל-µUSDS) ═══════════ */
export const RISK_PER_TRADE_BPS = 500;   // תקרת-גודל-פר-עסקה: 5% מההון-המסומן
export const MAX_DRAWDOWN_BPS = 400;     // נסיגה-מהשיא-היומי: 4% → kill-switch-טייקר
export const MIN_TRADE_MU = 20_000;      // מתחת-לזה: אין-מובן-בעמלות — חסימה-כנה
export const SPREAD_HARD_BPS = 1_500;    // פיזור-ספר > 15% → אין-טייקר (שוק-שבור)

const THESIS_FILE = "hedge-desk.jsonl";
const STATE_FILE = "hedge-desk-state.json";

export interface CycleCtx {
  equityMu: number | null;              // הון-תנור-מסומן (USDS + SAOS·mid/1000)
  meter: number | null;                 // feeMeter חי
  book: { fair: number; bestBid: number; bestAsk: number } | null;
}

export interface Thesis {
  ts: number;
  director: { stance: string; why: string; fountainAlive: boolean | null };
  quant: {
    spreadBps: number | null;           // מרווח-הספר-החי
    imbalanceBps: number | null;        // סטיית-ה-fair ממרכז-bid/ask
    meterMomentum: number | null;       // טרנד-המד (אחרון-מול-ממוצע-6)
    volatilityProxy: number | null;     // סטיית-תקן-מדידה-על-היסטוריית-מד
  };
  risk: {
    equityMu: number | null; dayPeakMu: number | null;
    drawdownBps: number | null; maxDrawdownBps: number;
    sizeCapMu: number | null;           // min(risk-per-trade·equity, תקרה-מועברת)
    killSwitch: boolean;
  };
  decision: { allowTaker: boolean; reasons: string[] };  // reasons=חוק-החסימות-הקריא
}

export class HedgeDesk {
  private dayPeakMu: number | null = null;
  private dayKey = "";
  private killSwitch = false;
  private killSwitchAt = 0;
  private killSwitchWhy = "";
  private lastThesis: Thesis | null = null;
  private theses: Thesis[] = [];
  private gates = { allow: 0, deny: 0, lastDenyReason: "" };
  private dir: string;

  constructor(stateDir: string) { this.dir = stateDir; }

  /* ═══ Director+Quant+Risk — נקרא-פעם-במחזור-לפני-כל-ביצוע ═══════════════ */
  beginCycle(ctx: CycleCtx, dayKey: string): Thesis {
    // איפוס-יומי: השיא-וה-kill-switch מתאפסים — יום-חדש, מצפן-חדש (חוק-חסימות-מינימלי)
    if (dayKey !== this.dayKey) {
      this.dayKey = dayKey;
      this.dayPeakMu = ctx.equityMu;
      this.killSwitch = false;
      this.killSwitchWhy = "";
    }
    if (ctx.equityMu !== null && (this.dayPeakMu === null || ctx.equityMu > this.dayPeakMu)) {
      this.dayPeakMu = ctx.equityMu;
    }

    /* Quant — הכל-מדידה-חיה; מה-שלא-נמדד = null (Grounding-Gate) */
    const b = ctx.book;
    const spreadBps = b && b.bestBid > 0 && b.bestAsk > 0
      ? Math.round(((b.bestAsk - b.bestBid) / b.bestBid) * 10_000) : null;
    const mid = b && b.bestBid > 0 && b.bestAsk > 0 ? (b.bestBid + b.bestAsk) / 2 : null;
    const imbalanceBps = b && mid ? Math.round(((b.fair - mid) / mid) * 10_000) : null;

    /* Director — עמדה-מהנתונים-החיים-בלבד */
    const fountainAlive = ctx.meter !== null ? ctx.meter >= 9_000 : null;
    let stance = "maintain";
    let why = "";
    if (fountainAlive === false) { stance = "ignite"; why = "המזרקה-מתה (מד-מתחת-רצפת-9,000) — עדיפות-הצתה"; }
    else if (imbalanceBps !== null && Math.abs(imbalanceBps) >= 60) { stance = "arb"; why = `פיזור-אמת ${imbalanceBps}bps בין-בריכה-לספר`; }
    else if (fountainAlive === true) { stance = "maintain"; why = "מזרקה-חיה + אין-פיזור-מעל-מקף — עומק-וסיבוב-צנוע"; }
    else { stance = "observe"; why = "נתוני-עלייה-חלקיים — תצפית-כנה"; }

    /* Risk — נסיגה-וגודל */
    const drawdownBps = this.dayPeakMu && ctx.equityMu !== null && this.dayPeakMu > 0
      ? Math.round(((this.dayPeakMu - ctx.equityMu) / this.dayPeakMu) * 10_000) : null;
    if (drawdownBps !== null && drawdownBps > MAX_DRAWDOWN_BPS && !this.killSwitch) {
      this.killSwitch = true;
      this.killSwitchAt = Date.now();
      this.killSwitchWhy = `נסיגה ${drawdownBps}bps > תקרה ${MAX_DRAWDOWN_BPS}bps משיא-יומי ${this.dayPeakMu}`;
      this.logAction("kill-switch-on", { drawdownBps, peakMu: this.dayPeakMu, equityMu: ctx.equityMu }, "risk-trip");
    }
    const sizeCapMu = ctx.equityMu !== null
      ? Math.floor(ctx.equityMu * (RISK_PER_TRADE_BPS / 10_000)) : null;

    /* Decision — חוק-החסימות: כל-דחייה-כוללת-סיבה-קריאה */
    const reasons: string[] = [];
    if (this.killSwitch) reasons.push(`kill-switch: ${this.killSwitchWhy}`);
    if (ctx.equityMu === null) reasons.push("אין-הון-מסומן (ארנק-לא-נמדד)");
    else if (ctx.equityMu < MIN_TRADE_MU) reasons.push(`הון ${ctx.equityMu}µ < מינימום-מסחר ${MIN_TRADE_MU}µ`);
    if (spreadBps !== null && spreadBps > SPREAD_HARD_BPS) reasons.push(`פיזור-ספר ${spreadBps}bps > ${SPREAD_HARD_BPS}bps — שוק-שבור`);

    const thesis: Thesis = {
      ts: Date.now(),
      director: { stance, why: why || "ממתין-לנתונים", fountainAlive },
      quant: { spreadBps, imbalanceBps, meterMomentum: this.meterMomentum(), volatilityProxy: this.volProxy() },
      risk: { equityMu: ctx.equityMu, dayPeakMu: this.dayPeakMu, drawdownBps, maxDrawdownBps: MAX_DRAWDOWN_BPS, sizeCapMu, killSwitch: this.killSwitch },
      decision: { allowTaker: reasons.length === 0, reasons },
    };
    this.lastThesis = thesis;
    this.theses.push(thesis);
    if (this.theses.length > 200) this.theses = this.theses.slice(-200);
    try { appendFileSync(path.join(this.dir, THESIS_FILE), JSON.stringify(thesis) + "\n"); } catch { /* כנות */ }
    return thesis;
  }

  /* ═══ Execution-gate — השער-היחיד-לפני-טייקר; לעולם-חוסם-עם-סיבה ═══════ */
  gate(kind: TradeKind, thesis: Thesis | null, requestedMu: number): { allowed: boolean; reason: string; sizeMu: number } {
    if (!thesis) { this.deny("אין-תזה (המחזור-טרם-רץ)"); return { allowed: false, reason: "no-thesis", sizeMu: requestedMu }; }
    if (!thesis.decision.allowTaker) { this.deny(thesis.decision.reasons.join(" | ")); return { allowed: false, reason: thesis.decision.reasons.join(" | "), sizeMu: requestedMu }; }
    const cap = thesis.risk.sizeCapMu ?? requestedMu;
    let sizeMu = Math.min(requestedMu, cap);
    if (sizeMu < MIN_TRADE_MU) {
      const r = `גודל-נגזר ${sizeMu}µ < מינימום ${MIN_TRADE_MU}µ (הון-נמוך מדי ל-5%-סיכון-תקני)`;
      this.deny(r); return { allowed: false, reason: r, sizeMu: requestedMu };
    }
    this.gates.allow++;
    return { allowed: true, reason: `${kind}: size=${sizeMu}µ (cap ${cap}µ)`, sizeMu };
  }

  private deny(reason: string): void {
    this.gates.deny++;
    this.gates.lastDenyReason = reason.slice(0, 160);
    this.logAction("gate-deny", { reason: this.gates.lastDenyReason }, "risk-gate");
  }

  private logAction(action: string, args: Record<string, unknown>, detail: string): void {
    try {
      appendFileSync(path.join(this.dir, "actions.jsonl"), JSON.stringify({ ts: Date.now(), sem: "hedge-desk-1", actor: "hedge-desk", action, resource: "SAOS/USDS", args, outcome: "ok", cost_units: 0, detail: detail.slice(0, 160) }) + "\n");
    } catch { /* ביקורת-לעולם-לא-מפילה-מסחר */ }
  }

  /* momentum+volatility — מההיסטוריה-החיה-של-המד (מוזרקת-מ-index.ts) */
  private meterHist: Array<{ t: number; meter: number }> = [];
  feedMeter(meter: number): void {
    this.meterHist.push({ t: Date.now(), meter });
    if (this.meterHist.length > 240) this.meterHist = this.meterHist.slice(-240);
  }
  private meterMomentum(): number | null {
    if (this.meterHist.length < 7) return null;
    const last = this.meterHist[this.meterHist.length - 1].meter;
    const avg6 = this.meterHist.slice(-7, -1).reduce((s, x) => s + x.meter, 0) / 6;
    return Math.round(last - avg6);
  }
  private volProxy(): number | null {
    const n = this.meterHist.length;
    if (n < 10) return null;
    const vals = this.meterHist.slice(-30).map((x) => x.meter);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const varr = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
    return Math.round(Math.sqrt(varr));
  }

  /* snapshot ל-/health — הכל-כנה */
  snapshot(): Record<string, unknown> {
    return {
      doctrine: "AutoHedge Director→Quant→Risk→Execution (ריבוני-TS: כללים-מדידים, אפס-LLM)",
      limits: { riskPerTradeBps: RISK_PER_TRADE_BPS, maxDrawdownBps: MAX_DRAWDOWN_BPS, minTradeMu: MIN_TRADE_MU, spreadHardBps: SPREAD_HARD_BPS },
      killSwitch: { on: this.killSwitch, at: this.killSwitchAt || null, agoSec: this.killSwitchAt ? Math.round((Date.now() - this.killSwitchAt) / 1000) : null, why: this.killSwitchWhy || null },
      gates: { ...this.gates },
      lastThesis: this.lastThesis,
      thesesKept: this.theses.length,
    };
  }

  persist(): void {
    try { writeFileSync(path.join(this.dir, STATE_FILE), JSON.stringify({ at: new Date().toISOString(), dayKey: this.dayKey, dayPeakMu: this.dayPeakMu, killSwitch: this.killSwitch, killSwitchWhy: this.killSwitchWhy, gates: this.gates, theses: this.theses.slice(-40) }, null, 1)); } catch { /* כנות */ }
  }
}
