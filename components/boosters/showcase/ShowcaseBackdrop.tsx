"use client";

import { useState, type CSSProperties } from "react";
import type { BoosterTheme } from "@/lib/boosters/types";

type Layer = { key: string; theme: BoosterTheme; fade: boolean };

/**
 * Fond du hero aux couleurs et au motif du booster choisi. À chaque changement, un nouveau calque
 * apparaît en fondu par-dessus l'ancien (opacity seulement), puis l'ancien est retiré.
 * Mouvement réduit : pas de transition, le nouveau calque s'affiche aussitôt.
 */
export function ShowcaseBackdrop({ slug, theme }: { slug: string; theme: BoosterTheme }) {
  const [layers, setLayers] = useState<Layer[]>([{ key: slug, theme, fade: false }]);

  // Nouveau booster : on garde le calque visible dessous et on empile le nouveau (au plus deux)
  if (layers[layers.length - 1].key !== slug) {
    setLayers([...layers.slice(-1), { key: slug, theme, fade: true }]);
  }

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      {layers.map((layer, i) => (
        <span
          key={layer.key}
          data-ink={layer.theme.ink}
          className={`showcase-layer wagara-${layer.theme.pattern} absolute inset-0 ${
            layer.fade ? "transition-opacity duration-500 ease-out starting:opacity-0 motion-reduce:transition-none" : ""
          }`}
          style={{ "--booster-base": layer.theme.base, "--booster-dark": layer.theme.dark } as CSSProperties}
          onTransitionEnd={i === layers.length - 1 && layers.length > 1 ? () => setLayers((ls) => ls.slice(-1)) : undefined}
        />
      ))}
      {/* Mobile : le hero se fond dans le fond de page vers le bandeau */}
      <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_62%,var(--color-bg)_100%)] lg:hidden" />
    </div>
  );
}
