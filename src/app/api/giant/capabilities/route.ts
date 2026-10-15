/* ═══ GET /api/giant/capabilities — מאגר-היכולות של המערכת עצמה (מפקד-חי) ═════
 * השראה: קטלוג-התוספים awesome-dsh-plugin (כרטיסי-יכולת · redLines · טביעת-סריקה)
 * — אבל כאן אפס-קטלוג-חוץ: זה מפקד אמיתי של הפלטפורמה הזאת, נמדד בזמן-ריצה:
 *
 * 1. נקודות-קצה: הליכה רקורסיבית על קבצי route.ts תחת src/app/api (node:fs)
 *    + חילוץ-מטופלים ברגקס `export async function (GET|POST|PUT|DELETE)` לכל קובץ.
 * 2. זרמי-אמת: קריאת src/lib/sovereign/channel.ts וחילוץ קבועי-הנתיב הקנוניים
 *    (מחרוזות-מוחלטות + path.join מעל קבועי-DIR) — כל-זרם: exists/bytes/sha16/גיל.
 * 3. סיווג-עברי + תגי-יכולת + redLines — נגזרים ממה-שהקוד באמת עושה (אפס-המצאה).
 * 4. בדיקה-חיה: כל-נקודת-קצה GET-בלבד נדגמת מול 127.0.0.1:3000 (timeout 4 שניות).
 *    נקודות-כתיבה (POST/PUT/DELETE) לא נדגמות — מסומנות דלת-כתיבה.
 *    אפס-בדיקה-עצמית (מניעת-רקורסיה) — מוצהר כ-redLine.
 * 5. אכזכון-זיכרון 60 שניות · fail-honest: שגיאה-פנימית = ok:false + השגיאה עצמה.
 */
import { NextResponse } from "next/server";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import {
  fileMeta,
  DIRECTIVES_PATH,
  REQUESTS_PATH,
  NOTES_PATH,
  VOICE_PATH,
  LEGACY_BOOK_PATH,
  DEX_STATE_PATH,
  OPERATOR_INBOX_PATH,
} from "@/lib/sovereign/channel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* --------------------------------- types ---------------------------------- */

type Category = "בינה" | "פקודה" | "אמת" | "שוק" | "כסף" | "משרד" | "מערכת";

interface ProbeResult {
  status: number;
  ms: number;
  error?: string;
}

interface EndpointRow {
  path: string;
  methods: string[];
  category: Category;
  capabilities: string[];
  redLines: string[];
  probe: ProbeResult | null;
  writeDoor: boolean;
}

interface StreamRow {
  name: string;
  path: string;
  exists: boolean;
  bytes: number | null;
  sha16: string | null;
  ageMinutes: number | null;
}

interface CapabilitiesPayload {
  ok: boolean;
  generatedAt: string;
  endpoints: EndpointRow[];
  streams: StreamRow[];
  counts: { endpoints: number; probed: number; streams: number; healthy: number };
}

/* ------------------------------- census rules ------------------------------ */
/* סדר-בדיקה קובע: בינה → פקודה → אמת → שוק → משרד → כסף → (מערכת ברירת-מחדל).
 * market/league מופיעים בשתי-הרשימות (כסף/שוק) — נקבעים שוק (נתוני-שוק-ציבוריים);
 * dex/products נשארים כסף (הספר-הריבוני). כל-תג נגזר מהקוד האמיתי שנקרא כאן. */

interface Rule {
  re: RegExp;
  category: Category;
  capabilities: string[];
  redLines?: string[];
}

const RULES: Rule[] = [
  // בינה — מסילת-הקול (לפני-חוק-הערוץ, כדי-ש-/ask ייפול-כאן)
  {
    re: /sovereign\/channel\/ask$/,
    category: "בינה",
    capabilities: ["llm", "git-read", "integrity-law", "gate"],
    redLines: ["מספר-זר = REJECTED-כנה"],
  },
  // בינה — מסילת-הקול המדוברת (TTS אמיתי · עברית נמדדה 2026-10-14 · 501-כנה אם-יתבטל)
  {
    re: /sovereign\/channel\/speak$/,
    category: "בינה",
    capabilities: ["tts"],
    redLines: ["עברית-אם-נמדד · כשל-501-כנה"],
  },
  // פקודה — כתיבות-בעלים מוגנות-שער
  { re: /sovereign\/gate$/, category: "פקודה", capabilities: ["gate"], redLines: ["rate-limit 5/דקה"] },
  {
    re: /giant\/channel\/directive$/,
    category: "פקודה",
    capabilities: ["git-write", "pat", "gate"],
    redLines: ["כתיבה-לקנון-דרך-PAT", "מאובטח-שער"],
  },
  {
    re: /sovereign\/channel$/,
    category: "פקודה",
    capabilities: ["git-read", "git-write", "pat", "gate"],
    redLines: ["מאובטח-שער"],
  },
  { re: /office\/ops\/state$/, category: "פקודה", capabilities: ["session", "gate"], redLines: ["מאובטח-שער"] },
  {
    re: /office\/ops\/command$/,
    category: "פקודה",
    capabilities: ["session", "gate", "git-write"],
    redLines: ["מאובטח-שער"],
  },
  { re: /office\/ops\/login$/, category: "פקודה", capabilities: ["session"], redLines: ["rate-limit 5/15-דקות"] },
  // אמת — משטחי-האמת (כולל מאגר-זה עצמו)
  {
    re: /giant\/capabilities$/,
    category: "אמת",
    capabilities: ["fs-read", "http-probe"],
    redLines: ["אין-בדיקה-עצמית · מניעת-רקורסיה"],
  },
  { re: /giant\/pulse$/, category: "אמת", capabilities: ["git-read"] },
  { re: /organism$/, category: "אמת", capabilities: ["git-read", "http-read"] },
  // שוק — נתוני-שוק-ציבוריים (Kraken→Binance→CoinGecko ב-market; DefiLlama ב-league)
  {
    re: /giant\/market$/,
    category: "שוק",
    capabilities: ["http-read", "kraken", "git-read", "fs-write"],
  },
  {
    re: /giant\/league$/,
    category: "שוק",
    capabilities: ["http-read", "git-read"],
    redLines: ["השורה-הריבונית: ספר-פנימי-בלבד"],
  },
  // משרד — משטחי-המשרד-החי
  { re: /giant\/office$/, category: "משרד", capabilities: ["fs-read"] },
  { re: /office\/world$/, category: "משרד", capabilities: ["http-read"] },
  { re: /office\/state$/, category: "משרד", capabilities: ["http-read"] },
  { re: /office-state$/, category: "משרד", capabilities: ["http-read"] },
  // כסף — הספר-הריבוני
  {
    re: /giant\/dex$/,
    category: "כסף",
    capabilities: ["git-read"],
    redLines: ["ספר-פנימי-בלבד · כסף-חוץ נמדד ומוצג"],
  },
  { re: /giant\/products$/, category: "כסף", capabilities: ["git-read"], redLines: ["אפס-הבטחות-תשואה"] },
  // כסף — ספר-הפקודות-החוץ (Kraken Depth ראשי · Binance גיבוי · כשל-כולל = 502-כנה)
  { re: /giant\/orderbook$/, category: "כסף", capabilities: ["http-read", "kraken"] },
  // מערכת — שולחן-המסחר · הליגה-הישנה · רישום-ההחלטות · ברירת-מחדל לעתיד
  { re: /giant\/desk$/, category: "מערכת", capabilities: ["git-read", "pat"] },
  {
    re: /giant\/giants$/,
    category: "מערכת",
    capabilities: ["git-read"],
    redLines: ["אין-ביד-חוץ · פעולות-ספר בלבד"],
  },
  { re: /giant\/decisions$/, category: "מערכת", capabilities: ["git-read"] },
];

const CAT_ORDER: Category[] = ["בינה", "פקודה", "אמת", "שוק", "כסף", "משרד", "מערכת"];
const METHOD_ORDER = ["GET", "POST", "PUT", "DELETE"];
const METHOD_RE = /export\s+async\s+function\s+(GET|POST|PUT|DELETE)/g;

const SELF_PATH = "/api/giant/capabilities";
const PROBE_BASE = "http://127.0.0.1:3000";
const PROBE_TIMEOUT_MS = 4_000;

/* --------------------------------- walking --------------------------------- */

async function walkRoutes(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // תיקייה-חסרה — לא-שקר, פשוט-אין
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkRoutes(full, out);
    else if (e.name === "route.ts") out.push(full);
  }
}

/* --------------------------- canonical truth streams ------------------------ */

async function collectStreams(): Promise<StreamRow[]> {
  /* קוראים את lib/sovereign/channel.ts ומחלצים את קבועי-הנתיב — זרם-חדש
   * שנוסיף-שם יופיע-כאן אוטומטית. כשל-קריאה → נופלים לקבועים המיובאים. */
  const decls = new Map<string, string>();
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "src", "lib", "sovereign", "channel.ts"), "utf8");
    // מעבר-1: מחרוזות-מוחלטות — export const X = "/abs/path"
    for (const m of raw.matchAll(/export const ([A-Z0-9_]+)\s*=\s*"(\/[^"]+)"/g)) decls.set(m[1], m[2]);
    // מעבר-2: path.join מעל קבוע-ידוע — export const X = path.join(Y, "a/b")
    for (const m of raw.matchAll(/export const ([A-Z0-9_]+)\s*=\s*path\.join\(\s*([A-Z0-9_]+)\s*,\s*"([^"]+)"\s*\)/g)) {
      const base = decls.get(m[2]);
      if (base) decls.set(m[1], path.join(base, m[3]));
    }
  } catch {
    // fallback — אותם-קבועים בזמן-קומפילציה
    decls.set("DIRECTIVES_PATH", DIRECTIVES_PATH);
    decls.set("REQUESTS_PATH", REQUESTS_PATH);
    decls.set("NOTES_PATH", NOTES_PATH);
    decls.set("VOICE_PATH", VOICE_PATH);
    decls.set("LEGACY_BOOK_PATH", LEGACY_BOOK_PATH);
    decls.set("DEX_STATE_PATH", DEX_STATE_PATH);
    decls.set("OPERATOR_INBOX_PATH", OPERATOR_INBOX_PATH);
  }

  const rows: StreamRow[] = [];
  for (const [constName, p] of decls) {
    if (!constName.endsWith("_PATH")) continue; // DIR-ים הם תיקיות — לא-זרמים
    if (constName === "PAT_ENV_PATH") continue; // חומר-סודות — לעולם-לא-במאגר
    const meta = await fileMeta(p); // exists/bytes/sha16(mtime)/ageMinutes — אמת-מדידה
    rows.push({
      name: constName.replace(/_PATH$/, "").toLowerCase().replace(/_/g, "-"),
      path: p,
      exists: meta.exists,
      bytes: meta.bytes,
      sha16: meta.sha16,
      ageMinutes: meta.ageMinutes,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/* ---------------------------------- probe ---------------------------------- */

async function probeOnce(url: string): Promise<ProbeResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    return { status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return {
      status: 0,
      ms: Date.now() - t0,
      error: ac.signal.aborted ? "timeout-4s" : e instanceof Error ? e.message.slice(0, 80) : "fetch-failed",
    };
  } finally {
    clearTimeout(t);
  }
}

/* ---------------------------------- census --------------------------------- */

async function census(): Promise<CapabilitiesPayload> {
  const apiRoot = path.join(process.cwd(), "src", "app", "api");
  if (!existsSync(apiRoot)) throw new Error("api-root-missing: src/app/api");

  const files: string[] = [];
  await walkRoutes(apiRoot, files);

  const endpoints: EndpointRow[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const methods = Array.from(new Set(Array.from(content.matchAll(METHOD_RE), (m) => m[1]))).sort(
      (a, b) => METHOD_ORDER.indexOf(a) - METHOD_ORDER.indexOf(b),
    );
    if (methods.length === 0) continue; // אין-מטופלים מיוצאים — לא-נקודת-קצה
    const rel = path.relative(apiRoot, file).split(path.sep).join("/");
    const epPath = ("/api/" + rel.replace(/(^|\/)route\.ts$/, "")).replace(/\/$/, "");
    const rule: Rule = RULES.find((r) => r.re.test(epPath)) ?? {
      re: /$/,
      category: "מערכת",
      capabilities: [],
      redLines: [],
    };
    endpoints.push({
      path: epPath,
      methods,
      category: rule.category,
      capabilities: [...rule.capabilities],
      redLines: [...(rule.redLines ?? [])],
      writeDoor: methods.some((m) => m !== "GET"),
      probe: null,
    });
  }

  // בדיקה-חיה: רק נקודות-קצה GET-בלבד (ללא תופעות-לוואי) — ולעולם לא-את-עצמנו
  const probeable = endpoints.filter(
    (e) => e.methods.length === 1 && e.methods[0] === "GET" && e.path !== SELF_PATH,
  );
  const settled = await Promise.allSettled(probeable.map((e) => probeOnce(PROBE_BASE + e.path)));
  probeable.forEach((e, i) => {
    const s = settled[i];
    e.probe = s.status === "fulfilled" ? s.value : { status: 0, ms: 0, error: "probe-rejected" };
  });

  endpoints.sort(
    (a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.path.localeCompare(b.path),
  );

  const streams = await collectStreams();
  const probes = endpoints.flatMap((e) => (e.probe ? [e.probe] : []));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    endpoints,
    streams,
    counts: {
      endpoints: endpoints.length,
      probed: probes.length,
      streams: streams.length,
      healthy: probes.filter((p) => p.status >= 200 && p.status < 400).length,
    },
  };
}

/* ---------------------------------- cache ---------------------------------- */

let cache: { at: number; payload: CapabilitiesPayload } | null = null;
const CACHE_MS = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, { headers: { "cache-control": "no-store" } });
  }
  try {
    const payload = await census();
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    // fail-honest — אף-מספר-מומצא, השגיאה-עצמה-חוזרת
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "census-failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
