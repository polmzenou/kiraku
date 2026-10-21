import { routing, type Locale } from "@/i18n/routing";
import { localePath } from "./alternates";

const OG_LOCALES: Record<Locale, string> = { fr: "fr_FR", en: "en_US" };
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * Champs Open Graph communs, avec l'image de partage du site (route /og-image). Une page qui définit
 * son propre `openGraph` remplace celui du layout (fusion superficielle de Next) : elle repart donc
 * de cette base.
 */
export function baseOpenGraph(locale: Locale) {
  return {
    siteName: "Kiraku",
    type: "website" as const,
    locale: OG_LOCALES[locale],
    alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
    images: [{ url: localePath("/og-image", locale), ...OG_IMAGE_SIZE, alt: "Kiraku" }],
  };
}
