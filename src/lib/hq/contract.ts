/**
 * contract.ts — the office plan canon.
 * ------------------------------------------------------------------
 * תוכנית הרצפה: PLAN_W=1600 × PLAN_H=1000 יחידות, y גדל דרומה (הכניסה בדרום).
 * עולם 3D במטרים: x3 = (x - W/2)·S · z3 = (y - H/2)·S · y3 = גובה מהרצפה.
 * קנה מידה S=0.0125 → אולם 20מ' × 12.5מ', תקרה 3.6מ'.
 * כל הפיזיקה רצה ביחידות התוכנית; הרינדור במטרים דרך to3().
 *
 * מפת המשרד (מבט על, צפון למעלה) — חוק ה-RTL: הקריאה נכנסת מימין (מזרח):
 *   צפון: קיר הגיט (מערב) · לוח המשימות (מרכז) · הספרייה (מזרח)
 *   מרכז: להבת הריבונות + קשת שולחנות הצוות · שולחן ראש-המטה (מזרח) · דוכן ההחלטות (מערב)
 *   דרום: קבלה + דלתות זכות · בר קפה (מזרח) · צמחייה
 */

import type { Station } from './protocol';

// ─────────────── מידות בסיס ───────────────
export const PLAN_W = 1600;
export const PLAN_H = 1000;
export const SCALE = 0.0125;
export const WALL_H = 3.6;
export const WALL_T = 0.24; // עובי קיר חיצוני (מ')

/** המרת נקודת תוכנית (x,y) לעולם 3D [x, z] */
export function to3(x: number, y: number): [number, number] {
  return [(x - PLAN_W / 2) * SCALE, (y - PLAN_H / 2) * SCALE];
}
/** המרה חזרה (x,z) במטרים → תוכנית */
export function to2(x3: number, z3: number): [number, number] {
  return [x3 / SCALE + PLAN_W / 2, z3 / SCALE + PLAN_H / 2];
}

// ─────────────── עוגני תחנות (יחידות תוכנית) ───────────────
export interface DeskSpot {
  /** מיקום השולחן */
  x: number; y: number;
  /** כיוון פני היושב — רדיאנים (0 = פנים לדרום +z, חיובי נגד כיוון השעון) */
  face: number;
  /** מיקום כיסא (מחושב: מאחורי השולחן ביחס ל-face) */
  seat: [number, number];
}

/** יושבים סביב להבת הריבונות בקשת פתוחה דרומה — כל שולחן פונה למרכז */
function arcDesk(x: number, y: number, face: number): DeskSpot {
  // הכיסא 0.62 מ' "מאחורי" השולחן — בכיוון הפוך מ-face
  const bx = x - Math.sin(face) * 49.6; // 0.62מ' ביחידות תוכנית
  const by = y - Math.cos(face) * 49.6;
  return { x, y, face, seat: [bx, by] };
}

export const DESKS: Record<string, DeskSpot> = {
  gal:    arcDesk(1000, 505, -1.371),  // פונה ללהבה (מערב-דרום)
  erez:   arcDesk(800,  415,  0),      // פונה דרום — השולחן הראשי
  tamar:  arcDesk(600,  505,  1.371),
  shachar:arcDesk(955,  660, -2.212),  // פונה צפון-מערב ללהבה
  yarden: arcDesk(645,  660,  2.212),
};

/** שולחן ראש-המטה — שולחן עגול מזרחי (חוק RTL: ראשון מימין) */
export const LEAD_TABLE = { x: 1220, y: 560, r: 1.15 };
/** עמדת עמידה של אלוף מול לוח המשימות (מול הלוח המוקטן — כ-1.1מ' מלוח) */
export const LEAD_WALL_SPOT: [number, number] = [860, 180];

export const FLAME: [number, number] = [800, 545];
export const RECEPTION: { x: number; y: number; face: number } = { x: 800, y: 882, face: 0 }; // פונה דרום (לכניסה)
/** R57 (נמדד-חי): הדוכן ישב על (310,430) — והעמוד-המבני ב-(-5.6,-1.9) עמד
 *  בתוך הבימה עצמה (מרחק 1.15מ' מהמרכז, רדיוס-בימה 1.7מ') — עמוד חודר
 *  רהיט. המקום החדש (255,505): מרחק 2.3מ' משני העמודים המערביים —
 *  בימה נקייה, והדוכן נשאר במערב מול הצוות. */
export const PODIUM: { x: number; y: number; face: number } = { x: 255, y: 505, face: Math.PI / 2 }; // פונה מזרח (אל תוך המשרד)
export const LIBRARY_TABLE: [number, number] = [1170, 275];
export const COFFEE: { x: number; y: number } = { x: 1472, y: 780 };

/** לוח המשימות — קיר צפון מרכזי (יחידות תוכנית).
 * Task 47: 3.2מ' × 1.7מ' — רהיט אמיתי, לא קיר-שלם: לוח בגודל קיר עם תחתית
 * בגובה-רצפה נראה כמו חלון/מסך-ענק (נמדד בצילומי-בסיס). המרכז בגובה 1.62מ'
 * וכמעט צמוד לפנים-הקיר (cy קטן = מוצמד). */
export const TASK_WALL: { cx: number; cy: number; w: number; h: number } = { cx: 800, cy: 30, w: 256, h: 136 };
/** גובה מרכז לוח המשימות במטרים */
export const TASK_WALL_Y = 1.62;
/** עומק מסגרת הלוח (מ') — קובע את המרווח מפנים-הקיר */
export const TASK_WALL_DEPTH = 0.09;
/** קיר הגיט — מסך ענק צפון-מערבי */
export const GIT_WALL: { cx: number; cy: number; w: number; h: number } = { cx: 310, cy: 52, w: 380, h: 210 };
/** ספרייה — מדפים במזרח (חוק RTL: הספרייה מזרח). Task 47: שורה אחת צמודת
 *  קיר-צפון (היתה 1.1מ' מרחפת ממנו) + ספינה צמודת קיר-מזרח (היתה 0.37מ'
 *  מרחפת). המדפים הם מקור-האמת גם להתנגשויות וגם לציור. */
export const SHELVES: { x: number; y: number; rot: number; len: number }[] = [
  { x: 1390, y: 34, rot: 0, len: 280 },                 // צמוד קיר צפון (מזרח)
  { x: 1568, y: 430, rot: -Math.PI / 2, len: 240 },     // צמוד קיר מזרח — גב הספרייה ב-x=9.76 (עם rot=-π/2 הגב המקומי -z פונה +x אל הקיר)
];
export const BOOK_SHELF_POS = to3(1390, 120);

/** כניסה — דלתות זכות בדרום */
export const ENTRANCE: [number, number] = [800, 995];

// ─────────────── נקודות תצפית (סרגל המצלמה) ───────────────
/**
 * מצלמה מקצועית במקום שחקן: כל נקודת-תצפית היא הרכב מכוון על אזור אמיתי
 * בתוכנית (מבט אדריכלי פנימי — התקרה קיימת, אין צילום-על). ספריית-המצלמה
 * מסתובבת סביב `target` (drag), מתרחקת בין minDist..maxDist (גלגלת),
 * ועוברת בהחלקה-מרוסנת בין נקודות. המקומות מחושבים מהתוכנית — לא המצאה.
 */
export interface CameraPreset {
  id: 'overview' | 'crew' | 'wall' | 'git' | 'podium' | 'library' | 'reception';
  label: { he: string; en: string };
  /** נקודת המבט במרחב העולם [x, y, z] */
  target: [number, number, number];
  /** זווית אופקית התחלתית (0 = המצלמה דרומית ליעד) */
  yaw: number;
  /** זווית גובה התחלתית (רדיאנים) */
  pitch: number;
  dist: number;
  minDist: number;
  maxDist: number;
}

const flame3 = to3(FLAME[0], FLAME[1]);
const arcCenter3 = to3(800, 550);
const taskWall3 = to3(TASK_WALL.cx, TASK_WALL.cy);
const gitWall3 = to3(GIT_WALL.cx, GIT_WALL.cy);
const podium3 = to3(PODIUM.x, PODIUM.y);
const reception3 = to3(RECEPTION.x, RECEPTION.y);

export const CAMERA_PRESETS: CameraPreset[] = [
  // Task 47 recomposition — every preset was re-shot from the live scene and
  // reframed to show its actual subject with office context (the previous
  // angles produced a black void at git, a wall of glass at podium, and a
  // reception view whose counter was outside the frame; measured live).
  {
    id: 'overview', label: { he: 'תצפית כללית', en: 'Overview' },
    target: [flame3[0], 0.85, flame3[1]],
    yaw: Math.PI * 0.86, pitch: 0.58, dist: 8.6, minDist: 4.5, maxDist: 12,
  },
  {
    id: 'crew', label: { he: 'אזור הצוות', en: 'Crew desks' },
    target: [arcCenter3[0], 0.85, arcCenter3[1]],
    yaw: Math.PI, pitch: 0.42, dist: 5.0, minDist: 2.6, maxDist: 8,
  },
  {
    id: 'wall', label: { he: 'לוח המשימות', en: 'Task board' },
    // Task 47 ROOT CAUSE: the old yaw≈π placed the camera NORTH of the
    // target (inside/behind the north wall) where the room-bounds clamp
    // pressed it against the board — the view degenerated and the board was
    // never in frame (measured: baseline wall preset shows the room, not the
    // board). A wall-mounted subject needs the camera SOUTH of it: yaw≈0.
    target: [taskWall3[0], 1.5, taskWall3[1]],
    yaw: 0.16, pitch: 0.1, dist: 4.4, minDist: 2.4, maxDist: 8,
  },
  {
    id: 'git', label: { he: 'קיר הגיט', en: 'Git wall' },
    // R57 (measured live): from the SE the sight-line crossed the structural
    // pillar (−5.6,−1.9) and the wall showed behind it half-blocked. The
    // camera now stands in the NW corner corridor, due-east of the wall —
    // the whole board in frame, zero structures crossing.
    target: [gitWall3[0], 1.5, gitWall3[1]],
    yaw: -0.5, pitch: 0.14, dist: 5.4, minDist: 2.4, maxDist: 8,
  },
  {
    id: 'podium', label: { he: 'דוכן ההחלטות', en: 'Decisions' },
    // R54 (measured live): the framing must show the lectern's FRONT (glow
    // strip + mic) — the front normal is rotated 0.42π (SW), so the camera
    // stands ESE along it. R57: after the podium moved off the structural
    // pillar, the same law re-measured — target mid-lectern, ESE, slightly
    // elevated: lectern + decision ring + wall sign in one clean frame.
    target: [podium3[0] + 0.42, 1.2, podium3[1] - 0.2],
    yaw: Math.PI * 0.3, pitch: 0.2, dist: 4.0, minDist: 1.9, maxDist: 7,
  },
  {
    id: 'library', label: { he: 'הספרייה', en: 'Library' },
    // Task 47: המצלמה דרומית למדפים ומביטה צפונה — הפנים של המדפים והספרים
    // פונים דרומה (אל-תוך-החדר); ממזרח הם מראים רק קצה-אלון כהה (נמדד)
    target: [to3(1390, 150)[0], 1.4, to3(1390, 150)[1]],
    yaw: 0.32, pitch: 0.14, dist: 4.4, minDist: 2.2, maxDist: 7,
  },
  {
    id: 'reception', label: { he: 'קבלה', en: 'Reception' },
    // Task 3D-TRUTH (measured live twice): the welcome screen (sovereign
    // truth) faces SOUTH-EAST toward the visitor (rotY 0.45, plane normal
    // local +z). The previous NE composition photographed its back — the
    // screen was unreadable. The visitor's own angle (SE, eye-height-ish)
    // reads the screen, the marble top and the glass entrance together.
    target: [reception3[0] - 0.85, 1.28, reception3[1] + 0.45],
    yaw: 0.55, pitch: 0.14, dist: 2.9, minDist: 1.8, maxDist: 6,
  },
];

/** מיקוד בלחיצה על ישות — מרחק/גובה לפי סוג התחנה (המצלמה ניצבת בין מרכז החדר ליעד) */
export const FOCUS_PRESETS: Record<string, { dist: number; pitch: number }> = {
  desk: { dist: 2.5, pitch: 0.3 },
  wall: { dist: 3.8, pitch: 0.1 },
  podium: { dist: 3.4, pitch: 0.24 },
  library: { dist: 3.4, pitch: 0.2 },
  git: { dist: 4.4, pitch: 0.12 },
  reception: { dist: 3.0, pitch: 0.18 },
  flame: { dist: 4.0, pitch: 0.28 },
  lead: { dist: 3.2, pitch: 0.32 },
};

// ─────────────── מתקני תאורה (מטרים, מרחב 3D) ───────────────
/** נברשות מעל שולחנות הצוות + להבה */
export const PENDANTS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (const d of Object.values(DESKS)) {
    const [x, z] = to3(d.x, d.y);
    out.push([x, z, 2.55]);
  }
  const [fx, fz] = to3(FLAME[0], FLAME[1]);
  out.push([fx, fz, 2.85]);
  return out;
})();

/** כתוביות ניאון — [x, גובה, z, רוחב, טקסט, צבע, rotY].
 *  R57 תיקון-שורש נמדד: הפאטרן הישן [...to3(x,y), h] שם את z3 בסלוט-הגובה —
 *  שני שלטים נקברו מתחת-לרצפה, אחד רחף מעל-הגג ואחד בגובה-ברך. עתה צירים
 *  מפורשים: מרכז-x, גובה-אמת, ולכל שלט-קיר מרחק 5-2 ס"מ מפנים-הקיר.
 *  שלט-הדוכן תלוי-מהתקרה מעל-הבימה (hang:true — כבלים ב-Neons), כי קיר-המערב
 *  שם חלון-תריס (z∈[-1.65,0.95]) — אין קיר-מלא לתלייה. */
export const NEON_SIGNS: { pos: [number, number, number]; w: number; text: string; sub?: string; color: string; rotY: number; hang?: boolean }[] = [
  { pos: [0, 3.02, -5.99], w: 3.4, text: 'מפקדת הצי', sub: 'FLEET HQ', color: '#ffb054', rotY: 0 },
  { pos: [0, 2.75, 5.95], w: 2.6, text: 'FLEET HQ', sub: 'משרד ריבוני · סוכני AI', color: '#54d8c0', rotY: Math.PI },
  { pos: [(PODIUM.x - 800) * 0.0125, 2.6, (PODIUM.y - 500) * 0.0125], w: 1.9, text: 'דוכן ההחלטות', color: '#e07b54', rotY: Math.PI / 2, hang: true },
  { pos: [9.76 - 0.06, 2.6, 0.75], w: 1.7, text: 'הספרייה', color: '#a78bfa', rotY: -Math.PI / 2 },
];

// ─────────────── התנגשויות (מלבנים ביחידות תוכנית) ───────────────
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** שולחן עבודה: 1.5מ' × 0.72מ' = 120×58 יחידות, מסובב לפי face — נפשט למלבן מיושר-צירים עוטף */
function deskRect(d: DeskSpot): Rect {
  const R = 62;
  return { x0: d.x - R, y0: d.y - R * 0.55, x1: d.x + R, y1: d.y + R * 0.55 };
}

export const COLLIDERS: Rect[] = (() => {
  const cs: Rect[] = [];
  // קירות חיצוניים: עובי 24 יח'
  cs.push({ x0: -30, y0: -30, x1: PLAN_W + 30, y1: 0 });        // צפון
  cs.push({ x0: -30, y0: PLAN_H, x1: PLAN_W + 30, y1: PLAN_H + 30 }); // דרום
  cs.push({ x0: -30, y0: -30, x1: 0, y1: PLAN_H + 30 });        // מערב
  cs.push({ x0: PLAN_W, y0: -30, x1: PLAN_W + 30, y1: PLAN_H + 30 }); // מזרח
  // שולחנות
  for (const d of Object.values(DESKS)) cs.push(deskRect(d));
  // שולחן עגול ראש-המטה (עוטף)
  cs.push({ x0: LEAD_TABLE.x - 105, y0: LEAD_TABLE.y - 105, x1: LEAD_TABLE.x + 105, y1: LEAD_TABLE.y + 105 });
  // דוכן קבלה
  cs.push({ x0: RECEPTION.x - 150, y0: RECEPTION.y - 45, x1: RECEPTION.x + 150, y1: RECEPTION.y + 45 });
  // דוכן ההחלטות
  cs.push({ x0: PODIUM.x - 55, y0: PODIUM.y - 55, x1: PODIUM.x + 55, y1: PODIUM.y + 55 });
  // שולחן קריאה
  cs.push({ x0: LIBRARY_TABLE[0] - 80, y0: LIBRARY_TABLE[1] - 55, x1: LIBRARY_TABLE[0] + 80, y1: LIBRARY_TABLE[1] + 55 });
  // מדפי ספרייה
  for (const s of SHELVES) {
    const t = 30;
    if (s.rot === 0) cs.push({ x0: s.x - s.len / 2, y0: s.y - t, x1: s.x + s.len / 2, y1: s.y + t });
    else cs.push({ x0: s.x - t, y0: s.y - s.len / 2, x1: s.x + t, y1: s.y + s.len / 2 });
  }
  // בר קפה
  cs.push({ x0: COFFEE.x - 60, y0: COFFEE.y - 210, x1: COFFEE.x + 60, y1: COFFEE.y + 30 });
  // צמחים בפינות
  cs.push({ x0: 40, y0: 940, x1: 120, y1: PLAN_H });
  cs.push({ x0: PLAN_W - 120, y0: 940, x1: PLAN_W - 40, y1: PLAN_H });
  // Task 53 — קקטוסים תלת-ממדיים (שכבת-העיצוב): קולטנים אמיתיים קטנים —
  // הדמויות הולכות סביב, לא דרך עציץ (Interior.tsx מציג בדיוק את הנקודות האלה)
  cs.push({ x0: 1020 - 26, y0: 928 - 26, x1: 1020 + 26, y1: 928 + 26 }); // סגוארו ליד-הקבלה
  cs.push({ x0: 1308 - 24, y0: 92 - 24, x1: 1308 + 24, y1: 92 + 24 });   // אגס-קוצים צפון-מזרח
  cs.push({ x0: 116 - 24, y0: 92 - 24, x1: 116 + 24, y1: 92 + 24 });     // חבית צפון-מערב
  return cs;
})();

/** פתרון התנגשות עיגול-מלבן — מחזיר מיקום מתוקן */
export function resolveCircle(x: number, y: number, r: number): { x: number; y: number } {
  let nx = x, ny = y;
  for (const c of COLLIDERS) {
    const cx = Math.max(c.x0, Math.min(nx, c.x1));
    const cy = Math.max(c.y0, Math.min(ny, c.y1));
    const dx = nx - cx, dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = (r - d) / d;
      nx += dx * push;
      ny += dy * push;
    }
  }
  return { x: nx, y: ny };
}

// ─────────────── נקודות אינטראקציה ───────────────
export type InteractKind = 'desk' | 'wall' | 'podium' | 'library' | 'git' | 'reception' | 'flame' | 'coffee' | 'lead';

export interface Interactable {
  id: string;
  kind: InteractKind;
  /** מרכז התחנה בתוכנית */
  x: number; y: number;
  /** רדיוס הפעלה במטרים */
  r: number;
  station?: Station;
  agentId?: string;
}

export const INTERACTABLES: Interactable[] = [
  ...Object.entries(DESKS).map(([id, d]) => ({ id: `desk:${id}`, kind: 'desk' as const, x: d.x, y: d.y, r: 1.55, station: 'desk' as Station, agentId: id })),
  { id: 'wall', kind: 'wall', x: TASK_WALL.cx, y: TASK_WALL.cy + 90, r: 3.1, station: 'wall' as Station },
  { id: 'podium', kind: 'podium', x: PODIUM.x, y: PODIUM.y, r: 2.4, station: 'podium' as Station },
  { id: 'library', kind: 'library', x: LIBRARY_TABLE[0], y: LIBRARY_TABLE[1], r: 2.4, station: 'library' as Station },
  { id: 'git', kind: 'git', x: GIT_WALL.cx, y: GIT_WALL.cy + 90, r: 3.0 },
  { id: 'reception', kind: 'reception', x: RECEPTION.x, y: RECEPTION.y + 80, r: 1.8 },
  { id: 'flame', kind: 'flame', x: FLAME[0], y: FLAME[1], r: 1.9 },
  { id: 'lead', kind: 'lead', x: LEAD_TABLE.x, y: LEAD_TABLE.y, r: 1.9, agentId: 'aluf' },
];

/** תחנת ניווט לכל סוג station — קואורדינטת-X במפה (אליה הולך סוכן כשהוא נקרא) */
export const STATION_NAV: Record<Station, number> = {
  desk: DESKS.erez.x, // לא בשימוש ישיר — כל סוכן הולך לשולחן שלו
  wall: TASK_WALL.cx, podium: PODIUM.x + 140, library: LIBRARY_TABLE[0], offstage: FLAME[0],
  coffee: COFFEE.x, // Task 52 — הפסקת-קפה (המוח מפרק לעמדה מערבית לבר)
};


