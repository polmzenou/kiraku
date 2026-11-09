// Thèmes des vitrines : ce que le code sait dessiner, sans Zod (importé côté client). Leur statut
// (disponible, bientôt, masqué) et leur condition de déblocage se règlent dans l'admin
// (réglage showcase.themes, lib/showcase/themes.ts).
import type { ProfileCondition } from "@/lib/profile/conditions";

export const THEME_IDS = ["none", "byobu", "tokonoma", "urushi", "ema", "black-edition", "eclat", "gold"] as const;
export type ShowcaseThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ShowcaseThemeId = "none";

/** Fond vidéo en boucle et son image fixe, en 3:4 (téléphone) et 16:9 (ordinateur). */
export type ThemeMedia = {
  mobile: { still: string; loop: string };
  desktop: { still: string; loop: string };
};

export type ShowcaseThemeDef = {
  kanji: string;
  /** plain : la page telle quelle ; video : fond vidéo en boucle et son image fixe. */
  kind: "plain" | "video";
  media?: ThemeMedia;
};

/**
 * Fichiers versionnés de public/vitrines/<id>/, refaits par scripts/vitrine-video.mjs. Le navigateur les
 * garde une semaine : quand un fond change, relever sa version ici et dans le script.
 */
function videoMedia(id: string, version = 1): ThemeMedia {
  const v = `v${version}`;
  return {
    mobile: { still: `/vitrines/${id}/still-mobile-${v}.webp`, loop: `/vitrines/${id}/loop-mobile-${v}.mp4` },
    desktop: { still: `/vitrines/${id}/still-desktop-${v}.webp`, loop: `/vitrines/${id}/loop-desktop-${v}.mp4` },
  };
}

export const SHOWCASE_THEMES: Record<ShowcaseThemeId, ShowcaseThemeDef> = {
  none: { kanji: "無", kind: "plain" },
  // Paravent d'or, Alcôve, Coffret laqué et Mur des vœux : fond vidéo, cartes habillées (theme-mounts.css)
  byobu: { kanji: "屏", kind: "video", media: videoMedia("byobu", 2) },
  tokonoma: { kanji: "床", kind: "video", media: videoMedia("tokonoma", 2) },
  urushi: { kanji: "漆", kind: "video", media: videoMedia("urushi", 2) },
  ema: { kanji: "絵", kind: "video", media: videoMedia("ema", 2) },
  "black-edition": { kanji: "闇", kind: "video", media: videoMedia("black-edition") },
  eclat: { kanji: "彩", kind: "video", media: videoMedia("eclat") },
  // Obsidienne veinée d'or comme un kintsugi, le sceau de la rareté Gold
  gold: { kanji: "煌", kind: "video", media: videoMedia("gold") },
};

export function isThemeId(value: unknown): value is ShowcaseThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export type ThemeStatus = "AVAILABLE" | "SOON" | "HIDDEN";
export const THEME_STATUSES = ["AVAILABLE", "SOON", "HIDDEN"] as const satisfies readonly ThemeStatus[];

/** Où en est un thème pour un joueur : choisissable, verrouillé (avec sa progression), bientôt. */
export type ThemeChoice =
  | { id: ShowcaseThemeId; state: "available" }
  | { id: ShowcaseThemeId; state: "locked"; current: number; goal: number; condition: ProfileCondition }
  | { id: ShowcaseThemeId; state: "soon" };
