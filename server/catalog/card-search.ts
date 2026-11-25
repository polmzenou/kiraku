import { normalizeSearch } from "@/lib/catalog/search";
import { prisma } from "../db";

// Recherche de cartes publiées pour les formulaires de l'équipe (vedettes d'une bannière, contenu d'un lot). Le droit
// de chercher est vérifié par l'action appelante.

export type CardCandidate = { id: string; name: string; rarity: string; series: string; rank: number | null; imageUrl: string };

/** Cartes publiées qui correspondent à la recherche, les plus populaires d'abord (10 au plus). */
export async function publishedCardCandidates(query: string): Promise<CardCandidate[]> {
  const terms = normalizeSearch(query);
  if (!terms) return [];
  const rows = await prisma.card.findMany({
    where: { status: "PUBLISHED", searchText: { contains: terms } },
    orderBy: { rank: "asc" },
    take: 10,
    select: { id: true, name: true, rarity: true, rank: true, imageUrl: true, series: { select: { titleRomaji: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, rank: c.rank, imageUrl: c.imageUrl, series: c.series.titleRomaji }));
}
