/* ═══ sovereign-voice · פורט 3019 · קול-ריבוני חוץ-סנדבוקסי ═════════════════
 * תורת-הבעלים: הסנדבוקס נמחק בכל רגע — לגיט יש זיכרון-חוץ, לצי לא היה קול-חוץ.
 * Posta (github.com/goposta/posta) = פלטפורמת-מייל self-hosted — הערוץ הזה
 * נבנה כתפר-אליה: כש-POSTA_URL+POSTA_API_KEY+POSTA_TO מוגדרים → כל אזעקה
 * ודוח יוצאים במייל אמיתי (חוזה: POST /api/v1/emails/send, Bearer).
 * עד-אז: אפס-סינתזה — אזעקות נאגרות בקובץ-גיט (state/alerts.jsonl) עם
 * status=pending-posta, כלום לא הולך לאיבוד, וה-/health כנה על המצב.
 *
 * מה נסרק (עדויות, לא טענות):
 *  · כלכלה :3016 — /health (חי? seq) + /verify (שרשרת תקינה?) + אטימה אחרונה
 *  · DEX :3013 — halted / dbOk / rejectedLast
 *  · גשר :3017 — errors חדשים
 *  · צבא :3018 — lastErr מתמשך, מילויים
 *  · עצירת-אטימה: lastSeal ישן מ-30 דקות
 */
import fs from "node:fs";
import path from "node:path";

const PORT = 3019;
const SCAN_MS = 5 * 60_000;
const SEAL_STALL_MS = 30 * 60_000;
const ALERT_COOLDOWN_MS = 30 * 60_000; // אותו-מפתח-אזעקה לא מוצף

const FLEET = {
  economy: "http://127.0.0.1:3016",
  dex: "http://127.0.0.1:3013/saos-dex/api/dex",
  bridge: "http://127.0.0.1:3017",
  army: "http://127.0.0.1:3018",
};

const POSTA_URL = process.env.POSTA_URL ?? "";
const POSTA_API_KEY = process.env.POSTA_API_KEY ?? "";
const POSTA_FROM = process.env.POSTA_FROM ?? "sovereign-fleet@roshpinacare-sys";
const POSTA_TO = (process.env.POSTA_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const POSTA_READY = !!(POSTA_URL && POSTA_API_KEY && POSTA_TO.length);

const STATE_DIR = path.join(import.meta.dir, "state");
const ALERTS_FILE = path.join(STATE_DIR, "alerts.jsonl");
fs.mkdirSync(STATE_DIR, { recursive: true });

type Alert = { ts: number; key: string; sev: "critical" | "warn"; text: string; status: string };
const lastAlertAt: Record<string, number> = {};

function emitAlert(key: string, sev: Alert["sev"], text: string): Alert | null {
  const now = Date.now();
  if (lastAlertAt[key] && now - lastAlertAt[key] < ALERT_COOLDOWN_MS) return null;
  lastAlertAt[key] = now;
  const a: Alert = { ts: now, key, sev, text, status: POSTA_READY ? "sent-posta" : "pending-posta" };
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(a) + "\n");
  if (POSTA_READY) void sendViaPosta(`[${sev === "critical" ? "קריטי" : "אזעקה"}] ${key}`, text).then((ok) => {
    if (!ok) a.status = "posta-failed";
  });
  return a;
}

/* חוזה-Posta הרשמי: POST {URL}/api/v1/emails/send · Bearer API key */
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
    const ok = r.ok && d?.id;
    console.log(`[voice] posta ${ok ? "נשלח" : "נכשל"}: ${r.status} ${JSON.stringify(d).slice(0, 100)}`);
    return ok;
  } catch (e) { console.log(`[voice] posta-שגיאה: ${String(e).slice(0, 110)}`); return false; }
}

async function jget(url: string, ms = 6000): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

type Snapshot = {
  at: number; economy: any; verify: any; dex: any; bridge: any; army: any;
  alerts: Alert[]; errors: string[];
};
let lastSnapshot: Snapshot | null = null;

async function scanFleet(): Promise<Snapshot> {
  const snap: Snapshot = { at: Date.now(), economy: null, verify: null, dex: null, bridge: null, army: null, alerts: [], errors: [] };

  /* כלכלה — הלב */
  try {
    snap.economy = await jget(`${FLEET.economy}/health`);
    if (!snap.economy?.ok) snap.alerts.push(emitAlert("economy-down", "critical", `נוד-הכלכלה עונה ok=false: ${JSON.stringify(snap.economy).slice(0, 150)}`) ?? null);
    try {
      snap.verify = await jget(`${FLEET.economy}/verify`, 12_000);
      if (snap.verify && snap.verify.ok === false) snap.alerts.push(emitAlert("ledger-verify", "critical", `אימות-שרשרת נכשל: ${JSON.stringify(snap.verify).slice(0, 200)}`) ?? null);
    } catch (e) { snap.errors.push(`verify: ${String(e).slice(0, 60)}`); }
    try {
      const m = await jget(`${FLEET.economy}/metrics`);
      const lastSeal = m?.lastSeal?.at ? Date.parse(m.lastSeal.at) : 0;
      if (lastSeal && Date.now() - lastSeal > SEAL_STALL_MS) {
        const min = Math.round((Date.now() - lastSeal) / 60_000);
        snap.alerts.push(emitAlert("seal-stall", "critical", `איטום-כספת תקוע — sweep אחרון לפני ${min} דק'`) ?? null);
      }
    } catch { /* metrics כבר נבדק ב-health */ }
  } catch (e) {
    snap.errors.push(`economy: ${String(e).slice(0, 60)}`);
    snap.alerts.push(emitAlert("economy-unreachable", "critical", `נוד-הכלכלה :3016 לא מגיב — הלב עצור?`) ?? null);
  }

  /* DEX — הבורסה · המצב מקונן תחת state (ראיה: /state = {ok, state:{height,halted,dbOk,...}}) */
  try {
    snap.dex = await jget(`${FLEET.dex}/state`);
    const dst = snap.dex?.state ?? snap.dex;
    if (dst?.halted) snap.alerts.push(emitAlert("dex-halted", "critical", `הבורסה עצורה: ${dst?.haltReason ?? snap.dex?.haltReason ?? "?"}`) ?? null);
    else if (dst && dst.dbOk === false) snap.alerts.push(emitAlert("dex-db", "critical", "dbOk=false — מסד-השרשרת פגום") ?? null);
  } catch (e) { snap.errors.push(`dex: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("dex-unreachable", "critical", "הבורסה :3013 לא מגיבה") ?? null); }

  /* גשר — מעגל-האמת */
  try {
    snap.bridge = await jget(`${FLEET.bridge}/health`);
    if (snap.bridge && Number(snap.bridge.errors ?? 0) > 0) {
      const n = Number(snap.bridge.errors);
      if (n > (bridgeErrSeen ?? 0)) snap.alerts.push(emitAlert("bridge-errors", "warn", `גשר-דקס→כלכלה: ${n} שגיאות (היה ${bridgeErrSeen ?? 0})`) ?? null);
      bridgeErrSeen = n;
    }
  } catch (e) { snap.errors.push(`bridge: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("bridge-unreachable", "warn", "הגשר :3017 לא מגיב") ?? null); }

  /* צבא-החיילים */
  try {
    snap.army = await jget(`${FLEET.army}/status`);
    const errs = (snap.army?.soldiers ?? []).filter((s: any) => s?.lastErr);
    if (errs.length) snap.alerts.push(emitAlert("army-errors", "warn", `חיילים עם שגיאה: ${errs.map((s: any) => `${s.id}:${String(s.lastErr).slice(0, 50)}`).join(" · ")}`) ?? null);
  } catch (e) { snap.errors.push(`army: ${String(e).slice(0, 60)}`); snap.alerts.push(emitAlert("army-unreachable", "warn", "צבא-החיילים :3018 לא מגיב") ?? null); }

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
<li><b>Posta</b>: ${POSTA_READY ? "מחובר — מייל יוצא" : "לא מוגדר (POSTA_URL/API_KEY/TO) — אזעקות נאגרות בגיט"}</li>
<li><b>שגיאות-סריקה</b>: ${snap.errors.length ? snap.errors.join(" · ") : "אפס"}</li>
</ul>`;
}

let scans = 0, bootedAt = Date.now();
async function tick(): Promise<void> {
  try {
    await scanFleet();
    scans++;
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
        ok: true, service: "sovereign-voice", port: PORT, scans,
        posta: { ready: POSTA_READY, url: POSTA_URL || null, to: POSTA_TO.length ? `${POSTA_TO.length} נמענים` : null },
        alertsFile: fs.existsSync(ALERTS_FILE) ? fs.readFileSync(ALERTS_FILE, "utf8").trim().split("\n").filter(Boolean).length : 0,
        lastSnapshot: lastSnapshot ? { at: lastSnapshot.at, alerts: lastSnapshot.alerts.length, errors: lastSnapshot.errors.length } : null,
        upSec: Math.round((Date.now() - bootedAt) / 1000),
      });
    }
    if (url.pathname === "/scan") {
      const snap = await scanFleet();
      return Response.json({ ok: true, ...snap });
    }
    if (url.pathname === "/alerts") {
      const rows = fs.existsSync(ALERTS_FILE) ? fs.readFileSync(ALERTS_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      return Response.json({ ok: true, count: rows.length, alerts: rows.slice(-50) });
    }
    if (url.pathname === "/send-digest") {
      const snap = lastSnapshot ?? await scanFleet();
      const sent = await sendViaPosta("דוח-צי ריבוני", digestHtml(snap));
      return Response.json({ ok: true, sent, posta: POSTA_READY, digest: digestHtml(snap) });
    }
    return Response.json({ ok: false, error: "not-found", endpoints: ["/health", "/scan", "/alerts", "/send-digest"] }, { status: 404 });
  },
});

console.log(`[voice] חי על :${PORT} · סריקה כל ${SCAN_MS / 60_000} דק' · Posta: ${POSTA_READY ? "מחובר" : "לא-מוגדר — אזעקות לגיט (אפס-סינתזה)"}`);
void tick();
setInterval(() => void tick(), SCAN_MS);
