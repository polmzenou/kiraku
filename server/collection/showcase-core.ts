// Vitrine du profil, remplacée d'un bloc. Le client Prisma est injecté (serveur ou test).
// Le client envoie des ids de Card ; le serveur choisit l'exemplaire et vérifie la propriété.
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeShowcase } from "@/lib/collection/showcase";

export type ShowcaseErrorCode = "NO_USER" | "BANNED" | "INVALID" | "NOT_OWNED";

export class ShowcaseError extends Error {
  constructor(readonly code: ShowcaseErrorCode) {
    super(code);
  }
}

/** Remplace toute la vitrine ; renvoie l'id de Card de chaque case (null = vide). */
export async function setShowcaseWith(
  db: PrismaClient,
  userId: string,
  slots: readonly (string | null)[],
  size: number,
): Promise<(string | null)[]> {
  const wanted = normalizeShowcase(slots, size);
  if (!wanted) throw new ShowcaseError("INVALID");

  return db.$transaction(async (tx) => {
    // Même verrou que le recyclage : il ne peut pas supprimer l'exemplaire qu'on met en vitrine
    const [user] = await tx.$queryRaw<{ bannedAt: Date | null }[]>`
      SELECT "bannedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new ShowcaseError("NO_USER");
    if (user.bannedAt) throw new ShowcaseError("BANNED");

    const cardIds = wanted.filter((c): c is string => c !== null);
    const [current, copies] = await Promise.all([
      tx.showcaseSlot.findMany({ where: { userId }, select: { userCardId: true } }),
      cardIds.length > 0
        ? tx.userCard.findMany({
            where: { ownerId: userId, status: "COLLECTION", cardId: { in: cardIds } },
            orderBy: [{ obtainedAt: "asc" }, { id: "asc" }],
            select: { id: true, cardId: true },
          })
        : Promise.resolve([]),
    ]);

    // Exemplaire déjà en vitrine en priorité, sinon le plus ancien
    const shown = new Set(current.map((s) => s.userCardId));
    const copyOf = new Map<string, string>();
    for (const c of copies) {
      const chosen = copyOf.get(c.cardId);
      if (!chosen || (!shown.has(chosen) && shown.has(c.id))) copyOf.set(c.cardId, c.id);
    }
    if (cardIds.some((id) => !copyOf.has(id))) throw new ShowcaseError("NOT_OWNED");

    await tx.showcaseSlot.deleteMany({ where: { userId } });
    const rows = wanted.flatMap((cardId, i) => (cardId ? [{ userId, position: i + 1, userCardId: copyOf.get(cardId)! }] : []));
    if (rows.length > 0) await tx.showcaseSlot.createMany({ data: rows });
    return wanted;
  });
}
