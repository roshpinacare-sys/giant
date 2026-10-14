import type { Metadata } from "next";
import { Geist_Mono, Heebo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Heebo: טיפוגרפיית-התצוגה של giant — עברית+לטינית, משקל-משתנה 100–900
// (godly/awwwards לקח: ארט-דיירקשן מתחיל-בפונט; בלעדיו-העברית-הייתה-בפונט-מערכת)
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "giant · מערכת-האמת — ערוץ הריבון",
  description:
    "giant — המערכת-המאוחדת של הריבונות: ערוץ-האחד בעלים↔ריבונות (חוק-הערוץ-האחד), מנוע-הגיט-החי, ושער-הבעלים. אין טענות-סוכנים לבעלים: הכל דרך הריבונות.",
  keywords: ["ריבונות", "בעלים", "ערוץ-ישיר", "sovereignty", "agent-fleet"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${heebo.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
