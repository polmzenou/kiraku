"use client";

import Image from "next/image";
import { useRef } from "react";
import { useMaterialLight } from "./useMaterialLight";
import "./CardBack.css";

/** Dos classique (asanoha et ensō d'or) et dos premium (marbre d'encre) des Mythiques, AR et Gold. */
export const CARD_BACKS = { standard: "/card-backs/standard.webp", premium: "/card-backs/premium.webp" } as const;

/**
 * Dos Kiraku, peint (image 5:7 sur toute la carte). `premium` : dos des raretés
 * haut de gamme (`isTopTier`). `flat` : dos de pile ou d'éclat, toujours immobile, sans irisation
 * (bien moins coûteux).
 */
export function CardBack({ glow = false, static: still = false, flat = false, premium = false, className = "" }: {
  glow?: boolean;
  static?: boolean;
  flat?: boolean;
  premium?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMaterialLight(ref, still || flat);

  return (
    <div ref={ref} aria-hidden="true" className={`kb-back ${className}`} data-static={still || flat || undefined} data-flat={flat || undefined} data-glow={glow || undefined} data-premium={premium || undefined}>
      <Image
        src={premium ? CARD_BACKS.premium : CARD_BACKS.standard}
        alt=""
        fill
        sizes="(min-width: 768px) 320px, 80vw"
        draggable={false}
        className="kb-art"
      />
      <span className="kb-iridescence" />
      <span className="kb-sheen" />
      <span className="kb-charge" />
    </div>
  );
}
