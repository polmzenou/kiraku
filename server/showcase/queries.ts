import "server-only";
import { cache } from "react";
import { seriesTitle } from "@/lib/catalog/display";
import type { Rarity } from "@/lib/catalog/rarity";
import type { ShowcaseCard } from "@/lib/collection/view";
import { fudaCopyOf } from "@/lib/prestige/printing";
import { layoutCapacity, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { spoilerKeyOf } from "@/lib/spoiler";
import { prisma } from "../db";
import { getPrintingSeals } from "../prestige/rules";
import { storedLayout } from "./core";

// Lectures des vitrines. Chaque carte affichée doit appartenir au propriétaire de la vitrine : un
// exemplaire qui a changé de main pendant une bascule de version n'y apparaît jamais.

export type ShowcaseSummary = {
  id: string;
  name: string | null;
  layout: ShowcaseLayoutId;
  /** Thème enregistré (à passer par effectiveTheme avant l'affichage). */
  theme: string;
  sortOrder: number;
  /** Cartes en vitrine. */
  count: number;
  /** Fresque mise en avant (mini-navigation « Cartes · Fresque ») et vue ouverte d'abord. */
  frescoId: string | null;
  frescoFirst: boolean;
};

/**
 * Vitrines d'un joueur, dans leur ordre (la première est à l'honneur). Une fois par requête : la page d'une vitrine
 * les lit pour ses métadonnées puis pour son rendu.
 */
export const listShowcases = cache(async (ownerId: string): Promise<ShowcaseSummary[]> => {
  const rows = await prisma.showcase.findMany({
    where: { userId: ownerId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      layout: true,
      theme: true,
      sortOrder: true,
      frescoId: true,
      frescoFirst: true,
      // Cases de ces vitrines seulement (clé showcaseId, position) : un `_count` agrégeait les cartes en vitrine de
      // tous les joueurs à chaque vue d'un profil
      items: { where: { userCard: { ownerId } }, select: { position: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    layout: storedLayout(r.layout),
    theme: r.theme,
    sortOrder: r.sortOrder,
    count: r.items.length,
    frescoId: r.frescoId,
    frescoFirst: r.frescoFirst,
  }));
});

/** Cartes d'une vitrine, case par case (null = vide), sur la capacité de sa disposition. */
export async function getShowcaseCards(showcaseId: string, ownerId: string, layout: ShowcaseLayoutId, locale: string): Promise<(ShowcaseCard | null)[]> {
  const capacity = layoutCapacity(layout);
  const items = await prisma.showcaseItem.findMany({
    where: { showcaseId, position: { gte: 1, lte: capacity }, userCard: { ownerId } },
    select: {
      position: true,
      userCard: {
        select: {
          // Exemplaire exposé : une héritière ou une gravée garde ses marques en vitrine
          heritage: true,
          printing: true,
          serial: true,
          edition: { select: { size: true } },
          card: {
            select: {
              id: true,
              publicId: true,
              appearance: true,
              name: true,
              nameNative: true,
              formName: true,
              imageUrl: true,
              rank: true,
              rarity: true,
              power: true,
              ki: true,
              spoiler: true,
              seriesId: true,
              series: { select: { titleRomaji: true, titleEnglish: true, universeId: true } },
            },
          },
        },
      },
    },
  });
  const result: (ShowcaseCard | null)[] = Array.from({ length: capacity }, () => null);
  const seals = await getPrintingSeals();
  for (const item of items) {
    const c = item.userCard.card;
    const { heritage, printing, serial, edition } = item.userCard;
    result[item.position - 1] = {
      position: item.position,
      cardId: c.id,
      anilistId: c.publicId,
      name: c.name,
      nameNative: c.nameNative,
      formName: c.formName,
      imageUrl: c.imageUrl,
      appearance: c.appearance,
      rank: c.rank,
      rarity: c.rarity as Rarity,
      power: c.power,
      ki: c.ki,
      spoiler: c.spoiler,
      spoilerKey: c.spoiler ? spoilerKeyOf({ id: c.seriesId, universeId: c.series.universeId }) : null,
      series: seriesTitle(c.series, locale),
      copy: fudaCopyOf({ heritage, printing, serial, size: edition?.size ?? null }, seals),
    };
  }
  return result;
}
