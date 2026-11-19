// Cartes obtenues : découverte (une fois pour toutes, wiki et « Nouveau ») et, pour un joueur au prestige 1 ou
// plus, retrouvaille dans le cycle en cours (Discovery.regainedAt : tampon « Retrouvée », mission « découvrir des
// cartes »). Toutes les écritures de Discovery passent par ici. Le client est celui de la transaction en cours.
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function recordDiscoveries(tx: Tx, entries: readonly { userId: string; cardId: string }[], now: Date): Promise<void> {
  if (entries.length === 0) return;
  await tx.discovery.createMany({ data: entries.map((e) => ({ userId: e.userId, cardId: e.cardId, createdAt: now })), skipDuplicates: true });
  for (const userId of new Set(entries.map((e) => e.userId))) {
    const cardIds = [...new Set(entries.filter((e) => e.userId === userId).map((e) => e.cardId))];
    // Seul un joueur au prestige 1 ou plus a des retrouvailles ; une carte se retrouve une fois par cycle
    await tx.$executeRaw`
      UPDATE "Discovery" d SET "regainedAt" = ${now}
      FROM "User" u
      WHERE u.id = d."userId" AND u.prestige > 0
        AND d."userId" = ${userId} AND d."cardId" = ANY(${cardIds}::text[]) AND d."regainedAt" IS NULL`;
  }
}
