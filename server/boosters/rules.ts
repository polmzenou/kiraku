import "server-only";
import { cache } from "react";
import type { DrawRules, RuinRules } from "@/lib/boosters/draw";
import type { StockSettings } from "@/lib/boosters/stock";
import { getSetting } from "../settings";
import { getRarities } from "../catalog/rarities";
import { unstable_cache } from "next/cache";
import { prisma } from "../db";
import { CATALOG_TAG, getCatalogVersion } from "../catalog/queries";

const loadWeights = unstable_cache(async (_version: number) => {
  void _version;
  return Object.fromEntries((await prisma.card.findMany({ where: { dropWeight: { not: 1 } }, select: { id: true, dropWeight: true } })).map((c) => [c.id, c.dropWeight]));
}, ["catalog-card-weights"], { tags: [CATALOG_TAG], revalidate: false }); // clé = version du catalogue

export type BoosterRules = { draw: DrawRules; ruin: RuinRules; stock: StockSettings; intervalMinutes: number };

/**
 * Règles du tirage et du stock, lues dans GameSetting (une seule lecture en cache pour toutes les clés).
 * Une fois par rendu : l'en-tête, la page et les sachets scellés les demandent chacun.
 */
export const getBoosterRules = cache(async (): Promise<BoosterRules> => {
  const rarities = await getRarities();
  const cardWeights = await loadWeights(await getCatalogVersion());
  const [
    rates, slotFloors, pityThreshold, goldenEvery, goldenFloor, divineOdds, apocalypseOdds, apocalypseWinRate,
    apocalypseKarma, ruinFloors, ruinCeiling, max, ambassadorMax, intervalMinutes,
  ] = await Promise.all([
    getSetting("booster.rates"),
    getSetting("booster.slotFloors"),
    getSetting("booster.pityThreshold"),
    getSetting("booster.goldenEvery"),
    getSetting("booster.goldenFloor"),
    getSetting("booster.divineOdds"),
    getSetting("booster.apocalypseOdds"),
    getSetting("booster.apocalypseWinRate"),
    getSetting("booster.apocalypseKarma"),
    getSetting("booster.apocalypseRuinFloors"),
    getSetting("booster.apocalypseRuinCeiling"),
    getSetting("booster.maxStock"),
    getSetting("ambassador.maxStock"),
    getSetting("booster.intervalMinutes"),
  ]);
  return {
    draw: {
      rates: Object.fromEntries(rarities.map((r) => [r, rates[r] ?? 0])), rarities, cardWeights, slotFloors, pityThreshold, goldenEvery,
      goldenFloor, divineOdds, apocalypseOdds, apocalypseWinRate, apocalypseKarma,
    },
    ruin: { floors: ruinFloors, ceiling: ruinCeiling },
    stock: { max, ambassadorMax, intervalMs: intervalMinutes * 60_000 },
    intervalMinutes,
  };
});
