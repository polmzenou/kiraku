import type { CSSProperties, ReactNode, Ref } from "react";
import { gridFit, SHOWCASE_LAYOUTS, templateAreas, type LayoutGrid, type ShowcaseLayoutDef, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { SHOWCASE_THEMES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import { CARD_RADIUS_PX, RarityHalo } from "./RarityHalo";
import { StageObserver } from "./StageObserver";
import { ThemeBackdrop } from "./ThemeBackdrop";
import "./showcase.css";
import "./theme-mounts.css";

// Scène d'une vitrine : le thème (fond vidéo), la disposition et les cartes. Sans hook :
// la page la rend côté serveur, le mode édition côté client avec ses propres cartes déplaçables.

export type StageSlot = {
  /** Carte, case vide cliquable ou case vide muette. */
  node: ReactNode;
  /** Clé de rareté de la carte (effet autour d'elle) ; absente pour une case vide. */
  rarity?: string | null;
  empty?: boolean;
  selected?: boolean;
};

function layoutVars(def: ShowcaseLayoutDef): CSSProperties {
  if (def.kind === "grid") {
    // Hauteur de la grille selon sa largeur, pour la faire tenir dans le format du fond (showcase.css)
    const m = gridFit(def.mobile, def.heroes);
    const d = gridFit(def.desktop, def.heroes);
    return {
      "--cols-m": def.mobile.cols,
      "--areas-m": templateAreas(def.mobile),
      "--cols-d": def.desktop.cols,
      "--areas-d": templateAreas(def.desktop),
      "--max-d": `${def.maxWidthRem}rem`,
      "--fit-a-m": m.a,
      "--fit-k-m": m.k,
      "--fit-r-m": m.rows,
      "--fit-hr-m": m.heroRows,
      "--fit-a-d": d.a,
      "--fit-k-d": d.k,
      "--fit-r-d": d.rows,
      "--fit-hr-d": d.heroRows,
    } as CSSProperties;
  }
  if (def.kind === "fan") return { "--box-h": def.boxHeight, "--max-d": `${def.maxWidthRem}rem` } as CSSProperties;
  return {};
}

function slotVars(def: ShowcaseLayoutDef, index: number): CSSProperties {
  const base = { "--i": index } as Record<string, string | number>;
  if (def.kind === "grid") base.gridArea = `s${index + 1}`;
  if (def.kind === "fan") {
    const s = def.slots[index];
    Object.assign(base, { "--left": `${s.left}%`, "--top": `${s.top}%`, "--w": `${def.cardWidth}%`, "--z": s.z, "--rot": `${s.rotate}deg` });
  }
  return base as CSSProperties;
}

export function ShowcaseStage({
  layout,
  theme,
  slots,
  label,
  listRef,
  slotRef,
  gallery = false,
  children,
}: {
  layout: ShowcaseLayoutId;
  /** Thème affiché (déjà ramené à Sans décor s'il n'est plus disponible). */
  theme: ShowcaseThemeId;
  slots: readonly StageSlot[];
  label: string;
  listRef?: Ref<HTMLOListElement>;
  slotRef?: (index: number, el: HTMLLIElement | null) => void;
  /**
   * Galerie de nombreuses vitrines (/event) : fond en image fixe chargée à l'approche, sans vidéo ni effet
   * de rareté autour des cartes. Mêmes dispositions et thèmes.
   */
  gallery?: boolean;
  /** Au-dessus des cartes (barre d'édition…). */
  children?: ReactNode;
}) {
  const def = SHOWCASE_LAYOUTS[layout];
  const themeDef = SHOWCASE_THEMES[theme];
  return (
    <div className="vt-stage" data-theme={theme} data-kind={def.kind} data-media={themeDef.media ? "" : undefined}>
      {!gallery && <StageObserver />}
      {themeDef.media && (
        <div className="vt-backdrop" aria-hidden="true">
          <ThemeBackdrop media={themeDef.media} stillOnly={gallery} />
        </div>
      )}
      <ol ref={listRef} aria-label={label} className="vt-cards" data-kind={def.kind} style={layoutVars(def)}>
        {slots.map((slot, i) => (
          <li
            key={i}
            ref={slotRef ? (el) => slotRef(i, el) : undefined}
            className="vt-slot"
            data-slot={i + 1}
            data-hero={def.heroes.includes(i) || undefined}
            data-empty={slot.empty || undefined}
            style={slotVars(def, i)}
          >
            <div className="vt-mount">
              <div className="vt-card" data-selected={slot.selected || undefined}>
                {slot.empty || gallery ? (
                  slot.node
                ) : (
                  <RarityHalo rarity={slot.rarity} delay={i * 0.83} radius={CARD_RADIUS_PX[cardSizing(layout, i).size]}>
                    {slot.node}
                  </RarityHalo>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {children}
    </div>
  );
}

/** Colonnes couvertes par une case dans une grille. */
function spanOf(grid: LayoutGrid, name: string): number {
  const row = grid.areas.find((r) => r.split(" ").includes(name));
  return row ? row.split(" ").filter((c) => c === name).length : 1;
}

/** Taille de la carte et attribut `sizes` de son image selon sa place dans la disposition. */
export function cardSizing(layout: ShowcaseLayoutId, index: number): { size: "sm" | "md" | "lg"; sizes: string } {
  const def = SHOWCASE_LAYOUTS[layout];
  if (def.kind === "frieze") return { size: "sm", sizes: "(min-width: 768px) 152px, 30vw" };
  if (def.kind === "fan") return { size: index === 0 ? "lg" : "md", sizes: "(min-width: 768px) 170px, 27vw" };
  const name = `s${index + 1}`;
  const mobile = Math.round((spanOf(def.mobile, name) / def.mobile.cols) * 100);
  const desktopRem = (spanOf(def.desktop, name) / def.desktop.cols) * def.maxWidthRem;
  const size = def.heroes.includes(index) ? "lg" : mobile >= 40 ? "md" : "sm";
  return { size, sizes: `(min-width: 768px) ${Math.round(desktopRem * 16)}px, ${mobile}vw` };
}
