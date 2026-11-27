import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "as-needed", // /boosters en français, /en/boosters en anglais
  // Pas d'en-tête Link hreflang posé par proxy.ts : les pages publiques déclarent déjà leurs variantes dans le HTML
  // (lib/seo/alternates.ts) et le sitemap. L'en-tête recopiait trois fois l'adresse demandée, paramètres compris
  // (?ref=, fbclid…), sur chaque réponse, appels RSC compris : il contredisait la canonique et gonflait les
  // en-têtes (cause des 502 de Nginx du 26/11, deploy/nginx.conf.example).
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];
