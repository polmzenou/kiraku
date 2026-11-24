import type { ReferralMilestone } from "./rules";

// Paliers du parrain v2, en amis installés : un ami compte quand il a atteint l'étape 2 et que son parrainage n'est ni
// révoqué ni bloqué sans décision. Un palier atteint le reste : il se verse une fois.

/** Paliers atteints avec `installed` amis installés. */
export function reachedMilestones(installed: number, milestones: readonly ReferralMilestone[]): ReferralMilestone[] {
  return milestones.filter((m) => installed >= m.installed);
}

/** Prochain palier, ou null quand ils sont tous atteints. */
export function nextMilestone(installed: number, milestones: readonly ReferralMilestone[]): ReferralMilestone | null {
  return milestones.find((m) => installed < m.installed) ?? null;
}

/** Un palier verse-t-il quelque chose ? Un palier qui ne débloque qu'un badge ou un cadre (conditions de profil) non. */
export function milestonePays(m: ReferralMilestone): boolean {
  return m.lotId !== null || m.choiceVouchers > 0 || m.oneOfOne || m.ambassador;
}

/** Avancement vers le prochain palier, depuis le dernier atteint. */
export function ladderProgress(installed: number, milestones: readonly ReferralMilestone[]): { from: number; to: number | null; have: number } {
  const reached = reachedMilestones(installed, milestones);
  const next = nextMilestone(installed, milestones);
  return { from: reached.at(-1)?.installed ?? 0, to: next?.installed ?? null, have: installed };
}
