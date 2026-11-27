import "server-only";
import type { CardView } from "@/lib/boosters/view";
import { seriesTitle } from "@/lib/catalog/display";
import type { Rarity } from "@/lib/catalog/rarity";
import { spoilerKeyOf } from "@/lib/spoiler";
import { prisma } from "../db";

/**
 * Infos d'affichage (fuda) d'un lot de cartes, par id de carte. `includeDrafts` : exemplaires possédés d'une carte
 * remise en brouillon depuis l'admin (le joueur doit encore les voir là où il en décide, comme à la renaissance).
 */
export async function cardViews(cardIds: readonly string[], locale: string, { includeDrafts = false } = {}): Promise<Map<string, CardView>> {
  const rows = await prisma.card.findMany({
    where: { id: { in: [...new Set(cardIds)] }, ...(!includeDrafts && { status: { not: "DRAFT" } }) },
    select: {
      id: true,
      anilistId: true, publicId: true, appearance: true,
      name: true,
      nameNative: true,
      imageUrl: true,
      rank: true,
      rarity: true,
      power: true,
      ki: true,
      spoiler: true,
      seriesId: true,
      series: { select: { titleRomaji: true, titleEnglish: true, universeId: true } },
    },
  });
  return new Map(
    rows.map((c) => [
      c.id,
      {
        cardId: c.id,
        anilistId: c.publicId,
        name: c.name,
        nameNative: c.nameNative,
        imageUrl: c.imageUrl,
        appearance: c.appearance,
        rank: c.rank,
        rarity: c.rarity as Rarity,
        power: c.power,
        ki: c.ki,
        spoiler: c.spoiler,
        // Clé d'univers (mode spoiler) : seulement pour une carte spoil, les autres n'en ont pas besoin
        spoilerKey: c.spoiler ? spoilerKeyOf({ id: c.seriesId, universeId: c.series.universeId }) : null,
        series: seriesTitle(c.series, locale),
      },
    ]),
  );
}
