import { useMemo, type CSSProperties } from "react";
import type { BoosterShape } from "@/lib/boosters/types";
import { prismSparks } from "@/lib/opening/prism";
import "./PrismLight.css";

// Prisme de la XR : le sachet qui cache une XR laisse jaillir une lumière arc-en-ciel de sa déchirure.
// Une seule source, au niveau de l'ouverture : derrière le sachet, un halo irisé et des rayons fondus qui
// s'éteignent bien avant le bord de leur calque ; devant, le cœur blanc de la fente et une gerbe
// d'étincelles. Calques décoratifs, animés en CSS (transform et opacity) ; jamais montés en mouvement réduit.

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/** Hauteur de l'ouverture dans le booster (comme la lumière de la fente, BoosterScene). */
const SEAM_TOP: Record<BoosterShape, string> = { SACHET: "13%", POCHIBUKURO: "20%", JUBAKO: "8%" };

/** Cœur lumineux de la fente, éclair au « pop » et étincelles irisées. Posé sur la fente (calque de hauteur nulle). */
export function PrismBurst({ lite }: { lite: boolean }) {
  const sparks = useMemo(() => prismSparks(lite), [lite]);
  return (
    <span aria-hidden="true" className="prism-burst" data-lite={lite || undefined}>
      <span className="prism-core" />
      <span className="prism-flash" />
      {sparks.map((s, i) => (
        <span
          key={i}
          className="prism-spark"
          style={v({ left: `${s.left}%`, "--c": s.color, "--dx": `${s.dx}px`, "--dy": `${s.dy}px`, "--s": `${s.size}px`, "--d": `${s.delay}ms`, "--t": `${s.duration}ms` })}
        />
      ))}
    </span>
  );
}

/**
 * Derrière le sachet, centrés sur l'ouverture : halo irisé qui respire et rayons arc-en-ciel fondus qui
 * tournent lentement. Le sachet masque leur bas : la lumière semble sortir de la déchirure. Ils s'éteignent
 * quand le sachet tombe.
 */
export function PrismHalo({ lite, fading, shape }: { lite: boolean; fading: boolean; shape: BoosterShape }) {
  return (
    <span
      aria-hidden="true"
      className="prism-back"
      data-lite={lite || undefined}
      data-fading={fading || undefined}
      style={v({ "--seam": SEAM_TOP[shape] })}
    >
      <span className="prism-aura" />
      <span className="prism-rays" />
    </span>
  );
}

/** Voile irisé sur tout l'écran, le temps du tremblement (hors du calque qui tremble). */
export function PrismWash() {
  return <div aria-hidden="true" className="prism-wash pointer-events-none fixed inset-0 z-[46]" />;
}
