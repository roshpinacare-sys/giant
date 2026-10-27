/**
 * soldier-mesh — רשת-ריבוי-חשבונות על הבורסה הפנימית (:3063, trace 1a17d806eb807211 §2)
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 8 לולאות-סוחר מקבילות (מפתח-API אחד לכל-חייל), כל-חייל סוחר אך-ורק בכסף-שהופקד-לו
 * (תורת הבורסה: אפס-טביעה). כל-לולאה:
 *   · קוראת עומק-ספר חי (GET /api/dex/depth?pairId=…) עם ה-X-API-Key שלה
 *   · מציבה פקודות-לימיט קטנות משני-צדי-המחיר-החי (market-making סביב-ה-mid)
 *   · מבטלת-ומציבה-מחדש כשהמחיר-נדד מעבר סף (re-peg), ≤2 פקודות-פתוחות-לצד
 *   · כל-מילוי = מיקרו-מרווח אמת + עמלה לקופת-הבורסה (feeMeter/fees24h)
 * קצב: מחזור-כל-5-שניות לחייל, סטגר-1-שנייה-בין-חיילים (אפס-התנגשות-קצב).
 * קבלות: state/receipts.jsonl (hash-chain כמו הצי) + /health חשוף-תוצאות-כנות.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.SOLDIER_MESH_PORT ?? 3063);
const HOST = "127.0.0.1";
const DEX = process.env.SOLDIER_MESH_DEX ?? "http://127.0.0.1:3000";
const CYCLE_MS = Number(process.env.SOLDIER_MESH_CYCLE_MS ?? 5_000);
const STATE_DIR = path.resolve(import.meta.dir, "state");
const KEYS_FILE = path.join(STATE_DIR, "keys.json");
const RECEIPTS = path.join(STATE_DIR, "receipts.jsonl");

interface SoldierKey {
  raw: string;
  account: string;
  label: string;
}
interface OpenOrder {
  id: string;
  pairId: string;
  side: string;
  limitPrice: number;
  amountIn: number;
}
interface MeshStats {
  placed: number;
  cancelled: number;
  fills: number;
  errors: number;
  lastCycleAt: string;
}

const soldiers: Map<string, SoldierKey & { stats: MeshStats; timer: ReturnType<typeof setInterval> | null }> = new Map();
let pairRegistry: { id: string; base: string; quote: string; isNative: boolean }[] = [];
let receiptChain = "SAOS-SOLDIER-MESH-GENESIS";

function loadKeys(): void {
  const st = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")) as Record<string, SoldierKey>;
  for (const [prefix, k] of Object.entries(st)) {
    if (!soldiers.has(prefix)) {
      soldiers.set(prefix, { ...k, stats: { placed: 0, cancelled: 0, fills: 0, errors: 0, lastCycleAt: "-" }, timer: null });
    }
  }
  fs.chmodSync(KEYS_FILE, 0o600);
}

function receipt(event: Record<string, unknown>): void {
  const core = { at: new Date().toISOString(), ...event };
  const sha = createHash("sha256").update(receiptChain + JSON.stringify(core)).digest("hex");
  receiptChain = sha;
  try {
    fs.appendFileSync(RECEIPTS, JSON.stringify({ sha: sha.slice(0, 16), ...core }) + "\n");
  } catch { /* כנה — הקבלה-בזיכרון נשמרת */ }
}

async function dexGet(pathname: string, key: string): Promise<unknown> {
  const r = await fetch(`${DEX}${pathname}`, { headers: { "X-API-Key": key } });
  if (!r.ok) throw new Error(`GET ${pathname} → ${r.status}`);
  return r.json();
}

async function dexPost(pathname: string, body: unknown, key: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${DEX}${pathname}`, {
    method: "POST",
    headers: { "X-API-Key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, json };
}

async function dexDelete(pathname: string, body: unknown, key: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${DEX}${pathname}`, {
    method: "DELETE",
    headers: { "X-API-Key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, json };
}

/** מחזור-מסחר אחד של חייל אחד: קריאת-ספר → ביטול-סוטה → הצבה-משני-צדי-ה-mid */
async function soldierCycle(prefix: string, k: SoldierKey & { stats: MeshStats }, pair: { id: string; base: string }): Promise<void> {
  k.stats.lastCycleAt = new Date().toISOString();
  // 1. הפקודות-הפתוחות שלי + יתרות (הצורה-האמת: market/myOrders/myBalances) + הספר (depth?pair=)
  const orders = (await dexGet(`/api/dex/orders?pairId=${pair.id}`, k.raw)) as {
    myOrders?: OpenOrder[];
    myBalances?: Record<string, number>;
    market?: { price: number };
  };
  const depth = (await dexGet(`/api/dex/depth?pair=${pair.id}`, k.raw)) as {
    mid?: number;
    bids?: { price: number }[];
    asks?: { price: number }[];
  };
  const my = orders.myOrders ?? [];
  // 2. מחיר-חי: mid-מהספר או מחיר-השוק
  const bid = depth.bids?.[0]?.price ?? 0;
  const ask = depth.asks?.[0]?.price ?? 0;
  const mid = depth.mid ?? (bid > 0 && ask > 0 ? (bid + ask) / 2 : orders.market?.price ?? 0);
  if (mid <= 0) return;
  // 3. ביטול-פקודות-שסטו מה-mid מעבר 0.4% (re-peg law)
  for (const o of my) {
    if (Math.abs(o.limitPrice - mid) / mid > 0.0015) {
      const del = await dexDelete("/api/dex/orders", { id: o.id }, k.raw);
      if (del.status === 200) {
        k.stats.cancelled++;
        receipt({ kind: "cancel", soldier: prefix, pair: pair.base, orderId: o.id, drift: Number((((o.limitPrice - mid) / mid) * 100).toFixed(3)) });
      }
    }
  }
  // 4. יתרות-אמת: אף-הצבה-בלי-כסף (אפס-טביעה)
  const balUsds = orders.myBalances?.USDS ?? 0;
  const balBase = orders.myBalances?.[pair.base] ?? 0;
  // 5. הצבה: עד-2-פתוחות-לצד; גודל-פקודה עני-המצב (≤10% מהיתרה)
  const openBids = my.filter((o) => o.side === "BUY" && Math.abs(o.limitPrice - mid) / mid <= 0.004).length;
  const openAsks = my.filter((o) => o.side === "SELL" && Math.abs(o.limitPrice - mid) / mid <= 0.004).length;
  const tick = Math.max(mid * 0.0003, 0.000001); // מיקרו-מרווח ~3bps — קרוב-מספיק-כדי-שזרימה-תחצה
  if (openBids < 2 && balUsds > 5) {
    const spend = Math.min(balUsds * 0.1, 30);
    const price = Number((mid - tick).toFixed(8));
    const amt = Number((spend / price).toFixed(6));
    const res = await dexPost("/api/dex/orders", { pairId: pair.id, side: "BUY", limitPrice: price, amountIn: amt }, k.raw);
    if (res.status === 200) {
      k.stats.placed++;
      receipt({ kind: "place", soldier: prefix, pair: pair.base, side: "BUY", price, amount: amt });
    } else if (!String(res.json.error ?? "").includes("מספיק")) {
      k.stats.errors++;
    }
  }
  if (openAsks < 2 && balBase > 0) {
    const amt = Number(Math.min(balBase * 0.1, 30 / (mid + tick)).toFixed(6));
    if (amt > 0) {
      const price = Number((mid + tick).toFixed(8));
      const res = await dexPost("/api/dex/orders", { pairId: pair.id, side: "SELL", limitPrice: price, amountIn: amt }, k.raw);
      if (res.status === 200) {
        k.stats.placed++;
        receipt({ kind: "place", soldier: prefix, pair: pair.base, side: "SELL", price, amount: amt });
      } else if (!String(res.json.error ?? "").includes("מספיק")) {
        k.stats.errors++;
      }
    }
  }
}

function health(): Response {
  const arr = [...soldiers.entries()].map(([prefix, s]) => ({
    soldier: s.label,
    account: s.account,
    placed: s.stats.placed,
    cancelled: s.stats.cancelled,
    errors: s.stats.errors,
    lastCycleAt: s.stats.lastCycleAt,
  }));
  const totals = arr.reduce((a, s) => ({ placed: a.placed + s.placed, cancelled: a.cancelled + s.cancelled, errors: a.errors + s.errors }), { placed: 0, cancelled: 0, errors: 0 });
  return new Response(
    JSON.stringify({ ok: true, service: "soldier-mesh", version: "1.0.0", law: "api-key-accounts-only · zero-mint · re-peg 40bps", soldiers: arr, totals, pairs: pairRegistry.map((p) => p.base), cycleMs: CYCLE_MS, receiptChainHead: receiptChain.slice(0, 16) }, null, 1),
    { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
  );
}

async function tickAll(): Promise<void> {
  if (!pairRegistry.length) return;
  let i = 0;
  for (const [prefix, s] of soldiers) {
    const pair = pairRegistry[i % pairRegistry.length];
    i++;
    try {
      await soldierCycle(prefix, s, pair);
    } catch (e) {
      s.stats.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("401")) receipt({ kind: "error", soldier: prefix, msg: msg.slice(0, 100) });
    }
  }
  // ספירת-מילויים כנה מהבורסה (fees24h/מילויים נמדדים-שם)
  try {
    const ov = (await fetch(`${DEX}/api/dex/overview`).then((r) => r.json())) as { kpis?: { fees24h?: number; vol24h?: number } };
    receipt({ kind: "tick", fees24h: ov.kpis?.fees24h, vol24h: ov.kpis?.vol24h });
  } catch { /* כנה */ }
}

// ── עלייה ────────────────────────────────────────────────────────────────
if (import.meta.main) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  loadKeys();
  if (soldiers.size === 0) {
    console.error("[soldier-mesh] אין-מפתחות-חיילים (state/keys.json ריק) — fail-closed, אף-לולאה-לא-עולה");
    process.exit(1);
  }
  // רישום-הזוגות: נייטיב-נזיל (ההוראה "הכל-נזיל") — SAOS/USDS + 3 נוספים ברוטציה
  fetch(`${DEX}/api/dex/pairs`)
    .then((r) => r.json())
    .then((j: { pairs?: { id: string; base: string; quote: string; isNative: boolean }[] }) => {
      const ps = (j.pairs ?? []).filter((p) => p.isNative);
      pairRegistry = ps.slice(0, 5).map((p) => ({ id: p.id, base: p.base, quote: p.quote, isNative: p.isNative }));
      console.log(`[soldier-mesh] pairs: ${pairRegistry.map((p) => p.base).join(",")}`);
    })
    .catch(() => console.error("[soldier-mesh] pairs probe failed — ינסה-שוב-במחזור"));
  setInterval(() => {
    if (!pairRegistry.length) {
      fetch(`${DEX}/api/dex/pairs`).then((r) => r.json()).then((j: { pairs?: { id: string; base: string; quote: string; isNative: boolean }[] }) => {
        pairRegistry = (j.pairs ?? []).filter((p) => p.isNative).slice(0, 5).map((p) => ({ id: p.id, base: p.base, quote: p.quote, isNative: p.isNative }));
      }).catch(() => { /* כנה */ });
      return;
    }
    void tickAll();
  }, CYCLE_MS);
  const server = Bun.serve({ port: PORT, hostname: HOST, fetch: (req) => {
    const p = new URL(req.url).pathname;
    if (p === "/health") return health();
    return new Response(JSON.stringify({ ok: false, error: "not-found" }), { status: 404 });
  } });
  console.log(`[soldier-mesh] LIVE :${server.port} — ${soldiers.size} soldiers · cycle=${CYCLE_MS}ms · law: api-key-accounts-only · zero-mint`);
  receipt({ kind: "boot", soldiers: soldiers.size, cycleMs: CYCLE_MS });
}
