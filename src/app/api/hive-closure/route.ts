import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * משטח-סגירת-שרשרת-Hive — פעולת-הבעלים-האחרונה (אישור-בעלים 2026-10-17 "מאשר תמשיך ודחוף")
 * =========================================================================================
 * מדידה-בלבד: סמכויות-Hive-posting של headcorner ישר-מהצמתים-הציבוריים (אפס-סודות).
 * היעד: מפתח-המנוע (agent-5 Option-B) בסמכות-ה-posting — אדיטיבי-בלבד, המפתח-של-הבעלים-נשאר.
 * כנות: אין-חתימה-מטעם-הסוכן (מפתח-active-של-Hive-קיים-רק-אצל-הבעלים — נמדד: liveHits=0
 * ביומני-hive-custody-revival); כשל-צומת = כנה, לעולם לא ירוק-מאולתר. micro-cache 10ש'.
 */

const ACCOUNT = "headcorner";
const TARGET_PUB = "STM6y7Dtk3hcic5tJwfdP4QKdfpABfjnAvgVRDByx3GaL14ZGK7Wn";
const NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://hive-api.arcange.eu"];
const TTL_MS = 10_000;

const g = globalThis as unknown as {
  __hiveClosure?: { at: number; value: Record<string, unknown> | null; inflight?: Promise<Record<string, unknown> | null> };
};

async function fetchPostingAuths(): Promise<{ auths: Array<[string, number]>; threshold: number | null; node: string | null }> {
  for (const node of NODES) {
    try {
      const res = await fetch(node, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "condenser_api.get_accounts", params: [[ACCOUNT]] }),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      const j = (await res.json()) as { result?: Array<Record<string, unknown>> };
      const a = j?.result?.[0];
      const posting = a?.posting as { key_auths?: Array<[string, number]>; weight_threshold?: number } | undefined;
      if (posting) {
        return {
          auths: (posting.key_auths ?? []).map(([k, w]) => [k, w]),
          threshold: posting.weight_threshold ?? null,
          node,
        };
      }
    } catch {
      /* next node */
    }
  }
  return { auths: [], threshold: null, node: null };
}

export async function GET() {
  const box = (g.__hiveClosure ??= { at: 0, value: null });
  const now = Date.now();
  if (box.value && now - box.at < TTL_MS) return NextResponse.json(box.value);
  if (box.inflight) return box.inflight;
  box.inflight = (async () => {
    const { auths, threshold, node } = await fetchPostingAuths();
    const installed = auths.some(([k]) => k === TARGET_PUB);
    const value = {
      ok: node !== null,
      account: ACCOUNT,
      targetPub: TARGET_PUB,
      installed,
      currentAuths: auths,
      threshold,
      node,
      checkedAt: new Date().toISOString(),
      law: "additive-only — the owner's own key stays; engine key joins posting authority (reversible grant, T1-class); signature = owner's Hive active key from the browser vault (agent-held material measured liveHits=0 — nothing to sign with, and that is by design)",
    };
    box.value = value;
    box.at = Date.now();
    return value;
  })();
  const p = box.inflight;
  try {
    return NextResponse.json(await p);
  } finally {
    if (box.inflight === p) box.inflight = undefined;
  }
}
