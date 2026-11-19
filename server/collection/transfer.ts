// Exemplaires qui changent de main (prestige, étape 16). Deux règles valent pour tous les chemins :
//  - le serveur ne choisit jamais tout seul un exemplaire spécial (héritier ou gravé) : `chooseCopy` ;
//  - tout changement de propriétaire passe par `moveCopy`, qui remet « gardée par son propriétaire » à zéro
//    et écrit la provenance d'un exemplaire spécial. Aucun autre fichier n'écrit `UserCard.ownerId`
//    (transfer-guard.test.ts le vérifie), et un déclencheur en base rattrape un oubli.
// Pas de server/db.ts ici : le client est celui de la transaction en cours, le joueur est déjà verrouillé.
import type { CardStatus, OwnershipVia, Prisma } from "@/generated/prisma/client";
import { COPY_MARKS, isSpecialCopy, onlySpecialCopies, ORDINARY_COPY } from "@/lib/collection/copies";
import { pickGiftCopy } from "@/lib/social/gifts";

type Tx = Prisma.TransactionClient;

export type CopyChoice =
  | { ok: true; id: string; special: boolean }
  /** `NONE` : aucun exemplaire disponible ; `CHOOSE_COPY` : seulement des spéciaux, au joueur d'en désigner un. */
  | { ok: false; reason: "NONE" | "CHOOSE_COPY" };

/**
 * Exemplaire d'une carte qui part de chez un joueur (cadeau, vente, échange, mise au casino).
 * `chosenId` : l'exemplaire désigné par le joueur, accepté s'il est à lui, de cette carte et en collection.
 * Sans désignation : le plus récent exemplaire ordinaire hors vitrine, sinon le plus récent ordinaire exposé.
 */
export async function chooseCopy(tx: Tx, ownerId: string, cardId: string, chosenId?: string | null): Promise<CopyChoice> {
  const copies = await tx.userCard.findMany({
    where: { ownerId, cardId, status: "COLLECTION" },
    select: { id: true, obtainedAt: true, ...COPY_MARKS },
  });
  if (chosenId) {
    const chosen = copies.find((c) => c.id === chosenId);
    return chosen ? { ok: true, id: chosen.id, special: isSpecialCopy(chosen) } : { ok: false, reason: "NONE" };
  }
  if (copies.length === 0) return { ok: false, reason: "NONE" };
  if (onlySpecialCopies(copies)) return { ok: false, reason: "CHOOSE_COPY" };
  const shown = await tx.showcaseItem.findMany({
    where: { userCardId: { in: copies.map((c) => c.id) } },
    select: { userCardId: true },
  });
  return { ok: true, id: pickGiftCopy(copies, new Set(shown.map((s) => s.userCardId)))!.id, special: false };
}

/**
 * Exemplaire qu'une annonce, une offre ou une proposition épingle : la pièce spéciale désignée. Un ordinaire n'est
 * pas épinglé : n'importe lequel fera l'affaire à l'acceptation (promisedCopyWhere).
 */
export function pinOf(choice: CopyChoice): string | null {
  return choice.ok && choice.special ? choice.id : null;
}

/** Ce qu'une annonce ou une offre promet. Sans exemplaire épinglé, n'importe quel exemplaire ordinaire de la carte. */
export type PromisedCopy = { ownerId: string; cardId: string; userCardId: string | null };

/** Filtre des exemplaires qui honorent une promesse : l'exemplaire épinglé, sinon un ordinaire, en collection. */
export function promisedCopyWhere(p: PromisedCopy): Prisma.UserCardWhereInput {
  return p.userCardId
    ? { id: p.userCardId, ownerId: p.ownerId, status: "COLLECTION" }
    : { ownerId: p.ownerId, cardId: p.cardId, status: "COLLECTION", ...ORDINARY_COPY };
}

/** La promesse peut-elle encore être tenue ? Même règle que l'acceptation (chooseCopy). */
export async function promisedCopyLeft(db: Pick<Tx, "userCard">, p: PromisedCopy): Promise<boolean> {
  return (await db.userCard.count({ where: promisedCopyWhere(p) })) > 0;
}

export type CopyMove = {
  userCardId: string;
  fromId: string;
  /** Statut attendu chez l'ancien propriétaire : COLLECTION, AUCTION (vente conclue) ou CASINO (mise perdue). */
  fromStatus: CardStatus;
  toId: string;
  via: Exclude<OwnershipVia, "DRAW" | "REBIRTH">;
  now: Date;
};

/**
 * Change le propriétaire d'un exemplaire, qui arrive en collection chez le nouveau. Écriture conditionnelle :
 * rend `false` si l'exemplaire n'est plus à l'ancien propriétaire ou plus dans le statut attendu (vendu,
 * offert ou recyclé entre-temps), sans rien modifier. L'héritage, le tirage et le numéro suivent l'exemplaire.
 */
export async function moveCopy(tx: Tx, move: CopyMove): Promise<boolean> {
  const moved = await tx.$queryRaw<{ special: boolean }[]>`
    UPDATE "UserCard"
    SET "ownerId" = ${move.toId}, status = 'COLLECTION', "obtainedAt" = ${move.now}, "keptByOwner" = 0
    WHERE id = ${move.userCardId} AND "ownerId" = ${move.fromId} AND status = ${move.fromStatus}::"CardStatus"
    RETURNING (heritage > 0 OR printing IS NOT NULL) AS special`;
  if (moved.length !== 1) return false;
  if (moved[0].special) {
    await tx.userCardOwner.create({ data: { userCardId: move.userCardId, ownerId: move.toId, via: move.via, at: move.now } });
  }
  return true;
}
