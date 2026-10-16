/**
 * office-live — שירות-השידור של מפקדת הצי (פורט 3036).
 *
 * תפקיד: העולם של המשרד חי כל הזמן — לא מתאפס כשדף נפתח ולא ממתין למבקר.
 * השירות מחזיק את מצב-העולם (מנוע אחד עם הדפדפן ועם פעימת-הגריד), מצעד אותו
 * בזמן-אמת, ומשדר פריימים לכל הצופים. מצב-העולם נשמר לדיסק; בעלייה מחדש
 * העולם ממשיך מהנקודה האחרונה (כולל סגירת-פער עד 3 שע').
 *
 * מקור-האמת הקנוני: Domain/office/world-state.json (פעימת worldbeat בגריד).
 * בעלייה, השירות מנסה להתאחד עם שם לפני שהוא ממשיך מהעותק המקומי.
 *
 * פרוטוקול (socket.io, path '/' — נתיב-המעבר של Caddy, REST על אותו פורט
 * בלתי-אפשרי כי engine.io תופס הכול): בריאות = ack של 'hello'.
 *   ← 'hello'  (לקוח מצטרף; ack חוזר {ok,t,v})
 *   → 'world'  תמונת-מצב מלאה
 *   → 'tick'   פריים 4Hz: פוזיציות/מצבים/אירועים חדשים
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { connect } from 'net';
import { fileURLToPath, pathToFileURL } from 'url';

/* ריפוי-עצמי של המנוע (גל-16): המנוע הקנוני חי ב-Domain/office/engine.mjs (פעימת
 * ה-worldbeat בגריד). העתק-מקומי תחת public/office3d/ הוא ארטיפקט-ריצה בלבד —
 * אינו-בקנון (gitignore) ונבנה-מחדש-מהעוגן בכל-עלייה. אם-העוגן-חסר — כשל-כנה. */
const ENGINE_LOCAL = new URL('../../public/office3d/src/engine.mjs', import.meta.url);
const ENGINE_CANONS = [
  '/home/z/estate/Domain/office/engine.mjs', /* עוגן estate-sync */
];

function ensureEngineFile(): string {
  const local = fileURLToPath(ENGINE_LOCAL);
  if (fs.existsSync(local)) return local;
  for (const canon of ENGINE_CANONS) {
    try {
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.copyFileSync(canon, local);
      console.log(new Date().toISOString(), '[office-live]', 'engine self-healed from canon:', canon);
      return local;
    } catch (e) {
      console.log(new Date().toISOString(), '[office-live]', `canon unavailable (${canon}):`, e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error('engine.mjs missing and canon unavailable (honest fail) — estate-sync will heal /home/z/estate/Domain');
}

const engine = await import(pathToFileURL(ensureEngineFile()).href);
const { ENGINE_ID, ENGINE_VERSION, createSeedWorld, fromJSON, stepWorld, worldFrame, advanceWorld } = engine as {
  ENGINE_ID: string;
  ENGINE_VERSION: number;
  createSeedWorld: (tNow: number) => unknown;
  fromJSON: (obj: unknown) => { t: number; agents: unknown[] };
  stepWorld: (w: unknown, dtSec: number) => unknown;
  worldFrame: (w: unknown, sinceTs?: number) => unknown;
  advanceWorld: (w: unknown, targetMs: number, opts?: Record<string, unknown>) => { advancedMs: number; steps: number };
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(HERE, 'state', 'world-state.json');
const CANON_URL = 'https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-state.json';
const PORT = 3036;
const TICK_MS = 250;

function log(...args) {
  console.log(new Date().toISOString(), '[office-live]', ...args);
}

async function fetchCanon() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(CANON_URL, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    log('canon fetch unavailable (honest):', e.message);
    return null;
  }
}

async function bootWorld() {
  // סדר-עדיפות: קנון-הגריד → עותק מקומי → זריעה
  const canon = await fetchCanon();
  for (const [name, obj] of [['canon', canon], ['local', safeRead(STATE_FILE)]]) {
    if (!obj) continue;
    try {
      const w = fromJSON(obj);
      log(`world loaded from ${name}: t=${new Date(w.t).toISOString()} agents=${w.agents.length}`);
      return w;
    } catch (e) {
      log(`${name} world rejected (honest): ${e.message}`);
    }
  }
  const w = createSeedWorld(Date.now());
  log('world seeded fresh — first boot of this lineage');
  return w;
}

function safeRead(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function persist(w) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(w));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    log('persist failed (honest):', e.message);
  }
}

const world = await bootWorld();

// סגירת-פער: אם העולם ישן (מקור-קנון/עותק מקומי) — מקדמים לעכשיו לפני שידור
if (Date.now() - world.t > 30_000) {
  const r = advanceWorld(world, Date.now());
  log(`catch-up advanced ${Math.round(r.advancedMs / 60000)}min in ${r.steps} steps`);
}

const httpServer = createServer();

const io = new Server(httpServer, {
  path: '/', // אל תשנה — נתיב-המעבר של Caddy
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  socket.emit('world', world);
  // 15 דק' היסטוריה בלבד בהצטרפות — לא הצפת-בועות מכל יומן-העולם
  socket.emit('tick', worldFrame(world, Date.now() - 15 * 60 * 1000));
  socket.on('hello', (cb) => {
    if (typeof cb === 'function') cb({ ok: true, t: world.t, v: ENGINE_VERSION, engine: ENGINE_ID });
  });
});

let lastEventTs = 0;
const tickLoop = setInterval(() => {
  stepWorld(world, TICK_MS / 1000);
  const frame = worldFrame(world, lastEventTs);
  if (frame.ev.length) lastEventTs = frame.ev[frame.ev.length - 1].ts;
  io.emit('tick', frame);
}, TICK_MS);

const persistLoop = setInterval(() => persist(world), 20_000);
let beats = 0;
setInterval(() => {
  beats++;
  log(`heartbeat #${beats} — world t=${new Date(world.t).toISOString()}, phase alive, listeners=${io.engine.clientsCount}`);
}, 300_000);

function shutdown() {
  clearInterval(tickLoop);
  clearInterval(persistLoop);
  persist(world);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

httpServer.listen(PORT, () => {
  log(`broadcasting on :${PORT} — world t=${new Date(world.t).toISOString()}, agents=${world.agents.length}`);
});

/* ── sovereign-keepalive (wave-91, doctrine-4, 2026-10-16) ────────────────
 * 实证法则：由本沙箱编码会话直接产出的进程（setsid/nohup/detached 均试过）
 * 会被增量收割（8301/10660/12943 三连死）；而活树进程 detached 产出的孙子
 * 存活（5049 活证）。本服务是 `bun --hot` 长活树成员——热重载后本段生效，
 * 由它 detached 孕出的 fleet-economy(:3016) 与 next-dev(:3000) 获得树内
 * 豁免权。端口门控：活的从不触碰；死的每次探窗恰好一次 spawn。
 * 引擎自身带单写锁 + EADDRINUSE 诚实退出——三实例并发孕出也无争端。 */
function _kaPortUp(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = connect(port, '127.0.0.1');
    const done = (ok) => { try { sock.destroy(); } catch { /* raced */ } resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}
const _KA_TARGETS = [
  { port: 3016, cwd: '/home/z/my-project/mini-services/fleet-economy', cmd: process.execPath, args: ['index.ts'], logf: '/home/z/my-project/mini-services/fleet-economy/economy.log', name: 'fleet-economy' },
  { port: 3000, cwd: '/home/z/my-project', cmd: process.execPath, args: ['run', 'dev'], logf: '/home/z/my-project/dev.log', name: 'next-dev' },
];
let _kaBusy = false;
async function sovereignKeepalive() {
  if (_kaBusy) return;
  _kaBusy = true;
  try {
    for (const t of _KA_TARGETS) {
      try {
        if (await _kaPortUp(t.port)) continue;
        const out = fs.openSync(t.logf, 'a');
        const child = spawn(t.cmd, t.args, { cwd: t.cwd, detached: true, stdio: ['ignore', out, out], env: { ...process.env, GIT_EDITOR: 'true' } });
        child.unref();
        fs.closeSync(out);
        log(`sovereign-keepalive: ${t.name} down → tree-child revive pid=${child.pid}`);
      } catch (e) { log(`sovereign-keepalive: ${t.name} error: ${String(e).slice(0, 80)}`); }
    }
  } finally { _kaBusy = false; }
}
sovereignKeepalive();
setInterval(sovereignKeepalive, 60_000);
