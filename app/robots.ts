import type { MetadataRoute } from "next";
import { productionRobotsRules } from "@/lib/seo/robots";
import { appUrl, deployment } from "@/server/env";
import { generateSitemaps } from "./sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemaps = await generateSitemaps();
  return {
    // Préproduction (APP_ENV ou VERCEL_ENV « preview ») : rien d'indexable
    rules: deployment === "preview"
      ? { userAgent: "*", disallow: "/" }
      : productionRobotsRules(),
    sitemap: sitemaps.map(({ id }) => `${appUrl()}/sitemap/${id}.xml`),
  };
}
