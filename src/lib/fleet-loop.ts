// fleet-loop.ts — מנוע-התדירות של-הריבונות v3 (server-only)
// הוראת-הבעלים (trace 1a143bf3ecaf116d · גל-80): "גוף-ריבוני-אוטונומי עם-מערכת-כלכלית-משל-עצמו
// צריך-לעשות אלפים-עשרות-אלפים עסקאות-ביום, ללא-תלות-חוץ, רק-על-ידי-הריבונות-עצמה. מקדמים-הכל-עכשיו".
//
// v2 מדד-חי ~1,300-3,200 מילויים/יום. v3 (גל-82) — שני-השסתומים-המוצהרים-בגל-80:
//   1. ריבוי-בריכות: הלולאה סחרה-רק-SAOS/USDS בעוד-4-זוגות-ילידים (SC-CONSOLE/DOMAIN/ROSH/FLEET)
//      ישבו-עם-בריכות-אמת-ואפס-זרימה. מעכשיו: כל-הסוכנים סוחרים-על-כל-בריכה-ילידה-חיה.
//   2. הון-חנוק: הצי עבד-על 278-USDS מול-טרזור-29,400 — התקרה-נפתחה (20,000) וההקצאות-מוגדלות.
//   + קצב: מרווח-סוכן 5..20ש׳ · פקודה-עד-24-USDS · עד-8-פתוחות · מחזור-חיים-2.5ד׳.
//
// חוקי-הבית של-הלולאה (בלי-שינוי-מהותי):
//  · סוחרים-רק-על-בריכות-ילידות-עם-רזרבות-אמת — אפס-תלות-חוץ. כל-מילוי = מנוע-האמת-האחד
//    (executeSwap / placeLimitOrder / cancelLimitOrder) — לדג'ר-אמת והשפעת-מחיר-אמת.
//  · כשל-כנה: שגיאה-נספרת-ונשמרת (fleetLoopLastError) — לא-נחבא-ולא-ממציאים-הצלחה.
//  · בריאות-הלולאה מתפרסמת-ב-DexConfig ונקראת-ציבורית דרך /api/fleet/state.

import { db } from "@/lib/db";
import { executeSwap } from "@/lib/dex-server";
import { placeLimitOrder, cancelLimitOrder } from "@/lib/dex-orders";

const SWEEP_MS = 4_000; // סריקה-כל-4 שניות — הריבונות-נושמת-בקצב-שוק, לא-בקצב-מעריץ
const MIN_GAP_SEC = 5; // מרווח-מינימלי-בין-פעולות-לסוכן (גל-82: 8→5)
const MAX_GAP_SEC = 20; // גם-אם-אין-מה-לעשות — לא-נשתוק-יותר-מ-20 שניות (גל-82: 45→20)
const TRADE_USDS_CAP = 24; // תקרת-פקודה-לסוכן-הצי (גל-82: 12→24)
const MAX_OPEN_PER_AGENT = 8; // פקודות-פתוחות-מקסימום-לסוכן (גל-82: 6→8)
const DEVIATION_TRIGGER = 0.03; // סטייה-של-3% ממלאי-היעד = עסקת-שוק-מיידית
const STALE_ORDER_MS = 2.5 * 60_000; // פקודה-שלא-מולאה-תוך-2.5 ד׳ → ביטול-והחזרת-נזילות (גל-82: 4→2.5)
const MIN_NOTIONAL = 1; // אף-פקודה-מתחת-ל-1-USDS-שווה — אין-אבק
const MAX_CANCELS_PER_SWEEP = 3; // תקרת-ביטולים-לסוכן-בסריקה (חסינות-עומס)
const MAX_ACTIONS_PER_SWEEP = 24; // חסינות-עומס-כוללת-לסריקה (SQLite-כותב-יחיד)
const MAX_POOL_ORDER_USDS = 0.006; // פקודה-לא-תעלה-על-0.6%-מרזרבת-הבריכה (קמעונאי-אמת-בכל-בריכה)
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
    targetBasePct: 0.35 + r(0.3), // 35%-65% מלאי-בסיס-ביעד
    tradeUsds: 4 + r(TRADE_USDS_CAP - 4), // 4..24 USDS (גל-82)
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
  pools: number; // כמה-בריכות-ילידות-חיות-הלולאה-סוחרת-עליהן (גל-82)
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
      pools: 0,
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
    pools: st.pools,
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

async function sweepOnce(): Promise<void> {
  const st = loopState();
  if (st.busy) return;
  st.busy = true;
  st.lastSweepAt = new Date().toISOString();
  try {
    // גל-82 · ריבוי-בריכות: כל-הזוגות-הילידים-עם-רזרבות-אמת — לא-רק-SAOS/USDS.
    // בריכה-בלי-רזרבות = לא-שוק; לא-ממציאים-זרימה-עליה.
    const pairs = await db.dexPair.findMany({
      where: { isNative: true, reserveBase: { gt: 0 }, reserveQuote: { gt: 0 } },
      orderBy: { sort: "asc" },
    });
    if (!pairs.length) return; // אין-שוק — אין-לקוחות; לא-ממציאים
    st.pools = pairs.length;

    const agents = await db.fleetAgent.findMany({ where: { active: true } });
    if (!agents.length) return;

    const now = Date.now();
    let actions = 0;

    for (const agent of agents) {
      if (actions >= MAX_ACTIONS_PER_SWEEP) break;
      try {
        // מי-בזמן-שלו: מרווח-אישי-5..20 שניות מה-אישיות-היציבה
        const pers = personalityFor(agent.agentId);
        const gapSec = MIN_GAP_SEC + Math.floor((pers.targetBasePct * 100) % (MAX_GAP_SEC - MIN_GAP_SEC));
        const last = agent.lastTradeAt ? new Date(agent.lastTradeAt).getTime() : 0;
        if (now - last < gapSec * 1000) continue;

        const account = `FLEET:${agent.agentId}`;
        // יתרות-החשבון-פעם-אחת (כל-האסימונים-הילידים) — ממנה-נגזר-המלאי-בכל-בריכה
        const tokens = [...new Set([...pairs.map((p) => p.base), "USDS"])];
        const rows = await db.dexLedger.groupBy({
          by: ["token"],
          _sum: { amount: true },
          where: { account, token: { in: tokens } },
        });
        const balMap = new Map(rows.map((r) => [r.token, r._sum.amount ?? 0]));
        const usds = balMap.get("USDS") ?? 0;
        // שווי-כולל-בכל-הבריכות — יעד-המלאי-לכל-בריכה = שווי-מחולק-שווה (MM-רב-שוק)
        let totalValue = usds;
        const baseValue = new Map<string, number>();
        for (const pair of pairs) {
          const bv = (balMap.get(pair.base) ?? 0) * pair.price;
          baseValue.set(pair.id, bv);
          totalValue += bv;
        }
        if (totalValue < 1) continue; // אין-הון-אמיתי — לא-מדמים-לקוח
        const targetPerPool = totalValue / pairs.length;

        // פקודות-פתוחות-של-הסוכן (על-כל-הבריכות)
        const open = await db.dexOrder.findMany({
          where: { account, status: "OPEN" },
          orderBy: { createdAt: "asc" },
        });

        // 1) מחזור-חיים: פקודות-זקנות-מ-2.5 ד׳ → ביטול-והחזרת-נזילות-לעבודה (עד-3-לסריקה)
        let cancels = 0;
        for (const staleOrder of open) {
          if (cancels >= MAX_CANCELS_PER_SWEEP) break;
          if (now - new Date(staleOrder.createdAt).getTime() <= STALE_ORDER_MS) break; // ישן→חדש
          const res = await cancelLimitOrder(staleOrder.id, account);
          if ("ok" in res) {
            st.cancels += 1;
            cancels += 1;
            actions += 1;
          } else {
            st.errors += 1;
            st.lastError = `${agent.agentId} cancel: ${res.error}`;
          }
        }

        // 2+3) על-כל-בריכה-חיה: איזון-מלאי + מעשה-שוק-דו-צדדי
        let openCount = open.length - cancels;
        for (const pair of pairs) {
          if (actions >= MAX_ACTIONS_PER_SWEEP) break;
          if (openCount >= MAX_OPEN_PER_AGENT) break;
          const price = pair.price;
          if (!Number.isFinite(price) || price <= 0) continue;

          // גודל-פקודה-מכובד-לבריכה: מינימום-בין-האישיות-לבין-0.6%-מהרזרבה (קמעונאי-אמת)
          const poolCap = pair.reserveQuote * MAX_POOL_ORDER_USDS;
          const tradeUsds = Math.min(pers.tradeUsds, poolCap);
          if (tradeUsds < MIN_NOTIONAL) continue;

          const deviation = (baseValue.get(pair.id) ?? 0) - targetPerPool; // >0 = מכור-עודף · <0 = קנה
          const devTrigger = Math.max(targetPerPool * DEVIATION_TRIGGER, MIN_NOTIONAL);

          if (deviation < -devTrigger && usds >= MIN_NOTIONAL) {
            // קניית-בסיס-להשלמת-מלאי-הבריכה
            const amountIn = Math.min(-deviation, tradeUsds, usds);
            if (amountIn >= MIN_NOTIONAL) {
              const res = await executeSwap({
                pairId: pair.id,
                side: "BUY",
                amountIn,
                slippagePct: 1.5,
                source: "FLEET",
                account,
                agentId: agent.agentId,
              });
              if ("error" in res) {
                st.errors += 1;
                st.lastError = `${agent.agentId} ${pair.base} BUY: ${res.error}`;
              } else {
                st.trades += 1;
                actions += 1;
              }
            }
          } else if (deviation > devTrigger) {
            // מכירת-בסיס-עודף
            const held = balMap.get(pair.base) ?? 0;
            const baseToSell = Math.min(deviation / price, tradeUsds / price, held);
            if (baseToSell * price >= MIN_NOTIONAL) {
              const res = await executeSwap({
                pairId: pair.id,
                side: "SELL",
                amountIn: baseToSell,
                slippagePct: 1.5,
                source: "FLEET",
                account,
                agentId: agent.agentId,
              });
              if ("error" in res) {
                st.errors += 1;
                st.lastError = `${agent.agentId} ${pair.base} SELL: ${res.error}`;
              } else {
                st.trades += 1;
                actions += 1;
              }
            }
          }

          // מעשה-שוק-דו-צדדי — קנייה-מתחת-המיד + מכירה-מעליו (עומק-אמת-שחוצה-ברציפות)
          if (openCount < MAX_OPEN_PER_AGENT && usds >= MIN_NOTIONAL) {
            const limitPrice = price * (1 - pers.limitOffsetPct);
            const amountIn = Math.min(tradeUsds, usds);
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
                st.lastError = `${agent.agentId} ${pair.base} limit-BUY: ${res.error}`;
              } else {
                st.orders += 1;
                openCount += 1;
                actions += 1;
              }
            }
          }
          const heldBase = balMap.get(pair.base) ?? 0;
          if (openCount < MAX_OPEN_PER_AGENT && heldBase * price >= MIN_NOTIONAL) {
            const limitPrice = price * (1 + pers.limitOffsetPct);
            const amountIn = Math.min(tradeUsds / price, heldBase);
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
                st.lastError = `${agent.agentId} ${pair.base} limit-SELL: ${res.error}`;
              } else {
                st.orders += 1;
                openCount += 1;
                actions += 1;
              }
            }
          }
        }

        if (actions > 0) {
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
    st.pools = Math.max(st.pools, Number(prev.pools ?? 0));
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
    pools: st.pools,
    lastError: st.lastError,
    lastSweepAt: st.lastSweepAt,
    lastActionAt: st.lastActionAt,
  };
}
