/**
 * life.ts — שכבת-החיים הפרוצדורלית של הצוות (מיזוג office3d/v2 → משרד אחד).
 * ------------------------------------------------------------------
 * מה שנמדד ב-v2 ועבר למקור המוביל (בלי לגעת במסלקת-התנוחות של pose.ts ובלי
 * להתחרות בקליפים — הכל אדיטיבי אחרי mixer.update, שמאפס את העצמות כל-פריים):
 * · קפיצת-גוף אנכית בקצב-הצעדים בזמן הליכה (צורת |cos| — v2) — על-קבוצת-
 *   הפנים בלבד, כדי שלא להיאבק ברצועת-תרגום-הירכיים של הקליפ.
 * · נטיית-הליכה קדימה קלה (v2: torso.rotation.x=.07) — עצם-Spine1/Spine.
 * · עמידה: העברת-משקל עדינה בזרועות (±0.02 rad, v2: ±0.022) + נשימה בראש
 *   (v2: breathe*.03→0.018) — החדר לעולם לא נראה כפסלים.
 * · בישיבה — אף-תוספת: המסלקה (Task 47) שולטת, הקלדה/נשימה אדיטיביים כבר
 *   במשקלים. חוק-הטריות נשמר — שכבה זו קוסמטיקה-חיים, לא "עבודה".
 * ריג-אגנוסטי: mixamorig (מיש'ל) ו-RPM Wolf3D כאחד — זיהוי לפי שם-עצם
 * לאחר הסרת-קידומת, עם מטמון-WeakMap לכל-מודל.
 */
import * as THREE from 'three';

interface LifeBones {
  head: THREE.Bone | null;
  armL: THREE.Bone | null;
  armR: THREE.Bone | null;
  spine: THREE.Bone | null;
}

const cache = new WeakMap<THREE.Object3D, LifeBones>();

function bonesOf(root: THREE.Object3D): LifeBones {
  const hit = cache.get(root);
  if (hit) return hit;
  const out: LifeBones = { head: null, armL: null, armR: null, spine: null };
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (!b.isBone) return;
    const n = b.name.replace(/^mixamorig:?/, '');
    if (out.head === null && n === 'Head') out.head = b;
    else if (out.armL === null && n === 'LeftArm') out.armL = b;
    else if (out.armR === null && n === 'RightArm') out.armR = b;
    else if (out.spine === null && (n === 'Spine1' || n === 'Spine')) out.spine = b;
  });
  cache.set(root, out);
  return out;
}

export interface LifeInput {
  /** קבוצת-הפנים של הדמות (רוטציית-פנייה בלבד עד-היום — כאן נוסף הקפיץ) */
  inner: THREE.Group | null;
  model: THREE.Object3D;
  /** משקל-ההליכה הממורקב מהמוח (0..1) */
  walkT: number;
  /** משקל-הישיבה הממורקב מהמוח (0..1) */
  sitT: number;
  /** פאזה ייחודית-לסוכן — החדר לא זז במקה */
  phase: number;
  /** שעון-הסצנה (שניות) */
  now: number;
  /** דטא-טיים מהודק (שניות) */
  dt: number;
}

export function applyLifeLayer(o: LifeInput): void {
  const { inner, model, walkT, sitT, phase, now, dt } = o;
  const walking = walkT > 0.15;
  const standing = !walking && sitT < 0.5;

  // הליכה: קפיצת-גוף אנכית בקצב-הצעדים (הצורה שנמדדה ב-v2 — |cos|)
  if (inner) {
    const bob = walking ? Math.abs(Math.cos(now * 7.2 + phase)) * 0.026 * Math.min(1, walkT) : 0;
    inner.position.y += (bob - inner.position.y) * Math.min(1, dt * 10);
  }

  if (walking) {
    const sp = bonesOf(model).spine;
    if (sp) sp.rotation.x += 0.04 * Math.min(1, walkT); // נטיית-הליכה קדימה
    return;
  }
  if (!standing) return; // ישיבה — המסלקה שולטת, אף-תוספת

  const breathe = Math.sin(now * 1.6 + phase);
  const b = bonesOf(model);
  // העברת-משקל עדינה בזרועות — עמידה-פנויה לעולם לא פסלון (v2)
  if (b.armL) b.armL.rotation.z += Math.sin(now * 0.5 + phase) * 0.02;
  if (b.armR) b.armR.rotation.z -= Math.sin(now * 0.5 + phase) * 0.02;
  // נשימה בראש — עדינה, בכל עמידה
  if (b.head) b.head.rotation.x += breathe * 0.018;
}
