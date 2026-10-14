// מרכז-היכולות · קטלוג-הנתונים — דפוס awesome-dsh-plugin: הרישום-נגזר-מנתונים-ולא-מהצהרות.
// מקור-אמת-אחד: גם-השרת (run/state) וגם-המסך (skills.tsx) קוראים-מהקובץ-הזה.
// כל-יכולת-כאן-היא-SDK-אמת-הרץ-בשרת-בלבד (z-ai-web-dev-sdk); כל-הרצה-נרשמת-ב-SkillRun.

export type SkillCategory = "lang" | "vision" | "audio" | "image" | "web";

export interface SkillMeta {
  id: string;
  name: string; // שם-עברי
  nameEn: string;
  category: SkillCategory;
  desc: string; // מה-היא-עושה-באמת
  sdk: string; // נקודת-ה-SDK-האמת (שקיפות-הנדסית)
  inputSpec: string; // מה-מזינים
  sample: Record<string, string | number>; // דוגמה-מוכנה-להפעלה-בלחיצה
  icon: string; // מפתח-אייקון (מומר-במסך)
}

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  lang: "לשון",
  vision: "ראייה",
  audio: "קול",
  image: "תמונה",
  web: "רשת",
};

export const SKILLS: SkillMeta[] = [
  {
    id: "llm",
    name: "שיחה-ונימוק",
    nameEn: "LLM Chat",
    category: "lang",
    desc: "מודל-לשון-אמת: נימוק, כתיבה, ניתוח — עם-הנחיית-מערכת-בשליטתך.",
    sdk: "zai.chat.completions.create",
    inputSpec: "הנחיית-מערכת (רשות) + פרומפט",
    sample: { system: "אתה-עוזר-ריבונות: תשובות-קצרות, מדויקות, בעברית.", prompt: "נסח-בשלוש-שורות-מה-הופך-מערכת-פיננסית-לאמינה." },
    icon: "brain",
  },
  {
    id: "vision",
    name: "הבנת-תמונה",
    nameEn: "Vision (VLM)",
    category: "vision",
    desc: "ראייה-ממוחשבת-אמת: תאר, נתח, חלץ-טקסט (OCR) מתמונה-מקושרת-או-מועלית.",
    sdk: "zai.chat.completions.createVision",
    inputSpec: "כתובת-תמונה-או-העלאה + שאלה",
    sample: { prompt: "תאר-במדויק-מה-נראה-בתמונה-ובמה-היא-משמשת.", imageUrl: "https://z-ai-web-dev-sdk.oss-cn-zhangjiakou.aliyuncs.com/demo/sky.jpg" },
    icon: "eye",
  },
  {
    id: "video",
    name: "הבנת-וידאו",
    nameEn: "Video Understanding",
    category: "vision",
    desc: "ניתוח-וידאו-אמת: תמצת, זהה-רצפים, תאר-תנועה — לפי-כתובת-וידאו.",
    sdk: "zai.chat.completions.createVision (video_url)",
    inputSpec: "כתובת-וידאו + שאלה",
    sample: { prompt: "תמצת-את-מה-שקורה-בוידאו-לפי-סדר-זמני.", videoUrl: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4" },
    icon: "film",
  },
  {
    id: "tts",
    name: "דיבור-טקסט",
    nameEn: "Text-to-Speech",
    category: "audio",
    desc: "המרה-אמת-לקול-טבעי: 7-קולות, מהירות-0.5–2.0, פלט-WAV-שמתנגן-כאן.",
    sdk: "zai.audio.tts.create",
    inputSpec: "טקסט-עד-1024-תווים + קול + מהירות",
    sample: { text: "מרכז-היכולות-חי: כל-יכולת-הרצה-אמת-וכל-הרצה-רשומה-בלדג'ר.", voice: "tongtong", speed: 1 },
    icon: "volume",
  },
  {
    id: "asr",
    name: "הקשבה-ותמלול",
    nameEn: "Speech-to-Text",
    category: "audio",
    desc: "תמלול-אמת-מקובץ-קול: WAV/MP3 — מזינים-קובץ-ומקבלים-טקסט.",
    sdk: "zai.audio.asr.create",
    inputSpec: "קובץ-קול (עד-8MB)",
    sample: {},
    icon: "mic",
  },
  {
    id: "image",
    name: "יצירת-תמונה",
    nameEn: "Image Generation",
    category: "image",
    desc: "יצירת-תמונה-אמת-מפרומפט: 7-מידות-מרחב-תמונה, פלט-PNG-מוצג-כאן.",
    sdk: "zai.images.generations.create",
    inputSpec: "פרומפט + מידה",
    sample: { prompt: "דיוקן-ממוחשב-של-עיר-ריבונית-בזמן-שקיעה, אור-זהוב, מרקמי-אבן-וזכוכית, איכות-גבוהה", size: "1024x1024" },
    icon: "image",
  },
  {
    id: "search",
    name: "חיפוש-רשת",
    nameEn: "Web Search",
    category: "web",
    desc: "חיפוש-רשת-אמת: תוצאות-חיות-עם-כותרת, קטע, דומיין ותאריך.",
    sdk: "zai.functions.invoke('web_search')",
    inputSpec: "שאילתה + מספר-תוצאות",
    sample: { query: "AMM x*y=k automated market maker", num: 5 },
    icon: "search",
  },
  {
    id: "reader",
    name: "קריאת-דף",
    nameEn: "Web Reader",
    category: "web",
    desc: "חילוץ-אמת-של-תוכן-דף: כותרת-וטקסט-נקי-מכל-כתובת.",
    sdk: "zai.functions.invoke('page_reader')",
    inputSpec: "כתובת-דף",
    sample: { url: "https://en.wikipedia.org/wiki/Decentralized_exchange" },
    icon: "book",
  },
];

export function skillById(id: string): SkillMeta | undefined {
  return SKILLS.find((s) => s.id === id);
}

// מידות-תמונה-נתמכות (מ-SDK-האמת)
export const IMAGE_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;

// קולות-נתמכים
export const TTS_VOICES = ["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"] as const;

// עזר-צנזורה: תמצית-מקוצרת-לרישום-לדג'ר
export function snippet(s: string, max = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
