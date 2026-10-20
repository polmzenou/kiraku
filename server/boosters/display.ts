import "server-only";
import type { CardView } from "@/lib/boosters/view";
import { seriesTitle } from "@/lib/catalog/display";
import type { Rarity } from "@/lib/catalog/rarity";
import { prisma } from "../db";

/** Infos d'affichage (fuda) d'un lot de cartes, par id de carte. */
export async function cardViews(cardIds: readonly string[], locale: string): Promise<Map<string, CardView>> {
  const rows = await prisma.card.findMany({
    where: { id: { in: [...new Set(cardIds)] }, status: { not: "DRAFT" } },
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
      series: { select: { titleRomaji: true, titleEnglish: true } },
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
        series: seriesTitle(c.series, locale),
      },
    ]),
  );
}
