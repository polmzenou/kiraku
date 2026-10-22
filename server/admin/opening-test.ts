import "server-only";
import type { OpeningTestPool } from "@/lib/admin/opening-test";
import { BASE_RARITIES, VARIANT_RARITIES } from "@/lib/catalog/rarity";
import type { BoosterState } from "../boosters/state";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";

/** Quelques cartes publiées de chaque rareté pour le banc de test de l'ouverture (lecture seule). */
export async function openingTestPool(locale: string): Promise<OpeningTestPool> {
  const rarities = [...BASE_RARITIES, ...VARIANT_RARITIES];
  const rows = await Promise.all(
    rarities.map((rarity) =>
      prisma.card.findMany({ where: { status: "PUBLISHED", rarity }, select: { id: true }, orderBy: { publicId: "asc" }, take: 6 }),
    ),
  );
  const ids = rows.flat().map((row) => row.id);
  const views = await cardViews(ids, locale);
  const pool: OpeningTestPool = {};
  for (const id of ids) {
    const view = views.get(id);
    if (view) (pool[view.rarity] ??= []).push(view);
  }
  return pool;
}

/** Stock fictif : le sélecteur propose 1, 5 ou 10 boosters, toujours gratuits. */
export function testBoosterState(now = Date.now()): BoosterState {
  return { stock: 99, max: 99, nextAt: null, intervalMs: 3_600_000, serverNow: now, pityLeft: 99, pityThreshold: 100, goldenIn: null, coins: 0 };
}
