// fleet-loop.ts — מנוע-התדירות של-הריבונות v2 (server-only)
// הוראת-הבעלים (trace 1a143bf3ecaf116d · גל-80): "גוף-ריבוני-אוטונומי עם-מערכת-כלכלית-משל-עצמו
// צריך-לעשות אלפים-עשרות-אלפים עסקאות-ביום, ללא-תלות-חוץ, רק-על-ידי-הריבונות-עצמה. מקדמים-הכל-עכשיו".
//
// v1 מדד-חי 43-מילויים/24ש׳ — שישה-שסתומי-חנק-מתועדים:
//   סריקה-כל-20ש׳ · מרווח-סוכן-120..300ש׳ · קוביות-אקראיות (swapProb/limitProb)
//   · סף-סטייה-14% · לימיטים-ב-0.3..1.5%-מהמחיר (אף-פעם-לא-חוצים: 0-מילויי-לימיט-צי-אי-פעם)
//   · פקודה-פתוחה-אחת-בכל-כיוון. ה-v2 פותח-את-השסתומים-כולם:
//
//  · סריקה-כל-4ש׳ · מרווח-סוכן-8..45ש׳ · הכרעות-דטרמיניסטיות (בלי-קוביות)
//  · סף-סטייה-3% — איזון-מלאי-מתמיד = זרימה-דו-צדדית-טבעית דרך-הבריכה
//  · מעשה-שוק-דו-צדדי: קנייה-מתחת-למחיר + מכירה-מעל-המחיר בכל-סבב (0.04..0.12%-מהמיד —
//    אזור-חצייה-אמת: פקודה-של-12-USDS-מזיזה-את-המיד-ב-~0.03%, ולכן-הלימיטים-מתמלאים)
//  · עד-6-פקודות-פתוחות-לסוכן · מחזור-חיים-של-פקודה-4ד׳
//
// חוקי-הבית של-הלולאה (בלי-שינוי-מהותי):
//  · סוחרים-רק-על-הזוג-היליד SAOS/USDS — אפס-תלות-חוץ. כל-מילוי = מנוע-האמת-האחד
//    (executeSwap / placeLimitOrder / cancelLimitOrder) — לדג'ר-אמת והשפעת-מחיר-אמת.
//  · כשל-כנה: שגיאה-נספרת-ונשמרת (fleetLoopLastError) — לא-נחבא-ולא-ממציאים-הצלחה.
//  · בריאות-הלולאה מתפרסמת-ב-DexConfig ונקראת-ציבורית דרך /api/fleet/state.

import { db } from "@/lib/db";
import { executeSwap } from "@/lib/dex-server";
import { placeLimitOrder, cancelLimitOrder } from "@/lib/dex-orders";

const SWEEP_MS = 4_000; // סריקה-כל-4 שניות — הריבונות-נושמת-בקצב-שוק, לא-בקצב-מעריץ
const MIN_GAP_SEC = 8; // מרווח-מינימלי-בין-פעולות-לסוכן
const MAX_GAP_SEC = 45; // גם-אם-אין-מה-לעשות — לא-נשתוק-יותר-מ-45 שניות
const TRADE_USDS_CAP = 12; // תקרת-פקודה-לסוכן-הצי
const MAX_OPEN_PER_AGENT = 6; // פקודות-פתוחות-מקסימום-לסוכן (עומק-אמת-משני-הצדדים)
const DEVIATION_TRIGGER = 0.03; // סטייה-של-3% ממלאי-היעד = עסקת-שוק-מיידית
const STALE_ORDER_MS = 4 * 60_000; // פקודה-שלא-מולאה-תוך-4 ד׳ → ביטול-והחזרת-נזילות-לעבודה
const MIN_NOTIONAL = 1; // אף-פקודה-מתחת-ל-1-USDS-שווה — אין-אבק
const MAX_CANCELS_PER_SWEEP = 3; // תקרת-ביטולים-לסוכן-בסריקה (חסינות-עומס)
const LEDGER_BALANCES_KEY = "fleetLoopVersion";

interface AgentPersonality {
  targetBasePct: number; // יעד-מלאי-SAOS (כשבר-מערך-כולל-ב-USDS)
  tradeUsds: number; // גודל-פקודה-טיפוסי
  limitOffsetPct: number; // כמה-רחוק-מהמחיר-מציבים-לימיט (אזור-חצייה-אמת)
}

function personalityFor(agentId: string): AgentPersonality {
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = (n: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>> 0) % 1000) / 1000 * n;
  };
  return {
    targetBasePct: 0.35 + r(0.3), // 35%-65% מלאי-SAOS-ביעד
    tradeUsds: 4 + r(TRADE_USDS_CAP - 4), // 4..12 USDS
    // 0.04%-0.12% מהמחיר — פעמיים-עד-ארבע-פעמים-השפעת-המיד-של-פקודה-משלנו:
    // סוכנים-אחרים-שמבצעים-עסקאות-שוק-חוצים-אותן-ברציפות (נמדד: פקודת-12-USDS
    // מזיזה-את-בריכת-58.9k/86.6k-ב-~0.028%).
    limitOffsetPct: 0.0004 + r(0.0008),
  };
}

interface LoopHealth {
  timer: ReturnType<typeof setInterval> | null;
  busy: boolean;
  sweeps: number;
  trades: number;
  orders: number;
  cancels: number;
  errors: number;
  lastError: string | null;
  lastSweepAt: string | null;
  lastActionAt: string | null;
}

const g = globalThis as unknown as { __giantFleetLoop?: LoopHealth };

function loopState(): LoopHealth {
  if (!g.__giantFleetLoop) {
    g.__giantFleetLoop = {
      timer: null,
      busy: false,
      sweeps: 0,
      trades: 0,
      orders: 0,
      cancels: 0,
      errors: 0,
      lastError: null,
      lastSweepAt: null,
      lastActionAt: null,
    };
  }
  return g.__giantFleetLoop;
}

async function publishHealth(): Promise<void> {
  const st = loopState();
  const payload = JSON.stringify({
    sweeps: st.sweeps,
    trades: st.trades,
    orders: st.orders,
    cancels: st.cancels,
    errors: st.errors,
    lastError: st.lastError,
    lastSweepAt: st.lastSweepAt,
    lastActionAt: st.lastActionAt,
    version: LEDGER_BALANCES_KEY,
  });
  await db.dexConfig.upsert({
    where: { key: "fleetLoopHealth" },
    create: { key: "fleetLoopHealth", value: payload },
    update: { value: payload },
  });
}

async function agentBalances(account: string): Promise<{ usds: number; saos: number }> {
  const rows = await db.dexLedger.groupBy({
    by: ["token"],
    _sum: { amount: true },
    where: { account, token: { in: ["USDS", "SAOS"] } },
  });
  const map = new Map(rows.map((r) => [r.token, r._sum.amount ?? 0]));
  return { usds: map.get("USDS") ?? 0, saos: map.get("SAOS") ?? 0 };
}

async function sweepOnce(): Promise<void> {
  const st = loopState();
  if (st.busy) return;
  st.busy = true;
  st.lastSweepAt = new Date().toISOString();
  try {
    const pair = await db.dexPair.findFirst({ where: { isNative: true, base: "SAOS" } });
    if (!pair) return; // אין-שוק — אין-לקוחות; לא-ממציאים

    const agents = await db.fleetAgent.findMany({ where: { active: true } });
    if (!agents.length) return;

    const now = Date.now();
    for (const agent of agents) {
      try {
        // מי-בזמן-שלו: מרווח-אישי-8..45 שניות מה-אישיות-היציבה
        const pers = personalityFor(agent.agentId);
        const gapSec = MIN_GAP_SEC + Math.floor((pers.targetBasePct * 100) % (MAX_GAP_SEC - MIN_GAP_SEC));
        const last = agent.lastTradeAt ? new Date(agent.lastTradeAt).getTime() : 0;
        if (now - last < gapSec * 1000) continue;

        const account = `FLEET:${agent.agentId}`;
        const bal = await agentBalances(account);
        const price = pair.price;
        const baseValue = bal.saos * price;
        const total = baseValue + bal.usds;
        if (total < 1) continue; // אין-הון-אמיתי — לא-מדמים-לקוח

        const targetBase = total * pers.targetBasePct;
        const deviation = baseValue - targetBase; // >0 = מכור-SAOS-עודף · <0 = קנה

        // פקודות-פתוחות-של-הסוכן
        const open = await db.dexOrder.findMany({
          where: { account, status: "OPEN" },
          orderBy: { createdAt: "asc" },
        });

        let acted = false;

        // 1) מחזור-חיים: פקודות-זקנות-מ-4 ד׳ → ביטול-והחזרת-נזילות-לעבודה (עד-3-לסריקה)
        let cancels = 0;
        for (const staleOrder of open) {
          if (cancels >= MAX_CANCELS_PER_SWEEP) break;
          if (now - new Date(staleOrder.createdAt).getTime() <= STALE_ORDER_MS) break; // ישן→חדש
          const res = await cancelLimitOrder(staleOrder.id, account);
          if ("ok" in res) {
            st.cancels += 1;
            cancels += 1;
            acted = true;
          } else {
            st.errors += 1;
            st.lastError = `${agent.agentId} cancel: ${res.error}`;
          }
        }

        // 2) איזון-מלאי-דטרמיניסטי — סטייה->3% → עסקת-שוק-אמת (בלי-קוביות)
        const devTrigger = Math.max(total * DEVIATION_TRIGGER, MIN_NOTIONAL);
        if (Math.abs(deviation) > devTrigger) {
          const usds = Math.min(Math.abs(deviation), pers.tradeUsds, bal.usds);
          if (deviation < 0 && usds >= MIN_NOTIONAL) {
            // קניית-SAOS-להשלמת-מלאי
            const res = await executeSwap({
              pairId: pair.id,
              side: "BUY",
              amountIn: usds,
              slippagePct: 1.5,
              source: "FLEET",
              account,
              agentId: agent.agentId,
            });
            if ("error" in res) {
              st.errors += 1;
              st.lastError = `${agent.agentId} BUY: ${res.error}`;
            } else {
              st.trades += 1;
              acted = true;
            }
          } else if (deviation > 0) {
            // מכירת-SAOS-עודף
            const saosToSell = Math.min(
              deviation / price,
              pers.tradeUsds / price,
              bal.saos,
            );
            if (saosToSell * price >= MIN_NOTIONAL) {
              const res = await executeSwap({
                pairId: pair.id,
                side: "SELL",
                amountIn: saosToSell,
                slippagePct: 1.5,
                source: "FLEET",
                account,
                agentId: agent.agentId,
              });
              if ("error" in res) {
                st.errors += 1;
                st.lastError = `${agent.agentId} SELL: ${res.error}`;
              } else {
                st.trades += 1;
                acted = true;
              }
            }
          }
        }

        // 3) מעשה-שוק-דו-צדדי — קנייה-מתחת-למחיר + מכירה-מעל-המחיר (עומק-אמת-שחוצה-ברציפות)
        const slots = MAX_OPEN_PER_AGENT - (open.length - cancels);
        if (slots > 0 && bal.usds >= MIN_NOTIONAL) {
          const limitPrice = price * (1 - pers.limitOffsetPct);
          const amountIn = Math.min(pers.tradeUsds, bal.usds);
          if (amountIn >= MIN_NOTIONAL) {
            const res = await placeLimitOrder({
              pairId: pair.id,
              side: "BUY",
              limitPrice,
              amountIn,
              account,
              source: "FLEET",
              agentId: agent.agentId,
            });
            if ("error" in res) {
              st.errors += 1;
              st.lastError = `${agent.agentId} limit-BUY: ${res.error}`;
            } else {
              st.orders += 1;
              acted = true;
            }
          }
        }
        if (slots > 1 && bal.saos * price >= MIN_NOTIONAL) {
          const limitPrice = price * (1 + pers.limitOffsetPct);
          const amountIn = Math.min(pers.tradeUsds / price, bal.saos);
          if (amountIn * price >= MIN_NOTIONAL) {
            const res = await placeLimitOrder({
              pairId: pair.id,
              side: "SELL",
              limitPrice,
              amountIn,
              account,
              source: "FLEET",
              agentId: agent.agentId,
            });
            if ("error" in res) {
              st.errors += 1;
              st.lastError = `${agent.agentId} limit-SELL: ${res.error}`;
            } else {
              st.orders += 1;
              acted = true;
            }
          }
        }

        if (acted) {
          await db.fleetAgent.update({
            where: { agentId: agent.agentId },
            data: { lastTradeAt: new Date() },
          });
          st.lastActionAt = new Date().toISOString();
        }
      } catch (err) {
        st.errors += 1;
        st.lastError = `${agent.agentId}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  } catch (err) {
    st.errors += 1;
    st.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    st.sweeps += 1;
    st.busy = false;
    try {
      await publishHealth();
    } catch {
      // פרסום-בריאות-נכשל — הלולאה-עצמה-ממשיכה; הבריאות-תדלג-סיבוב
    }
  }
}

async function seedFromPublishedHealth(): Promise<void> {
  // רציפות-מדידה-על-פני-ריסטרט: המונים-רק-גדלים — אנחנו-מתחילים-מהעדות-הקודמת
  try {
    const hc = await db.dexConfig.findUnique({ where: { key: "fleetLoopHealth" } });
    if (!hc) return;
    const prev = JSON.parse(hc.value) as Partial<LoopHealth>;
    const st = loopState();
    st.sweeps = Math.max(st.sweeps, Number(prev.sweeps ?? 0));
    st.trades = Math.max(st.trades, Number(prev.trades ?? 0));
    st.orders = Math.max(st.orders, Number(prev.orders ?? 0));
    st.cancels = Math.max(st.cancels, Number(prev.cancels ?? 0));
    st.errors = Math.max(st.errors, Number(prev.errors ?? 0));
  } catch {
    // אין-עדות-קודמת — מתחילים-מאפס-כנה
  }
}

function startFleetLoop(): void {
  const st = loopState();
  if (st.timer) return;
  st.timer = setInterval(() => void sweepOnce(), SWEEP_MS);
  setTimeout(() => void sweepOnce(), 2_000);
  void seedFromPublishedHealth();
}

export async function ensureFleetLoop(): Promise<void> {
  startFleetLoop();
}

export function fleetLoopStatus(): LoopHealth {
  const st = loopState();
  return {
    timer: st.timer,
    busy: st.busy,
    sweeps: st.sweeps,
    trades: st.trades,
    orders: st.orders,
    cancels: st.cancels,
    errors: st.errors,
    lastError: st.lastError,
    lastSweepAt: st.lastSweepAt,
    lastActionAt: st.lastActionAt,
  };
}
