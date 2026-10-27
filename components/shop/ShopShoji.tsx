"use client";

import { useEffect, useRef, useState } from "react";

/** Filet de sécurité : l'entrée dure environ 1 s, la fin du dernier panneau démonte le rideau avant. */
const DONE_AFTER_MS = 1_600;
/** Un appui accélère tout depuis où il en est, sans saut à la fin. */
const SKIP_RATE = 6;

/**
 * Entrée de la boutique : les shōji de l'échoppe s'éclairent, un trait de lumière passe entre eux, puis
 * ils glissent sur leur rail, à chaque arrivée sur /boutique. Rendu par le serveur, l'animation CSS
 * (shop.css) part dès la première image et tourne sur le compositeur pendant l'hydratation ; le contenu
 * (.shop-enter) monte quand les panneaux sont à moitié ouverts. Le composant reste monté pendant le
 * refresh() d'un achat : les panneaux ne se rejouent pas. Rien du tout en mouvement réduit (masqué en
 * CSS, sans flash).
 */
export function ShopShoji() {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDone(true), DONE_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  const skip = () => {
    const animations = [
      ...(root.current?.getAnimations({ subtree: true }) ?? []),
      ...[...document.querySelectorAll(".shop-enter")].flatMap((el) => el.getAnimations()),
    ];
    for (const animation of animations) animation.updatePlaybackRate(SKIP_RATE);
  };

  if (done) return null;
  return (
    <div
      ref={root}
      aria-hidden="true"
      className="shop-shoji"
      onAnimationEnd={(e) => {
        // Le panneau de droite part le dernier : sa fin libère l'écran
        if (e.animationName === "shop-shoji-r") setDone(true);
      }}
      onPointerDown={skip}
    >
      <div className="shop-shoji-veil" />
      <div className="shop-shoji-door shop-shoji-l">
        <span className="shop-shoji-lit" />
        <span className="shop-shoji-grid" />
        <span lang="ja" className="shop-shoji-sign font-seal">
          商店
        </span>
        <span className="shop-shoji-pull" />
      </div>
      <div className="shop-shoji-door shop-shoji-r">
        <span className="shop-shoji-lit" />
        <span className="shop-shoji-grid" />
        <span lang="ja" className="shop-shoji-hanko font-seal">
          気楽
        </span>
        <span className="shop-shoji-pull" />
      </div>
      <span className="shop-shoji-seam" />
    </div>
  );
}
