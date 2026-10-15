import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* HMR-חי: ללא-זה Next-16 חוסם-את-שקע-ה-HMR (Blocked cross-origin /_next/hmr)
   * → ההידרציה-ממתינה-לנצח והממשק-כולו-מת בלי-שגיאה (נמדד: renderers=0 · אפס-פיבר). */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async redirects() {
    return [
      // ═══ חוק-המשרד-היחיד (הבעלים: "לא צריך 2 משרדים שעושים אותו הדבר") ═══
      // כל נתיב-ישן של המשרד ההיסטורי (office3d סטטי: index/v4/worlds/growth)
      // נוחת ב-HTTP-הפניה אמת אל המשרד החי היחיד בשורש — בלי מסכי-מעבר,
      // בלי 404-שוליים, ובלי שום בייט של חדר-ישן שנשלח לדפדפן.
      { source: "/office3d", destination: "/", permanent: false },
      { source: "/office3d/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
