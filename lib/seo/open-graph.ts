import { routing, type Locale } from "@/i18n/routing";
import { localePath } from "./alternates";

const OG_LOCALES: Record<Locale, string> = { fr: "fr_FR", en: "en_US" };
/**
 * Nom du site affiché par Google au-dessus des résultats (à la place du domaine) : repris par
 * og:site_name et par le `WebSite` JSON-LD de l'accueil. Nom propre, identique dans les deux langues.
 */
export const SITE_NAME = "Kiraku-kun";
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
/** À monter quand le dessin des images de partage change : Discord et les autres gardent l'ancienne en cache par URL. */
const OG_IMAGE_VERSION = 2;

/** URL (relative à `metadataBase`) d'une image de partage : celle du site par défaut, ou une route sous /og-image. */
export function ogImageUrl(locale: Locale, path = "/og-image"): string {
  return `${localePath(path, locale)}?v=${OG_IMAGE_VERSION}`;
}

/**
 * Champs Open Graph communs, avec l'image de partage du site (route /og-image). Une page qui définit
 * son propre `openGraph` remplace celui du layout (fusion superficielle de Next) : elle repart donc
 * de cette base.
 */
export function baseOpenGraph(locale: Locale) {
  return {
    siteName: SITE_NAME,
    type: "website" as const,
    locale: OG_LOCALES[locale],
    alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
    images: [{ url: ogImageUrl(locale), ...OG_IMAGE_SIZE, alt: "Kiraku" }],
  };
}
