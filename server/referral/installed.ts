import type { Prisma } from "@/generated/prisma/client";

// Ami « installé » d'un parrain : étape 2 atteinte, ni révoqué, ni bloqué sans décision. Prédicat unique des paliers,
// des badges, des succès et de l'arbre des liens. Un parrainage v1 qualifié compte : la migration a recopié qualifiedAt
// dans step2At et la qualification v1 pose les deux ; la v1 ne révoque que par son statut, sans revokedAt (un
// parrainage v2 garde le statut PENDING).
export function installedReferralWhere(referrerId: string): Prisma.ReferralWhereInput {
  return {
    referrerId,
    step2At: { not: null },
    revokedAt: null,
    status: { not: "REVOKED" },
    OR: [{ heldAt: null }, { reviewDecision: "VALIDATED" }],
  };
}
