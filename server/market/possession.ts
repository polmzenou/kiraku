import type { Prisma } from "@/generated/prisma/client";
import type { Possession } from "@/lib/market/possession";

/**
 * Filtre « acquises / non acquises » sur la carte d'une vente, d'un avis de recherche ou d'une annonce
 * d'échange : au moins un exemplaire du joueur, quel que soit son statut (même règle que le badge
 * « Acquise »). Sans joueur ou sur « toutes », aucune condition.
 */
export function possessionCardWhere(possession: Possession, viewerId: string | null): Prisma.CardWhereInput | null {
  if (possession === "all" || !viewerId) return null;
  return { copies: possession === "owned" ? { some: { ownerId: viewerId } } : { none: { ownerId: viewerId } } };
}
