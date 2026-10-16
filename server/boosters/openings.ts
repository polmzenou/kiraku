import "server-only";
import { cache } from "react";
import type { CardView } from "@/lib/boosters/view";
import { guestCode } from "@/lib/username";
import { prisma } from "../db";
import { namedPlayerSelect, publicNamesFor } from "../collection/public-names";
import { cardViews } from "./display";

export type PublicOpening = {
  id: string;
  slug: string;
  golden: boolean;
  divine: boolean;
  createdAt: Date;
  /** Le pseudo s'affiche selon la visibilité du profil (server/collection/public-names.ts). */
  owner: { name: string; guestCode: string | null };
  cards: CardView[];
};

/** Tirage public (/tirage/[id]) : lecture seule, aucune donnée privée ; le pseudo suit la visibilité du profil. */
export const getPublicOpening = cache(async (id: string, locale: string, viewerId: string | null): Promise<PublicOpening | null> => {
  const opening = await prisma.boosterOpening.findUnique({
    where: { id },
    select: {
      id: true,
      boosterSlug: true,
      catalogCardIds: true,
      golden: true,
      divine: true,
      createdAt: true,
      user: { select: namedPlayerSelect },
    },
  });
  if (!opening) return null;

  // Ids de Card copiés au tirage : les cartes restent visibles même recyclées ou vendues depuis
  const views = await cardViews(opening.catalogCardIds, locale);
  const cards = opening.catalogCardIds.flatMap((cardId) => {
    const view = views.get(cardId);
    return view ? [view] : [];
  });

  const name = (await publicNamesFor(viewerId, [opening.user]))(opening.user);
  return {
    id: opening.id,
    slug: opening.boosterSlug,
    golden: opening.golden,
    divine: opening.divine,
    createdAt: opening.createdAt,
    owner: { name, guestCode: name === opening.user.username ? guestCode(opening.user.username) : null },
    cards,
  };
});
