import "server-only";
import { seriesTitle } from "@/lib/catalog/display";
import type { Rarity } from "@/lib/catalog/rarity";
import type { ShowcaseCard } from "@/lib/collection/view";
import { layoutCapacity, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { prisma } from "../db";
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
};

/** Vitrines d'un joueur, dans leur ordre (la première est à l'honneur). */
export async function listShowcases(ownerId: string): Promise<ShowcaseSummary[]> {
  const rows = await prisma.showcase.findMany({
    where: { userId: ownerId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      layout: true,
      theme: true,
      sortOrder: true,
      _count: { select: { items: { where: { userCard: { ownerId } } } } },
    },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, layout: storedLayout(r.layout), theme: r.theme, sortOrder: r.sortOrder, count: r._count.items }));
}

/** Cartes d'une vitrine, case par case (null = vide), sur la capacité de sa disposition. */
export async function getShowcaseCards(showcaseId: string, ownerId: string, layout: ShowcaseLayoutId, locale: string): Promise<(ShowcaseCard | null)[]> {
  const capacity = layoutCapacity(layout);
  const items = await prisma.showcaseItem.findMany({
    where: { showcaseId, position: { gte: 1, lte: capacity }, userCard: { ownerId } },
    select: {
      position: true,
      userCard: {
        select: {
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
              series: { select: { titleRomaji: true, titleEnglish: true } },
            },
          },
        },
      },
    },
  });
  const result: (ShowcaseCard | null)[] = Array.from({ length: capacity }, () => null);
  for (const item of items) {
    const c = item.userCard.card;
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
      series: seriesTitle(c.series, locale),
    };
  }
  return result;
}

export type ShowcaseView = ShowcaseSummary & { cards: (ShowcaseCard | null)[] };

/** Une vitrine et ses cartes ; null si elle n'existe pas ou n'est pas à ce joueur. */
export async function getShowcaseView(showcaseId: string, ownerId: string, locale: string): Promise<ShowcaseView | null> {
  const summary = (await listShowcases(ownerId)).find((s) => s.id === showcaseId);
  if (!summary) return null;
  return { ...summary, cards: await getShowcaseCards(summary.id, ownerId, summary.layout, locale) };
}

/** Vitrine à l'honneur (la première) et ses cartes ; null si le joueur n'en a aucune. */
export async function getFeaturedShowcase(ownerId: string, locale: string): Promise<ShowcaseView | null> {
  const [first] = await listShowcases(ownerId);
  if (!first) return null;
  return { ...first, cards: await getShowcaseCards(first.id, ownerId, first.layout, locale) };
}
