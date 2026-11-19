// Héritage d'un exemplaire : il monte d'un niveau à chaque prestige traversé (plafond prestige.heritageMax, 5 au
// plus), et suit l'exemplaire quand il change de main. La consécration se mérite : héritage au plafond, et
// l'exemplaire gardé par son propriétaire actuel au moins `minOwnCycles` prestiges.

export const HERITAGE_LEVELS = 5;

/** Héritage le plus haut : le réglage, jamais plus que les cinq pétales de la marque. */
export function heritageCap(rules: { heritageMax: number }): number {
  return Math.min(rules.heritageMax, HERITAGE_LEVELS);
}

export function canConsecrate(copy: { heritage: number; keptByOwner: number }, rules: { heritageMax: number; consecrateMinOwnCycles: number }): boolean {
  return copy.heritage >= heritageCap(rules) && copy.keptByOwner >= rules.consecrateMinOwnCycles;
}
