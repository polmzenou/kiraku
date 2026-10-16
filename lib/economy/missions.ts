import { z } from "@/lib/zod";
import { localizedSchema } from "@/lib/boosters/types";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";

// Missions quotidiennes et hebdomadaires : définies en base (/admin/missions), progression dérivée
// des journaux existants (server/economy/mission-progress.ts), récompense = un lot.

export const MISSION_PERIODS = ["DAILY", "WEEKLY"] as const;
export type MissionPeriod = (typeof MISSION_PERIODS)[number];

export const MISSION_METRICS = [
  "VISIT",
  "OPEN_BOOSTERS",
  "PULL_RARITY",
  "DISCOVER_CARDS",
  "RECYCLE_ZENI",
  "SPEND_ZENI",
  "SEND_GIFTS",
  "ADD_FRIENDS",
] as const;
export type MissionMetric = (typeof MISSION_METRICS)[number];

/** Dépenses qui comptent pour SPEND_ZENI (les mises bloquées puis rendues n'en sont pas). */
export const SPEND_REASONS = ["BOOSTER", "GIFT", "SHOP"] as const;

/** Raretés « au moins `min` » : un objectif « tirer une Épique » accepte aussi Légendaire et Mythique. */
export function raritiesFrom(min: Rarity): Rarity[] {
  return RARITIES.slice(RARITIES.indexOf(min));
}

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const missionInputSchema = z
  .object({
    id: id.optional(),
    key: z.string().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    period: z.enum(MISSION_PERIODS),
    metric: z.enum(MISSION_METRICS),
    goal: z.number().int().min(1).max(1_000_000),
    rarity: z.enum(RARITIES).nullable(),
    // Titre libre facultatif ; sinon le texte est généré depuis l'objectif
    title: localizedSchema.nullable(),
    lotId: id,
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict()
  .refine((m) => (m.metric === "PULL_RARITY") === (m.rarity !== null), {
    message: "Une rareté est requise pour « tirer une rareté », et seulement pour elle",
    path: ["rarity"],
  })
  .refine((m) => m.metric !== "VISIT" || m.goal === 1, { message: "Une visite s'accomplit une fois", path: ["goal"] });
export type MissionInput = z.infer<typeof missionInputSchema>;

export type MissionState = "IN_PROGRESS" | "CLAIMABLE" | "CLAIMED";

export function missionState(progress: number, goal: number, claimed: boolean): MissionState {
  if (claimed) return "CLAIMED";
  return progress >= goal ? "CLAIMABLE" : "IN_PROGRESS";
}

/** Progression affichée : bornée à l'objectif (la barre ne déborde pas). */
export function shownProgress(progress: number, goal: number): number {
  return Math.max(0, Math.min(goal, Math.floor(progress)));
}

/** Clé de ce que compte une mission : deux missions qui mesurent la même chose partagent le calcul. */
export function measureKey(m: { metric: MissionMetric; period: MissionPeriod; rarity: Rarity | null }): string {
  return `${m.period}:${m.metric}:${m.metric === "PULL_RARITY" ? m.rarity : ""}`;
}

/** Référence du journal pour une réclamation : mission et période. */
export function missionRefId(missionId: string, periodKey: string): string {
  return `${missionId}:${periodKey}`;
}
