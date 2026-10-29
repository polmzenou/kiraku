import type { Keyword, Technique } from "./types";

// Kanji décoratifs du combat (masqués aux lecteurs d'écran, toujours doublés d'un libellé traduit).
// Chaque glyphe doit figurer dans lib/seal-glyphs.ts pour être tracé en Yuji Syuku.

export const TECHNIQUE_KANJI: Record<Technique, string> = {
  ISSEN: "一閃",
  KANTSU: "貫通",
  RANBU: "乱舞",
  IYASHI: "癒",
  SHUGO: "守護",
  KOBU: "鼓舞",
  FUIN: "封印",
};

/** Première lettre de chaque passif, tracée en sceau sur la carte. */
export const KEYWORD_GLYPH: Record<Keyword, string> = { TAUNT: "挑", BARRIER: "結", FLURRY: "疾", POISON: "毒", RIPOSTE: "反", LAST_WILL: "遺", REVIVE: "復" };

/** Tablettes d'action : attaquer, finir le tour. */
export const ACTION_KANJI = { attack: "攻", end: "終" } as const;

/** Issue d'une partie, tracée au pinceau à la fin. */
export const OUTCOME_KANJI = { victory: "勝", defeat: "負", draw: "引" } as const;
