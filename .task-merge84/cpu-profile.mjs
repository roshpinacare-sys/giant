// cpu-profile.mjs · אבחון-הקפאה: מחבר-CDP, מפעיל-פרופיילר-CPU, ומדווח-את-הפונקציות-החמות
import { chromium } from "playwright";

const URL = "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const logs = [];
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));

const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); // 1ms
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
console.log("loaded, title:", await page.title().catch(() => "TIMEOUT"));

// בדיקת-חיות-חוזרת: מתי-ה-thread-קופא?
let alive = true;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const t0 = Date.now();
  try {
    await Promise.race([
      page.evaluate("1+1"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("eval-hang")), 4000)),
    ]);
    console.log(`t+${(i + 1) * 3}s alive (eval ${Date.now() - t0}ms)`);
  } catch {
    console.log(`t+${(i + 1) * 3}s FROZEN (eval ${Date.now() - t0}ms)`);
    alive = false;
    break;
  }
}

console.log("\n=== CPU profile (last 15 hot functions) ===");
try {
  const { profile } = await cdp.send("Profiler.stop");
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const walk = (id, hitC) => {
    const n = nodes.get(id);
    if (!n) return;
    for (const child of n.children ?? []) walk(child, hitC);
    if (n.callFrame.functionName) self.set(n.callFrame.functionName + " @" + (n.callFrame.url || "").split("/").slice(-1)[0] + ":" + n.callFrame.lineNumber, (self.get(n.callFrame.functionName + " @" + (n.callFrame.url || "").split("/").slice(-1)[0] + ":" + n.callFrame.lineNumber) || 0) + hitC);
  };
  // גישה-פשוטה: ספירת-דגימות-עצמיות מתוך-העץ
  const byId = new Map();
  const countSelf = (node, hitCount) => {
    if (node.callFrame?.functionName) {
      const key = `${node.callFrame.functionName} @ ${(node.callFrame.url || "").split("/").pop()}:${node.callFrame.lineNumber}`;
      byId.set(key, (byId.get(key) || 0) + hitCount);
    }
  };
  // צאצאים: חישוב-עצמי לפי-חלוקת-הפגיעות
  const total = (profile.samples || []).length;
  const selfCounts = new Map();
  for (const s of profile.samples || []) {
    const n = nodes.get(s);
    if (n?.callFrame?.functionName) {
      const key = `${n.callFrame.functionName} @ ${(n.callFrame.url || "").split("/").pop()}:${n.callFrame.lineNumber}`;
      selfCounts.set(key, (selfCounts.get(key) || 0) + 1);
    }
  }
  const top = [...selfCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [k, v] of top) console.log(`${String(v).padStart(6)} samples (${((v / (total || 1)) * 100).toFixed(1)}%)  ${k}`);
} catch (e) {
  console.log("profiler stop failed:", String(e).slice(0, 200));
}

console.log("\n=== console/pageerror (last 20) ===");
for (const l of logs.slice(-20)) console.log(l);

await browser.close();
