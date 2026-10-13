import "server-only";
import type { DrawRules } from "@/lib/boosters/draw";
import type { StockRules } from "@/lib/boosters/stock";
import { getSetting } from "../settings";

export type BoosterRules = { draw: DrawRules; stock: StockRules; intervalMinutes: number };

/** Règles du tirage et du stock, lues dans GameSetting (une seule lecture en cache pour toutes les clés). */
export async function getBoosterRules(): Promise<BoosterRules> {
  const [rates, slotFloors, pityThreshold, goldenEvery, goldenFloor, divineOdds, max, intervalMinutes] =
    await Promise.all([
      getSetting("booster.rates"),
      getSetting("booster.slotFloors"),
      getSetting("booster.pityThreshold"),
      getSetting("booster.goldenEvery"),
      getSetting("booster.goldenFloor"),
      getSetting("booster.divineOdds"),
      getSetting("booster.maxStock"),
      getSetting("booster.intervalMinutes"),
    ]);
  return {
    draw: { rates, slotFloors, pityThreshold, goldenEvery, goldenFloor, divineOdds },
    stock: { max, intervalMs: intervalMinutes * 60_000 },
    intervalMinutes,
  };
}
