// Images du prestige, générées puis converties par scripts/prestige-assets.mjs (public/prestige/). Les noms portent une
// version : la relever ici et dans le script quand une image change (le navigateur garde /prestige une semaine).

const V = 1;

/** Image fixe d'une scène : portrait sur téléphone, paysage au-delà. */
export type SceneStill = { portrait: string; landscape: string };

export const PRESTIGE_ASSETS = {
  /** Rite de renaissance en bain d'encre : paysage d'encre nocturne (9:16 et 16:9). */
  rite: { portrait: `/prestige/rite/still-mobile-v${V}.webp`, landscape: `/prestige/rite/still-desktop-v${V}.webp` } satisfies SceneStill,
  /** En-tête de /prestige : l'aube au-dessus d'une mer de nuages (3:4 et 16:9). */
  accueil: { portrait: `/prestige/accueil/still-mobile-v${V}.webp`, landscape: `/prestige/accueil/still-desktop-v${V}.webp` } satisfies SceneStill,
} as const;

// Les autres images (pierre à encre et onde du rite, poudre d'or, baren et encre d'estampe) sont des fonds CSS : voir
// components/prestige/prestige.css et components/opening/BarenReveal.css. La pierre à encre est en 2:1, le centre de
// son bassin à 42 % de sa hauteur (RebirthRite).
