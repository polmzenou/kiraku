import type { CSSProperties } from "react";
import type { Rarity } from "@/lib/catalog/rarity";
import "./CardAura.css";

// Positions fixes autour du cadre : aucun aléatoire, ni intervalle JavaScript.
const motes = [
  [-7, 22], [105, 15], [-9, 62], [108, 53], [12, -5],
  [83, -8], [28, 106], [79, 104], [-4, 88], [104, 84],
] as const;

/** Or avant révélation, puis matière de la rareté ; les particules restent montées au retournement. */
export function CardAura({ rarity, reduced = false, compact = false }: { rarity?: Rarity; reduced?: boolean; compact?: boolean }) {
  return (
    <span aria-hidden="true" className="card-aura-fx" data-rarity={rarity} data-static={reduced || undefined} data-compact={compact || undefined}>
      <span className="card-aura-glow" />
      {!reduced && motes.slice(0, compact ? 6 : motes.length).map(([x, y], index) => (
        <span key={index} className="card-aura-mote" style={{
          "--x": `${x}%`, "--y": `${y}%`,
          "--dx": `${(index % 2 ? -1 : 1) * (compact ? 5 : 12)}px`,
          "--dy": `${compact ? -16 : -32}px`,
          "--d": `${-index * 0.7}s`, "--t": `${3.6 + (index % 4) * 0.6}s`,
          "--s": `${compact ? 2 : 2 + index % 3}px`,
        } as CSSProperties} />
      ))}
    </span>
  );
}
