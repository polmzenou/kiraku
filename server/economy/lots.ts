// Versement d'un lot, dans la transaction de ce qui le cause (mission, parrainage, achat). Le
// contenu est relu en base dans la transaction ; le pool des cartes « par rareté » et le hasard
// sont injectés (serveur : pool du booster standard et crypto.randomInt ; tests : à graine).
import { randomUUID } from "node:crypto";
import type { CoinReason, Prisma } from "@/generated/prisma/client";
import { guardState, pickCard, type CardPool, type DuplicateGuard, type GuardState } from "@/lib/boosters/draw";
import type { Rng } from "@/lib/boosters/rng";
import type { Rarity } from "@/lib/catalog/rarity";
import { parseLotItemRow } from "@/lib/economy/lots";
import { grantBoosters } from "./credits";
import { credit } from "./ledger";
import { consumeWishlist } from "../collection/wishlist-core";
import { markWished } from "@/lib/collection/wishlist";
import { loadOwnedCopies } from "../boosters/duplicate-guard";

type Tx = Prisma.TransactionClient;

export type LotDeps = {
  rng: Rng;
  /** Pool des cartes tirées « par rareté » (booster standard), chargé seulement si besoin. */
  loadPool: () => Promise<CardPool>;
  /** Doublons des grandes raretés (règles des boosters) ; sans elle, tirage sans protection. */
  duplicateGuard?: () => Promise<DuplicateGuard | undefined>;
};

export type LotGrant = {
  zeni: number;
  boosters: { boosterTypeId: string; count: number }[];
  /** `isNew` : jamais obtenue avant ce versement (badge 新 à la révélation). */
  cards: { userCardId: string; cardId: string; rarity: Rarity; isNew: boolean; /** Était dans la liste de souhaits. */ wished: boolean }[];
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
  // Préparé au premier tirage « par rareté » : exemplaires du joueur et cartes déjà versées par ce lot
  let guard: GuardState | null | undefined;
  const drawn: { cardId: string; rarity: Rarity }[] = [];
  for (const row of lot.items) {
    // Une ligne incohérente (type ou carte supprimés) est ignorée plutôt que de bloquer le versement
    const item = parseLotItemRow(row);
    if (!item) continue;
    if (item.kind === "BOOSTER") {
      const type = await tx.boosterType.findUnique({ where: { id: item.boosterTypeId }, select: { kind: true } });
      if (!type) continue;
      if (type.kind === "DROP") {
        // Sachet scellé : une ligne par sachet, qu'on ne peut pas offrir (seul un tirage en donne d'offrables)
        await tx.sealedDrop.createMany({
          data: Array.from({ length: item.quantity }, () => ({ ownerId: userId, boosterTypeId: item.boosterTypeId, source: "LOT" as const, giftable: false, createdAt: now })),
        });
      } else {
        await grantBoosters(tx, userId, item.boosterTypeId, item.quantity);
      }
      grant.boosters.push({ boosterTypeId: item.boosterTypeId, count: item.quantity });
    } else if (item.kind === "CARD") {
      const card = await tx.card.findUnique({ where: { id: item.cardId }, select: { id: true, rarity: true } });
      if (!card) continue;
      for (let i = 0; i < item.quantity; i++) drawn.push({ cardId: card.id, rarity: card.rarity as Rarity });
    } else {
      pool ??= await deps.loadPool();
      if (guard === undefined) {
        const rules = await deps.duplicateGuard?.();
        guard = guardState(rules, await loadOwnedCopies(tx, userId, rules), pool);
        for (const c of drawn) guard?.take(c.cardId);
      }
      for (let i = 0; i < item.quantity; i++) {
        // Une carte protégée en double ne sort plus ; déjà possédée, une chance sur N
        const c = pickCard(deps.rng, pool, item.rarity, {}, undefined, guard);
        guard?.take(c.cardId);
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
    const wished = await consumeWishlist(tx, userId, drawn.map((c) => c.cardId));
    grant.cards = markWished(drawn, wished).map((c) => {
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
