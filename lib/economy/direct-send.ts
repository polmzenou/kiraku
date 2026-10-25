import { z } from "@/lib/zod";
import { MAX_LOT_QUANTITY, MAX_LOT_ZENI, type LotItemInput } from "./lots";

// Envoi direct depuis /admin/utilisateurs : des Zeni, un type de booster et/ou une carte précise, versés
// à tous les inscrits sans passer par la création d'un lot. Côté serveur, un lot inactif est créé à la volée.

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const quantity = z.number().int().min(1).max(MAX_LOT_QUANTITY);

export const directRewardsSchema = z
  .object({
    zeni: z.number().int().min(0).max(MAX_LOT_ZENI),
    booster: z.object({ boosterTypeId: id, quantity }).strict().nullable(),
    card: z.object({ cardId: id, quantity }).strict().nullable(),
  })
  .strict()
  .refine((r) => r.zeni > 0 || r.booster !== null || r.card !== null, { message: "Un envoi vide ne récompense rien" });
export type DirectRewards = z.infer<typeof directRewardsSchema>;

/** Récompenses → éléments du lot créé pour l'envoi. */
export function directLotItems(rewards: DirectRewards): LotItemInput[] {
  return [
    ...(rewards.booster ? [{ kind: "BOOSTER" as const, boosterTypeId: rewards.booster.boosterTypeId, quantity: rewards.booster.quantity }] : []),
    ...(rewards.card ? [{ kind: "CARD" as const, cardId: rewards.card.cardId, quantity: rewards.card.quantity }] : []),
  ];
}

/** Nom du lot ad hoc, lisible dans l'historique de /admin/lots. */
export function directLotName(now: Date): { fr: string; en: string } {
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  return { fr: `Envoi direct · ${stamp} UTC`, en: `Direct send · ${stamp} UTC` };
}
