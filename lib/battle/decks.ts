// Decks de combat : règles pures, partagées par le serveur et les écrans.
import { cleanChatBody } from "../chat/message";
import { cleanPlainText } from "../text/plain";

export const DECK_NAME_MAX = 24;

/**
 * Nom prêt à enregistrer, ou null s'il est vide ou trop long : tout espace blanc (saut de ligne compris)
 * compte pour un seul espace, caractères de contrôle et d'orientation retirés. La seconde réduction
 * couvre deux espaces que seul un caractère invisible séparait.
 */
export function cleanDeckName(raw: string): string | null {
  const flat = cleanPlainText(raw.replace(/\s+/g, " ")).replace(/ {2,}/g, " ");
  return cleanChatBody(flat, DECK_NAME_MAX);
}

/** Mêmes personnages, quel que soit leur ordre : le deck correspondant à l'équipe en cours est surligné. */
export function sameTeam(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return new Set(a).size === other.size && a.every((id) => other.has(id));
}
