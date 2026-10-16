import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

// Manifest PWA : installer Kiraku sur l'écran d'accueil (indispensable au Web Push sur iPhone).
// Un seul manifest pour le site : textes dans la langue par défaut.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [t, tNav] = await Promise.all([
    getTranslations({ locale: routing.defaultLocale, namespace: "metadata" }),
    getTranslations({ locale: routing.defaultLocale, namespace: "nav" }),
  ]);
  const shortcutIcon = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    id: "/",
    name: t("title"),
    short_name: t("title"),
    description: t("description"),
    lang: routing.defaultLocale,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#15120F",
    theme_color: "#15120F",
    categories: ["games", "entertainment"],
    prefer_related_applications: false,
    // Raccourcis de l'icône (appui long sur Android, clic droit sur desktop)
    shortcuts: [
      { name: tNav("boosters"), url: "/", icons: shortcutIcon },
      { name: tNav("collection"), url: "/collection", icons: shortcutIcon },
      { name: tNav("combat"), url: "/combat", icons: shortcutIcon },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
