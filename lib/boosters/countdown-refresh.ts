// Compte à rebours du stock gratuit (ou de l'Encens) arrivé à zéro : quand redemander la page au serveur, qui
// recalcule tout. Plusieurs comptes à rebours sur la même échéance (panneau, vitrine, récap) ne demandent qu'un seul
// rendu serveur ; si le serveur renvoie encore la même échéance (horloge de l'appareil en avance), nouvel essai un
// peu plus tard, trois fois au plus. Fonction pure, appelée par useBoosterCountdown.

/** Attente entre deux essais pour une même échéance. */
export const COUNTDOWN_RETRY_MS = 15_000;
/** Essais au plus pour une même échéance. */
export const COUNTDOWN_MAX_REFRESHES = 3;

/** Rafraîchissements déjà demandés pour une échéance : le dernier (heure de l'appareil, ms) et leur nombre. */
export type RefreshSeen = { at: number; count: number };

/**
 * Faut-il redemander la page maintenant ? Non si les essais sont épuisés ou si le dernier date de moins de 15 s,
 * ni tant que l'onglet est caché (on attend son retour).
 */
export function countdownRefreshDue(seen: RefreshSeen | undefined, now: number, visible: boolean): boolean {
  if (seen && (seen.count >= COUNTDOWN_MAX_REFRESHES || now - seen.at < COUNTDOWN_RETRY_MS)) return false;
  return visible;
}
