import type { MetadataRoute } from "next";

// גל-61 · מובייל: מניפסט-PWA אמת — סמלי-הלהבה (ענבר-על-פחם), RTL, עצמאי-מרשתת-לאחר-טעינה.
// האמת-המדודה: הממשק-כבר-responsive (דלתות-נבדקו-ב-390px) — המניפסט-מוסיף-התקנה-אמת-למסך-הבית.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GIANT — מערכת-האמת של הריבונות",
    short_name: "GIANT",
    description:
      "הפלטפורמה המאוחדת של הריבונות: הדק-חי, ערוץ-בעלים, דופק-הצי — אפס-מזויף, הכל-נמדד-מהגיט.",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#26221c",
    theme_color: "#26221c",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
