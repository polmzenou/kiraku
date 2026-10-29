import type { BoardTier } from "./tiers";

// Arènes du combat : une par palier du classé. Le décor est purement visuel (aucune règle de jeu) ;
// l'attribution par palier se règle dans l'admin (battle.arenas, étape 3 du chantier).

export const ARENAS = ["dojo", "chikurin", "torii", "suiu", "tenshu", "himatsuri", "takamagahara"] as const;
export type ArenaId = (typeof ARENAS)[number];

/** Arène par défaut de chaque palier, du dōjō du village au palais céleste. */
export const ARENA_BY_TIER: Record<BoardTier, ArenaId> = {
  BRONZE: "dojo",
  SILVER: "chikurin",
  GOLD: "torii",
  EMERALD: "suiu",
  ELITE: "tenshu",
  CHAMPION: "himatsuri",
  GRAND_CHAMPION: "takamagahara",
};

/** Nom japonais tracé au pinceau à l'entrée (glyphes du sous-ensemble Yuji Syuku, lib/seal-glyphs.ts). */
export const ARENA_KANJI: Record<ArenaId, string> = {
  dojo: "灯の道場",
  chikurin: "月下の竹林",
  torii: "千本鳥居",
  suiu: "翠雨の庭",
  tenshu: "嵐の天守閣",
  himatsuri: "火祭り",
  takamagahara: "高天原",
};

export function parseArena(raw: unknown): ArenaId | null {
  return typeof raw === "string" && (ARENAS as readonly string[]).includes(raw) ? (raw as ArenaId) : null;
}
