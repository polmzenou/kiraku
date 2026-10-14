import "server-only";
import type { FeaturedCandidate } from "./actions/admin-boosters";
import { toBoosterTypeView } from "./boosters/type-store";
import { prisma } from "./db";

// Lectures de /admin pour les types de boosters : toujours en base (jamais le cache du jeu),
// pour éditer la dernière version enregistrée.

export async function adminBoosterType(slug: string) {
  const row = await prisma.boosterType.findUnique({ where: { slug }, omit: { poolCardIds: true } });
  return row ? toBoosterTypeView(row) : null;
}

/** Vedettes d'une bannière, dans l'ordre choisi. */
export async function featuredCandidates(ids: readonly string[]): Promise<FeaturedCandidate[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.card.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, rarity: true, rank: true, imageUrl: true, series: { select: { titleRomaji: true } } },
  });
  const byId = new Map(rows.map((c) => [c.id, c]));
  return ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [{ id: c.id, name: c.name, rarity: c.rarity, rank: c.rank, imageUrl: c.imageUrl, series: c.series.titleRomaji }] : [];
  });
}

/** Bannières (type BANNER), les plus récentes d'abord. */
export async function adminBanners() {
  const rows = await prisma.boosterType.findMany({
    where: { kind: "BANNER" },
    omit: { poolCardIds: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toBoosterTypeView);
}
