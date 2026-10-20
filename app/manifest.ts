import type { MetadataRoute } from "next";
import { createTranslator } from "next-intl";
import { routing } from "@/i18n/routing";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";

// Manifest PWA : installer Kiraku sur l'écran d'accueil (indispensable au Web Push sur iPhone).
// Un seul manifest pour le site : textes dans la langue par défaut.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Static metadata must not load the request-scoped catalogue or require a database at build time.
  const messages = { fr, en }[routing.defaultLocale];
  const t = createTranslator({ locale: routing.defaultLocale, messages, namespace: "metadata" });
  const tNav = createTranslator({ locale: routing.defaultLocale, messages, namespace: "nav" });
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
