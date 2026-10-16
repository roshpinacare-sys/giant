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
  /* אבטחת-כותרות (תיקון-ביקורת-אדומה 61-b): כותרות-מדידה על כל-הנתיבים.
   * סיכון-מקובל-מתועד: X-Frame-Options אינו-נשלח בכוונה וה-CSP במצב
   * Report-Only בלבד — פאנל-התצוגה-החוצה של הבעלים ממסגר-את-האפליקציה
   * ב-iframe, ואכיפת frame-ancestors 'none' תשבור אותו. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss: http: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; report-uri /api/csp-report",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
