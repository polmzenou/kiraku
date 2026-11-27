/**
 * Plusieurs lots montrés comme un seul cadeau (le lot d'une étape et la part « confiance » qui tombe avec elle) : les
 * Zeni s'additionnent, et les lignes identiques (même sachet, même carte, même rareté) ne font plus qu'une, avec la
 * somme des quantités. `keyOf` dit quand deux lignes sont identiques. Rien n'est modifié dans les lots reçus.
 */
export function mergeLots<L extends { quantity: number }, T extends { id: string; zeni: number; lines: readonly L[] }>(
  lots: readonly (T | null)[],
  keyOf: (line: L) => string,
): T | null {
  const list = lots.filter((l): l is T => l !== null);
  if (list.length <= 1) return list[0] ?? null;
  const lines: L[] = [];
  const index = new Map<string, number>();
  for (const line of list.flatMap((l) => l.lines)) {
    const key = keyOf(line);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, lines.length);
      lines.push({ ...line });
    } else lines[at] = { ...lines[at], quantity: lines[at].quantity + line.quantity };
  }
  return { ...list[0], id: list.map((l) => l.id).join("+"), zeni: list.reduce((sum, l) => sum + l.zeni, 0), lines };
}

/**
 * Un lot versé `factor` fois (×2 de l'Ennichi sur les étapes 1 et 2), montré comme un seul cadeau : Zeni et quantités
 * multipliés. Un facteur de 1 (ou mal formé) rend le lot reçu tel quel.
 */
export function scaleLot<L extends { quantity: number }, T extends { zeni: number; lines: readonly L[] }>(lot: T | null, factor: number): T | null {
  const m = Number.isSafeInteger(factor) && factor > 1 ? factor : 1;
  if (!lot || m === 1) return lot;
  return { ...lot, zeni: lot.zeni * m, lines: lot.lines.map((l) => ({ ...l, quantity: l.quantity * m })) };
}
