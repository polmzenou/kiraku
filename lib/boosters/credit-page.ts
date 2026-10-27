import type { Availability } from "./types";

// Page d'ouverture d'un type (/ouvrir/[slug]) : quand elle s'affiche et quand elle vend. Pur, la page
// charge les crédits et le sachet puis s'en remet à cette décision.

/**
 * Un type caché (au repos, inactif, hors dates…) ne s'affiche qu'avec un crédit, un sachet scellé du
 * joueur, ou un crédit déjà eu : l'ouverture du dernier crédit re-rend la page (refresh) pendant le
 * récap, qui ne doit pas tourner en 404. Seul un type ouvert s'y vend : caché ou réservé aux
 * événements, il ne s'ouvre jamais ici hors crédit, ni gratuit ni en Zeni.
 */
export function creditPageMode(input: {
  availability: Availability;
  credits: number;
  hadCredit: boolean;
  ownSachet: boolean;
}): { show: boolean; sellable: boolean } {
  const { availability, credits, hadCredit, ownSachet } = input;
  return {
    show: availability !== "hidden" || credits > 0 || hadCredit || ownSachet,
    sellable: availability === "open",
  };
}
