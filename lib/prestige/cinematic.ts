import type { BoosterShape, BoosterTheme } from "../boosters/types";

// Cinématique de renaissance (components/prestige/RebirthCinematic.tsx) : ce qu'elle révèle et ses particules de
// lumière. Logique pure, sans DOM : le composant ne fait que placer et animer.

/** Booster offert par la renaissance, tel que l'affichent le récapitulatif, les rites et le banc de l'admin. */
export type RebirthBoosterView = {
  slug: string;
  name: string;
  count: number;
  shape: BoosterShape;
  theme: BoosterTheme;
  emblem: string;
  /** Contenance en japonais, ex. « 四枚入 ». */
  contents: string;
};

export type CinematicBox =
  | { kind: "heirs"; count: number }
  | { kind: "printings" }
  | { kind: "cosmetics" }
  | { kind: "zeni"; zeni: number }
  | { kind: "booster"; booster: RebirthBoosterView };

/**
 * Box révélées sous le logo, dans l'ordre : héritières retrouvées, gravées, badges et titres, Zeni du recyclage,
 * booster offert. Une box sans objet (aucune héritière, aucun Zeni, pas de booster, gravées pas encore ouvertes)
 * n'apparaît pas.
 */
export function cinematicBoxes(r: { heirs: number; printingsUnlocked: boolean; zeni: number; booster: RebirthBoosterView | null }): CinematicBox[] {
  const boxes: CinematicBox[] = [];
  if (r.heirs > 0) boxes.push({ kind: "heirs", count: r.heirs });
  if (r.printingsUnlocked) boxes.push({ kind: "printings" });
  boxes.push({ kind: "cosmetics" });
  if (r.zeni > 0) boxes.push({ kind: "zeni", zeni: r.zeni });
  if (r.booster && r.booster.count > 0) boxes.push({ kind: "booster", booster: r.booster });
  return boxes;
}

/** Une carte partie, dessinée en silhouette puis changée en point de lumière qui file vers le centre. */
export type LightParticle = {
  rarity: string;
  color: string;
  /** Position de départ autour du centre, en fraction de la demi-largeur et de la demi-hauteur de l'écran (-1 à 1). */
  x: number;
  y: number;
  /** Inclinaison de la silhouette, en degrés. */
  rot: number;
  /** Écart de la courbe vers le centre (fraction du trajet, signée : à gauche ou à droite). */
  curve: number;
};

/** Générateur pseudo-aléatoire déterministe (mulberry32) : la même renaissance donne la même nuée. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Nombre de particules par rareté : au prorata des cartes parties (plus forts restes), `max` au plus, et au moins une
 * par rareté présente quand il y a la place (une Mythique recyclée se voit toujours).
 */
export function particleShares(piles: readonly { key: string; count: number }[], max: number): Map<string, number> {
  const present = piles.filter((p) => p.count > 0);
  const total = present.reduce((sum, p) => sum + p.count, 0);
  const n = Math.min(Math.max(0, Math.trunc(max)), total);
  const shares = new Map<string, number>();
  if (n === 0) return shares;
  const floorOne = present.length <= n;
  const base = present.map((p) => {
    const exact = (p.count / total) * n;
    const whole = Math.max(floorOne ? 1 : 0, Math.floor(exact));
    return { key: p.key, whole, rest: exact - Math.floor(exact) };
  });
  let left = n - base.reduce((sum, b) => sum + b.whole, 0);
  // Trop servi par le plancher d'une particule : on reprend aux plus grosses parts
  while (left < 0) {
    const big = base.reduce((a, b) => (b.whole > a.whole ? b : a));
    big.whole -= 1;
    left += 1;
  }
  for (const b of [...base].sort((a, c) => c.rest - a.rest)) {
    if (left <= 0) break;
    b.whole += 1;
    left -= 1;
  }
  for (const b of base) if (b.whole > 0) shares.set(b.key, b.whole);
  return shares;
}

/**
 * Nuée de la cinématique : les cartes parties réparties par rareté (particleShares), mêlées, et posées en anneau
 * autour du centre (rayon 55 à 95 % de l'écran), chacune avec son inclinaison et sa courbe.
 */
export function lightParticles(piles: readonly { key: string; color: string; count: number }[], max: number, seed = 1): LightParticle[] {
  const shares = particleShares(piles, max);
  const rand = prng(seed);
  const colors = new Map(piles.map((p) => [p.key, p.color]));
  const list: { rarity: string; color: string }[] = [];
  for (const [rarity, count] of shares) for (let i = 0; i < count; i++) list.push({ rarity, color: colors.get(rarity) ?? "#d9b556" });
  // Mélange (Fisher-Yates) : les couleurs arrivent entremêlées
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const n = list.length;
  return list.map((p, i) => {
    const angle = (i / n) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / Math.max(n, 4));
    const radius = 0.55 + rand() * 0.4;
    return {
      ...p,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      rot: Math.round((rand() - 0.5) * 50),
      curve: (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.2),
    };
  });
}
