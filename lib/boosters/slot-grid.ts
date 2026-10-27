// Grille des emplacements sous la pile de révélation, sur desktop : toutes les cartes tiennent à
// l'écran sans défilement, pour que « Tout révéler » reste visible quel que soit le nombre de boosters.

export type SlotGrid = { columns: number; slotWidth: number };

/**
 * Le plus grand emplacement (≤ `maxWidth`) tel que les `count` cartes, de rapport hauteur/largeur
 * `ratio`, tiennent dans `width` × `height` avec `gap` entre elles. À taille égale, on préfère plus
 * de colonnes : la grille s'étale en largeur plutôt qu'en hauteur.
 */
export function fitSlotGrid({
  count,
  width,
  height,
  gap,
  maxWidth,
  ratio,
}: {
  count: number;
  width: number;
  height: number;
  gap: number;
  maxWidth: number;
  ratio: number;
}): SlotGrid {
  let best: SlotGrid = { columns: Math.max(1, count), slotWidth: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const byWidth = (width - (columns - 1) * gap) / columns;
    const byHeight = (height - (rows - 1) * gap) / rows / ratio;
    const slotWidth = Math.floor(Math.min(maxWidth, byWidth, byHeight));
    if (slotWidth > 0 && slotWidth >= best.slotWidth) best = { columns, slotWidth };
  }
  return best;
}
