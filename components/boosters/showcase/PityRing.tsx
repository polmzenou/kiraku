import { pityRingFraction } from "@/lib/boosters/showcase";

/** Longueur du cercle de rayon 19 (2πr) : la part parcourue se dessine en pointillé de cette longueur. */
const CIRCUMFERENCE = 119.4;

/**
 * Anneau de pitié du hero : la part déjà parcourue vers la Mythique sûre (rien tant qu'aucun booster n'est
 * compté). Booster hors pitié (`left` null) : aucun anneau.
 */
export function PityRing({ left, threshold }: { left: number | null; threshold: number }) {
  const fraction = pityRingFraction(left, threshold);
  if (fraction === null) return null;
  const done = CIRCUMFERENCE * fraction;
  return (
    <svg width="40" height="40" viewBox="0 0 46 46" aria-hidden="true" className="shrink-0">
      <circle cx="23" cy="23" r="19" fill="none" stroke="var(--track)" strokeWidth="4" />
      {done > 0.5 && (
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${done.toFixed(1)} ${CIRCUMFERENCE}`}
          transform="rotate(-90 23 23)"
        />
      )}
    </svg>
  );
}
