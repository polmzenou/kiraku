import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// La CSP (avec nonce) est posée par proxy.ts ; ici, les en-têtes fixes.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    // accéléromètre et gyroscope : inclinaison des fuda (deviceorientation)
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), accelerometer=(self), gyroscope=(self)",
  },
];

const nextConfig: NextConfig = {
  // Le nonce CSP impose un rendu dynamique : pas de Cache Components ni de PPR.
  poweredByHeader: false,
  images: {
    // Illustrations AniList (~230 px de large) : peu de variantes pour rester dans le quota
    // de transformations Vercel, WebP seulement, cache long (elles ne changent quasiment jamais).
    formats: ["image/webp"],
    qualities: [75],
    imageSizes: [96, 160, 240, 320],
    deviceSizes: [480, 640, 828, 1080, 1200],
    minimumCacheTTL: 2_678_400, // 31 jours
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
