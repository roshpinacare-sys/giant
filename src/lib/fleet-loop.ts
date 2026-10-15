// fleet-loop.ts — לקוחות-האמת-הראשונים של-הריבונות (server-only)
// הוראת-הבעלים: הסוכנים-והצי עובדים-כלקוחות-האמת-של-הפלטפורמה-שלנו —
// הם-הקונים-והמוכרים-הראשונים-על-בריכת SAOS/USDS, בלי-שום-תלות-חוץ.
// כל-פעולה = קריאה-לאותן-פונקציות-מנוע בדיוק שה-API-הציבורי מפעיל
// (executeSwap / placeLimitOrder / cancelLimitOrder) — לדג'ר-אמת,
// מילוי-אמת, השפעת-מחיר-אמת. אין-סימולציה ואין-קיצורי-דרך.
//
// חוקי-הבית של-הלולאה:
//  · סוחרים-רק-על-הזוג-היליד SAOS/USDS (אפס-תלות-חוץ — גם-בלי-Binance-הלולאה-חיה).
//  · כל-סוכן-אישיות-יציבה-מה-hash-שלו (יעד-מלאי, גודל-פקודה, פיזור-לימיט).
//  · מינון-כנה: גודל-פקודה ≤ TRADE_USDS_CAP, ≤ 2 פקודות-פתוחות-לסוכן,
//    מרווח-מינימלי-בין-פעולות-לסוכן — לקוח-קמעונאי-אמיתי, לא-לוויתן.
//  · כשל-כנה: שגיאה-נספרת-ונשמרת (fleetLoopLastError) — לא-נחבא-ולא-ממציאים-הצלחה.
//  · בריאות-הלולאה מתפרסמת-ב-DexConfig ונקראת-ציבורית דרך /api/fleet/state.

import { db } from "@/lib/db";
import { executeSwap } from "@/lib/dex-server";
import { placeLimitOrder, cancelLimitOrder } from "@/lib/dex-orders";

const SWEEP_MS = 20_000; // סריקה-כל-20 שניות — הסוכנים-מחליטים-מתי-הם-בזמן-שלהם
const MIN_GAP_SEC = 120; // מרווח-מינימלי-בין-פעולות-לסוכן
const MAX_GAP_SEC = 300; // גם-אם-אין-מה-לעשות — לא-נשתוק-יותר-מ-5 דק
const TRADE_USDS_CAP = 12; // תקרת-פקודה-ללקוח-קמעונאי-מהצי
const MAX_OPEN_PER_AGENT = 2; // פקודות-לימיט-פתוחות-מקסימום-לסוכן
const DEVIATION_TRIGGER = 0.14; // סטייה-של-14% ממלאי-היעד = הצדקת-התאמה
const LEDGER_BALANCES_KEY = "fleetLoopVersion";

interface AgentPersonality {
  targetBasePct: number; // יעד-מלאי-SAOS (כשבר-מערך-כולל-ב-USDS)
  tradeUsds: number; // גודל-פקודה-טיפוסי
  limitOffsetPct: number; // כמה-רחוק-מהמחיר-מציבים-לימיט
  limitProb: number; // הסתברות-להציב-לימיט-כשהמלאי-מאוזן
  swapProb: number; // הסתברות-לבצע-התאמה-כשיש-סטייה
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
    tradeUsds: 4 + r(TRADE_USDS_CAP - 4),
    limitOffsetPct: 0.003 + r(0.012), // 0.3%-1.5% מהמחיר
    limitProb: 0.3 + r(0.35),
    swapProb: 0.55 + r(0.4),
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
        // מי-בזמן-שלו: מרווח-אישי-מה-gap-המינימלי-עד-המקסימלי
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

        // 1) מחזור-חיים-של-לקוח: פקודות-זקנות-מדי → ביטול-והחזרת-נזילות-לעבודה
        const staleOrder = open.find((o) => now - new Date(o.createdAt).getTime() > 30 * 60_000);
        if (staleOrder) {
          const res = await cancelLimitOrder(staleOrder.id, account);
          if ("ok" in res) {
            st.cancels += 1;
            acted = true;
          } else {
            st.errors += 1;
            st.lastError = `${agent.agentId} cancel: ${res.error}`;
          }
        }

        // 2) התאמת-מלאי — סטייה-משמעותית → עסקת-שוק-אמת
        const devTrigger = Math.max(total * DEVIATION_TRIGGER, pers.tradeUsds);
        if (!acted && Math.abs(deviation) > devTrigger && Math.random() < pers.swapProb) {
          const usds = Math.min(Math.abs(deviation), pers.tradeUsds, bal.usds);
          if (deviation < 0 && usds >= 1) {
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
            if (saosToSell * price >= 1) {
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

        // 3) מלאי-מאוזן → לקוח-מציב-לימיט-ליד-המחיר (בונה-עומק-אמת)
        if (!acted && open.length < MAX_OPEN_PER_AGENT && Math.random() < pers.limitProb) {
          const buySide = Math.random() < 0.5;
          const limitPrice = buySide
            ? price * (1 - pers.limitOffsetPct)
            : price * (1 + pers.limitOffsetPct);
          const amountIn = buySide
            ? Math.min(pers.tradeUsds, bal.usds)
            : Math.min(pers.tradeUsds / limitPrice, bal.saos);
          if (amountIn > 0) {
            const res = await placeLimitOrder({
              pairId: pair.id,
              side: buySide ? "BUY" : "SELL",
              limitPrice,
              amountIn,
              account,
              source: "FLEET",
              agentId: agent.agentId,
            });
            if ("error" in res) {
              st.errors += 1;
              st.lastError = `${agent.agentId} limit: ${res.error}`;
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
  setTimeout(() => void sweepOnce(), 5_000);
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
