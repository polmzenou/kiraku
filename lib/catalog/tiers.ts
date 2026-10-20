import { BASE_RARITIES, type BaseRarity, type Rarity } from "./rarity";

type Ordered = { key: string; sortOrder: number };

/**
 * Palier de mise en scène d'une rareté : la rareté de base la plus proche, au même rang ou en dessous.
 * AR et Gold (au-dessus de Mythique) reçoivent ainsi toute la cérémonie Mythique.
 */
export function fxTier(rarity: Rarity, definitions: readonly Ordered[]): BaseRarity {
  if ((BASE_RARITIES as readonly string[]).includes(rarity)) return rarity as BaseRarity;
  const order = definitions.find((d) => d.key === rarity)?.sortOrder;
  if (order === undefined) return "COMMON";
  let tier: BaseRarity = "COMMON", best = -Infinity;
  for (const d of definitions) {
    if ((BASE_RARITIES as readonly string[]).includes(d.key) && d.sortOrder <= order && d.sortOrder > best) {
      tier = d.key as BaseRarity; best = d.sortOrder;
    }
  }
  return tier;
}

/** Au moins aussi rare que `floor` dans l'ordre du registre. */
export function atLeastRarity(rarity: Rarity, floor: Rarity, definitions: readonly Ordered[]) {
  const rank = (key: string) => definitions.find((d) => d.key === key)?.sortOrder ?? -Infinity;
  return rank(rarity) >= rank(floor);
}
