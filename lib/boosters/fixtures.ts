import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import type { CardPool, DrawRules } from "./draw";

// Données de test partagées par les tests et la simulation.

export const DEFAULT_RULES: DrawRules = {
  rates: SETTING_DEFAULTS["booster.rates"],
  slotFloors: SETTING_DEFAULTS["booster.slotFloors"],
  pityThreshold: SETTING_DEFAULTS["booster.pityThreshold"],
  goldenEvery: SETTING_DEFAULTS["booster.goldenEvery"],
  goldenFloor: SETTING_DEFAULTS["booster.goldenFloor"],
  divineOdds: SETTING_DEFAULTS["booster.divineOdds"],
};

/** Pool factice : `perRarity` cartes par rareté, ids « MYTHIC-0 », « RARE-3 »… */
export function fakePool(perRarity = 10, empty: Rarity[] = []): CardPool {
  const pool = {} as Record<Rarity, string[]>;
  for (const r of RARITIES) {
    pool[r] = empty.includes(r) ? [] : Array.from({ length: perRarity }, (_, i) => `${r}-${i}`);
  }
  return pool;
}
