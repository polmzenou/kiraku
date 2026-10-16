import type { MetadataRoute } from "next";
import { appUrl } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: process.env.VERCEL_ENV === "preview"
      ? { userAgent: "*", disallow: "/" }
      : { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/en/admin/", "/compte", "/en/compte", "/collection", "/en/collection", "/tirage/", "/en/tirage/"] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
