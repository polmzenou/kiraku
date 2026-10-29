"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import type { ArenaReaction, BattleSound, FxLevel } from "@/lib/battle/choreography";
import type { Side } from "@/lib/battle/types";
import { noise } from "../fx/vfx";
import type { ArenaHandle, SoundPort } from "../stage/useDirector";

// Outils communs des arènes : poignée de réactions pour le metteur en scène, parallaxe des plans à la
// caméra, particules d'ambiance déterministes et éphémères (transform et opacity seulement), et la
// facture « peinte » : contours tremblés (déplacement SVG statique), grain de papier, brume.

export type ArenaProps = {
  level: FxLevel;
  handleRef: (h: ArenaHandle | null) => void;
  /** Sons du décor (shishi-odoshi, tonnerre, foule) ; absent quand le son est coupé. */
  sound?: { current: SoundPort | null };
};

export const play = (sound: ArenaProps["sound"], name: BattleSound) => sound?.current?.play(name);

/**
 * Filtres de la facture peinte, calculés une fois (le décor est statique) : `rough` fait trembler les
 * contours comme un trait d'encre, `fine` pour les détails. Les plans qui les portent restent sur leur
 * propre couche (arena.css), pour n'être peints qu'une fois.
 */
export function OrganicDefs({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" width="0" height="0" className="arena-defs">
      <defs>
        <filter id={`${id}-rough`} x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={`${id}-fine`} x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="1" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/** Grain de papier sur toute l'arène (texture fixe, sans mélange). */
export function Grain({ strength = 1 }: { strength?: number }) {
  return <div aria-hidden="true" className="arena-grain" style={{ opacity: 0.32 * strength }} />;
}

/** Brume en nappes irrégulières qui dérivent lentement. */
export function Haze({ tone, top, height, opacity = 0.5, slow = 1 }: { tone: string; top: string; height: string; opacity?: number; slow?: number }) {
  return (
    <div
      aria-hidden="true"
      className="arena-haze"
      style={{ top, height, opacity, ["--tone" as string]: tone, animationDuration: `${46 * slow}s` }}
    />
  );
}

/** Profondeur des plans : le fond bouge peu, les abords au premier plan bougent plus que la scène. */
export type Plane = { ref: RefObject<HTMLElement | null>; depth: number };

/** Branche la poignée de l'arène : réactions au combat et parallaxe des plans quand la caméra bouge. */
export function useArenaHandle(handleRef: ArenaProps["handleRef"], planes: readonly Plane[], react: (reaction: ArenaReaction, side?: Side) => void) {
  const reactRef = useRef(react);
  const planesRef = useRef(planes);
  useLayoutEffect(() => {
    reactRef.current = react;
    planesRef.current = planes;
  });
  const camera = useCallback((dx: number, dy: number, zoom: number, ms: number) => {
    for (const p of planesRef.current) {
      const el = p.ref.current;
      if (!el) continue;
      const k = p.depth;
      el.animate(
        [
          { transform: "translate(0px, 0px) scale(1)" },
          { transform: `translate(${dx * k}px, ${dy * k}px) scale(${1 + (zoom - 1) * k})`, offset: 0.28 },
          { transform: "translate(0px, 0px) scale(1)" },
        ],
        { duration: ms, easing: "cubic-bezier(.2,.8,.3,1)", composite: "add" },
      );
    }
  }, []);
  useEffect(() => {
    handleRef({ react: (r, s) => reactRef.current(r, s), camera });
    return () => handleRef(null);
  }, [camera, handleRef]);
}

/** Nombre de particules selon le niveau d'effets : complet, allégé (un tiers), réduit (aucune). */
export const particles = (level: FxLevel, full: number) => (level === "reduced" ? 0 : level === "lite" ? Math.max(1, Math.round(full / 3)) : full);

/** Variables CSS d'une particule d'ambiance : position, taille, durée et retard tirés d'une suite fixe. */
export function moteStyle(i: number, salt: number, box: { x: [number, number]; y: [number, number] }, dur: [number, number], size: [number, number]): CSSProperties {
  const r = (s: number) => noise(i, salt + s);
  return {
    ["--x" as string]: `${box.x[0] + r(1) * (box.x[1] - box.x[0])}%`,
    ["--y" as string]: `${box.y[0] + r(2) * (box.y[1] - box.y[0])}%`,
    ["--m" as string]: `${size[0] + r(3) * (size[1] - size[0])}px`,
    ["--d" as string]: `${dur[0] + r(4) * (dur[1] - dur[0])}s`,
    ["--delay" as string]: `${-r(5) * dur[1]}s`,
    ["--dx" as string]: `${(r(6) - 0.5) * 60}px`,
    ["--r" as string]: `${Math.round(r(7) * 360)}deg`,
  };
}

/**
 * Pluie éphémère de particules dans un calque de l'arène (poussière des poutres, feuilles, confettis) :
 * de simples <span> animés puis retirés.
 */
export function shower(
  layer: HTMLElement | null,
  cls: string,
  count: number,
  o: { from: [number, number]; y0: number; fall: number; drift: number; duration: number; spin?: number; delay?: number },
) {
  if (!layer || count <= 0) return;
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = cls;
    layer.appendChild(s);
    const x = (o.from[0] + noise(i, 31) * (o.from[1] - o.from[0])) * w;
    const y = o.y0 * h;
    const dx = (noise(i, 37) - 0.5) * o.drift * w;
    const spin = (o.spin ?? 0) * (noise(i, 41) > 0.5 ? 1 : -1);
    const a = s.animate(
      [
        { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${x + dx * 0.3}px, ${y + o.fall * h * 0.2}px) rotate(${spin * 0.3}deg)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${x + dx}px, ${y + o.fall * h}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: o.duration * (0.75 + noise(i, 43) * 0.5), delay: (o.delay ?? 0) + noise(i, 47) * 400, easing: "cubic-bezier(.3,.2,.5,1)", fill: "both" },
    );
    a.finished.then(() => s.remove(), () => s.remove());
  }
}

/** Anime un élément de décor (WAAPI, transform et opacity), sans effet s'il manque. */
export function pulse(el: Element | null | undefined, frames: Keyframe[], o: KeyframeAnimationOptions) {
  el?.animate(frames, { easing: "cubic-bezier(.2,.8,.3,1)", ...o });
}
