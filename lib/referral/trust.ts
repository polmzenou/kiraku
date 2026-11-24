import type { ReferralV2Rules } from "./rules";
import type { StepTimes } from "./steps";

// Confiance du filleul, qui décide quand le parrain touche sa part « confiance » (les boosters Mythiques des étapes 1
// et 2). Un compte Discord déjà vieux de trustDiscordDays jours quand il a été lié : confiance haute, chaque étape paie
// dès qu'elle est atteinte. E-mail seul, ou Discord plus récent : confiance moyenne, la part « confiance » attend
// l'étape 3 ; elle est versée tout de suite si le filleul lie ensuite un Discord ancien, et perdue s'il s'arrête avant.
// L'âge se mesure à la liaison : un Discord récent ne devient pas « ancien » en vieillissant.

export type Trust = "HIGH" | "MEDIUM";

const DAY = 86_400_000;

/** `createdAt` : date lue dans l'identifiant Discord (lib/discord/snowflake.ts) ; `linkedAt` : liaison au compte. */
export function refereeTrust(discord: { createdAt: Date | null; linkedAt: Date | null }, rules: Pick<ReferralV2Rules, "trustDiscordDays">): Trust {
  if (!discord.createdAt || !discord.linkedAt) return "MEDIUM";
  return discord.linkedAt.getTime() - discord.createdAt.getTime() >= rules.trustDiscordDays * DAY ? "HIGH" : "MEDIUM";
}

/** La part « confiance » du parrain de l'étape `step` (1 ou 2) est-elle due ? */
export function trustPartDue(step: 1 | 2, times: StepTimes, trust: Trust): boolean {
  if (times[step - 1] === null) return false;
  return trust === "HIGH" || times[2] !== null;
}
