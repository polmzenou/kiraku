import type { MetadataRoute } from "next";
import { appUrl } from "@/server/env";

// Pages publiques stables uniquement ; aucun identifiant de joueur, tirage ou compte.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const paths = ["", "/wiki", "/classement", "/mentions-legales", "/confidentialite", "/cookies", "/cgu"];
  return paths.flatMap((path) => ["fr", "en"].map((locale) => ({
    url: `${base}${locale === "en" ? "/en" : ""}${path}`,
    alternates: { languages: { fr: `${base}${path}`, en: `${base}/en${path}` } },
  })));
}
