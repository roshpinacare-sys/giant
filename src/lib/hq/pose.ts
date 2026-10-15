/**
 * pose.ts — המסלקת-תנוחות של הצוות (Task 47).
 * ------------------------------------------------------------------
 * הבעיה-השורשית שנמדדה: קליפ-הישיבה הפרוצדורלי הישן הציב רוטציות מנוחות
 * בערכי-אולר על עצמות mixamorig/RPM — אבל הצירים-המקומיים של עצמות אלה
 * אינם מיושרים לצירי-המודל, והתוצאה על-המסך היתה "דחלילים": ידיים פרושות
 * הצידה ולמעלה, לא ידיים על המקלדת.
 *
 * התיקון: מסלקה שפועלת במרחב-העולם ולכן אינה תלוית-ריג —
 *   1. דוגמת את כיוון-המנוחה של כל שרשרת עצמות (כתף→מרפק וכו') מהתבנית
 *      עצמה (bind pose), בלי הנחות על צירים.
 *   2. בונה רוטציה שממפה את כיוון-המנוחה אל כיוון-היעד (למשל "קדימה-מטה
 *      אל המקלדת") — setFromUnitVectors, יציב גם ב-T-pose.
 *   3. ממירה את הרוטציה-בעולם לרוטציה-מקומית דרך ההורה החדש (עיבוד
 *      מלמעלה-למטה), ומפיקה רצועות-מפתח אמיתיות ל-AnimationClip.
 *
 * הקליפים המופקים כאן הם החוזה היחיד לתנוחות-ישיבה/הקלדה/נשימה של החדר,
 * לשני הריגים (mixamorig ישיר + RPM מרוטרגט).
 */
import * as THREE from 'three';

export interface PoseMap {
  /** רוטציות-מקומיות חדשות לפי שם-עצם-מנוקד (ללא קידומת) */
  q: Record<string, THREE.Quaternion>;
  /** מצב-הירכיים המלא ביחידות-מקומיות של העצם (וקטור — לא סקלר:
   *  סקאלות-מערכות שונות בין הריגים — מיש'ל Z-up סמ"מ מול RPM Y-up מטרי) */
  hips: THREE.Vector3;
  /** אבחון (Task 47): גובה-הירכיים בעולם במנוחה, יחידות-התבנית */
  restWorldY: number;
  /** סימון מה נמצא וטופל — לאבחון */
  solved: string[];
  missing: string[];
}

type Bones = Record<string, THREE.Bone>;

const strip = (name: string) => name.replace(/^(mixamorig:|mixamorig)/, '');

export function collectBones(root: THREE.Object3D): Bones {
  const map: Bones = {};
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) map[strip(b.name)] = b;
  });
  return map;
}

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();

/** כיוון מנוחה מעצם אל צאצאה, במרחב-המודל (התבנית במנוחה, root בזהות) */
function restDir(bones: Bones, from: string, to: string): THREE.Vector3 | null {
  const a = bones[from], b = bones[to];
  if (!a || !b) return null;
  a.updateWorldMatrix(true, false);
  b.updateWorldMatrix(true, false);
  const pa = V(), pb = V();
  a.getWorldPosition(pa);
  b.getWorldPosition(pb);
  const d = pb.sub(pa);
  return d.lengthSq() < 1e-10 ? null : d.normalize();
}

/**
 * מציב על העצם רוטציה שמכוונת את צאצאה אל targetDir (מרחב-מודל).
 * מעדכן את העצם בפועל (כדי שצאצאות יראו הורה חדש) ומחזיר את הרוטציה-המקומית.
 */
function aimBone(bones: Bones, name: string, child: string, targetDir: THREE.Vector3): THREE.Quaternion | null {
  const bone = bones[name];
  const childBone = bones[child];
  if (!bone || !childBone) return null;
  // Task 47-fix (measured live): the source direction is sampled from the LIVE
  // scene (bone→child NOW), not from the bind-rest map. The chain is solved
  // top-down and the bone already inherits its parent's new rotation; a delta
  // computed against the bind rest DOUBLE-COUNTED the parent's aim — measured
  // result: near-horizontal shins on every seated agent (ankle 0.42m vs knee
  // 0.47m instead of ~0.10m), a hunched spine (head 0.97m instead of ~1.15m).
  // The live delta is always the minimal correction: identical to the rest
  // delta for the FIRST bone of a chain, and exactly the residual difference
  // for the bones after it.
  bone.updateWorldMatrix(true, false);
  childBone.updateWorldMatrix(true, false);
  const pa = V(), pb = V();
  bone.getWorldPosition(pa);
  childBone.getWorldPosition(pb);
  const cur = pb.sub(pa);
  if (cur.lengthSq() < 1e-10) return null;
  cur.normalize();
  const restWorld = Q();
  bone.getWorldQuaternion(restWorld);
  const qDelta = Q().setFromUnitVectors(cur, targetDir.clone().normalize());
const newWorld = qDelta.multiply(restWorld);
  const parentWorld = Q();
  if (bone.parent) {
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(parentWorld);
  }
  const local = parentWorld.invert().multiply(newWorld);
  bone.quaternion.copy(local);
  return local;
}

export interface SitOpts {
  /** גובה-מושב בעולם (מטרים) */
  seatY: number;
  /** מקדם-הקטנת המודל (target height / raw height) — לתרגום גובה-ירכיים */
  scale: number;
  /** נטיית-גב קדימה (רדיאנים, חיובי = קדימה) */
  lean?: number;
}

/**
 * בונה את תנוחת-הישיבה על התבנית (שהיא במנוחה) ומחזירה מפת-תנוחה.
 * לא משנה את התבנית עצמה לצמיתות — הקריאה מחזירה ערכים; האחריות על הקורא
 * לשחזר את מנוחת התבנית (הקליפים נבנים פעם-אחת).
 */
export function solveSit(root: THREE.Object3D, opts: SitOpts): PoseMap {
  const bones = collectBones(root);
  // התבנית משותפת לכל הדמויות — שומרים את המנוחה ומשחזרים בסוף
  const saved: { b: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  for (const b of Object.values(bones)) saved.push({ b, q: b.quaternion.clone(), p: b.position.clone() });
  root.updateMatrixWorld(true);
  try {
    return solveSitInner(bones, root, opts);
  } finally {
    for (const s of saved) { s.b.quaternion.copy(s.q); s.b.position.copy(s.p); }
    root.updateMatrixWorld(true);
  }
}

function solveSitInner(bones: Bones, root: THREE.Object3D, opts: SitOpts): PoseMap {
  const rest: Record<string, THREE.Vector3> = {};
  const sample = (n: string, c: string) => {
    const d = restDir(bones, n, c);
    if (d) rest[n] = d;
  };
  sample('Spine', 'Spine1');       // עמוד-עליון
  sample('Spine1', 'Spine2');
  sample('Neck', 'Head');
  sample('Head', 'HeadTop_End');
  sample('LeftArm', 'LeftForeArm');
  sample('LeftForeArm', 'LeftHand');
  sample('RightArm', 'RightForeArm');
  sample('RightForeArm', 'RightHand');
  sample('LeftUpLeg', 'LeftLeg');
  sample('LeftLeg', 'LeftFoot');
  sample('RightUpLeg', 'RightLeg');
  sample('RightLeg', 'RightFoot');

  const solved: string[] = [];
  const missing: string[] = [];
  const out: Record<string, THREE.Quaternion> = {};
  const lean = opts.lean ?? 0.12;

  const hips = bones['Hips'];
  let hipsLocal: THREE.Vector3 | null = null;
  let restWorldY = 0;
  if (hips) {
    // Task 47 ROOT CAUSE (הקריסה-הנשית): סקאלות-מערכות שונות — מיש'ל נולד
    // Z-up סמ"מ (Character עם rot +90°X ו-scale 0.01; מנוחת-הירכיים המקומית
    // ‎(0,−0.52,−102.6)) ואילו RPM מטרי Y-up (‎(0,1.02,0)). כתיבת (0,מטרים,0)
    // ישירות שילחה את הדמות אל-תוך-הרצפה (hipsWorldY≈0 — נמדד חי).
    // הפתרון הגנרי: ציר-ה"מעלה" המקומי = quaternion-ההורה במנוחה × (0,1,0),
    // וההיסט מחושב דרך מנוחת-העולם — בלי שום הנחה על מערכת-הצירים.
    hips.updateWorldMatrix(true, false);
    const restWorld = V();
    hips.getWorldPosition(restWorld);
    restWorldY = restWorld.y;
    const parentQuat = Q();
    if (hips.parent) {
      hips.parent.updateWorldMatrix(true, false);
      hips.parent.getWorldQuaternion(parentQuat);
    }
    const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(parentQuat.invert()).normalize();
    const restLocal = hips.position.clone();
    // השמרטפי-על המכנה (לא על רכיב-ה-y של upLocal! — במיש'ל upLocal=(0,0,−1)
    // והתנאי הישן כיבה בדיוק את התיקון עבור הריג-היחיד שצריך אותו)
    const localUpComponent = restLocal.dot(upLocal);
    const k = Math.abs(localUpComponent) > 1e-6 ? restWorldY / localUpComponent : 1; // יחידות-עולם ליחידה-מקומית
    const desiredWorld = opts.seatY / Math.max(0.2, opts.scale); // יחידות-תבנית
    const delta = (desiredWorld - restWorldY) / (k !== 0 ? k : 1);
    hipsLocal = restLocal.clone().addScaledVector(upLocal, delta);
  } else missing.push('Hips');

  // 1) עמוד-שדרה: נטייה קדימה עדינה — Spine ו-Spine1
  const spineTarget = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
  for (const [b, c, t] of [
    ['Spine', 'Spine1', spineTarget],
    ['Spine1', 'Spine2', spineTarget],
  ] as const) {
    if (rest[b]) {
      const q = aimBone(bones, b, c, t);
      if (q) { out[b] = q; solved.push(b); }
    } else missing.push(b);
  }

  // 2) ראש: מבט-מטה אל הצג (כ-16° מטה)
  if (rest['Head']) {
    const q = aimBone(bones, 'Head', 'HeadTop_End', new THREE.Vector3(0, Math.cos(0.28), Math.sin(0.28)));
    if (q) { out['Head'] = q; solved.push('Head'); }
  } else missing.push('Head');

  // 3) זרועות: כיוון "קדימה-מטה אל המקלדת". צד לפי סימן-ה-x של הכתף במנוחה
  //    (אין הנחה איזה צד הוא שמאל בריג הזה — נמדד מהתבנית עצמה)
  for (const side of ['Left', 'Right'] as const) {
    const arm = `${side}Arm`, fore = `${side}ForeArm`, hand = `${side}Hand`, shoulder = `${side}Shoulder`;
    const hb = bones['Hips'];
    if (!hb || !bones[arm] || !rest[arm]) { missing.push(arm); continue; }
    hb.updateWorldMatrix(true, false);
    const hp = V(); hb.getWorldPosition(hp);
    bones[arm].updateWorldMatrix(true, false);
    const ap = V(); bones[arm].getWorldPosition(ap);
    const sgn = Math.sign(ap.x - hp.x) || 1;
    // זרוע: קדימה, מעט הצידה ומטה
    const upperDir = new THREE.Vector3(sgn * 0.22, -0.5, 0.84);
    const qArm = aimBone(bones, arm, fore, upperDir);
    if (qArm) { out[arm] = qArm; solved.push(arm); }
    // מרפק: ממשיך קדימה-מטה (יד על המקלדת)
    if (rest[fore]) {
      const foreDir = new THREE.Vector3(sgn * 0.08, -0.55, 0.83);
      const qFore = aimBone(bones, fore, hand, foreDir);
      if (qFore) { out[fore] = qFore; solved.push(fore); }
    } else missing.push(fore);
    void shoulder;
  }

  // 4) רגליים — גיאומטריה מודעת-מידות (Task 47-fix, נמדד-חי):
  //    יעדי-הרגל הסטטיים (ירך (0,−0.37,0.93) · שוק (0,−0.96,0.25)) הניחו
  //    פרופורציות אחידות; הריג-הנקבי שוק-ארוך-מירך (0.473מ' מול 0.37מ' —
  //    נמדד מהתבנית) — התוצאה: קרסול מתחת-לרצפה (−0.064מ' חי). התיקון:
  //    הכיוונים נגזרים מאורכי-השרשרת בפועל ומגיאומטריית-המושב —
  //    ירך seatY · ברך ~seat−0.12 · קרסול ~seat−0.53 (רצפה) — כך הרגל
  //    נשברת בברך והכף-רגל מגיעה-לרצפה בכל ריג, בלי קבועים-קטלניים.
  const chainLen = (a: string, b: string): number | null => {
    const ba = bones[a], bb = bones[b];
    if (!ba || !bb) return null;
    ba.updateWorldMatrix(true, false);
    bb.updateWorldMatrix(true, false);
    const pa = V(), pb = V();
    ba.getWorldPosition(pa);
    bb.getWorldPosition(pb);
    const d = pb.sub(pa).length();
    return d > 1e-6 ? d : null;
  };
  const lThigh = [
    chainLen('LeftUpLeg', 'LeftLeg'),
    chainLen('RightUpLeg', 'RightLeg'),
  ].filter((v): v is number => v !== null);
  const lShin = [
    chainLen('LeftLeg', 'LeftFoot'),
    chainLen('RightLeg', 'RightFoot'),
  ].filter((v): v is number => v !== null);
  const L1 = lThigh.length ? lThigh.reduce((a, b) => a + b, 0) / lThigh.length : 0.42;
  const L2 = lShin.length ? lShin.reduce((a, b) => a + b, 0) / lShin.length : 0.42;
  const kneeY = Math.max(0.35, opts.seatY - 0.12);
  const ankleY = Math.max(0.06, opts.seatY - 0.53);
  const dThigh = Math.min(0.9, Math.max(0.05, (opts.seatY - kneeY) / L1));
  const dShin = Math.min(0.985, Math.max(0.05, (kneeY - ankleY) / L2));
  for (const side of ['Left', 'Right'] as const) {
    const up = `${side}UpLeg`, leg = `${side}Leg`, foot = `${side}Foot`;
    if (!rest[up] || !rest[leg]) { missing.push(up); missing.push(leg); continue; }
    // מיקום-מדויק לכל צד (Task 47-fix): תגובת-הריג לכיוון-מטרה אינה תמיד
    // 1:1 (סטיית-bind של מיש'ל: כיוון-ירידה 0.324 הניב ירידה-בפועל 0.576 —
    // נמדד חי לפני ואחרי). כיוון-חי = נגזרת-כיוונית, ולכן יישוב איטרטיבי
    // של 2 מעברים (מדוד → תקן-יחסי → כוון-שוב) מתכנס ליעד בסנטימטרים —
    // הברך נוחתת בגובה-המושב והקרסול על-הרצפה בכל ריג.
    const targetDropThigh = opts.seatY - kneeY;
    const targetDropShin = kneeY - ankleY;
    let dT = dThigh, dS = dShin;
    const hipB = bones['Hips'], kneeB = bones[leg], ankleB = bones[foot];
    const measureDrop = (from: THREE.Bone | undefined, to: THREE.Bone | undefined): number | null => {
      if (!from || !to) return null;
      from.updateWorldMatrix(true, false);
      to.updateWorldMatrix(true, false);
      const a = V(), b = V();
      from.getWorldPosition(a);
      to.getWorldPosition(b);
      return a.y - b.y;
    };
    for (let pass = 0; pass < 2; pass++) {
      aimBone(bones, up, leg, new THREE.Vector3(0, -dT, Math.sqrt(Math.max(0.02, 1 - dT * dT))));
      const got = measureDrop(hipB, kneeB);
      if (got === null || Math.abs(got) < 1e-4) break;
      dT = Math.min(0.9, Math.max(0.05, dT * (targetDropThigh / got)));
    }
    const q1 = aimBone(bones, up, leg, new THREE.Vector3(0, -dT, Math.sqrt(Math.max(0.02, 1 - dT * dT))));
    if (q1) { out[up] = q1; solved.push(up); }
    for (let pass = 0; pass < 2; pass++) {
      aimBone(bones, leg, foot, new THREE.Vector3(0, -dS, Math.sqrt(Math.max(0.02, 1 - dS * dS))));
      const got = measureDrop(kneeB, ankleB);
      if (got === null || Math.abs(got) < 1e-4) break;
      dS = Math.min(0.985, Math.max(0.05, dS * (targetDropShin / got)));
    }
    const q2 = aimBone(bones, leg, foot, new THREE.Vector3(0, -dS, Math.sqrt(Math.max(0.02, 1 - dS * dS))));
    if (q2) { out[leg] = q2; solved.push(leg); }
  }

  return { q: out, hips: hipsLocal ?? new THREE.Vector3(0, 0.9, 0), restWorldY, solved, missing };
}

const trackName = (bone: string, prefix: string, prop: '.quaternion' | '.position') =>
  `${prefix}${bone}${prop}`;

/** קליפ-ישיבה סטטי ממפת-תנוחה (שני מפתחות זהים — תנוחה, לא תנועה) */
export function makeSitClip(prefix: string, pose: PoseMap, name = 'sit'): THREE.AnimationClip | null {
  if (!Object.keys(pose.q).length) return null;
  const t0 = 0.001, t1 = 1.001;
  const h = pose.hips;
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack(trackName('Hips', prefix, '.position'), [t0, t1], [h.x, h.y, h.z, h.x, h.y, h.z]),
  ];
  for (const [bone, q] of Object.entries(pose.q)) {
    const a = q.toArray(), b = q.toArray();
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName(bone, prefix, '.quaternion'), [t0, t1], [...a, ...b]));
  }
  return new THREE.AnimationClip(name, 1.002, tracks);
}

/**
 * קליפ-הקלדה אדיטיבי — דלתות עדינות סביב תנוחת-הישיבה (הישיבה היא הבסיס;
 * ההקלדה מוסיפה תנודת-אמות + הבהוב-ראש עדין). phase לכל סוכן נקבע בצד המיקסר.
 */
export function makeTypeClipAdditive(prefix: string, seed = 1): THREE.AnimationClip {
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72];
  const wave = (phase: number, amp: number) =>
    times.flatMap((t) => [...q(Math.sin(t * 9.5 + phase + seed) * amp, Math.cos(t * 7.3 + phase) * amp * 0.35, 0).toArray()]);
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(trackName('LeftForeArm', prefix, '.quaternion'), times, wave(0, 0.075)),
    new THREE.QuaternionKeyframeTrack(trackName('RightForeArm', prefix, '.quaternion'), times, wave(2.1, 0.075)),
    new THREE.QuaternionKeyframeTrack(trackName('Head', prefix, '.quaternion'), times, wave(1.3, 0.022)),
    new THREE.QuaternionKeyframeTrack(trackName('Spine1', prefix, '.quaternion'), times, wave(0.7, 0.012)),
  ];
  const clip = new THREE.AnimationClip('type', 0.72, tracks, THREE.AdditiveAnimationBlendMode);
  return clip;
}

/**
 * קליפ-נשימה אדיטיבי — קיום בסיסי בלבד (לעולם לא "פעילות"): תנודת-חזה,
 * הרמת-כתפיים עדינה וראש-חי. רץ תמיד (גם בישיבה, גם בעמידה) — כאן הפאזה
 * האישית של כל סוכן נראית ביותר.
 */
export function makeBreatheClip(prefix: string): THREE.AnimationClip {
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 0.9, 1.8, 2.7, 3.6];
  const sway = (fx: number, fy: number, fz: number, amp: number) =>
    times.flatMap((t) => [...q(
      Math.sin(t / 3.6 * Math.PI * 2 * 1 + fx) * amp,
      Math.sin(t / 3.6 * Math.PI * 2 * 0.5 + fy) * amp * 0.6,
      Math.sin(t / 3.6 * Math.PI * 2 * 1 + fz) * amp * 0.8,
    ).toArray()]);
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(trackName('Spine', prefix, '.quaternion'), times, sway(0, 0, 0, 0.016)),
    new THREE.QuaternionKeyframeTrack(trackName('Spine1', prefix, '.quaternion'), times, sway(1.1, 0.4, 0, 0.012)),
    new THREE.QuaternionKeyframeTrack(trackName('Head', prefix, '.quaternion'), times, sway(2.2, 1.5, 0.8, 0.014)),
    new THREE.QuaternionKeyframeTrack(trackName('LeftShoulder', prefix, '.quaternion'), times, sway(0, 0, 0.5, 0.01)),
    new THREE.QuaternionKeyframeTrack(trackName('RightShoulder', prefix, '.quaternion'), times, sway(0, 0, -0.5, 0.01)),
  ];
  return new THREE.AnimationClip('breathe', 3.6, tracks, THREE.AdditiveAnimationBlendMode);
}

/**
 * קליפ-idle פרוצדורלי כרשת-ביטחון (כשל-ריטרגינג): עמידה חיה עדינה —
 * משקל-גוף מתחלף וזרועות רגועות. לעולם לא T-pose קפואה.
 */
export function makeIdleStandClip(prefix: string): THREE.AnimationClip {
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 1.7, 3.4];
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(trackName('Spine', prefix, '.quaternion'), times, [
      ...q(0.02, 0, 0.014).toArray(), ...q(0.045, 0.02, -0.014).toArray(), ...q(0.02, 0, 0.014).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(trackName('LeftArm', prefix, '.quaternion'), times, [
      ...q(0.06, 0, 0.09).toArray(), ...q(0.09, 0, 0.12).toArray(), ...q(0.06, 0, 0.09).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(trackName('RightArm', prefix, '.quaternion'), times, [
      ...q(0.06, 0, -0.09).toArray(), ...q(0.09, 0, -0.12).toArray(), ...q(0.06, 0, -0.09).toArray(),
    ]),
  ];
  return new THREE.AnimationClip('idle-proc', 3.4, tracks);
}

// ─────────────── מסלקת-עמידה (Task 51, נמדד) ───────────────
/**
 * הבעיה שנמדדה: ה-idle המרוטרגט של Xbot על מיש'ל (ריג Z-up) משכיב אותה
 * על-הגב על הרצפה — רוטציית-האגן של הקליפ נולדה במוסכמת Y-up ואילו
 * ה-bind שלה Z-up (‎+90°X‎): הפרש-המוסכמות = החשיבה לאורך-ציר-אחד שלמה.
 * הישיבה ניצלת כי המסלקה כופה רוטציות מפורשות; העמידה נשענת על הריטרגט.
 *
 * התיקון — אותה משמעת של solveSit, לעמידה: זרועות לאורך-הגוף (כיוון
 * לפי סימן-ה-x של הכתף מול הירכיים — נמדד מהתבנית, לא מנוחש), גב
 * כמעט-זקוף, מבט-קדימה. ללא רצועת-הירכיים — מנוחת-ה-bind כבר עומדת.
 * הרגליים נשארות במנוחה (ישרות ב-bind של שני-הריגים).
 */
export function solveStand(root: THREE.Object3D): PoseMap {
  const bones = collectBones(root);
  const saved: { b: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  for (const b of Object.values(bones)) saved.push({ b, q: b.quaternion.clone(), p: b.position.clone() });
  root.updateMatrixWorld(true);
  try {
    return solveStandInner(bones, root);
  } finally {
    for (const s of saved) { s.b.quaternion.copy(s.q); s.b.position.copy(s.p); }
    root.updateMatrixWorld(true);
  }
}

function solveStandInner(bones: Bones, root: THREE.Object3D): PoseMap {
  const rest: Record<string, THREE.Vector3> = {};
  const sample = (n: string, c: string) => {
    const d = restDir(bones, n, c);
    if (d) rest[n] = d;
  };
  sample('Spine', 'Spine1');
  sample('Neck', 'Head');
  sample('Head', 'HeadTop_End');
  sample('LeftArm', 'LeftForeArm');
  sample('LeftForeArm', 'LeftHand');
  sample('RightArm', 'RightForeArm');
  sample('RightForeArm', 'RightHand');

  const solved: string[] = [];
  const missing: string[] = [];
  const out: Record<string, THREE.Quaternion> = {};

  // גב כמעט-זקוף (0.02 rad קדימה — נינוח, לא נוקשה)
  if (rest['Spine']) {
    const q = aimBone(bones, 'Spine', 'Spine1', new THREE.Vector3(0, Math.cos(0.02), Math.sin(0.02)));
    if (q) { out['Spine'] = q; solved.push('Spine'); }
  } else missing.push('Spine');
  // מבט-קדימה (0.05 rad מטה — עדין)
  if (rest['Head']) {
    const q = aimBone(bones, 'Head', 'HeadTop_End', new THREE.Vector3(0, Math.cos(0.05), Math.sin(0.05)));
    if (q) { out['Head'] = q; solved.push('Head'); }
  } else missing.push('Head');

  // זרועות לאורך-הגוף — כיוון לפי סימן-ה-x של הכתף מול הירכיים (מדידה, לא הנחה)
  const hb = bones['Hips'];
  for (const side of ['Left', 'Right'] as const) {
    const arm = `${side}Arm`, fore = `${side}ForeArm`, hand = `${side}Hand`;
    if (!hb || !bones[arm] || !rest[arm]) { missing.push(arm); continue; }
    hb.updateWorldMatrix(true, false);
    const hp = V(); hb.getWorldPosition(hp);
    bones[arm].updateWorldMatrix(true, false);
    const ap = V(); bones[arm].getWorldPosition(ap);
    const sgn = Math.sign(ap.x - hp.x) || 1;
    // זרוע: כמעט-אנכית-מטה, מעט הצידה ומעט קדימה
    const upperDir = new THREE.Vector3(sgn * 0.12, -0.93, 0.1);
    const qArm = aimBone(bones, arm, fore, upperDir);
    if (qArm) { out[arm] = qArm; solved.push(arm); }
    // מרפק: ממשיך מטה, כפיפה עדינה
    if (rest[fore]) {
      const foreDir = new THREE.Vector3(sgn * 0.05, -0.97, 0.06);
      const qFore = aimBone(bones, fore, hand, foreDir);
      if (qFore) { out[fore] = qFore; solved.push(fore); }
    } else missing.push(fore);
  }

  const hips = bones['Hips'];
  const hipsRest = hips ? hips.position.clone() : new THREE.Vector3(0, 0.9, 0);
  return { q: out, hips: hipsRest, restWorldY: 0, solved, missing };
}

/** קליפ-עמידה ממפת-התנוחה: התנוחה הפתורה בשלושה מפתחות + נשימה-זעירה —
 *  עמידה טבעית בכל ריג, בלי T-pose ובלי ריטרגט. Spine/Head מקבלים רק את
 *  רצועת-הנשימה (רצועה-כפולה-לאותו-נכס אסורה — PropertyMixer יתנגש). */
export function makeStandClip(prefix: string, pose: PoseMap): THREE.AnimationClip | null {
  if (!Object.keys(pose.q).length) return null;
  const times = [0, 2.2, 4.4];
  const tracks: THREE.KeyframeTrack[] = [];
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const nudge = (base: THREE.Quaternion, x: number, z: number) =>
    base.clone().multiply(q(x, 0, z)).toArray();
  for (const [bone, quat] of Object.entries(pose.q)) {
    if (bone === 'Spine' || bone === 'Head') continue; // להלן — עם נשימה-זעירה
    const a = quat.toArray();
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName(bone, prefix, '.quaternion'), times, [...a, ...a, ...a]));
  }
  const spine = pose.q['Spine'];
  if (spine) {
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName('Spine', prefix, '.quaternion'), times, [
      ...nudge(spine, 0, 0.008), ...nudge(spine, 0.012, -0.008), ...nudge(spine, 0, 0.008),
    ]));
  }
  const head = pose.q['Head'];
  if (head) {
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName('Head', prefix, '.quaternion'), times, [
      ...nudge(head, 0.01, 0), ...nudge(head, -0.008, 0), ...nudge(head, 0.01, 0),
    ]));
  }
  return new THREE.AnimationClip('stand', 4.4, tracks);
}

// ═══════════════════ Task 52: ספריית-החיים — פותר-מחוות במרחב-העולם ═══════════════════
/**
 * "בובות-מומיה" נמדדו חי: הצוות התנייד (ישיבה/הקלדה/נשימה/הליכה) אבל אף
 * פעם לא עשה כלום אחר — אפס מבט-סביב, אפס מחוות-דיבור, אפס לגימה.
 *
 * החוק שנמדד (סריקת-צירים חיה, .probe/life-probe.mjs): אולרי-אוילר על
 * עצמות-זרוע אינם מגיבים כמקובל — Y הוא פיתול-סביב-העצם (אפס תנועה
 * נראית), Z מניף אחורה, ו-X חיובי הוא כפיפת-מרפק אל הפה בשני-הריגים.
 * לכן כל מחוות-הגוף נפתרות במרחב-העולם — אותה משמעת של solveSit/aimBone
 * (כיוון-מנוחה מהתבנית, setFromUnitVectors, עיבוד מלמעלה-למטה) — ומומרות
 * לדלתות-אדיטיביות: delta = base⁻¹ × solved. המיקסר מחשב base × delta
 * ומקבל בדיוק את התנוחה הפתורה, מעל כל בסיס חי (ישיבה/עמידה), בלי
 * קפיצה בכניסה/יציאה (המסגרת הראשונה והאחרונה = אפס-היסט).
 */
const qE = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

interface GestureStage {
  /** שרשרות-כיוון: [עצם, צאצא, כיוון-יעד במרחב-המודל אחרי-הבסיס] */
  aims?: Array<[string, string, THREE.Vector3]>;
  /** הטיית-ראש נוספת (אוילר-X מקומי, מעל הבסיס) */
  headTiltX?: number;
}

/**
 * פותר רצף-שלבים של מחווה מעל תנוחת-בסיס ומחזיר דלתות-אדיטיביות לכל עצם.
 * כל שלב: מציב את הבסיס, פותר כל שרשרת עם 2 מעברי-כיוון (התכנסות שנמדדה
 * ב-solveSit), ומחשב delta = base⁻¹ × solved לכל עצם-שנגעה.
 */
function solveGesture(
  root: THREE.Object3D,
  base: PoseMap,
  stages: GestureStage[],
  opts: { firstZero: boolean; lastZero: boolean },
): { times: number[]; deltas: Map<string, THREE.Quaternion[]> } {
  const bones = collectBones(root);
  const saved: { b: THREE.Bone; q: THREE.Quaternion }[] = [];
  for (const b of Object.values(bones)) saved.push({ b, q: b.quaternion.clone() });
  const applyBase = () => {
    for (const [b, q] of Object.entries(base.q)) bones[b]?.quaternion.copy(q);
    root.updateMatrixWorld(true);
  };
  const baseLocalOf = (b: string) => base.q[b]?.clone() ?? new THREE.Quaternion();
  const allBones = new Set<string>();
  try {
    applyBase();
    const perStage: Record<string, THREE.Quaternion>[] = [];
    for (const st of stages) {
      applyBase();
      const local: Record<string, THREE.Quaternion> = {};
      if (st.aims) {
        for (let pass = 0; pass < 2; pass++) {
          for (const [bone, child, dir] of st.aims) {
            const q = aimBone(bones, bone, child, dir);
            if (q && pass === 1) local[bone] = q;
          }
        }
        for (const [bone] of st.aims) allBones.add(bone);
      }
      if (st.headTiltX !== undefined) {
        // delta אוילר ישיר — מורכב מעל הבסיס (base × tilt = הטיה יחסית)
        allBones.add('Head');
        local['Head'] = baseLocalOf('Head').clone().multiply(qE(st.headTiltX, 0, 0));
      }
      perStage.push(local);
    }
    const deltas = new Map<string, THREE.Quaternion[]>();
    const n = stages.length;
    for (let i = 0; i < n; i++) {
      const zero = (i === 0 && opts.firstZero) || (i === n - 1 && opts.lastZero);
      for (const bone of allBones) {
        if (!deltas.has(bone)) deltas.set(bone, []);
        if (zero) deltas.get(bone)!.push(new THREE.Quaternion());
        else {
          const solved = perStage[i][bone];
          deltas.get(bone)!.push(solved ? baseLocalOf(bone).invert().multiply(solved) : new THREE.Quaternion());
        }
      }
    }
    return { times: stages.map((_, i) => i), deltas };
  } finally {
    for (const s of saved) s.b.quaternion.copy(s.q);
    root.updateMatrixWorld(true);
  }
}

/** מרנדר את תוצאת-הפותר לקליפ אדיטיבי; dt בין-שלבים אחיד (הפאזה בצד-המיקסר). */
function gestureClip(
  prefix: string,
  name: string,
  solved: { times: number[]; deltas: Map<string, THREE.Quaternion[]> },
  dur: number,
): THREE.AnimationClip {
  const n = solved.times.length;
  const times = solved.times.map((i) => (i / Math.max(1, n - 1)) * dur);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, qs] of solved.deltas) {
    const vals = qs.flatMap((q) => q.toArray());
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName(bone, prefix, '.quaternion'), times, vals));
  }
  return new THREE.AnimationClip(name, dur, tracks, THREE.AdditiveAnimationBlendMode);
}

/** עזר: כיוון מנקודת-עצם אל נקודת-יעד (מרחב-מודל, מנורמל) */
function dirTo(bones: Bones, from: string, target: THREE.Vector3): THREE.Vector3 {
  const b = bones[from];
  const p = new THREE.Vector3();
  b.getWorldPosition(p);
  return target.clone().sub(p).normalize();
}

const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

/** מבט-סביב חי — הסוכן סורק את החדר (ראש: ימינה/מטה/שמאלה, עדין). */
export function makeLookClip(prefix: string, root: THREE.Object3D, base: PoseMap, seed = 1): THREE.AnimationClip {
  const ph = (seed % 7) * 0.09 - 0.27;
  const stages: GestureStage[] = [
    { aims: [['Head', 'HeadTop_End', dir(0.34 + ph, 0.93, 0.12)]] },
    { aims: [['Head', 'HeadTop_End', dir(-0.2 + ph * 0.5, 0.85, 0.42)]] },
    { aims: [['Head', 'HeadTop_End', dir(-0.38 + ph, 0.9, 0.1)]] },
  ];
  const s = solveGesture(root, base, [{}, ...stages, {}], { firstZero: true, lastZero: true });
  return gestureClip(prefix, 'look', s, 3.3);
}

/** מחוות-דיבור — שתי הזרועות מדברות (כפות חיות, מרפקים כפופים-מעט) כשהבועה פעילה. */
export function makeTalkClip(prefix: string, root: THREE.Object3D, base: PoseMap, seed = 1): THREE.AnimationClip {
  const ph = (seed % 5) * 0.06;
  const wave = (k: number, flip: number): GestureStage => ({
    aims: [
      ['RightArm', 'RightForeArm', dir(0.3 * flip, -0.25 - k * 0.1, 0.9)],
      ['RightForeArm', 'RightHand', dir(0.15 * flip, 0.45 + k * 0.25, 0.85)],
      ['LeftArm', 'LeftForeArm', dir(-0.3 * flip, -0.3, 0.88)],
      ['LeftForeArm', 'LeftHand', dir(-0.12 * flip, 0.38 + (1 - k) * 0.2, 0.87)],
    ],
  });
  const stages: GestureStage[] = [
    {}, wave(0.1 + ph, 1), wave(0.7 + ph, 1), wave(0.35 + ph, 1), wave(0.85 + ph, 1), wave(0.2 + ph, 1), {},
  ];
  return gestureClip(prefix, 'talk', solveGesture(root, base, stages, { firstZero: true, lastZero: true }), 2.4);
}

/** לגימת-קפה (חד-פעמי) — היד הימנית מרימה אל הפה, לגימה, חזרה.
 *  כיווני-המטרה נגזרים מהגיאומטריה החיה: המרפק מכוון את היד אל נקודת-הפה
 *  (ראש + מעט קדימה-מטה) — אין אולרים, אין ניחושי-צירים. */
export function makeSipClip(prefix: string, root: THREE.Object3D, base: PoseMap): THREE.AnimationClip {
  const stages: GestureStage[] = [];
  const sipAt = (k: number): GestureStage => ({
    aims: [
      // זרוע: מהמנוחה חצי-הדרך אל הפה (כיוון המשך מהכתף אל המרווח שלפני-החזה)
      ['RightArm', 'RightForeArm', dir(0.26, 0.02 - 0.34 * k, 0.9)],
      // מרפק: היד אל הפה (אנכי-יותר — מכסה גם זרועות-קצרות)
      ['RightForeArm', 'RightHand', dir(0.06, 0.74 * k + 0.08, 0.68)],
    ],
    headTiltX: 0.09 * k,
  });
  for (const k of [0, 0.55, 1, 0.9, 1, 0.35]) stages.push(sipAt(k));
  stages.unshift({}); stages.push({});
  return gestureClip(prefix, 'sip', solveGesture(root, base, stages, { firstZero: true, lastZero: true }), 3.6);
}

/** חשיבה-נראית — יד אל הסנטר, ראש מורם-מעט, החזקה עם נשימה (לולאה). */
export function makeThinkClip(prefix: string, root: THREE.Object3D, base: PoseMap, seed = 1): THREE.AnimationClip {
  const ph = (seed % 6) * 0.04;
  const thinkAt = (k: number, sway: number): GestureStage => ({
    aims: [
      ['RightArm', 'RightForeArm', dir(0.26, -0.15 - 0.2 * k, 0.92)],
      ['RightForeArm', 'RightHand', dir(0.05, 0.62 * k + 0.08, 0.78 - 0.1 * k)],
      ['LeftArm', 'LeftForeArm', dir(-0.3, -0.35 - 0.15 * k, 0.88)],
      ['LeftForeArm', 'LeftHand', dir(-0.05, 0.3 * k + 0.05, 0.9)],
    ],
    headTiltX: -0.08 * k + sway,
  });
  const stages: GestureStage[] = [
    {}, thinkAt(0.55, 0), thinkAt(1 + ph, 0.01), thinkAt(0.95 + ph, -0.01), thinkAt(1 + ph, 0.01), thinkAt(0.4, 0), {},
  ];
  return gestureClip(prefix, 'think', solveGesture(root, base, stages, { firstZero: true, lastZero: true }), 4.4);
}

/** כתיבה ביד — תנועת-יד קצרה ומהירה מעל השולחן (שונה מהקלדה: יד-אחת שולטת). */
export function makeWriteClip(prefix: string, root: THREE.Object3D, base: PoseMap, seed = 1): THREE.AnimationClip {
  const ph = (seed % 4) * 0.05;
  const writeAt = (sx: number, sy: number): GestureStage => ({
    aims: [
      ['RightArm', 'RightForeArm', dir(0.24, -0.5, 0.84)],
      ['RightForeArm', 'RightHand', dir(0.05 + sx, -0.42 + sy, 0.86)],
    ],
    headTiltX: 0.07,
  });
  const stages: GestureStage[] = [
    {}, writeAt(0, 0), writeAt(0.1 + ph, -0.06), writeAt(-0.06, 0.05), writeAt(0.09 - ph, -0.04), writeAt(-0.05, 0.06), writeAt(0.04, 0), {},
  ];
  return gestureClip(prefix, 'write', solveGesture(root, base, stages, { firstZero: true, lastZero: true }), 1.6);
}

/** הישענות-מנוחה (חד-פעמי) — נשען אחורה, מותח את הזרועות החוצה, חוזר.
 *  עמוד-השדרה נפתר עם כיוון-יעד אחורה (שלילי מול נטיית-הישיבה הקדימה). */
export function makeLeanClip(prefix: string, root: THREE.Object3D, base: PoseMap): THREE.AnimationClip {
  const leanAt = (k: number): GestureStage => ({
    aims: [
      ['Spine', 'Spine1', dir(0, Math.cos(0.14 * k), -Math.sin(0.14 * k))], // אחורה
      ['RightArm', 'RightForeArm', dir(0.92 * k + 0.1, 0.25 * k, -0.2 * k + 0.3)],
      ['LeftArm', 'LeftForeArm', dir(-0.92 * k - 0.1, 0.25 * k, -0.2 * k + 0.3)],
      ['RightForeArm', 'RightHand', dir(0.9 * k + 0.1, 0.3 * k, 0.2)],
      ['LeftForeArm', 'LeftHand', dir(-0.9 * k - 0.1, 0.3 * k, 0.2)],
    ],
    headTiltX: -0.06 * k,
  });
  const stages: GestureStage[] = [{}, leanAt(0.5), leanAt(1), leanAt(0.9), leanAt(0.3), {}];
  return gestureClip(prefix, 'lean', solveGesture(root, base, stages, { firstZero: true, lastZero: true }), 4.3);
}

/** הצבעה אל הלוח (חד-פעמי) — זרוע-ימין מושטת קדימה-מעלה, ראש עוקב. */
export function makePointClip(prefix: string, root: THREE.Object3D, base: PoseMap): THREE.AnimationClip {
  const pointAt = (k: number): GestureStage => ({
    aims: [
      ['RightArm', 'RightForeArm', dir(0.1 * k, 0.32 * k + 0.1, 0.95)],
      ['RightForeArm', 'RightHand', dir(0.05, 0.12 * k, 0.99)],
      ['Head', 'HeadTop_End', dir(0.05 * k, 0.98, 0.2 * k)],
    ],
  });
  const stages: GestureStage[] = [{}, pointAt(0.6), pointAt(1), pointAt(0.94), pointAt(0.3), {}];
  return gestureClip(prefix, 'point', solveGesture(root, base, stages, { firstZero: true, lastZero: true }), 2.7);
}

// ═══════════════════ R58: הליכה-פרוצדורלית פתורה-מרחב ═══════════════════
/**
 * למה (נמדד-חי): העברה-גולמית של קליפ-ההליכה של Xbot אל מיש'ל הופכת את
 * רצועות-הרגליים/האגן (מסגרת Y-up) להתהפכות-גוף על השלד Z-up שלה — אצבעות
 * ב-0.83מ' וגוף תלוי בזווית ("הדמויות מרחפות באוויר"); ו-retargetClip על
 * שלד זה תולה את השרשור-הראשי. הפתרון: אותה משמעת של solveStand — כיווני-
 * יעד מוחלטים במרחב-המודל, עיבוד מלמעלה-למטה, שני מעברי-התכנסות — לאורך
 * מחזור-צעד שלם. אגנוסטי-ריג בבנייה; הגוף זקוף-תמיד, אפס-תלות-מסגרת.
 * האגן אינו נכתב: המוח מזיז את שורש-הדמות, שכבת-החיים נותנת את הקפיצה.
 */
export interface WalkCfg {
  /** משרעת-צעד (1 = הליכה, 1.6 = ריצה) */
  amp?: number;
  /** משרעת-כפיפת-ברך */
  knee?: number;
  /** אורך-מחזור בשניות (הליכה 1.28 — מסונכרן עם חוק-פסיעה ב-Crew) */
  cycle?: number;
}

export function makeWalkPhases(amp = 1, knee = 0.9): WalkCfg {
  return { amp, knee };
}

export function makeWalkClip(prefix: string, root: THREE.Object3D, cfg: WalkCfg = {}): THREE.AnimationClip | null {
  const amp = cfg.amp ?? 1;
  const kneeAmp = cfg.knee ?? 0.9;
  const cycle = cfg.cycle ?? 1.28;
  const bones = collectBones(root);
  const chains: Array<[string, string]> = [
    ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'],
    ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'],
    ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'],
    ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
    ['Spine', 'Spine1'], ['Head', 'HeadTop_End'],
  ];
  for (const [b, c] of chains) if (!bones[b] || !bones[c]) return null; // אין-שלד-תואם — אין-קליפ
  const saved: { b: THREE.Bone; q: THREE.Quaternion }[] = [];
  for (const b of Object.values(bones)) saved.push({ b, q: b.quaternion.clone() });
  const restore = () => {
    for (const s of saved) s.b.quaternion.copy(s.q);
    root.updateMatrixWorld(true);
  };
  try {
    const K = 13; // מפתחות-פאזה למחזור (כל ~28°) — חלק גם ב-slerp
    const times: number[] = [];
    const per: Record<string, THREE.Quaternion[]> = {};
    const push = (b: string, q: THREE.Quaternion) => {
      (per[b] ??= []).push(q.clone());
    };
    for (let k = 0; k < K; k++) {
      const f = k / K;
      const ph = f * Math.PI * 2;
      times.push(f * cycle);
      restore();
      // עמוד-שדרה כמעט-זקוף + מבט-קדימה (מוחלט — מתכנס מכל-מנוחה)
      for (let pass = 0; pass < 2; pass++) {
        aimBone(bones, 'Spine', 'Spine1', new THREE.Vector3(0, Math.cos(0.06), Math.sin(0.06)));
        aimBone(bones, 'Head', 'HeadTop_End', new THREE.Vector3(0, Math.cos(0.03), Math.sin(0.03)));
        // רגליים — נגדי-פאזה: צעד קדימה/אחורה סביב "מטה"
        const swL = Math.sin(ph) * 0.52 * amp;
        const swR = Math.sin(ph + Math.PI) * 0.52 * amp;
        const bL = Math.max(0, Math.sin(ph + 0.95)) * kneeAmp * 0.75;
        const bR = Math.max(0, Math.sin(ph + Math.PI + 0.95)) * kneeAmp * 0.75;
        aimBone(bones, 'LeftUpLeg', 'LeftLeg', new THREE.Vector3(0, -Math.cos(swL), Math.sin(swL)));
        aimBone(bones, 'LeftLeg', 'LeftFoot', new THREE.Vector3(0, -Math.cos(bL), -Math.sin(bL) * 0.85));
        aimBone(bones, 'RightUpLeg', 'RightLeg', new THREE.Vector3(0, -Math.cos(swR), Math.sin(swR)));
        aimBone(bones, 'RightLeg', 'RightFoot', new THREE.Vector3(0, -Math.cos(bR), -Math.sin(bR) * 0.85));
        // זרועות — נגד-הרגליים של אותו-צד, כמעט-אנכיות עם תנודה קדימה/אחורה
        aimBone(bones, 'LeftArm', 'LeftForeArm', new THREE.Vector3(0.12, -0.93, -Math.sin(ph) * 0.24 * amp));
        aimBone(bones, 'LeftForeArm', 'LeftHand', new THREE.Vector3(0.05, -0.97, -Math.sin(ph) * 0.16 * amp));
        aimBone(bones, 'RightArm', 'RightForeArm', new THREE.Vector3(-0.12, -0.93, Math.sin(ph) * 0.24 * amp));
        aimBone(bones, 'RightForeArm', 'RightHand', new THREE.Vector3(-0.05, -0.97, Math.sin(ph) * 0.16 * amp));
      }
      for (const [b] of chains) push(b, bones[b].quaternion);
    }
    // רצף-לולאה: המפתח-האחרון = הראשון
    times.push(cycle);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [b, vals] of Object.entries(per)) {
      const flat: number[] = [];
      for (let i = 0; i < K; i++) flat.push(...vals[i].toArray());
      flat.push(...vals[0].toArray());
      tracks.push(new THREE.QuaternionKeyframeTrack(trackName(b, prefix, '.quaternion'), times, flat));
    }
    return new THREE.AnimationClip('walk-proc', cycle, tracks);
  } finally {
    restore();
  }
}
