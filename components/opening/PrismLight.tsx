import { useMemo, type CSSProperties } from "react";
import { prismSparks } from "@/lib/opening/prism";
import "./PrismLight.css";

// Prisme de la XR : le sachet qui cache une XR laisse jaillir un arc-en-ciel de sa déchirure. Calques
// purement décoratifs, animés en CSS (transform et opacity) ; jamais montés en mouvement réduit.

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/**
 * Éventail de rayons, faisceau irisé, anneaux, éclair au « pop » et gerbe d'étincelles de toutes les
 * couleurs. Posé sur la fente (calque de hauteur nulle de la lumière du sachet).
 */
export function PrismBurst({ lite }: { lite: boolean }) {
  const sparks = useMemo(() => prismSparks(lite), [lite]);
  return (
    <span aria-hidden="true" className="prism-burst" data-lite={lite || undefined}>
      <span className="prism-fan" />
      <span className="prism-beam" />
      <span className="prism-ring" />
      <span className="prism-ring prism-ring-pop" />
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

/** Grand halo arc-en-ciel qui tourne derrière le sachet ; il s'éteint quand le sachet tombe. */
export function PrismHalo({ lite, fading }: { lite: boolean; fading: boolean }) {
  return (
    <span aria-hidden="true" className="prism-halo-wrap" data-lite={lite || undefined} data-fading={fading || undefined}>
      <span className="prism-halo">
        <i />
      </span>
    </span>
  );
}

/** Voile irisé sur tout l'écran, le temps du tremblement (hors du calque qui tremble). */
export function PrismWash() {
  return <div aria-hidden="true" className="prism-wash pointer-events-none fixed inset-0 z-[46]" />;
}
