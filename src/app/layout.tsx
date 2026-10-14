import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
