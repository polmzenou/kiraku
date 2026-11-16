// Paliers de rareté des expéditions : les raretés de même rang (sortOrder) forment un palier.
// Mythique et BR, AR et VR, Gold et MR comptent pareil ; XR est seul au sommet.

type Ordered = { key: string; sortOrder: number };

/** Rangs distincts du registre, du plus courant au plus rare. */
export function tierLevels(definitions: readonly Ordered[]): number[] {
  return [...new Set(definitions.map((d) => d.sortOrder))].sort((a, b) => a - b);
}

/** Position du palier d'une rareté (0 = le plus courant), ou null si la rareté est inconnue. */
export function tierOf(rarity: string, definitions: readonly Ordered[]): number | null {
  const order = definitions.find((d) => d.key === rarity)?.sortOrder;
  if (order === undefined) return null;
  return tierLevels(definitions).indexOf(order);
}

/** Écart de palier d'une carte avec la rareté exigée (0 = même palier). Rareté inconnue : très en dessous. */
export function tierDelta(rarity: string, floor: string, definitions: readonly Ordered[]): number {
  const card = tierOf(rarity, definitions);
  const min = tierOf(floor, definitions);
  if (card === null || min === null) return Number.NEGATIVE_INFINITY;
  return card - min;
}

/** Plus grand écart possible au-dessus de la rareté exigée (0 pour XR, la plus rare). */
export function headroom(floor: string, definitions: readonly Ordered[]): number {
  const min = tierOf(floor, definitions);
  if (min === null) return 0;
  return tierLevels(definitions).length - 1 - min;
}
