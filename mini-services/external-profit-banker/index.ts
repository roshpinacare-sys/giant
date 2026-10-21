/* ═══ external-profit-banker · פורט 3025 · גל-95 (2026-10-21) ═══
 * ==============================================================================
 * פקודת-הבעלים (trace 1a15ceb5c5659485): "אל-תעצור-עד-שיש-תוכנית-רווח-חוץ-מוכחת-
 * ולא-אפס · ההחלפות-על-הרשת-שלנו-ולהוכיח".
 *
 * מה-הוא: הגשר-הכנה בין אמת-השרשרת-החוץ לבין ה-ledger של fleet-economy (:3016).
 *
 * חוקי-אמת (LAW-3 · אפס-טענות, רק-מדידות):
 *  · מקור-1 (כל-3 דק'): grids/external-profit.mjs --measure — סריקת-היסטוריית-שרשרת
 *    ציבורית (אפס-מפתחות): curation_reward + author_reward.vesting_payout = התגשמות-
 *    VESTS עם block+provenance. תמחור: vestSteem (יחס-שרשרת) × sbdPerSteem (median-
 *    oracle) × מסילת-מחיר-חוץ (mexc→gate→kraken→cryptocompare). כשל-מסילה = usd:null
 *    = לא-נבנק (אין-מספרים-מומצאים).
 *  · מקור-2 (כל-30 דק'): grids/pnl-audit.mjs — רווח-מרק-שוק ממילויי-fill_order אמת
 *    על ספר-STEEM הציבורי, מודע-חצייה-עצמית (self-cross=אפס-דלתא). מה-שנבנק: רק
 *    הרכיב-הממומש (ΔpnlSbd מנוכה-ה-MTM-של-המלאי-המוחזק). הפסד = לא-נבנק-כרווח
 *    (נרשם-בכנות בלוג וב-/health; האמת-המלאה תמיד ב-pnl-audit.json הציבורי).
 *  · בנקאות: POST fleet-economy/tx/ingest — kind=external-profit · from=external-world
 *    · to=treasury · reason=ראיות-txid/block/opHash/תמחור · ref=extprof-<opHash>
 *    (dedup-כפול: גם-אצלי וגם-אצל הכלכלה — ריצה-כפולה לא משכפלת).
 *  · אפס-עמלות-פנימיות-כרווח-חוץ: dex-fee מהבוטים-שלנו על הדקס-שלנו זו צמיחה-פנימית
 *    ולעולם לא עוברת במסילה הזו.
 *  · אפס-סודות: השירות קורא-ציבורי-בלבד. אין-מפתחות, אין-חתימה, אין-שידור.
 * ============================================================================== */
import { execFile } from "child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { createHash } from "crypto";

const PORT = 3025;
const DEX_ROOT = "/home/z/work/saos-dex";
const EVIDENCE = `${DEX_ROOT}/grids/state/external-profit.jsonl`;
const PNLAUDIT = `${DEX_ROOT}/grids/state/pnl-audit.json`;
const STATE_DIR = "/home/z/my-project/mini-services/external-profit-banker/state";
const BANKED_HASHES = `${STATE_DIR}/banked-ophashes.json`;
const BANKED_PNL = `${STATE_DIR}/banked-pnl.json`;
const BANK_LOG = `${STATE_DIR}/bank-log.jsonl`;
const ECONOMY = "http://127.0.0.1:3016";
const MEASURE_EVERY_MS = 180_000;
const PNLAUDIT_EVERY_MS = 1_800_000;

mkdirSync(STATE_DIR, { recursive: true });

type BankedHashes = Record<string, number>;
type PnlSnap = { bankedSbd: number; lastMid: number | null; lastInvSteem: number; lastAt: string };

function loadJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return fallback; }
}
function saveJson(p: string, v: unknown) {
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 1) + "\n");
  try { require("fs").renameSync(tmp, p); } catch { writeFileSync(p, JSON.stringify(v, null, 1) + "\n"); }
}
const log = (o: Record<string, unknown>) => { try { appendFileSync(BANK_LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n"); } catch { } };

const counters = {
  bootedAt: Date.now(), measureRuns: 0, measureErrors: 0, entriesSeen: 0, entriesUnpriced: 0,
  banked: 0, bankedDedup: 0, bankedUsds: 0, pnlRuns: 0, pnlErrors: 0, pnlBanked: 0, pnlLossesSkipped: 0,
  economyRejected: 0, lastMeasureAt: null as string | null, lastPnlAt: null as string | null, lastError: null as string | null,
};

async function bank(amountUsds: number, reason: string, ref: string): Promise<{ ok: boolean; why?: string; dedup?: boolean; seq?: number }> {
  try {
    const r = await fetch(`${ECONOMY}/tx/ingest`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "external-profit", from: "external-world", to: "treasury", asset: "USDS", amount: Math.max(amountUsds, 1e-9), reason, ref }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json() as { ok: boolean; dedup?: boolean; seq?: number; error?: string };
    if (j.ok) { counters.banked++; counters.bankedUsds += amountUsds; if (j.dedup) counters.bankedDedup++; return { ok: true, dedup: j.dedup, seq: j.seq }; }
    counters.economyRejected++; counters.lastError = j.error ?? "rejected";
    return { ok: false, why: j.error ?? "rejected" };
  } catch (e) { counters.economyRejected++; counters.lastError = String(e); return { ok: false, why: String(e).slice(0, 80) }; }
}

/* ── מקור-1: התגשמות-VESTS (curation/author) — כל-אירוע עם הראיה-שלו ───────── */
async function measureAndBank(): Promise<{ fresh: number; banked: number; unpriced: number; usds: number }> {
  counters.measureRuns++;
  await new Promise<void>((res) => execFile("node", ["grids/external-profit.mjs", "--measure"], { cwd: DEX_ROOT, timeout: 170_000 }, (err) => { if (err) counters.lastError = `measure: ${String(err).slice(0, 100)}`; res(); }));
  const banked = loadJson<BankedHashes>(BANKED_HASHES, {});
  let fresh = 0, bankedNow = 0, unpriced = 0, usds = 0;
  const lines = readFileSync(EVIDENCE, "utf8").split("\n");
  for (const ln of lines) {
    if (!ln.trim()) continue;
    let e: any; try { e = JSON.parse(ln); } catch { continue; }
    if (e.kind !== "curation" && e.kind !== "author-vests") continue; // רווח-התגשמות-בלבד (fills=ראיה, transfers=קרן)
    counters.entriesSeen++;
    const opHash = String(e.opHash ?? `${e.block}:${e.kind}:${e.ts}:${e.vests}`);
    if (banked[opHash]) continue;
    fresh++;
    if (!(typeof e.usd === "number" && e.usd > 0)) { unpriced++; counters.entriesUnpriced++; continue; } // fail-honest: אין-תמחור=אין-בנקאות
    const ref = `extprof-${createHash("sha1").update(opHash).digest("hex").slice(0, 16)}`;
    const reason = `רווח-חוץ·${e.kind}·${e.account}·${Number(e.vests).toFixed(6)}VESTS·block:${e.block}·prov:${String(e.provenance ?? "").slice(0, 80)}·price:vestSteem=${Number(e.priced?.vestSteem ?? 0).toPrecision(8)},src=${e.priced?.extSource ?? "?"}`;
    const r = await bank(e.usd, reason, ref);
    if (r.ok) {
      banked[opHash] = Date.now(); bankedNow++; usds += e.usd;
      log({ kind: "accrual-banked", opHash, usd: e.usd, ref, seq: r.seq ?? null, dedup: r.dedup ?? false });
    }
  }
  // שמירת-מצב עם גבול (8K אחרונים)
  const keys = Object.keys(banked);
  if (keys.length > 8_000) for (const k of keys.slice(0, keys.length - 8_000)) delete banked[k];
  saveJson(BANKED_HASHES, banked);
  return { fresh, banked: bankedNow, unpriced, usds };
}

/* ── מקור-2: רווח-ממומש ממילויי-הספר-הציבורי (מנוכה-MTM-מלאי) ─────────────── */
async function pnlAuditAndBank(): Promise<{ realizedSbd: number; banked: boolean; usd: number | null }> {
  counters.pnlRuns++;
  await new Promise<void>((res) => execFile("node", ["grids/pnl-audit.mjs"], { cwd: DEX_ROOT, timeout: 600_000 }, (err) => { if (err) counters.lastError = `pnl: ${String(err).slice(0, 100)}`; res(); }));
  const a = loadJson<any>(PNLAUDIT, null);
  if (!a?.engineEra?.perAccount) return { realizedSbd: 0, banked: false, usd: null };
  const prev = loadJson<PnlSnap>(BANKED_PNL, { bankedSbd: 0, lastMid: null, lastInvSteem: 0, lastAt: new Date(0).toISOString() });
  const mid = typeof a.mid === "number" ? a.mid : null;
  let invSteem = 0, pnlSbd = 0, realFills = 0;
  for (const v of Object.values<any>(a.engineEra.perAccount)) { invSteem += Number(v.dSteem ?? 0); pnlSbd += Number(v.pnlSbd ?? 0); realFills += Number(v.fills ?? 0) - Number(v.selfCrosses ?? 0); }
  let realizedSbd = 0;
  if (mid != null && prev.lastMid != null) {
    // ΔpnlSbd = realized(Δflows×mid_new) + MTM(prevInv×Δmid) → realized = ΔpnlSbd − MTM
    const delta = pnlSbd - prev.bankedSbd;
    const mtm = prev.lastInvSteem * (mid - prev.lastMid);
    realizedSbd = delta - mtm;
  }
  saveJson(BANKED_PNL, { bankedSbd: pnlSbd, lastMid: mid, lastInvSteem: invSteem, lastAt: new Date().toISOString() });
  counters.lastPnlAt = new Date().toISOString();
  if (!(realizedSbd > 0)) { if (realizedSbd < -1e-9) counters.pnlLossesSkipped++; log({ kind: "pnl-not-banked", realizedSbd: +realizedSbd.toFixed(9), reason: realizedSbd < 0 ? "loss-honest" : "no-positive-delta", realFills, mid }); return { realizedSbd, banked: false, usd: null }; }
  // תמחור SBD→USD: 1 SBD = sbdPerSteem STEEM (median-oracle) → sbdUsd = steemUsd / sbdPerSteem
  let usd: number | null = null, pricing = "";
  try {
    const { measureExternalUsd, measureChainOracle } = await import(`${DEX_ROOT}/grids/external-profit.mjs`);
    const [ext, oracle] = await Promise.all([measureExternalUsd(), measureChainOracle()]);
    if (ext.steemUsd != null && oracle.sbdPerSteem > 0) { usd = realizedSbd * (ext.steemUsd / oracle.sbdPerSteem); pricing = `sbdUsd=steemUsd(${ext.steemUsd})/sbdPerSteem(${oracle.sbdPerSteem.toPrecision(6)})·src=${ext.source}`; }
  } catch { /* fail-honest */ }
  if (usd == null || !(usd > 0)) { log({ kind: "pnl-unpriced-honest", realizedSbd: +realizedSbd.toFixed(9) }); return { realizedSbd, banked: false, usd: null }; }
  const ref = `extprof-pnl-${createHash("sha1").update(`${Date.now()}:${realizedSbd}`).digest("hex").slice(0, 16)}`;
  const r = await bank(usd, `רווח-חוץ·realmarket-grid·realFills:${realFills}·realizedSbd:${realizedSbd.toFixed(9)}·mid:${mid?.toPrecision(8)}·${pricing}`, ref);
  if (r.ok) { counters.pnlBanked++; log({ kind: "pnl-banked", realizedSbd: +realizedSbd.toFixed(9), usd, ref, seq: r.seq ?? null }); return { realizedSbd, banked: true, usd }; }
  return { realizedSbd, banked: false, usd };
}

/* ── לולאות ── */
let lastMeasure: any = null, lastPnl: any = null, measureBusy = false, pnlBusy = false;
async function measureLoop() {
  if (measureBusy) return; measureBusy = true;
  try { lastMeasure = await measureAndBank(); counters.lastMeasureAt = new Date().toISOString(); }
  catch (e) { counters.measureErrors++; counters.lastError = String(e).slice(0, 120); }
  finally { measureBusy = false; }
}
async function pnlLoop() {
  if (pnlBusy) return; pnlBusy = true;
  try { lastPnl = await pnlAuditAndBank(); }
  catch (e) { counters.pnlErrors++; counters.lastError = String(e).slice(0, 120); }
  finally { pnlBusy = false; }
}

setInterval(() => void measureLoop(), MEASURE_EVERY_MS);
setInterval(() => void pnlLoop(), PNLAUDIT_EVERY_MS);
setTimeout(() => void measureLoop(), 3_000);   // מחזור-ראשון מיד
setTimeout(() => void pnlLoop(), 30_000);      // pnl-audit אחרי-30ש׳ (כבד)

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "external-profit-banker", port: PORT, counters, lastMeasure, lastPnl, law: "רווח-חוץ=מדידה-מהשרשרת-עם-txid בלבד · הפסדים לא נבנקים · אין-מספרים-מומצאים" });
    if (url.pathname === "/run-once" && req.method === "POST") { void measureLoop(); void pnlLoop(); return Response.json({ ok: true, note: "triggered" }); }
    return new Response("not found", { status: 404 });
  },
});
console.log(`[external-profit-banker] חי על :${PORT} — מדידה כל ${MEASURE_EVERY_MS / 1000}s · pnl-audit כל ${PNLAUDIT_EVERY_MS / 60000}min`);
