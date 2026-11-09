// Statut et condition de déblocage des thèmes de vitrine (réglage showcase.themes, édité dans
// /admin/vitrines). La condition reprend celle des titres et cadres : vérifiée quand le joueur
// choisit le thème, puis acquise. Un thème qui n'est plus « disponible » s'affiche en Sans décor.
import { z } from "@/lib/zod";
import { conditionSchema, evaluateCondition, type ProfileCondition, type ProfileStats } from "@/lib/profile/conditions";
import {
  DEFAULT_THEME,
  isThemeId,
  THEME_IDS,
  THEME_STATUSES,
  type ShowcaseThemeId,
  type ThemeChoice,
  type ThemeStatus,
} from "./theme-registry";

export const themeConfigSchema = z.object({ status: z.enum(THEME_STATUSES), condition: conditionSchema }).strict();
export type ThemeConfig = { status: ThemeStatus; condition: ProfileCondition };

// Clés libres : un thème retiré du code n'invalide pas tout le réglage (il est simplement ignoré)
export const themesSettingSchema = z.record(z.string().regex(/^[a-z0-9-]{1,32}$/), themeConfigSchema);
export type ThemesSetting = Record<string, ThemeConfig>;

const FREE: ThemeConfig = { status: "AVAILABLE", condition: { type: "ALWAYS" } };

export const THEMES_DEFAULT: Record<ShowcaseThemeId, ThemeConfig> = {
  none: FREE,
  byobu: FREE,
  tokonoma: FREE,
  urushi: FREE,
  ema: FREE,
  "black-edition": { status: "AVAILABLE", condition: { type: "RARITY_OWNED", rarity: "BR", n: 1 } },
  // Les cartes Éclat (VR) ne sont pas encore publiées : le thème est annoncé, pas encore choisissable
  eclat: { status: "SOON", condition: { type: "RARITY_OWNED", rarity: "VR", n: 1 } },
  gold: { status: "AVAILABLE", condition: { type: "RARITY_OWNED", rarity: "GOLD", n: 1 } },
};

/** Réglage d'un thème : celui de l'admin, sinon sa valeur par défaut. Sans décor reste toujours libre. */
export function themeConfig(setting: ThemesSetting, id: ShowcaseThemeId): ThemeConfig {
  if (id === DEFAULT_THEME) return FREE;
  return setting[id] ?? THEMES_DEFAULT[id];
}

/** Thème affiché : celui choisi s'il est disponible, sinon Sans décor (le choix reste enregistré). */
export function effectiveTheme(stored: string, setting: ThemesSetting): ShowcaseThemeId {
  return isThemeId(stored) && themeConfig(setting, stored).status === "AVAILABLE" ? stored : DEFAULT_THEME;
}

/** État d'un thème pour un joueur ; null s'il est masqué. */
export function themeChoice(id: ShowcaseThemeId, setting: ThemesSetting, stats: ProfileStats): ThemeChoice | null {
  const config = themeConfig(setting, id);
  if (config.status === "HIDDEN") return null;
  if (config.status === "SOON") return { id, state: "soon" };
  const progress = evaluateCondition(config.condition, stats);
  return progress.unlocked
    ? { id, state: "available" }
    : { id, state: "locked", current: progress.current, goal: progress.goal, condition: config.condition };
}

/** Thèmes proposés au joueur, dans l'ordre du registre, sans les thèmes masqués. */
export function themeChoices(setting: ThemesSetting, stats: ProfileStats): ThemeChoice[] {
  return THEME_IDS.flatMap((id) => {
    const choice = themeChoice(id, setting, stats);
    return choice ? [choice] : [];
  });
}

/** Conditions des thèmes, pour charger les statistiques dont elles ont besoin. */
export function themeConditions(setting: ThemesSetting): ProfileCondition[] {
  return THEME_IDS.map((id) => themeConfig(setting, id).condition);
}
