import type { ThemeMedia } from "../showcase/theme-registry";

// Images du prestige, générées puis converties par scripts/prestige-assets.mjs (public/prestige/). Les noms portent une
// version : la relever ici et dans le script quand une image change (le navigateur garde /prestige une semaine).

const V = 1;

/** Image fixe d'une scène : portrait sur téléphone, paysage au-delà. */
export type SceneStill = { portrait: string; landscape: string };

/** Brocarts des rouleaux fermés, un par cycle à tour de rôle. */
const SCROLL_COLORS = ["violet", "canard", "carmin", "vert"] as const;

export const PRESTIGE_ASSETS = {
  /** Rite de renaissance en bain d'encre : paysage d'encre nocturne (9:16 et 16:9). */
  rite: { portrait: `/prestige/rite/still-mobile-v${V}.webp`, landscape: `/prestige/rite/still-desktop-v${V}.webp` } satisfies SceneStill,
  /** En-tête de /prestige : l'aube au-dessus d'une mer de nuages (3:4 et 16:9). */
  accueil: { portrait: `/prestige/accueil/still-mobile-v${V}.webp`, landscape: `/prestige/accueil/still-desktop-v${V}.webp` } satisfies SceneStill,
  /** Sanctuaire du profil : le hall du sanctuaire la nuit, image fixe et boucle vidéo (3:4 et 16:9), comme les vitrines. */
  sanctuary: {
    mobile: { still: `/prestige/sanctuaire/still-mobile-v${V}.webp`, loop: `/prestige/sanctuaire/loop-mobile-v${V}.mp4` },
    desktop: { still: `/prestige/sanctuaire/still-desktop-v${V}.webp`, loop: `/prestige/sanctuaire/loop-desktop-v${V}.mp4` },
  } satisfies ThemeMedia,
  /** Autel à gradins (3:2) ; les plateaux portent les cartes à 21 %, 39 % et 63 % de sa hauteur (prestige.css). */
  altar: `/prestige/fx/autel-gradins-v${V}.webp`,
  /** Cloche du sanctuaire (1:3) et zuiun, nuées porte-bonheur en laque d'or (2:1). */
  suzu: `/prestige/fx/suzu-v${V}.webp`,
  zuiun: [1, 2, 3].map((k) => `/prestige/fx/zuiun-${k}-v${V}.webp`),
} as const;

/** Rouleau fermé du cycle `n` : son brocart (4 couleurs à tour de rôle). */
export function scrollCover(n: number): string {
  return `/prestige/fx/rouleau-${SCROLL_COLORS[(Math.max(n, 1) - 1) % SCROLL_COLORS.length]}-v${V}.webp`;
}

// Les autres images (pierre à encre et onde du rite, poudre d'or, baren et encre d'estampe, halo de nacre, rayon, éclat,
// rayons et nuages de Raigō, papier et baguettes des rouleaux) sont des fonds CSS : voir components/prestige/prestige.css
// et components/opening/BarenReveal.css. La pierre à encre est en 2:1, le centre de son bassin à 42 % de sa hauteur.
