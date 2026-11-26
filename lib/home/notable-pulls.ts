// Gros tirages enregistrés (NotablePull) : l'ouverture d'un booster non garanti écrit une ligne par carte
// de cette rareté ou mieux. Le carrousel « En direct » de l'accueil n'en montre qu'une partie
// (home.pullFeed.minRarity, choisie parmi ces raretés) : un seuil d'affichage plus bas ne montrerait rien de plus.
export const NOTABLE_PULL_MIN_RARITY = "EPIC";

/** Raretés enregistrées comme gros tirages, dans l'ordre du registre (toutes si le seuil en est absent). */
export function notablePullRarities<R extends string>(order: readonly R[]): R[] {
  return order.slice(Math.max(0, order.indexOf(NOTABLE_PULL_MIN_RARITY as R)));
}

/** Carte à enregistrer comme gros tirage : rareté connue du registre, au seuil ou au-dessus. */
export function isNotablePull(rarity: string, order: readonly string[]): boolean {
  return notablePullRarities(order).includes(rarity);
}
