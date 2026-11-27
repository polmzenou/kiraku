"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useFxLevel, useReducedFx } from "@/components/motion/MotionPreference";
import { useSpoilerBlurred } from "@/components/spoiler/SpoilerPreference";
import { acquireGl } from "@/lib/fx/gl-budget";
import { spectralSeed } from "@/lib/fx/spectral";

// Le canvas WebGL et son shader ne sont chargés que pour une carte spectrale réellement affichée en grand.
const SpectralCanvas = dynamic(() => import("./SpectralCanvas"), { ssr: false });

type Props = {
  src: string;
  name: string;
  focalX: number;
  focalY: number;
  zoom: number;
  strength: number;
  grain: number;
  idle: number;
  tint?: string;
  /** Voile sombre sous le nom, peint par le shader (pleine carte). */
  veil: boolean;
  /** Carte spoil : floutée pour le joueur (mode spoiler, univers pas remis en clair), le canvas n'est pas monté et
   *  le repli CSS (flouté) reste ; il se démonte ou se remonte quand le réglage change. */
  spoiler: boolean;
  /** Clé d'univers de la carte (lib/spoiler.ts) ; sans clé, une carte spoil reste floutée. */
  spoilerKey?: string | null;
  appear?: "hidden" | "now";
};

/** Le canvas a peint : la fuda masque son image et son repli CSS (FudaSpectral.css). */
function markLive(el: HTMLElement | null, on: boolean) {
  const fuda = el?.closest<HTMLElement>(".fuda");
  if (!fuda) return;
  if (on) fuda.dataset.spectralLive = "";
  else delete fuda.dataset.spectralLive;
}

/**
 * Carte spectrale vivante : monte le canvas seulement si la carte est à l'écran et visible, le mouvement permis,
 * WebGL2 présent et une place libre dans le budget. Sinon (et tant que le canvas n'a rien peint), l'image et le
 * repli CSS de FudaSpectral.css restent. Prêt, il pose `data-spectral-live` sur la fuda.
 */
export function SpectralArt({ spoiler, spoilerKey, appear, name, ...settings }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const reduced = useReducedFx();
  // Effets allégés (réglage du joueur ou appareil lent) : une image fixe peinte une fois, pas 60 images par seconde
  const still = useFxLevel() === "lite";
  const blurred = useSpoilerBlurred(spoiler, spoilerKey);
  const [slot, setSlot] = useState<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = anchor.current;
    if (!el || reduced || failed || typeof WebGL2RenderingContext === "undefined") return;
    if (blurred) return;
    let release: (() => void) | null = null;
    // Les cartes préchargées en `visibility: hidden` sont dans l'écran mais pas vues : pas de contexte pour elles
    const seen = () => (typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true }) : true);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && seen() && !release) {
        release = acquireGl();
        if (release) setSlot(() => release);
      } else if (!entry.isIntersecting && release) {
        release();
        release = null;
        setSlot(null);
      }
    }, { rootMargin: "120px" });
    observer.observe(el);
    return () => {
      observer.disconnect();
      release?.();
      setSlot(null);
    };
  }, [reduced, failed, blurred]);

  useEffect(() => {
    const el = anchor.current;
    if (!slot) markLive(el, false);
    return () => markLive(el, false);
  }, [slot]);

  return (
    <span ref={anchor} aria-hidden="true" className="kn-spectral-host">
      {slot && !failed && (
        <SpectralCanvas
          {...settings}
          still={still}
          seed={spectralSeed(name)}
          appear={appear}
          onReady={() => markLive(anchor.current, true)}
          onFail={() => {
            markLive(anchor.current, false);
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}
