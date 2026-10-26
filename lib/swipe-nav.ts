// Glissement horizontal entre les onglets de la capsule mobile, dans l'ordre de MOBILE_NAV_ITEMS.
// Doigt vers la gauche → onglet suivant, vers la droite → précédent, sans boucle.
// Seules les pages racines exactes réagissent : les sous-pages ont leurs propres gestes.

import { MOBILE_NAV_ITEMS } from "./nav";

export type SwipeDirection = "next" | "prev";

/** Part de la largeur à parcourir pour valider un glissement lent. */
export const SWIPE_DISTANCE_RATIO = 0.3;
/** Vitesse (px/ms) et distance minimales d'un geste vif. */
export const SWIPE_FLICK_SPEED = 0.5;
export const SWIPE_FLICK_MIN = 50;
/** Le geste doit être nettement plus horizontal que vertical. */
export const SWIPE_AXIS_RATIO = 1.5;
/** Déplacement à partir duquel on décide de l'axe du geste. */
export const SWIPE_AXIS_LOCK = 10;
/** Bande au bord de l'écran laissée au geste « retour » du système. */
export const SWIPE_EDGE = 24;

/** Onglet voisin de la page courante (chemin sans préfixe de langue), ou null. */
export function swipeNeighbor(pathname: string, direction: SwipeDirection): string | null {
  const index = MOBILE_NAV_ITEMS.findIndex((item) => item.href === pathname);
  if (index < 0) return null;
  const next = MOBILE_NAV_ITEMS[index + (direction === "next" ? 1 : -1)];
  return next ? next.href : null;
}

/** La page courante est-elle un onglet de la capsule (et donc glissable) ? */
export function isSwipeRoot(pathname: string): boolean {
  return MOBILE_NAV_ITEMS.some((item) => item.href === pathname);
}

/** Axe du geste une fois le seuil franchi, null tant qu'on ne peut pas trancher. */
export function lockAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_AXIS_LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * Le geste relâché change-t-il d'onglet, et dans quel sens ?
 * `velocity` : vitesse du doigt au moment du lâcher (px/ms, signée), mesurée sur les derniers points.
 */
export function classifySwipe({ dx, dy, velocity, width }: { dx: number; dy: number; velocity: number; width: number }): SwipeDirection | null {
  const distance = Math.abs(dx);
  if (distance <= SWIPE_AXIS_RATIO * Math.abs(dy)) return null;
  const fast = Math.abs(velocity) >= SWIPE_FLICK_SPEED;
  // Lancé dans l'autre sens au dernier moment : le joueur se ravise
  if (fast && Math.sign(velocity) !== Math.sign(dx)) return null;
  const long = distance >= SWIPE_DISTANCE_RATIO * width;
  const flick = fast && distance >= SWIPE_FLICK_MIN;
  if (!long && !flick) return null;
  return dx < 0 ? "next" : "prev";
}

/** Durée de sortie (ms) : la page continue à la vitesse du doigt, bornée pour rester lisible. */
export function exitDuration(remaining: number, velocity: number): number {
  const speed = Math.max(Math.abs(velocity), 1.2);
  return Math.round(Math.min(260, Math.max(140, Math.abs(remaining) / speed)));
}

/** Décalage affiché sous le doigt : suit librement s'il y a un voisin, résiste fort au bout de la liste. */
export function dragOffset(dx: number, hasNeighbor: boolean): number {
  if (hasNeighbor) return dx;
  const sign = Math.sign(dx);
  return sign * 40 * (1 - Math.exp(-Math.abs(dx) / 120));
}
