import { NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/saos/growth — צמיחה-ריבונית חיה (גל-92 · agent-2)
 *
 * מזרים לקונסולה את מצב-הבנאי-האוטונומי: backlog חי, יומן-צמיחה, סדרת-מדדים,
 * יכולות-פתוחות, דופק-המארח — הכל נקרא-מקבצי-אמת (state-חי + טלמטריה), אפס-סטטיקה.
 * קטלוג-הארסנל נבדק-חי (existsSync) — מצב-כל-כלי נמדד-בעת-הבקשה.
 */

const STATE_FILE = "/home/z/audit/sovereign-builder/state/builder-state.json";
const GROWTH_LOG = "/home/z/audit/sovereign-builder/state/growth-log.jsonl";
const HOST_STATUS = "/home/z/audit/builder-beat-service-status.json";

type GrowthEntry = { at: string; kind: string; ok?: boolean; what?: string; result?: string; ledgerSeq?: number | null; beatSeq?: number | null; tx?: number | null; price?: string | null };

const ARSENAL: Array<{ id: string; title: string; desc: string; check: () => boolean; lane: string }> = [
  {
    id: "economy-beat",
    title: "economy-beat · פעימות-כלכלה",
    desc: "מנוע-כלכלה חי µ¢ BigInt · ~1,450 tx/פעימה · איטום-לגיט בכל-פעימה",
    check: () => fs.existsSync("/home/z/audit/fleet-economy/run-economy-beat.mjs"),
    lane: "Lane A",
  },
  {
    id: "verify_chain",
    title: "verify_chain · אימות-שרשרת בלתי-תלוי",
    desc: "Python-טהור (גל-91) · פורנזיה-צולבת מול-/verify של המנוע — שני-מימושים, ספר-אחד",
    check: () => fs.existsSync("/home/z/audit/fleet-economy/bootstrap/sovereign-vm/verify_chain.py"),
    lane: "גל-91 · quicksand",
  },
  {
    id: "sovereign-vm",
    title: "sovereign-vm · ביקורת בסנדבוקס-מבודד",
    desc: "microsoft/quicksand על-QEMU · L1 mount-אורח שזהה-בייטים · L3 checkpoint/revert",
    check: () => fs.existsSync("/home/z/audit/sovereign-vm/venv/bin/python"),
    lane: "גל-91 · quicksand",
  },
  {
    id: "watchdog",
    title: "watchdog-החייה · instrumentation",
    desc: "סריקה-כל-10-דק' · החייאת-מארחים אם-דופק-נפסק — הוכח-חי בהחלפת-מארח בגל-90",
    check: () => fs.existsSync("/home/z/my-project/src/instrumentation.ts"),
    lane: "גל-85→90",
  },
  {
    id: "restore",
    title: "שחזור-אחוזה מהגיט · bootstrap-קנוני",
    desc: "הספר+הקוד קנוניים בגיט · איטומי-הפעימות יוצרים שרשרת-שחזור מתמדת",
    check: () => fs.existsSync("/home/z/audit/fleet-economy/bootstrap/economy-beat-host.mjs"),
    lane: "גל-88→89",
  },
  {
    id: "public-pulse",
    title: "טלמטריה-ציבורית · saos-runtime Actions",
    desc: "grid-watchdog · treasury-ladder · sovereign-runtime · dex-beat — דקות-חינם ציבוריות",
    check: () => fs.existsSync("/home/z/audit/saos-runtime/ops"),
    lane: "G5 · ציבורי",
  },
  {
    id: "sovereign-builder",
    title: "sovereign-builder · הבנאי-הריבוני (רכיב-זה)",
    desc: "לופ observe→think→act→seal · מוח-LLM fail-open · white-list-פעולות · איטום-FF",
    check: () => fs.existsSync("/home/z/audit/sovereign-builder/run-builder-beat.mjs"),
    lane: "גל-92",
  },
];

export async function GET() {
  try {
    let state: Record<string, unknown> | null = null;
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {}

    let growth: GrowthEntry[] = [];
    try {
      growth = fs.readFileSync(GROWTH_LOG, "utf8")
        .trim().split("\n").filter(Boolean)
        .slice(-80)
        .map((l) => { try { return JSON.parse(l) as GrowthEntry; } catch { return null; } })
        .filter((x): x is GrowthEntry => !!x);
    } catch {}

    let host: Record<string, unknown> | null = null;
    try { host = JSON.parse(fs.readFileSync(HOST_STATUS, "utf8")); } catch {}

    const metrics = growth.filter((g) => g.kind === "metric");
    const series = metrics.slice(-30).map((g) => ({
      at: g.at,
      seq: g.ledgerSeq ?? null,
      beatSeq: g.beatSeq ?? null,
      tx: g.tx ?? null,
      price: g.price ?? null,
    }));

    const arsenal = ARSENAL.map((a) => ({
      id: a.id,
      title: a.title,
      desc: a.desc,
      lane: a.lane,
      live: (() => { try { return a.check(); } catch { return false; } })(),
    }));

    return NextResponse.json({
      at: new Date().toISOString(),
      state,
      host,
      series,
      growth: growth.filter((g) => g.kind !== "metric").slice(-20).reverse(),
      backlog: ((state?.backlog as Array<Record<string, unknown>>) ?? []).slice(0, 8),
      capabilities: (state?.capabilities as string[]) ?? [],
      stats: {
        acts: state?.acts ?? 0,
        metrics: state?.metrics ?? 0,
        brainCalls: state?.brainCalls ?? 0,
        brainOffers: state?.brainOffers ?? 0,
        seals: state?.seals ?? 0,
        sealFailures: state?.sealFailures ?? 0,
        backlogLen: Array.isArray(state?.backlog) ? (state.backlog as unknown[]).length : 0,
        growthCount: (() => { try { return fs.readFileSync(GROWTH_LOG, "utf8").trim().split("\n").filter(Boolean).length; } catch { return 0; } })(),
      },
      arsenal,
      arsenalLive: arsenal.filter((a) => a.live).length,
      safety: "אפס נגיעה בכספות/סודות/טוקנים · המוח לא מריץ קוד · white-list בלבד · איטום fail-closed",
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e), at: new Date().toISOString() }, { status: 500 });
  }
}
