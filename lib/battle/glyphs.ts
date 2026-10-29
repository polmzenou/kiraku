// Kanji décoratifs du combat (masqués aux lecteurs d'écran, toujours doublés d'un libellé traduit).
// Chaque glyphe doit figurer dans lib/seal-glyphs.ts pour être tracé en Yuji Syuku. Les techniques, les
// passifs et les états ne s'écrivent jamais en kanji : leur nom traduit est le seul affiché.

/** Tablettes d'action : attaquer, lancer la technique, finir le tour. */
export const ACTION_KANJI = { attack: "攻", technique: "技", end: "終" } as const;

/** Issue d'une partie, tracée au pinceau à la fin. */
export const OUTCOME_KANJI = { victory: "勝", defeat: "負", draw: "引" } as const;
