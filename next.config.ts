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
  // Les métadonnées restent dans <head> pour les lecteurs HTML et les outils SEO.
  htmlLimitedBots: /.*/,
  // Images de partage : polices TrueType et sceau lus sur disque (noms dynamiques, invisibles au traçage)
  outputFileTracingIncludes: {
    "/*/og-image": ["./server/og/fonts/*.ttf", "./public/icons/icon-512.png"],
    "/*/og-image/**": ["./server/og/fonts/*.ttf", "./public/icons/icon-512.png"],
  },
  images: {
    // Garder les originaux pour les cartes, avatars et logos : l'optimiseur Vercel
    // renvoie 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED quand son quota est atteint.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      ...(process.env.BLOB_PUBLIC_HOST
        ? [
            { protocol: "https" as const, hostname: process.env.BLOB_PUBLIC_HOST, pathname: "/cards/**" },
            // Bannières Nouveautés téléversées depuis /admin/nouveautes
            { protocol: "https" as const, hostname: process.env.BLOB_PUBLIC_HOST, pathname: "/news/**" },
          ]
        : []),
    ],
  },
  async redirects() {
    // L’accueil est la vue Boosters : l’ancienne adresse y renvoie
    return [
      { source: "/boosters", destination: "/", permanent: true },
      { source: "/en/boosters", destination: "/en", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Images fixes de public/ servies par Node (pas de CDN devant le VPS) : une semaine de cache évite
        // un aller-retour (304) par fichier à chaque chargement. Renommer un fichier quand il change.
        source: "/:dir(brand|card-backs|icons)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        // Le navigateur doit toujours revalider le service worker : une correction arrive aussitôt
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
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
