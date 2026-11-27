import type { ReactNode } from "react";
import type { FrescoView as FrescoData } from "@/lib/fresco/view";
import { SHOWCASE_THEMES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import { ThemeBackdrop } from "../showcase/ThemeBackdrop";
import { FrescoView } from "./FrescoView";
import "../showcase/showcase.css";
import "./fresco.css";

/**
 * Fresque posée dans la scène d'une vitrine, sur le même décor que ses cartes : la vitrine la montre à la
 * place de sa grille quand on choisit « Fresque » dans la mini-navigation. Sans hook.
 */
export function FrescoStage({
  fresco,
  theme,
  label,
  fresh,
  preload = false,
  children,
}: {
  fresco: Pick<FrescoData, "cols" | "rows" | "pieces" | "fullImageUrl" | "spoiler" | "spoilerKey" | "name">;
  theme: ShowcaseThemeId;
  label: string;
  fresh?: number | null;
  preload?: boolean;
  children?: ReactNode;
}) {
  const themeDef = SHOWCASE_THEMES[theme];
  return (
    <div className="vt-stage" data-theme={theme} data-kind="fresco" data-media={themeDef.media ? "" : undefined}>
      {themeDef.media && (
        <div className="vt-backdrop" aria-hidden="true">
          <ThemeBackdrop media={themeDef.media} />
        </div>
      )}
      <FrescoView fresco={fresco} label={label} fresh={fresh} preload={preload} className="fr-stage-board" />
      {children}
    </div>
  );
}
