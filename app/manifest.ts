import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

// Manifest PWA : installer Kiraku sur l'écran d'accueil (indispensable au Web Push sur iPhone).
// Un seul manifest pour le site : textes dans la langue par défaut.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "metadata" });
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
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
