import Image from "next/image";
import type { CSSProperties } from "react";
import { cellCount, cellOf } from "@/lib/fresco/grid";
import { gapMaskCss } from "@/lib/fresco/mask";
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
        <div className="fr-full fr-soft">
          <Image src={fresco.fullImageUrl} alt="" fill sizes="(min-width: 768px) 576px, 100vw" preload={preload} draggable={false} {...spoiler} />
        </div>
      </figure>
    );
  }
  const pieces = new Map(fresco.pieces.map((p) => [p.position, p.imageUrl]));
  const cells = Array.from({ length: cellCount(fresco) }, (_, position) => ({ position, ...cellOf(position, fresco), url: pieces.get(position) }));
  // Un seul calque pour tous les fragments possédés : fondu sur le pourtour et face aux cases vides (fresco.css)
  const art = { "--fr-gaps": gapMaskCss(new Set(pieces.keys()), fresco) ?? undefined } as CSSProperties;
  return (
    <figure role="img" aria-label={label} className={`fr-board ${className}`} style={style}>
      {cells
        .filter((c) => !c.url)
        .map((c) => (
          <div key={c.position} className="fr-cell" data-missing="" style={{ "--fr-row": c.row, "--fr-col": c.col } as CSSProperties} />
        ))}
      <div className="fr-art" style={art}>
        {cells.map((c) =>
          c.url ? (
            <div key={c.position} className="fr-cell" data-owned="" data-fresh={fresh === c.position ? "" : undefined} style={{ "--fr-row": c.row, "--fr-col": c.col } as CSSProperties}>
              <Image src={c.url} alt="" fill sizes="(min-width: 768px) 144px, 25vw" preload={preload && c.position < 4} draggable={false} {...spoiler} />
            </div>
          ) : null,
        )}
      </div>
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
