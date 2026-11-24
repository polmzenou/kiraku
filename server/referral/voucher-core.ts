// Choix de la carte d'un bon (parrainage v2, puis Ennichi) : le bon est verrouillé, la carte vérifiée, puis versée
// dans la même transaction, et le bon passe utilisé. Client injecté : serveur ou tests sur base.
//   - « Mythique au choix » : une Mythique publiée, exemplaire ordinaire (un double si le joueur l'a déjà) ;
//   - carte 1/1 : n'importe quelle carte publiée, gravée au numéro 1 du tirage réservé 1000, d'un seul exemplaire.
//     Le compteur (carte, 1000) est verrouillé : deux joueurs qui choisissent la même carte passent l'un après
//     l'autre, le second reçoit CARD_TAKEN et garde son bon.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { ONE_OF_ONE_PRINTING, type Edition } from "@/lib/prestige/printing";
import { voucherCardProblem, type VoucherKindKey } from "@/lib/referral/vouchers";
import { recordDiscoveries } from "../collection/discovery";
import { consumeWishlist } from "../collection/wishlist-core";
import { takeChosenSerial } from "../prestige/printing-core";

export type VoucherErrorCode = "NOT_FOUND" | "USED" | "CARD_UNAVAILABLE" | "NOT_MYTHIC" | "CARD_TAKEN";

export class VoucherError extends Error {
  constructor(readonly code: VoucherErrorCode) {
    super(code);
    this.name = "VoucherError";
  }
}

export type RedeemedVoucher = {
  kind: VoucherKindKey;
  cardId: string;
  userCardId: string;
  /** Édition de la carte 1/1 ; null pour une Mythique au choix. */
  edition: Edition | null;
  /** Première fois que le joueur a cette carte. */
  isNew: boolean;
};

const TX = { maxWait: 10_000, timeout: 15_000 };

export async function redeemVoucherWith(
  db: PrismaClient,
  input: { userId: string; voucherId: string; cardId: string; now: Date },
): Promise<RedeemedVoucher> {
  const { userId, cardId, now } = input;
  return db.$transaction(async (tx) => {
    // Le bon, à ce joueur, verrouillé : deux choix du même bon passent l'un après l'autre, le second le trouve utilisé.
    // Une reprise (« Révoquer et bannir ») qui l'a supprimé avant passe aussi par ce verrou : le choix ne le trouve plus.
    const [voucher] = await tx.$queryRaw<{ kind: VoucherKindKey; usedAt: Date | null }[]>`
      SELECT "kind"::text AS "kind", "usedAt" FROM "Voucher" WHERE "id" = ${input.voucherId} AND "userId" = ${userId} FOR UPDATE`;
    if (!voucher) throw new VoucherError("NOT_FOUND");
    if (voucher.usedAt) throw new VoucherError("USED");

    const card = await tx.card.findUnique({ where: { id: cardId }, select: { status: true, rarity: true } });
    const problem = voucherCardProblem(voucher.kind, card);
    if (problem) throw new VoucherError(problem);

    let edition: Edition | null = null;
    if (voucher.kind === "ONE_OF_ONE") {
      edition = await takeChosenSerial(tx, { cardId, printing: ONE_OF_ONE_PRINTING, size: 1, serial: 1 });
      if (!edition) throw new VoucherError("CARD_TAKEN");
    }

    const known = await tx.discovery.findUnique({ where: { userId_cardId: { userId, cardId } }, select: { cardId: true } });
    const userCardId = randomUUID();
    await tx.userCard.createMany({
      data: [{ id: userCardId, ownerId: userId, cardId, obtainedAt: now, ...(edition && { printing: edition.printing, serial: edition.serial }) }],
    });
    // Provenance d'une 1/1 : son premier propriétaire l'a reçue (comme une gravure offerte par l'équipe)
    if (edition) await tx.userCardOwner.create({ data: { userCardId, ownerId: userId, via: "GIFT", at: now }, select: { id: true } });
    await consumeWishlist(tx, userId, [cardId]);
    await recordDiscoveries(tx, [{ userId, cardId }], now);

    // Bon utilisé ; la condition garde la règle même sans le verrou
    const used = await tx.voucher.updateMany({ where: { id: input.voucherId, userId, usedAt: null }, data: { usedAt: now, cardId, userCardId } });
    if (used.count !== 1) throw new VoucherError("USED");
    return { kind: voucher.kind, cardId, userCardId, edition, isNew: !known };
  }, TX);
}
