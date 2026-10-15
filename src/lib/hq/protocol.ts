/**
 * protocol.ts — חוזה החוט של מפקדת הצי, מקור-אמת אחד.
 * הטיפוסים חיים ב-agent-hq/types.ts (הממשק האמיתי); כאן רק מייצאים אותם
 * ומוסיפים את מה ששייך לחדר התלת-ממדי בלבד (צבעי קנבן, צוות מילואים).
 * Wire-compatible with mini-services/foreman — המספרים בחדר הם תמיד
 * אירועים אמיתיים של הפורמן, לעולם לא המצאה מקומית.
 */
export * from '@/components/agent-hq/types';

import type { CrewMember, TaskStatus } from '@/components/agent-hq/types';

/** צבעי עמודות הקנבן הפיזי (חדר 3D בלבד — מוצגים על לוח המשימות) */
export const TASK_COL: Record<TaskStatus, string> = {
  todo: '#8a8f98',
  doing: '#d946ef',
  review: '#fbbf24',
  done: '#34d399',
  blocked: '#fb7185',
  cancelled: '#52525b',
};

/** R58 — תוויות-מצב בעברית לצגי-העבודה (מה הסוכן עושה עכשיו, במילים שלנו) */
export const STATE_HE: Record<string, string> = {
  idle: 'פנוי — ממתין למטלה',
  thinking: 'חושב על גישה',
  reading: 'קורא מקור',
  checking: 'בודק ומאמת',
  writing: 'כותב ומבצע',
  walking: 'בתנועה בחדר',
  waiting_user: 'ממתין להכרעת-בעלים',
  blocked: 'חסום — דורש פתיחה',
  done: 'השלים — מסכם',
  error: 'כשל — לתיקון',
};

/** Fallback cast — identical ids/colors to the foreman's CREW (mini-services/agent-hq/src/cast.ts).
 *  משמש רק לריהוט החדר לפני שהסנאפשוט האמיתי הראשון מגיע. */
export const CREW_FALLBACK: CrewMember[] = [
  { id: 'aluf',   name: { he: 'אלוף',  en: 'Aluf' },   title: { he: 'ראש-המטה',      en: 'Chief of staff' },        color: '#E0973F', specialty: { he: 'מתכנן את העבודה וחותם סיכומים', en: 'Plans the work, signs the summary' }, books: [], role: 'lead' },
  { id: 'gal',    name: { he: 'גל',    en: 'Gal' },    title: { he: 'מפעיל שוק',     en: 'Market operator' },       color: '#3BA08F', specialty: { he: 'ספרי הדקס והמסחר', en: 'Exchange and markets' }, books: ['dex-book', 'fills-ledger'], role: 'worker' },
  { id: 'erez',   name: { he: 'ארז',   en: 'Erez' },   title: { he: 'מבקר פנים',     en: 'Internal auditor' },      color: '#C9A227', specialty: { he: 'ביקורות וטענות', en: 'Audits and claims' }, books: ['claims-audit'], role: 'worker' },
  { id: 'tamar',  name: { he: 'תמר',   en: 'Tamar' },  title: { he: 'כלכלנית הצי',   en: 'Fleet economist' },       color: '#7BA05B', specialty: { he: 'כלכלה וריבונות', en: 'Economics and sovereignty' }, books: ['econ-book'], role: 'worker' },
  { id: 'shachar',name: { he: 'שחר',   en: 'Shachar' },title: { he: 'קצין מודיעין',  en: 'Intelligence officer' },  color: '#C76B4A', specialty: { he: 'מדדים ולמידה', en: 'Indicators and learning' }, books: ['fleet-indicators'], role: 'worker' },
  { id: 'yarden', name: { he: 'ירדן',  en: 'Yarden' }, title: { he: 'מהנדס תשתיות',  en: 'Infrastructure eng.' },   color: '#6E8FA8', specialty: { he: 'רישום סוכנים ותזמונים', en: 'Registry and schedulers' }, books: ['registry', 'coord-bus'], role: 'worker' },
];
