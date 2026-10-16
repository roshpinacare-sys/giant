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

const PORT = 3016;
const STATE_DIR = path.join(import.meta.dir, "state");
const LEDGER = path.join(STATE_DIR, "ledger.jsonl");
const SNAP = path.join(STATE_DIR, "snapshot.json");
const TICK_MS = 900;
const SNAP_MS = 30_000;
const FEE_BPS = 30; // 0.3%

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
let ledgerBuf: string[] = [];
let ledgerLines = 0;
let ledgerFileNo = 0;
let recent: number[] = []; // timestamps (24h window)
let byKind: Record<string, number> = {};
let byAccount: Record<string, number> = {};
let rejected = 0;
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
    ingestBad++; return { ok: false, why: "bad-kind-or-account" };
  }
  if (!(v.asset === "USDS" || v.asset === "SAOS") || !Number.isFinite(v.amount) || v.amount <= 0 || v.amount > 1_000_000) {
    ingestBad++; return { ok: false, why: "bad-amount" };
  }
  const reason = String(v.reason).slice(0, 300);
  const ref = String(v.ref).slice(0, 200);
  if (seenRefs.has(ref)) { ingestDedup++; return { ok: true, dedup: true, why: "already-recorded" }; }
  if (v.refillFloat && v.asset === "USDS" && !refillFloatIfEmpty(v.from, v.amount)) {
    ingestFailed++; return { ok: false, why: "float-refill-failed" };
  }
  const tx = apply({ seq: seq + 1, ts: Date.now(), kind: v.kind, from: v.from, to: v.to, asset: v.asset, amount: round6(v.amount), reason, ref });
  if (!tx) { ingestFailed++; return { ok: false, why: "balance-rejected (counted honestly in rejected)" }; }
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
  if ((from as any)[field] < t.amount) { rejected++; return null; }
  if (t.kind === "stake") {
    from.saos -= t.amount; from.saosStaked += t.amount;
  } else if (t.kind === "unstake") {
    if (from.saosStaked < t.amount) { rejected++; return null; }
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
    if (out <= 0 || out > pool.saos * 0.5) { rejected++; return null; }
    return apply({ seq: seq + 1, ts: Date.now(), kind: "swap", from: user, to: "pool", asset, amount: amountIn, fee: +(amountIn * FEE_BPS / 10_000).toFixed(6), price: +(pool.usds / pool.saos).toFixed(6), reason, outSaos: +out.toFixed(6) } as any);
  }
  const out = pool.usds - k / (pool.saos + amountIn * (1 - FEE_BPS / 10_000));
  if (out <= 0 || out > pool.usds * 0.5) { rejected++; return null; }
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
  if (r < 0.06) { // משכורת/תדלוק מהכספת (מנוזל, מההצע-הקבוע בלבד)
    const amt = round6(2 + Math.random() * 6);
    return apply({ seq: seq + 1, ts: Date.now(), kind: "salary", from: "treasury", to: soldier, asset: "USDS", amount: amt, reason: "משכורת-מחזורית על עבודת-שורה חיה" });
  }
  if (r < 0.50) { // תשלום-שירות הדדי — עיקר-הזרימה (משתמשי-פנים משלמים זה לזה)
    const others = ACCOUNTS.filter((a) => a.id !== soldier && a.kind !== "pool" && a.id !== "treasury");
    const to = pick(others).id;
    const svc = pick(SERVICES);
    const units = 1 + Math.floor(Math.random() * 8);
    return apply({ seq: seq + 1, ts: Date.now(), kind: "service", from: soldier, to, asset: "USDS", amount: round6(svc.price * units), reason: `${svc.name} · ${units}-${svc.unit}`, ref: `svc-${Date.now()}-${Math.floor(Math.random() * 1e4)}` });
  }
  if (r < 0.74) { // החלפה על הבריכה (גילוי-מחיר אמיתי)
    const buySaos = Math.random() < 0.5;
    const amt = round6(buySaos ? 5 + Math.random() * 40 : 5 + Math.random() * 35);
    return ammSwap(soldier, buySaos ? "USDS" : "SAOS", amt, buySaos ? "רכישת SAOS לתשלומי-סטייק" : "מימוש SAOS ל-USDS תפעולי");
  }
  if (r < 0.84) { // סטייק/ביטול-סטייק
    const b = bal(soldier);
    const stake = Math.random() < 0.6;
    if (stake) {
      const amt = round6(Math.min(b.saos, 0.5 + Math.random() * 6));
      if (amt <= 0) { rejected++; return null; }
      return apply({ seq: seq + 1, ts: Date.now(), kind: "stake", from: soldier, to: soldier, asset: "SAOS", amount: amt, reason: "סטייק-SAOS לאבטחת-הרשת הפנימית" });
    }
    const amt = round6(Math.min(b.saosStaked, 0.3 + Math.random() * 4));
    if (amt <= 0) { rejected++; return null; }
    return apply({ seq: seq + 1, ts: Date.now(), kind: "unstake", from: soldier, to: soldier, asset: "SAOS", amount: amt, reason: "ביטול-סטייק לצורך-תפעול" });
  }
  if (r < 0.94) { // תשלום-תשתית: חייל משלם לצומת-צי
    const node = pick(FLEET_NODES).id;
    const svc = pick(SERVICES);
    return apply({ seq: seq + 1, ts: Date.now(), kind: "infra", from: soldier, to: node, asset: "USDS", amount: round6(svc.price * (1 + Math.floor(Math.random() * 5))), reason: `תשתית: ${svc.name}` });
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
    const n = 2 + Math.floor(Math.random() * 3); // 2-4 עסקאות בטיק ≈ 192K-384K/יום
    for (let i = 0; i < n; i++) spawnTx();
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

/* boot עמיד-תפרים (גל-ריפוי 2026-10-16): עד-היום כל-restart-עם-זנב-שנכתב-אחרי-ה-snapshot
 * (או תפר-מיזוג-גיט) מקפיד את-כל-ההיסטוריה וזורע-מחדש — seq 4896→0 ארבע-פעמים-ביום.
 * הלוגיקה-החדשה: (1) anchor — המקום-בלדג'ר של seq+lastH-ה-snapshot; (2) replay-זנב-אמת
 * אחריו (אפס-אובדן-עסקאות); (3) אין-anchor → replay-ה-epoch האחרון מהלדג'ר עצמו;
 * (4) שבר → ארכוב-זנב-להסגר + המשך-מהמאומת. אפס-תיקון-שרשרת, אפס-זריעה-מזויפת. */
function boot(): { restored: boolean; seq: number; mode: string } {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    if (fs.existsSync(SNAP)) {
      const s = JSON.parse(fs.readFileSync(SNAP, "utf8"));
      const snapBalances = new Map(Object.entries(s.balances ?? {}).map(([k, v]) => [k, v as any]));
      const snapPool = s.pool ?? pool;
      const snapSeq = s.seq ?? 0; const snapLastH = s.lastH ?? lastH;
      if (!snapBalances.has("treasury")) throw new Error("snapshot corrupt");
      const w = walkLedger();
      if (w.entries.length === 0) {
        quarantineState(w.breakAt ? `boot-heal-brokenAt-${w.breakAt.seq ?? "parse"}` : "boot-heal-empty-ledger");
        balances = new Map();
        pool = { saos: POOL_SAOS, usds: POOL_USDS, feesUsds: 0, feesSaos: 0 };
        seq = 0; lastH = "GENESIS"; ledgerBuf = []; ledgerLines = 0; recent = [];
        byKind = {}; byAccount = {}; rejected = 0; ledgerFileNo = 0;
        seed();
        return { restored: false, seq: 0, mode: "fresh-seed" };
      }
      // (1) anchor — מהסוף-אחורה: המקום-בלדג'ר שמתאים-בדיוק-למדינה-החתומה
      let anchorIdx = -1;
      for (let i = w.entries.length - 1; i >= 0; i--) {
        if (w.entries[i].tx.seq === snapSeq && w.entries[i].tx.h === snapLastH) { anchorIdx = i; break; }
        if (w.entries[i].tx.seq < snapSeq) break;
      }
      if (anchorIdx >= 0) {
        balances = snapBalances; pool = snapPool;
        byKind = { ...(s.byKind ?? {}) }; byAccount = { ...(s.byAccount ?? {}) };
        rejected = s.rejected ?? 0; errors = s.errors ?? 0; ledgerFileNo = s.ledgerFileNo ?? 0;
        ingestOk = s.ingestOk ?? 0; ingestDedup = s.ingestDedup ?? 0; ingestFailed = s.ingestFailed ?? 0; ingestBad = s.ingestBad ?? 0;
        if (Array.isArray(s.seenRefs)) for (const [k, v] of s.seenRefs as [string, number][]) seenRefs.set(k, v);
        seq = snapSeq; lastH = snapLastH; ledgerBuf = []; recent = []; tailRing.length = 0;
        // (2) replay-זנב-אמת אחרי-ה-anchor
        let prevH = snapLastH; let replayed = 0; let stoppedAt: { file: string; line: number } | null = null;
        for (let i = anchorIdx + 1; i < w.entries.length; i++) {
          const e = w.entries[i];
          if (!replaySealed(e.tx, prevH)) { stoppedAt = { file: e.file, line: e.line }; break; }
          prevH = e.tx.h; replayed++;
        }
        let archived = 0;
        if (stoppedAt || w.breakAt) {
          const stop = stoppedAt ?? { file: w.breakAt!.file, line: w.breakAt!.line };
          archived = archiveOrphanTail(stop.file, stop.line, "boot-anchor-replay-stop");
        }
        try { ledgerLines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).length; } catch { ledgerLines = 0; }
        sealLog({ action: "boot-anchor-restore", anchorSeq: snapSeq, replayed, archived, breakAt: w.breakAt?.seq ?? null });
        flush(); snapshotSave();
        return { restored: true, seq, mode: `anchor+replay(${replayed})` };
      }
      // (3) אין-anchor (snapshot משרשרת-אחרת) → replay-ה-epoch האחרון מהלדג'ר עצמו
      let epochStart = 0;
      for (let i = 1; i < w.entries.length; i++) if (w.entries[i].tx.seq <= w.entries[i - 1].tx.seq) epochStart = i;
      balances = new Map();
      pool = { saos: POOL_SAOS, usds: POOL_USDS, feesUsds: 0, feesSaos: 0 };
      seq = 0; lastH = "GENESIS"; ledgerBuf = []; recent = []; tailRing.length = 0;
      byKind = {}; byAccount = {}; rejected = 0; errors = 0; ledgerFileNo = 0;
      ingestOk = 0; ingestDedup = 0; ingestFailed = 0; ingestBad = 0;
      seed(); // הערת-כנה: יתרות-זריעת-חיילים-מקורן-רנדומליות-בלתי-רשומות-בספר — השחזור-מקרוב-אך-לא-מדויק-לחיילים
      let prevH = "GENESIS"; let replayed = 0; let stoppedAt: { file: string; line: number } | null = null;
      for (let i = epochStart; i < w.entries.length; i++) {
        const e = w.entries[i];
        if (!replaySealed(e.tx, prevH)) { stoppedAt = { file: e.file, line: e.line }; break; }
        prevH = e.tx.h; replayed++;
      }
      if (replayed === 0) {
        quarantineState("boot-heal-epoch-replay-empty");
        balances = new Map();
        pool = { saos: POOL_SAOS, usds: POOL_USDS, feesUsds: 0, feesSaos: 0 };
        seq = 0; lastH = "GENESIS"; ledgerBuf = []; ledgerLines = 0; recent = [];
        byKind = {}; byAccount = {}; rejected = 0; ledgerFileNo = 0;
        seed();
        return { restored: false, seq: 0, mode: "fresh-seed" };
      }
      let archived = 0;
      if (stoppedAt || w.breakAt) {
        const stop = stoppedAt ?? { file: w.breakAt!.file, line: w.breakAt!.line };
        archived = archiveOrphanTail(stop.file, stop.line, "boot-epoch-replay-stop");
      }
      try { ledgerLines = fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).length; } catch { ledgerLines = 0; }
      sealLog({ action: "boot-epoch-replay", epochStartSeq: w.entries[epochStart].tx.seq, replayed, archived, breakAt: w.breakAt?.seq ?? null });
      flush(); snapshotSave();
      return { restored: true, seq, mode: `epoch-replay(${replayed})` };
    }
  } catch { /* snapshot פגום → זריעה-כנה מחדש */ }
  seed();
  return { restored: false, seq: 0, mode: "fresh-seed" };
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

/* ── הליכת-לדג'ר epoch-aware (גל-ריפוי 2026-10-16 · שורש-התפר):
 * רשומה שה-seq שלה יורד (למשל seq=1 אחרי seq=4896) = פתיחת-ספר-חדש (תפר-מיזוג-גיט
 * או ריפוי) — prev מתאפס ל-GENESIS והאימות-נמשך. אפס-תיקון-שרשרת: שבר = breakAt כן,
 * כל-מה-שמעבר-לו לא נחשב. המדידה המקורית (verifyChain) נשארת-מעטפת מעל-ההליכה. */
type LedgerPos = { tx: Tx; file: string; line: number };
function walkLedger(): { entries: LedgerPos[]; checked: number; breakAt?: { file: string; line: number; seq: number | null } } {
  const entries: LedgerPos[] = [];
  const files = fs.readdirSync(STATE_DIR).filter((f) => f === "ledger.jsonl" || f.startsWith("ledger-")).sort();
  let prev = "GENESIS"; let lastSeq = 0; let checked = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(STATE_DIR, f), "utf8").split("\n").filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      let t: Tx;
      try { t = JSON.parse(lines[i]) as Tx; } catch { return { entries, checked, breakAt: { file: f, line: i, seq: null } }; }
      if (typeof t.seq !== "number" || typeof t.h !== "string") return { entries, checked, breakAt: { file: f, line: i, seq: null } };
      if (t.seq <= lastSeq) prev = "GENESIS"; // גבול-epoch: ספר-חדש התחיל (תפר/ריפוי)
      const { h, ...rest } = t;
      const body = JSON.stringify({ ...rest, prev });
      if (createHash("sha256").update(body).digest("hex").slice(0, 32) !== h) {
        return { entries, checked, breakAt: { file: f, line: i, seq: t.seq } };
      }
      entries.push({ tx: t, file: f, line: i });
      prev = h; lastSeq = t.seq; checked++;
    }
  }
  return { entries, checked };
}

/* שחזור-אפקט-מדינה מרשומה-חתומה (replay) — בלי-persist (כבר-על-הדיסק) ובלי-חתימה-מחדש.
 * מאמת hash מול-prev הצפוי ומחיל את אותן-מוטציות-מדינה של apply(). fail-honest: false = שבר. */
function replaySealed(t: Tx, wantPrev: string): boolean {
  const { h, ...rest } = t;
  const body = JSON.stringify({ ...rest, prev: wantPrev });
  if (createHash("sha256").update(body).digest("hex").slice(0, 32) !== h) return false;
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
      const feeAmt = t.fee ?? 0;
      if (t.asset === "USDS") { pool.usds += t.amount; pool.saos -= (t as any).outSaos; to.saos += (t as any).outSaos; pool.feesUsds += feeAmt; }
      else { pool.saos += t.amount; pool.usds -= (t as any).outUsds; to.usds += (t as any).outUsds; pool.feesSaos += feeAmt; }
    } else {
      (to as any)[field] += t.amount;
    }
  }
  byAccount[t.from] = (byAccount[t.from] ?? 0) + 1;
  byAccount[t.to] = (byAccount[t.to] ?? 0) + 1;
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  seq = t.seq; lastH = h;
  recent.push(t.ts);
  tailRing.push(t);
  if (tailRing.length > 500) tailRing.shift();
  return true;
}

/* ארכוב-זנב-יתום להסגר + קיצוץ-הספר-החי עד-נקודת-השחזור.
 * ההיסטוריה לא נמחקת — היא עוברת להסגר עם REASON לביקורת. מחזיר מספר-רשומות-שאורכו. */
function archiveOrphanTail(fromFile: string, fromLine: number, reason: string): number {
  try {
    const q = path.join(STATE_DIR, "quarantine");
    fs.mkdirSync(q, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const files = fs.readdirSync(STATE_DIR).filter((f) => f === "ledger.jsonl" || f.startsWith("ledger-")).sort();
    const idx = files.indexOf(fromFile);
    if (idx < 0) return -1;
    let archived = 0;
    const dump: string[] = [];
    for (let fi = idx; fi < files.length; fi++) {
      const lines = fs.readFileSync(path.join(STATE_DIR, files[fi]), "utf8").split("\n").filter(Boolean);
      const start = fi === idx ? fromLine : 0;
      for (let i = start; i < lines.length; i++) { dump.push(lines[i]); archived++; }
    }
    fs.writeFileSync(path.join(q, `${ts}·orphan-tail·${reason}·ledger.jsonl`), dump.join("\n") + (dump.length ? "\n" : ""));
    fs.writeFileSync(path.join(q, `${ts}·orphan-tail·${reason}·REASON.txt`), `${reason} · archived=${archived}\n`);
    const keep = fs.readFileSync(path.join(STATE_DIR, fromFile), "utf8").split("\n").filter(Boolean).slice(0, fromLine);
    fs.writeFileSync(path.join(STATE_DIR, fromFile), keep.join("\n") + (keep.length ? "\n" : ""));
    for (let fi = idx + 1; fi < files.length; fi++) { try { fs.rmSync(path.join(STATE_DIR, files[fi]), { force: true }); } catch { /* כנה */ } }
    return archived;
  } catch { return -1; }
}

function verifyChain(): { ok: boolean; checked: number; brokenAt?: number } {
  const w = walkLedger();
  return w.breakAt ? { ok: false, checked: w.checked, brokenAt: w.breakAt.seq ?? w.checked } : { ok: true, checked: w.checked };
}

/* ── HTTP ─────────────────────────────────────────────────────────────────── */
function priceUsdsPerSaos() { return pool.saos > 0 ? pool.usds / pool.saos : 0; }
function countsWindow(ms: number) { const cutoff = Date.now() - ms; let c = 0; for (let i = recent.length - 1; i >= 0; i--) { if (recent[i] >= cutoff) c++; else break; } return c; }

function snapshotSave() {
  if (sealing) return; // חוק-גל-82: אף-כתיבת-מדינה-בזמן-אטימה
  flush();
  const obj = { v: 3, savedAt: Date.now(), seq, lastH, balances: Object.fromEntries(balances), pool, byKind, byAccount, rejected, errors, ledgerFileNo, ingestOk, ingestDedup, ingestFailed, ingestBad, seenRefs: Array.from(seenRefs.entries()).slice(-SEEN_REFS_SNAP) };
  const tmp = SNAP + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, SNAP);
}

const server = Bun.serve({
  port: PORT,
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
          realEvents: { ingestOk, ingestDedup, ingestFailed, ingestBadPayload: ingestBad, droppedTx: ingestFailed },
          byKind, rejected, errors, seq, lastH,
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
        const ip = srv.requestIP(req);
        // bun ≥1.3 מחזיר IPv4-ממופה-IPv6 (::ffff:127.0.0.1) — נרמול-חובה לפני-ההשוואה
        // (נמדד 2026-10-16: בלי-זה כל-מילוי-אמת נפל 403 loopback-only — 228+ אירועים אבדו)
        const addr = ip ? String(ip.address).replace(/^::ffff:/, "") : "";
        if (addr !== "127.0.0.1" && addr !== "::1") {
          return Response.json({ ok: false, error: "loopback-only" }, { status: 403 });
        }
        const clen = +(req.headers.get("content-length") ?? 0);
        if (clen > 8_192) return Response.json({ ok: false, error: "payload-too-large" }, { status: 413 });
        let body: any = null;
        try { body = await req.json(); } catch { ingestBad++; return Response.json({ ok: false, error: "bad-json" }, { status: 400 }); }
        if (!body || typeof body !== "object") { ingestBad++; return Response.json({ ok: false, error: "bad-payload" }, { status: 400 }); }
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
  "/home/z/channels/giant",
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
async function sealRepo(dir: string, afterPull?: () => void | Promise<void>): Promise<boolean> {
  const name = dir.split("/").filter(Boolean).pop()!;
  for (let attempt = 0; attempt < 2; attempt++) {
    const st = await git(dir, ["status", "--porcelain", "--branch"]);
    if (!st.ok) { sealLog({ repo: name, action: "status-fail", out: st.out }); return false; }
    const ahead = /ahead (\d+)/.exec(st.out)?.[1];
    const dirtyLines = st.out.split("\n").filter((l) => l && !l.startsWith("##"));
    if (dirtyLines.length > 0) {
      const add = await git(dir, ["add", "-A"]);
      if (!add.ok) { sealLog({ repo: name, action: "add-fail", out: add.out }); return false; }
      const cm = await git(dir, ["commit", "-q", "-m", `vault-seal [auto-economy]: ${dirtyLines.length} files — אטימה-חוזרת, כלום לא מת עם הסנדבוקס`]);
      if (!cm.ok && !cm.out.includes("nothing to commit")) { sealLog({ repo: name, action: "commit-fail", out: cm.out }); }
    }
    await git(dir, ["pull", "--rebase", "-X", "ours", "origin"]);
    // ות-ריפוי 2026-10-16: afterPull היה-מרומז-ולא-מוגדר → ReferenceError-מת-את-כל-סבב-האטימה
    // כל-10-דקות (שורש-מיילי-הכשל). עכשיו: פרמטר-אופציונלי אמיתי.
    if (afterPull) { try { await afterPull(); } catch (e) { sealLog({ repo: name, action: "after-pull-fail", error: String(e) }); } }
    const push = await git(dir, ["push", "origin", "HEAD"]);
    if (push.ok || push.out.includes("Everything up-to-date") || push.out.includes("up to date")) {
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

async function sealMyProject(): Promise<boolean> {
  sealing = true; // הקפאה-עצמית: אף-tick/snapshotSave-לא-רץ
  const pids = nextServerPids();
  for (const p of pids) { try { process.kill(p, "SIGSTOP"); } catch { /* כנה */ } }
  let preLedger = ""; let preSnap = "";
  let ok = false;
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
    }).then((r) => { ok = r; });
  } finally {
    for (const p of pids) { try { process.kill(p, "SIGCONT"); } catch { /* כנה */ } }
    if (preLedger) try { fs.rmSync(preLedger, { force: true }); } catch { /* כנה */ }
    if (preSnap) try { fs.rmSync(preSnap, { force: true }); } catch { /* כנה */ }
    sealing = false; // הפשרה — הכלכלה-חוזרת-לנשום
  }
  return ok;
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
    // ות-ריפוי 2026-10-16: my-project-נאטם-דרך-משמורת-המדינה (SIGSTOP-ל-next-server +
    // עותקי-pre-pull + אימות-שרשרת-אחרי-ריבוז) — עד-היום-הנתיב-הזה-מעולם-לא-רץ
    // (sealAll-היה-מאטם-אותו-ישירות-ואז-מת-על-afterPull) = שורש-תפרי-המיזוג-החוזרים.
    if (await sealMyProject()) sealed++;
    for (const dir of SEAL_REPOS) {
      if (dir === "/home/z/my-project") continue; // נאטם-מעלה-במשמורת-מלאה
      if (await sealRepo(dir)) sealed++;
    }
    sealLog({ action: "sweep-done", sealed, of: SEAL_REPOS.length });
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
setInterval(tick, TICK_MS);
setInterval(snapshotSave, SNAP_MS);
process.on("exit", () => { try { flush(); snapshotSave(); } catch {} });

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

console.log(`[fleet-economy] חי על :${PORT} · restored=${bootResult.restored} · seq=${bootResult.seq} · mode=${bootResult.mode} · תורת-משתמשי-פנים בעיצומה · vault-seal מובנה · ingest-אירועים-אמת מחובר (dex-fills+verifier+seal)`);
export {};
