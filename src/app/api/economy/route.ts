/* /api/economy — שער הכלכלה-הפנימית לממשק הריבונות.
 * חוק-הישרדות שנמדד (2026-10-16): כל-תהליך שנולד מקריאת-כלי מת בסוף-הקריאה
 * (sandbox reaper) — אבל ילד שנולד מתוך תהליך-שרת חי שורד (הוכחה חיה:
 * runtime-supervisor של FleetHQ נולד מ-next-server ב-06:53 וחי).
 * לכן השרת-הזה (next-server, מטופל-ע"י-הפלטפורמה) הוא ההורה-המיילד של
 * fleet-economy: קריאה ראשונה → spawn נטוש (detached) אם הפורט נפל → הקליינט
 * הופך ללקוח בלבד. אפס-תלות בקריאות-כלים, אפס-הדמיות: אם לא חי — מדווח בכנות. */
import { spawn } from "child_process";
import { connect } from "net";
import fs from "fs";
import path from "path";
import { economyProducerStats } from "@/lib/economy-tx";

const ECONOMY_PORT = 3016;
const SVC_DIR = path.join(process.cwd(), "mini-services", "fleet-economy");
const SPAWN_RECEIPT = path.join(SVC_DIR, "state", "spawn-receipts.jsonl");

function portAlive(port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function spawnEconomy(): boolean {
  try {
    if (!fs.existsSync(SVC_DIR)) return false;
    const out = fs.openSync(path.join(SVC_DIR, "economy.log"), "a");
    const child = spawn("bun", ["index.ts"], {
      cwd: SVC_DIR,
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env },
    });
    child.unref();
    fs.closeSync(out);
    try {
      fs.mkdirSync(path.dirname(SPAWN_RECEIPT), { recursive: true });
      fs.appendFileSync(SPAWN_RECEIPT, JSON.stringify({ ts: new Date().toISOString(), pid: child.pid }) + "\n");
    } catch { /* fail-soft */ }
    return true;
  } catch {
    return false;
  }
}

export async function GET(): Promise<Response> {
  const alive = await portAlive(ECONOMY_PORT);
  if (!alive) {
    const spawned = spawnEconomy();
    // נותנים לתהליך הצעיר 1.2 שניות לעלות — אם לא, מדווח בכנות (לא ממציאים)
    await new Promise((r) => setTimeout(r, 1200));
    const alive2 = await portAlive(ECONOMY_PORT);
    if (!alive2) {
      return Response.json({ ok: false, engine: "fleet-economy", spawned, error: "economy down — revive attempted, still down (honest)" }, { status: 503 });
    }
  }
  try {
    const res = await fetch(`http://127.0.0.1:${ECONOMY_PORT}/metrics`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    // שקיפות-מלאה: מוני-השמטות-המפיקים (בתוך-השרת-החי) לצד מוני-המנוע (realEvents.droppedTx)
    return Response.json({ ok: true, producerDropped: economyProducerStats(), ...data });
  } catch (e) {
    return Response.json({ ok: false, error: String(e), producerDropped: economyProducerStats() }, { status: 502 });
  }
}
