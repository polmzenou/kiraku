import { MOTION_COOKIE, type MotionPref } from "./motion-pref";

const ONE_YEAR = 60 * 60 * 24 * 365;
/** Diffusé sur `window` quand le joueur change le réglage (pour les écouteurs hors React). */
export const MOTION_EVENT = "kiraku:motion";

/** Coupe ou rétablit les animations tout de suite et le mémorise pour le rendu serveur suivant. */
export function applyMotionPref(pref: MotionPref) {
  if (pref === "reduced") document.documentElement.dataset.motion = "reduced";
  else delete document.documentElement.dataset.motion;
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Préférence d'affichage (cookie strictement nécessaire)
  document.cookie = `${MOTION_COOKIE}=${pref}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/** Animations à couper : réglage du système ou engrenage de l'en-tête. */
export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}
