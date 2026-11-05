import { followsBase } from "./pool-filter";

// Revérification d'une carte tirée au moment de l'enregistrer : le pool vient d'un cache, l'admin a
// pu dépublier la carte, changer sa rareté ou son poids, ou la décocher depuis son calcul.

/** Carte relue en base, dans la transaction d'ouverture. */
export type LiveCard = {
  status: string;
  rarity: string;
  dropWeight: number;
  origin: string;
  boosterIds: readonly string[];
  variantOfId: string | null;
  boosterExclusive: boolean;
};

/**
 * La carte tirée peut-elle encore être donnée ? Publiée, avec la rareté et le poids du tirage. Une
 * création originale doit être cochée pour ce type, ou suivre sa carte de base présente dans le pool
 * (variante non exclusive), exactement comme dans le calcul du pool.
 */
export function stillDrawable(
  card: LiveCard | undefined,
  drawn: { rarity: string; weight: number },
  ctx: { typeId: string; inPool: (cardId: string) => boolean },
): boolean {
  if (!card || card.status !== "PUBLISHED" || card.rarity !== drawn.rarity) return false;
  if (card.dropWeight <= 0 || card.dropWeight !== drawn.weight) return false;
  return card.origin !== "CUSTOM" || card.boosterIds.includes(ctx.typeId) || followsBase(card, ctx.inPool);
}
