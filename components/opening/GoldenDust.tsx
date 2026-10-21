import type { CSSProperties } from "react";
import "./RevealFx.css";

const MOTES = 38;

const v = (vars: Record<string, string>) => vars as CSSProperties;

/**
 * Sachet doré : une poussière d'or scintille sur tout l'écran pendant l'ouverture, puis retombe et
 * s'éteint (une seule fois, environ 3 s). Positions déterministes : rien ne change d'un rendu à l'autre.
 */
export function GoldenDust() {
  return (
    <div aria-hidden="true" className="golden-dust">
      {Array.from({ length: MOTES }, (_, i) => (
        <span
          key={i}
          className="golden-mote"
          style={v({
            "--x": `${(i * 37 + 11) % 100}%`,
            "--y": `${(i * 53 + 5) % 85}%`,
            "--dx": `${((i * 29) % 60) - 30}px`,
            "--dy": `${18 + ((i * 17) % 22)}vh`,
            "--s": `${3 + (i % 4) * 1.5}px`,
            "--d": `${(i % 12) * 0.09}s`,
            "--t": `${1.9 + (i % 5) * 0.3}s`,
          })}
        />
      ))}
    </div>
  );
}
