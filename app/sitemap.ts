import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo/alternates";
import { wikiSitemapCount, wikiSitemapSlice } from "@/lib/seo/sitemap";
import { getSitemapCards } from "@/server/catalog/queries";
import { appUrl } from "@/server/env";

// Pages publiques stables et fiches du wiki ; aucun identifiant de joueur, tirage ou compte.
// /sitemap/0.xml : pages fixes ; /sitemap/1.xml et suivants : fiches du wiki par blocs.
const STATIC_PATHS = ["", "/wiki", "/classement", "/mentions-legales", "/confidentialite", "/cookies", "/cgu"];

export async function generateSitemaps() {
  const cards = await getSitemapCards();
  return Array.from({ length: 1 + wikiSitemapCount(cards.length) }, (_, id) => ({ id }));
}

function entries(path: string, lastModified?: string): MetadataRoute.Sitemap {
  const base = appUrl();
  return routing.locales.map((locale) => {
    const { canonical, languages } = localeAlternates(path, locale);
    return {
      url: `${base}${canonical}`,
      lastModified,
      alternates: { languages: Object.fromEntries(Object.entries(languages).map(([l, href]) => [l, `${base}${href}`])) },
    };
  });
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  // Lu à la demande : le catalogue change sans redéploiement (données en cache côté serveur).
  await connection();
  const index = Number(await id);
  if (index === 0) return STATIC_PATHS.flatMap((path) => entries(path));
  const cards = wikiSitemapSlice(await getSitemapCards(), index - 1);
  return cards.flatMap((card) => entries(`/wiki/${card.id}`, card.updatedAt));
}
