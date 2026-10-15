/**
 * Crew.tsx — הצוות האנושי של המשרד.
 * ------------------------------------------------------------------
 * · זכרים — אווטאר Ready Player Me (Wolf3D, פנים אמיתיות, 67 עצמות)
 * · נקבה — Michelle (ריג mixamorig)
 * · מקור אנימציות — Xbot (idle/walk/run/agree/headShake) על אותו ריג mixamorig;
 *   לזכר הקליפים עוברים SkeletonUtils.retargetClip לשלד ה-RPM.
 * · ישיבה/הקלדה/נשימה — מסלקת-התנוחות של pose.ts (מרחב-עולם, לא ניחושי-ציר):
 *   Task 47: קליפ-הישיבה הישן הציב אולרים על צירים-מקומיים של עצמות mixamorig
 *   והניב דחלילים (ידיים מונפות/פרושות — נמדד בצילומי-בסיס). המסלקה ממפה
 *   כיווני-מנוחה אמיתיים אל יעדי-תנוחה במרחב-המודל.
 * · הקלדה ונשימה — קליפים אדיטיביים מעל תנוחת-הבסיס (הישיבה לא "מתקפלת"
 *   כשמתחילים להקליד — היה באג משקולות).
 * · חוק-פאזה אישית: כל לולאה מתחילה בפאזה ייחודית לסוכן — הצוות לא זז
 *   בלולאה-מסונכרנת (היה: כל הפעולות מתחילות ב-t=0 — נשימה משותפת לכולם).
 * · צביעת ביגוד לפי צבע הסוכן בצד הלקוח (שיבוט חומרים).
 * · שלט שם חי + בועת דיבור (מהפיד) + צל מגע.
 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { to3 } from '@/lib/hq/contract';
import { makeBlobShadowTexture, makeBubbleTexture, makeNameplate } from '@/lib/hq/textures';
import { makeSitClip, makeTypeClipAdditive, makeBreatheClip, makeIdleStandClip, makeStandClip, solveSit, solveStand, makeLookClip, makeTalkClip, makeSipClip, makeThinkClip, makeWriteClip, makeLeanClip, makePointClip, makeWalkClip, makeWalkPhases } from '@/lib/hq/pose';
import { applyLifeLayer } from '@/lib/hq/life';
import { useHq } from '@/lib/hq/store';
import { bus, agentVisualFresh, ROOM_STALE_MS } from '@/lib/hq/world';
import { STATE_COLORS } from '@/lib/hq/protocol';

/** בסיס-מודלים לפי-הקשר — נגזר מ-location פעם-אחת, לפי הפריסה בפועל (exec-14
 *  מיזוג 11-a/T12 + תיקון-פריסה נמדד: ב-office-pages ה-bundle חי ב-/office3d/
 *  והמודלים לצידו ./models/; ב-Domain — /Domain/office3d/ עם מודלים
 *  ב-/Domain/models/ ← '../'; באפ-ה-Next — השורש). אין ניחוש, יש מיפוי. */
const MODEL_BASE =
  typeof location === 'undefined'
    ? '/models/humans/'
    : location.pathname.includes('/Domain/office3d')
      ? '../models/humans/'
      : location.pathname.includes('/office3d')
        ? './models/humans/'
        : '/models/humans/';
const MALE_URL = MODEL_BASE + 'readyplayer.me.glb';
const FEMALE_URL = MODEL_BASE + 'Michelle.glb';
const SRC_URL = MODEL_BASE + 'Xbot.glb';
useGLTF.preload(MALE_URL);
useGLTF.preload(FEMALE_URL);
useGLTF.preload(SRC_URL);

const MALE_H = 1.76;
const FEMALE_H = 1.70;

type ClipLib = Record<string, THREE.AnimationClip>;

interface CrewAssets {
  maleTpl: THREE.Object3D;
  femaleTpl: THREE.Object3D;
  male: ClipLib;
  female: ClipLib;
}

// ─────────────── helpers ───────────────
function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => { if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh; });
  return found;
}

function stripPrefix(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks
    .filter((t) => !/LeftEye|RightEye|LeftToeBase|RightToeBase/.test(t.name))
    .map((t) => {
      if (t.name.startsWith('mixamorig:')) {
        const c = t.clone();
        c.name = t.name.replace('mixamorig:', '');
        return c;
      }
      return t;
    });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/**
 * השמטת רצועות עצמות שאינן קיימות ביעד (עיניים וכד') + שני תיקוני-שורש
 * (Task 47):
 * 1. שם-עצם: GLTFLoader מנטרל נקודתיים — שלד מיש'ל חי הוא mixamorigHips
 *    (בלי ":") בעוד רצועות Xbot מכוונות אל mixamorig:Hips — PropertyBinding
 *    לא מצא אף עצם והנקבות היו T-pose קפואות (נמדד חי).
 * 2. מוסכמת-צירים של רצועת-תרגום הירכיים: Xbot נולד Y-up סמ"מ (Armature
 *    סחוט 0.01, hips bind=(0,104,2)) ומיש'ל נולדה Z-up (Character עם rot
 *    +90°X, hips bind=(0,−0.5,−102.6)) — ערכי-התרגום של הירכיים חייבים
 *    מיפוי (x,y,z)→(x,z,−y) או הדמות נופלת לרצפה/חצי-גובה (נמדד חי:
 *    hipsWorldY≈0 עם idle של Xbot על מיש'ל). רק לרצועת-ההירכיים — לשאר
 *    העצמות מסגרת-מקומית זהה בין הריגים.
 */
/**
 * R58 — stripHipsTracks (להליכת-הנקבה-המרוטרגטת): משעה את רצועות-האגן
 * (רוטציה + תרגום) — הרוטציה של Xbot במסגרת Y-up הופכת על שלד Z-up
 * להתהפכות-גוף (נמדד: אצבעות ב-0.83מ'), והתרגום כבר-לא-נדרש: המוח מזיז
 * את שורש-הדמות על-גבי-מסילות-הרצפה, והקפיצה-האנכית מגיעה משכבת-החיים.
 * הרגליים/הידיים/עמוד-השדרה ממשיכים להניע — הליכה נקראת טבעית, גוף זקוף-תמיד.
 */
function stripHipsTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => !/^mixamorig:?Hips\.(quaternion|position|scale)$/.test(t.name));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

function dropMissingBones(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks
    .filter((t) => !/LeftEye|RightEye|LeftToeBase|RightToeBase/.test(t.name))
    .map((t) => {
      let tr = t;
      if (t.name.startsWith('mixamorig:')) {
        tr = t.clone();
        tr.name = t.name.replace(/^mixamorig:/, 'mixamorig');
      }
      // hips translation: Y-up(cm) → Z-up(cm) — values remap (x,y,z)→(x,z,−y)
      // Task 47-fix (נמדד-חי): התנאי הישן (tr !== t) דילג על המיפוי לכל
      // רצועה שכבר-חסרת-נקודתיים — בדיוק הקליפים שמיש'ל מנגנת ישירות מ-Xbot
      // (GLTFLoader משליך נקודתיים, שמות-הרצועות לעולם לא נושאים
      // 'mixamorig:') — התוצאה שנמדדה: הליכה/idle עם ‎+101ס"מ גולמיים
      // בסלוט-Y → אגן 13ס"מ מתחת-לרצפה ומוסט קדימה-1מ' בזמן הליכה.
      // המיפוי נקשר עכשיו לשם-הרצועה בלבד; קליפי pose.ts לעולם לא עוברים
      // דרך הפונקציה הזאת (הם נכתבים ישירות במסגרת שלה).
      if (/^mixamorig(:)?Hips\.position$/.test(tr.name)) {
        const c = tr.clone();
        const v = c.values;
        for (let i = 0; i < v.length; i += 3) {
          const x = v[i], y = v[i + 1], z = v[i + 2];
          v[i] = x; v[i + 1] = z; v[i + 2] = -y;
        }
        return c;
      }
      return tr;
    });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

function filterClipTracks(clip: THREE.AnimationClip, keep: (name: string) => boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => keep(t.name));
  return new THREE.AnimationClip(clip.name + '-f', clip.duration, tracks, clip.blendMode);
}
const isHeadBone = (n: string) => /Neck|Head/.test(n);

/** פאזה ייחודית-לסוכן — דטרמיניסטית מה-id (הצוות לא זז במקה-מסונכרנת) */
function phaseOf(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

// ─────────────── בניית ספריית הקליפים ───────────────
/**
 * חוק-תבנית-נקייה (Task 47): useGLTF מחזיר את אותו אובייקט-גלם מהמטמון
 * בין-הרכבות — וכל מי שמזיז עצמות (retargetClip מציב את המקור בכל פריים
 * של כל קליפ ולא משחזר; HMR עלול להשאיר פוזה-אחרונה) מרעיל את כל
 * השיבוטים-הבאים. נמדד חי: תבנית מיש'ל במטמון נמדדה חצי-שקועה
 * (restWorldY≈0.60 במקום ‎1.03) — מה ששבש את חישוב-הישיבה.
 * הפתרון: לכידת מנוחת-ה-bind פעם-אחת לכל סצנה-מטמונת ושחזורה לפני כל
 * שימוש — שיבוט, מדידה וריטרגינג מתחילים תמיד מאותה מנוחה אמיתית.
 */
const bindPoseCache = new WeakMap<THREE.Object3D, { bones: THREE.Bone[]; q: THREE.Quaternion[]; p: THREE.Vector3[] }>();

function preserveBindPose(scene: THREE.Object3D): void {
  if (bindPoseCache.has(scene)) return;
  const bones: THREE.Bone[] = [];
  const q: THREE.Quaternion[] = [];
  const p: THREE.Vector3[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      bones.push(o as THREE.Bone);
      q.push((o as THREE.Bone).quaternion.clone());
      p.push((o as THREE.Bone).position.clone());
    }
  });
  bindPoseCache.set(scene, { bones, q, p });
}

function restoreBindPose(scene: THREE.Object3D): void {
  const saved = bindPoseCache.get(scene);
  if (!saved) return;
  for (let i = 0; i < saved.bones.length; i++) {
    saved.bones[i].quaternion.copy(saved.q[i]);
    saved.bones[i].position.copy(saved.p[i]);
  }
  scene.updateMatrixWorld(true);
}

/** גובה-גלם של תבנית (לפני נרמול) — לתרגום גובה-ירכיים של המסלקה */
function rawHeight(root: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(root);
  return Math.max(0.01, box.max.y - box.min.y);
}

/**
 * Task 47 — ספריית-הקליפים נבנית מהמסלקה (pose.ts):
 * sit = תנוחה שנפתרה במרחב-העולם (לא אולרים על צירים-מקומיים);
 * type/breathe = אדיטיביים מעל תנוחת-הבסיס (לא מתחרים במשקולות);
 * idle-proc = רשת-ביטחון לעמידה-חיה אם ריטרגינג ה-idle נכשל.
 */
function buildPoseClips(tpl: THREE.Object3D, prefix: string, targetH: number, seatY: number, seed: number): ClipLib {
  const out: ClipLib = {};
  const scale = targetH / rawHeight(tpl);
  const pose = solveSit(tpl, { seatY, scale });
  console.info('hq-crew] pose v10 ' + (prefix || 'rpm') + ' scale=' + scale.toFixed(3) + ' hips=[' + pose.hips.toArray().map((v) => v.toFixed(2)).join(',') + '] restWorldY=' + pose.restWorldY.toFixed(3) + ' rawH=' + rawHeight(tpl).toFixed(3) + ' solved=' + pose.solved.length + ' missing=' + pose.missing.length);
  const sit = makeSitClip(prefix, pose);
  if (sit) out.sit = sit;
  if (Object.keys(pose.q).length) {
    out.type = makeTypeClipAdditive(prefix, seed);
  }
  out.breathe = makeBreatheClip(prefix);
  out.idleProc = makeIdleStandClip(prefix);
  // Task 51 — קליפ-עמידה פתור (מרחב-עולם): הידיים לאורך-הגוף בכל ריג —
  // החלפה-מלאה של ה-T-pose של הבטיחות הישן כשהריטרגט נכשל
  const standPose = solveStand(tpl);
  const stand = makeStandClip(prefix, standPose);
  if (stand) out.stand = stand;
  // Task 52 — ספריית-החיים: מחוות פתורות-מרחב (ALL GATES PASS בשני הריגים —
  // .probe/life-probe.mjs): מבט-סביב, דיבור, לגימה, חשיבה, כתיבה, הישענות,
  // הצבעה. בסיס-ישיבה למחוות-הכיסא; בסיס-עמידה ללגימה/הצבעה.
  try {
    out.look = makeLookClip(prefix, tpl, pose, seed);
    out.talk = makeTalkClip(prefix, tpl, pose, seed);
    out.think = makeThinkClip(prefix, tpl, pose, seed);
    out.write = makeWriteClip(prefix, tpl, pose, seed);
    out.lean = makeLeanClip(prefix, tpl, pose);
    out.sip = makeSipClip(prefix, tpl, standPose);
    out.point = makePointClip(prefix, tpl, standPose);
    // R58 — חוק-בסיס-המחווה (התיקון-המדוד של "הדמויות מרחפות באוויר"):
    // מחווה שנפתרה על בסיס-ישיבה ומופעלת על עומד — מקפלת לו רגליים לכיסא-
    // שאיננו (גוף תלוי בזווית); וסיפ-על-בסיס-עמידה בישיבה מקפיץ את הגוף
    // מהכיסא. לכל מחווה-של-מבט שני פתרונות: look (בסיס-ישיבה, ליושבים)
    // ו־lookStand (בסיס-עמידה, לעומדים) — והבחירה נאכפת ב-useFrame.
    out.lookStand = makeLookClip(prefix, tpl, standPose, seed);
  } catch (e) {
    console.warn('[hq-crew] life-library build failed (graceful — room keeps base motion):', e);
  }
  if (standPose.missing.length) console.warn('[hq-crew] stand solver missing bones:', standPose.missing.join(','));
  if (pose.missing.length) console.warn('[hq-crew] pose solver missing bones:', pose.missing.join(','));
  return out;
}

function buildCrewAssets(maleGltf: { scene: THREE.Object3D }, femaleGltf: { scene: THREE.Object3D }, srcGltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): CrewAssets {
  // חוק-תבנית-נקייה: לכוד את מנוחת-ה-bind בהרכבה הראשונה, לפני כל מוטציה
  preserveBindPose(maleGltf.scene);
  preserveBindPose(femaleGltf.scene);
  preserveBindPose(srcGltf.scene);
  restoreBindPose(maleGltf.scene);
  restoreBindPose(femaleGltf.scene);
  restoreBindPose(srcGltf.scene);

  const maleTpl = SkeletonUtils.clone(maleGltf.scene);
  maleTpl.updateMatrixWorld(true);
  const femaleTpl = SkeletonUtils.clone(femaleGltf.scene);
  femaleTpl.updateMatrixWorld(true);

  const srcClips = srcGltf.animations;
  const find = (re: RegExp) => srcClips.find((c) => re.test(c.name));
  const idle = find(/^(idle|Idle)$/);
  const walk = find(/^(walk|Walk)$/);
  const run = find(/^(run|Run)$/);
  const agree = find(/^agree$/i);
  const shake = find(/^headShake$/i);

  // גובה-מושב: כיסא 0.495מ' — מרכז-האגן של יושב אמיתי נמצא ~0.12מ' מעל
 //  פני-המושב (0.62); ב-0.52 האגן שוקע בכיסא והרגליים מתמשכות קדימה (נמדד)
  const SEAT_Y = 0.62;

  // נקבה — ריג mixamorig זהה: הקליפים המקוריים עובדים ישירות אחרי תיקון-השם
  // (שלד-חי ללא נקודתיים — ראה dropMissingBones). הקידומת 'mixamorig' בלי ":'"
  const female: ClipLib = buildPoseClips(femaleTpl, 'mixamorig', FEMALE_H, SEAT_Y, 7);
  // Task 51 (נמדד בזום): ה-idle המרוטרגט של Xbot משכיב את מיש'ל על-הגב —
  // רוטציית-אגן Y-up על bind Z-up. הקליפ הפתור 'stand' (מרחב-עולם) הוא ה-idle
  // שלה — עמידה טבעית עם ידיים לאורך-הגוף, מהמסלקת ולא מהריטרגט.
  female.idle = female.stand ?? female.idleProc;
  if (agree) female.agree = dropMissingBones(filterClipTracks(agree, isHeadBone));
  if (shake) female.shake = dropMissingBones(filterClipTracks(shake, isHeadBone));

  // זכר — retarget מ-Xbot ל-RPM
  const male: ClipLib = buildPoseClips(maleTpl, '', MALE_H, SEAT_Y, 3);
  const srcMesh = findSkinnedMesh(srcGltf.scene);
  const maleMesh = findSkinnedMesh(maleTpl);
  // R58 — הליכה/ריצה של הנקבה: העברה-גולמית אסורה (רצועות-מקומיות בין-מסגרות
  // שונות = התהפכות-גוף; נמדד: אצבעות ב-0.83מ') ו-retargetClip על השלד הזה
  // תולה את השרשור-הראשי (נמדד). הפתרון-המובטח: הליכה פרוצדורלית פתורה-
  // מרחב-העולם (makeWalkClip — אותה משמעת של solveStand: כיוון-מנוחה מהתבנית,
  // אגנוסטי-ריג בבנייה) — גוף זקוף-תמיד, צעדי-רגליים אמת, אפס-תלות-מסגרת.
  const fWalk = makeWalkClip('mixamorig', femaleTpl, makeWalkPhases());
  if (fWalk) female.walk = fWalk;
  const fRun = makeWalkClip('mixamorig', femaleTpl, makeWalkPhases(1.6, 0.85));
  if (fRun) female.run = fRun;
  if (srcMesh && maleMesh) {
    const tryRetarget = (clip: THREE.AnimationClip | undefined, name: string, keepHip = false) => {
      if (!clip) return;
      try {
        const out = SkeletonUtils.retargetClip(maleMesh!, srcMesh, stripPrefix(clip), {
          preserveBoneMatrix: false,
          preserveHipPosition: keepHip,
          useTargetMatrix: true,
        });
        out.name = name;
        male[name] = out;
      } catch (e) {
        console.warn('[hq-crew] retarget failed for', clip.name, e);
      }
    };
    tryRetarget(idle, 'idle', true);
    tryRetarget(walk, 'walk', true);
    tryRetarget(run, 'run', true);
    if (agree) tryRetarget(filterClipTracks(agree, isHeadBone), 'agree');
    if (shake) tryRetarget(filterClipTracks(shake, isHeadBone), 'shake');
    // retargetClip מציב את המקור והיעד בפוזת-הפריים-האחרון ולא משחזר —
    // משחזרים ידנית (חוק-תבנית-נקייה)
    restoreBindPose(srcGltf.scene);
    restoreBindPose(maleGltf.scene);
    if (!male.idle) male.idle = male.stand ?? male.idleProc; // רשת-ביטחון
  }
  return { maleTpl, femaleTpl, male, female };
}

// ─────────────── צביעה ───────────────
/**
 * Task 51 — חוק-הגוון (נגד-ה"מומיות", נמדד בפרוב .probe/hq-probe.mjs):
 * הישן צבע את כל הגוף בגוון-עור אחיד עם lerp 0.85 — מחק את הטקסטורה
 * והפקיד את השיער בגוון-עור (‎/Head|Body/i מצא גם את Wolf3D_Headwear —
 * התוצאה: ראש+גוף+שיער באותו צבע שטוח = דמויות-מומיה). החוק החדש:
 * הטקסטורה נשארת הזהות, כל גוון הוא tint עדין (≤0.35 עור, ≤0.55 בגדים),
 * שיער/זקן = צבע-שיער (נבדק לפני Head — "Headwear" מכיל "Head"),
 * וראוות-חיים: roughness עור 0.62–0.66 במקום 0.7–1.0.
 */
function recolor(root: THREE.Object3D, color: string, female: boolean, seed: number) {
  const crew = new THREE.Color(color);
  const dark = crew.clone().multiplyScalar(0.42);
  const skinTones = ['#f0c8a0', '#c89868', '#8a5c3a', '#e8b48a'];
  const skin = new THREE.Color(skinTones[seed % skinTones.length]);
  const skinBody = skin.clone().multiplyScalar(0.9); // גוף מעט כהה מהפנים — עומק, לא עטיפה
  const shoeTone = new THREE.Color('#4a4136');
  const hairCols = ['#1a1a1a', '#3a2a1a', '#6b4a2a', '#4a4a4a'];
  const hair = new THREE.Color(hairCols[seed % hairCols.length]);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = (Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : (mats[0].clone() as THREE.Material)) as THREE.Material;
    const apply = (m: THREE.MeshStandardMaterial) => {
      if (female) {
        // מיצ'ל — מאריג טקסטורי יחיד: הטקסטורה היא הזהות, tint מוגבר
        // (0.30 — R58: ב-0.16 הזהות לא נקראה; תמר/שחר נראו כמו אותה דמות)
        m.color.lerp(crew, 0.3);
        return;
      }
      const n = mesh.name;
      if (/Beard|Headwear/i.test(n)) { m.color.copy(hair); m.roughness = 0.72; } // קודם — "Headwear" מכיל "Head"
      // R58 — זהות-צבע נראית: ה-lerp הישן (0.62) השאיר 38% חליפת-טאן בסיסית
      // וכל-הצוות נראה באותו מדים (נמדד בצילומים). הצבע-הקנוני של הסוכן
      // חייב להיקרא מהמרחק — כמו מדי-יחידה אמיתיים.
      else if (/Outfit_Top/i.test(n)) { m.color.lerp(crew, 0.88); m.roughness = 0.78; }
      else if (/Outfit_Bottom/i.test(n)) { m.color.lerp(dark, 0.8); m.roughness = 0.82; }
      else if (/Outfit_Footwear/i.test(n)) { m.color.lerp(shoeTone, 0.7); m.roughness = 0.85; }
      else if (/^Mesh$/i.test(n)) { m.color.copy(hair); } // שיער RPM (מש-גורף)
      else if (/Teeth|Eye/i.test(n)) { /* ללא שינוי */ }
      else if (/Head/i.test(n)) { m.color.lerp(skin, 0.28); m.roughness = Math.min(m.roughness, 0.64); }
      else if (/Body/i.test(n)) { m.color.lerp(skinBody, 0.34); m.roughness = Math.min(m.roughness, 0.66); }
    };
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) apply(m as THREE.MeshStandardMaterial);
    });
  });
}

// ─────────────── מאגר בועות ───────────────
const bubbles = new Map<string, ReturnType<typeof makeBubbleTexture>>();
function bubbleOf(id: string) {
  let b = bubbles.get(id);
  if (!b) { b = makeBubbleTexture(); bubbles.set(id, b); }
  return b;
}

// ─────────────── הצוות ───────────────
export function Crew() {
  const maleGltf = useGLTF(MALE_URL);
  const femaleGltf = useGLTF(FEMALE_URL);
  const srcGltf = useGLTF(SRC_URL);
  const assets = useMemo(
    () => buildCrewAssets(maleGltf as never, femaleGltf as never, srcGltf as never),
    [maleGltf, femaleGltf, srcGltf],
  );
  const crew = useHq((s) => s.snap.crew);
  return (
    <group>
      {crew.map((c) => (
        <HumanAgent key={c.id} id={c.id} assets={assets} />
      ))}
    </group>
  );
}

const GENDER_OF: Record<string, 'male' | 'female'> = { aluf: 'male', gal: 'male', erez: 'male', tamar: 'female', shachar: 'female', yarden: 'male' };

/** RNG דטרמיניסטי-לסוכן — לוח-החיים לא מסונכרן בין-הסוכנים ולא רנדומלי-בין-טעינות */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FaceParts {
  eyeL: THREE.Object3D | null;
  eyeR: THREE.Object3D | null;
  mouthMesh: THREE.Mesh | null;
  mouthOpen: number;
  mouthSmile: number;
}

function findFaceParts(root: THREE.Object3D): FaceParts {
  const out: FaceParts = { eyeL: null, eyeR: null, mouthMesh: null, mouthOpen: -1, mouthSmile: -1 };
  root.traverse((o) => {
    if (o.name === 'EyeLeft') out.eyeL = o;
    else if (o.name === 'EyeRight') out.eyeR = o;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary) {
      if (m.morphTargetDictionary.mouthOpen !== undefined) {
        out.mouthMesh = m;
        out.mouthOpen = m.morphTargetDictionary.mouthOpen;
        out.mouthSmile = m.morphTargetDictionary.mouthSmile ?? -1;
      }
    }
  });
  return out;
}

function HumanAgent({ id, assets }: { id: string; assets: CrewAssets }) {
  const female = GENDER_OF[id] === 'female';
  const crew = useHq((s) => s.snap.crew.find((c) => c.id === id));
  const color = crew?.color ?? '#c9a227';

  const model = useMemo(() => {
    const tpl = female ? assets.femaleTpl : assets.maleTpl;
    const clone = SkeletonUtils.clone(tpl);
    // נרמול גובה
    const box = new THREE.Box3().setFromObject(clone);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const s = (female ? FEMALE_H : MALE_H) / h;
    clone.scale.setScalar(s);
    // Task 51 — חוק-מגע-קרקע (נגד-ה"מרחוף"): אחרי נרמול-הגובה, אם מנוחת
    // התבנית לא מציבה את הסוליות על y=0 הדמות כולה מרחפת/שקועה. מדידה
    // דטרמיניסטית והזזת-שורש בלבד — פתרון-הישיבה במרחב-העולם נשאר תקף
    // (ההזזה אחידה לכל-העצמות ולא משנה את מנוחת-העצמות עצמה).
    const grounded = new THREE.Box3().setFromObject(clone);
    if (Math.abs(grounded.min.y) > 0.005) clone.position.y -= grounded.min.y;
    recolor(clone, color, female, id.charCodeAt(0) + id.length);
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.frustumCulled = true; }
    });
    return clone;
  }, [female, assets, color, id]);

  const lib = female ? assets.female : assets.male;
  // פנים (עיניים/פה) — ref ולא memo: השעון משנה סיבובי-עיניים בכל פריים
  // (אובייקטים חיים של שלד — לא מצב-ריאקטיבי)
  const faceRef = useRef<FaceParts | null>(null);
  if (faceRef.current === null) faceRef.current = findFaceParts(model);
  const face = faceRef.current;
  const plate = useMemo(() => makeNameplate(crew?.name.he ?? id, crew?.title.he ?? '', color), [crew, color]);
  const bubble = useMemo(() => bubbleOf(id), [id]);
  const shadowTex = useMemo(() => makeBlobShadowTexture(), []);

  // מיקסר
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  // debug hook (dev): live per-agent mixers for browser probing
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__hqMixers = { ...((w.__hqMixers as Record<string, THREE.AnimationMixer>) ?? {}), [id]: mixer };
  }, [id, mixer]);
  const actions = useRef<Record<string, THREE.AnimationAction>>({});
  const alive = useRef(true);
  useEffect(() => {
    const a: Record<string, THREE.AnimationAction> = {};
    // חוק-פאזה (Task 47): כל לולאה מתחילה בפאזה ייחודית-לסוכן — בלי זה כל
    // הצוות נושם/מהלך במקה-מסונכרנת (כל הפעולות היו מתחילות ב-t=0).
    for (const [name, clip] of Object.entries(lib)) {
      if (!clip) continue;
      const act = mixer.clipAction(clip, model);
      act.play();
      const base = name === 'idle' ? 1 : 0;
      act.setEffectiveWeight(base);
      if (act.loop === THREE.LoopRepeat) act.time = phaseOf(id, name.length * 31 + 7) * clip.duration;
      // Task 52 — סנכרון-פסיעה: המוח הולך 88 יח'/שנ' ≈ 1.1 מ'/שנ'; מחזור-הליכה
      // אנושי בקצב הזה ≈ 1.28שנ'. בלי-זה הקליפ מנבנה בקצב-משלו והרגליים
      // מחליקות על הרצפה (moonwalk — נראה מגוחך, לא מקצועי).
      if (name === 'walk') act.timeScale = Math.min(1.5, Math.max(0.72, clip.duration / 1.28));
      a[name] = act;
    }
    actions.current = a;
    return () => { mixer.stopAllAction(); };
  }, [mixer, lib, model, id]);

  // ניקוי-משאבים מלא בהורדה (Task 46): חומרים משובטים + המיקסר + דגל-חיים
  // שמונע מ-timer-ים של מחוות לגעת במיקסר אחרי-שהדמות הורדה
  useEffect(() => {
    alive.current = true;
    const mats: THREE.Material[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const arr = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of arr) mats.push(mm as THREE.Material);
      }
    });
    return () => {
      alive.current = false;
      for (const m of mats) m.dispose();
      mixer.uncacheRoot(model);
    };
  }, [mixer, model]);

  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  // R54 — עיגון-השלטים: refs לפלטה/בועה לשליטת-LOD (הסתרה-במרחק + אוקלוזיה)
  const plateSpr = useRef<THREE.Sprite>(null);
  const bubbleSpr = useRef<THREE.Sprite>(null);
  const lodV = useMemo(() => new THREE.Vector3(), []);
  const curWeight = useRef<Record<string, number>>({ idle: 1, walk: 0, sit: 0, type: 0, write: 0, think: 0, talk: 0 });
  const lastGesture = useRef<{ name: string; until: number }>({ name: '', until: 0 });
  const lastBubbleTxt = useRef('');
  const sayUntil = useRef(0);
  const rng = useRef(mulberry32(2166136261 ^ (id.charCodeAt(0) << 8) ^ id.length));
  const micro = useRef<{ next: number; active: null | { name: string; until: number } }>({ next: 3, active: null });
  const eyes = useRef({ next: 1.5, tx: 0, ty: 0 });

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    // Task 47: 墙钟插值 — the 0.05s clamp (mixer-stability) divided the
    // weight-crossfade rate at a low frame rate: a sit transition that should
    // take ~0.3s crawled for 30+ wall seconds on SwiftShader and every
    // screenshot caught a half-standing mid-blend (measured: hips blended
    // walk 0.5 / idle 0.4 / sit 0.1 minutes after arrival). The exponential
    // form is unconditionally stable at any dt.
    const dtW = Math.min(dtRaw, 0.25);
    const brains = useHq.getState().brains;
    const brain = brains.get(id);
    if (!brain) return;
    // THE TICK (Gate A fix, Task 46): the brain's movement/sit/work state is
    // interpolated HERE, once per frame per agent — without it walkAmt/sitAmt/
    // workAmt stay 0 forever and the whole crew freezes standing (the exact
    // "static characters with status labels" defect this task forbids).
    // Navigation gets wall-clock time (the 0.05s render clamp divided walking
    // speed by ~25 at a low frame rate); cosmetics keep the stable clamp.
    brain.update(Math.min(dtRaw, 1.0), dt);
    const g = group.current;
    if (!g) return;

    // מיקום + כיוון
    const [x, z] = to3(brain.x, brain.y);
    g.position.set(x, 0, z);
    if (inner.current) inner.current.rotation.y = brain.yaw;

    // משקולות פעולה — מהחוזה הדטרמיניסטי (agentVisual) עם חוק-הטריות:
    // סנאפשוט ישן/ניתוק = אפס עבודה. הנפשה ≠ פעילות (Task 46 Gate A).
    // Task 47: הקלדה ונשימה אדיטיביות — הישיבה נשארת הבסיס המלא (היתה
    // "מתקפלת" לחצי-ישיבה בגלל חלוקת-משקל ישנה); idle רק כשעומדים.
    const bridge = useHq.getState();
    const fresh =
      bridge.connected &&
      bridge.lastSignalAt !== null &&
      Date.now() - bridge.lastSignalAt < ROOM_STALE_MS;
    const w = curWeight.current;
    const walkT = brain.walkAmt;
    const sitT = brain.sitAmt;
    const workT = fresh ? brain.workAmt : 0;
    // Task 47: בישיבה — שה-idle/walk לא ימשכו את התנוחה חזרה אל-עמידה
    // (ב-8% שיורי הרגליים נשארו חצי-פשוטות; ריבוע מחשל את ההכרעה)
    const sitSettled = sitT * sitT;
    w.idle = Math.max(0, 1 - walkT) * (1 - sitSettled);
    w.walk = walkT * (1 - sitSettled * 0.85);
    w.sit = sitT;
    // Task 52 — חוזה-העבודה המפורט: מצב-הפורמן קובע איזו אנימציית-עבודה
    // נראית (בדיקה=הקלדה · כתיבה=כתיבת-יד · חשיבה/קריאה=יד-אל-הסנטר),
    // הכל בחוק-הטריות (סנאפשוט-ישן = אפס עבודה):
    const st = useHq.getState().snap.agents.find((a) => a.id === id);
    const now = state.clock.getElapsedTime();
    const workState = fresh ? st?.state ?? 'idle' : 'idle';
    const isChecking = workState === 'checking';
    const isWriting = workState === 'writing';
    const isThinking = workState === 'thinking' || workState === 'reading';
    w.type = workT * (isChecking ? 1 : isThinking ? 0.28 : 0);
    w.write = workT * (isWriting ? 1 : 0);
    w.think = workT * (isThinking ? 1 : 0);
    // דיבור — בועה חיה + לא בהליכה + לא בעבודה-מרוכזת: הזרועות מדברות
    const talking = fresh && now < sayUntil.current && walkT < 0.4 && workT < 0.4;
    w.talk = talking ? 0.85 : 0;
    const setW = (name: string, v: number) => {
      const act = actions.current[name];
      if (!act) return;
      const target = Math.min(1, Math.max(0, v));
      const cur = act.getEffectiveWeight();
      const nw = cur + (target - cur) * (1 - Math.exp(-dtW * 9));
      act.setEffectiveWeight(nw);
    };
    setW('idle', w.idle);
    setW('walk', w.walk);
    setW('sit', w.sit);
    setW('type', w.type);
    setW('write', w.write);
    setW('think', w.think);
    setW('talk', w.talk);
    setW('breathe', 1); // קיום בסיסי — תמיד (אדיטיבי, עדין)

    // מחוות חד-פעמיות לפי החוזה — רק כשהאמת טרייה (חוק-הטריות)
    const gesture = st ? agentVisualFresh(st.state, fresh).gesture : 'none';
    if (gesture === 'agree' && lastGesture.current.name !== 'agree' && now - lastGesture.current.until > 6) {
      const act = actions.current['agree'];
      if (act) { act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.setEffectiveWeight(0.9); act.play(); }
      lastGesture.current = { name: 'agree', until: now + 1.6 };
      setTimeout(() => { if (!alive.current) return; const a2 = actions.current['agree']; a2?.stop(); a2?.setEffectiveWeight(0); }, 1800);
    }
    if (gesture === 'shake' && lastGesture.current.name !== 'shake' && now - lastGesture.current.until > 6) {
      const act = actions.current['shake'];
      if (act) { act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.setEffectiveWeight(0.9); act.play(); }
      lastGesture.current = { name: 'shake', until: now + 1.4 };
      setTimeout(() => { if (!alive.current) return; const a2 = actions.current['shake']; a2?.stop(); a2?.setEffectiveWeight(0); }, 1600);
    }

    // ─── Task 52: לוח-החיים — מיקרו-מחוות קשובות-הקשר ───
    // סוכן פנוי אף-פעם לא פסלון: מבט-סביב, הישענות, לגימה, הצבעה-אל-הלוח.
    // הפיזור דטרמיניסטי-לסוכן (rng מה-id) — החדר לא זז במקה. המחוות אינן
    // עבודה ולא נספרות ככאלה — הן חיים; העבודה מגיעה מהפורמן בלבד.
    const m = micro.current;
    if (m.active && now > m.active.until) {
      const act = actions.current[m.active.name];
      act?.stop();
      act?.setEffectiveWeight(0);
      m.active = null;
      m.next = now + 6 + rng.current() * 12;
    }
    if (!m.active && now > m.next && walkT < 0.35 && now > lastGesture.current.until + 0.5 && w.talk < 0.3) {
      const onCoffee = brain.station === 'coffee';
      const seated = sitT > 0.5;
      const working = workT > 0.35;
      let pick: string | null = null;
      // R58 — הבחירה כבולה לבסיס-התנוחה האמיתי (ראה חוק-בסיס-המחווה):
      // יושב — רק מחוות-בסיס-ישיבה; עומד — רק מחוות-בסיס-עמידה. אפס-ערבוב.
      if (onCoffee && !working) pick = rng.current() < 0.75 ? 'sip' : 'lookStand';
      else if (seated && !working) {
        const r = rng.current();
        pick = r < 0.5 ? 'look' : r < 0.82 ? 'lean' : null;
      } else if (!seated && !working) {
        pick = brain.station === 'wall' && rng.current() < 0.55 ? 'point' : 'lookStand';
      }
      if (pick && actions.current[pick]) {
        const act = actions.current[pick]!;
        act.reset();
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = false;
        act.setEffectiveWeight(0.92);
        act.play();
        m.active = { name: pick, until: now + act.getClip().duration + 0.2 };
      } else {
        m.next = now + 5 + rng.current() * 8;
      }
    }

    // ─── Task 52: פנים חיות (ריג RPM בלבד — מיש'ל חסרת מורפים) ───
    // עיניים: סקאדות-מבט קטנות כל 1.6–5.8שנ' (העיניים משועבדות לראש —
    // הרוטציה המקומית מוסיפה מבט-עדין מעל תנועת-הראש).
    if (faceRef.current && faceRef.current.eyeL && faceRef.current.eyeR) {
      const es = eyes.current;
      es.next -= dt;
      if (es.next <= 0) {
        es.next = 1.6 + rng.current() * 4.2;
        es.tx = (rng.current() - 0.5) * 0.3;
        es.ty = (rng.current() - 0.5) * 0.16;
      }
      const kE = 1 - Math.exp(-dt * 10);
      const eyeL = faceRef.current.eyeL;
      const eyeR = faceRef.current.eyeR;
      eyeL.rotation.y += (es.tx - eyeL.rotation.y) * kE;
      eyeR.rotation.y += (es.tx - eyeR.rotation.y) * kE;
      eyeL.rotation.x += (es.ty - eyeL.rotation.x) * kE;
      eyeR.rotation.x += (es.ty - eyeR.rotation.x) * kE;
    }
    // פה: מורפים mouthOpen/mouthSmile — דיבור נראה כשהבועה חיה, חיוך-קל
    // כשהאמת טרייה (לעולם לא בכשל).
    const fparts = faceRef.current;
    if (fparts && fparts.mouthMesh && fparts.mouthOpen >= 0 && fparts.mouthMesh.morphTargetInfluences) {
      const infl = fparts.mouthMesh.morphTargetInfluences;
      const targetOpen = w.talk > 0.4 ? 0.16 + 0.42 * Math.abs(Math.sin(now * 10.7)) * Math.abs(Math.sin(now * 3.1)) : 0;
      const targetSmile = fresh && st?.state !== 'error' ? 0.2 : 0;
      infl[fparts.mouthOpen] += (targetOpen - infl[fparts.mouthOpen]!) * (1 - Math.exp(-dt * 14));
      if (fparts.mouthSmile >= 0) infl[fparts.mouthSmile] += (targetSmile - infl[fparts.mouthSmile]!) * (1 - Math.exp(-dt * 6));
    }

    // נשימה עדינה במנוחה
    void now;

    // שלט שם + בועה — כשהאמת ישנה השלט אומר "לא ידוע" בצבע-תשומת-הלב,
    // לעולם לא ממשיך להציג פעילות שלא נמדדה
    const lang = useHq.getState().lang;
    const activityText = fresh ? (st?.activity || '') : lang === 'he' ? 'האמת לא טרייה — לא ידוע' : 'truth stale — unknown';
    plate.set(activityText, fresh ? STATE_COLORS[st?.state || 'idle'] : '#b45309');
    const logs = useHq.getState().snap.logs[id] || [];
    const say = [...logs].reverse().find((l) => l.kind === 'say' && Date.now() - l.ts < 14000);
    const txt = say?.text ?? '';
    if (txt !== lastBubbleTxt.current) {
      lastBubbleTxt.current = txt;
      bubble.set(txt);
      if (txt) sayUntil.current = now + 7.5; // הזרועות והפה מדברים בבורסטים, לא כל-14שנ'
    }

    // צל מגע — עוקב אחרי הרגליים
    if (shadowRef.current) {
      shadowRef.current.position.set(x, 0.015, z);
    }

    // R54 — חוק-השלטים ("הבנות מרחפות באוויר"): הפלטה והבועה אינן רהיט-קבוע.
    // · אוקלוזיה אמת: depthTest=true (מאחורי-קיר/מסך — לא נצבעות דרך)
    // · LOD-מרחק: נעלמות החל מ-~9.5מ' עם דהייה — מבט-כללי נקי, קרבה = פירוט
    // · בועה: רק כשיש מה לומר (חלון-הדיבור הנמדד), אחרת אפס-רישום
    const cam = state.camera;
    if (plateSpr.current) {
      plateSpr.current.getWorldPosition(lodV);
      const d = lodV.distanceTo(cam.position);
      const vis = d < 9.5;
      plateSpr.current.visible = vis;
      const m = plateSpr.current.material as THREE.SpriteMaterial;
      m.opacity = vis ? Math.min(0.98, Math.max(0.22, 1.55 - d / 7.5)) : 0;
    }
    if (bubbleSpr.current) {
      bubbleSpr.current.getWorldPosition(lodV);
      const d = lodV.distanceTo(cam.position);
      const has = lastBubbleTxt.current !== '' && now < sayUntil.current + 6.5;
      const vis = has && d < 9.5;
      bubbleSpr.current.visible = vis;
      const m = bubbleSpr.current.material as THREE.SpriteMaterial;
      m.opacity = vis ? Math.min(0.98, Math.max(0.3, 1.55 - d / 7.5)) : 0;
    }

    mixer.update(dt);
    // מיזוג-החיים (משרד אחד): שכבה פרוצדורלית עדינה אחרי-המיקסר — קפיצת-הילוך,
    // נטייה, העברת-משקל, נשימה-בראש (מה שנמדד ב-v2 ועבר למקור המוביל).
    // קוסמטיקה-חיים בלבד — לא עבודה ולא תנוחה; המסלקה והקליפים נותרים החוזה.
    applyLifeLayer({ inner: inner.current, model, walkT, sitT, phase: phaseOf(id, 991), now, dt });
  });

  const focus = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const st = useHq.getState();
    const brain = st.brains.get(id);
    if (brain) bus.emit('focus', { target: { x: brain.x, y: brain.y }, kind: 'desk', id });
    st.setPanel('agent', id);
  };

  return (
    <group ref={group}>
      {/* צל מגע */}
      <mesh ref={shadowRef} rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.75} />
      </mesh>
      <group ref={inner} onClick={focus}>
        <primitive object={model} />
        {/* שלט שם — R54: קומפקטי, צמוד-לראש (1.86מ'), נוקלד מאחורי-קירות
         * (depthTest=true) ונעלם-במרחק (LOD ב-useFrame) — היה פאנל-שחור
         * ענקי שצף דרך-הכל בכל תצפית (נמדד בצילומי-בסיס) */}
        <sprite ref={plateSpr} position={[0, 1.86, 0]} scale={[0.86, 0.27, 1]}>
          <spriteMaterial map={plate.tex} transparent depthWrite={false} depthTest opacity={0.95} />
        </sprite>
        {/* בועת דיבור — מעוגנת מעל-השלט, אותו חוק-עיגון */}
        <sprite ref={bubbleSpr} position={[0, 2.3, 0]} scale={[0.92, 0.26, 1]}>
          <spriteMaterial map={bubble.tex} transparent depthWrite={false} depthTest opacity={0.95} />
        </sprite>
      </group>
    </group>
  );
}
