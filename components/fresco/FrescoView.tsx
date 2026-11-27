import Image from "next/image";
import type { CSSProperties } from "react";
import { cellCount, cellOf } from "@/lib/fresco/grid";
import type { FrescoView as FrescoData } from "@/lib/fresco/view";
import { spoilerImageAttrs } from "@/lib/spoiler";
import "./fresco.css";

/**
 * Une fresque telle que la voit son lecteur : l'image d'origine quand elle est complète ; sinon les seuls
 * fragments possédés, chacun à sa place, et des cases vides transparentes. Sans hook : rendue au serveur
 * (profil, Nouveautés) comme au client (révélation, aperçu de l'admin).
 */
export function FrescoView({
  fresco,
  label,
  fresh,
  preload = false,
  className = "",
}: {
  fresco: Pick<FrescoData, "cols" | "rows" | "pieces" | "fullImageUrl" | "spoiler" | "spoilerKey" | "name">;
  /** Nom lu par un lecteur d'écran (nom et progression). */
  label: string;
  /** Fragment qui vient d'arriver : il se pose sur sa case. */
  fresh?: number | null;
  preload?: boolean;
  className?: string;
}) {
  const { cols, rows } = fresco;
  const spoiler = spoilerImageAttrs(fresco.spoiler, fresco.spoilerKey);
  const style = { "--fr-cols": cols, "--fr-rows": rows } as CSSProperties;
  if (fresco.fullImageUrl) {
    return (
      <figure role="img" aria-label={label} className={`fr-board ${className}`} style={style}>
        <div className="fr-full">
          <Image src={fresco.fullImageUrl} alt="" fill sizes="(min-width: 768px) 576px, 100vw" preload={preload} draggable={false} {...spoiler} />
        </div>
      </figure>
    );
  }
  const pieces = new Map(fresco.pieces.map((p) => [p.position, p.imageUrl]));
  return (
    <figure role="img" aria-label={label} className={`fr-board ${className}`} style={style}>
      {Array.from({ length: cellCount(fresco) }, (_, position) => {
        const { row, col } = cellOf(position, fresco);
        const url = pieces.get(position);
        const cell = { "--fr-row": row, "--fr-col": col } as CSSProperties;
        return url ? (
          <div key={position} className="fr-cell" data-owned="" data-fresh={fresh === position ? "" : undefined} style={cell}>
            <Image src={url} alt="" fill sizes="(min-width: 768px) 144px, 25vw" preload={preload && position < 4} draggable={false} {...spoiler} />
          </div>
        ) : (
          <div key={position} className="fr-cell" data-missing="" style={cell} />
        );
      })}
    </figure>
  );
}

/** Mini-carte de la grille : cases possédées, case qui vient d'arriver. */
export function FrescoMap({ cols, rows, owned, fresh, className = "" }: { cols: number; rows: number; owned: readonly number[]; fresh?: number | null; className?: string }) {
  const have = new Set(owned);
  return (
    <div aria-hidden="true" className={`fr-map ${className}`} style={{ "--fr-cols": cols, "--fr-rows": rows } as CSSProperties}>
      {Array.from({ length: cols * rows }, (_, p) => (
        <span key={p} data-owned={have.has(p) ? "" : undefined} data-fresh={fresh === p ? "" : undefined} />
      ))}
    </div>
  );
}
