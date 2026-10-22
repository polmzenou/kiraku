"use client";

import { m } from "motion/react";
import type { CSSProperties } from "react";
import "./Aurora.css";

/**
 * Lueur multicolore façon aurore derrière la pile : annonce qu'une Mythique, une AR ou une Gold attend
 * au fond. Taches en dégradé radial (aucun flou, aucun mélange de calques), animées en CSS sur transform
 * et opacity seulement : tout reste sur le compositeur. `near` : la grosse carte est sur le dessus.
 * Effets allégés : deux taches ; mouvement réduit : les taches, immobiles (coupe-tout de globals.css).
 */
export function Aurora({ accent, near, lite, reduced, delay }: { accent: string; near: boolean; lite: boolean; reduced: boolean; delay: number }) {
  return (
    <m.div
      aria-hidden="true"
      className="aurora"
      data-near={near || undefined}
      style={{ "--aurora-accent": accent } as CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
      transition={{ duration: reduced ? 0.3 : 1.4, delay: reduced ? 0 : delay, ease: "easeOut" }}
    >
      <span className="aurora-body">
        <span className="aurora-blob aurora-blob-a" />
        <span className="aurora-blob aurora-blob-b" />
        {!lite && <span className="aurora-blob aurora-blob-c" />}
        {!lite && <span className="aurora-blob aurora-blob-d" />}
      </span>
    </m.div>
  );
}
