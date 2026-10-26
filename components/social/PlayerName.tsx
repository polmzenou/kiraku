import type { ReactNode } from "react";
import { NAME_COLOR_CLASS, type NameColorStyle } from "@/lib/profile/name-colors";

/**
 * Pseudo d'un joueur dans sa couleur débloquée (dégradé et halo, voir .name-color dans globals.css).
 * Sans couleur, le texte garde celle de son parent.
 */
export function PlayerName({ name, color, className = "" }: { name: string; color: NameColorStyle | null | undefined; className?: string }) {
  if (!color) return className ? <span className={className}>{name}</span> : <>{name}</>;
  return (
    <span className={`${NAME_COLOR_CLASS[color]} ${className}`} data-name={name}>
      {name}
    </span>
  );
}

/** Balise de t.rich qui colore le pseudo d'une phrase (« De <player>{name}</player> »). */
export function playerTag(color: NameColorStyle | null | undefined) {
  function PlayerTag(chunks: ReactNode) {
    return <PlayerName name={Array.isArray(chunks) ? chunks.join("") : String(chunks ?? "")} color={color} />;
  }
  return PlayerTag;
}
