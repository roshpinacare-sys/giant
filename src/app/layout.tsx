import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GIANT — מערכת-האמת של הריבונות",
  description:
    "הפלטפורמה המאוחדת של הריבונות: ערוץ-אחד בעלים↔ריבונות, הדקס במרכז, דופק-הצי והמשרד-החי — הכל נמדד-חי מהגיט, אוטונומי 24/7.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
