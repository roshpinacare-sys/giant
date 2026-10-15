/**
 * textures.ts — procedural canvas textures for the Fleet HQ office.
 * ------------------------------------------------------------------
 * אפס נכסי רשת: כל החומרים נוצרים בקנבס בזמן אתחול (עץ, בטון מלוטש, שטיח,
 * מתכת מוברשת, שיש, בד, תריסים, קו רקיע לילה, ניאון, שלטי שמות, בועות דיבור,
 * מסכים חיים, לוח כרטסת, קיר גיט).
 * מסכים דינמיים (צג שולחן, לוח משימות, קיר גיט, שלטי שם) — מנהל הפעלות ציור
 * עם דגל לכלוך וסינון 5Hz, כדי שהרינדור יישאר זול.
 */
import * as THREE from 'three';

// ─────────────── helpers ───────────────
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function noiseOn(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  void alpha;
}

function finish(c: HTMLCanvasElement, repeat?: [number, number], aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─────────────── חומרים סטטיים ───────────────

/** בטון מלוטש עם חריצי התפר — רצפת האולם */
export function makeConcreteTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 1024);
  // Task 51 (daylight): light limestone floor — the dark #35322e slab made the
  // whole room read as a night club (measured mean-luma 22-35/255).
  const g = ctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, '#d9d3c6'); g.addColorStop(0.5, '#cfc9bb'); g.addColorStop(1, '#d5cfc1');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024);
  // כתמי שחיקה רכים
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 20 + Math.random() * 130;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const lum = Math.random() > 0.5 ? 255 : 0;
    rg.addColorStop(0, `rgba(${lum},${lum},${lum},${0.02 + Math.random() * 0.035})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // חריצי התפר בגריד 4×4
  ctx.strokeStyle = 'rgba(60,50,38,0.13)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo((i * 256), 0); ctx.lineTo(i * 256, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 256); ctx.lineTo(1024, i * 256); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 256 + 3, 0); ctx.lineTo(i * 256 + 3, 1024); ctx.stroke();
  }
  noiseOn(ctx, 1024, 1024, 14, 1);
  return finish(c, [6, 6]);
}

/** אלון בהיר מוברש — משטחי שולחנות ודלפקים */
export function makeWoodTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  // Task 51 (daylight): light oak — desks read as furniture, not shadows
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#c9a878'); g.addColorStop(1, '#b8946a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // סיבי עץ
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * 512;
    const w = 0.6 + Math.random() * 2.2;
    const a = 0.05 + Math.random() * 0.1;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(96,64,32,${a})` : `rgba(240,220,180,${a * 0.8})`;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 3.2);
    ctx.stroke();
  }
  // קשרי עץ
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512;
    for (let r = 14; r > 2; r -= 3) {
      ctx.strokeStyle = `rgba(110,72,36,${0.14 + Math.random() * 0.09})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, r * 2.1, r, 0, 0, 7); ctx.stroke();
    }
  }
  noiseOn(ctx, 1024, 512, 8, 1);
  return finish(c);
}

/** שטיח צמר — אזור הלהבה ואזור הקבלה */
export function makeCarpetTexture(tint = '#5a4636'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 512, 512);
  // דוגמת אריגה עדינה
  for (let y = 0; y < 512; y += 8) {
    for (let x = 0; x < 512; x += 8) {
      const v = ((x + y) / 8) % 2 === 0;
      ctx.fillStyle = v ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.045)';
      ctx.fillRect(x, y, 8, 8);
    }
  }
  // גליל גבולות מעוגל
  ctx.strokeStyle = 'rgba(255,196,110,0.5)'; ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, 464, 464);
  ctx.strokeStyle = 'rgba(255,196,110,0.25)'; ctx.lineWidth = 4;
  ctx.strokeRect(44, 44, 424, 424);
  noiseOn(ctx, 512, 512, 18, 1);
  return finish(c, [3, 3]);
}

/** מתכת מוברשת — רגלי שולחנות, מסגרות, תאורה */
export function makeBrushedMetalTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#8f939b'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 512;
    const a = 0.03 + Math.random() * 0.09;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.lineWidth = 0.7 + Math.random();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y + (Math.random() - 0.5) * 6); ctx.stroke();
  }
  return finish(c, [2, 2]);
}

/** שיש בהיר — משטח קבלה */
export function makeMarbleTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 1024, 512);
  g.addColorStop(0, '#eceae4'); g.addColorStop(1, '#e2dfd7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // ורידים
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(${120 + Math.random() * 40},${116 + Math.random() * 40},${105 + Math.random() * 30},${0.06 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.4;
    let x = Math.random() * 1024, y = Math.random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      x += (Math.random() - 0.4) * 160; y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  noiseOn(ctx, 1024, 512, 7, 1);
  return finish(c);
}

/** בד כיסא — משובץ עדין */
export function makeFabricTexture(tint = '#3a3d42'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(i, 0, 2, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, i, 256, 2);
  }
  noiseOn(ctx, 256, 256, 10, 1);
  return finish(c, [3, 3]);
}

/** קיר צבע חלק עם טקסטורת רולר עדינה */
export function makeWallTexture(tint = '#2e2a26'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const a = 0.015 + Math.random() * 0.03;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 2 + Math.random() * 8, 2 + Math.random() * 3);
  }
  return finish(c, [4, 2]);
}

/** תריסי אלומיניום — על חלונות המערב */
export function makeBlindsTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 1024);
  for (let y = 0; y < 1024; y += 36) {
    const g = ctx.createLinearGradient(0, y, 0, y + 30);
    g.addColorStop(0, '#8d9299'); g.addColorStop(0.5, '#c6cbd2'); g.addColorStop(1, '#5f646b');
    ctx.fillStyle = g; ctx.fillRect(0, y, 256, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, y + 30, 256, 6);
  }
  return finish(c, [3, 1]);
}

/** קו רקיע יום — נוף עיר מחלונות הדרום והמערב (Task 51: daylight honesty) */
export function makeSkylineTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(2048, 512);
  // שמיים יום
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#a9cbe0'); sky.addColorStop(0.5, '#cfe0ea'); sky.addColorStop(0.8, '#e9e9e0'); sky.addColorStop(1, '#f4efe0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 2048, 512);
  // שמש — הילה רכה במקום ירח
  const mg = ctx.createRadialGradient(1560, 110, 20, 1560, 110, 220);
  mg.addColorStop(0, 'rgba(255,252,236,0.98)'); mg.addColorStop(0.2, 'rgba(255,244,206,0.55)'); mg.addColorStop(1, 'rgba(255,244,206,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(1560, 110, 220, 0, 7); ctx.fill();
  ctx.fillStyle = '#fffdf2'; ctx.beginPath(); ctx.arc(1560, 110, 34, 0, 7); ctx.fill();
  // קו בניינים רחוק — הזגה אטמוספרית
  let x = 0;
  while (x < 2048) {
    const w = 40 + Math.random() * 110, h = 90 + Math.random() * 190;
    ctx.fillStyle = 'rgba(158,178,190,0.85)';
    ctx.fillRect(x, 512 - h - 60, w, h + 60);
    x += w + 4 + Math.random() * 26;
  }
  // קו בניינים קרוב + זכוכית משקפת
  x = -20;
  while (x < 2048) {
    const w = 60 + Math.random() * 130, h = 130 + Math.random() * 230;
    ctx.fillStyle = '#8ea2b0';
    ctx.fillRect(x, 512 - h, w, h);
    for (let wx = x + 8; wx < x + w - 8; wx += 14) {
      for (let wy = 512 - h + 10; wy < 500; wy += 18) {
        if (Math.random() < 0.42) {
          const bright = Math.random() > 0.25;
          ctx.fillStyle = bright ? `rgba(228,242,250,${0.5 + Math.random() * 0.45})` : `rgba(120,150,170,${0.4 + Math.random() * 0.4})`;
          ctx.fillRect(wx, wy, 7, 9);
        }
      }
    }
    x += w + 6 + Math.random() * 40;
  }
  return finish(c);
}

/** טקסטורת צל מגע (blob shadow) */
export function makeBlobShadowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// (makeHaloTexture / makeSmokeTexture removed with the cinematic layer —
//  their only consumers were the light-shaft dust, flame sparks and halo,
//  all removed as decorative non-information in Task 45.)

// ─────────────── שילוט ───────────────

/** שילוט ניאון: טקסט בוהק + תת-כותרת, על רקע שקוף (מדבק על קיר/זכוכית) */
export function makeSignTexture(text: string, color: string, sub?: string): THREE.CanvasTexture {
  const W = 1024, H = sub ? 320 : 224;
  const [c, ctx] = makeCanvas(W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  // זוהר רקע
  const glow = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W * 0.55);
  glow.addColorStop(0, color + '33'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // שכבות ניאון
  ctx.shadowColor = color; ctx.shadowBlur = 34;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 2 ? '#fff8ee' : color;
    ctx.font = `700 ${sub ? 120 : 128}px 'Heebo','Assistant',system-ui,sans-serif`;
    ctx.fillText(text, W / 2, sub ? H * 0.4 : H / 2);
  }
  if (sub) {
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.font = `500 44px 'Heebo','Assistant',system-ui,sans-serif`;
    ctx.fillText(sub, W / 2, H * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─────────────── דוכן ההחלטות — מסך-חי-מוסבר (R53) ───────────────
// הבעלים: "לא ברור למה משמש דוכן ההחלטות". התשובה נמדדת על-גבי הדוכן עצמו:
// מה-הוא-משרת, מה-ההכרעה-האחרונה (מסנכרון החנות — אמת-בלבד), כמה-פתוחות.
// אפס-המצאה: בלי-החלטות-המסך אומר-זאת-בכנות ומציג-את-הספירות.
export function makeDecisionPodiumPlate(): {
  tex: THREE.CanvasTexture;
  set: (d: { question: string; status: string; createdAt: number | null } | null, open: number, answered: number) => void;
  update: (now: number) => void;
} {
  let latest: { question: string; status: string; createdAt: number | null } | null = null;
  let openCount = 0;
  let answeredCount = 0;
  // R54 — פלטה-קומפקטית עברית-בלבד (היתה 768×360 עם שאלת-האנגלית הגולמית
  // מרחפת בחדר — נמדד). מה-נשאר: מצב-ההכרעה + גיל + ספירות. הפירוט — בפאנל.
  const dyn = new DynTex(640, 200, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(14,11,8,0.92)'; ctx.fillRect(0, 0, w, h);
    const accent = openCount > 0 ? '#e07b54' : '#5a4636';
    // פס-עוגן בצד — במקום זוהר-מסך-ענק
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 8, h);
    ctx.direction = 'rtl'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    // כותרת-קטנה + נקודת-מצב
    ctx.beginPath(); ctx.arc(w - 26, 34, 8, 0, 7); ctx.fillStyle = openCount > 0 ? '#e07b54' : '#4f6b57'; ctx.fill();
    ctx.fillStyle = '#f2e5d8'; ctx.font = "700 34px 'Heebo','Assistant',system-ui,sans-serif";
    ctx.fillText('דוכן ההחלטות', w - 48, 34);
    // מצב-ההכרעה האחרונה — עברית בלבד, נמדד
    if (latest) {
      const isOpen = latest.status !== 'answered';
      const mins = latest.createdAt ? Math.max(0, Math.round((Date.now() - latest.createdAt) / 60000)) : null;
      const ago = mins == null ? '' : mins < 1 ? 'עכשיו' : mins < 60 ? ` · לפני ${mins} דק'` : ` · לפני ${Math.floor(mins / 60)} שע'`;
      ctx.fillStyle = isOpen ? '#e8a583' : '#9dc38a';
      ctx.font = "600 30px 'Heebo','Assistant',system-ui,sans-serif";
      ctx.fillText(isOpen ? `הכרעה פתוחה — ממתינה להכרעה${ago}` : `האחרונה נפתרה${ago}`, w - 28, 92);
    } else {
      ctx.fillStyle = '#9b8a76'; ctx.font = "500 28px 'Heebo','Assistant',system-ui,sans-serif";
      ctx.fillText('אין הכרעות שנמדדו עדיין', w - 28, 92);
    }
    // ספירות
    ctx.textAlign = 'left'; ctx.fillStyle = '#c9b8a2'; ctx.font = "600 24px 'Heebo','Assistant',system-ui,sans-serif";
    ctx.fillText(`פתוחות: ${openCount}  ·  נפתרו: ${answeredCount}`, 26, 158);
  });
  return {
    tex: dyn.tex,
    set: (d, open, answered) => {
      latest = d; openCount = open; answeredCount = answered; dyn.markDirty();
    },
    update: (now) => dyn.update(now),
  };
}

// ─────────────── מנהל מסכים דינמיים ───────────────

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export class DynTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  painter: Painter;
  dirty = true;
  last = 0;
  constructor(w: number, h: number, painter: Painter) {
    const [c, ctx] = makeCanvas(w, h);
    this.canvas = c; this.ctx = ctx; this.painter = painter;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.draw();
  }
  markDirty() { this.dirty = true; }
  /** מצויר לכל היותר פעם ב-200ms */
  update(now: number) {
    if (!this.dirty || now - this.last < 200) return;
    this.last = now;
    this.draw();
  }
  draw() {
    this.painter(this.ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
    this.dirty = false;
  }
}

/** מסך CRT של צג שולחן — עבודה-אמת בראש (מצב · פעילות · מטלה) + שורות-יומן */
export function makeMonitorScreen(agentName: string, agentColor: string): {
  tex: THREE.CanvasTexture;
  setLogs: (lines: { kind: string; text: string }[]) => void;
  setWork: (w: { stateHe: string; stateCol: string; activity: string; task: string; taskStatusHe: string }) => void;
  update: (now: number) => void;
} {
  const lines: { kind: string; text: string }[] = [];
  let work: { stateHe: string; stateCol: string; activity: string; task: string; taskStatusHe: string } | null = null;
  const dyn = new DynTex(640, 400, (ctx, w, h) => {
    // רקע מסך
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(0, 0, w, h);
    // כותרת
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, 0, w, 44);
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = agentColor; ctx.font = "600 22px 'Heebo',system-ui,sans-serif";
    ctx.fillText(`${agentName} · צג עבודה`, w - 16, 22);
    ctx.fillStyle = 'rgba(120,255,190,0.75)';
    ctx.font = "500 18px ui-monospace,monospace";
    ctx.textAlign = 'left';
    ctx.fillText('● LIVE', 16, 22);
    // R58 — פס-העבודה האמיתית: מה הסוכן עושה עכשיו לפי המדידה האחרונה.
    // אפס-המצאה: בלי מדידה — "המתנה למדידה", לעולם לא עבודה-מדומה.
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    if (work) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(0, 44, w, 92);
      ctx.fillStyle = work.stateCol;
      ctx.beginPath(); ctx.arc(w - 26, 66, 7, 0, 7); ctx.fill();
      ctx.font = "700 24px 'Heebo',system-ui,sans-serif";
      ctx.fillText(work.stateHe, w - 42, 66);
      ctx.fillStyle = 'rgba(226,224,218,0.92)'; ctx.font = "500 20px 'Heebo',system-ui,sans-serif";
      const act = work.activity.length > 44 ? work.activity.slice(0, 43) + '…' : work.activity;
      ctx.fillText(act || '—', w - 16, 98);
      if (work.task) {
        ctx.fillStyle = 'rgba(150,214,190,0.85)'; ctx.font = "500 19px 'Heebo',system-ui,sans-serif";
        const t = work.task.length > 38 ? work.task.slice(0, 37) + '…' : work.task;
        ctx.fillText(`מטלה: ${t} · ${work.taskStatusHe}`, w - 16, 126);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(0, 44, w, 92);
      ctx.fillStyle = 'rgba(200,198,192,0.5)'; ctx.font = "500 20px 'Heebo',system-ui,sans-serif";
      ctx.fillText('המתנה למדידה ראשונה…', w - 16, 90);
    }
    // שורות
    const visible = lines.slice(-9);
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    visible.forEach((l, i) => {
      const y = 168 + i * 24;
      const kindCol =
        l.kind === 'tool' ? '#54d8c0' :
        l.kind === 'result' ? '#9be37a' :
        l.kind === 'error' ? '#ff7a7a' :
        l.kind === 'report' ? '#d9a1ff' :
        l.kind === 'say' ? '#ffd27a' : '#c9ccd4';
      ctx.fillStyle = kindCol;
      ctx.font = `500 19px ui-monospace,'Heebo',monospace`;
      const txt = l.text.length > 52 ? '…' + l.text.slice(-51) : l.text;
      ctx.fillText(txt, w - 16, y);
    });
    // סריקה CRT עדינה
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    // נצנוץ גלוני
    const sg = ctx.createLinearGradient(0, 0, w, h);
    sg.addColorStop(0, 'rgba(255,255,255,0.05)'); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
  });
  const sameWork = (a: NonNullable<typeof work> | null, b: NonNullable<typeof work> | null) =>
    a === b || (!!a && !!b && a.stateHe === b.stateHe && a.activity === b.activity && a.task === b.task && a.taskStatusHe === b.taskStatusHe);
  return {
    tex: dyn.tex,
    setLogs: (ls) => {
      let changed = ls.length !== lines.length;
      if (!changed) for (let i = 0; i < ls.length; i++) if (ls[i] !== lines[i]) { changed = true; break; }
      if (!changed) return;
      lines.length = 0; lines.push(...ls);
      dyn.markDirty();
    },
    setWork: (nw) => {
      if (sameWork(work, nw)) return;
      work = nw;
      dyn.markDirty();
    },
    update: (now) => dyn.update(now),
  };
}

/** שלט שם מעל שולחן — שם, תפקיד, שורת פעילות ונקודת מצב חיה */
export function makeNameplate(
  name: string, title: string, color: string,
): { tex: THREE.CanvasTexture; set: (activity: string, stateCol: string) => void; update: (now: number) => void } {
  let activity = '';
  let stateCol = '#71717a';
  // R54 — שלט-שם-קומפקטי (היה 512×160 פאנל-שחור-כבד — נמדד כמסה מרחפת).
  // גוף שקוף-ירוק-חלש, טיפוגרפיה צמודה: שם + תפקיד + שורת-מצב.
  const dyn = new DynTex(480, 132, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // גוף שלט — שקוף, קל-משקל
    ctx.fillStyle = 'rgba(14,14,17,0.74)';
    roundRect(ctx, 4, 4, w - 8, h - 8, 14); ctx.fill();
    // פס צבע דק
    ctx.fillStyle = color;
    roundRect(ctx, 4, 4, 9, h - 8, 4.5); ctx.fill();
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f2ee'; ctx.font = "700 36px 'Heebo',system-ui,sans-serif";
    ctx.fillText(name, w - 74, 34);
    ctx.fillStyle = color; ctx.font = "500 21px 'Heebo',system-ui,sans-serif";
    ctx.fillText(title, w - 74, 68);
    ctx.fillStyle = 'rgba(214,212,206,0.82)'; ctx.font = "400 20px 'Heebo',system-ui,sans-serif";
    const act = activity.length > 34 ? activity.slice(0, 33) + '…' : activity;
    ctx.fillText(act || '—', w - 74, 100);
    // נקודת מצב
    ctx.fillStyle = stateCol;
    ctx.shadowColor = stateCol; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(w - 36, 34, 8, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  });
  return {
    tex: dyn.tex,
    set: (a, sc) => { if (a !== activity || sc !== stateCol) { activity = a; stateCol = sc; dyn.markDirty(); } },
    update: (now) => dyn.update(now),
  };
}

/** בועת דיבור מעל סוכן */
export function makeBubbleTexture(): { tex: THREE.CanvasTexture; set: (text: string) => void; update: (now: number) => void } {
  let text = '';
  const dyn = new DynTex(640, 180, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (!text) return;
    ctx.fillStyle = 'rgba(18,17,20,0.94)';
    // בועה + זנב
    roundRect(ctx, 8, 8, w - 16, h - 44, 20); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h - 40); ctx.lineTo(w / 2 + 18, h - 40); ctx.lineTo(w / 2 - 2, h - 6);
    ctx.closePath(); ctx.fill();
    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2efe9'; ctx.font = "500 30px 'Heebo',system-ui,sans-serif";
    wrapText(ctx, text, w / 2, h / 2 - 8, w - 60, 36, 2);
  });
  return { tex: dyn.tex, set: (t) => { if (t !== text) { text = t; dyn.markDirty(); } }, update: (now) => dyn.update(now) };
}

/** לוח המשימות הפיזי — קנבן 4 עמודות (מתוכנן → בעבודה → בביקורת → הושלם) */
export function makeTaskWallTexture(): { tex: THREE.CanvasTexture; set: (tasks: { id: string; title: string; status: string; assignee?: string; color?: string }[]) => void; update: (now: number) => void } {
  let tasks: { id: string; title: string; status: string; assignee?: string; color?: string }[] = [];
  const COLS: [string, string, string][] = [
    ['todo', 'מתוכנן', '#9aa0a8'],
    ['doing', 'בעבודה', '#d946ef'],
    ['review', 'בביקורת', '#fbbf24'],
    ['done', 'הושלם', '#34d399'],
  ];
  const dyn = new DynTex(1600, 860, (ctx, w, h) => {
    // לוח שעם כהה
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a3a2a'); g.addColorStop(1, '#3c2f22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // גרגר שעם
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * 0.05;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,220,160,${a})` : `rgba(0,0,0,${a})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2);
    }
    // חוק ה-RTL: הקנבן נקרא ימין→שמאל — העמודה הראשונה (מתוכנן) בצד ימין.
    // מראת אינדקס העמודה: x0 = (COLS.length-1-ci)*cw — בדיוק כחוק לוח-המשימות
    // שתוקן במשרד הדו-ממדי (הזרימה ימין→שמאל, לעולם לא שמאל→ימין).
    const cw = w / 4;
    COLS.forEach(([key, label, col], ci) => {
      const x0 = (COLS.length - 1 - ci) * cw;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x0 + 8, 74, cw - 16, h - 88);
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = col; ctx.font = "700 34px 'Heebo',system-ui,sans-serif";
      ctx.fillText(label, x0 + cw / 2, 40);
      ctx.fillRect(x0 + cw / 2 - 44, 62, 88, 3);
      // כרטיסים
      const cards = tasks.filter((t) => t.status === key).slice(0, 6);
      cards.forEach((t, i) => {
        const cy = 92 + i * 126;
        const cx = x0 + 18, cwid = cw - 36;
        ctx.fillStyle = 'rgba(245,240,230,0.96)';
        roundRect(ctx, cx, cy, cwid, 108, 10); ctx.fill();
        // פס מקצה בצבע המקבל
        ctx.fillStyle = t.color || col;
        roundRect(ctx, cx, cy, 10, 108, 5); ctx.fill();
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillStyle = '#26221c'; ctx.font = "600 21px 'Heebo',system-ui,sans-serif";
        // R54 — הכתובת נשארת-בתוך-הכרטיס (נמדד: גלישה-מחוץ-לכרטיס בכרטיסים
        // ארוכים) — חיתוך-מדידה לפי-רוחב-אמת + אליפסיס
        const maxW = cwid - 40;
        let tt = t.title;
        while (tt.length > 6 && ctx.measureText(tt).width > maxW) tt = tt.slice(0, -2);
        if (tt !== t.title) tt = tt.slice(0, -1) + '…';
        ctx.fillText(tt, cx + cwid - 22, cy + 34);
        ctx.fillStyle = '#6b6459'; ctx.font = "500 20px 'Heebo',system-ui,sans-serif";
        let asn = t.assignee || '';
        while (asn.length > 4 && ctx.measureText(asn).width > maxW) asn = asn.slice(0, -2);
        if (asn !== (t.assignee || '')) asn = asn.slice(0, -1) + '…';
        ctx.fillText(asn, cx + cwid - 22, cy + 74);
      });
    });
  });
  return {
    tex: dyn.tex,
    set: (ts) => {
      const sig = ts.map((t) => t.id + t.status + (t.assignee || '')).join('|');
      if (sig !== tasks.map((t) => t.id + t.status + (t.assignee || '')).join('|')) { tasks = ts; dyn.markDirty(); }
    },
    update: (now) => dyn.update(now),
  };
}

/** קיר הגיט — זרם קומיטים חי על מסך ענק */
export function makeGitWireTexture(): { tex: THREE.CanvasTexture; set: (commits: { hash: string; subject: string; author: string; ts: number }[]) => void; update: (now: number) => void } {
  let commits: { hash: string; subject: string; author: string; ts: number }[] = [];
  let clock = 0;
  const dyn = new DynTex(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#0a0d0a'; ctx.fillRect(0, 0, w, h);
    // רשת רקע
    ctx.strokeStyle = 'rgba(120,200,150,0.07)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8fe3ae'; ctx.font = "700 40px 'Heebo',system-ui,sans-serif";
    ctx.fillText('קיר הגיט · זרם הקומיטים של ספרי הצי', w - 28, 46);
    ctx.fillStyle = 'rgba(140,230,170,0.6)'; ctx.font = "500 24px ui-monospace,monospace";
    ctx.textAlign = 'left';
    ctx.fillText(clock > 0.5 ? '● streaming' : '○ streaming', 28, 46);
    const list = commits.slice(0, 12);
    list.forEach((c, i) => {
      const y = 120 + i * 46;
      ctx.textAlign = 'left'; ctx.direction = 'ltr';
      ctx.fillStyle = 'rgba(143,227,174,0.75)'; ctx.font = "500 24px ui-monospace,monospace";
      ctx.fillText(c.hash.slice(0, 7), 28, y);
      ctx.fillStyle = 'rgba(220,225,218,0.85)'; ctx.font = "500 26px 'Heebo',system-ui,sans-serif";
      const subj = c.subject.length > 46 ? c.subject.slice(0, 45) + '…' : c.subject;
      ctx.fillText(subj, 150, y);
      ctx.fillStyle = 'rgba(140,146,150,0.6)'; ctx.font = "400 22px 'Heebo',system-ui,sans-serif";
      ctx.textAlign = 'right';
      ctx.fillText(c.author, w - 28, y);
    });
    if (!list.length) {
      ctx.textAlign = 'center'; ctx.direction = 'rtl';
      ctx.fillStyle = 'rgba(150,155,150,0.5)'; ctx.font = "500 30px 'Heebo',system-ui,sans-serif";
      ctx.fillText('ממתין לזרם…', w / 2, h / 2);
    }
  });
  return {
    tex: dyn.tex,
    set: (cs) => { commits = cs; dyn.markDirty(); },
    update: (now) => { clock = (now / 700) % 2; dyn.update(now); },
  };
}

/** מסך לוח שנה/מדדים בקבלה */
export function makeReceptionScreen(): { tex: THREE.CanvasTexture; set: (s: { mode: string; provider: string; ops: number; goal?: string }) => void; update: (now: number) => void } {
  let info: { mode: string; provider: string; ops: number; goal?: string } = { mode: '…', provider: '…', ops: 0, goal: '' };
  const dyn = new DynTex(560, 380, (ctx, w, h) => {
    ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, w, h);
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#54d8c0'; ctx.font = "700 34px 'Heebo',system-ui,sans-serif";
    ctx.fillText('מצב המפקדה', w - 24, 44);
    ctx.fillStyle = info.mode.startsWith('live') ? '#34d399' : '#fbbf24';
    ctx.font = "700 30px 'Heebo',system-ui,sans-serif";
    ctx.fillText(info.mode, w - 24, 100);
    ctx.fillStyle = 'rgba(220,222,218,0.85)'; ctx.font = "500 26px 'Heebo',system-ui,sans-serif";
    ctx.fillText(`מוח: ${info.provider}`, w - 24, 154);
    ctx.fillText(`פעולות: ${info.ops}`, w - 24, 198);
    ctx.fillStyle = 'rgba(190,192,188,0.9)'; ctx.font = "400 24px 'Heebo',system-ui,sans-serif";
    wrapText(ctx, info.goal || '—', w - 24, 268, w - 48, 34, 3);
  });
  return { tex: dyn.tex, set: (s) => { info = s; dyn.markDirty(); }, update: (now) => dyn.update(now) };
}

// ─────────────── utils ───────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
    else cur = test;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

// ─────────────── Task 53 — אמנות-קיר (השוואה מול office3d/v2) ───────────────
// מנדט-הבעלים: "עיצוב משרד פסיכדלי אבל אלגנטי — קירות כמו טריפ-LSD פעיל
// אבל בעצימות-נמוכה, אומנותי, לא בולט ומבלבל, עדין ואלגנטי, וכמה תמונות
// קקטוסים, קצת עיצוב מעצב-פנים". הכל קנבס-פרוצדורלי — אפס נכסי-רשת
// (אותה משמעת של כל-החדר), פלטת-עבר רכה ורווי-נמוך על נייר-חם.

/** נייר-אמנות חם עם דגן עדין — בסיס אחיד לכל-ההדפסים */
function artPaper(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f4efe3');
  g.addColorStop(0.55, '#efe8d8');
  g.addColorStop(1, '#f6f1e5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  let rnd = 987654321 ^ seed;
  const rand = () => { rnd = (Math.imul(rnd, 1103515245) + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#8a7f6a' : '#ffffff';
    ctx.fillRect(rand() * w, rand() * h, 1.7, 1.7);
  }
  ctx.globalAlpha = 1;
}

/** הדפס פסיכדלי-עדין (variants 0..3) — זרימות-משי בעבר-רך, רווי-נמוך,
 *  קונטרסט-שקט: "טריפ בעצימות-נמוכה" שנותן חיים לקיר בלי לגנוב-את-העין. */
export function makePsyArtTexture(variant = 0): THREE.CanvasTexture {
  const W = 512, H = 672;
  const [c, ctx] = makeCanvas(W, H);
  artPaper(ctx, W, H, variant * 31 + 5);
  // פלטת-עבר: רוז-אבק, סייג', חול-זהב, לילך-מעומעם, תכלת-אפרסק — כולם רכים
  // Task 53-fix (נמדד-במסך): הגרסה-הראשונה יצאה כמעט-לבנה מרחוק (אלפא 0.32-0.50
  // על נייר-קרם + תאורת-יום 2.7). כאן: אלפא 0.58-0.88 — "עדין-אך-נראה".
  const pal = [
    ['rgba(206,142,132,0.88)', 'rgba(128,160,142,0.78)', 'rgba(200,172,104,0.72)', 'rgba(156,136,180,0.68)', 'rgba(118,152,168,0.62)'],
    ['rgba(156,136,180,0.82)', 'rgba(206,142,132,0.74)', 'rgba(118,152,168,0.70)', 'rgba(128,160,142,0.64)', 'rgba(200,172,104,0.58)'],
    ['rgba(200,172,104,0.80)', 'rgba(118,152,168,0.76)', 'rgba(206,142,132,0.70)', 'rgba(156,136,180,0.64)', 'rgba(128,160,142,0.60)'],
    ['rgba(128,160,142,0.84)', 'rgba(200,172,104,0.74)', 'rgba(156,136,180,0.70)', 'rgba(206,142,132,0.64)', 'rgba(118,152,168,0.58)'],
  ][variant % 4];
  // גוף-הדפס: שטיפת-צבע רכה מאחורי-המוטיב (נותן להדפס "בשר" ולא קווים על נייר)
  const bodyWash = ctx.createRadialGradient(W * 0.5, H * 0.44, 40, W * 0.5, H * 0.5, W * 0.72);
  bodyWash.addColorStop(0, pal[variant % pal.length].replace(/0\.\d+\)$/, '0.30)'));
  bodyWash.addColorStop(1, 'rgba(244,239,227,0)');
  ctx.fillStyle = bodyWash;
  ctx.fillRect(0, 0, W, H);
  if (variant % 4 === 0 || variant % 4 === 2) {
    // זרימות-אופק — סרטי-משי חוצי-הדף עם סחיפת-פאזה
    const horiz = variant % 4 === 0;
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      ctx.beginPath();
      const amp = 26 + 16 * Math.sin(t * Math.PI);
      const base = horiz ? t * H : t * W;
      for (let s = 0; s <= 220; s++) {
        const u = s / 220;
        const w = 1 + 0.55 * Math.sin(u * 9.2 + i * 0.62) + 0.3 * Math.sin(u * 17.7 + i * 1.31);
        const x = horiz ? u * W : base + w * amp;
        const y = horiz ? base + w * amp : (1 - u) * H;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = pal[i % pal.length];
      ctx.lineWidth = 3.2 + 3.8 * Math.abs(Math.sin(i * 1.7));
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  } else if (variant % 4 === 1) {
    // פריחה-רדיאלית — עלי-כותרת קשתיים מלב-ההדפס
    const cx = W * 0.5, cy = H * 0.46;
    for (let ring = 0; ring < 5; ring++) {
      const r0 = 44 + ring * 52;
      const n = 10 + ring * 3;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + ring * 0.23;
        const a1 = a0 + (Math.PI * 2 / n) * 0.62;
        ctx.beginPath();
        ctx.arc(cx, cy, r0, a0, a1);
        ctx.arc(cx, cy, r0 * 0.55, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = pal[(ring + i) % pal.length];
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(244,239,227,0.92)';
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fill();
  } else {
    // היתוך-גלים — שדה-התאבכות רך (מוואות עדינות)
    for (let y = 0; y < H; y += 7) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const v = Math.sin(x * 0.016 + y * 0.045) + Math.sin(x * 0.031 - y * 0.021 + 2.1) + Math.sin(y * 0.017 + 4.2);
        const yy = y + v * 19;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = pal[Math.floor(y / 46) % pal.length];
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }
  }
  // ויניטה עדינה — עומק אופטי של הדפס-אמיתי
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(60,50,36,0)');
  vig.addColorStop(1, 'rgba(60,50,36,0.14)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  // מסגרת-נייר פנימית עדינה (מרווח-מאונטינג)
  ctx.strokeStyle = 'rgba(120,106,84,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  return finish(c);
}

/** הדפס קקטוס (variants 0..2) — מינימליזם מדברי אלגנטי על נייר-חם */
export function makeCactusArtTexture(variant = 0): THREE.CanvasTexture {
  const W = 512, H = 672;
  const [c, ctx] = makeCanvas(W, H);
  artPaper(ctx, W, H, variant * 57 + 11);
  const green = '#5c7a54';
  const greenDark = '#46613f';
  if (variant % 3 === 0) {
    // סגוארו בשקיעת-חול — צללית מינימלית + דיסק-שמש
    const sky = ctx.createLinearGradient(0, 90, 0, H - 130);
    sky.addColorStop(0, 'rgba(226,196,150,0.55)');
    sky.addColorStop(1, 'rgba(214,164,156,0.34)');
    ctx.fillStyle = sky;
    ctx.fillRect(56, 90, W - 112, H - 240);
    ctx.fillStyle = 'rgba(240,232,210,0.95)';
    ctx.beginPath(); ctx.arc(W * 0.62, 200, 44, 0, 7); ctx.fill();
    ctx.fillStyle = greenDark;
    // גוף
    roundRect(ctx, W * 0.46, 190, 34, 330, 17); ctx.fill();
    // זרוע שמאל (זקופה-מעוקלת)
    roundRect(ctx, W * 0.46 - 52, 300, 30, 120, 15); ctx.fill();
    roundRect(ctx, W * 0.46 - 52, 268, 56, 30, 15); ctx.fill();
    // זרוע ימין נמוכה
    roundRect(ctx, W * 0.46 + 56, 350, 28, 96, 14); ctx.fill();
    roundRect(ctx, W * 0.46 + 34, 350, 50, 28, 14); ctx.fill();
    // קרקע
    ctx.fillStyle = 'rgba(120,106,84,0.5)';
    ctx.fillRect(56, H - 152, W - 112, 3);
    for (let i = 0; i < 5; i++) ctx.fillRect(90 + i * 74, H - 150, 20 + (i % 3) * 12, 2.4);
  } else if (variant % 3 === 1) {
    // קקטוס-סיר בקו-אמן — אגס-קוצים בסיר טרהקוטה
    const cx = W * 0.5;
    ctx.strokeStyle = 'rgba(96,84,64,0.75)';
    ctx.lineWidth = 3.4;
    // סיר
    ctx.beginPath();
    ctx.moveTo(cx - 74, H - 250); ctx.lineTo(cx + 74, H - 250);
    ctx.lineTo(cx + 58, H - 140); ctx.lineTo(cx - 58, H - 140);
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(190,124,92,0.6)';
    ctx.fill();
    // אדן-סיר
    ctx.strokeRect(cx - 84, H - 268, 168, 20);
    // כרית-מצע
    ctx.fillStyle = 'rgba(110,92,66,0.55)';
    ctx.fillRect(cx - 70, H - 272, 140, 8);
    // אגס-קוצים — כרי-דשא מעוגלים
    const pads: [number, number, number, number][] = [
      [cx, H - 330, 64, 84], [cx - 74, H - 392, 52, 66], [cx + 70, H - 420, 50, 62], [cx - 20, H - 486, 44, 56],
    ];
    for (const [px, py, pw, ph] of pads) {
      ctx.beginPath(); ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, 7);
      ctx.fillStyle = green; ctx.fill();
      ctx.strokeStyle = 'rgba(70,97,63,0.8)'; ctx.lineWidth = 2.6; ctx.stroke();
    }
    // קוצים עדינים
    ctx.strokeStyle = 'rgba(246,242,228,0.85)'; ctx.lineWidth = 1.6;
    for (const [px, py, pw, ph] of pads) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + px;
        const x0 = px + Math.cos(a) * (pw / 2 - 7), y0 = py + Math.sin(a) * (ph / 2 - 7);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * 7, y0 + Math.sin(a) * 7); ctx.stroke();
      }
    }
  } else {
    // קקטוס-חבית גיאומטרי — צלעות-מניפה + כתר-פרח
    const cx = W * 0.5, cy = H * 0.52;
    ctx.fillStyle = green;
    ctx.beginPath(); ctx.ellipse(cx, cy, 108, 148, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(70,97,63,0.75)'; ctx.lineWidth = 2.8;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + i * 21, cy, 14, 148 * Math.cos((i / 5.2) * (Math.PI / 2)) * 0.96, 0, 0, 7);
      ctx.stroke();
    }
    // כתר
    ctx.fillStyle = 'rgba(214,164,156,0.9)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 24, cy - 138 + Math.sin(a) * 10, 8.5, 0, 7); ctx.fill();
    }
    // קוצי-צלע
    ctx.strokeStyle = 'rgba(246,242,228,0.8)'; ctx.lineWidth = 1.5;
    for (let i = -4; i <= 4; i++) {
      for (let j = 0; j < 6; j++) {
        const yy = cy - 120 + j * 48;
        const xx = cx + i * 21;
        if (Math.abs(i * 21) < 108 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - cy) / 148, 2))) - 10) {
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 4.5, yy - 4.5); ctx.stroke();
        }
      }
    }
    // קרקע
    ctx.fillStyle = 'rgba(120,106,84,0.5)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 172, 130, 12, 0, 0, 7); ctx.fill();
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(60,50,36,0)');
  vig.addColorStop(1, 'rgba(60,50,36,0.14)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,106,84,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  return finish(c);
}
