/* ═══ sovereign-voice v2 · פורט 3019 · קול-ריבוני + מפעיל-פנימי ══════════════
 * תורת-הבעלים (עדכון 2026-10-18): "אני לא מעביר סיסמאות — פתור בעצמך. אני רוצה
 * שהריבונות תנהל את עצמה ולא תחכה לי כמפעיל פנימי."
 *
 * v2 על גבי v1 (סריקות+אזעקות-גיט):
 *  · קול-גיטהאב: אזעקות-קריטי נפתחות כ-Issues על giant.git עם PAT-המשמורת
 *    הקיים (upload/pat.env — לעולם לא מודפס). אפס-נתן-חדש, אפס-סיסמאות-מהבעלים.
 *    דה-דופ: אותו-מפתח-אזעקה לא פותח אישוא-חוזר תוך 6 שעות (state/issue-map.json)
 *  · מפעיל-פנימי: ריפוי-עצמי של השירותים שלנו (גשר 3017 · צבא 3018 ·
 *    boot-verifier 3042) — אם /health נכשל פעמיים ברצף → respawn בדפוס-
 *    האימוץ (setsid nohup) → אימות-אחרי-10ש׳ → רישום-מעשה ותוצאה ב-heal-log.
 *    ליבה (כלכלה 3016 · בורסה 3010/3013) לא-נוגעים — יש להם חוקי-משמורת
 *    ומפקחי-אחוזה משלהם; respawn-כפול = סכנת-כותב-כפול.
 *  · Posta נשאר תפר-אופציונלי (POSTA_* env) — ערוץ-נוסף, לא-תנאי.
 *
 * אפס-סינתזה: כל-אזעקה וכל-ריפוי נרשמים עם עדות (מה נבדק, מה נמדד, מה נעשה).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 3019;
const SCAN_MS = 5 * 60_000;
const SEAL_STALL_MS = 30 * 60_000;
const ALERT_COOLDOWN_MS = 30 * 60_000;
const ISSUE_DEDUP_MS = 6 * 60 * 60_000;
const CONSECUTIVE_FAILS_TO_HEAL = 2;

const FLEET = {
  economy: "http://127.0.0.1:3016",
  dex: "http://127.0.0.1:3013/saos-dex/api/dex",
  bridge: "http://127.0.0.1:3017",
  army: "http://127.0.0.1:3018",
};

/* ── שירותים שלנו שמותר לרפא (בעלות-מלאה, בלי-סיכון-כותב-כפול) ── */
const HEALABLE = [
  { id: "bridge", port: 3017, dir: path.join(import.meta.dir, "..", "dex-economy-bridge"), log: "bridge.log" },
  { id: "army", port: 3018, dir: path.join(import.meta.dir, "..", "soldier-army"), log: "army.log" },
  { id: "boot-verifier", port: 3042, dir: path.join(import.meta.dir, "..", "boot-verifier"), log: "node.log" },
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
const ISSUE_MAP_FILE = path.join(STATE_DIR, "issue-map.json");
fs.mkdirSync(STATE_DIR, { recursive: true });
const issueMap: Record<string, { ts: number; issue?: number }> = (() => {
  try { return JSON.parse(fs.readFileSync(ISSUE_MAP_FILE, "utf8")); } catch { return {}; }
})();
function saveIssueMap(): void { try { fs.writeFileSync(ISSUE_MAP_FILE, JSON.stringify(issueMap)); } catch { /* כנה */ } }

type Alert = { ts: number; key: string; sev: "critical" | "warn"; text: string; status: string; issue?: number };
const lastAlertAt: Record<string, number> = {};

/* קול-גיטהאב: אישוא-אסקלציה (קריטי-בלבד) — דה-דופ-6ש׳ לפי מפתח */
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
    console.log(`[voice] פתיחת-אישוא נכשלה: ${r.status} ${JSON.stringify(d).slice(0, 100)}`);
  } catch (e) { console.log(`[voice] issue-שגיאה: ${String(e).slice(0, 100)}`); }
  return null;
}

function emitAlert(key: string, sev: Alert["sev"], text: string): Alert | null {
  const now = Date.now();
  if (lastAlertAt[key] && now - lastAlertAt[key] < ALERT_COOLDOWN_MS) return null;
  lastAlertAt[key] = now;
  const a: Alert = { ts: now, key, sev, text, status: "ledger" };
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(a) + "\n");
  void (async () => {
    if (sev === "critical") {
      const n = await openIssue(key, text);
      if (n) a.status = "github-issue", a.issue = n;
    }
    if (POSTA_READY && (sev === "critical" || key.startsWith("economy"))) {
      const ok = await sendViaPosta(`[${sev === "critical" ? "קריטי" : "אזעקה"}] ${key}`, `<p>${text}</p>`);
      if (ok) a.status = a.issue ? `${a.status}+posta` : "posta";
    }
    fs.appendFileSync(STATE_DIR + "/alert-status.jsonl", JSON.stringify({ ts: Date.now(), key, status: a.status, issue: a.issue ?? null }) + "\n");
  })();
  return a;
}

/* חוזה-Posta הרשמי (אופציונלי) */
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

/* ── מפעיל-פנימי: ריפוי-עצמי בדפוס-האימוץ (אותו-דפוס שהוכיח-הישרדות) ── */
const failStreak: Record<string, number> = {};
function respawn(svc: { id: string; dir: string; log: string }): boolean {
  try {
    const logfile = path.join(svc.dir, svc.log);
    const child = spawn("bash", ["-c", `cd '${svc.dir}' && setsid nohup bun run dev >> '${logfile}' 2>&1 </dev/null &`], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch (e) { console.log(`[voice] respawn-שגיאה ${svc.id}: ${String(e).slice(0, 90)}`); return false; }
}
async function healPass(): Promise<void> {
  for (const svc of HEALABLE) {
    let alive = false;
    try { await jget(`http://127.0.0.1:${svc.port}/health`, 4000); alive = true; } catch { alive = false; }
    if (alive) { failStreak[svc.id] = 0; continue; }
    failStreak[svc.id] = (failStreak[svc.id] ?? 0) + 1;
    if (failStreak[svc.id] >= CONSECUTIVE_FAILS_TO_HEAL) {
      const ok = respawn(svc);
      let verified = false;
      await new Promise((r) => setTimeout(r, 10_000));
      try { await jget(`http://127.0.0.1:${svc.port}/health`, 4000); verified = true; } catch { verified = false; }
      failStreak[svc.id] = verified ? 0 : failStreak[svc.id];
      const rec = { ts: Date.now(), svc: svc.id, action: "respawn", spawned: ok, verified, fails: failStreak[svc.id] };
      fs.appendFileSync(HEAL_FILE, JSON.stringify(rec) + "\n");
      console.log(`[voice] ריפוי ${svc.id}: respawn=${ok} verified=${verified}`);
      emitAlert(verified ? `healed-${svc.id}` : `heal-failed-${svc.id}`, verified ? "warn" : "critical",
        `מפעיל-פנימי: ${svc.id}:${svc.port} נפל (${rec.fails} כשלים) → respawn=${ok} → verified=${verified}`);
    }
  }
}

type Snapshot = { at: number; economy: any; verify: any; dex: any; bridge: any; army: any; alerts: Alert[]; errors: string[] };
let lastSnapshot: Snapshot | null = null;

async function scanFleet(): Promise<Snapshot> {
  const snap: Snapshot = { at: Date.now(), economy: null, verify: null, dex: null, bridge: null, army: null, alerts: [], errors: [] };

  try {
    snap.economy = await jget(`${FLEET.economy}/health`);
    if (!snap.economy?.ok) snap.alerts.push(emitAlert("economy-down", "critical", `נוד-הכלכלה עונה ok=false: ${JSON.stringify(snap.economy).slice(0, 150)}`) ?? null);
    try {
      snap.verify = await jget(`${FLEET.economy}/verify`, 12_000);
      if (snap.verify && snap.verify.ok === false) snap.alerts.push(emitAlert("ledger-verify", "critical", `אימות-שרשרת נכשל: ${JSON.stringify(snap.verify).slice(0, 200)}`) ?? null);
      /* חוק-תקרית-20261018: verify-ok-ללא-עוגנים = רגנזיס-שקטה (הספר-הקנוני-אבד-מבלי-שאף-אזעקה-תרים) */
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
    snap.alerts.push(emitAlert("economy-unreachable", "critical", `נוד-הכלכלה :3016 לא מגיב — הלב עצור? (ריפוי-ידני-בלבד: משמורת-ספר)`) ?? null);
  }

  try {
    snap.dex = await jget(`${FLEET.dex}/state`);
    const dst = snap.dex?.state ?? snap.dex;
    if (dst?.halted) snap.alerts.push(emitAlert("dex-halted", "critical", `הבורסה עצורה: ${dst?.haltReason ?? snap.dex?.haltReason ?? "?"}`) ?? null);
    else if (dst && dst.dbOk === false) snap.alerts.push(emitAlert("dex-db", "critical", "dbOk=false — מסד-השרשרת פגום") ?? null);
  } catch (e) { snap.errors.push(`dex: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("dex-unreachable", "critical", "הבורסה :3013 לא מגיבה") ?? null); }

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

  snap.alerts = snap.alerts.filter(Boolean) as Alert[];
  lastSnapshot = snap;
  return snap;
}
let bridgeErrSeen: number | null = null;

function digestHtml(snap: Snapshot): string {
  const e = snap.economy, d = snap.dex, a = snap.army, b = snap.bridge;
  const f = (a?.soldiers ?? []).reduce((t: number, s: any) => t + Number(s.filledMu ?? 0), 0);
  return `<h2>דוח-צי ריבוני · ${new Date(snap.at).toISOString()}</h2>
<ul>
<li><b>כלכלה</b>: ${e ? `seq=${e.seq} · uptime=${Math.round((e.uptimeMs ?? 0) / 60_000)} דק' · verify=${snap.verify ? (snap.verify.ok ? `ok (checked=${snap.verify.checked})` : "נכשל!") : "לא-נבדק"}` : "לא מגיב!"}</li>
<li><b>בורסה</b>: ${d ? `h=${d.state?.height ?? d.height} · halted=${d.state?.halted ?? d.halted} · fills=${Number(d.state?.fills ?? d.fills ?? 0).toLocaleString()}` : "לא מגיב!"}</li>
<li><b>גשר</b>: ${b ? `inserted=${b.inserted} · errors=${b.errors}` : "לא מגיב!"}</li>
<li><b>חיילים</b>: ${a ? `anchor=${a.market?.anchor} · מילויים-מצטבר=${f.toLocaleString()}µ · מחזורים=${a.cycles}` : "לא מגיב!"}</li>
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
    console.log(`[voice] סריקה #${scans}: אזעקות=${lastSnapshot?.alerts.length ?? 0} (קריטי=${crit}) שגיאות-רשת=${lastSnapshot?.errors.length ?? 0}`);
  } catch (e) { console.log(`[voice] tick-error: ${String(e).slice(0, 130)}`); }
}

Bun.serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true, service: "sovereign-voice", version: 2, port: PORT, scans, heals,
        voice: { github: GH_OK ? "חי (Issues אוטומטיים)" : "PAT לא נטען", posta: POSTA_READY ? "מחובר" : "לא-מוגדר" },
        healScope: HEALABLE.map((h) => `${h.id}:${h.port}`),
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
    if (url.pathname === "/heal-now") {
      await healPass();
      return Response.json({ ok: true, note: "מפעיל-פנימי רץ — ראה /heals" });
    }
    if (url.pathname === "/send-digest") {
      const snap = lastSnapshot ?? await scanFleet();
      const sent = POSTA_READY ? await sendViaPosta("דוח-צי ריבוני", digestHtml(snap)) : false;
      return Response.json({ ok: true, sent, posta: POSTA_READY, digest: digestHtml(snap) });
    }
    return Response.json({ ok: false, error: "not-found", endpoints: ["/health", "/scan", "/alerts", "/heals", "/heal-now", "/send-digest"] }, { status: 404 });
  },
});

console.log(`[voice v2] חי על :${PORT} · סריקה כל ${SCAN_MS / 60_000} דק' · קול-גיטהאב: ${GH_OK ? "חי" : "PAT-חסר"} · מפעיל-פנימי על: ${HEALABLE.map((h) => h.id).join(", ")}`);
void tick();
setInterval(() => void tick(), SCAN_MS);
