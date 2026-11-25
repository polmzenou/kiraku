import type { AchievementRank } from "./catalog";

// Couleur de la matière de chaque rang (並 washi … 神 nacre), reprise des raretés de base (--color-rarity-*).
// Le rang Rare passe en ai pour le texte : l'indigo des raretés est trop sombre sur le fond Yoru.
export const RANK_STYLE: Record<AchievementRank, { text: string; seal: string; border: string }> = {
  1: { text: "text-rarity-common", seal: "text-rarity-common border-rarity-common/60 bg-rarity-common/10", border: "border-rarity-common/50" },
  2: { text: "text-rarity-uncommon", seal: "text-rarity-uncommon border-rarity-uncommon/60 bg-rarity-uncommon/10", border: "border-rarity-uncommon/50" },
  3: { text: "text-ai", seal: "text-ai border-rarity-rare/70 bg-rarity-rare/15", border: "border-rarity-rare/60" },
  4: { text: "text-rarity-epic", seal: "text-rarity-epic border-rarity-epic/60 bg-rarity-epic/10", border: "border-rarity-epic/50" },
  5: { text: "text-kin", seal: "text-kin border-kin/60 bg-kin/10", border: "border-kin/50" },
  6: { text: "text-rarity-mythic", seal: "text-rarity-mythic border-rarity-mythic/60 bg-rarity-mythic/10", border: "border-rarity-mythic/50" },
};
