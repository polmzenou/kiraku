"use client";

import { useEffect, useRef, useState } from "react";

/** Durée totale de l'entrée (écart des pans puis montée du rideau), filet de sécurité compris. */
const DONE_AFTER_MS = 1_800;

/**
 * Entrée de la boutique : le noren de l'échoppe (商 | 店) s'écarte puis se lève, à chaque arrivée sur
 * /boutique. Rendu par le serveur, l'animation CSS (shop.css) part dès la première image ; un appui la
 * passe. Le composant reste monté pendant le refresh() d'un achat : le rideau ne se rejoue pas. Rien du
 * tout en mouvement réduit (masqué en CSS, sans flash).
 */
export function ShopNoren() {
  const [done, setDone] = useState(false);
  const curtain = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDone(true), DONE_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  if (done) return null;
  return (
    <div
      ref={curtain}
      aria-hidden="true"
      className="shop-noren"
      onAnimationEnd={(e) => {
        // Fin de la montée du rideau lui-même (les pans et la lueur finissent avant)
        if (e.target === curtain.current) setDone(true);
      }}
      onPointerDown={() => curtain.current?.classList.add("shop-noren-skip")}
    >
      <span className="shop-noren-glow" />
      <div className="shop-noren-rod" />
      <div className="shop-noren-panel shop-noren-l">
        <span lang="ja" className="shop-noren-kanji font-seal">
          商
        </span>
      </div>
      <div className="shop-noren-panel shop-noren-r">
        <span lang="ja" className="shop-noren-kanji font-seal">
          店
        </span>
        <span lang="ja" className="shop-noren-mon font-seal">
          気楽
        </span>
      </div>
    </div>
  );
}
