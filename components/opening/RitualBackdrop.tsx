"use client";

import { AnimatePresence, m } from "motion/react";
import type { CSSProperties } from "react";

/** Positions fixes de la poussière d'or (pas de hasard au rendu : même affichage serveur et client). */
const DUST = Array.from({ length: 14 }, (_, i) => ({
  x: `${(i * 37 + 11) % 100}%`,
  y: `${55 + ((i * 23) % 45)}%`,
  dx: `${((i * 17) % 50) - 25}px`,
  d: `${(i * 0.7) % 9}s`,
  t: `${7 + (i % 5)}s`,
  s: `${2 + (i % 3)}px`,
}));

export type RitualTint = { id: string; style: CSSProperties; delay: number };

/**
 * Fond du rituel : la page s'assombrit (vignette sumi) et une poussière d'or monte lentement.
 * `depth` 0 → 1 : ambiance normale → l'écran s'éteint presque (une Mythique arrive).
 * `tint` : teinte de la rareté pendant le grand moment d'une Légendaire ou mieux.
 */
export function RitualBackdrop({ depth, reduced, lite = false, tint = null }: { depth: number; reduced: boolean; lite?: boolean; tint?: RitualTint | null }) {
  return (
    <m.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_0%,rgb(10_8_6/0.55)_55%,rgb(10_8_6/0.88)_100%)]" />
      <m.span
        className="absolute inset-0 bg-[#050403]"
        initial={false}
        animate={{ opacity: depth * 0.7 }}
        transition={{ duration: depth > 0 ? 0.5 : 1.2 }}
      />
      <AnimatePresence>
        {tint && (
          <m.span
            key={tint.id}
            className="absolute inset-0"
            style={tint.style}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={{ duration: reduced ? 0.2 : 0.7, delay: reduced ? 0 : tint.delay, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      {/* Effets allégés : pas de poussière d'ambiance (14 particules animées en continu) */}
      {!reduced && !lite &&
        DUST.map((p, i) => (
          <span
            key={i}
            className="ritual-dust"
            style={{ "--x": p.x, "--y": p.y, "--dx": p.dx, "--d": p.d, "--t": p.t, "--s": p.s } as CSSProperties}
          />
        ))}
    </m.div>
  );
}
