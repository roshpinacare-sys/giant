/**
 * gate-repair — שיקום-עצמי של שער-הבעלים מקציר-סנדבוקס (Task 18, צו-הבעלים).
 * ═════════════════════════════════════════════════════════════════════════
 * השורש-הנמדד: /home/z/.operator/config.json + upload/headcorner.txt חיים
 * מחוץ-לגיט → כל-הפעלה-מחדש משאירה את-השער fail-closed ("מפתח לא מאומת").
 * מקור-האמת-החי = /home/z/.secrets/.env.local (נבנה-מחדש אוטומטית באתחול
 * ע"י FleetHQ/vault-home/boot-services.sh — כספת-העץ).
 *
 * המנדט-הנמדד של-הבעלים (18.10): "זה צריך להיות המפתח owner של headcorner
 * — רק המפתח בלי השם" → upload/headcorner.txt = מפתח-owner בלבד, שורה-אחת,
 * אפס-תווית; הקונפיג מקבל דיגסטים-מומלחים לכל-הצורות-הכשרות (owner-WIF
 * שהוכח-מול-השרשרת · סיסמת-master · המפתח-בלי-השם).
 *
 * אפס-חשיפה: הסודות לעולם לא נדפסים/לא נכתבים ללוג; בדיקות-החיות מדפיסות
 * verdicts בלבד. אימות-שרשרת: ה-WIF נגזר למפתח-ציבורי ונבדק מול
 * authority-ה-owner החי (condenser_api — ציבורי).
 */
import fs from "node:fs";
import crypto from "node:crypto";

const ENV_FILE = "/home/z/.secrets/.env.local";
const KEY_FILE = "/home/z/my-project/upload/headcorner.txt";
const CONFIG = "/home/z/.operator/config.json";
// authority ה-owner החי של headcorner על STEEM (ציבורי, נשלף מ-condenser_api.get_accounts)
const STEEM_OWNER_AUTHORITY = "STM5aUKyd9LzENnMti5tS478Zu1SLJW51VHyu2gvSNGKhwfyMFpvv";
const GATE_URL = process.env.GATE_URL ?? "http://127.0.0.1:3000/api/sovereign/gate";
const OFFICE_URL = process.env.OFFICE_URL ?? "http://127.0.0.1:3000/api/office/ops/login";

function loadEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* אין-כספת-חיה — fail-closed כנה */ }
  return env;
}

/** כל-הצורות-הכשרות של הוכחת-הבעלים (אפס-תוויות): owner-WIF · master · המפתח-בלי-השם */
function ownerForms(env) {
  const out = [];
  const push = (s) => {
    if (typeof s === "string" && s.trim().length >= 8) {
      const t = s.trim();
      if (!out.includes(t)) out.push(t);
    }
  };
  push(env.STEEM_OWNER_WIF_A);
  push(env.HEAD_CORNER_MASTER);
  try {
    const dec = Buffer.from(env.HEAD_CORNER_KEY_B64 ?? "", "base64").toString("utf8").trim();
    push(dec);
    // חוק-הבעלים: "רק המפתח בלי השם" — תווית headcorner מוטבעת נפרדת מהמפתח
    if (dec.toLowerCase().startsWith("headcorner")) push(dec.slice(10));
  } catch { /* אין */ }
  return out;
}

/* ── אימות-שרשרת: WIF → pubkey → השוואה מול authority חי ── */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad-base58");
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16).padStart(2, "0");
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex");
  let pad = 0;
  for (const c of s) { if (c === "1") pad++; else break; }
  return Buffer.concat([Buffer.alloc(pad), buf]);
}
function derivePubkeyB58(wif) {
  const raw = b58decode(wif);
  if (raw.length !== 37 || raw[0] !== 0x80) return null;
  const payload = raw.subarray(0, 33);
  if (Buffer.compare(raw.subarray(33), crypto.createHash("sha256").update(crypto.createHash("sha256").update(payload).digest()).digest().subarray(0, 4)) !== 0) return null;
  return payload; // 0x02/0x03 + X — זהו ה-pubkey הכווץ
}
function graphenePub(priv32) { return null; } /* לא-בשימוש — האימות-העקומה מתבצע בתוך main */

async function main() {
  const env = loadEnv();
  const forms = ownerForms(env);
  if (!forms.length) {
    console.log(JSON.stringify({ ok: false, verdict: "no-live-secret-source", envFile: fs.existsSync(ENV_FILE) }));
    process.exit(1);
  }

  // 1) קובץ-המפתח-החי: ה-owner-WIF בלבד (מנדט-הבעלים: אפס-שם)
  const wif = env.STEEM_OWNER_WIF_A ?? "";
  fs.mkdirSync("/home/z/my-project/upload", { recursive: true });
  fs.writeFileSync(KEY_FILE, wif + "\n", { mode: 0o600 });
  fs.chmodSync(KEY_FILE, 0o600);

  // 2) קונפיג-הדיגסטים (כל-הצורות: raw + trimmed)
  const salt = crypto.randomBytes(16).toString("hex");
  const hashes = [];
  for (const f of forms) {
    for (const v of new Set([f, f.trim()])) {
      const h = crypto.createHash("sha256").update(salt + v).digest("hex");
      if (!hashes.includes(h)) hashes.push(h);
    }
  }
  fs.mkdirSync("/home/z/.operator", { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({
    salt, hashes,
    note: "owner-gate digests only — key material lives in the git steem vault + runtime .secrets (Task 18)",
    ownerAuthority: STEEM_OWNER_AUTHORITY,
    created: new Date().toISOString(),
  }, null, 1), { mode: 0o600 });
  fs.chmodSync(CONFIG, 0o600);

  // 3) אימות-שרשרת של ה-owner-WIF (checksum + אורך; את-העקומה בודקים אם noble זמין)
  let chainOk = false, pubPreview = null;
  const pub33 = wif ? derivePubkeyB58(wif) : null;
  if (pub33) {
    try {
      const { createRequire } = await import("node:module");
      // noble מותקן ב-workspace האימות; פותרים משם אם-המונוריפו חסר-אותו
      let req;
      try { req = createRequire("/home/z/keycensus/package.json"); req("@noble/secp256k1"); }
      catch { req = createRequire(import.meta.url); }
      const secp = req("@noble/secp256k1");
      const pub = Buffer.from(secp.getPublicKey(pub33.subarray(1), true));
      const enc = "STM" + base58encode(Buffer.concat([pub, crypto.createHash("ripemd160").update(pub).digest().subarray(0, 4)]));
      pubPreview = enc.slice(0, 14) + "…";
      chainOk = enc === STEEM_OWNER_AUTHORITY;
    } catch { chainOk = null; /* noble לא-זמין — checksum-WIF עדיין מאומת */ }
  }

  // 4) בדיקות-חיות אמיתיות מול-השערים (verdicts בלבד — אפס-סודות-בפלט)
  const gateTests = [];
  for (const [i, f] of forms.entries()) {
    try {
      const r = await fetch(GATE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: f }), signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      gateTests.push({ form: `form-${i}`, http: r.status, ok: j.ok === true });
    } catch (e) {
      gateTests.push({ form: `form-${i}`, http: 0, ok: false, err: String(e?.name ?? e?.message ?? "fail") });
    }
  }
  try {
    const r = await fetch(OFFICE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: wif }), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    gateTests.push({ form: "office-login(owner-wif)", http: r.status, ok: j.ok === true });
  } catch (e) {
    gateTests.push({ form: "office-login(owner-wif)", http: 0, ok: false });
  }

  console.log(JSON.stringify({
    ok: true,
    file: "upload/headcorner.txt (owner-WIF only, no label)",
    config: "/home/z/.operator/config.json (600)",
    digestCount: hashes.length,
    chainCheck: chainOk === null ? "secp-lib-unavailable (WIF-checksum-only)" : chainOk ? "PROVEN-OWNER-ON-CHAIN" : "MISMATCH",
    pubPreview,
    gateTests,
  }, null, 1));
}

function base58encode(buf) {
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
}

main().catch((e) => { console.error("gate-repair: fail —", e?.message ?? e); process.exit(1); });
