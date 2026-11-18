// Héritage d'un exemplaire : il monte d'un niveau à chaque prestige traversé (plafond prestige.heritageMax, 5 au
// plus), et suit l'exemplaire quand il change de main. La consécration se mérite : héritage au plafond, et
// l'exemplaire gardé par son propriétaire actuel au moins `minOwnCycles` prestiges.

export const HERITAGE_LEVELS = 5;

export function nextHeritage(current: number, max: number): number {
  return Math.min(Math.max(current, 0) + 1, Math.min(max, HERITAGE_LEVELS));
}

export function canConsecrate(copy: { heritage: number; keptByOwner: number }, rules: { heritageMax: number; consecrateMinOwnCycles: number }): boolean {
  return copy.heritage >= Math.min(rules.heritageMax, HERITAGE_LEVELS) && copy.keptByOwner >= rules.consecrateMinOwnCycles;
}
