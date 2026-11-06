// Decks de combat. Le client Prisma est injecté, comme pour le reste du combat : pas de server/db.ts ici.
// Un deck ne bloque aucune carte : l'exemplaire est choisi et revérifié au lancement (lockTeam).
import type { PrismaClient } from "@/generated/prisma/client";
import { TEAM_SIZE } from "@/lib/battle/types";
import { lockPlayers } from "../social/lock";
import { BattleError, checkTeam } from "./battle-core";

type SaveDeck = {
  userId: string;
  /** null : création. */
  deckId: string | null;
  /** Déjà nettoyé (cleanDeckName). */
  name: string;
  cardIds: readonly string[];
  maxDecks: number;
};

/** Crée ou remplace un deck. Le verrou du joueur protège la limite contre deux créations simultanées. */
export async function saveDeckWith(db: PrismaClient, { userId, deckId, name, cardIds, maxDecks }: SaveDeck): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const player = (await lockPlayers(tx, [userId])).get(userId);
    if (!player) throw new BattleError("NO_USER");
    if (player.bannedAt) throw new BattleError("BANNED");
    if (player.isGuest) throw new BattleError("GUEST");
    checkTeam(cardIds);

    if (deckId === null && (await tx.deck.count({ where: { userId } })) >= maxDecks) throw new BattleError("DECK_LIMIT");

    // Tous les exemplaires comptent, même en vente ou engagés en combat : seul le lancement exige la collection
    const owned = await tx.userCard.findMany({
      where: { ownerId: userId, cardId: { in: [...cardIds] } },
      distinct: ["cardId"],
      select: { cardId: true },
    });
    if (owned.length !== TEAM_SIZE) throw new BattleError("NOT_OWNED");

    if (deckId === null) return tx.deck.create({ data: { userId, name, cardIds: [...cardIds] }, select: { id: true } });
    const { count } = await tx.deck.updateMany({ where: { id: deckId, userId }, data: { name, cardIds: [...cardIds] } });
    if (count === 0) throw new BattleError("NOT_FOUND");
    return { id: deckId };
  });
}

/** Reste possible sur un deck indisponible : le nom ne dépend pas des cartes. */
export async function renameDeckWith(db: PrismaClient, { userId, deckId, name }: { userId: string; deckId: string; name: string }) {
  const { count } = await db.deck.updateMany({ where: { id: deckId, userId }, data: { name } });
  if (count === 0) throw new BattleError("NOT_FOUND");
}

export async function deleteDeckWith(db: PrismaClient, { userId, deckId }: { userId: string; deckId: string }) {
  const { count } = await db.deck.deleteMany({ where: { id: deckId, userId } });
  if (count === 0) throw new BattleError("NOT_FOUND");
}
