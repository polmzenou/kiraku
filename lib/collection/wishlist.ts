export const MAX_WISHLIST_CARDS = 20;

/**
 * Pastille « Était dans ta liste de souhaits » : seul le premier exemplaire d'une carte souhaitée
 * reçu dans un même versement la porte (comme « Nouveau »).
 */
export function markWished<T extends { cardId: string }>(cards: readonly T[], wished: ReadonlySet<string>): (T & { wished: boolean })[] {
  const pending = new Set(wished);
  return cards.map((card) => {
    const hit = pending.delete(card.cardId);
    return { ...card, wished: hit };
  });
}
