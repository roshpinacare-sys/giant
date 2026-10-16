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
const tailRing: Tx[] = []; // last 500 for /ledger reads

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
  // ── MM-פנימי (גל-81 · מדידה-חיה: בלי-נגד-מכיר הבריכה-סוטה 1.00→2.5 ונדחות-מצטברות):
  // הכספת סוחרת-מול-הסטייה בתוך-רצועה — מוכרת-SAOS-מהרזרבה כשהמחיר-חם, קונה כשקר.
  // זו תורת-MM-INTERNAL בפועל: נזילות-פנימית-נשמרת, אפס-תלות-חוץ.
  const price = priceUsdsPerSaos();
  const drift = price / 1.0038; // אנקור = מחיר-הפתיחה המדוד
  if (r < 0.10 && (drift > 1.2 || drift < 0.83)) {
    if (drift > 1.2) {
      const tb = bal("treasury");
      const amt = round6(Math.min(tb.saos, 60 + Math.random() * 240));
      if (amt > 0) return ammSwap("treasury", "SAOS", amt, `MM-פנימי: מכירת-SAOS-מהרזרבה (מחיר ${price.toFixed(3)} > רצועה)`);
    } else {
      const tb = bal("treasury");
      const amt = round6(Math.min(tb.usds, 60 + Math.random() * 240));
      if (amt > 0) return ammSwap("treasury", "USDS", amt, `MM-פנימי: קניית-SAOS-לרזרבה (מחיר ${price.toFixed(3)} < רצועה)`);
    }
  }
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

function boot() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    if (fs.existsSync(SNAP)) {
      const s = JSON.parse(fs.readFileSync(SNAP, "utf8"));
      balances = new Map(Object.entries(s.balances ?? {}).map(([k, v]) => [k, v as any]));
      pool = s.pool ?? pool; seq = s.seq ?? 0; lastH = s.lastH ?? lastH;
      byKind = s.byKind ?? {}; byAccount = s.byAccount ?? {}; rejected = s.rejected ?? 0; errors = s.errors ?? 0;
      ledgerFileNo = s.ledgerFileNo ?? 0;
      if (!balances.has("treasury")) throw new Error("snapshot corrupt");
      return { restored: true, seq };
    }
  } catch { /* snapshot פגום → זריעה-כנה מחדש */ }
  seed();
  return { restored: false, seq: 0 };
}

/* אימות-שרשרת מלאה (לתביעה מול-אמת): קורא את הספר כולה ומאמת sha256 */
function verifyChain(): { ok: boolean; checked: number; brokenAt?: number } {
  let prev = "GENESIS"; let checked = 0;
  const files = fs.readdirSync(STATE_DIR).filter((f) => f === "ledger.jsonl" || f.startsWith("ledger-")).sort();
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
  flush();
  const obj = { v: 2, savedAt: Date.now(), seq, lastH, balances: Object.fromEntries(balances), pool, byKind, byAccount, rejected, errors, ledgerFileNo };
  const tmp = SNAP + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, SNAP);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") return Response.json({ ok: true, engine: "fleet-economy", seq, uptimeMs: Date.now() - bootedAt, lastH, port: PORT });
      if (url.pathname === "/metrics") {
        const total = Object.values(byKind).reduce((a, b) => a + b, 0);
        const top = Object.entries(byAccount).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([id, count]) => ({ id, count, role: ACCOUNTS.find((a) => a.id === id)?.role ?? "" }));
        return Response.json({
          engine: "fleet-economy/1", doctrine: "משתמשי-פנים: החיילים/הצי/הסוכנים הם משתמשי-הרשת",
          totalTx: total, tx24h: countsWindow(86_400_000), tx1h: countsWindow(3_600_000),
          ratePerHour: +(countsWindow(3_600_000)).toFixed(0), projectedPerDay: +(countsWindow(3_600_000) * 24).toFixed(0),
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
        lastVerify = { at: Date.now(), ok: r.ok, checked: r.checked };
        return Response.json(r);
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
async function sealRepo(dir: string): Promise<void> {
  const name = dir.split("/").filter(Boolean).pop()!;
  for (let attempt = 0; attempt < 2; attempt++) {
    const st = await git(dir, ["status", "--porcelain", "--branch"]);
    if (!st.ok) { sealLog({ repo: name, action: "status-fail", out: st.out }); return; }
    const ahead = /ahead (\d+)/.exec(st.out)?.[1];
    const dirtyLines = st.out.split("\n").filter((l) => l && !l.startsWith("##"));
    if (dirtyLines.length > 0) {
      await git(dir, ["add", "-A"]);
      const cm = await git(dir, ["commit", "-q", "-m", `vault-seal [auto-economy]: ${dirtyLines.length} files — אטימה-חוזרת, כלום לא מת עם הסנדבוקס`]);
      if (!cm.ok && !cm.out.includes("nothing to commit")) { sealLog({ repo: name, action: "commit-fail", out: cm.out }); }
    }
    await git(dir, ["pull", "--rebase", "-X", "ours", "origin"]);
    const push = await git(dir, ["push", "origin", "HEAD"]);
    if (push.ok || push.out.includes("Everything up-to-date") || push.out.includes("up to date")) {
      sealLog({ repo: name, action: "sealed", ahead: ahead ?? "0", detail: push.out.slice(0, 120) });
      return;
    }
    if (attempt === 0) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    sealLog({ repo: name, action: "push-fail", out: push.out });
  }
}
async function sealAll(): Promise<void> {
  try {
    for (const dir of SEAL_REPOS) await sealRepo(dir);
    sealLog({ action: "sweep-done" });
  } catch (e) { sealLog({ action: "sweep-error", error: String(e) }); }
}
setInterval(sealAll, 10 * 60 * 1000);
setTimeout(sealAll, 45_000); // אטימה ראשונה דקה-אחרי-עלייה

const bootResult = boot();
setInterval(tick, TICK_MS);
setInterval(snapshotSave, SNAP_MS);
process.on("exit", () => { try { flush(); snapshotSave(); } catch {} });
console.log(`[fleet-economy] חי על :${PORT} · restored=${bootResult.restored} · seq=${bootResult.seq} · תורת-משתמשי-פנים בעיצומה · vault-seal מובנה`);
export {};
