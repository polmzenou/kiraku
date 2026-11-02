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

/** Grand moment de révélation (nom de la rareté en grand, fond teinté) : Légendaire et au-dessus. */
export function isBigMoment(rarity: Rarity, definitions: readonly Ordered[]) {
  return atLeastRarity(rarity, "LEGENDARY", definitions);
}

/**
 * Haut de gamme : Mythique et tout ce qui reçoit sa cérémonie (AR, Gold, raretés au-dessus).
 * Dos de carte premium, et aurore derrière la pile tant qu'une telle carte y reste.
 */
export function isTopTier(rarity: Rarity, definitions: readonly Ordered[]) {
  return fxTier(rarity, definitions) === "MYTHIC";
}

type Stats = { power: number; ki: number };

/**
 * Stats proposées dans le CRUD : la médiane de la rareté ; sans carte publiée, celle d'une rareté de même rang
 * (BR → Mythique, VR → AR, MR → Gold). Sans égale (XR), le rang publié juste en dessous, plus l'écart qui le
 * sépare du rang précédent : le palier suivant de la même échelle.
 */
export function suggestedStats(rarity: Rarity, definitions: readonly Ordered[], medians: Readonly<Record<string, Stats>>): (Stats & { from: Rarity; above: boolean }) | null {
  if (medians[rarity]) return { ...medians[rarity], from: rarity, above: false };
  const order = definitions.find((d) => d.key === rarity)?.sortOrder;
  if (order === undefined) return null;
  const published = definitions.filter((d) => medians[d.key]).sort((a, b) => b.sortOrder - a.sortOrder);
  const peer = published.find((d) => d.sortOrder === order);
  if (peer) return { ...medians[peer.key], from: peer.key, above: false };
  const top = published.find((d) => d.sortOrder < order);
  if (!top) return null;
  const next = published.find((d) => d.sortOrder < top.sortOrder);
  const raise = (stat: keyof Stats) => Math.min(999, medians[top.key][stat] + Math.max(1, next ? medians[top.key][stat] - medians[next.key][stat] : 1));
  return { power: raise("power"), ki: raise("ki"), from: top.key, above: true };
}
