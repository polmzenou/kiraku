import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { localize, type BoosterShape, type BoosterTheme } from "@/lib/boosters/types";
import { boostersForCards, groupReleases, newCardsBadge, type CardRelease, type ReleasedCard } from "@/lib/catalog/releases";
import { getBoosterOffers, getBoosterTypeEntry, getDisplayPool } from "../boosters/pools";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { CATALOG_TAG, getCatalogVersion } from "./queries";

// Sorties de nouvelles cartes (lib/catalog/releases.ts) : créations de l'admin publiées, jamais les imports
// AniList. La liste suit la version du catalogue (publication, archivage) ; le badge, lui, dépend de l'heure
// et se recalcule à chaque requête à partir de cette liste.

/** Sorties gardées : la dernière et les précédentes, repliées sur la page. */
export const RELEASES_SHOWN = 5;
const RELEASED_MAX = 500;

const loadReleasedCards = unstable_cache(
  async (_version: number): Promise<ReleasedCard[]> => {
    void _version; // Fait partie de la clé du cache.
    const rows = await prisma.card.findMany({
      where: { origin: "CUSTOM", status: "PUBLISHED", publishedAt: { not: null } },
      orderBy: [{ publishedAt: "desc" }, { publicId: "asc" }],
      take: RELEASED_MAX,
      select: { id: true, publicId: true, publishedAt: true },
    });
    return rows.map((r) => ({ id: r.id, publicId: r.publicId, publishedAt: r.publishedAt!.toISOString() }));
  },
  ["catalog-released-cards"],
  { tags: [CATALOG_TAG], revalidate: 86_400 },
);

/** Dernières sorties, de la plus récente à la plus ancienne. Lu une fois par requête. */
export const getCardReleases = cache(async (): Promise<CardRelease[]> => {
  const [cards, timeZone] = await Promise.all([loadReleasedCards(await getCatalogVersion()), getSetting("game.timeZone")]);
  return groupReleases(cards, timeZone, RELEASES_SHOWN);
});

/** Cartes qui portent le badge « Nouveau » (ids publics), ou null si la dernière sortie ne le porte plus. */
export const getNewCardBadge = cache(async () => {
  const [releases, hours] = await Promise.all([getCardReleases(), getSetting("catalog.newCardHours")]);
  return newCardsBadge(releases[0], new Date(), hours);
});

/** Ids publics des cartes « Nouveau » (vide quand le badge est éteint). */
export async function getNewCardIds(): Promise<ReadonlySet<number>> {
  return new Set((await getNewCardBadge())?.publicIds ?? []);
}

export type ReleaseBooster = { slug: string; name: string; emblem: string; shape: BoosterShape; theme: BoosterTheme; href: string; count: number };

/**
 * Où tirer ces cartes : boosters ouvrables en ce moment (vitrine de l'accueil, ou boutique pour un Prestige)
 * dont le pool contient au moins l'une d'elles. Les pools sont déjà en mémoire (getDisplayPool).
 */
export async function getReleaseBoosters(cardIds: readonly string[], locale: string) {
  if (cardIds.length === 0) return { byCard: {} as Record<string, string[]>, boosters: [] as ReleaseBooster[] };
  const offers = (await getBoosterOffers()).filter((o) => o.availability !== "hidden" || o.shopAvailability !== "hidden");
  const pools = await Promise.all(
    offers.map(async (offer) => {
      const entry = await getBoosterTypeEntry(offer.type.slug);
      const ids: string[] = entry ? Object.values(await getDisplayPool(entry)).flat() : [];
      return { slug: offer.type.slug, ids: new Set(ids) };
    }),
  );
  const { byCard, boosters } = boostersForCards(pools, cardIds);
  const bySlug = new Map(offers.map((o) => [o.type.slug, o]));
  return {
    byCard,
    boosters: boosters.map(({ slug, count }): ReleaseBooster => {
      const { type, availability } = bySlug.get(slug)!;
      return {
        slug,
        name: localize(type.name, locale),
        emblem: type.emblem,
        shape: type.shape,
        theme: type.theme,
        // Un Prestige (Impérial) ne s'ouvre que depuis la boutique
        href: availability !== "hidden" ? `/?b=${slug}` : "/boutique",
        count,
      };
    }),
  };
}
