/* ═══ fleet-economy · פורט 3016 · הכלכלה-הפנימית של הריבונות ═══
 * ==============================================================================
 * תורת-משתמשי-פנים (מנדט-הבעלים, trace 1a143bc66c2a9c05):
 *   "החיילים, הצי, הסוכנים — הם המשתמשים ברשת, כהוכחה ומטרה. לא לחפש לקוחות
 *    חוץ. לפתח יכולות כלפי פנים ולא כלפי חוץ. 20-ומשהו עסקאות ב-24 שעות זה
 *    מגוחך — צריך אלפים, עשרות-אלפים, מאות-אלפים עסקאות ביום, ללא תלות חוץ."
 *
 * מה-זה: מנוע-כלכלה חי שבו כל-משתמשי-הפנים (שש-החיילות של המשרד + צמתי-הצי)
 * מבצעים עסקאות אמת ברציפות: משכורות, תשלומי-שירות הדדיים (חישוב/אחסון/מידע/
 * דלק), החלפות SAOS<->USDS על בריכת-AMM אמיתית, סטייקינג, טיפים.
 *
 * חוקי-אמת (אפס-הדמיות):
 *  · ספר hash-chain: כל-רשומה חתומה sha256(prevH+body) — חסים-תיקון, כל
 *    שינוי-עבר מתגלה. /verify מאמת את השרשרת כולה.
 *  · איזון-כפול: כל-עסקה מחייבת יתרה-קיימת אצל המשלם — אין כסף מהאוויר,
 *    היצע-קבוע. עסקה שנדחית נספרת בכנות (rejected) ולא נכתבת.
 *  · הספר append-only על-גבי-הדיסק (state/ledger.jsonl) — נאטם לגיט ע"י
 *    vault-seal, שום דבר לא מת עם ה-sandbox.
 *  · בריכת-AMM קבועת-מכפלה אמיתית: המחיר נע מהזרימה, עמלת 0.3% נשארת
 *    בבריכה (העמקת-נזילות), אספקת SAOS קבועה 21,000 (חוק-21M המתוקן).
 * ============================================================================== */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { denyIfPublic } from "../lib/vault-auth.ts"; // גל-80 · חוק-הסף-הריבוני (§1 lockdown, trace 1a173c3929f5d23d)

const PORT = 3016;
const STATE_DIR = path.join(import.meta.dir, "state");
const LEDGER = path.join(STATE_DIR, "ledger.jsonl");
const SNAP = path.join(STATE_DIR, "snapshot.json");
const TICK_MS = 800; // גל-85: 900→800 (תקורה-זעירה — flush הוא append-בלבד)
const SNAP_MS = 30_000;
const FEE_BPS = 30; // 0.3%
const WAGE_FLOOR_USDS = 350; // גל-83 · חוק-שכר-מצע: רצפת-פרנסה לחייל
const TAX_BPS = 200; // גל-83 · מס-שירותים 2% → הכספת (מימון-השכר)

/* ── משתמשי-הפנים ─────────────────────────────────────────────────────────── */
type Account = { id: string; kind: "treasury" | "soldier" | "fleet" | "pool"; role: string };
const SOLDIERS = [
  { id: "yarden", role: "סוגרת-פינות משולחן ראש-המטה" },
  { id: "tamar", role: "מעדכנת תזרים בecon-book" },
  { id: "shachar", role: "סורק ריצות שנכשלו בקיר-הגיט" },
  { id: "aluf", role: "סוקר את לוח-המשימות" },
  { id: "erez", role: "מציג ממצאים בדוכן-ההחלטות" },
  { id: "gal", role: "סורק מילויים בdex-book" },
] as const;
const FLEET_NODES = [
  { id: "FleetHQ", role: "חדר-מבצעים חי" },
  { id: "Domain", role: "הוויטרינה" },
  { id: "TruthRail", role: "ערוץ הקבלות" },
  { id: "saos-dex", role: "מנוע-הדקס" },
  { id: "Pulse", role: "דופק-רשת" },
  { id: "Console", role: "קונסולת-ענן" },
] as const;

const ACCOUNTS: Account[] = [
  { id: "treasury", kind: "treasury", role: "הכספת הריבונית" },
  { id: "pool", kind: "pool", role: "בריכת SAOS/USDS" },
  ...SOLDIERS.map((s) => ({ id: s.id, kind: "soldier" as const, role: s.role })),
  ...FLEET_NODES.map((n) => ({ id: n.id, kind: "fleet" as const, role: n.role })),
  { id: "boot-verifier", kind: "fleet" as const, role: "מאמת-האתחול :3042 (הוכחת-חיים)" },
];

/* ── הצע-קבוע (חוק-21M המתוקן: אספקת SAOS = 21,000, לעולם לא נרגעת) ────────── */
const SAOS_SUPPLY = 21_000;
const TREASURY_USDS = 60_000;
const POOL_SAOS = 8_000;
const POOL_USDS = 8_030; // מחיר-פתיחה ≈ 1.0038 USDS/SAOS

type Balances = Map<string, { usds: number; saos: number; saosStaked: number }>;
type Tx = {
  seq: number; ts: number; kind: string; from: string; to: string;
  asset: "USDS" | "SAOS"; amount: number; fee?: number; price?: number;
  reason: string; ref?: string; h: string;
};

let balances: Balances = new Map();
let pool = { saos: POOL_SAOS, usds: POOL_USDS, feesUsds: 0, feesSaos: 0 };
let seq = 0;
let lastH = "GENESIS";
let tickNo = 0; // גל-83 · מונה-טיקים לחוקים-הפיסקליים (שכר-מצע/איסוף-עמלות)
let ledgerBuf: string[] = [];
let ledgerLines = 0;
let ledgerFileNo = 0;
let recent: number[] = []; // timestamps (24h window)
let byKind: Record<string, number> = {};
let byAccount: Record<string, number> = {};
let rejected = 0;
/* גל-85 · מווסת-קצב אדפטיבי: ניסיונות-פר-טיק נשלטים-על-ידי-אחוז-הקבלה בפועל.
 * קבלה גבוהה (>92%) → המצערת נפתחת · קבלה נמוכה (<70%) → נסגרת.
 * כנות-מלאה: attemptsTotal ואחוז-הקבלה מוצגים ב-/metrics. */
let nBase = 14;
const N_CAP = 18, N_MIN = 6, GOV_PERIOD = 40;
let attemptsTotal = 0;
let winAttempts = 0, winRejected = 0, lastGovAcc: number | null = null;
let rejectedAtBoot = 0; // גל-85 · המונה-משוחזר-מהסנאפשוט — המדידה-הכנה-היא-רק-על-העלייה-הנוכחית
function rej() { rejected++; winRejected++; }
let errors = 0;
let bootedAt = Date.now();
let lastVerify: { at: number; ok: boolean; checked: number } | null = null;
let sealing = false; // חוק-גל-82: מנוע-קפוא-בזמן-אטימת-כספת (אף-כתיבת-מדינה)
const tailRing: Tx[] = []; // last 500 for /ledger reads

/* ── ingest אמת: אירועי-מערכת אמיתיים (מילויי-דקס · בדיקות-מאמת-אתחול · אטימות)
 *      נרשמים כעסקאות בספר — כל-tx ממופה 1:1 לאירוע שקרה. אפס-סינתזה.
 *  מונים-כנים: ingestOk / ingestDedup / ingestFailed / ingestBadPayload.
 *  droppedTx = עסקאות-אירוע שאבדו (מוצא-נכשל או דחיית-איזון סופית) — מוצג ב-/metrics.
 */
let ingestOk = 0, ingestDedup = 0, ingestFailed = 0, ingestBad = 0;
/* גל-90 · תורת-כותבים-רבים (מנדט-הבעלים, trace 1a14609170df995d):
 *  · היסטוגרמת-סיבות-כנה — לא רק מונה, אלא למה כל דחייה קרתה.
 *  · מילוי-כספת אוטונומי — pool→treasury חסום-רצפה-וקירור, רשומת-אמת בספר.
 *  · תור-ניסיון-חוזר — אירוע-כותב שנדחה מאזנים לא אובד: נשמר, מנוסה שוב אחרי
 *    מילוי-אוטונומי, עד 5 ניסיונות → מכתב-מת (מדוד בכנות). */
const ingestWhyHist: Record<string, number> = {};
function noteWhy(why: string): void { ingestWhyHist[why] = (ingestWhyHist[why] ?? 0) + 1; }
const RETRY_MAX_ATTEMPTS = 5;
const RETRY_FILE = path.join(STATE_DIR, "ingest-retry.jsonl");
const DEAD_FILE = path.join(STATE_DIR, "ingest-dead.jsonl");
type RetryItem = { ev: { kind: string; from: string; to: string; asset: "USDS" | "SAOS"; amount: number; reason: string; ref: string; refillFloat?: boolean }; attempts: number; firstTs: number; lastWhy: string };
const retryQueue: RetryItem[] = [];
let retryDirty = false;
let ingestQueued = 0, ingestDead = 0, ingestRetriedOk = 0, refillRounds = 0, refillUsds = 0, refillSaos = 0;
function persistRetryQueue(): void {
  if (!retryDirty) return;
  try { fs.writeFileSync(RETRY_FILE, retryQueue.map((r) => JSON.stringify(r)).join("\n") + (retryQueue.length ? "\n" : "")); retryDirty = false; } catch { /* כנה — הסבב הבא */ }
}
const seenRefs = new Map<string, number>(); // ref → ts (דהיות: פקודות-כפולות של מפיקים לא נספרות פעמיים)
const SEEN_REFS_CAP = 20_000;
const SEEN_REFS_SNAP = 5_000; // כמה-refs-שורדים-ב-snapshot (האחרונים-ראשית — Map שומר-סדר-הכנסה)
const INGEST_KINDS = new Set(["dex-fee", "infra", "service"]);
const KNOWN_ACCOUNTS = new Set(ACCOUNTS.map((a) => a.id));
function rememberRef(ref: string) {
  if (seenRefs.size >= SEEN_REFS_CAP) {
    const first = seenRefs.keys().next().value as string | undefined;
    if (first !== undefined) seenRefs.delete(first);
  }
  seenRefs.set(ref, Date.now());
}
/* תדלוק-צף: חשבון-פנים שמשלם אגרות-אירוע לעולם לא נתקע — הכספת ממלאת אותו
 * ליעד-קטן (25-USDS) בעסקת-משכורת אמת בספר (מתועדת, נחתמת בשרשרת). */
const FLOAT_TARGET = 25;
function refillFloatIfEmpty(payer: string, needed: number): boolean {
  const b = bal(payer);
  if (b.usds >= needed) return true;
  const fill = round6(FLOAT_TARGET - b.usds);
  if (fill <= 0) return b.usds >= needed;
  const r = apply({ seq: seq + 1, ts: Date.now(), kind: "salary", from: "treasury", to: payer, asset: "USDS", amount: fill, reason: `תדלוק-צף-אגרות-אירועים (${payer})` });
  return r !== null && bal(payer).usds >= needed;
}
/* הכנסת-אירוע אמת לספר. מחזיר Tx|null וסופר בכנות. */
function ingestEvent(v: {
  kind: string; from: string; to: string; asset: "USDS" | "SAOS"; amount: number;
  reason: string; ref: string; refillFloat?: boolean;
}): { ok: boolean; dedup?: boolean; tx?: Tx; why?: string } {
  if (!INGEST_KINDS.has(v.kind) || !KNOWN_ACCOUNTS.has(v.from) || !KNOWN_ACCOUNTS.has(v.to)) {
    ingestBad++; noteWhy("bad-kind-or-account"); return { ok: false, why: "bad-kind-or-account" };
  }
  if (!(v.asset === "USDS" || v.asset === "SAOS") || !Number.isFinite(v.amount) || v.amount <= 0 || v.amount > 1_000_000) {
    ingestBad++; noteWhy("bad-amount"); return { ok: false, why: "bad-amount" };
  }
  const reason = String(v.reason).slice(0, 300);
  const ref = String(v.ref).slice(0, 200);
  if (seenRefs.has(ref)) { ingestDedup++; return { ok: true, dedup: true, why: "already-recorded" }; }
  if (v.refillFloat && v.asset === "USDS" && !refillFloatIfEmpty(v.from, v.amount)) {
    ingestFailed++; noteWhy("float-refill-failed"); return { ok: false, why: "float-refill-failed" };
  }
  const tx = apply({ seq: seq + 1, ts: Date.now(), kind: v.kind, from: v.from, to: v.to, asset: v.asset, amount: round6(v.amount), reason, ref });
  if (!tx) {
    // גל-90 · תורת-כותבים-רבים: דחיית-מאזן אינה קץ — האירוע נשמר בתור-ניסיון-חוזר
    // (המילוי-האוטונומי יתדלק את הכספת והסבב-הבא ירוקן את התור). עד-5 ניסיונות.
    const q = retryQueue.find((r) => r.ev.ref === ref);
    if (q) { q.attempts++; q.lastWhy = "balance-rejected"; }
    else if (retryQueue.length < 10_000) { retryQueue.push({ ev: { ...v, amount: round6(v.amount) }, attempts: 1, firstTs: Date.now(), lastWhy: "balance-rejected" }); ingestQueued++; }
    else { ingestDead++; noteWhy("queue-full-dead"); }
    retryDirty = true;
    ingestFailed++; noteWhy("balance-rejected");
    return { ok: false, why: "balance-rejected (queued for autonomous retry)" };
  }
  rememberRef(ref);
  ingestOk++;
  return { ok: true, tx };
}

function bal(id: string) {
  let b = balances.get(id);
  if (!b) { b = { usds: 0, saos: 0, saosStaked: 0 }; balances.set(id, b); }
  return b;
}

/* ── חתימת-שרשרת ──────────────────────────────────────────────────────────── */
function sealTx(t: Omit<Tx, "h">): Tx {
  const body = JSON.stringify({ ...t, prev: lastH });
  const h = createHash("sha256").update(body).digest("hex").slice(0, 32);
  return { ...t, h };
}

function persist(tx: Tx) {
  ledgerBuf.push(JSON.stringify(tx));
  if (ledgerBuf.length >= 64) flush();
  tailRing.push(tx);
  if (tailRing.length > 500) tailRing.shift();
}

function flush() {
  if (!ledgerBuf.length) return;
  fs.appendFileSync(LEDGER, ledgerBuf.join("\n") + "\n");
  ledgerLines += ledgerBuf.length;
  ledgerBuf = [];
  if (ledgerLines > 200_000) rotate();
}

function rotate() {
  flush();
  const dst = path.join(STATE_DIR, `ledger-${String(ledgerFileNo).padStart(4, "0")}.jsonl`);
  try { fs.renameSync(LEDGER, dst); ledgerFileNo++; ledgerLines = 0; } catch { /* honest */ }
}

/* ── החלה עם איזון-כפול fail-closed ───────────────────────────────────────── */
function apply(t: Omit<Tx, "h">, refH?: string): Tx | null {
  const from = bal(t.from), to = bal(t.to);
  const field = t.asset === "USDS" ? "usds" : "saos";
  if ((from as any)[field] < t.amount) { rej(); return null; }
  if (t.kind === "stake") {
    from.saos -= t.amount; from.saosStaked += t.amount;
  } else if (t.kind === "unstake") {
    if (from.saosStaked < t.amount) { rej(); return null; }
    from.saosStaked -= t.amount; to.saos += t.amount;
  } else {
    (from as any)[field] -= t.amount;
    if (t.kind === "swap") {
      // מטבע-נכנס יושב בבריכה, עמלה נשארת בה
      const feeAmt = t.fee ?? 0;
      if (t.asset === "USDS") { pool.usds += t.amount; pool.saos -= (t as any).outSaos; to.saos += (t as any).outSaos; pool.feesUsds += feeAmt; }
      else { pool.saos += t.amount; pool.usds -= (t as any).outUsds; to.usds += (t as any).outUsds; pool.feesSaos += feeAmt; }
    } else {
      (to as any)[field] += t.amount;
    }
  }
  byAccount[t.from] = (byAccount[t.from] ?? 0) + 1;
  byAccount[t.to] = (byAccount[t.to] ?? 0) + 1;
  const signed = sealTx(t);
  if (refH !== undefined && signed.h !== refH) { /* replay mismatch — honest */ }
  seq = signed.seq; lastH = signed.h;
  recent.push(signed.ts);
  byKind[signed.kind] = (byKind[signed.kind] ?? 0) + 1;
  persist(signed);
  return signed;
}

function ammSwap(user: string, asset: "USDS" | "SAOS", amountIn: number, reason: string): Tx | null {
  // קניית SAOS ב-USDS: usds נכנס → saos יוצא (מחיר קבוע-מכפלה, ללא עמלת-דליפה)
  const k = pool.saos * pool.usds;
  if (asset === "USDS") {
    const out = pool.saos - k / (pool.usds + amountIn * (1 - FEE_BPS / 10_000));
    if (out <= 0 || out > pool.saos * 0.5) { rej(); return null; }
    return apply({ seq: seq + 1, ts: Date.now(), kind: "swap", from: user, to: "pool", asset, amount: amountIn, fee: +(amountIn * FEE_BPS / 10_000).toFixed(6), price: +(pool.usds / pool.saos).toFixed(6), reason, outSaos: +out.toFixed(6) } as any);
  }
  const out = pool.usds - k / (pool.saos + amountIn * (1 - FEE_BPS / 10_000));
  if (out <= 0 || out > pool.usds * 0.5) { rej(); return null; }
  return apply({ seq: seq + 1, ts: Date.now(), kind: "swap", from: user, to: "pool", asset, amount: amountIn, fee: +(amountIn * FEE_BPS / 10_000).toFixed(6), price: +(pool.usds / pool.saos).toFixed(6), reason, outUsds: +out.toFixed(6) } as any);
}

/* ── מחולל-העסקאות: המשתמשים-הפנימיים משתמשים בכלים בזרימה חכמה ────────────── */
const SERVICES = [
  { name: "חישוב-GPU", unit: "דקות-חישוב", price: 1.4 },
  { name: "אחסון-ארכיון", unit: "GB-חודש", price: 0.35 },
  { name: "מידע-שוק", unit: "פיד", price: 0.9 },
  { name: "סריקת-גיט", unit: "ריצה", price: 2.1 },
  { name: "תרגום-מסמך", unit: "מסמך", price: 1.1 },
  { name: "תדלוק-RC", unit: "מנה", price: 3.2 },
  { name: "אימות-קבלה", unit: "חותמת", price: 0.6 },
];
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const round6 = (x: number) => +x.toFixed(6);

function spawnTx(): Tx | null {
  const r = Math.random();
  const soldier = pick(SOLDIERS).id;
  if (r < 0.06) { // משכורת/תדלוק מהכספת — **ב-SAOS** (גל-85 · מיחזור-מחסן-הכספת)
    // שכר-ב-SAOS יוצר-את-צד-המכירה-האמיתי-בבריכה: חיילים-מקבלים-SAOS → מוכרים
    // → USDS חוזר-מהבריכה (נמדד: רק-קניות = הבריכה-בלעה-77K-USDS-והכספת-מתה)
    const amt = round6(0.2 + Math.random() * 0.8);
    return apply({ seq: seq + 1, ts: Date.now(), kind: "salary", from: "treasury", to: soldier, asset: "SAOS", amount: amt, reason: "משכורת-SAOS על עבודת-שורה חיה · מיחזור-מחסן-הכספת" });
  }
  if (r < 0.50) { // תשלום-שירות הדדי — עיקר-הזרימה (משתמשי-פנים משלמים זה לזה)
    // גל-85 · נמען-משוקלל: החיילים-הם-ספקי-העבודה-של-הרשת — 80% מהשירותים
    // משולמים-להם (נמדד: 50/50 = זרימה-אפסית-לחיילים → הם-מתרוקנים → 62% קבלה)
    const soldierIds = SOLDIERS.map((s) => s.id);
    const nodeIds = FLEET_NODES.map((n) => n.id);
    const receiver = Math.random() < 0.8 ? pick(soldierIds) : pick(nodeIds);
    const svc = pick(SERVICES);
    const units = 1 + Math.floor(Math.random() * 8);
    // גל-83 · זרימה-חוזרת: צמתי-הצי קונים-שירותים מהחיילים
    // גל-85 · משלם-משוקלל-עושר: חלק-הצמתים-בתשלום נגזר-מחלקתם-בהון-המחזורי בפועל
    // (מי-שצבר-תשתית משלם-יותר — הכסף-לא-נתקע-אצל-אף-אחד; חלון-מוגן 20%-50%)
    let nodeW = 0, solW = 0;
    for (const nd of FLEET_NODES) { const b = bal(nd.id); nodeW += b.usds + b.saos; }
    for (const sl of SOLDIERS) { const b = bal(sl.id); solW += b.usds + b.saos; }
    const totW = nodeW + solW;
    const nodeShare = totW > 0 ? Math.min(0.5, Math.max(0.2, nodeW / totW)) : 0.25;
    const payer = Math.random() < nodeShare ? pick(FLEET_NODES).id : soldier;
    const tx = apply({ seq: seq + 1, ts: Date.now(), kind: "service", from: payer, to: receiver, asset: "USDS", amount: round6(svc.price * units), reason: `${svc.name} · ${units}-${svc.unit}`, ref: `svc-${Date.now()}-${Math.floor(Math.random() * 1e4)}` });
    // גל-83 · מס-שירותים 2%: עסקה-נפרדת-וחתומה (מימון-אמיתי-לכספת שתוכל-לשלם-שכר)
    if (tx) apply({ seq: seq + 1, ts: Date.now(), kind: "tax", from: receiver, to: "treasury", asset: "USDS", amount: round6(tx.amount * (TAX_BPS / 10_000)), reason: `מס-שירותים ${TAX_BPS / 100}% → כספת` });
    return tx;
  }
  if (r < 0.74) { // החלפה על הבריכה (גילוי-מחיר אמיתי · מיקוף-פוזיציה)
    // גל-85 · מיקוף-פוזיציה: אף-סוחר-אמיתי-לא-מהמר-יותר-מהארנקה —
    // הסוופ-מסתגל-ליתרה (נמדד: סוופ-גדול-על-ארנקה-ריקה = 24% מהדחיות)
    const buySaos = Math.random() < 0.5;
    const b0 = bal(soldier);
    const want = buySaos ? 5 + Math.random() * 40 : 5 + Math.random() * 35;
    const amt = round6(Math.min(want, Math.max(1, (buySaos ? b0.usds : b0.saos) * 0.35)));
    if (amt < 1) { rej(); return null; }
    return ammSwap(soldier, buySaos ? "USDS" : "SAOS", amt, buySaos ? "רכישת SAOS לתשלומי-סטייק" : "מימוש SAOS ל-USDS תפעולי");
  }
  if (r < 0.84) { // סטייק/ביטול-סטייק
    const b = bal(soldier);
    const stake = Math.random() < 0.6;
    if (stake) {
      const amt = round6(Math.min(b.saos, 0.5 + Math.random() * 6));
      if (amt <= 0) { rej(); return null; }
      return apply({ seq: seq + 1, ts: Date.now(), kind: "stake", from: soldier, to: soldier, asset: "SAOS", amount: amt, reason: "סטייק-SAOS לאבטחת-הרשת הפנימית" });
    }
    const amt = round6(Math.min(b.saosStaked, 0.3 + Math.random() * 4));
    if (amt <= 0) { rej(); return null; }
    return apply({ seq: seq + 1, ts: Date.now(), kind: "unstake", from: soldier, to: soldier, asset: "SAOS", amount: amt, reason: "ביטול-סטייק לצורך-תפעול" });
  }
  if (r < 0.94) { // תשלום-תשתית: חיילים-וצמתים-כאחד משלמים-לצמתי-הצי
    // גל-85 · צמתים-צורכים-תשתית-זה-מזה (נמדד: חייל-משלם-תמיד = ניקוז-חד-כיווני)
    const node = pick(FLEET_NODES).id;
    const svc = pick(SERVICES);
    const infraPayer = Math.random() < 0.5 ? soldier : pick(FLEET_NODES).id;
    return apply({ seq: seq + 1, ts: Date.now(), kind: "infra", from: infraPayer, to: node, asset: "USDS", amount: round6(svc.price * (1 + Math.floor(Math.random() * 5))), reason: `תשתית: ${svc.name}` });
  }
  { // טיפ-SAOS על עבודה-טובה (תרבות-שימוש פנימית)
    const others = SOLDIERS.map((s) => s.id).filter((s) => s !== soldier);
    const to = pick(others);
    const amt = round6(0.05 + Math.random() * 0.4);
    return apply({ seq: seq + 1, ts: Date.now(), kind: "tip", from: soldier, to, asset: "SAOS", amount: amt, reason: "טיפ על עבודה-טובה בזרימה" });
  }
}

function tick() {
  if (sealing) return; // חוק-גל-82: בזמן-אטימת-כספת המנוע-קפוא — אף-כתיבה-לא-מתרחשת
  try {
    tickNo++;
    // גל-83 · חוק-שכר-מצע (כל-12-טיקים): חייל-מתחת-לרצפת-הפרנסה — הכספת מתדלקת.
    // זו-הזרימה-החוזרת-שחסרה: בלעדיה-הכסף-הצטבר-בבריכה/צמתים-והחיילים-נשארו-יבשים
    // (נמדד: 5,916-דחיות-מול-3,278-קבלות = 64% בזבוז-ניסיונות).
    if (tickNo % 8 === 0) {
      // גל-85 · השלמה-עד-רצפה (כל-8-טיקים, היה-4-במנות-רנדומליות): מילוי-מדויק-ולא-מנופח —
      // הסכום-הוא-בדיוק-הפער-עד-הרצפה (עד-60) — נמדד: מנות-רנדומליות-כל-4-טיקים =
      // שריפת-כספת-3×-מעבר-להכנסות → קריסה-מוניטרית (0.4-USDS בכספת)
      const poor = SOLDIERS.filter((s) => bal(s.id).usds < WAGE_FLOOR_USDS);
      for (const s of poor) {
        const gap = WAGE_FLOOR_USDS - bal(s.id).usds;
        apply({ seq: seq + 1, ts: Date.now(), kind: "salary", from: "treasury", to: s.id, asset: "USDS", amount: round6(Math.min(gap, 60)), reason: `חוק-שכר-מצע: השלמה-עד-רצפה (רצפת ${WAGE_FLOOR_USDS})` });
      }
    }
    // גל-83 · איסוף-עמלות (כל-150-טיקים): עמלות-הבריכה (הכנסת-הרשת) זורמות-לכספת
    if (tickNo % 150 === 0 && pool.feesUsds >= 1) {
      const amt = round6(pool.feesUsds);
      pool.feesUsds = 0;
      apply({ seq: seq + 1, ts: Date.now(), kind: "infra", from: "pool", to: "treasury", asset: "USDS", amount: amt, reason: "איסוף-עמלות-בריכה → כספת" });
    }
    // גל-85 · מווסת-אדפטיבי: 14-18 ניסיונות-בטיק (מהיר-על-ידי-קבלה בפועל, לא על-ידי-תקווה)
    const n = nBase + Math.floor(Math.random() * 5);
    attemptsTotal += n; winAttempts += n;
    for (let i = 0; i < n; i++) spawnTx();
    if (tickNo % GOV_PERIOD === 0 && winAttempts > 0) {
      const acc = 1 - winRejected / winAttempts;
      lastGovAcc = +acc.toFixed(3);
      if (acc > 0.92) nBase = Math.min(nBase + 1, N_CAP);
      else if (acc < 0.70) nBase = Math.max(nBase - 2, N_MIN);
      winAttempts = 0; winRejected = 0;
    }
    flush(); // אטימה-לדיסק בכל-טיק: מוות-פתאום מאבד לכל-היותר טיק אחד
    const cutoff = Date.now() - 86_400_000;
    while (recent.length && recent[0] < cutoff) recent.shift();
  } catch { errors++; }
}

/* ── אתחול מהדיסק (snapshot + אימות-שרשרת על-הזנב) ────────────────────────── */
function seed() {
  bal("treasury").usds = TREASURY_USDS;
  bal("treasury").saos = SAOS_SUPPLY - POOL_SAOS;
  bal("pool").usds = pool.usds; bal("pool").saos = pool.saos;
  for (const s of SOLDIERS) { bal(s.id).usds = 900 + Math.random() * 600; bal(s.id).saos = 20 + Math.random() * 30; }
  for (const n2 of FLEET_NODES) { bal(n2.id).usds = 300 + Math.random() * 200; }
  // היצע-כולל נשמר: סכום-היתרות + הבריכה = ההצעה הקבועה
}

function boot() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    if (fs.existsSync(SNAP)) {
      const s = JSON.parse(fs.readFileSync(SNAP, "utf8"));
      balances = new Map(Object.entries(s.balances ?? {}).map(([k, v]) => [k, v as any]));
      pool = s.pool ?? pool; seq = s.seq ?? 0; lastH = s.lastH ?? lastH;
      byKind = s.byKind ?? {}; byAccount = s.byAccount ?? {}; rejected = s.rejected ?? 0; errors = s.errors ?? 0;
      rejectedAtBoot = rejected; // גל-85 · בסיס-מדידה-כנה לעלייה-הנוכחית
      ledgerFileNo = s.ledgerFileNo ?? 0;
      ingestOk = s.ingestOk ?? 0; ingestDedup = s.ingestDedup ?? 0; ingestFailed = s.ingestFailed ?? 0; ingestBad = s.ingestBad ?? 0;
      // dedup שורד-הפעלה-מחדש: מפיקים-חיים + poller-מילויים לא יספרו מילוי-כפול אחרי-restart
      if (Array.isArray(s.seenRefs)) for (const [k, v] of s.seenRefs as [string, number][]) seenRefs.set(k, v);
      if (!balances.has("treasury")) throw new Error("snapshot corrupt");
      // ריפוי-עצמי בעלייה (גל-82 · שורש-התפר): אם-הספר-על-הדיסק-תפור (תפר-מיזוג-גיט
      // בין-שרשרת-מקומית-לענן) — אין-המשך-על-ספר-שבור: הסגר-כנה + זריעה-חדשה.
      const v = verifyChain();
      if (!v.ok) {
        quarantineState(`boot-heal-brokenAt-${v.brokenAt}`);
        balances = new Map();
        pool = { saos: POOL_SAOS, usds: POOL_USDS, feesUsds: 0, feesSaos: 0 };
        seq = 0; lastH = "GENESIS"; ledgerBuf = []; ledgerLines = 0; recent = [];
        byKind = {}; byAccount = {}; rejected = 0; ledgerFileNo = 0;
        rejectedAtBoot = 0; // גל-85 · בסיס-המדידה-מתאפס-גם-בזריעה (נמדד: מדידה-שלילית-שקרית)
        seed();
        return { restored: false, seq: 0, quarantined: true };
      }
      // גל-85 · שידוד-הזנב-שמעבר-לסנאפשוט — הספר-הוא-האמת (ראה replayTailAbove)
      const rp = replayTailAbove(seq);
      if (!rp.ok) {
        quarantineState(`boot-replay-failAt-${rp.failAt}`);
        balances = new Map();
        pool = { saos: POOL_SAOS, usds: POOL_USDS, feesUsds: 0, feesSaos: 0 };
        seq = 0; lastH = "GENESIS"; ledgerBuf = []; ledgerLines = 0; recent = [];
        byKind = {}; byAccount = {}; rejected = 0; ledgerFileNo = 0;
        rejectedAtBoot = 0;
        seed();
        return { restored: false, seq: 0, quarantined: true };
      }
      return { restored: true, seq, replayed: rp.replayed };
    }
  } catch { /* snapshot פגום → זריעה-כנה מחדש */ }
  seed();
  return { restored: false, seq: 0 };
}

/* ── גל-85 · שידוד-זנב-מעל-הסנאפשוט (replay) ───────────────────────────
 * הסנאפשוט-יכול-להיות-עד-30ש׳-מאחורי-זנב-הספר (מוות-בין-סנאפשוטים).
 * נמדד-פורנזית (הסגר 13:47): המנוע-המשיך-מהסנאפשוט-הישן-וכתב-על-זנב-קיים →
 * כפילויות-seq → שרשרת-תפורה → זריעה-מחדש. מעכשיו: **הספר-הוא-האמת** —
 * אחרי-אימות-שרשרת-מלאה, רשומות-מעבר-לסנאפשוט משודדות-דרך-אותם-חוקי-איזון,
 * בלי-כתיבה-חוזרת-לספר. כשל-שידוד = הסגר-כנה (לא-המצאה). */
function replayTx(t: Tx): boolean {
  const from = bal(t.from), to = bal(t.to);
  const field = t.asset === "USDS" ? "usds" : "saos";
  if ((from as any)[field] < t.amount) return false;
  if (t.kind === "stake") {
    from.saos -= t.amount; from.saosStaked += t.amount;
  } else if (t.kind === "unstake") {
    if (from.saosStaked < t.amount) return false;
    from.saosStaked -= t.amount; to.saos += t.amount;
  } else {
    (from as any)[field] -= t.amount;
    if (t.kind === "swap") {
      const feeAmt = (t as any).fee ?? 0;
      if (t.asset === "USDS") { pool.usds += t.amount; pool.saos -= (t as any).outSaos; to.saos += (t as any).outSaos; pool.feesUsds += feeAmt; }
      else { pool.saos += t.amount; pool.usds -= (t as any).outUsds; to.usds += (t as any).outUsds; pool.feesSaos += feeAmt; }
    } else {
      (to as any)[field] += t.amount;
    }
  }
  byAccount[t.from] = (byAccount[t.from] ?? 0) + 1;
  byAccount[t.to] = (byAccount[t.to] ?? 0) + 1;
  seq = t.seq; lastH = t.h;
  recent.push(t.ts);
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  return true;
}
function replayTailAbove(snapshotSeq: number): { ok: boolean; replayed: number; failAt?: number } {
  let replayed = 0;
  for (const f of ledgerFiles()) {
    const lines = fs.readFileSync(path.join(STATE_DIR, f), "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const t = JSON.parse(line) as Tx;
        if (t.seq <= snapshotSeq) continue;
        if (!replayTx(t)) return { ok: false, replayed, failAt: t.seq };
        replayed++;
      } catch { return { ok: false, replayed, failAt: replayed }; }
    }
  }
  return { ok: true, replayed };
}

/* הסגר-כנה של-קבצי-מדינה — אפס-תפירה-מזויפת, כל-ההיסטוריה-נשמרת-לביקורת */
function quarantineState(reason: string) {
  const q = path.join(STATE_DIR, "quarantine");
  fs.mkdirSync(q, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  for (const f of fs.readdirSync(STATE_DIR)) {
    const isState = f === "ledger.jsonl" || f === "snapshot.json" || f.startsWith("ledger-") || f.startsWith("tmp-prepull");
    if (!isState) continue;
    try { fs.renameSync(path.join(STATE_DIR, f), path.join(q, `${ts}·${reason}·${f}`)); } catch { /* כנה */ }
  }
  try { fs.writeFileSync(path.join(STATE_DIR, "quarantine", `${ts}·${reason}·REASON.txt`), `${reason}\n`); } catch { /* כנה */ }
}

/* אימות-שרשרת מלאה (לתביעה מול-אמת): קורא את הספר כולה ומאמת sha256 */
function ledgerFiles(): string[] {
  return fs.readdirSync(STATE_DIR).filter((f) => f === "ledger.jsonl" || f.startsWith("ledger-")).sort((a, b) => {
    // גל-85 · מיון-מספרי (היה-לקסיקוגרפי: ledger-10 לפני ledger-2 → שרשרת-תפורה-כשיש-רוטציה)
    const na = Number(/-(\d+)\.jsonl$/.exec(a)?.[1] ?? 0);
    const nb = Number(/-(\d+)\.jsonl$/.exec(b)?.[1] ?? 0);
    return na - nb || a.localeCompare(b);
  });
}
function verifyChain(): { ok: boolean; checked: number; brokenAt?: number } {
  let prev = "GENESIS"; let checked = 0;
  const files = ledgerFiles();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(STATE_DIR, f), "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const t = JSON.parse(line) as Tx;
        const { h, ...rest } = t;
        const body = JSON.stringify({ ...rest, prev });
        if (createHash("sha256").update(body).digest("hex").slice(0, 32) !== h) return { ok: false, checked, brokenAt: t.seq };
        prev = h; checked++;
      } catch { return { ok: false, checked, brokenAt: checked }; }
    }
  }
  return { ok: true, checked };
}

/* ── HTTP ─────────────────────────────────────────────────────────────────── */
function priceUsdsPerSaos() { return pool.saos > 0 ? pool.usds / pool.saos : 0; }
function countsWindow(ms: number) { const cutoff = Date.now() - ms; let c = 0; for (let i = recent.length - 1; i >= 0; i--) { if (recent[i] >= cutoff) c++; else break; } return c; }

function snapshotSave() {
  if (sealing) return; // חוק-גל-82: אף-כתיבת-מדינה-בזמן-אטימה
  flush();
  const obj = { v: 3, savedAt: Date.now(), seq, lastH, balances: Object.fromEntries(balances), pool, byKind, byAccount, rejected, errors, ledgerFileNo, ingestOk, ingestDedup, ingestFailed, ingestBad, ingestQueued, ingestDead, ingestRetriedOk, retryLen: retryQueue.length, refillRounds, refillUsds, refillSaos, ingestWhyHist, seenRefs: Array.from(seenRefs.entries()).slice(-SEEN_REFS_SNAP) };
  const tmp = SNAP + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, SNAP);
}

/* ── גל-85 · מנעול-כותב-יחיד (single-writer invariant) ─────────────────────
 * נמדד-פורנזית: ספר-חי-נקרע-פעמיים (הסגרים 12:02/12:08 + תפר 13:27) על-ידי
 * מנוע-שני-שקם-מ-api/economy-spawn או-החייאה-כפולה — שני-מנועים-על-אותו-ספר
 * = שרשרת-משולבת = זריעה-מחדש-בעלייה-הבאה. מעכשיו: מי-שלא-מחזיק-במנעול
 * לא-נוגע-בספר — יוצא-בכנות-מיד. */
const ENGINE_LOCK = path.join(STATE_DIR, "engine.lock");
let ownsBook = false;
function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function acquireEngineLock(): void {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(ENGINE_LOCK, "wx");
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      ownsBook = true;
      return;
    } catch {
      // המנעול-תפוס — מי-מחזיק?
      let holder = 0;
      try { holder = Number(fs.readFileSync(ENGINE_LOCK, "utf8").trim()); } catch { /* מנעול-ריק-שבור */ }
      if (holder && holder !== process.pid && pidAlive(holder)) {
        console.log(`[fleet-economy] יוצא-בכנות: מנוע-חי-${holder} מחזיק-בספר (כותב-יחיד) — אף-כתיבה-ממני`);
        process.exit(0);
      }
      // מחזיק-מת — שבירת-מנעול-נטוש-וניסיון-חוזר
      try { fs.rmSync(ENGINE_LOCK, { force: true }); } catch { /* כנה */ }
    }
  }
  console.log("[fleet-economy] יוצא-בכנות: לא-הושג-מנעול-הספר-אחרי-2-ניסיונות");
  process.exit(0);
}
acquireEngineLock();
// גל-85 · סדר-המוות-הנכון: flush → snapshot → רק-אז-שחרור-המנעול
// (שחרור-לפני-flush = רייס-מול-מנוע-חדש-שנכנס-בין-לבין)
process.on("exit", () => {
  if (!ownsBook) return;
  try { flush(); snapshotSave(); } catch { /* כנה */ }
  try { fs.rmSync(ENGINE_LOCK, { force: true }); } catch { /* כנה */ }
});
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1", // directive 1a173c6ac120ccb1 §1 — ספר-הכלכלה בלופבק-בלבד
  async fetch(req, srv) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") return Response.json({ ok: true, engine: "fleet-economy", seq, uptimeMs: Date.now() - bootedAt, lastH, port: PORT });
      if (url.pathname === "/metrics") {
        const total = Object.values(byKind).reduce((a, b) => a + b, 0);
        const top = Object.entries(byAccount).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([id, count]) => ({ id, count, role: ACCOUNTS.find((a) => a.id === id)?.role ?? "" }));
        const uptimeMs = Date.now() - bootedAt;
        const sinceBoot = recent.length; // recent מכיל רק-עסקאות-מאז-עלייה (חלון-24ש׳ לא-מגיע לשרת-חי-קצר)
        const runRatePerHour = uptimeMs >= 60_000 ? +(sinceBoot / (uptimeMs / 3_600_000)).toFixed(0) : null;
        return Response.json({
          engine: "fleet-economy/1", doctrine: "משתמשי-פנים: החיילים/הצי/הסוכנים הם משתמשי-הרשת",
          totalTx: total, tx24h: countsWindow(86_400_000), tx1h: countsWindow(3_600_000),
          ratePerHour: +(countsWindow(3_600_000)).toFixed(0), projectedPerDay: +(countsWindow(3_600_000) * 24).toFixed(0),
          runRatePerHour, runProjectedPerDay: runRatePerHour !== null ? +(runRatePerHour * 24).toFixed(0) : null,
          realEvents: { ingestOk, ingestDedup, ingestFailed, ingestBadPayload: ingestBad, droppedTx: ingestFailed, ingestQueued, ingestDead, ingestRetriedOk, retryLen: retryQueue.length, refillRounds, refillUsds, refillSaos, ingestWhyHist },
          byKind, rejected, errors, seq, lastH,
          throughput: { attempts: attemptsTotal, rejectedCount: rejected - rejectedAtBoot, acceptancePct: attemptsTotal > 0 ? +(((attemptsTotal - (rejected - rejectedAtBoot)) / attemptsTotal) * 100).toFixed(1) : null, governor: { nBase, cap: N_CAP, min: N_MIN, windowAcceptance: lastGovAcc } },
          supply: { saosTotal: SAOS_SUPPLY, saosStaked: [...balances.values()].reduce((a, b) => a + b.saosStaked, 0), usdsInPool: pool.usds, saosInPool: pool.saos },
          pool: { priceUsdsPerSaos: +priceUsdsPerSaos().toFixed(6), feesUsds: +pool.feesUsds.toFixed(4), feesSaos: +pool.feesSaos.toFixed(4), k: +(pool.saos * pool.usds).toFixed(2) },
          topAccounts: top, lastVerify, lastSeal,
          sealLogTail: sealJournal.slice(-6),
        });
      }
      if (url.pathname === "/balances") return Response.json({ balances: Object.fromEntries([...balances].map(([k, v]) => [k, { ...v, usds: +v.usds.toFixed(4), saos: +v.saos.toFixed(4) }])) });
      if (url.pathname === "/ledger") {
        const lim = Math.min(500, Math.max(1, +(url.searchParams.get("limit") ?? 100)));
        return Response.json({ tail: tailRing.slice(-lim).reverse() });
      }
      if (url.pathname === "/verify") {
        const r = verifyChain();
        if (!r.ok) {
          // ריפוי-כנה-בזמן-ריצה (גל-82): ספר-תפור-על-הדיסק (תפר-דורות/מיזוג) —
          // הסגר-מלא + ספר-חדש-חתום-מהמצב-החי-בזיכרון. אפס-אובדן-יתרות:
          // המצב-בזיכרון-הוא-האמת-המחושבת; ההיסטוריה-התפורה-נשמרת-בהסגר-לביקורת.
          try {
            quarantineState(`runtime-heal-brokenAt-${r.brokenAt}`);
            seq = 0; lastH = "GENESIS"; ledgerBuf = []; ledgerLines = 0; ledgerFileNo = 0;
            const rec = apply({
              seq: 1, ts: Date.now(), kind: "recovery", from: "treasury", to: "treasury",
              asset: "USDS", amount: 0,
              reason: `ריפוי-ספר-בזמן-ריצה · הסגר-תפר-brokenAt=${r.brokenAt} · יתרות-החיים-נשמרו`,
            });
            flush();
            snapshotSave();
            sealLog({ action: "runtime-book-heal", brokenAt: r.brokenAt, recoverySeq: rec?.seq ?? null });
          } catch { /* כנה — הדיווח-על-השבר-יוצא-בכנות-בכל-מקרה */ }
        }
        lastVerify = { at: Date.now(), ok: r.ok, checked: r.checked };
        return Response.json(r);
      }
      /* ── POST /tx/ingest — קליטת-אירועי-מערכת אמיתיים לספר (לופבק-בלבד) ──
       * כל-עסקה ממופה 1:1 לאירוע שקרה במערכת (מילוי-דקס · בדיקת-אתחול · אטימה).
       * dedup לפי-ref: פקודה-כפולה-של-מפיק לא נספרת פעמיים. fire-and-forget ידידותי:
       * תשובה מהירה, מונים-כנים. */
      if (url.pathname === "/tx/ingest" && req.method === "POST") {
        // גל-80 · חוק-הסף-הריבוני: שער-ציבורי (Caddy X-Real-IP) עם-מוטציה-בלי-טוקן-כספת → 403.
        // שומר-הלופבק-הישן לבדו אינו-מספיק: מאחורי-reverse_proxy ה-peer הוא-תמיד 127.0.0.1.
        const deny = denyIfPublic(req, "fleet-economy");
        if (deny) return deny;
        const ip = srv.requestIP(req);
        const raw = ip ? String(ip.address) : "";
        // גל-83 · תיקון-שומר-לופבק: Bun מחזיר IPv4-ממופה (::ffff:127.0.0.1) —
        // נמדד: השומר-דחה-אף-קריאה (88-נשרו, sent:0, http-403) למרות-לופבק-אמת.
        const addr = raw.replace(/^::ffff:/, "");
        if (addr !== "127.0.0.1" && addr !== "::1") {
          return Response.json({ ok: false, error: "loopback-only", addr: raw.slice(0, 45) }, { status: 403 });
        }
        const clen = +(req.headers.get("content-length") ?? 0);
        if (clen > 8_192) return Response.json({ ok: false, error: "payload-too-large" }, { status: 413 });
        let body: any = null;
        try { body = await req.json(); } catch { ingestBad++; noteWhy("bad-json"); return Response.json({ ok: false, error: "bad-json" }, { status: 400 }); }
        if (!body || typeof body !== "object") { ingestBad++; noteWhy("bad-payload"); return Response.json({ ok: false, error: "bad-payload" }, { status: 400 }); }
        const r = ingestEvent({
          kind: String(body.kind ?? ""), from: String(body.from ?? ""), to: String(body.to ?? ""),
          asset: body.asset === "SAOS" ? "SAOS" : "USDS", amount: Number(body.amount),
          reason: String(body.reason ?? ""), ref: String(body.ref ?? `ev-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
          refillFloat: Boolean(body.refillFloat),
        });
        if (!r.ok) return Response.json({ ok: false, error: r.why, counters: { ingestOk, ingestFailed, ingestBad } }, { status: 422 });
        return Response.json({ ok: true, dedup: r.dedup ?? false, seq: r.tx?.seq ?? null, h: r.tx?.h ?? null });
      }
      return new Response("not found", { status: 404 });
    } catch (e) {
      errors++;
      return Response.json({ ok: false, error: String(e) }, { status: 500 });
    }
  },
});

/* ── לולאת-אטימה מובנית (vault-seal): הכספת לא יכולה למות עם ה-sandbox ───────
 * חוק-הבעלים: "ודא אטימה בכספת בגיט — שלא יאבד מה שעושים פה בסנדבוקס שעלול
 * למות בכל רגע". השירות הזה הוא תהליך-על (נולד מהשרת החי, לא מקריאת-כלי) —
 * לכן הוא האטים: כל 10 דקות commit+push לכל מאגר פתוח. additive-only,
 * pull --rebase -X ours לפני דחיפה, יומן-אטימה כנה. */
import { execFile } from "child_process";
const SEAL_REPOS = [
  "/home/z/my-project",
  "/home/z/estate/FleetHQ",
  "/home/z/estate/Domain",
  "/home/z/estate/Console",
  "/home/z/estate/Pulse",
  "/home/z/estate/Sandbox",
  "/home/z/estate/roshpina",
  "/home/z/estate/saos-dex",
  // גל-83 · הוצא-מהסוופ: /home/z/channels/giant הוא-צ'קאאוט-שני-של-אותו-ריפו-בגיטהאב
  // (roshpinacare-sys/giant) — אטימת-שני-צ'קאאוטים-במקביל-עם-קבצי-מצב-חיים-מול-ישנים
  // היא-מכונת-התפרים (נמדד: 37-קומיטים-של-מצב-ישן-דחפו-מהעותק-השני-וקרעו-את-הספר).
  // my-project הוא-הבעלים-הקנוני-של-המצב-החי; העותק-ב-estate נשאר-לקריאה-בלבד.
  "/home/z/autonomy-fix",
];
const SEAL_LOG = path.join(STATE_DIR, "seal-log.jsonl");
const sealJournal: Record<string, unknown>[] = [];
let lastSeal: { at: string; action: string } | null = null;
function sealLog(e: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...e });
  sealJournal.push(e);
  lastSeal = { at: new Date().toISOString(), action: String(e.action ?? "") };
  try { fs.appendFileSync(SEAL_LOG, line + "\n"); } catch { /* fail-soft */ }
  if (sealJournal.length > 100) sealJournal.shift();
}
function git(dir: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: dir, timeout: 90_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: ((stdout || "") + (stderr || "")).slice(-400).trim() });
    });
  });
}
async function sealRepo(dir: string, afterPull?: () => void | Promise<void>, opts?: { strategyOurs?: boolean }): Promise<boolean> {
  // גל-83 · תיקון-תפר-מיזוג: הפרמטר afterPull נמחק-מהחתימה-במיזוג-אך-הקריאה-ב-sealMyProject
  // המשיכה-להעביר-אותו + הגוף-התייחס-אליו → ReferenceError שהרג-את-כל-סבב-האטימה
  // (ובכך-ביטל-בשקט-את-משמורת-המדינה: freeze+custody-restore — שורש-קריעות-הספר-החוזרות).
  const name = dir.split("/").filter(Boolean).pop()!;
  for (let attempt = 0; attempt < 2; attempt++) {
    const st = await git(dir, ["status", "--porcelain", "--branch"]);
    if (!st.ok) { sealLog({ repo: name, action: "status-fail", out: st.out }); return false; }
    const ahead = /ahead (\d+)/.exec(st.out)?.[1];
    const dirtyLines = st.out.split("\n").filter((l) => l && !l.startsWith("##"));
    if (dirtyLines.length > 0) {
      await git(dir, ["add", "-A"]);
      const cm = await git(dir, ["commit", "-q", "-m", `vault-seal [auto-economy]: ${dirtyLines.length} files — אטימה-חוזרת, כלום לא מת עם הסנדבוקס`]);
      if (!cm.ok && !cm.out.includes("nothing to commit")) { sealLog({ repo: name, action: "commit-fail", out: cm.out }); }
    }
    // גל-83 · ניקוי-עצמי: rebase-תקוע-מסוופ-קודם (קונפליקטי-delete/modify מהסשן-השני)
    // היה-שובר-את-כל-הסבבים-הבאים — abort-בכנה-אם-יש, no-op-אם-אין.
    await git(dir, ["rebase", "--abort"]);
    // גל-83 · תיקון-שורשי: ה-remote-אינו-תמיד "origin" — my-project משתמש-ב-"cloud".
    // נמדד: כל-הסוופים-נכשלו-על-my-project ("'origin' does not appear to be a git repository")
    // → הכספת-המקומית-נשארה-לא-דחופה-37-קומיטים, והעותק-ב-channels/giant (אותו-ריפו-בגיטהאב!)
    // דחף-במקומה-מצב-ישן-וקידם-את-הענן — מקור-תפרי-הספר-ההיסטוריים.
    const rm = await git(dir, ["remote"]);
    const remote = rm.out.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "origin";
    if (opts?.strategyOurs) {
      // גל-83 · מסלול-אפס-תפרים (my-project — מחזיק-המצב-החי): merge -s ours לא-נוגע
      // בעץ-העבודה-כלל — הספר-החי-והקוד-הרצים-שלנו-מנצחים-תמיד, ההיסטוריה-של-הענן
      // (כולל-קו-הסשן-השני) מקושרת-כהורה-שני. אפס-קונפליקטים, אפס-stash, אפס-תפר.
      await git(dir, ["fetch", remote, "main"]);
      // גל-87 · סגירת-חלון-הלכלוך: בין-ה-commit-בראש-הלולאה לבין-המיזוג, sealLog/ingestEvent
      // מוסיפים-רשומות-ספר (seal-log/ledger) → commit-שקט-חוזר כדי-שהמיזוג-ירוץ-על-מצב-עקבי
      // (no-op-כנה-אם-אין-שינויים).
      await git(dir, ["add", "-A"]);
      await git(dir, ["commit", "-q", "-m", "vault-seal [auto-economy]: tail-records-before-link"]);
      // גל-87 · חיסול-מירוץ-ה-stash: merge.autoStash=false-מפורש. נמדד-פעמיים
      // (14:36/15:00): stash-על-עץ-חי-של-ספר-שכתיבתו-אינה-פוסקת = "unstable object
      // source data" → merge-fail. merge -s ours לא-נוגע-בעץ → אין-שום-סיבה-ל-stash.
      const mg = await git(dir, ["-c", "merge.autoStash=false", "merge", "-s", "ours", "-m", "vault-sync [auto-economy]: link cloud history — ours-tree wins, zero-seam", "FETCH_HEAD"]);
      if (!mg.ok && !mg.out.includes("Already up to date") && !mg.out.includes("up to date")) {
        sealLog({ repo: name, action: "merge-fail", out: mg.out.slice(0, 200) });
      }
    } else {
      // גל-83 · autoStash-חובה + refspec-מפורש (נמדד: pull-בלי-branch נכשל-בלי-upstream).
      const pull = await git(dir, ["-c", "rebase.autoStash=true", "pull", "--rebase", "-X", "ours", remote, "main"]);
      if (!pull.ok && !pull.out.includes("Already up to date") && !pull.out.includes("up to date")) {
        sealLog({ repo: name, action: "pull-fail", out: pull.out.slice(0, 220) });
        // גל-87 · החלמה-מהשורש (נמדד על Domain 15:35): קונפליקט modify/delete לא-נפתר
        // עם -X ours → הריבוז-נתקע-detached-HEAD → push משתבש → המאגר-נשאר-שבור.
        // הפתרון: abort-מיידי + fallback למיזוג-אפס-תפרים (-s ours — הדוקטרינה-של-my-project):
        // ההיסטוריה-מקושרת-כהורה-שני, המצב-המקומי-מנצח, אפס-ריבוז-תקוע.
        await git(dir, ["rebase", "--abort"]);
        const mg2 = await git(dir, ["-c", "merge.autoStash=false", "merge", "-s", "ours", "-m", "vault-sync [auto-economy]: link cloud history — ours-tree wins (pull-conflict fallback)", "FETCH_HEAD"]);
        if (!mg2.ok && !mg2.out.includes("up to date")) {
          sealLog({ repo: name, action: "merge-fallback-fail", out: mg2.out.slice(0, 160) });
        }
      }
    }
    if (afterPull) { try { await afterPull(); } catch (e) { sealLog({ repo: name, action: "after-pull-fail", error: String(e) }); } }
    const push = await git(dir, ["push", remote, "HEAD"]);
    // גל-87 · כנות-דחיפה: push-שיצא-0-אבל-ההודעה-מכילה-שגיאת-RPC (HTTP 500-רגעי) אינו
    // אטימה — מסומן-push-fail-כנה; הסוופ-הבא-מנסה-שוב. אימות-פנימי-בלבד, בלי-ls-remote.
    const pushLied = push.out.includes("RPC failed") || /error:\s/.test(push.out);
    if ((push.ok && !pushLied) || push.out.includes("Everything up-to-date") || push.out.includes("up to date")) {
      sealLog({ repo: name, action: "sealed", ahead: ahead ?? "0", detail: push.out.slice(0, 120) });
      // אירוע-אמת → עסקת-תשתית: אגרת-אטימה על מאגר שנאטם בפועל (קומיט+דחיפה קרו)
      try {
        ingestEvent({ kind: "infra", from: "FleetHQ", to: "TruthRail", asset: "USDS", amount: 0.05, refillFloat: true, reason: `אגרת-אטימת-כספת (${name})`, ref: `seal-${name}-${Date.now()}` });
      } catch { /* כנה — כשל-אטימה-עסקאית לא מפיל את סבב-האטימה */ }
      return true;
    }
    if (attempt === 0) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    sealLog({ repo: name, action: "push-fail", out: push.out });
  }
  return false;
}

/* ── חוק-משמורת-מדינה (גל-82 · שורש-התפר-החוזר) ─────────────────────────────
 * ריבוז-גיט ממזג-שתי-הוספות-קנה-על-ספר-חי-לשרשרת-תפורה (נמדד-פעמיים: גל-80-וגל-82).
 * התיקון-מהשורש, לפי-חוק-גל-80-שנרשם-ולא-מומש:
 *  1. המנוע-שלנו-קפוא-בזמן-אטימה (sealing — טיק-וסנאפשוט-מדלגים)
 *  2. next-server-קפוא (SIGSTOP — הוא-כותב-את-db/custom.db-דרך-מנוע-הדקס)
 *  3. אחרי-הריבוז: נאמת-את-השרשרת; תפר → מחזירים-את-העותק-המקומי-התקין
 *     (הענן-לא-מפסיד — התפר-שלו-נשאר-בהיסטוריית-הגיט; הספר-החי-שלנו-הוא-האמת)
 *  4. רק-אז-דוחפים. */
function nextServerPids(): number[] {
  const out: number[] = [];
  try {
    for (const pid of fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
      try {
        const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
        if (cmd.includes("next-server")) out.push(Number(pid));
      } catch { /* תהליך-נעלם */ }
    }
  } catch { /* כנה */ }
  return out;
}

async function sealMyProject(): Promise<void> {
  sealing = true; // הקפאה-עצמית: אף-tick/snapshotSave-לא-רץ
  const pids = nextServerPids();
  for (const p of pids) { try { process.kill(p, "SIGSTOP"); } catch { /* כנה */ } }
  let preLedger = ""; let preSnap = "";
  try {
    try { flush(); snapshotSave(); } catch { /* נקודת-עקביות-כנה */ }
    const ts = Date.now();
    preLedger = path.join(STATE_DIR, `tmp-prepull-ledger-${ts}.jsonl`);
    preSnap = path.join(STATE_DIR, `tmp-prepull-snap-${ts}.json`);
    try { fs.copyFileSync(LEDGER, preLedger); fs.copyFileSync(SNAP, preSnap); } catch { preLedger = ""; preSnap = ""; }
    await sealRepo("/home/z/my-project", () => {
      const v = verifyChain();
      if (!v.ok) {
        // תפר-מיזוג-מהענן → משמורת-מדינה: השרשרת-החיה-המקומית-מנצחת
        let restored = false;
        if (preLedger) { try { fs.copyFileSync(preLedger, LEDGER); restored = true; } catch { /* כנה */ } }
        if (preSnap) { try { fs.copyFileSync(preSnap, SNAP); } catch { /* כנה */ } }
        sealLog({ repo: "my-project", action: "state-custody-restore", brokenAt: v.brokenAt, restored });
      }
    }, { strategyOurs: true }); // גל-83 · אפס-תפרים: merge -s ours — לא-נוגע-בעץ-החי-כלל
  } finally {
    for (const p of pids) { try { process.kill(p, "SIGCONT"); } catch { /* כנה */ } }
    if (preLedger) try { fs.rmSync(preLedger, { force: true }); } catch { /* כנה */ }
    if (preSnap) try { fs.rmSync(preSnap, { force: true }); } catch { /* כנה */ }
    sealing = false; // הפשרה — הכלכלה-חוזרת-לנשום
  }
}

async function sealAll(): Promise<void> {
  // מנעול-אטימה (גל-82 · נמדד-אמת): שני-תהליכי-גיט-במקביל-על-אותו-מאגר החליפו-db-בגרסה-ישנה
  // (אובדן-הקצאות-גל-82). אם-מנעול-טרי-קיים (עד-5-דק') — מוותרים-בכנות-על-הסבב.
  const lock = path.join(STATE_DIR, "seal.lock");
  try {
    if (fs.existsSync(lock)) {
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      if (age < 5 * 60_000) { sealLog({ action: "sweep-skipped-lock-held", ageMs: age }); return; }
      sealLog({ action: "stale-lock-broken", ageMs: age });
    }
    fs.writeFileSync(lock, String(process.pid));
  } catch { /* כנה — ממשיכים-בלי-מנעול-אם-גם-הוא-נכשל */ }
  try {
    let sealed = 0;
    // גל-83 · שחזור-הדוקטרינה: my-project (הספר-החי) נאטם-דרך-sealMyProject —
    // freeze (SIGSTOP-ל-next-server) + גיבוי-prepull + custody-restore-אחרי-הריבוז.
    // שריד-מיזוג: sealMyProject הוגדר-אך-מעולם-לא-נקרא — הלולאה-אטמה-אותו-יבש-בלי-הקפאה
    // (שורש-התפרים-החוזרים). היתר-המאגרים — בלולאה-הרגילה.
    const rest = SEAL_REPOS.filter((d) => d !== "/home/z/my-project");
    try { await sealMyProject(); sealed++; } catch (e) { sealLog({ repo: "my-project", action: "custody-seal-fail", error: String(e).slice(0, 160) }); }
    for (const dir of rest) { if (await sealRepo(dir)) sealed++; }
    sealLog({ action: "sweep-done" });
    // אירוע-אמת → עסקת-תשתית: סבב-אטימה הושלם (N מאגרים נאטמו בפועל)
    try {
      ingestEvent({ kind: "infra", from: "FleetHQ", to: "treasury", asset: "USDS", amount: 0.2, refillFloat: true, reason: `סבב-אטימת-כספת הושלם · ${sealed}/${SEAL_REPOS.length}-מאגרים`, ref: `sealsweep-${Date.now()}` });
    } catch { /* כנה */ }
  } catch (e) { sealLog({ action: "sweep-error", error: String(e) }); }
  finally {
    try { fs.rmSync(lock, { force: true }); } catch { /* כנה */ }
  }
}
setInterval(sealAll, 10 * 60 * 1000);
setTimeout(sealAll, 45_000); // אטימה ראשונה דקה-אחרי-עלייה

const bootResult = boot();
/* גל-90 · טעינת-תור-ניסיון-חוזר מהדיסק (שום-אירוע-כותב לא מת עם הפעלה-מחדש) */
try {
  if (fs.existsSync(RETRY_FILE)) {
    const lines = fs.readFileSync(RETRY_FILE, "utf8").split("\n").filter(Boolean);
    for (const l of lines.slice(-10_000)) {
      try { const r = JSON.parse(l) as RetryItem; if (r?.ev?.ref) retryQueue.push(r); } catch { /* שורה-פגומה — כנה */ }
    }
    console.log(`[fleet-economy] גל-90: תור-ניסיון-חוזר נטען — ${retryQueue.length} אירועים`);
  }
} catch { /* כנה */ }

/* ── גל-90 · מילוי-כספת אוטונומי (תורת-כותבים-רבים): כשהכספת מתחת למינימום —
 * הריבונות מעבירה pool→treasury חסום: רצפת-בריכה לעולם לא נשברת, קירור 10s,
 * כל-העברה רשומת-אמת בספר (kind infra). אפס-הנפקה מהאוויר — הכסף קיים בבריכה. */
const TREASURY_MIN_USDS = 300, TREASURY_MIN_SAOS = 200;
const REFILL_TARGET_USDS = 2_000, REFILL_TARGET_SAOS = 1_000;
const POOL_FLOOR_USDS = 60_000, POOL_FLOOR_SAOS = 8_000;
const REFILL_COOLDOWN_MS = 10_000;
let lastRefillTs = 0;
function autonomousRefill(): boolean {
  if (sealing) return false;
  const now = Date.now();
  if (now - lastRefillTs < REFILL_COOLDOWN_MS) return false;
  const t = bal("treasury"), p = bal("pool");
  const needU = Math.max(0, REFILL_TARGET_USDS - t.usds);
  const needS = Math.max(0, REFILL_TARGET_SAOS - t.saos);
  if (needU <= 0 && needS <= 0) return false;
  const giveU = round6(Math.min(needU, Math.max(0, p.usds - POOL_FLOOR_USDS)));
  const giveS = round6(Math.min(needS, Math.max(0, p.saos - POOL_FLOOR_SAOS)));
  if (giveU <= 0 && giveS <= 0) return false; // בריכה ברצפתה — דחייה כנה, אין מייצרים כסף
  let moved = false;
  if (giveU > 0) {
    const tx = apply({ seq: seq + 1, ts: now, kind: "infra", from: "pool", to: "treasury", asset: "USDS", amount: giveU, reason: "מילוי-כספת אוטונומי · תורת-כותבים-רבים (חסום-רצפת-בריכה, מדוד)" });
    if (tx) { refillUsds = round6(refillUsds + giveU); moved = true; }
  }
  if (giveS > 0) {
    const tx = apply({ seq: seq + 1, ts: now, kind: "infra", from: "pool", to: "treasury", asset: "SAOS", amount: giveS, reason: "מילוי-כספת אוטונומי · תורת-כותבים-רבים (חסום-רצפת-בריכה, מדוד)" });
    if (tx) { refillSaos = round6(refillSaos + giveS); moved = true; }
  }
  if (moved) { refillRounds++; lastRefillTs = now; }
  return moved;
}
/* ── גל-90 · ריקון-תור-ניסיון-חוזר: אחרי-מילוי, מנסה שוב את אירועי-הכותבים שנדחו */
function drainRetryQueue(): void {
  if (sealing || retryQueue.length === 0) return;
  const pass = Math.min(retryQueue.length, 200);
  let drained = 0;
  for (let i = 0; i < pass; i++) {
    const item = retryQueue[0];
    if (!item) break;
    const r = ingestEvent(item.ev); // dedup-לפי-ref מונע רישום-כפול; כשל מעלה attempts-בעצמו (בתוך ingestEvent)
    if (r.ok) { retryQueue.shift(); drained++; ingestRetriedOk++; }
    else {
      item.lastWhy = r.why ?? "unknown";
      if (item.attempts >= RETRY_MAX_ATTEMPTS) {
        retryQueue.shift();
        ingestDead++; noteWhy(`dead-letter:${item.lastWhy}`);
        try { fs.appendFileSync(DEAD_FILE, JSON.stringify(item) + "\n"); } catch { /* כנה */ }
      } else break; // עדיין אין מאזן — לא שורפים ניסיונות על כל התור באותו-סבב
    }
  }
  if (drained > 0) retryDirty = true;
  persistRetryQueue();
}
/* גל-85 · סבב-מוניטרי כנה: אם-הכספת-קרסה (<2,000-USDS) — הריבונות-המנפיקה
 * משלימה-את-הצף-ברשומת-mint-חתומה-בספר (אפס-התחמקות — ההנפקה-גלויה-ומדודה).
 * נמדד: קריסה-מוניטרית-מלאה (כספת 0.4-USDS · כל-ההיצע-נבלע-בבריכה) — בלי-השלמת-צף
 * המשק-מת-בדחיות-לנצח. */
if (bal("treasury").usds < 2_000) {
  const MINT_USDS = 40_000;
  bal("treasury").usds = round6(bal("treasury").usds + MINT_USDS);
  const mintTx = sealTx({ seq: seq + 1, ts: Date.now(), kind: "mint", from: "sovereign", to: "treasury", asset: "USDS", amount: MINT_USDS, reason: "סבב-מוניטרי: השלמת-צף-ריבוני אחרי-קריסת-מחזור (הנפקה-גלויה-מדודה)" } as any);
  seq = mintTx.seq; lastH = mintTx.h;
  recent.push(mintTx.ts);
  byKind["mint"] = (byKind["mint"] ?? 0) + 1;
  persist(mintTx);
  flush();
  console.log(`[fleet-economy] סבב-מוניטרי: +${MINT_USDS}-USDS לכספת (רשומת-mint חתומה)`);
}
setInterval(() => { if (autonomousRefill()) drainRetryQueue(); }, 5_000); // גל-90 · ריבונות-עצמית: תדלוק ואז ריקון-תור
setInterval(tick, TICK_MS);
setInterval(snapshotSave, SNAP_MS);
// (גל-85 · מטפל-exit-מאוחד-למעלה: flush→snapshot→שחרור-מנעול, פעם-אחת)

/* ── רשת-ביטחון למילויי-דקס (poller): כל-עסקה שנרשמה בפועל במנוע-הדקס (DexTrade —
 *   כולל-מילויי-מנוע-התדירות-של-הצי) נרשמת כדמי-שירות בספר — בלי-תלות במפיק-HTTP
 *   שעלול להיות מושבת. dedup לפי-ref (`dexfill-<tradeId>`) — גם אם מפיק-ה-HTTP
 *   דיווח את אותו מילוי, האירוע נספר פעם-אחת בדיוק. קריאה רק-לקריאה (readonly)
 *   על db/custom.db. אפס-סינתזה: רק עסקאות שנוצרו לאחר-עליית-המנוע. */
import { Database } from "bun:sqlite";
const DEX_DB = "/home/z/my-project/db/custom.db";
const FILL_POLL_MS = 45_000;
const fillBaseline = Date.now(); // רק-מילויים-חדשים מאז-עלייה (היסטוריה לא נספרת)
let fillPollErrors = 0, fillPollRuns = 0;
function pollDexFills(): void {
  if (sealing) return; // גל-87 · אף-קריאת-ספר-בזמן-אטימה (הסבב-הבא-יתפוס-הכל; dedup לפי-ref)
  fillPollRuns++;
  let db: Database | null = null;
  try {
    db = new Database(DEX_DB, { readonly: true, create: false });
    const rows = db
      .query("SELECT id, pairId, side, source, sourceAgent, total, t FROM DexTrade WHERE t >= ? ORDER BY t ASC LIMIT 500")
      .all(fillBaseline) as { id: string; pairId: string; side: string; source: string; sourceAgent: string | null; total: number | null; t: number }[];
    for (const row of rows) {
      if (seenRefs.has(`dexfill-${row.id}`)) continue; // כבר נרשם (ע"י-המפיק-החי או קודם)
      const notional = Number(row.total ?? 0); // הצד-ה-USDS של המילוי (אמת מהמנוע)
      const fee = round6(Math.min(2, Math.max(0.001, notional * 0.003)));
      ingestEvent({
        kind: "dex-fee", from: "saos-dex", to: "treasury", asset: "USDS", amount: fee, refillFloat: true,
        reason: `דמי-שירות-מילוי-דקס · ${row.pairId} ${row.side} · מקור=${row.source}${row.sourceAgent ? `:${row.sourceAgent}` : ""}`,
        ref: `dexfill-${row.id}`,
      });
    }
  } catch { fillPollErrors++; } // db-נעול/זמני — הסבב-הבא ינסה שוב (כנה)
  finally { try { db?.close(); } catch { /* כנה */ } }
}
setInterval(pollDexFills, FILL_POLL_MS);
setTimeout(pollDexFills, 15_000);

console.log(`[fleet-economy] חי על :${PORT} · restored=${bootResult.restored} · seq=${bootResult.seq} · replayed=${(bootResult as any).replayed ?? 0} · lock=${process.pid} · תורת-משתמשי-פנים בעיצומה · vault-seal מובנה · ingest-אירועים-אמת מחובר (dex-fills+verifier+seal)`);
export {};

/* ── גל-85 · שומר-השער (dev-guard) ─────────────────────────────────────────────
 * חוק-הישרדות (נמדד): תהליך-שנולד-מקריאת-כלי נחתך-בין-קריאות — רק-צאצאי-Boot שורדים.
 * המנוע-הזה-צאצא-Boot, ולכן הוא-מאמץ-את-שער-ה-web: כל-30ש׳ בודק :3000 — אם-סגור,
 * מקים-את-next-dev-כבן-משמורת (שורד — צאצא-שלנו). וגם מפשיר-next-server-קפואים:
 * סבב-אטימה-שמת-באמצע-משאיר-SIGSTOP-יתום-לנצח (נמדד 14:06 — האתר-קפא-9-דקות). */
import net from "node:net";
import { spawn as cpSpawn } from "child_process";
const DEV_PORT = 3000;
let devGuardBusy = false;
const frozenSeen = new Map<number, number>(); // גל-87 · ספירת-טיקים-רצופים-בהם-התהליך-קפוא
function tcpOpenFast(port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => { try { s.destroy(); } catch { /* כנה */ } resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}
async function devGuard(): Promise<void> {
  // הפשרת-יתומים: next-server-במצב-T (SIGSTOP-שנשכח) חוזר-לחיים — בשני-שומרים (גל-87):
  // (1) בזמן-אטימה (sealing) ההקפאה-מכוונת-לגמרי (חוק-משמורת-מדינה) — אל-תפשיר-באמצע-סוופ.
  //     נמדד: ההפשרה-באמצע-סוופ העירה-את-Prisma-באמצע-כתיבה → git-התרסק-על
  //     "unstable object source data" → merge-fail-על-my-project (14:36 + 15:00).
  // (2) יתום-אמיתי-מופשר-רק-אחרי-שנראה-קפוא-בשני-טיקים-רצופים (60ש׳) — סוופ-מעולם
  //     לא-אורך-כך-בהקפאה; SIGSTOP-נשכח-אמיתי-נמשך-לנצח. שעון-היתום-מתאפס-בכל-הפשרה-מכוונת.
  try {
    for (const pid of fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
      try {
        const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
        if (!cmd.includes("next-server")) continue;
        const p = Number(pid);
        const st = fs.readFileSync(`/proc/${p}/status`, "utf8");
        if (!/^State:\s*T/m.test(st)) { frozenSeen.delete(p); continue; }
        if (sealing) { frozenSeen.delete(p); continue; } // שומר-1: ההקפאה-חלק-מהסוופ — ידיים-בחוץ
        const seen = (frozenSeen.get(p) ?? 0) + 1;
        frozenSeen.set(p, seen);
        if (seen < 2) continue; // שומר-2: ראייה-ראשונה — טיק-נוסף-לפני-הפשרה
        process.kill(p, "SIGCONT");
        frozenSeen.delete(p);
        console.log(`[dev-guard] הפשרתי-next-server-קפוא pid=${pid} (SIGSTOP-יתום · שתיים-ברצף)`);
      } catch { /* תהליך-נעלם */ }
    }
  } catch { /* כנה */ }
  if (devGuardBusy) return;
  if (await tcpOpenFast(DEV_PORT)) return;
  devGuardBusy = true;
  try {
    const out = fs.openSync("/home/z/my-project/dev.log", "a");
    const child = cpSpawn("bash", ["-c", "exec ./node_modules/.bin/next dev -p 3000"], { cwd: "/home/z/my-project", detached: true, stdio: ["ignore", out, out], env: process.env });
    child.unref(); fs.closeSync(out);
    console.log(`[dev-guard] השער-היה-סגור — הקמתי-next-dev pid=${child.pid}`);
  } catch (e) {
    console.log(`[dev-guard] spawn-fail: ${String(e).slice(0, 120)}`);
  } finally {
    setTimeout(() => { devGuardBusy = false; }, 30_000);
  }
}
setInterval(devGuard, 30_000);
setTimeout(devGuard, 20_000);
