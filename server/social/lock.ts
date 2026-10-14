// Verrous communs aux actions sociales. Pas de server/db.ts ici : le client est injecté.
import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

export type LockedPlayer = {
  id: string;
  isGuest: boolean;
  bannedAt: Date | null;
  createdAt: Date;
  coins: number;
};

/**
 * Verrouille les lignes User de plusieurs joueurs, toujours dans l'ordre des ids : deux actions
 * croisées (A→B et B→A) attendent l'une l'autre au lieu de s'interbloquer. Même verrou que
 * l'ouverture, le recyclage et la vitrine.
 */
export async function lockPlayers(tx: Tx, ids: readonly string[]): Promise<Map<string, LockedPlayer>> {
  const players = new Map<string, LockedPlayer>();
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await tx.$queryRaw<LockedPlayer[]>`
      SELECT id, "isGuest", "bannedAt", "createdAt", coins FROM "User" WHERE id = ${id} FOR UPDATE`;
    if (row) players.set(id, row);
  }
  return players;
}

/** Blocages entre deux joueurs, dans chaque sens. */
export async function blocksBetween(tx: Tx, me: string, other: string) {
  const rows = await tx.userBlock.findMany({
    where: {
      OR: [
        { blockerId: me, blockedId: other },
        { blockerId: other, blockedId: me },
      ],
    },
    select: { blockerId: true },
  });
  return { byMe: rows.some((r) => r.blockerId === me), byThem: rows.some((r) => r.blockerId === other) };
}
