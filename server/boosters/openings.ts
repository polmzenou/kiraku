import "server-only";
import { cache } from "react";
import type { CardView } from "@/lib/boosters/view";
import { fudaCopyOf, readEditions } from "@/lib/prestige/printing";
import { guestCode } from "@/lib/username";
import { prisma } from "../db";
import { namedPlayerSelect, publicNamesFor } from "../collection/public-names";
import { cardViews } from "./display";
import { getPrintingSeals } from "../prestige/rules";

export type PublicOpening = {
  id: string;
  slug: string;
  golden: boolean;
  divine: boolean;
  /** Issue d'un Apocalyptique ouvert. */
  apocalypse: "SPARED" | "RUINED" | null;
  createdAt: Date;
  /**
   * Le pseudo s'affiche selon la visibilité du profil (server/collection/public-names.ts) ; `locked` : caché
   * aux joueurs mais montré à un admin, avec un cadenas.
   */
  owner: { name: string; guestCode: string | null; locked: boolean };
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
      apocalypse: true,
      editions: true,
      createdAt: true,
      user: { select: namedPlayerSelect },
    },
  });
  if (!opening) return null;

  // Ids de Card copiés au tirage : les cartes restent visibles même recyclées ou vendues depuis, et une gravée
  // garde son édition (copiée à sa place dans le booster)
  const editions = readEditions(opening.editions);
  const [views, seals] = await Promise.all([cardViews(opening.catalogCardIds, locale), getPrintingSeals()]);
  const cards = opening.catalogCardIds.flatMap((cardId, position) => {
    const view = views.get(cardId);
    const edition = editions.get(position);
    return view ? [edition ? { ...view, copy: fudaCopyOf({ heritage: 0, ...edition }, seals) } : view] : [];
  });

  const { name, revealed } = (await publicNamesFor(viewerId, [opening.user]))(opening.user);
  return {
    id: opening.id,
    slug: opening.boosterSlug,
    golden: opening.golden,
    divine: opening.divine,
    apocalypse: opening.apocalypse,
    createdAt: opening.createdAt,
    owner: { name, guestCode: name === opening.user.username ? guestCode(opening.user.username) : null, locked: revealed },
    cards,
  };
});
