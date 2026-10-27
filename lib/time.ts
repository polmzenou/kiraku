// Découpage d'un compte à rebours pour l'affichage (« 8 min 15 s »).

export type CountdownParts =
  | { unit: "dayHour"; days: number; hours: number }
  | { unit: "hourMin"; hours: number; minutes: number }
  | { unit: "minSec"; minutes: number; seconds: number }
  | { unit: "sec"; seconds: number };

/** Arrondi à la seconde supérieure : on n'affiche jamais « 0 s » tant qu'il reste du temps. */
/** `days` : au-delà de 24 h, « 2 j 4 h » plutôt que « 52 h 0 min » (fin d'un booster limité). */
export function countdownParts(ms: number, opts: { days?: boolean } = {}): CountdownParts {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (opts.days && total >= 86_400) return { unit: "dayHour", days: Math.floor(total / 86_400), hours: Math.floor((total % 86_400) / 3600) };
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return { unit: "hourMin", hours, minutes };
  if (minutes > 0) return { unit: "minSec", minutes, seconds };
  return { unit: "sec", seconds };
}
