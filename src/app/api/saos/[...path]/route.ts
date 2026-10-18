import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * גשר-ה-API בין-הסוכנים (cross-agent bridge) — 2026-10-17 · agent-zai (Lane A/RUN-LANE)
 * =====================================================================================
 * המדידה: הסנדבוקס חושף פורט-אחד בלבד (3000 = האפליקציה הזו), אבל אפליקציות-אחיות
 * של סוכנים אחרים רצות על פורטים פנימיים (saos-sovereign-platform :3100,
 * saos-sovereign-foundry :3200) וה-UI שלהן קורא נתיבים יחסיים `/api/saos/*`
 * שנוחתים כאן בלי פרמטר-XTransformPort → ~2,700 בקשות מתו 404 (dev.log מדוד).
 *
 * הפתרון: העברה שקופה עם מדורג-נפילה (platform → foundry על 404).
 * אמת-כנה: upstream לא-נגיש = 502 עם הסיבה האמיתית — לעולם לא נתון-מאולתר.
 *
 * חוק-הבעלים (2026-10-17): "אפשר לקבל תמיד מהר active מה-owner — כל-פעם נוכחי,
 * כי הוא עלול להשתנות" → קצה `owner-active` ילידי כאן + מיזוג-רעננות לתשובת
 * `sovereignty`: שכבת-המפתחות של חשבון-הבעלים (headcorner) נשלפת טרייה מהשרשרת
 * בכל-בקשה (micro-cache 5ש' בודד-טיסה למהירות — בלי-התיישנות של ממש).
 * מפתחות-ציבוריים בלבד. אפס-סודות, אפס-כתיבה, אפס-רוטציות (הוראת-בעלים).
 */

const TARGETS = ["http://127.0.0.1:3100", "http://127.0.0.1:3200"];
const PLATFORM = TARGETS[0];
const HOP_HEADERS = new Set([
  "host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade", "x-saos-bridge",
]);

const OWNER_ACCOUNT = "headcorner";
const STEEM_RPC = "https://api.steemit.com";
const FRESH_TTL_MS = 5_000;

interface FreshStatus {
  source: "platform-rearm" | "chain-direct";
  account: string;
  allMatch: boolean | null;
  liveAt: string | null;
  roles: Record<string, { derived?: string | null; live: string | null; match: boolean | null }>;
  changed: { active: boolean; owner: boolean };
  fetchedAt: string;
}

const g = globalThis as unknown as {
  __ownerActiveFresh?: { at: number; value: FreshStatus | null; inflight?: Promise<FreshStatus> };
  __ownerActiveLastSeen?: { active?: string | null; owner?: string | null };
  __chainAuth?: { at: number; value: Record<string, unknown> | null; inflight?: Promise<Record<string, unknown> | null> };
  __fleetPublic?: { at: number; value: Record<string, unknown> | null; inflight?: Promise<Record<string, unknown> | null> };
  __ifixaiAudit?: { at: number; value: Record<string, unknown> | null; inflight?: Promise<Record<string, unknown> | null> };
};

/** אותות-הצי-הציבוריים — מדידה ישירה מהגיט הציבורי (אפס-סודות, קריאה-בלבד).
 *  משמשת כנפילה-כנה כשהפלטפורמות-האחיות לא-זמינות: השולחן ממשיך להציג אמת
 *  מדודה של הצי (ווטשדוג/דופק/דיגסט) במקום 502 ריק. */
async function fleetPublicSnapshot(): Promise<Record<string, unknown> | null> {
  const box = (g.__fleetPublic ??= { at: 0, value: null });
  const now = Date.now();
  if (box.value && now - box.at < 30_000) return box.value;
  if (box.inflight) return box.inflight;
  box.inflight = (async () => {
    const raw = async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
      if (!r.ok) throw new Error(`http ${r.status}`);
      return r.json();
    };
    const value: Record<string, unknown> = { source: "public-fleet-git", measuredAt: new Date().toISOString() };
    const settled = await Promise.allSettled([
      raw("https://raw.githubusercontent.com/roshpinacare-sys/saos-runtime/main/state/grid-status.json"),
      raw("https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/office-pages/digest.json"),
    ]);
    if (settled[0].status === "fulfilled") {
      const gs = settled[0].value as Record<string, unknown>;
      value.reds = gs.redCount ?? null;
      value.heartbeatAt = (gs.signals as Record<string, unknown> | undefined)?.heartbeatAt ?? null;
      value.custodyVerified = (gs.signals as Record<string, unknown> | undefined)?.custodyVerified ?? null;
      value.statusAt = gs.generatedAt ?? null;
      // [agent-zai/G5] R-CMDHIER enforcement telemetry — mirrored public facts (measured-only)
      const facts = (gs.facts ?? {}) as Record<string, unknown>;
      const sigs = (gs.signals ?? {}) as Record<string, unknown>;
      const pick = (k: string) => (facts[k] ?? sigs[k] ?? null);
      if (pick("hierarchyDay")) {
        value.hierarchy = {
          day: pick("hierarchyDay"),
          counts: (pick("hierarchyCounts") ?? {}) as Record<string, number>,
          flags: (pick("hierarchyEnforceFlags") ?? {}) as Record<string, boolean>,
          lastGuardAt: pick("hierarchyGuardLastAt"),
          denials: pick("hierarchyDenialsTail") as number | null,
        };
      }
    }
    if (settled[1].status === "fulfilled") {
      const d = settled[1].value as Record<string, unknown>;
      value.digestAt = d.generatedAt ?? null;
      value.digestRepos = (d.fleet as Record<string, unknown> | undefined)?.reposSeen ?? null;
    }
    const ok = settled[0].status === "fulfilled" || settled[1].status === "fulfilled";
    box.value = ok ? value : null;
    box.at = Date.now();
    return box.value;
  })();
  // [agent-zai/G5-fix] G4 bug: inflight was never cleared → every later call reused
  // the FIRST snapshot forever (stale-forever cache). Clear on settle, always.
  const p = box.inflight;
  try {
    return await p;
  } finally {
    if (box.inflight === p) box.inflight = undefined;
  }
}

/** ביקורת-iFixAi השבועית — מדידה ישירה מהגיט הציבורי (אפס-סודות, קריאה-בלבד) [G8].
 *  מטמון-זעיר 5-דק' + single-flight עם טיהור-inflight-בהתייצבות (חוק-G4 — המטמון-לעולם-לא-קבוע-תהום). */
async function ifixaiAudit(): Promise<Record<string, unknown> | null> {
  const box = (g.__ifixaiAudit ??= { at: 0, value: null });
  const now = Date.now();
  if (box.value && now - box.at < 300_000) return box.value;
  if (box.inflight) return box.inflight;
  box.inflight = (async () => {
    try {
      const r = await fetch(
        "https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/office-pages/ifixai-audit.json",
        { signal: AbortSignal.timeout(8_000), cache: "no-store" }
      );
      if (!r.ok) throw new Error(`http ${r.status}`);
      const j = (await r.json()) as Record<string, unknown>;
      box.value = j;
      box.at = Date.now();
      return j;
    } catch {
      box.value = null;
      box.at = Date.now();
      return null;
    }
  })();
  const p = box.inflight;
  try {
    return await p;
  } finally {
    if (box.inflight === p) box.inflight = undefined;
  }
}

function authPub(auth: unknown): string | null {
  const a = auth as { key_auths?: Array<[string, number]> } | undefined | null;
  return a?.key_auths?.[0]?.[0] ?? null;
}

/** הסמכויות-החיות של חשבון-הבעלים ישר-מהשרשרת (מפתחות-ציבוריים בלבד) */
async function chainAuthorities(): Promise<Record<string, unknown> | null> {
  const box = (g.__chainAuth ??= { at: 0, value: null });
  const now = Date.now();
  if (box.value && now - box.at < FRESH_TTL_MS) return box.value;
  if (box.inflight) return box.inflight;
  box.inflight = (async () => {
    try {
      const res = await fetch(STEEM_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "condenser_api.get_accounts", params: [[OWNER_ACCOUNT]], id: 1 }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      const j = (await res.json()) as { result?: Array<Record<string, unknown>> };
      const a = j?.result?.[0];
      const value = a
        ? {
            account: OWNER_ACCOUNT,
            owner: authPub(a.owner),
            active: authPub(a.active),
            posting: authPub(a.posting),
            memo: typeof a.memo_key === "string" ? a.memo_key : null,
            fetchedAt: new Date().toISOString(),
          }
        : null;
      box.value = value;
      box.at = Date.now();
      return value;
    } catch {
      box.value = null; // כנות: אין-שרשרת → אין-טענה
      box.at = Date.now();
      return null;
    } finally {
      box.inflight = undefined;
    }
  })();
  return box.inflight;
}

/** סטטוס-ההתאמה הטרי: מעדיף את מנוע-ה-rearm של הפלטפורמה (חתימה-אטומה מול-חי);
 *  נופל לשרשרת-ישירה אם-הפלטפורמה לא-זמינה. תמיד נוכחי, לעולם לא מהמטמון-הכבד. */
async function ownerActiveFresh(): Promise<FreshStatus> {
  const box = (g.__ownerActiveFresh ??= { at: 0, value: null });
  const now = Date.now();
  if (box.value && now - box.at < FRESH_TTL_MS) return box.value;
  if (box.inflight) return box.inflight;
  box.inflight = (async () => {
    let status: FreshStatus;
    try {
      const res = await fetch(`${PLATFORM}/api/saos/rearm/steem`, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
      if (!res.ok) throw new Error(`rearm-status ${res.status}`);
      const j = (await res.json()) as {
        account?: string; allMatch?: boolean; liveAt?: string;
        roles?: Record<string, { derived?: string | null; live: string | null; match: boolean | null }>;
      };
      status = {
        source: "platform-rearm",
        account: j.account ?? OWNER_ACCOUNT,
        allMatch: j.allMatch ?? null,
        liveAt: j.liveAt ?? null,
        roles: j.roles ?? {},
        changed: { active: false, owner: false },
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      const chain = await chainAuthorities();
      status = {
        source: "chain-direct",
        account: OWNER_ACCOUNT,
        allMatch: null,
        liveAt: chain ? (chain.fetchedAt as string) : null,
        roles: chain
          ? {
              owner: { live: chain.owner as string | null, match: null },
              active: { live: chain.active as string | null, match: null },
              posting: { live: chain.posting as string | null, match: null },
              memo: { live: chain.memo as string | null, match: null },
            }
          : {},
        changed: { active: false, owner: false },
        fetchedAt: new Date().toISOString(),
      };
    }
    // גילוי-שינוי: אם הסמכות-החיה של הבעלים השתנתה מאז-הבדיקה הקודמת — צעקה כנה
    const last = (g.__ownerActiveLastSeen ??= {});
    const liveActive = status.roles?.active?.live ?? null;
    const liveOwner = status.roles?.owner?.live ?? null;
    status.changed = {
      active: !!last.active && !!liveActive && last.active !== liveActive,
      owner: !!last.owner && !!liveOwner && last.owner !== liveOwner,
    };
    if (liveActive) last.active = liveActive;
    if (liveOwner) last.owner = liveOwner;
    box.value = status;
    box.at = Date.now();
    return status;
  })();
  const v = await box.inflight;
  box.inflight = undefined;
  return v;
}

async function bridge(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const sub = (path ?? []).join("/");
  const search = new URL(req.url).search;

  // ── קצה-ילידי: active של הבעלים, טרי בכל-קריאה ──
  if (sub === "owner-active") {
    try {
      const fresh = await ownerActiveFresh();
      const chain = await chainAuthorities();
      return NextResponse.json({ ok: true, fresh, chain, law: "owner-directive 2026-10-17: always-current, fast, fail-honest" });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "owner-active-failed" }, { status: 502 });
    }
  }

  let lastStatus = 0;
  let lastDetail = "";
  for (let i = 0; i < TARGETS.length; i++) {
    const base = TARGETS[i];
    try {
      const headers = new Headers();
      req.headers.forEach((v, k) => {
        if (!HOP_HEADERS.has(k.toLowerCase())) headers.set(k, v);
      });
      const init: RequestInit = { method: req.method, headers, cache: "no-store", signal: AbortSignal.timeout(60_000) };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = await req.arrayBuffer();
      }
      const res = await fetch(`${base}/api/saos/${sub}${search}`, init);

      // ── מיזוג-רעננות למרשם-הריבונות: שכבת-המפתחות תמיד נוכחית ──
      if (sub === "sovereignty" && res.ok) {
        try {
          const census = (await res.json()) as Record<string, unknown>;
          const fresh = await ownerActiveFresh();
          const vault = census.vault as Record<string, unknown> | undefined;
          if (vault) {
            vault.steemLiveMatch = { allMatch: fresh.allMatch, account: fresh.account, liveAt: fresh.fetchedAt, source: fresh.source };
            vault.authorityChanged = fresh.changed;
          }
          census.ownerActiveFresh = fresh;
          const out = NextResponse.json(census, { status: 200 });
          out.headers.set("x-saos-bridge", "fresh-key-layer");
          return out;
        } catch {
          // מיזוג-נפל → נחזיר את התשובה המקורית כמות-שהיא (כנות ללא-העפרה)
        }
      }

      if (res.status === 404 && i < TARGETS.length - 1) {
        lastStatus = 404;
        lastDetail = await res.text();
        continue; // מדורג לאפליקציה-האחות
      }
      const buf = await res.arrayBuffer();
      const out = new NextResponse(buf, { status: res.status });
      res.headers.forEach((v, k) => {
        const kl = k.toLowerCase();
        if (!HOP_HEADERS.has(kl) && kl !== "content-encoding" && kl !== "content-length") out.headers.set(k, v);
      });
      out.headers.set("x-saos-bridge", base.replace("http://127.0.0.1:", ""));
      return out;
    } catch (e) {
      lastStatus = 502;
      lastDetail = e instanceof Error ? e.message : "bridge-error";
    }
  }
  // ── קצה-ילידי: ביקורת-ה-iFixAi הציבורית [G8] ──
  if (sub === "ifixai-audit") {
    const audit = await ifixaiAudit();
    return NextResponse.json(
      audit
        ? { ok: true, audit, measuredAt: new Date().toISOString() }
        : { ok: false, error: "no-audit-published-yet", measuredAt: new Date().toISOString() },
      { status: audit ? 200 : 404 }
    );
  }

  // ── נפילה-כנה ל-live-probes: הפלטפורמות מתות, אבל אמת-הצי-הציבורית נמדדת ──
  if (sub === "live-probes") {
    const fleet = await fleetPublicSnapshot();
    if (fleet) {
      return NextResponse.json(
        { ok: false, bridge: true, platform: false, error: "platform-sandboxes-unreachable", lastStatus, detail: lastDetail.slice(0, 200), fleet },
        { status: 502 }
      );
    }
  }
  return NextResponse.json(
    { ok: false, bridge: true, error: "all-saos-targets-failed", lastStatus, detail: lastDetail.slice(0, 300) },
    { status: lastStatus === 404 ? 404 : 502 }
  );
}

export const GET = bridge;
export const POST = bridge;
export const PUT = bridge;
export const PATCH = bridge;
export const DELETE = bridge;
