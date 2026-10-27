import "server-only";
import type { FeaturedCandidate, FocusSeriesCandidate } from "./actions/admin-boosters";
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

/** Œuvres d'un Focus série, dans l'ordre choisi (puces du formulaire). */
export async function focusSeriesCandidates(ids: readonly number[]): Promise<FocusSeriesCandidate[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.series.findMany({
    where: { anilistId: { in: [...ids] } },
    select: { anilistId: true, titleRomaji: true, type: true, _count: { select: { cards: { where: { status: "PUBLISHED" } } } } },
  });
  const byId = new Map(rows.map((s) => [s.anilistId, s]));
  return ids.flatMap((id) => {
    const s = byId.get(id);
    return s ? [{ anilistId: id, title: s.titleRomaji, type: s.type, cards: s._count.cards }] : [];
  });
}

/** Focus série (type FOCUS), les plus récents d'abord, avec les titres de leurs œuvres. */
export async function adminFocusBoosters() {
  const rows = await prisma.boosterType.findMany({
    where: { kind: "FOCUS" },
    omit: { poolCardIds: true },
    orderBy: { createdAt: "desc" },
  });
  const types = rows.map(toBoosterTypeView);
  const titles = await focusSeriesCandidates([...new Set(types.flatMap((t) => t.focusSeriesIds))]);
  const byId = new Map(titles.map((s) => [s.anilistId, s.title]));
  return types.map((type) => ({ type, series: type.focusSeriesIds.flatMap((id) => byId.get(id) ?? []) }));
}
