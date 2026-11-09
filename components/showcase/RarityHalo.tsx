import type { CSSProperties, ReactNode } from "react";
import "./rarity-halo.css";

// Effet autour d'une carte en vitrine, selon la clé de sa rareté (le nom affiché se règle dans l'admin).
// La carte porte déjà le cadre de sa rareté : l'effet reste un geste fin collé à elle (un liseré d'un
// pixel, de petites lumières), sans seconde bordure épaisse ni lueur qui déborde sur les voisines.
// Sans hook : rendu côté serveur comme côté client.

type Halo = "thread" | "mirror" | "motes" | "gilt" | "tone" | "vitrail" | "prism";

const HALO_BY_RARITY: Record<string, Halo> = {
  BR: "thread",
  AR: "mirror",
  MYTHIC: "motes",
  GOLD: "gilt",
  MR: "tone",
  VR: "vitrail",
  XR: "prism",
};

export function haloOf(rarity: string | null | undefined): Halo | undefined {
  return rarity ? HALO_BY_RARITY[rarity] : undefined;
}

/** Arrondi des coins de la carte selon sa taille (classes rounded-* de Fuda). */
export const CARD_RADIUS_PX = { sm: 7, md: 10, lg: 14 } as const;

const STAR = "M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z";

/** Petits éléments posés autour de la carte (éclats, lumières, paillettes, étoiles). */
function Bits({ count, className }: { count: number; className: string }) {
  return (
    <span aria-hidden="true" className={`vt-halo-front ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d={STAR} />
    </svg>
  );
}

export function RarityHalo({
  rarity,
  delay = 0,
  radius = CARD_RADIUS_PX.md,
  children,
}: {
  rarity: string | null | undefined;
  /** Décalage (s) des animations, pour que deux cartes voisines ne battent pas ensemble. */
  delay?: number;
  /** Arrondi des coins de la carte (px), que l'anneau suit. */
  radius?: number;
  children: ReactNode;
}) {
  const halo = haloOf(rarity);
  if (!halo) return <>{children}</>;
  const ring = halo === "thread" || halo === "mirror" || halo === "gilt" || halo === "prism";
  return (
    <div className="vt-halo" data-halo={halo} style={{ "--vt-delay": `${-delay}s`, "--vt-r": `${radius}px` } as CSSProperties}>
      {(halo === "thread" || halo === "vitrail") && <span aria-hidden="true" className="vt-halo-back vt-halo-glow" />}
      {ring && (
        <span aria-hidden="true" className="vt-halo-back vt-halo-ring">
          <span className="vt-halo-spin" />
        </span>
      )}
      {halo === "tone" && (
        <span aria-hidden="true" className="vt-halo-back vt-halo-tone">
          <span />
        </span>
      )}
      {halo === "vitrail" && <span aria-hidden="true" className="vt-halo-back vt-halo-frame" />}
      <div className="vt-halo-card">{children}</div>
      {halo === "mirror" && <Bits count={6} className="vt-halo-shards" />}
      {halo === "motes" && <Bits count={8} className="vt-halo-motes" />}
      {halo === "gilt" && <Bits count={4} className="vt-halo-flakes" />}
      {halo === "prism" && (
        <span aria-hidden="true" className="vt-halo-front vt-halo-sparkles">
          <Star />
          <Star />
        </span>
      )}
      {halo === "vitrail" && <Star className="vt-halo-front vt-halo-star" />}
    </div>
  );
}
