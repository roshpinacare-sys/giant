/**
 * Characterization suite — owner-directive batch-1 (2026-11-02), implementing the
 * open SAOS-FORGE testgap issue(s) for src/lib/mini-guard.ts.
 * Every captured literal was produced by executing the CURRENT implementation
 * (probe run + determinism double-check) — nothing invented, no mocks in test or code.
 * If a future change alters a captured output this suite goes RED and forces a
 * conscious review of the behavioral change. Generated file: do not hand-edit
 * captured values; regenerate instead.
 * MINI_SERVICES is the static truth table (captured). portAlive/ensureMiniServices spawn real processes/sockets and are only referenced, never invoked (no side effects in tests).
 */
import { describe, expect, test } from "bun:test";
import * as mod from "../src/lib/mini-guard";

function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

describe("src/lib/mini-guard.ts (forge characterization batch-1)", () => {
  test("MINI_SERVICES truth table captured", () => {
    expect(canon(mod.MINI_SERVICES)).toBe("[{\"dir\":\"mini-services/estate-sync\",\"he\":\"שומר-העוגנים (estate/lane/channels/law)\",\"name\":\"estate-sync\",\"port\":3021,\"probe\":\"estate-sync\"},{\"dir\":\"mini-services/office-live\",\"he\":\"משדר-העולם-התלת-ממדי\",\"name\":\"office-live\",\"port\":3036},{\"dir\":\"mini-services/sovereign-gateway\",\"he\":\"שער-ה-LLM-הריבוני (כל-סוכן-משוחזר)\",\"name\":\"sovereign-gateway\",\"port\":3011,\"probe\":\"gateway\"},{\"dir\":\"mini-services/boot-verifier\",\"he\":\"מאמת-התחייה — קבלת-בריאות-כל-15דק\",\"name\":\"boot-verifier\",\"port\":3042,\"probe\":\"boot-verifier\"},{\"cmd\":\"[ -d node_modules ] || bun install --silent; exec bun tools/runtime-supervisor.ts\",\"dir\":\"/home/z/estate/FleetHQ/mini-services/agent-hq\",\"env\":{\"AGENT_HQ_DATA_DIR\":\"/home/z/my-project/Domain\",\"AGENT_HQ_PORT\":\"3020\"},\"he\":\"ממונה-הצי (FleetHQ: פורנן 3020 + גייטוויי + beats)\",\"name\":\"fleet-supervisor\",\"port\":3020},{\"cmd\":\"[ -d node_modules ] || bun install --silent; exec bun run dev\",\"dir\":\"mini-services/saos-dex-node\",\"he\":\"הבורסה-הריבונית-האמיתית (saos-dex על :3010 · ספר-משותף · snapshot h=501K)\",\"name\":\"saos-dex-node\",\"port\":3010},{\"cmd\":\"[ -d node_modules ] || bun install --silent; exec bun run dev\",\"dir\":\"mini-services/soldier-army\",\"he\":\"צבא-החיילים (6 חיילים · גריד-מודע-שוק · בנק-יציב 300µ)\",\"name\":\"soldier-army\",\"port\":3018},{\"cmd\":\"[ -d node_modules ] || bun install --silent; exec bun run dev\",\"dir\":\"mini-services/dex-economy-bridge\",\"env\":{\"BRIDGE_DEX_API\":\"http://127.0.0.1:3010/saos-dex/api/dex/trades?pair=SAOS/USDS&limit=500\",\"BRIDGE_DEX_DB\":\"/home/z/my-project/db/custom.db\"},\"he\":\"גשר-המילויים dex→economy (dex-fee · שער-אמת)\",\"name\":\"dex-economy-bridge\",\"port\":3017},{\"cmd\":\"[ -d node_modules ] || bun install --silent; exec bun run dev\",\"dir\":\"mini-services/sovereign-voice\",\"he\":\"קול-הריבונות (סריקה-כל-5דק · ריפוי-עצמי · קול-חוץ)\",\"name\":\"sovereign-voice\",\"port\":3019},{\"cmd\":\"exec bun run index.ts\",\"dir\":\"mini-services/sovereign-audit\",\"he\":\"ביקורת-מסלול בלתי-תלויה על הצבא (iFixAi · CLEAR/FINDINGS · הוכחות)\",\"name\":\"sovereign-audit\",\"port\":3022},{\"dir\":\"mini-services/fleet-economy\",\"he\":\"הכלכלה-הפנימית (ספר-hash-chain · AMM · תורת-כותבים-רבים)\",\"name\":\"fleet-economy\",\"port\":3016,\"probe\":\"gateway\"},{\"cmd\":\"[ -d node_modules ] || bun install --silent; exec bun run dev\",\"dir\":\"/home/z/estate/steem/mini-services/saos-engine\",\"env\":{\"SAOS_ENGINE_PORT\":\"3044\"},\"he\":\"מנוע-המסחר-החי על-Steem (hyper-grid · dexflow · חתימה-ריבונית מהכספת-בגיט)\",\"name\":\"saos-engine\",\"port\":3044,\"probe\":\"gateway\"}]");
  });
  test("live exports referenced (not invoked — no side effects)", () => {
    expect(typeof mod.portAlive).toBe("function");
    expect(typeof mod.ensureMiniServices).toBe("function");
  });
});
