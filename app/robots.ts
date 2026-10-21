import type { MetadataRoute } from "next";
import { appUrl } from "@/server/env";
import { generateSitemaps } from "./sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemaps = await generateSitemaps();
  return {
    rules: process.env.VERCEL_ENV === "preview"
      ? { userAgent: "*", disallow: "/" }
      : { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/en/admin/", "/compte", "/en/compte", "/collection", "/en/collection", "/tirage/", "/en/tirage/"] },
    sitemap: sitemaps.map(({ id }) => `${appUrl()}/sitemap/${id}.xml`),
  };
}
