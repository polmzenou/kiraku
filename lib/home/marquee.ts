// Ruban « Gros tirages » : la piste contient deux passages identiques, on la fait défiler d'une
// demi-largeur (« période ») puis on revient au début sans que rien ne saute.

/** Ramène une position dans ]-période, 0]. */
export function wrap(x: number, period: number): number {
  if (!(period > 0)) return 0;
  const r = ((x % period) + period) % period;
  return r === 0 ? 0 : r - period;
}

/**
 * Après un lancer, la vitesse revient en douceur vers la vitesse de croisière (décroissance
 * exponentielle de constante `tau` secondes), quelle que soit la cadence d'images.
 */
export function relaxVelocity(velocity: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return target + (velocity - target) * Math.exp(-dt / tau);
}

/** Vitesse d'un lancer (px/s) à partir des derniers points du geste, bornée. */
export function flingVelocity(samples: readonly { x: number; t: number }[], max: number): number {
  if (samples.length < 2) return 0;
  const first = samples[0], last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return 0;
  return Math.max(-max, Math.min(max, (last.x - first.x) / dt));
}
