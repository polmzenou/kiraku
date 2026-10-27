import type { CSSProperties } from "react";
import type { BoosterShape } from "@/lib/boosters/types";
import type { BoosterLook } from "@/server/economy/lot-view";
import { BoosterArt, JUBAKO_BODY, POCHI_BODY } from "../boosters/BoosterArt";

/** Calque posé sur le corps du booster : dents du sachet, enveloppe ou boîte laquée selon le format. */
const BODY: Record<BoosterShape, string> = {
  SACHET: "zig-both absolute inset-0",
  POCHIBUKURO: `${POCHI_BODY} overflow-hidden rounded-[4cqw]`,
  JUBAKO: `${JUBAKO_BODY} overflow-hidden`,
};

/**
 * Reflet holographique « kirakira » : nacre et or qui suivent la souris (--mx/--my posées par TiltGrid sur
 * ce seul calque) et paillettes, visibles quand la carte s'ouvre (shop.css). Épouse la forme du booster.
 */
export function BoosterHolo({ shape }: { shape: BoosterShape }) {
  return (
    <span className={`pointer-events-none ${BODY[shape]}`}>
      <span className="shop-holo absolute inset-0" />
      <span className="shop-glitter absolute inset-0" />
    </span>
  );
}

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
        <BoosterArt
          shape={look.shape}
          theme={look.theme}
          emblem={look.emblem}
          name={name}
          contents={look.contents}
          compact
          flatShadow
          overlay={<BoosterHolo shape={look.shape} />}
        />
      </div>
    </div>
  );
}

/** Étoiles « kira » qui scintillent autour du sachet quand la carte s'ouvre (positions fixes, aucun hasard). */
const KIRA = [
  { x: "18%", y: "20%", d: "0s", s: "13px" },
  { x: "76%", y: "16%", d: ".35s", s: "10px" },
  { x: "82%", y: "64%", d: ".7s", s: "12px" },
  { x: "14%", y: "70%", d: "1.05s", s: "10px" },
  { x: "50%", y: "6%", d: ".5s", s: "9px" },
];

export function KiraSparkles() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {KIRA.map((k) => (
        <span key={k.d} className="shop-kira" style={{ "--x": k.x, "--y": k.y, "--d": k.d, "--s": k.s } as CSSProperties} />
      ))}
    </span>
  );
}
