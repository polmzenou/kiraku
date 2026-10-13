import "server-only";
import { cache } from "react";
import { isBoosterSlug, type BoosterSlug } from "@/lib/boosters/catalog";
import type { CardView } from "@/lib/boosters/view";
import { guestCode } from "@/lib/username";
import { prisma } from "../db";
import { cardViews } from "./display";

export type PublicOpening = {
  id: string;
  slug: BoosterSlug;
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
      cardIds: true,
      golden: true,
      divine: true,
      createdAt: true,
      user: { select: { username: true } },
    },
  });
  if (!opening || !isBoosterSlug(opening.boosterSlug)) return null;

  const copies = await prisma.userCard.findMany({
    where: { id: { in: opening.cardIds } },
    select: { id: true, cardId: true },
  });
  const cardOf = new Map(copies.map((c) => [c.id, c.cardId]));
  const views = await cardViews([...cardOf.values()], locale);
  const cards = opening.cardIds.flatMap((id) => {
    const view = views.get(cardOf.get(id) ?? "");
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
