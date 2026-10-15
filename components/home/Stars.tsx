import { starFill } from "@/lib/social/reviews";

export const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

/** Cinq étoiles remplies selon la note (fractions comprises), avec un libellé pour les lecteurs d'écran. */
export function Stars({ rating, label, size = 16 }: { rating: number; label: string; size?: number }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center gap-px text-kin">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = starFill(rating, i);
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="absolute inset-0 text-border">
              <path d={STAR_PATH} fill="currentColor" />
            </svg>
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="max-w-none">
                  <path d={STAR_PATH} fill="currentColor" />
                </svg>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
