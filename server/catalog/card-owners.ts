import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { playerRefSelect, toPlayerRef, type PlayerRef } from "../profile/decor";

// Joueurs qui possèdent une carte, pour la fiche wiki (« Ils possèdent… »). Même règle que le profil
// (lib/collection/visibility.ts) : on ne liste que ceux dont la collection est visible par le lecteur,
// jamais un invité, un banni, un compte gelé ni un joueur bloqué dans un sens ou dans l'autre.

const FRIENDS_MAX = 50;
const OTHERS_MAX = 24;

export type CardOwners = { friends: PlayerRef[]; others: PlayerRef[]; othersTotal: number };

export async function getCardOwners(viewerId: string | null, cardId: string): Promise<CardOwners> {
  const common: Prisma.UserWhereInput = {
    isGuest: false,
    bannedAt: null,
    deletionRequestedAt: null,
    anonymizedAt: null,
    showCollection: true,
    cards: { some: { cardId, status: "COLLECTION" } },
    ...(viewerId
      ? {
          id: { not: viewerId },
          blocking: { none: { blockedId: viewerId } },
          blockedBy: { none: { blockerId: viewerId } },
        }
      : {}),
  };
  const friendOf = (id: string): Prisma.UserWhereInput => ({
    OR: [
      { sentFriends: { some: { addresseeId: id, status: "ACCEPTED" } } },
      { recvFriends: { some: { requesterId: id, status: "ACCEPTED" } } },
    ],
  });
  const othersWhere: Prisma.UserWhereInput = {
    AND: [common, { profileVisibility: "PUBLIC" }, ...(viewerId ? [{ NOT: friendOf(viewerId) }] : [])],
  };

  const [friends, others, othersTotal] = await Promise.all([
    viewerId
      ? prisma.user.findMany({
          where: { AND: [common, friendOf(viewerId), { profileVisibility: { in: ["PUBLIC", "FRIENDS"] } }] },
          orderBy: { username: "asc" },
          take: FRIENDS_MAX,
          select: playerRefSelect,
        })
      : Promise.resolve([]),
    prisma.user.findMany({ where: othersWhere, orderBy: { username: "asc" }, take: OTHERS_MAX, select: playerRefSelect }),
    prisma.user.count({ where: othersWhere }),
  ]);
  return { friends: friends.map(toPlayerRef), others: others.map(toPlayerRef), othersTotal };
}
