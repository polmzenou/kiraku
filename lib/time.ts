// Découpage d'un compte à rebours pour l'affichage (« 8 min 15 s »).

export type CountdownParts =
  | { unit: "hourMin"; hours: number; minutes: number }
  | { unit: "minSec"; minutes: number; seconds: number }
  | { unit: "sec"; seconds: number };

/** Arrondi à la seconde supérieure : on n'affiche jamais « 0 s » tant qu'il reste du temps. */
export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return { unit: "hourMin", hours, minutes };
  if (minutes > 0) return { unit: "minSec", minutes, seconds };
  return { unit: "sec", seconds };
}
