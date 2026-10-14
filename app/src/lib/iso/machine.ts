/**
 * machine.ts — מכונת-האמת של SAOS — מודל-גיאומטריה טהור (דפוס rig.ts של anatomy).
 *
 * חוק-האמת: כל-מספר שהמכונה מציגה מגיע מ-/api/giant/dex בלבד. אפס המצאה, כשל = כנות.
 * עולם: יחידות ≈ px, x/y על-הרצפה, z למעלה. מצלמה איזומטרית, azimuth 45° ± 15°.
 *
 * שכבות:
 *  - computeBuild(azimuth): מקרין את כל-החלקים הסטטיים למחרוזות-SVG (chunks) + עוגנים לתנועה.
 *  - buildMachine(data): מתרגם מדידה אמיתית למטרות-תנועה (רמות-נוזל, מחט, ספרות, מגירות, דגל).
 *
 * צבעוניות: גווני-zinc על כרטיס zinc-950, מבטא-יחיד (lit) = ענבר #f59e0b לנוזל-הספר.
 */
import {
  axisVector,
  boxCorners,
  circleRing,
  corners,
  depthOf,
  dotsSvg,
  extrude,
  faceTextSvg,
  fitProjection,
  insetPlan,
  iso,
  knurl,
  lineOnTop,
  lineSvg,
  pathOf,
  planOutline,
  radialTicks,
  ring,
  segment,
  sideArc,
  sideMatrix,
  slabOf,
  solidSvg,
  topMatrix,
  topTicks,
  type Flat,
  type Plane,
  type Plan,
  type Point3,
  type Projection,
  type SolidPaths,
} from "@/components/iso/iso-kit";

/* ── canvas & camera ──────────────────────────────────────────────────────── */

export const WIDTH = 780;
export const HEIGHT = 500;
export const REST_AZIMUTH = 45;
export const AZIMUTH_SPAN = 15;

/* ── world layout ─────────────────────────────────────────────────────────── */

const BASE: Plan = { x: -152, y: -82, w: 306, d: 164, r: 9 };
const BASE_H = 12;
const FOOT_H = 6;

const PLINTH: Plan = { x: -128, y: -64, w: 150, d: 42, r: 4 };
const TANK_Y = -43;
const TANK_R = 15;
const TANK_X = [-103, -53, -3];
const TUBE_R = 3;
const TUBE_Y = TANK_Y + 17.2;
const TUBE_Z0 = 6.2;
const TUBE_Z1 = 48;
/** חשיפה לרכיב-החיים: טווח-הגובה של הנוזל בקופות (level 0..1 → z) */
export const LIQUID_Z0 = TUBE_Z0;
export const LIQUID_Z1 = TUBE_Z1;
const TUBE_LIQUID_R = 2.2;
const SCALE_MAX_M = 21; // קנה-המידה של הקופות = התקרה כולה (מיליוני SAOS)

const ODO = {
  bed: { x: -36, y: 34, w: 88, d: 24, r: 3 } as Plan,
  drumY: 47,
  drumZ: 8.3,
  drumR: 4.6,
  drumHalf: 4,
  digitY: 51.7,
  centers: [-22, -10, 2, 14, 26, 38],
  winZ0: 4.4,
  winZ1: 12.2,
  winX0: -29,
  winX1: 45,
  pitch: 6.4,
  font: 5.4,
};

const HOPPER: Plan = { x: -98, y: 42, w: 30, d: 26, r: 2.5 };
const BOX: Plan = { x: -62, y: 46, w: 26, d: 22, r: 2 };
const STEPS: { x: number; top: number }[] = [
  { x: -82, top: 12.6 },
  { x: -75, top: 10.6 },
  { x: -68, top: 8.6 },
];
const COIN_REST: Point3 = [-49, 57, 3.2];
const COIN_R = 5;
const COIN_WAY: Point3[] = [
  [-86, 56, 12.8],
  [-82, 56, 13.4],
  [-75, 56, 11.4],
  [-68, 56, 9.4],
  [-55, 56, 12.4],
  COIN_REST,
];
export const COIN_SEGS = [0.1, 0.16, 0.16, 0.22, 0.3];

const GAUGE = { cx: 64, cy: 14, faceZ: 25, r: 16, needleR: 11.3, fullScale: 10 };

const CHEST: Plan = { x: 92, y: -30, w: 50, d: 56, r: 3 };
export const DRAWER_SLOTS = 5;
const DRAWER_TRAVEL = 20;

const FLAG = { x: 129, y: -58, top: 42 };

/* ── data contract ────────────────────────────────────────────────────────── */

export interface MachineSupply {
  genesisHuman: number | null;
  totalHuman: number | null;
  capHuman: number | null;
  pctOfCap: number | null;
}
export interface MachineDrawer {
  pair: string;
  volumeMu: number;
}
export interface MachineData {
  ok: boolean;
  height: number | null;
  feeMeter: number | null; // mu (אלפיות USDS), כפי שה-API מוסר
  fills: number | null; // מילויים ביום-המדידה האחרון
  swaps: number | null;
  treasuryMu: number | null;
  ordersOpen: number | null;
  supply: MachineSupply | null;
  drawers: MachineDrawer[];
  halted: boolean | null;
  savedAt: string | null;
  sha16: string | null;
}

export interface MachineTargets {
  levels: [number, number]; // חלק יחסי מקנה-המידה (0..1): קופה-1 = מינט-פתיחה, קופה-2 = ספר-המנוע
  needle: number | null; // 0..1 על פני-המד
  digits: number[] | null; // 6 ספרות גובה
  drawers: number[]; // הארכה 0..1 לכל מגירה
  halted: boolean | null;
}

const fraction = (part: number | null | undefined, whole: number | null | undefined) =>
  typeof part === "number" && typeof whole === "number" && whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0;

export function buildMachine(data: MachineData): MachineTargets {
  const supply = data.supply;
  const cap = supply?.capHuman ?? null;
  const book = supply?.pctOfCap != null ? Math.max(0, Math.min(1, supply.pctOfCap / 100)) : fraction(supply?.totalHuman, cap);
  const genesis = fraction(supply?.genesisHuman, cap);
  const needle =
    typeof data.feeMeter === "number" && data.feeMeter >= 0
      ? Math.max(0, Math.min(1, data.feeMeter / (GAUGE.fullScale * 1000)))
      : null;
  let digits: number[] | null = null;
  if (typeof data.height === "number" && data.height >= 0) {
    digits = String(Math.floor(data.height))
      .padStart(6, "0")
      .slice(-6)
      .split("")
      .map((d) => Number(d));
  }
  const maxVol = data.drawers.reduce((m, d) => Math.max(m, d.volumeMu), 0);
  const drawers = Array.from({ length: DRAWER_SLOTS }, (_, i) =>
    maxVol > 0 && data.drawers[i] ? Math.max(0.05, Math.min(1, data.drawers[i]!.volumeMu / maxVol)) : 0,
  );
  return { levels: [genesis, book], needle, digits, drawers, halted: data.halted };
}

/* ── geometry helpers ─────────────────────────────────────────────────────── */

function hull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Flat[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Flat[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const byDepth = (pts: Plane[], P: Projection) =>
  [...pts].sort((a, b) => depthOf([a[0]!, a[1]!, 0], P) - depthOf([b[0]!, b[1]!, 0], P));

const rectFill = (quad: Plane[], z: number, P: Projection, shade = 0) =>
  `<path class="iso-shade" data-shade="${shade}" d="${pathOf(quad.map(([x, y]) => iso([x, y, z], P)), true)}"/>`;

const rectLine = (quad: Plane[], z: number, P: Projection) => lineSvg(pathOf(quad.map(([x, y]) => iso([x, y, z], P)), true));

/** תוף אופקי (ציר-x): גליל בין x0 ל-x1, מעגל במישור y/z — למונה-הגובה. */
interface DrumPaths {
  fill: string;
  bands: string[];
  cap: string;
}
function drumX(x0: number, x1: number, cy: number, cz: number, r: number, P: Projection, steps = 28): DrumPaths {
  const front: Flat[] = [];
  const back: Flat[] = [];
  const tones: number[] = [];
  const a = ((P.azimuth ?? 45) * Math.PI) / 180;
  const L = [-Math.sin(a) * 0.9, Math.cos(a) * 0.9, 1.1];
  const Ln = Math.hypot(L[0], L[1], L[2]);
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const y = cy + r * Math.cos(th);
    const z = cz + r * Math.sin(th);
    front.push(iso([x1, y, z], P));
    back.push(iso([x0, y, z], P));
    const dot = (L[1] * Math.cos(th) + L[2] * Math.sin(th)) / Ln;
    tones.push(Math.max(0, Math.min(3, Math.floor((dot * 0.5 + 0.5) * 4))));
  }
  const fill = pathOf(hull([...front, ...back]), true);
  const buckets: string[][] = [[], [], [], []];
  for (let i = 0; i < steps; i++) {
    const j = (i + 1) % steps;
    buckets[tones[i]!].push(pathOf([front[i]!, front[j]!, back[j]!, back[i]!], true));
  }
  return { fill, bands: buckets.map((b) => b.join("")), cap: pathOf(front, true) };
}

const drumSvg = (d: DrumPaths, tone: "mid" | "lo" = "mid") =>
  `<g class="iso-solid">` +
  `<path class="iso-fill" d="${d.fill}"/>` +
  d.bands.map((b, i) => (b ? `<path class="iso-shade" data-shade="${i}" d="${b}"/>` : "")).join("") +
  `<path class="iso-top" d="${d.cap}"/>` +
  `<path class="iso-line iso-crease" data-tone="faint" d="${d.cap}"/>` +
  `<path class="iso-line iso-edge" data-tone="${tone}" d="${d.fill}"/>` +
  `</g>`;

/** נוזל בצינורית-המפלס: טבעת-תחתית מוקרנת פעם-אחת; הגובה מוזז בכל פריים. */
export interface LiquidRig {
  bottom: Flat[];
  bandIdx: number[][];
  ezY: number;
  zBase: number;
  amber: boolean;
  pointerFrom: Point3;
  pointerTo: Point3;
}
export function liquidPaths(rig: LiquidRig, z: number): { fill: string; bands: string[]; top: string; edge: string } {
  const dz = rig.ezY * (z - rig.zBase);
  const top = rig.bottom.map(([x, y]) => [x, y + dz] as Flat);
  const fill = pathOf(hull([...rig.bottom, ...top]), true);
  const bands = rig.bandIdx.map((idx) => {
    if (idx.length < 2) return "";
    const run: number[] = [];
    for (const i of idx) if (run[run.length - 1] !== i) run.push(i);
    if (run.length < 2) return "";
    const bottomSide = run.map((i) => rig.bottom[i]!);
    const topSide = [...run].reverse().map((i) => top[i]!);
    return pathOf([...bottomSide, ...topSide], true);
  });
  return { fill, bands, top: pathOf(top, true), edge: fill };
}

/* ── projection (קנה-מידה קבוע לכל טווח ה-azimuth) ────────────────────────── */

function fitPoints(): Point3[] {
  return [
    ...boxCorners(BASE, -BASE_H - FOOT_H, 0),
    ...TANK_X.flatMap((cx) => boxCorners({ x: cx - 17, y: TANK_Y - 17, w: 34, d: 34, r: 0 }, 50, 53)),
    ...boxCorners({ x: 122, y: -64, w: 16, d: 14, r: 0 }, 0, FLAG.top),
    ...boxCorners({ x: CHEST.x, y: CHEST.y, w: CHEST.w, d: CHEST.d + DRAWER_TRAVEL + 4, r: 0 }, 0, 30),
    ...boxCorners(HOPPER, 0, 27),
    ...boxCorners({ x: 44, y: -6, w: 44, d: 36, r: 0 }, 0, GAUGE.faceZ),
    ...boxCorners(ODO.bed, 0, 16),
  ];
}

export function projectionAt(azimuth: number): Projection {
  const pts = fitPoints();
  const pad = 26;
  const unit: Projection = { origin: [0, 0], scale: 1, azimuth, elevation: 30 };
  const needed = (az: number) => {
    const flat = pts.map((p) => iso(p, { ...unit, azimuth: az }));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    return Math.min(
      (WIDTH - pad * 2) / (Math.max(...xs) - Math.min(...xs)),
      (HEIGHT - pad * 2) / (Math.max(...ys) - Math.min(...ys)),
    );
  };
  const scale = Math.min(needed(REST_AZIMUTH), needed(REST_AZIMUTH - AZIMUTH_SPAN), needed(REST_AZIMUTH + AZIMUTH_SPAN));
  const base = fitProjection(pts, WIDTH, HEIGHT, { pad, azimuth: REST_AZIMUTH });
  return { origin: base.origin, scale, azimuth, elevation: 30 };
}

/* ── build ────────────────────────────────────────────────────────────────── */

export interface CoinPaths {
  fill: string;
  bands: string[];
  top: string;
  edge: string;
}
export interface Anchors {
  liquids: (LiquidRig | null)[];
  needle: { cx: number; cy: number; z: number; r: number } | null;
  coin: { screen: Flat[]; rest: Flat; paths: CoinPaths };
  drums: string[];
  clip: { x: number; y: number; w: number; h: number };
  drawerVec: Flat;
  paddleVec: Flat;
  pennant: string;
}
export interface MachineBuild {
  azimuth: number;
  chunks: Record<string, string>;
  drawers: string[];
  anchors: Anchors;
}

function baseChunk(P: Projection): string {
  const parts: string[] = [];
  parts.push(`<path class="iso-halo" d="${slabOf(BASE, -BASE_H - FOOT_H, BASE_H, P).fill}"/>`);
  for (const [x, y] of byDepth(corners(BASE, 20), P)) {
    parts.push(solidSvg(extrude(circleRing(x, y, 7, 28), -BASE_H - FOOT_H, 1.6, P), { tone: "lo", crease: "none" }));
    parts.push(solidSvg(extrude(circleRing(x, y, 5.4, 28), -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P), { tone: "mid", crease: "none" }));
  }
  parts.push(solidSvg(slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "mid" }));
  parts.push(lineSvg(planOutline(insetPlan(BASE, 5), 0, P), { tone: "lo" }));
  for (const [x, y] of corners(BASE, 8)) {
    parts.push(lineSvg(ring(x, y, 2.2, 0, P, 16), { tone: "lo" }));
    parts.push(dotsSvg([iso([x, y, 0], P)], { size: 0.5, tone: "mid" }));
  }
  /* סרט-מד לאורך השפה הקדמית: טיק כל 5 יחידות, מאיור כל 5-טיקים, סימן-אפס בולט */
  const strip: Plan = { x: -138, y: 64, w: 276, d: 10, r: 1 };
  parts.push(solidSvg(slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = topTicks(-132, 132, 5, 5, 64.6, 0.6, [1.8, 3.2], P);
  parts.push(lineSvg(ticks.minor, { tone: "lo" }));
  parts.push(lineSvg(ticks.major, { tone: "mid" }));
  parts.push(lineSvg(lineOnTop([0, 64.4], [0, 68.2], 0.6, P), { tone: "hi" }));

  /* לוחית-שם חרוטה: SAOS · DEX · אמת — שלושה קווי-משיל + שני ברגים */
  const plate: Plan = { x: -142, y: 40, w: 46, d: 20, r: 2 };
  parts.push(solidSvg(slabOf(plate, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  parts.push(lineSvg(planOutline(insetPlan(plate, 1.6), 0.8, P), { tone: "faint" }));
  parts.push(
    lineSvg(
      [0, 1, 2]
        .map((row) => lineOnTop([-136, 44.4 + row * 3.4], [-136 + (row === 1 ? 24 : 34), 44.4 + row * 3.4], 0.8, P))
        .join(""),
      { tone: "lo", free: true },
    ),
  );
  parts.push(dotsSvg([iso([-139, 50, 0.8], P), iso([-99, 50, 0.8], P)], { size: 0.45, tone: "mid" }));
  parts.push(faceTextSvg(topMatrix([-119, 47.6], 0.8, P, "x"), "SAOS · DEX · אמת", { size: 3.2, tone: "hi", anchor: "middle" }));
  return parts.join("");
}

function tanksChunk(P: Projection): string {
  const parts: string[] = [];
  parts.push(solidSvg(slabOf(PLINTH, 0, 4, P, 6, 0.8), { tone: "lo" }));
  parts.push(lineSvg(planOutline(insetPlan(PLINTH, 4), 4, P), { tone: "faint" }));
  parts.push(dotsSvg(corners(PLINTH, 6).map(([x, y]) => iso([x, y, 4], P)), { size: 0.45, tone: "mid" }));
  TANK_X.forEach((cx, index) => {
    const capTank = index === 2;
    /* טבעת-יסוד, גוף, תפרים וקשתות-סקלה (5M..20M על קנה-התקרה), גג ופתח-אוורור */
    parts.push(solidSvg(extrude(circleRing(cx, TANK_Y, 16.6, 28), 4, 1.4, P), { tone: "lo", crease: "none" }));
    const seams = [14, 40].map((z) => sideArc(cx, TANK_Y, TANK_R, z, P)).join("");
    const scaleArcs = [5, 10, 15, 20]
      .map((m) => sideArc(cx, TANK_Y, TANK_R, TUBE_Z0 + (m / SCALE_MAX_M) * (TUBE_Z1 - TUBE_Z0), P))
      .join("");
    parts.push(
      solidSvg(extrude(circleRing(cx, TANK_Y, TANK_R, 28), 4, 46, P), { tone: "mid", inner: lineSvg(seams + scaleArcs, { tone: "lo" }) }),
    );
    parts.push(solidSvg(extrude(circleRing(cx, TANK_Y, 16.4, 28), 50, 3, P, { bevel: 0.8 }), { tone: "mid" }));
    parts.push(solidSvg(extrude(circleRing(cx, TANK_Y, 2.4, 12), 53, 2.2, P), { tone: "hi", crease: "none" }));
    if (capTank) parts.push(lineSvg(ring(cx, TANK_Y, 16.9, 49.6, P, 40), { tone: "hi" }));
    /* צינורית-מפלס קדמית על שני תומכים */
    parts.push(solidSvg(slabOf({ x: cx - 4.5, y: -37.5, w: 9, d: 9.5, r: 1 }, 8, 4, P, 3, 0.4), { tone: "mid" }));
    parts.push(solidSvg(slabOf({ x: cx - 4.5, y: -37.5, w: 9, d: 9.5, r: 1 }, 42, 4, P, 3, 0.4), { tone: "mid" }));
    parts.push(solidSvg(extrude(circleRing(cx, TUBE_Y, TUBE_R, 20), TUBE_Z0 - 0.7, TUBE_Z1 - TUBE_Z0 + 1.4, P), { tone: "lo" }));
    parts.push(lineSvg(ring(cx, TUBE_Y, TUBE_R, TUBE_Z1 + 0.7, P, 20), { tone: "lo" }));
  });
  return parts.join("");
}

function chuteAChunk(P: Projection): string {
  const parts: string[] = [];
  for (const [x, y] of byDepth([[-92, 47], [-92, 62], [-74, 62], [-74, 47]] as Plane[], P)) {
    parts.push(solidSvg(extrude(circleRing(x, y, 3.2, 16), 0, 1.2, P), { tone: "lo", crease: "none" }));
    parts.push(solidSvg(extrude(circleRing(x, y, 1.8, 12), 1.2, 12.8, P), { tone: "mid", crease: "none" }));
  }
  parts.push(
    solidSvg(slabOf(HOPPER, 14, 13, P, 5, 0.8), {
      tone: "mid",
      inner: lineSvg(sideArc(-83, 55, 12, 22, P), { tone: "faint" }),
    }),
  );
  parts.push(rectFill(corners(insetPlan(HOPPER, 2.5)), 27.05, P, 0));
  parts.push(lineSvg(planOutline(insetPlan(HOPPER, 2.5), 27.1, P), { tone: "lo" }));
  parts.push(solidSvg(extrude(circleRing(-86, 55, 4.5, 16), 12.8, 1.6, P), { tone: "mid" }));
  /* ידית-הזנה מחורצת עם סמן */
  parts.push(solidSvg(extrude(circleRing(-83, 41, 2.8, 16), 16.5, 4, P), { tone: "mid" }));
  parts.push(lineSvg(knurl(-83, 41, 2.8, 16.5, 20.5, 16, P), { tone: "lo" }));
  parts.push(lineSvg(lineOnTop([-85.4, 41], [-80.4, 41], 20.5, P), { tone: "hi" }));
  for (const { x, top } of STEPS) {
    parts.push(solidSvg(slabOf({ x: x - 3.5, y: 51, w: 7, d: 9, r: 0.8 }, 0, top, P, 3, 0.5), { tone: "mid" }));
  }
  /* קופסת-קבלה: מגש + שלושה קירות; הקיר-הקדמי ב-chunk B (מסתיר את המטבע מבפנים) */
  parts.push(solidSvg(slabOf(BOX, 0, 3.2, P, 4, 0.5), { tone: "lo" }));
  parts.push(rectFill(corners(insetPlan(BOX, 0.8)), 3.25, P, 0));
  parts.push(solidSvg(slabOf({ x: BOX.x, y: BOX.y, w: BOX.w, d: 3.5, r: 1 }, 3.2, 7.8, P, 3, 0.4), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: BOX.x, y: BOX.y, w: 3.5, d: BOX.d, r: 1 }, 3.2, 7.8, P, 3, 0.4), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: BOX.x + BOX.w - 3.5, y: BOX.y, w: 3.5, d: BOX.d, r: 1 }, 3.2, 7.8, P, 3, 0.4), { tone: "mid" }));
  parts.push(dotsSvg([iso([BOX.x + 2, BOX.y + 1.8, 11], P), iso([BOX.x + BOX.w - 2, BOX.y + 1.8, 11], P)], { size: 0.45, tone: "mid" }));
  return parts.join("");
}

function chuteBChunk(P: Projection): string {
  return [
    solidSvg(slabOf({ x: BOX.x, y: BOX.y + BOX.d - 3.5, w: BOX.w, d: 3.5, r: 1 }, 3.2, 7.8, P, 3, 0.4), { tone: "mid" }),
    dotsSvg([iso([BOX.x + 2, BOX.y + BOX.d - 1.8, 11], P), iso([BOX.x + BOX.w - 2, BOX.y + BOX.d - 1.8, 11], P)], { size: 0.45, tone: "mid" }),
  ].join("");
}

function odoChunk(P: Projection): string {
  const parts: string[] = [];
  parts.push(solidSvg(slabOf(ODO.bed, 0, 3, P, 4, 0.5), { tone: "mid" }));
  parts.push(dotsSvg(corners(ODO.bed, 4).map(([x, y]) => iso([x, y, 3], P)), { size: 0.45, tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: ODO.bed.x, y: ODO.bed.y, w: 6, d: ODO.bed.d, r: 2 }, 0, 15.6, P, 3, 0.5), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: ODO.bed.x + ODO.bed.w - 6, y: ODO.bed.y, w: 6, d: ODO.bed.d, r: 2 }, 0, 15.6, P, 3, 0.5), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: ODO.bed.x, y: ODO.bed.y, w: ODO.bed.w, d: ODO.bed.d, r: 3 }, 13.6, 2, P, 4, 0.5), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: -30, y: 34, w: 76, d: 4, r: 1.5 }, 3, 10.6, P, 3), { tone: "lo", crease: "none" }));
  parts.push(drumSvg(drumX(-32, 46, ODO.drumY, ODO.drumZ, 1.4, P, 16), "lo"));
  for (const x of [-16, -4, 8, 20, 32]) parts.push(drumSvg(drumX(x - 0.35, x + 0.35, ODO.drumY, ODO.drumZ, 5.2, P, 24)));
  for (const cx of ODO.centers) parts.push(drumSvg(drumX(cx - ODO.drumHalf, cx + ODO.drumHalf, ODO.drumY, ODO.drumZ, ODO.drumR, P)));
  const flat = [
    iso([ODO.winX0, 55, ODO.winZ0], P),
    iso([ODO.winX1, 55, ODO.winZ0], P),
    iso([ODO.winX1, 55, ODO.winZ1], P),
    iso([ODO.winX0, 55, ODO.winZ1], P),
  ];
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const clip = {
    x: (Math.min(...xs) - 1).toFixed(1),
    y: (Math.min(...ys) - 1).toFixed(1),
    w: (Math.max(...xs) - Math.min(...xs) + 2).toFixed(1),
    h: (Math.max(...ys) - Math.min(...ys) + 2).toFixed(1),
  };
  parts.unshift(
    `<defs><clipPath id="sm-odo-win"><rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}"/></clipPath></defs>`,
  );
  return parts.join("");
}

function odoFrontChunk(P: Projection): string {
  return [
    solidSvg(slabOf({ x: -30, y: 55, w: 76, d: 4, r: 0.6 }, 3, 1.4, P, 2, 0.3), { tone: "mid", crease: "none" }),
    solidSvg(slabOf({ x: -30, y: 55, w: 76, d: 4, r: 0.6 }, ODO.winZ1, 1.4, P, 2, 0.3), { tone: "mid", crease: "none" }),
  ].join("");
}

function flagChunk(P: Projection): string {
  const parts: string[] = [];
  parts.push(solidSvg(slabOf({ x: 122, y: -64, w: 14, d: 12, r: 2 }, 0, 2, P, 3, 0.4), { tone: "lo" }));
  parts.push(dotsSvg([iso([125.5, -61.5, 2], P), iso([132.5, -54.5, 2], P)], { size: 0.45, tone: "mid" }));
  parts.push(
    solidSvg(extrude(circleRing(FLAG.x, FLAG.y, 1.4, 16), 2, FLAG.top - 2, P), {
      tone: "mid",
      crease: "none",
      inner: lineSvg([12, 24, 34].map((z) => sideArc(FLAG.x, FLAG.y, 1.4, z, P, 12)).join(""), { tone: "faint" }),
    }),
  );
  parts.push(solidSvg(slabOf({ x: 126.8, y: -60.6, w: 4.4, d: 1.4, r: 0.6 }, 10, 1.6, P, 2), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: FLAG.x, y: -58.9, w: 8.5, d: 0.9, r: 0.4 }, 37, 1.7, P, 2), { tone: "mid", crease: "none" }));
  parts.push(lineSvg(pathOf([iso([FLAG.x + 0.4, -58.4, 33.5], P), iso([FLAG.x + 7.4, -58.4, 37.6], P)]), { tone: "lo" }));
  return parts.join("");
}

function gaugeChunk(P: Projection): string {
  const parts: string[] = [];
  const stand: Plan = { x: 46, y: 1, w: 36, d: 26, r: 3 };
  parts.push(solidSvg(slabOf(stand, 0, 10, P, 4, 0.6), { tone: "lo" }));
  parts.push(dotsSvg(corners(stand, 4).map(([x, y]) => iso([x, y, 10], P)), { size: 0.45, tone: "mid" }));
  parts.push(solidSvg(extrude(circleRing(GAUGE.cx, GAUGE.cy, 4, 20), 10, 6, P), { tone: "mid", crease: "none" }));
  parts.push(
    solidSvg(extrude(circleRing(GAUGE.cx, GAUGE.cy, GAUGE.r, 44), 16, 9, P), {
      tone: "mid",
      inner: lineSvg(sideArc(GAUGE.cx, GAUGE.cy, GAUGE.r, 22, P) + sideArc(GAUGE.cx, GAUGE.cy, GAUGE.r, 24.2, P), { tone: "faint" }),
    }),
  );
  parts.push(lineSvg(knurl(GAUGE.cx, GAUGE.cy, GAUGE.r, 22.4, 25, 44, P), { tone: "faint" }));
  parts.push(lineSvg(ring(GAUGE.cx, GAUGE.cy, 14.8, GAUGE.faceZ, P, 44), { tone: "lo" }));
  parts.push(lineSvg(ring(GAUGE.cx, GAUGE.cy, 13.2, GAUGE.faceZ, P, 44), { tone: "faint" }));
  const ticks = radialTicks(GAUGE.cx, GAUGE.cy, 12.4, 36, 5, GAUGE.faceZ, [1.7, 3.1], P, (-135 * Math.PI) / 180, (270 * Math.PI) / 180);
  parts.push(lineSvg(ticks.minor, { tone: "lo" }));
  parts.push(lineSvg(ticks.major, { tone: "mid" }));
  const stop = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return iso([GAUGE.cx + Math.sin(a) * 11, GAUGE.cy - Math.cos(a) * 11, GAUGE.faceZ + 0.2], P);
  };
  parts.push(dotsSvg([stop(-135), stop(135)], { size: 0.55, tone: "hi" }));
  parts.push(solidSvg(slabOf({ x: 79.4, y: 11.6, w: 5, d: 4.8, r: 1.2 }, 18, 5, P, 3), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: 84.6, y: 10.8, w: 2.8, d: 6.4, r: 1.2 }, 17, 6.6, P, 3), { tone: "mid" }));
  parts.push(solidSvg(slabOf({ x: 61, y: -5.6, w: 6, d: 4, r: 1.2 }, 17.5, 5, P, 3), { tone: "mid" }));
  parts.push(dotsSvg([iso([GAUGE.cx, GAUGE.cy, GAUGE.faceZ + 0.3], P)], { size: 1, tone: "hi" }));
  return parts.join("");
}

function chestChunk(P: Projection): string {
  const parts: string[] = [];
  for (const [x, y] of byDepth([[95, -27], [133, -27], [95, 17], [133, 17]] as Plane[], P)) {
    parts.push(solidSvg(slabOf({ x: x - 3, y: y - 3, w: 6, d: 6, r: 1 }, 0, 2, P, 2), { tone: "lo" }));
  }
  parts.push(solidSvg(slabOf(CHEST, 2, 28, P, 5, 0.8), { tone: "mid" }));
  parts.push(lineSvg(planOutline(insetPlan(CHEST, 3), 30, P), { tone: "lo" }));
  parts.push(dotsSvg([iso([97, -26, 30], P), iso([137, 18, 30], P)], { size: 0.45, tone: "mid" }));
  for (let i = 0; i < DRAWER_SLOTS; i++) {
    const z0 = 6.5 + i * 4.6;
    const z1 = z0 + 3.4;
    const quad: Plane[] = [
      [97, 26.06],
      [137, 26.06],
    ];
    parts.push(rectFill(quad, 0, P, 0));
    parts.push(
      lineSvg(
        pathOf(
          [
            [quad[0]![0], quad[0]![1], z0],
            [quad[1]![0], quad[1]![1], z0],
            [quad[1]![0], quad[1]![1], z1],
            [quad[0]![0], quad[0]![1], z1],
          ].map(([x, y, z]) => iso([x, y, z], P)),
          true,
        ),
        { tone: "lo" },
      ),
    );
  }
  return parts.join("");
}

function drawerChunk(i: number, P: Projection): string {
  const z0 = 6.1 + i * 4.6;
  return [
    solidSvg(slabOf({ x: 95, y: 26, w: 44, d: 3.2, r: 1.2 }, z0, 4.2, P, 3, 0.4), { tone: "mid" }),
    solidSvg(slabOf({ x: 112, y: 29.2, w: 10, d: 1.8, r: 0.9 }, z0 + 1.2, 1.8, P, 2, 0.3), { tone: "mid", crease: "none" }),
    dotsSvg([iso([98, 27.6, z0 + 3.4], P), iso([136, 27.6, z0 + 3.4], P)], { size: 0.4, tone: "mid" }),
  ].join("");
}

/* ── computeBuild: כל-הנתיבים הסטטיים לפי azimuth + עוגני-תנועה ───────────── */

export function computeBuild(azimuth: number): MachineBuild {
  const P = projectionAt(azimuth);
  const at = (p: Point3) => iso(p, P);

  const liquids: (LiquidRig | null)[] = TANK_X.map((cx, index) => {
    if (index === 2) return null;
    const ringPts = circleRing(cx, TUBE_Y, TUBE_LIQUID_R, 20);
    const a = (azimuth * Math.PI) / 180;
    const L = [-Math.sin(a), Math.cos(a)];
    const normals = ringPts.map(([ax, ay], i) => {
      const [bx, by] = ringPts[(i + 1) % ringPts.length]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      return [dy / len, -dx / len] as Plane;
    });
    const bandIdx: number[][] = [[], [], [], []];
    for (let i = 0; i < ringPts.length; i++) {
      const [nx, ny] = normals[i]!;
      const bucket = Math.max(0, Math.min(3, Math.floor(((nx * L[0]! + ny * L[1]! + 1) / 2) * 4)));
      bandIdx[bucket]!.push(i, (i + 1) % ringPts.length);
    }
    return {
      bottom: ringPts.map(([x, y]) => at([x, y, TUBE_Z0])),
      bandIdx,
      ezY: axisVector(P, [0, 0, 1])[1]!,
      zBase: TUBE_Z0,
      amber: index === 1,
      pointerFrom: [cx + 2.7, TUBE_Y + 2.3, TUBE_Z0] as Point3,
      pointerTo: [cx + 9, TANK_Y + 12, TUBE_Z0] as Point3,
    };
  });

  const coinSolid = extrude(circleRing(COIN_REST[0], COIN_REST[1], COIN_R, 24), COIN_REST[2], 1.6, P);
  const coinPaths: CoinPaths = { fill: coinSolid.fill, bands: coinSolid.shades, top: coinSolid.top, edge: coinSolid.outline };

  const drums = ODO.centers.map((cx) => sideMatrix([cx, ODO.digitY], ODO.drumZ, P, "left"));
  const clipPts = [
    at([ODO.winX0, 55, ODO.winZ0]),
    at([ODO.winX1, 55, ODO.winZ0]),
    at([ODO.winX1, 55, ODO.winZ1]),
    at([ODO.winX0, 55, ODO.winZ1]),
  ];
  const xs = clipPts.map(([x]) => x);
  const ys = clipPts.map(([, y]) => y);
  const clip = {
    x: Math.min(...xs) - 1,
    y: Math.min(...ys) - 1,
    w: Math.max(...xs) - Math.min(...xs) + 2,
    h: Math.max(...ys) - Math.min(...ys) + 2,
  };

  const pennant = [
    segment([132.5, -59.24, 36.4], [142.6, -59.24, 31.6], P),
    segment([142.6, -59.24, 31.6], [132.5, -59.24, 29.4], P),
  ].join("");

  return {
    azimuth,
    chunks: {
      base: baseChunk(P),
      tanks: tanksChunk(P),
      chuteA: chuteAChunk(P),
      chuteB: chuteBChunk(P),
      odo: odoChunk(P),
      odoFront: odoFrontChunk(P),
      flag: flagChunk(P),
      gauge: gaugeChunk(P),
      chest: chestChunk(P),
    },
    drawers: Array.from({ length: DRAWER_SLOTS }, (_, i) => drawerChunk(i, P)),
    anchors: {
      liquids,
      needle: { cx: GAUGE.cx, cy: GAUGE.cy, z: GAUGE.faceZ + 0.25, r: GAUGE.needleR },
      coin: { screen: COIN_WAY.map(at), rest: at(COIN_REST), paths: coinPaths },
      drums,
      clip,
      drawerVec: axisVector(P, [0, DRAWER_TRAVEL, 0]),
      paddleVec: axisVector(P, [0, 0, 5]),
      pennant,
    },
  };
}

/* מחט-המד: רביעון מלא, מתעדכן לכל פריים */
export function needlePath(P: Projection, value: number): string {
  const th = ((-135 + 270 * Math.max(0, Math.min(1, value))) * Math.PI) / 180;
  const dx = Math.sin(th);
  const dy = -Math.cos(th);
  const z = GAUGE.faceZ + 0.25;
  const tip: Point3 = [GAUGE.cx + dx * GAUGE.needleR, GAUGE.cy + dy * GAUGE.needleR, z];
  const perp: Point3 = [-dy * 0.38, dx * 0.38, 0];
  const tail: Point3 = [GAUGE.cx - dx * 3.2, GAUGE.cy - dy * 3.2, z];
  const pts: Point3[] = [
    [GAUGE.cx + perp[0], GAUGE.cy + perp[1], z],
    tip,
    [GAUGE.cx - perp[0], GAUGE.cy - perp[1], z],
    tail,
  ];
  return pathOf(pts.map((p) => iso(p, P)), true);
}
