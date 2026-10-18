/* ═══ sovereign-voice v3 · פורט 3019 · קול-ריבוני + מפעיל-פנימי + שומר-דיסק ══
 * תורת-הבעלים (2026-10-18): "אני לא מעביר סיסמאות — פתור בעצמך. הריבונות מנהלת
 * את עצמה, משתמשת בכלים שנבנו לה, ומחזקת את ההתאוששות של עצמה."
 *
 * v3 על גבי v2 (סריקות + אזעקות-גיט + מפעיל-פנימי):
 *  · שומר-דיסק אוטונומי (לקח-ENOSPC 20261018 — הדיסק-המלא-הרג-את-כל-מכונות-האמת
 *    בשקט: ledger-flush ENOSPC → שרשרת-שבורה → הסגר → ריסוק). ב-85%: אזעקה.
 *    ב-92%: טיפול-עצמי מיידי — ניקוי-מטמוני-bun, גופות-tmp_pack, ו-gc-מושתל
 *    (PolarFS /tmp/my-project — 29PB פנויים: מעתיקים .git לשם, gc, משתילים-חזרה).
 *    רישום-מעשה מלא ב-state/disk-log.jsonl. אפס-הדמיות — מד-תוצאה אחרי-כל-צעד.
 *  · חוק-סדר-עלייה (מלחמת-הפורטים 20261018): ה-DEX-next-dev-שנולד-ראשון חוטף
 *    גם-את-:3000 → הקונסולה-נחנקת. מעכשיו: קונסולה (:3000) ראשונה, אחר-כך כלכלה
 *    (:3016 — המנעול-מגן-מפני-כותב-כפול), אחר-כך דקס (דרך-המשגיח, portAlive-guard),
 *    ורק-אז השאר. ה-DEX-לא-מרופא-לפני-שהקונסולה-מאומתת-חיה.
 *  · שימוש-בכלים: המבקר-הבלתי-תלוי (sovereign-audit :3022 · iFixAi) נכלל-בסריקה
 *    ובדוח — אם-השופט-מת, אזעקה-קריטית (צבא-חמוש-בלי-שופט = מנדט-מופר).
 *  · קול-גיטהאב + Posta נשארים כב-v2.
 *
 * אפס-סינתזה: כל-אזעקה, ריפוי וטיפול-דיסק נרשמים עם עדות.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const PORT = 3019;
const SCAN_MS = 5 * 60_000;
const SEAL_STALL_MS = 30 * 60_000;
const ALERT_COOLDOWN_MS = 30 * 60_000;
const ISSUE_DEDUP_MS = 6 * 60 * 60_000;
const CONSECUTIVE_FAILS_TO_HEAL = 2;
const DISK_WARN_PCT = 85;
const DISK_ACT_PCT = 92;
const DISK_ACT_COOLDOWN_MS = 20 * 60_000; // לא יותר מטיפול-דיסק אחד ל-20 דק'

const FLEET = {
  console: "http://127.0.0.1:3000",
  economy: "http://127.0.0.1:3016",
  dex: "http://127.0.0.1:3010/saos-dex/api/dex",
  bridge: "http://127.0.0.1:3017",
  army: "http://127.0.0.1:3018",
  audit: "http://127.0.0.1:3022",
};

/* ── חוק-סדר-עלייה: הסדר במערך = סדר-הריפוי. הקונסולה-ראשונה (דלת-הבית), אחר-כך
 * הלב, אחר-כך הבורסה דרך-המשגיח שלה (יש-לו portAlive-guard משלו), אחר-כך השאר. ── */
const HEALABLE = [
  { id: "console", port: 3000, dir: "/home/z/my-project", log: "dev.log", cmd: `cd /home/z/my-project && setsid nohup bash -c './node_modules/.bin/next dev -p 3000 > dev.log 2>&1' </dev/null &` },
  { id: "economy", port: 3016, dir: path.join(import.meta.dir, "..", "fleet-economy"), log: "economy.log", cmd: `cd '${path.join(import.meta.dir, "..", "fleet-economy")}' && setsid nohup bun index.ts >> economy.log 2>&1 </dev/null &` },
  { id: "dex", port: 3010, dir: path.join(import.meta.dir, "..", "saos-dex-node"), log: "proxy.log", cmd: `cd '${path.join(import.meta.dir, "..", "saos-dex-node")}' && setsid nohup bun index.ts >> proxy.log 2>&1 </dev/null &`, gate: "console" },
  { id: "bridge", port: 3017, dir: path.join(import.meta.dir, "..", "dex-economy-bridge"), log: "bridge.log", cmd: `cd '${path.join(import.meta.dir, "..", "dex-economy-bridge")}' && setsid nohup bun index.ts >> bridge.log 2>&1 </dev/null &` },
  { id: "army", port: 3018, dir: path.join(import.meta.dir, "..", "soldier-army"), log: "army.log", cmd: `cd '${path.join(import.meta.dir, "..", "soldier-army")}' && setsid nohup bun run dev >> army.log 2>&1 </dev/null &` },
  { id: "audit", port: 3022, dir: path.join(import.meta.dir, "..", "sovereign-audit"), log: "audit.log", cmd: `cd '${path.join(import.meta.dir, "..", "sovereign-audit")}' && setsid nohup bun run dev >> audit.log 2>&1 </dev/null &` },
  { id: "boot-verifier", port: 3042, dir: path.join(import.meta.dir, "..", "boot-verifier"), log: "node.log", cmd: `cd '${path.join(import.meta.dir, "..", "boot-verifier")}' && setsid nohup bun run dev >> node.log 2>&1 </dev/null &` },
] as const;

/* ── Posta (אופציונלי) ── */
const POSTA_URL = process.env.POSTA_URL ?? "";
const POSTA_API_KEY = process.env.POSTA_API_KEY ?? "";
const POSTA_FROM = process.env.POSTA_FROM ?? "sovereign-fleet@roshpinacare-sys";
const POSTA_TO = (process.env.POSTA_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const POSTA_READY = !!(POSTA_URL && POSTA_API_KEY && POSTA_TO.length);

/* ── קול-גיטהאב: PAT-משמורת קיים — זהירות-סודות: נטען, לעולם לא נשפך ── */
const PAT_FILE = path.join(import.meta.dir, "..", "..", "upload", "pat.env");
const GH_TOKEN = (() => {
  try { return fs.readFileSync(PAT_FILE, "utf8").trim(); } catch { return ""; }
})();
const GH_OK = /^github_pat_|^ghp_/.test(GH_TOKEN);
const GH_REPO = "roshpinacare-sys/giant";

const STATE_DIR = path.join(import.meta.dir, "state");
const ALERTS_FILE = path.join(STATE_DIR, "alerts.jsonl");
const HEAL_FILE = path.join(STATE_DIR, "heal-log.jsonl");
const DISK_FILE = path.join(STATE_DIR, "disk-log.jsonl");
const ISSUE_MAP_FILE = path.join(STATE_DIR, "issue-map.json");
fs.mkdirSync(STATE_DIR, { recursive: true });
const issueMap: Record<string, { ts: number; issue?: number }> = (() => {
  try { return JSON.parse(fs.readFileSync(ISSUE_MAP_FILE, "utf8")); } catch { return {}; }
})();
function saveIssueMap(): void { try { fs.writeFileSync(ISSUE_MAP_FILE, JSON.stringify(issueMap)); } catch { /* כנה */ } }

type Alert = { ts: number; key: string; sev: "critical" | "warn"; text: string; status: string; issue?: number };
const lastAlertAt: Record<string, number> = {};

async function openIssue(key: string, text: string): Promise<number | null> {
  if (!GH_OK) return null;
  const prev = issueMap[key];
  if (prev && Date.now() - prev.ts < ISSUE_DEDUP_MS) return prev.issue ?? null;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${GH_TOKEN}` },
      body: JSON.stringify({
        title: `[voice] ${key} — אסקלציה ריבונית`,
        body: `**אוטונומי** · sovereign-voice :3019 · ${new Date().toISOString()}\n\n${text}\n\nנפתח ללא-התערבות-מפעיל (תורת-הבעלים: הריבונות מדווחת בעצמה).`,
        labels: ["sovereign-voice"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.number) {
      issueMap[key] = { ts: Date.now(), issue: d.number };
      saveIssueMap();
      console.log(`[voice] אישוא-אסקלציה #${d.number} נפתח (${key})`);
      return d.number;
    }
  } catch (e) { console.log(`[voice] issue-שגיאה: ${String(e).slice(0, 100)}`); }
  return null;
}

function emitAlert(key: string, sev: Alert["sev"], text: string): Alert | null {
  const now = Date.now();
  if (lastAlertAt[key] && now - lastAlertAt[key] < ALERT_COOLDOWN_MS) return null;
  lastAlertAt[key] = now;
  const a: Alert = { ts: now, key, sev, text, status: "ledger" };
  try { fs.appendFileSync(ALERTS_FILE, JSON.stringify(a) + "\n"); } catch { /* כנה */ }
  void (async () => {
    if (sev === "critical") {
      const n = await openIssue(key, text);
      if (n) { a.status = "github-issue"; a.issue = n; }
    }
    if (POSTA_READY && (sev === "critical" || key.startsWith("economy"))) {
      const ok = await sendViaPosta(`[${sev === "critical" ? "קריטי" : "אזעקה"}] ${key}`, `<p>${text}</p>`);
      if (ok) a.status = a.issue ? `${a.status}+posta` : "posta";
    }
    try { fs.appendFileSync(STATE_DIR + "/alert-status.jsonl", JSON.stringify({ ts: Date.now(), key, status: a.status, issue: a.issue ?? null }) + "\n"); } catch { /* כנה */ }
  })();
  return a;
}

async function sendViaPosta(subject: string, html: string): Promise<boolean> {
  if (!POSTA_READY) return false;
  try {
    const r = await fetch(`${POSTA_URL.replace(/\/$/, "")}/api/v1/emails/send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${POSTA_API_KEY}` },
      body: JSON.stringify({ from: POSTA_FROM, to: POSTA_TO, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok && !!d?.id;
  } catch { return false; }
}

async function jget(url: string, ms = 6000): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/* ═══ שומר-דיסק אוטונומי (v3) ═══════════════════════════════════════════════
 * הלקח: git-pack-אקספלוזיה (8×400MB ב-FleetHQ) + auto-gc בזמן-דיסק-מלא = מוות-
 * שקט-כולל. התרופה: (1) gc.auto=0 בכל-המאגרים (נעשה-ונשמר), (2) ניקוי-מטמונים,
 * (3) gc-מושתל-דרך-PolarFS — העתק-.git-לשם, gc-שם (שפע-מקום), השתלה-חזרה.
 * הכול עם מד-תוצאה: df לפני ואחרי, רישום-מעשה. */
let lastDiskActAt = 0;
function diskUsedPct(): number {
  try {
    const df = execFileSync("df", ["-h", "/"], { encoding: "utf8", timeout: 5000 });
    return parseInt(/(\d+)%\s+\/\s*$/m.exec(df)?.[1] ?? "0", 10);
  } catch { return -1; }
}
function sh(cmd: string, timeoutMs = 300_000): { ok: boolean; out: string } {
  try {
    const out = execFileSync("bash", ["-c", cmd], { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out: out.slice(-500) };
  } catch (e: any) { return { ok: false, out: String(e?.message ?? e).slice(-300) }; }
}
function diskGuardian(): { acted: boolean; steps: string[]; before: number; after: number } {
  const before = diskUsedPct();
  const steps: string[] = [];
  if (before < DISK_ACT_PCT || Date.now() - lastDiskActAt < DISK_ACT_COOLDOWN_MS) return { acted: false, steps, before, after: before };
  lastDiskActAt = Date.now();
  console.log(`[voice·disk] דיסק ב-${before}% — טיפול-עצמי מתחיל`);
  /* 1. מטמוני-הורדות (בטוחים לגמרי — נבנים-מחדש לבד) */
  const r1 = sh(`for i in 1 2 3 4 5; do rm -rf /home/z/.bun/install/cache 2>/dev/null; sync; done; echo done`, 120_000);
  steps.push(`bun-cache:${r1.ok}`);
  /* 2. גופות-gc (tmp_pack שנכשלו) */
  const r2 = sh(`rm -f /home/z/estate/FleetHQ/.git/objects/pack/tmp_pack_* /home/z/my-project/.git/objects/pack/tmp_pack_* /home/z/channels/giant/.git/objects/pack/tmp_pack_* 2>/dev/null; echo done`, 60_000);
  steps.push(`tmp-pack-corpses:${r2.ok}`);
  /* 3. gc-מושתל על המאגר-הכבד-ביותר (FleetHQ — הוכח: 3.5GB→263MB) */
  const staging = "/tmp/my-project/voice-git-swap";
  sh(`rm -rf '${staging}'`);
  const r3 = sh(`cp -a /home/z/estate/FleetHQ/.git '${staging}' && git -C '${staging}' reflog expire --expire=now --all && git -C '${staging}' gc --prune=now && echo GC-OK`, 600_000);
  if (r3.ok && r3.out.includes("GC-OK")) {
    const r4 = sh(`cd /home/z/estate/FleetHQ && for i in 1 2 3 4 5; do rm -rf .git 2>/dev/null; sync; done && cp -a '${staging}' .git && git log --oneline -1`, 600_000);
    steps.push(`fleethq-gc-transplant:${r4.ok}`);
    sh(`rm -rf '${staging}'`);
  } else {
    steps.push(`fleethq-gc-transplant:failed`);
    sh(`rm -rf '${staging}'`);
  }
  const after = diskUsedPct();
  const rec = { ts: Date.now(), before, after, steps, freedPct: before - after };
  try { fs.appendFileSync(DISK_FILE, JSON.stringify(rec) + "\n"); } catch { /* כנה */ }
  console.log(`[voice·disk] טיפול-הושלם: ${before}%→${after}% · ${steps.join(" · ")}`);
  emitAlert(before - after > 5 ? "disk-healed" : "disk-heal-weak", before - after > 5 ? "warn" : "critical",
    `שומר-הדיסק: ${before}%→${after}% · ${steps.join(" · ")}`);
  return { acted: true, steps, before, after };
}

/* ── מפעיל-פנימי: ריפוי-בדפוס-האימוץ + חוק-סדר-עלייה ── */
const failStreak: Record<string, number> = {};
const aliveCache: Record<string, boolean> = {};
async function probe(port: number): Promise<boolean> {
  try { await jget(`http://127.0.0.1:${port}/`, 4000); return true; } catch {
    try { await jget(`http://127.0.0.1:${port}/health`, 4000); return true; } catch { return false; }
  }
}
function respawn(svc: { id: string; cmd: string }): boolean {
  try {
    const child = spawn("bash", ["-c", svc.cmd], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch (e) { console.log(`[voice] respawn-שגיאה ${svc.id}: ${String(e).slice(0, 90)}`); return false; }
}
async function healPass(): Promise<void> {
  for (const svc of HEALABLE) {
    /* חוק-סדר-עלייה: שער-הדקס — לא מרופא לפני שהקונסולה חיה (מלחמת-הפורטים) */
    if ("gate" in svc && svc.gate && !aliveCache[svc.gate]) {
      aliveCache[svc.gate] = await probe(HEALABLE.find((h) => h.id === svc.gate)!.port);
      if (!aliveCache[svc.gate]) continue;
    }
    const alive = await probe(svc.port);
    aliveCache[svc.id] = alive;
    if (alive) { failStreak[svc.id] = 0; continue; }
    failStreak[svc.id] = (failStreak[svc.id] ?? 0) + 1;
    if (failStreak[svc.id] >= CONSECUTIVE_FAILS_TO_HEAL) {
      const ok = respawn(svc);
      await new Promise((r) => setTimeout(r, svc.id === "console" ? 25_000 : svc.id === "dex" ? 20_000 : 10_000));
      const verified = await probe(svc.port);
      aliveCache[svc.id] = verified;
      if (verified) failStreak[svc.id] = 0;
      const rec = { ts: Date.now(), svc: svc.id, action: "respawn", spawned: ok, verified, fails: failStreak[svc.id] };
      try { fs.appendFileSync(HEAL_FILE, JSON.stringify(rec) + "\n"); } catch { /* כנה */ }
      console.log(`[voice] ריפוי ${svc.id}: respawn=${ok} verified=${verified}`);
      emitAlert(verified ? `healed-${svc.id}` : `heal-failed-${svc.id}`, verified ? "warn" : "critical",
        `מפעיל-פנימי: ${svc.id}:${svc.port} נפל (${rec.fails} כשלים) → respawn=${ok} → verified=${verified}`);
    }
  }
}

type Snapshot = { at: number; consoleSrv: any; economy: any; verify: any; dex: any; bridge: any; army: any; audit: any; alerts: Alert[]; errors: string[]; diskUsedPct?: number };
let lastSnapshot: Snapshot | null = null;

async function scanFleet(): Promise<Snapshot> {
  const snap: Snapshot = { at: Date.now(), consoleSrv: null, economy: null, verify: null, dex: null, bridge: null, army: null, audit: null, alerts: [], errors: [] };
  /* חוק-הדיסק: אזעקה ב-85%, טיפול-עצמי ב-92% */
  const pct = diskUsedPct();
  snap.diskUsedPct = pct;
  if (pct >= DISK_WARN_PCT) snap.alerts.push(emitAlert("disk-full", "critical", `הדיסק ב-${pct}% (סף-${DISK_WARN_PCT}) — ${pct >= DISK_ACT_PCT ? "טיפול-עצמי מופעל" : "מעקב-הדוק"}`) ?? null);
  if (pct >= DISK_ACT_PCT) { const r = diskGuardian(); if (r.acted) snap.diskUsedPct = r.after; }

  /* דלת-הבית: הקונסולה :3000 */
  try {
    const r = await fetch(FLEET.console, { signal: AbortSignal.timeout(8000) });
    snap.consoleSrv = { status: r.status };
    if (r.status >= 500) snap.alerts.push(emitAlert("console-5xx", "critical", `הקונסולה :3000 מחזירה ${r.status} — דלת-הבית-פגומה`) ?? null);
  } catch (e) { snap.errors.push(`console: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("console-unreachable", "critical", "הקונסולה :3000 לא מגיבה — המפעיל-הפנימי יקים (חוק-סדר-עלייה: ראשונה)") ?? null); }

  try {
    snap.economy = await jget(`${FLEET.economy}/health`);
    if (!snap.economy?.ok) snap.alerts.push(emitAlert("economy-down", "critical", `נוד-הכלכלה עונה ok=false: ${JSON.stringify(snap.economy).slice(0, 150)}`) ?? null);
    try {
      snap.verify = await jget(`${FLEET.economy}/verify`, 12_000);
      if (snap.verify && snap.verify.ok === false) snap.alerts.push(emitAlert("ledger-verify", "critical", `אימות-שרשרת נכשל: ${JSON.stringify(snap.verify).slice(0, 200)}`) ?? null);
      const anchors = Array.isArray(snap.verify?.anchors) ? snap.verify.anchors : null;
      if (snap.verify?.ok && anchors && anchors.length === 0)
        snap.alerts.push(emitAlert("verify-without-anchors", "critical", "אימות עובר אך אפס-עוגנים — הספר עלה-רגנזיס-טרייה? דרוש-שחזור-מגיט-מיידי (עוגנים 3/3 = 46335/55120/68276)") ?? null);
      if (snap.verify?.ok && anchors && anchors.length > 0 && anchors.length < 3)
        snap.alerts.push(emitAlert("anchors-partial", "critical", `רק ${anchors.length}/3 עוגנים באימות — רציפות-חלקית`) ?? null);
    } catch (e) { snap.errors.push(`verify: ${String(e).slice(0, 60)}`); }
    try {
      const m = await jget(`${FLEET.economy}/metrics`);
      const lastSeal = m?.lastSeal?.at ? Date.parse(m.lastSeal.at) : 0;
      if (lastSeal && Date.now() - lastSeal > SEAL_STALL_MS) {
        const min = Math.round((Date.now() - lastSeal) / 60_000);
        snap.alerts.push(emitAlert("seal-stall", "critical", `איטום-כספת תקוע — sweep אחרון לפני ${min} דק'`) ?? null);
      }
    } catch { /* health כבר נבדק */ }
  } catch (e) {
    snap.errors.push(`economy: ${String(e).slice(0, 60)}`);
    snap.alerts.push(emitAlert("economy-unreachable", "critical", `נוד-הכלכלה :3016 לא מגיב — המפעיל-הפנימי יקים (המנעול-מגן-מפני-כותב-כפול)`) ?? null);
  }

  try {
    snap.dex = await jget(`${FLEET.dex}/state`);
    const dst = snap.dex?.state ?? snap.dex;
    if (dst?.halted) snap.alerts.push(emitAlert("dex-halted", "critical", `הבורסה עצורה: ${dst?.haltReason ?? snap.dex?.haltReason ?? "?"}`) ?? null);
    else if (dst && dst.dbOk === false) snap.alerts.push(emitAlert("dex-db", "critical", "dbOk=false — מסד-השרשרת פגום") ?? null);
  } catch (e) { snap.errors.push(`dex: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("dex-unreachable", "critical", "הבורסה :3010 לא מגיבה — המשגיח יקים (רק-אחרי-קונסולה-חיה)") ?? null); }

  try {
    snap.bridge = await jget(`${FLEET.bridge}/health`);
    if (snap.bridge && Number(snap.bridge.errors ?? 0) > 0) {
      const n = Number(snap.bridge.errors);
      if (n > (bridgeErrSeen ?? 0)) snap.alerts.push(emitAlert("bridge-errors", "warn", `גשר-דקס→כלכלה: ${n} שגיאות (היה ${bridgeErrSeen ?? 0})`) ?? null);
      bridgeErrSeen = n;
    }
  } catch (e) { snap.errors.push(`bridge: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("bridge-unreachable", "warn", "הגשר :3017 לא מגיב — המפעיל-הפנימי ינסה-ריפוי") ?? null); }

  try {
    snap.army = await jget(`${FLEET.army}/status`);
    const errs = (snap.army?.soldiers ?? []).filter((s: any) => s?.lastErr);
    if (errs.length) snap.alerts.push(emitAlert("army-errors", "warn", `חיילים עם שגיאה: ${errs.map((s: any) => `${s.id}:${String(s.lastErr).slice(0, 50)}`).join(" · ")}`) ?? null);
  } catch (e) { snap.errors.push(`army: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("army-unreachable", "warn", "צבא-החיילים :3018 לא מגיב — המפעיל-הפנימי ינסה-ריפוי") ?? null); }

  /* המבקר-הבלתי-תלוי (iFixAi :3022) — השופט של הצבא החמוש */
  try {
    snap.audit = await jget(`${FLEET.audit}/health`);
    const dec = snap.audit?.lastDecision ?? snap.audit?.decision ?? null;
    if (dec && dec !== "CLEAR" && dec !== "clear") snap.alerts.push(emitAlert("audit-not-clear", "critical", `המבקר-הבלתי-תלוי פסק: ${JSON.stringify(dec).slice(0, 120)}`) ?? null);
  } catch (e) { snap.errors.push(`audit: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("audit-unreachable", "critical", "המבקר-הבלתי-תלוי :3022 לא מגיב — צבא-חמוש-בלי-שופט") ?? null); }

  snap.alerts = snap.alerts.filter(Boolean) as Alert[];
  lastSnapshot = snap;
  return snap;
}
let bridgeErrSeen: number | null = null;

function digestHtml(snap: Snapshot): string {
  const e = snap.economy, d = snap.dex, a = snap.army, b = snap.bridge, au = snap.audit;
  const f = (a?.soldiers ?? []).reduce((t: number, s: any) => t + Number(s.filledMu ?? 0), 0);
  return `<h2>דוח-צי ריבוני · ${new Date(snap.at).toISOString()}</h2>
<ul>
<li><b>דיסק</b>: ${snap.diskUsedPct ?? "?"}% (אזעקה-${DISK_WARN_PCT} · טיפול-עצמי-${DISK_ACT_PCT})</li>
<li><b>קונסולה</b>: ${snap.consoleSrv ? `HTTP ${snap.consoleSrv.status}` : "לא מגיבה!"}</li>
<li><b>כלכלה</b>: ${e ? `seq=${e.seq} · verify=${snap.verify ? (snap.verify.ok ? `ok (checked=${snap.verify.checked})` : "נכשל!") : "לא-נבדק"}` : "לא מגיב!"}</li>
<li><b>בורסה</b>: ${d ? `h=${d.state?.height ?? d.height} · halted=${d.state?.halted ?? d.halted} · fills=${Number(d.state?.fills ?? d.fills ?? 0).toLocaleString()}` : "לא מגיב!"}</li>
<li><b>גשר</b>: ${b ? `inserted=${b.inserted} · errors=${b.errors}` : "לא מגיב!"}</li>
<li><b>חיילים</b>: ${a ? `anchor=${a.market?.anchor} · מילויים-מצטבר=${f.toLocaleString()}µ · מחזורים=${a.cycles}` : "לא מגיב!"}</li>
<li><b>מבקר-בלתי-תלוי</b>: ${au ? `ok · פסק=${au.lastDecision ?? au.decision ?? "?"}` : "לא מגיב!"}</li>
<li><b>קול-גיטהאב</b>: ${GH_OK ? "חי — Issues נפתחים אוטונומית" : "PAT לא נטען"}</li>
<li><b>Posta</b>: ${POSTA_READY ? "מחובר" : "לא מוגדר (אופציונלי)"}</li>
<li><b>שגיאות-סריקה</b>: ${snap.errors.length ? snap.errors.join(" · ") : "אפס"}</li>
</ul>`;
}

let scans = 0, heals = 0, bootedAt = Date.now();
async function tick(): Promise<void> {
  try {
    await scanFleet();
    scans++;
    await healPass();
    heals++;
    const crit = (lastSnapshot?.alerts ?? []).filter((a) => a.sev === "critical").length;
    console.log(`[voice] סריקה #${scans}: אזעקות=${lastSnapshot?.alerts.length ?? 0} (קריטי=${crit}) שגיאות-רשת=${lastSnapshot?.errors.length ?? 0} דיסק=${lastSnapshot?.diskUsedPct ?? "?"}%`);
  } catch (e) { console.log(`[voice] tick-error: ${String(e).slice(0, 130)}`); }
}

Bun.serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true, service: "sovereign-voice", version: 3, port: PORT, scans, heals,
        voice: { github: GH_OK ? "חי (Issues אוטומטיים)" : "PAT לא נטען", posta: POSTA_READY ? "מחובר" : "לא-מוגדר" },
        healScope: HEALABLE.map((h) => `${h.id}:${h.port}${"gate" in h && h.gate ? `→afer-${h.gate}` : ""}`),
        disk: { usedPct: diskUsedPct(), warn: DISK_WARN_PCT, act: DISK_ACT_PCT },
        lastSnapshot: lastSnapshot ? { at: lastSnapshot.at, alerts: lastSnapshot.alerts.length, errors: lastSnapshot.errors.length } : null,
        upSec: Math.round((Date.now() - bootedAt) / 1000),
      });
    }
    if (url.pathname === "/scan") { const snap = await scanFleet(); return Response.json({ ok: true, ...snap }); }
    if (url.pathname === "/alerts") {
      const rows = fs.existsSync(ALERTS_FILE) ? fs.readFileSync(ALERTS_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      const st = fs.existsSync(STATE_DIR + "/alert-status.jsonl") ? fs.readFileSync(STATE_DIR + "/alert-status.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      return Response.json({ ok: true, count: rows.length, alerts: rows.slice(-50), deliveries: st.slice(-50) });
    }
    if (url.pathname === "/heals") {
      const rows = fs.existsSync(HEAL_FILE) ? fs.readFileSync(HEAL_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      return Response.json({ ok: true, count: rows.length, heals: rows.slice(-50) });
    }
    if (url.pathname === "/disk") {
      const rows = fs.existsSync(DISK_FILE) ? fs.readFileSync(DISK_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      return Response.json({ ok: true, usedPct: diskUsedPct(), actions: rows.slice(-20) });
    }
    if (url.pathname === "/heal-now") {
      await healPass();
      return Response.json({ ok: true, note: "מפעיל-פנימי רץ — ראה /heals" });
    }
    if (url.pathname === "/send-digest") {
      const snap = lastSnapshot ?? await scanFleet();
      const sent = POSTA_READY ? await sendViaPosta("דוח-צי ריבוני", digestHtml(snap)) : false;
      return Response.json({ ok: true, sent, posta: POSTA_READY, digest: digestHtml(snap) });
    }
    return Response.json({ ok: false, error: "not-found", endpoints: ["/health", "/scan", "/alerts", "/heals", "/disk", "/heal-now", "/send-digest"] }, { status: 404 });
  },
});

console.log(`[voice v3] חי על :${PORT} · סריקה כל ${SCAN_MS / 60_000} דק' · קול-גיטהאב: ${GH_OK ? "חי" : "PAT-חסר"} · מפעיל-פנימי על: ${HEALABLE.map((h) => h.id).join(", ")} · שומר-דיסק: אזעקה-${DISK_WARN_PCT}/טיפול-${DISK_ACT_PCT}`);
void tick();
setInterval(() => void tick(), SCAN_MS);
