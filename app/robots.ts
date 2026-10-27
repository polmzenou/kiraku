import type { MetadataRoute } from "next";
import { productionRobotsRules } from "@/lib/seo/robots";
import { appUrl } from "@/server/env";
import { generateSitemaps } from "./sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemaps = await generateSitemaps();
  return {
    rules: process.env.VERCEL_ENV === "preview"
      ? { userAgent: "*", disallow: "/" }
      : productionRobotsRules(),
    sitemap: sitemaps.map(({ id }) => `${appUrl()}/sitemap/${id}.xml`),
  };
}
