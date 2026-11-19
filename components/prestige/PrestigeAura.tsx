import type { CSSProperties } from "react";
import { PRESTIGE_ASSETS } from "@/lib/prestige/assets";
import "./prestige.css";

// Aura du profil d'un joueur au prestige 1 ou plus, derrière l'en-tête. Purement décorative, images générées :
// - dès le prestige I : de la poudre d'or qui monte, plus dense à chaque palier ;
// - du V au IX : les nuées porte-bonheur zuiun, en laque d'or, qui encadrent l'avatar et le pseudo ;
// - à partir du X : Raigō, des rayons d'or qui tournent derrière l'avatar sur un banc de nuages lumineux, et au XVIII
//   le halo de flammes des statues de temple.
// L'aura couvre toute la largeur de l'écran ; ses décors se placent par rapport au contenu (--c0, prestige.css).

/**
 * Paillettes de poudre d'or : 16 au prestige I, 24 au V, 32 au X, 40 au XVIII. Chacune est une des 8 cellules (4 × 2) de
 * la planche générée (poussières, flocons de feuille d'or, étincelles).
 */
const SPECKS = Array.from({ length: 40 }, (_, i) => {
  const cell = (i * 5) % 8;
  return {
    left: `${((i * 61.8) % 100).toFixed(1)}%`,
    size: 10 + (i % 4) * 4,
    cell: `${(((cell % 4) * 100) / 3).toFixed(2)}% ${cell < 4 ? 0 : 100}%`,
    d: `${(5 + (i % 5) * 1.3).toFixed(1)}s`,
    delay: `${(-((i * 0.77) % 7)).toFixed(2)}s`,
    dx: `${((i % 7) - 3) * 9}px`,
  };
});

/** Nuées zuiun, en px par rapport au coin haut-gauche du contenu : derrière l'avatar, à droite du pseudo, au-dessus. */
const ZUIUN = [
  { k: 0, x: -70, y: -12, w: 230, flip: false, d: "7s" },
  { k: 1, x: 184, y: 100, w: 200, flip: false, d: "8.5s" },
  { k: 2, x: 160, y: -36, w: 180, flip: true, d: "9.5s" },
];

export function PrestigeAura({ prestige }: { prestige: number }) {
  if (prestige < 1) return null;
  const specks = prestige >= 18 ? 40 : prestige >= 10 ? 32 : prestige >= 5 ? 24 : 16;
  const raigo = prestige >= 10;
  return (
    <div className="pr-aura" aria-hidden="true">
      {raigo && (
        <>
          <span className="pr-raigo-rays" />
          {prestige >= 18 && <span className="pr-raigo-halo" />}
          <span className="pr-raigo-bank" />
          <span className="pr-raigo-bank far" />
        </>
      )}
      {!raigo &&
        prestige >= 5 &&
        ZUIUN.map((c, i) => (
          <span
            key={i}
            className="pr-zuiun"
            style={{ left: `calc(var(--c0) + ${c.x}px)`, top: c.y, width: c.w, backgroundImage: `url("${PRESTIGE_ASSETS.zuiun[c.k]}")`, "--pr-flip": c.flip ? -1 : 1, "--pr-d": c.d, "--pr-delay": `${-i * 1.7}s` } as CSSProperties}
          />
        ))}
      {SPECKS.slice(0, specks).map((s, i) => (
        <span
          key={`s${i}`}
          className="pr-speck"
          style={{ left: s.left, width: s.size, height: s.size, backgroundPosition: s.cell, "--pr-d": s.d, "--pr-delay": s.delay, "--pr-dx": s.dx } as CSSProperties}
        />
      ))}
    </div>
  );
}
