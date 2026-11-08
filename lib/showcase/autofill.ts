// « Remplir avec mes meilleures cartes » : les cartes les plus rares d'abord, puis les plus
// populaires (rang le plus petit). Les vedettes sont les premières positions de chaque disposition :
// elles reçoivent donc les meilleures cartes.

export type AutofillCandidate = {
  cardId: string;
  /** Ordre de la rareté dans le registre (plus grand = plus rare). */
  raritySort: number;
  /** Rang de popularité (1 = le plus populaire) ; null en dernier. */
  rank: number | null;
};

export function autofillSlots(candidates: readonly AutofillCandidate[], capacity: number): (string | null)[] {
  const best = [...new Map(candidates.map((c) => [c.cardId, c])).values()]
    .sort((a, b) => b.raritySort - a.raritySort || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.cardId.localeCompare(b.cardId))
    .slice(0, capacity)
    .map((c) => c.cardId);
  return [...best, ...Array<null>(capacity - best.length).fill(null)];
}
