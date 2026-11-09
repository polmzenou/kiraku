import type { ProfileCondition } from "@/lib/profile/conditions";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Condition de déblocage d'un thème, en clair pour le joueur (« Avoir 1 carte Mythique Black Edition »). */
export function conditionText(condition: ProfileCondition, t: Translate, rarityName: (key: string) => string): string {
  switch (condition.type) {
    case "ALWAYS":
    case "SERIES_COMPLETE":
    case "AMBASSADOR":
      return t(`conditions.${condition.type}`);
    case "RARITY_OWNED":
      return t("conditions.RARITY_OWNED", { n: condition.n, rarity: rarityName(condition.rarity) });
    case "RARITIES_DISCOVERED":
      return t("conditions.RARITIES_DISCOVERED", { n: condition.n, rarities: condition.rarities.map(rarityName).join(", ") });
    case "RANK_TIER":
      return t("conditions.RANK_TIER", { tier: condition.tier });
    default:
      return t(`conditions.${condition.type}`, { n: condition.n });
  }
}
