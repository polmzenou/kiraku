import "server-only";
import { cache } from "react";
import type { CardView } from "@/lib/boosters/view";
import { guestCode } from "@/lib/username";
import { prisma } from "../db";
import { cardViews } from "./display";

export type PublicOpening = {
  id: string;
  slug: string;
  golden: boolean;
  divine: boolean;
  createdAt: Date;
  owner: { username: string; guestCode: string | null };
  cards: CardView[];
};

/** Tirage public (/tirage/[id]) : lecture seule, aucune donnée privée du joueur hormis son pseudo. */
export const getPublicOpening = cache(async (id: string, locale: string): Promise<PublicOpening | null> => {
  const opening = await prisma.boosterOpening.findUnique({
    where: { id },
    select: {
      id: true,
      boosterSlug: true,
      catalogCardIds: true,
      golden: true,
      divine: true,
      createdAt: true,
      user: { select: { username: true } },
    },
  });
  if (!opening) return null;

  // Ids de Card copiés au tirage : les cartes restent visibles même recyclées ou vendues depuis
  const views = await cardViews(opening.catalogCardIds, locale);
  const cards = opening.catalogCardIds.flatMap((cardId) => {
    const view = views.get(cardId);
    return view ? [view] : [];
  });

  return {
    id: opening.id,
    slug: opening.boosterSlug,
    golden: opening.golden,
    divine: opening.divine,
    createdAt: opening.createdAt,
    owner: { username: opening.user.username, guestCode: guestCode(opening.user.username) },
    cards,
  };
});
