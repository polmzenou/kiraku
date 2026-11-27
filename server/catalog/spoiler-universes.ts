import "server-only";
import { unstable_cache } from "next/cache";
import { groupSpoilerUniverses, type SpoilerUniverse } from "@/lib/spoiler";
import { prisma } from "../db";
import { CATALOG_TAG, getCatalogVersion } from "./queries";

// Univers proposés dans le réglage spoiler (/compte/spoilers) : ceux qui contiennent au moins une carte spoil, y compris
// archivée (elle reste dans les collections). Partagé par tous les joueurs ; vidé avec le catalogue (cartes, univers).
const loadSpoilerUniverses = unstable_cache(
  async (locale: string, _version: number): Promise<SpoilerUniverse[]> => {
    void _version; // Part of the cache key.
    const cards = await prisma.card.findMany({
      where: { spoiler: true, status: { not: "DRAFT" } },
      select: { series: { select: { id: true, titleRomaji: true, titleEnglish: true, universeId: true, universe: { select: { name: true } } } } },
    });
    return groupSpoilerUniverses(cards, locale);
  },
  ["spoiler-universes"],
  { tags: [CATALOG_TAG], revalidate: 86_400 },
);

export async function getSpoilerUniverses(locale: string): Promise<SpoilerUniverse[]> {
  return loadSpoilerUniverses(locale, await getCatalogVersion());
}
