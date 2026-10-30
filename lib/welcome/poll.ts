import { z } from "@/lib/zod";

// Sondage « Un Discord Kiraku vous intéresserait ? » (oui/non), posé par l'annonce de la v2.5 et la
// première bannière des Nouveautés, compté dans /admin.
export const DISCORD_POLL = "discord-community";

export const pollAnswerSchema = z.boolean();

/** Réponse enregistrée pour le joueur : la sienne d'avant s'il avait déjà voté (already). */
export type PollResult = { vote: boolean; already: boolean };

/** Décompte oui/non et part des « oui » en pourcentage arrondi (0 sans réponse). */
export function pollTally(rows: readonly { answer: boolean; count: number }[]) {
  const yes = rows.find((r) => r.answer)?.count ?? 0;
  const no = rows.find((r) => !r.answer)?.count ?? 0;
  const total = yes + no;
  return { yes, no, total, yesPercent: total === 0 ? 0 : Math.round((yes / total) * 100) };
}
