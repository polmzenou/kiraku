// Versement d'un lot, dans la transaction de ce qui le cause (mission, parrainage, achat). Le
// contenu est relu en base dans la transaction ; le pool des cartes « par rareté » et le hasard
// sont injectés (serveur : pool du booster standard et crypto.randomInt ; tests : à graine).
import { randomUUID } from "node:crypto";
import type { CoinReason, Prisma } from "@/generated/prisma/client";
import { pickCard, type CardPool } from "@/lib/boosters/draw";
import type { Rng } from "@/lib/boosters/rng";
import type { Rarity } from "@/lib/catalog/rarity";
import { parseLotItemRow } from "@/lib/economy/lots";
import { grantBoosters } from "./credits";
import { credit } from "./ledger";

type Tx = Prisma.TransactionClient;

export type LotDeps = {
  rng: Rng;
  /** Pool des cartes tirées « par rareté » (booster standard), chargé seulement si besoin. */
  loadPool: () => Promise<CardPool>;
};

export type LotGrant = {
  zeni: number;
  boosters: { boosterTypeId: string; count: number }[];
  /** `isNew` : jamais obtenue avant ce versement (badge 新 à la révélation). */
  cards: { userCardId: string; cardId: string; rarity: Rarity; isNew: boolean }[];
  /** Solde après le versement (null si le lot ne contient pas de Zeni). */
  coins: number | null;
};

export class LotError extends Error {
  constructor(readonly code: "NO_LOT") {
    super(code);
  }
}

export async function grantLot(
  tx: Tx,
  userId: string,
  lotId: string,
  ledger: { reason: CoinReason; refId: string },
  deps: LotDeps,
  now: Date = new Date(),
): Promise<LotGrant> {
  const lot = await tx.lot.findUnique({
    where: { id: lotId },
    select: { zeni: true, items: { select: { kind: true, boosterTypeId: true, cardId: true, rarity: true, quantity: true } } },
  });
  if (!lot) throw new LotError("NO_LOT");

  const grant: LotGrant = { zeni: 0, boosters: [], cards: [], coins: null };
  if (lot.zeni > 0) {
    grant.coins = await credit(tx, { userId, amount: lot.zeni, reason: ledger.reason, refId: ledger.refId, now });
    grant.zeni = lot.zeni;
  }

  let pool: CardPool | null = null;
  const drawn: { cardId: string; rarity: Rarity }[] = [];
  for (const row of lot.items) {
    // Une ligne incohérente (type ou carte supprimés) est ignorée plutôt que de bloquer le versement
    const item = parseLotItemRow(row);
    if (!item) continue;
    if (item.kind === "BOOSTER") {
      await grantBoosters(tx, userId, item.boosterTypeId, item.quantity);
      grant.boosters.push({ boosterTypeId: item.boosterTypeId, count: item.quantity });
    } else if (item.kind === "CARD") {
      const card = await tx.card.findUnique({ where: { id: item.cardId }, select: { id: true, rarity: true } });
      if (!card) continue;
      for (let i = 0; i < item.quantity; i++) drawn.push({ cardId: card.id, rarity: card.rarity as Rarity });
    } else {
      pool ??= await deps.loadPool();
      for (let i = 0; i < item.quantity; i++) {
        const c = pickCard(deps.rng, pool, item.rarity);
        drawn.push({ cardId: c.cardId, rarity: c.rarity });
      }
    }
  }

  if (drawn.length > 0) {
    const known = await tx.discovery.findMany({
      where: { userId, cardId: { in: [...new Set(drawn.map((c) => c.cardId))] } },
      select: { cardId: true },
    });
    const seen = new Set(known.map((k) => k.cardId));
    grant.cards = drawn.map((c) => {
      const isNew = !seen.has(c.cardId);
      seen.add(c.cardId);
      return { ...c, userCardId: randomUUID(), isNew };
    });
    await tx.userCard.createMany({
      data: grant.cards.map((c) => ({ id: c.userCardId, ownerId: userId, cardId: c.cardId, obtainedAt: now })),
    });
    await tx.discovery.createMany({
      data: [...new Set(drawn.map((c) => c.cardId))].map((cardId) => ({ userId, cardId, createdAt: now })),
      skipDuplicates: true,
    });
  }
  return grant;
}
