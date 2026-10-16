// GET /api/giant/capabilities · מלאי-היכולות-החי-של-הריבונות (גל-86 · הוראת-הבעלים "חיווט-הכל")
// ═══════════════════════════════════════════════════════════════════════════
// הוראת-הבעלים (גל-78-a): "כל-מה-שיש-בגיט-שהריבונות-יכולה-להשתמש-בו — עושים-מלאי
// ומחברים-הכל-לכלים". המסלול-הזה הוא-החיווט: הוא-מודד-בפועל-כל-רכוש-לא-מחובר
// (כלי-צי · forge · מרתף-אוויר · כשרונות · שירותי-אורגניזם) ומחזיר-פסק-דין-כנה
// לכל-אחד. אפס-הדמיות: מה-שלא-ניתן-למדידה — מדווח-ככזה. תוצאות-הכלים נשמרות
// במטמון-זיכרון 5 דק' (הרצה-חוזרת-על-פני-רשת היא בזבוז; המדידה-עצמה אמיתית).
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import net from "net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const ROOT = "/home/z/my-project";
const run = promisify(execFile);

type Verdict = "OK" | "BLOCKED" | "FAIL" | "DOWN" | "STARTABLE" | "UNKNOWN";
interface Cap {
  name: string;
  group: string;
  state: Verdict;
  detail: string;
  runnable: boolean;
  measuredAt: string;
}

function tcpOpen(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(timeoutMs);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}

/* ── מטמון-מדידות-הכלים (5 דק') — הרצה-אמיתית-אחת ואז-שער-המטמון ─────────── */
let toolCache: { at: number; caps: Cap[] } | null = null;
const TOOL_TTL_MS = 5 * 60_000;

async function runTool(file: string, args: string[] = [], timeoutMs = 12_000): Promise<{ state: Verdict; detail: string }> {
  try {
    const { stdout, stderr } = await run("node", [path.join(ROOT, "tools/fleet", file), ...args], {
      cwd: ROOT, timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const out = ((stdout || "") + (stderr || "")).trim();
    const last = out.split("\n").filter(Boolean).slice(-1)[0] ?? "";
    if (/BLOCKED/i.test(out)) return { state: "BLOCKED", detail: last.slice(0, 160) || "blocked (כנה)" };
    return { state: "OK", detail: last.slice(0, 160) || "רץ · קבלה-כנה" };
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string; killed?: boolean };
    const out = ((err.stdout || "") + (err.stderr || "")).trim();
    const last = out.split("\n").filter(Boolean).slice(-1)[0] ?? "";
    if (/BLOCKED/i.test(out)) return { state: "BLOCKED", detail: last.slice(0, 160) || "blocked (כנה)" };
    if (err.killed) return { state: "UNKNOWN", detail: `timeout ${timeoutMs}ms — לא הוכח` };
    return { state: "FAIL", detail: (last || `exit ${err.code}`).slice(0, 160) };
  }
}

async function fleetToolCaps(): Promise<Cap[]> {
  if (toolCache && Date.now() - toolCache.at < TOOL_TTL_MS) return toolCache.caps;
  const tools = [
    { file: "fleet-verify.mjs", args: [] as string[], he: "מאמת-הריפואים-הקריטיות (T-53)" },
    { file: "fleet-yield.mjs", args: [] as string[], he: "עורק-התשואה · curator (T-45)" },
    { file: "federation-scan.mjs", args: [] as string[], he: "סריקת-הפדרציה" },
    { file: "agent-gate.mjs", args: ["challenge", "--id", "agent-1"], he: "שער-הסוכנים (challenge/verify/report)" },
    { file: "decision-truth.mjs", args: [] as string[], he: "אמת-ההחלטות" },
    { file: "candidates-export.mjs", args: [] as string[], he: "יצוא-מועמדים" },
  ];
  const caps: Cap[] = [];
  for (const t of tools) {
    const full = path.join(ROOT, "tools/fleet", t.file);
    if (!fs.existsSync(full)) {
      caps.push({ name: t.file, group: "tools/fleet", state: "FAIL", detail: "הקובץ-נעלם", runnable: false, measuredAt: new Date().toISOString() });
      continue;
    }
    const r = await runTool(t.file, t.args);
    caps.push({ name: t.file, group: "tools/fleet", state: r.state, detail: `${t.he} · ${r.detail}`, runnable: true, measuredAt: new Date().toISOString() });
  }
  toolCache = { at: Date.now(), caps };
  return caps;
}

async function portCaps(): Promise<Cap[]> {
  const services = [
    { port: 3002, name: "FleetHQ-app", he: "אפליקציית-המשרד-החיה" },
    { port: 3010, name: "foreman", he: "מנהל-הסדנה" },
    { port: 3016, name: "fleet-economy", he: "מנוע-הכלכלה-הפנימית" },
    { port: 3036, name: "office-live", he: "המשרד-החי (live view)" },
    { port: 3042, name: "boot-verifier", he: "מאמת-האתחול-החי" },
  ];
  const caps: Cap[] = [];
  for (const s of services) {
    const up = await tcpOpen(s.port);
    caps.push({ name: s.name, group: "services", state: up ? "OK" : "DOWN", detail: up ? `port ${s.port} up · ${s.he}` : `port ${s.port} down · מיוטל ע"י שרשרת-ההחייאה (keeper)`, runnable: false, measuredAt: new Date().toISOString() });
  }
  return caps;
}

async function assetCaps(): Promise<Cap[]> {
  const caps: Cap[] = [];
  // forge — פס-ייצור CI/CD פנימי (1.3GB) — כבד: לא מוקם אוטומטית, מדווח-כנה
  const forgePkg = path.join(ROOT, "mini-services/forge/package.json");
  if (fs.existsSync(forgePkg)) {
    const forgeUp = await tcpOpen(3400, 900);
    caps.push({
      name: "forge", group: "assets", state: forgeUp ? "OK" : "STARTABLE",
      detail: forgeUp ? "forge רץ" : "פס-CI/CD פנימי (Next.js · כבד-זיכרון) — מוכן להקמה יזומה דרך supervise-dev שלו (OOM-מודע)",
      runnable: false, measuredAt: new Date().toISOString(),
    });
  }
  // מרתף-אוויר (airgap) — LLM-מקומי-מוכן-ולא-רץ
  const airgap = path.join(ROOT, "mini-services/sovereign-gateway/airgap");
  if (fs.existsSync(airgap)) {
    const scripts = fs.readdirSync(airgap).filter((f) => f.endsWith(".sh"));
    caps.push({
      name: "airgap", group: "assets", state: "STARTABLE",
      detail: `LLM-מקומי: ${scripts.length}-סקריפטי-הקמה (${scripts.slice(0, 3).join(", ")}) — דורש-משאבי-מחשב-שלא-הוקצו-כאן`,
      runnable: false, measuredAt: new Date().toISOString(),
    });
  }
  // כשרונות (skills/) — 80-יכולות-המערכת
  const skillsDir = path.join(ROOT, "skills");
  if (fs.existsSync(skillsDir)) {
    const n = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
    caps.push({ name: "skills", group: "assets", state: "OK", detail: `${n}-כשרונות-במלאי · מרכז-ההרצה-החי: /api/skills/run (רישום-SkillRun)`, runnable: false, measuredAt: new Date().toISOString() });
  }
  return caps;
}

let lastAll: { at: number; data: Cap[] } | null = null;

export async function GET() {
  try {
    if (lastAll && Date.now() - lastAll.at < 60_000) {
      return NextResponse.json({ ok: true, cached: true, measuredAt: new Date(lastAll.at).toISOString(), capabilities: lastAll.data }, { headers: { "cache-control": "no-store" } });
    }
    const [tools, ports, assets] = await Promise.all([fleetToolCaps(), portCaps(), assetCaps()]);
    const capabilities = [...ports, ...tools, ...assets];
    lastAll = { at: Date.now(), data: capabilities };
    return NextResponse.json({ ok: true, cached: false, measuredAt: new Date().toISOString(), capabilities }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
