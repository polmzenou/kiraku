import type { CSSProperties } from "react";
import { LAYOUT_TEMPLATES, templateAreas, type ShowcaseLayout } from "@/lib/collection/showcase-layouts";

/** Variables CSS d'une disposition (lues par ShowcaseLayout.css) ; rien pour la grille. */
export function layoutStyle(layout: ShowcaseLayout): CSSProperties | undefined {
  if (layout === "GRID") return undefined;
  const t = LAYOUT_TEMPLATES[layout];
  return {
    "--cols-m": t.mobile.cols,
    "--areas-m": templateAreas(t.mobile),
    "--cols-d": t.desktop.cols,
    "--areas-d": templateAreas(t.desktop),
    ...(t.maxWidthRem ? { "--max-d": `${t.maxWidthRem}rem` } : {}),
  } as CSSProperties;
}
