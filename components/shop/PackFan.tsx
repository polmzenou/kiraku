import type { CSSProperties } from "react";
import type { BoosterLook } from "@/server/economy/lot-view";
import { BoosterArt } from "../boosters/BoosterArt";

/**
 * Éventail d'un pack : le vrai sachet devant et, pour un lot de plusieurs boosters, un ou deux sachets
 * « fantômes » (un seul élément chacun, aux couleurs et au wagara du type) qui s'écartent au survol
 * (shop.css). Décoratif : le nom et la quantité sont dits en texte dans la carte.
 */
export function PackFan({ look, name, quantity, className = "" }: { look: BoosterLook; name: string; quantity: number; className?: string }) {
  const vars = { "--booster-base": look.theme.base, "--booster-dark": look.theme.dark } as CSSProperties;
  const ghosts = quantity >= 3 ? ["l", "r"] : quantity === 2 ? ["r"] : [];
  return (
    <div aria-hidden="true" className={`shop-fan ${className}`} style={vars}>
      {ghosts.map((side) => (
        <span
          key={side}
          className={`shop-ghost shop-ghost-${side} wagara-${look.theme.pattern}`}
          data-shape={look.shape}
          data-ink={look.theme.ink}
        />
      ))}
      <div className="shop-lead">
        <span className="shop-halo booster-halo" style={{ "--halo": look.theme.base } as CSSProperties} />
        <BoosterArt shape={look.shape} theme={look.theme} emblem={look.emblem} name={name} contents={look.contents} compact flatShadow />
      </div>
    </div>
  );
}
