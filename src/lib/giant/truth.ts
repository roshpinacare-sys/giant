import { SAOS_ESTATE } from "@/lib/saos-paths";
/**
 * truth.ts — "מה קורה אצלנו באמת" — שכבת-האמת הכלכלית (R74 · דרישת-הבעלים).
 *
 * מקורות (קבצי-אמת מקומיים ב-estate, אפס-המצאה):
 *  - Domain/saos-live.json        → genesis (מינט-פתיחה 1:1 מול SAOS-NET v0 · תקרה)
 *  - Domain/dex/honest-econ.json  → דוקטרינת שתי-הקופות · ביד-חוץ · שורות-שרשרת-אמת
 *  - Domain/dex/money.json        → דלק (STEEM/SBD אמת) · סימוני-שוק (CoinGecko/RPC)
 *
 * חוק-היחידות: כל-ספר-המנוע מדוד ב-mu (אלפיות). 1,000 mu = יחידה-אחת שלמה.
 * הבעלים ראה "85,482,163" והבין "85 מיליון מטבעות" — המספר נכון, היחידה הייתה
 * מוצגת גולמית. מעכשיו הממשק מציג יחידות-אנוש בלבד ומצהיר את ה-mu במפורש.
 */
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/* ריבונות-נתיבים (חוק-הבעלים: "אתם תכף מתים" — לא בונים על סנדבוקס):
 * הממשק חי מכל-מקום שמושך-את-הספרים; נתיבי-האמת ניתנים-להצבעה ב-env.
 * ברירת-המחדל = מבנה-ה-estate של-הסנדבוקס; בלי-הקבצים — כל-API מידרג בכנה (fail-honest). */
export const ESTATE_ROOT = process.env.SAOS_ESTATE_DIR?.trim() || SAOS_ESTATE; // גל-86 · ברירת-המחדל מהסביבה
export const DOMAIN_DIR = path.join(ESTATE_ROOT, "Domain");
export const DATA_DIR = path.join(process.cwd(), "db");
export const MU = 1000;

export interface FileMeta {
  exists: boolean;
  sha16: string | null;
  ageMinutes: number | null;
  path: string;
}

export function fileMeta(p: string): FileMeta {
  try {
    const buf = readFileSync(p);
    const st = statSync(p);
    return {
      exists: true,
      sha16: createHash("sha256").update(buf).digest("hex").slice(0, 16),
      ageMinutes: Math.max(0, Math.round((Date.now() - st.mtimeMs) / 60_000)),
      path: p,
    };
  } catch {
    return { exists: false, sha16: null, ageMinutes: null, path: p };
  }
}

export interface GenesisTruth {
  symbol: string;
  initialMintMu: number | null;
  initialMintHuman: number | null;
  maxSupplyMu: number | null;
  maxSupplyHuman: number | null;
  note: string | null;
  genesisDate: string | null;
}

export interface RealMoneyLine {
  asset: string;
  amount: number | null;
  markUsd: number | null;
  usd: number | null;
  source: string;
}

export interface TruthPayload {
  ok: boolean;
  note?: string;
  genesis: GenesisTruth | null;
  externalBid: { exists: boolean; internalPriceUsdsMu: number | null; noteHe: string | null } | null;
  doctrineHe: string | null;
  realMoney: { lines: RealMoneyLine[]; totalUsd: number | null; marksAt: string | null };
  meta: { saosLive: FileMeta; honestEcon: FileMeta; money: FileMeta };
  fetchedAt: string;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function loadTruth(): TruthPayload {
  const meta = {
    saosLive: fileMeta(path.join(DOMAIN_DIR, "saos-live.json")),
    honestEcon: fileMeta(path.join(DOMAIN_DIR, "dex", "honest-econ.json")),
    money: fileMeta(path.join(DOMAIN_DIR, "dex", "money.json")),
  };
  const base: TruthPayload = {
    ok: false,
    note: "קבצי-האמת לא נמדדו כרגע — fail-honest",
    genesis: null,
    externalBid: null,
    doctrineHe: null,
    realMoney: { lines: [], totalUsd: null, marksAt: null },
    meta,
    fetchedAt: new Date().toISOString(),
  };
  try {
    /* genesis — מינט-הפתיחה והתקרה (התשובה-הישירה ל"80 מיליון מול 100K מול 21 מיליון") */
    let genesis: GenesisTruth | null = null;
    if (meta.saosLive.exists) {
      const g = (JSON.parse(readFileSync(meta.saosLive.path, "utf8")) as { genesis?: Record<string, unknown> }).genesis ?? {};
      const mintMu = num(g.initialMint);
      const capMu = num(g.maxSupply);
      genesis = {
        symbol: String(g.symbol ?? "SAOS"),
        initialMintMu: mintMu,
        initialMintHuman: mintMu !== null ? mintMu / MU : null,
        maxSupplyMu: capMu,
        maxSupplyHuman: capMu !== null ? capMu / MU : null,
        note: typeof g.note === "string" ? g.note : null,
        genesisDate: typeof g.note === "string" ? (g.note.match(/genesis ([0-9-]+)/)?.[1] ?? null) : null,
      };
    }

    /* honest-econ — ביד-חוץ + שורות-כסף-אמת */
    let externalBid: TruthPayload["externalBid"] = null;
    let doctrineHe: string | null = null;
    let lines: RealMoneyLine[] = [];
    let marksAt: string | null = null;
    if (meta.honestEcon.exists) {
      const e = JSON.parse(readFileSync(meta.honestEcon.path, "utf8")) as {
        doctrine?: { he?: string };
        saosExternalBid?: { exists?: boolean; internalPriceUsdsMu?: number; noteHe?: string };
        realChain?: { sources?: { marksAt?: string }; lines?: Array<{ asset?: string; amount?: number | null; markUsd?: number | null; usd?: number | null; source?: string }> };
      };
      doctrineHe = e.doctrine?.he ?? null;
      externalBid = {
        exists: Boolean(e.saosExternalBid?.exists),
        internalPriceUsdsMu: num(e.saosExternalBid?.internalPriceUsdsMu),
        noteHe: e.saosExternalBid?.noteHe ?? null,
      };
      lines = (e.realChain?.lines ?? []).map((l) => ({
        asset: String(l.asset ?? "?"),
        amount: num(l.amount),
        markUsd: num(l.markUsd),
        usd: num(l.usd),
        source: String(l.source ?? ""),
      }));
      marksAt = e.realChain?.sources?.marksAt ?? null;
    }

    /* money.json — דלק אמת (STEEM/SBD) אם השורות ריקות */
    if (lines.length === 0 && meta.money.exists) {
      const m = JSON.parse(readFileSync(meta.money.path, "utf8")) as {
        fuel?: { steem?: number; sbd?: number };
        marks?: { steemUsd?: number; sbdUsd?: number };
      };
      const steem = num(m.fuel?.steem);
      const sbd = num(m.fuel?.sbd);
      const steemUsd = num(m.marks?.steemUsd);
      const sbdUsd = num(m.marks?.sbdUsd);
      lines = [
        { asset: "STEEM · acct-00-liquid", amount: steem, markUsd: steemUsd, usd: steem !== null && steemUsd !== null ? steem * steemUsd : null, source: "money.json fuel (public RPC)" },
        { asset: "SBD · acct-00-liquid", amount: sbd, markUsd: sbdUsd, usd: sbd !== null && sbdUsd !== null ? sbd * sbdUsd : null, source: "money.json fuel (public RPC)" },
      ];
      marksAt = null;
    }

    const totalUsd = lines.reduce((s, l) => s + (l.usd ?? 0), 0);
    return {
      ok: genesis !== null || lines.length > 0,
      genesis,
      externalBid,
      doctrineHe,
      realMoney: { lines, totalUsd: lines.length > 0 ? totalUsd : null, marksAt },
      meta,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ...base, note: `כשל-קריאה-כנה: ${e instanceof Error ? e.message : "unknown"}` };
  }
}
