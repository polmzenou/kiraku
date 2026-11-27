// Verrous communs aux actions sociales. Pas de server/db.ts ici : le client est injecté.
import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

export type LockedPlayer = {
  id: string;
  isGuest: boolean;
  bannedAt: Date | null;
  createdAt: Date;
  /** Inscription (trigger) : l'âge anti-multicomptes du Marché se compte depuis elle (lib/market/rules.ts). */
  registeredAt: Date | null;
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
      SELECT id, "isGuest", "bannedAt", "createdAt", "registeredAt", coins FROM "User" WHERE id = ${id} FOR UPDATE`;
    if (row) players.set(id, row);
  }
  return players;
}

// Espace des verrous de pseudo (forme à deux clés de pg_advisory_xact_lock : jamais confondue avec les verrous à une
// clé du catalogue, de la file de combat ou du prestige)
const USERNAME_LOCK = 740_210_010;

/**
 * Verrou consultatif d'un pseudo, casse ignorée, jusqu'à la fin de la transaction. L'index unique de User.username
 * distingue la casse : seule la vérification insensible (findFirst mode insensitive) écarte « sakura » quand « Sakura »
 * existe. Deux écritures simultanées de « Sakura » et « sakura » passaient toutes les deux (chacune ne voit pas la ligne
 * pas encore validée de l'autre) : sous ce verrou, la seconde attend la première et relit son pseudo. À prendre avant
 * la vérification, dans la transaction de l'écriture.
 */
export async function lockUsername(tx: Tx, username: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USERNAME_LOCK}::int, hashtext(lower(${username})))`;
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
