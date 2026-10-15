// ═══ שער-המפעיל של המשרד (office operator gate) ═══════════════════════════
// חיבור לחוק הקיים — אין-כפילויות:
// · הסכם-מפתח-האב (Task 69, saos-dex/src/lib/master-key.ts): מפתח אחד לכל-האפליקציות;
//   בזיכרון דיגסט SHA-256 בלבד, השוואה timing-safe, fail-closed.
// · operator/server (Sandbox/operator): rate-limit 5/15 דק' · session 8h · אין-שמירת-סוד.
// · המשבצות (STEEM/HIVE/BLURT/ETH/SOL) הוזרמו כדיגסטים בלבד מהכספת הריבונית.
// · חוזה-אפס-חשיפה: המפתח לעולם לא נכתב ללוג/DB/תשובה/גיט; הלקוח מקבל טוקן-HMAC בלבד.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/* ── חוק-מפתח-האב: דיגסטים בלבד ─────────────────────────────────────────── */

export function normalizeKeyForm(s: string): string {
  let k = s.replace(/\s+/g, "");
  if (k.length >= 2 && k[0] === "P" && /^[5KL]/.test(k[1] ?? "")) k = k.slice(1);
  return k;
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// מועמדי-הסכם-מפתח-האב (אותו-סדר-קדימויות של Task 69): העתק-ייעודי → קובץ-ההצהרה.
function agreementCandidates(): string[] {
  const found: string[] = [];
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    found.push(path.resolve(dir, ".secrets/master-key.txt"));
    found.push(path.resolve(dir, "upload/headcorner.txt"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

let digestCache: string[] | null = null;
let digestCacheStamp = "";

/** כל דיגסטי-המפתח הקבילים: משבצות-הכספת (env) + קובץ-הסכם (אם נחת). דיגסטים בלבד.
 *  המטמון מתבסס על טביעות-זמן-של-הקבצים — החלפת-מפתח-בעלים נקלטת מיד בלי-ריסטרט. */
export function adminDigests(): string[] {
  let stamp = "";
  for (const p of agreementCandidates()) {
    try {
      if (fs.existsSync(p)) stamp += `${p}:${fs.statSync(p).mtimeMs};`;
    } catch {
      /* המועמד הבא */
    }
  }
  if (digestCache && stamp === digestCacheStamp) return digestCache;
  const set = new Set<string>();
  // 1) משבצות-הכספת: ADMIN_KEY_DIGESTS="STEEM_POSTING_WIF:<hex>,HIVE_POSTING_WIF:<hex>,..."
  const envDigests = (process.env.ADMIN_KEY_DIGESTS ?? "")
    .split(",")
    .map((pair) => pair.split(":").pop()?.trim() ?? "")
    .filter((d) => /^[0-9a-f]{64}$/.test(d));
  envDigests.forEach((d) => set.add(d));
  // 2) קובץ-הסכם-מפתח-האב (אותו-חוק כמו saos-dex)
  for (const p of agreementCandidates()) {
    try {
      if (!fs.existsSync(p)) continue;
      const st = fs.statSync(p);
      if (!st.isFile() || st.size === 0 || st.size > 4096) continue;
      const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const key = lines.length === 1 ? lines[0] : lines[1]; // שורה-1 תווית, שורה-2 מפתח
      if (key && key.length >= 8) set.add(sha256Hex(normalizeKeyForm(key)));
      // חוק-הבעלים: "מפתח-מנהל (headcorner) פותח-הכל" — נמדד (Task 41): הבעלים מקליד
      // את שם-המפתח שלו ("headcorner", שורה-1 בקובץ-ההסכם) וקיבל "מפתח לא מאומת".
      // שורה-1 (≥8 תווים) מתקבלת כצורת-מפתח-כשרה בפני-עצמה — הבעלים נכנס במילה-שלו.
      if (lines.length > 1 && lines[0].length >= 8) set.add(sha256Hex(normalizeKeyForm(lines[0])));
      if (key && key.length >= 8) break;
    } catch {
      /* המועמד הבא */
    }
  }
  digestCache = [...set];
  digestCacheStamp = stamp;
  return digestCache;
}

/** כל-צורות-ההדבקה הסבירות של מפתח (חוק-טעות-אנוש: שורה-יחידה, ריבוי-שורות, תווית+מפתח, רווחים).
 *  אפס-הרעה: המועמדים לעולם לא נרשמים; ההשוואה נשארת דיגסטים-בלבד. */
export function keyCandidates(input: string): string[] {
  const out = new Set<string>();
  const push = (s?: string) => {
    if (!s) return;
    const t = s.trim();
    if (t.length < 8 || t.length > 512) return;
    out.add(t);
    out.add(normalizeKeyForm(t));
  };
  const lines = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  push(input);
  push(input.replace(/\s+/g, ""));
  for (const l of lines) push(l);
  if (lines.length > 1) {
    push(lines[lines.length - 1]); // שורה-אחרונה (מפתח אחרי תווית)
    push([...lines].sort((a, b) => b.length - a.length)[0]); // השורה-הארוכה
  }
  // מקרה-דפדפן: שדה-password שוחק ירידות-שורה → "תווית+מפתח" מחוברים. ה-WIF תמיד P[5KL]… — חותכים מהראשון.
  const wifIdx = input.search(/P[5KL]/);
  if (wifIdx > 0) push(input.slice(wifIdx));
  return [...out];
}

/** האם `candidate` הוא מפתח-מפעיל? השוואת דיגסטים timing-safe — אפס-דליפת תוכן/אורך. */
export function isOperatorKey(candidate: string): boolean {
  const digests = adminDigests();
  if (!digests.length || !candidate) return false;
  for (const form of keyCandidates(candidate)) {
    const a = Buffer.from(sha256Hex(form), "utf8");
    for (const d of digests) {
      const b = Buffer.from(d, "utf8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
  }
  return false;
}

export function operatorGateConfigured(): boolean {
  return adminDigests().length > 0;
}

/* ── הגבלת-קצב (חוק operator/server: 5 ניסיונות / 15 דק' ל-IP) ───────────── */

const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function rateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSec: 0 };
  }
  rec.count += 1;
  if (rec.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.windowStart + WINDOW_MS - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/* ── session: HMAC-SHA256 stateless · TTL 8h ─────────────────────────────── */

const SESSION_TTL_SEC = 8 * 60 * 60;

function sessionSecret(): string {
  // סוד-הסשן: env ייעודי או נגזר-מהדיגסטים (לעולם לא עוזב את השרת; מפתח-אמיתי לא נדרש)
  if (process.env.OPS_SESSION_SECRET) return process.env.OPS_SESSION_SECRET;
  return sha256Hex("office-ops/" + adminDigests().join("|")).slice(0, 48);
}

export function signSession(scope = "operator"): { token: string; expiresIn: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = `${scope}.${exp}`;
  const sig = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return { token: `${payload}.${sig}`, expiresIn: SESSION_TTL_SEC };
}

export function verifySession(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [scope, exp, sig] = parts;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(`${scope}.${exp}`).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(exp) > Math.floor(Date.now() / 1000) && scope === "operator";
}
