// Ouverture atomique de boosters. Le client Prisma est injecté (serveur ou test de concurrence) :
// pas de server/db.ts ici. Le serveur décide de tout : stock ou prix, tirage, cartes, pitiés.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  drawBoosters,
  drawSealed,
  type ApocalypseOutcome,
  type CardPool,
  type DrawnCard,
  type DrawRules,
  type FeaturedDraw,
  type RarityTables,
  type RuinRules,
  type SealedKind,
} from "@/lib/boosters/draw";
import { isIncenseActive } from "@/lib/boosters/incense";
import type { Rng } from "@/lib/boosters/rng";
import { computeStock, consumeStock, stockRulesFor, type StockSettings, type StockState } from "@/lib/boosters/stock";
import { bonusesFor, creditBonuses, priceFor, type BoosterTypeView } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { consumeBoosters, CreditError } from "../economy/credits";
import { applyEntries, LedgerError } from "../economy/ledger";
import { consumeWishlist } from "../collection/wishlist-core";
import type { Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";

export type OpenErrorCode =
  | "NO_USER"
  | "BANNED"
  | "NO_BOOSTER"
  | "EMPTY_POOL"
  | "NEEDS_PAYMENT"
  | "NOT_ENOUGH_ZENI"
  | "NOT_FOR_SALE";

export class OpenError extends Error {
  constructor(readonly code: OpenErrorCode) {
    super(code);
  }
}

/** Ce que l'ouverture doit savoir du type (validé en amont). */
export type OpenType = Pick<
  BoosterTypeView,
  "id" | "slug" | "kind" | "usesFreeStock" | "priceZeni" | "countsForPity" | "bonusEligible"
>;

export type OpenInput = {
  userId: string;
  type: OpenType;
  count: number;
  /** Le joueur accepte de payer en Zeni si le stock gratuit ne couvre pas l'ouverture. */
  pay?: boolean;
  /**
   * Ouvre des boosters crédités (BoosterCredit : cadeaux d'amis, boutique, missions, parrainage)
   * au lieu du stock : ni prix, ni booster doré ou sachet scellé (un crédit ne fait pas avancer le
   * doré) ; la pitié Mythique compte.
   */
  credit?: boolean;
  /** Planchers déjà effectifs pour ce type. */
  rules: { draw: DrawRules; stock: StockSettings };
  tables: RarityTables;
  pool: CardPool;
  featured?: FeaturedDraw;
  /** Types des sachets scellés en service : un sachet sans type ne peut pas tomber. */
  sealedTypes?: Partial<Record<SealedKind, string>>;
  /** Règles et tables sous Encens, utilisées si le boost du joueur est actif (lu sous verrou). */
  incense?: IncenseDraw;
  rng: Rng;
};

/** Tirage sous Encens : mêmes règles que le type, taux boostés. */
export type IncenseDraw = { draw: DrawRules; tables: RarityTables };

export type OpenedBoosterRow = {
  id: string;
  golden: boolean;
  /** Contenu divin : sachet Divin, ou Apocalyptique épargné. */
  divine: boolean;
  /** Sachet scellé ouvert, et l'issue d'un Apocalyptique. */
  sealed: SealedKind | null;
  apocalypse: ApocalypseOutcome | null;
  pityTriggered: boolean;
  featuredHit: boolean;
  featuredPityTriggered: boolean;
  zeniSpent: number;
  cards: { userCardId: string; cardId: string; rarity: Rarity; isNew: boolean; featured: boolean; /** Était dans la liste de souhaits (premier exemplaire). */ wished: boolean }[];
};

/** Sachet scellé tombé pendant l'ouverture, à sa place dans la série. */
export type DroppedSealed = { id: string; kind: SealedKind; position: number };

export type OpenOutcome = {
  boosters: OpenedBoosterRow[];
  drops: DroppedSealed[];
  stock: StockState;
  pityCount: number;
  standardCount: number;
  /** Boosters de cette bannière sans vedette, après l'ouverture. */
  featuredCount: number;
  coins: number;
  zeniSpent: number;
  /** Boosters crédités de ce type restant à ouvrir (mode crédit seulement, sinon 0). */
  credits: number;
  /** Rôle Ambassadeur lu sous le verrou (stock max de l'état renvoyé). */
  ambassadorSince: Date | null;
  /** Les boosters ont été tirés sous Encens. */
  incenseActive: boolean;
};

type LockedUser = {
  boosterStock: number;
  boosterAnchor: Date;
  pityCount: number;
  standardCount: number;
  coins: number;
  bannerPity: unknown;
  bannedAt: Date | null;
  ambassadorSince: Date | null;
  incenseUntil: Date | null;
};

const TX = { maxWait: 10_000, timeout: 15_000 };

/** Compteurs de pitié vedette par bannière ({ boosterTypeId: n }), valeurs invalides ignorées. */
export function readBannerPity(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === "number" && Number.isInteger(e[1]) && e[1] >= 0,
    ),
  );
}

type DrawnRow = Omit<OpenedBoosterRow, "cards"> & { cards: DrawnCard[] };

/**
 * Enregistre des boosters tirés : cartes revérifiées (publiées, rareté et poids inchangés), exemplaires,
 * découvertes, liste de souhaits, lignes BoosterOpening et gros tirages du carrousel.
 */
async function persistDraw(
  tx: Tx,
  input: { userId: string; type: Pick<OpenType, "id" | "slug">; rules: DrawRules; now: Date; drawn: DrawnRow[]; sealedDropId?: string },
): Promise<OpenedBoosterRow[]> {
  const { userId, type, rules, now } = input;
  // « Nouveau » : jamais obtenue avant, et seulement le premier exemplaire de ce tirage
  const drawnIds = [...new Set(input.drawn.flatMap((b) => b.cards.map((c) => c.cardId)))];
  if (drawnIds.length === 0) return [];
  const eligible = await tx.card.findMany({ where: { id: { in: drawnIds } }, select: { id: true, status: true, rarity: true, dropWeight: true, origin: true, boosterIds: true } });
  const liveCards = new Map(eligible.map((c) => [c.id, c]));
  if (input.drawn.some((b) => b.cards.some((c) => {
    const row = liveCards.get(c.cardId);
    return !row || row.status !== "PUBLISHED" || row.rarity !== c.rarity || row.dropWeight <= 0 ||
      row.dropWeight !== (rules.cardWeights?.[row.id] ?? 1) || (row.origin === "CUSTOM" && !row.boosterIds.includes(type.id));
  }))) throw new OpenError("NOT_FOR_SALE");
  const known = await tx.discovery.findMany({
    where: { userId, cardId: { in: drawnIds } },
    select: { cardId: true },
  });
  const seen = new Set(known.map((k) => k.cardId));
  // Les cartes obtenues quittent la liste de souhaits ; le premier exemplaire garde la pastille
  const wished = await consumeWishlist(tx, userId, drawnIds);

  const boosters: OpenedBoosterRow[] = input.drawn.map((b) => ({
    ...b,
    cards: b.cards.map((c) => {
      const isNew = !seen.has(c.cardId);
      seen.add(c.cardId);
      return { userCardId: randomUUID(), cardId: c.cardId, rarity: c.rarity, isNew, featured: c.featured === true, wished: wished.delete(c.cardId) };
    }),
  }));
  const discovered = boosters.flatMap((b) => b.cards.filter((c) => c.isNew).map((c) => c.cardId));

  await tx.userCard.createMany({
    data: boosters.flatMap((b) =>
      b.cards.map((c) => ({ id: c.userCardId, ownerId: userId, cardId: c.cardId, obtainedAt: now })),
    ),
  });
  if (discovered.length > 0) {
    await tx.discovery.createMany({
      data: discovered.map((cardId) => ({ userId, cardId, createdAt: now })),
      skipDuplicates: true,
    });
  }
  await tx.boosterOpening.createMany({
    data: boosters.map((b) => ({
      id: b.id,
      userId,
      boosterSlug: type.slug,
      cardIds: b.cards.map((c) => c.userCardId),
      catalogCardIds: b.cards.map((c) => c.cardId),
      golden: b.golden,
      divine: b.divine,
      pityTriggered: b.pityTriggered,
      featuredHit: b.featuredHit,
      zeniSpent: b.zeniSpent,
      sealedDropId: input.sealedDropId ?? null,
      apocalypse: b.apocalypse,
      createdAt: now,
    })),
  });
  // Gros tirages pour le carrousel « En direct » de l'accueil (la rareté affichée se règle à la lecture)
  const rarityOrder = rules.rarities ?? Object.keys(rules.rates);
  const notable = boosters.flatMap((b) => b.cards.filter((c) => rarityOrder.indexOf(c.rarity) >= rarityOrder.indexOf("EPIC")));
  if (notable.length > 0) {
    await tx.notablePull.createMany({
      data: notable.map((c) => ({ userId, cardId: c.cardId, rarity: c.rarity, boosterSlug: type.slug, createdAt: now })),
    });
  }
  return boosters;
}

export async function openBoostersWith(db: PrismaClient, input: OpenInput): Promise<OpenOutcome> {
  const { userId, count, rules, type } = input;
  if (Object.values(input.pool).every((ids) => ids.length === 0)) throw new OpenError("EMPTY_POOL");

  return db.$transaction(
    async (tx) => {
      // Publication takes the exclusive version of this lock. Concurrent openings stay parallel.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(740_210_001)`;
      // Verrou sur la ligne du joueur : deux ouvertures simultanées passent l'une après l'autre
      const [user] = await tx.$queryRaw<LockedUser[]>`
        SELECT "boosterStock", "boosterAnchor", "pityCount", "standardCount", "coins", "bannerPity", "bannedAt", "ambassadorSince", "incenseUntil"
        FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user) throw new OpenError("NO_USER");
      if (user.bannedAt) throw new OpenError("BANNED");

      const now = new Date();
      // Stock max lu sous le verrou : un rôle Ambassadeur retiré entre-temps ne laisse pas dépasser
      const stockRules = stockRulesFor(rules.stock, user.ambassadorSince !== null);
      const current = computeStock(user.boosterStock, user.boosterAnchor, now, stockRules);
      const price = input.credit ? ({ kind: "credit" } as const) : priceFor(type, current.stock, count);
      let stock: StockState = current;
      let total = 0;
      let credits = 0;
      if (price.kind === "credit") {
        try {
          credits = await consumeBoosters(tx, userId, type.id, count);
        } catch (e) {
          if (e instanceof CreditError) throw new OpenError("NO_BOOSTER");
          throw e;
        }
      } else if (price.kind === "free") {
        stock = consumeStock(current, count, stockRules);
      } else if (price.kind === "zeni") {
        if (!input.pay) throw new OpenError("NEEDS_PAYMENT");
        if (user.coins < price.amount) throw new OpenError("NOT_ENOUGH_ZENI");
        total = price.amount;
      } else {
        throw new OpenError(type.usesFreeStock ? "NO_BOOSTER" : "NOT_FOR_SALE");
      }
      const unitPrice = total / count;

      const bannerPity = readBannerPity(user.bannerPity);
      const sealedTypes = input.sealedTypes ?? {};
      // Encens actif : seuls les taux changent (pitié, doré, sachets et vedettes inchangés)
      const incense = input.incense && isIncenseActive(user.incenseUntil, now) ? input.incense : null;
      const drawRules = incense?.draw ?? rules.draw;
      const drawn = drawBoosters(input.rng, {
        pool: input.pool,
        rules: {
          ...drawRules,
          divineOdds: sealedTypes.divin ? drawRules.divineOdds : 0,
          apocalypseOdds: sealedTypes.apocalypse ? drawRules.apocalypseOdds : 0,
        },
        tables: incense?.tables ?? input.tables,
        bonuses: input.credit ? creditBonuses(type) : bonusesFor(type),
        featured: input.featured,
        state: {
          pityCount: user.pityCount,
          standardCount: user.standardCount,
          featuredCount: input.featured ? (bannerPity[type.id] ?? 0) : 0,
        },
        count,
      });

      // Un booster transformé devient un sachet scellé à garder, ouvrir ou offrir (une fois)
      const drops: DroppedSealed[] = drawn.boosters.flatMap((b, position) => (b.drop ? [{ id: randomUUID(), kind: b.drop, position }] : []));
      if (drops.length > 0) {
        await tx.sealedDrop.createMany({
          data: drops.map((d) => ({ id: d.id, ownerId: userId, boosterTypeId: sealedTypes[d.kind]!, source: "DRAW" as const, giftable: true, createdAt: now })),
        });
      }

      const boosters = await persistDraw(tx, {
        userId,
        type,
        rules: rules.draw,
        now,
        drawn: drawn.boosters.flatMap((b) =>
          b.drop
            ? []
            : [{
                id: randomUUID(),
                golden: b.golden,
                divine: false,
                sealed: null,
                apocalypse: null,
                pityTriggered: b.pityTriggered,
                featuredHit: b.featuredHit,
                featuredPityTriggered: b.featuredPityTriggered,
                zeniSpent: unitPrice,
                cards: b.cards,
              }],
        ),
      });

      let coins = user.coins;
      if (total > 0) {
        // Une ligne de journal par booster acheté (le sachet tombé porte celle de son booster), un seul débit
        try {
          coins = await applyEntries(
            tx,
            userId,
            [...boosters.map((b) => b.id), ...drops.map((d) => d.id)].map((refId) => ({ amount: -unitPrice, reason: "BOOSTER" as const, refId })),
            now,
          );
        } catch (e) {
          if (e instanceof LedgerError && e.code === "NOT_ENOUGH_ZENI") throw new OpenError("NOT_ENOUGH_ZENI");
          throw e;
        }
      }

      const featuredCount = drawn.state.featuredCount;
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(price.kind === "free" ? { boosterStock: stock.stock, boosterAnchor: stock.anchor } : {}),
          pityCount: drawn.state.pityCount,
          standardCount: drawn.state.standardCount,
          ...(input.featured ? { bannerPity: { ...bannerPity, [type.id]: featuredCount } } : {}),
        },
        select: { id: true },
      });

      return {
        boosters,
        drops,
        stock,
        pityCount: drawn.state.pityCount,
        standardCount: drawn.state.standardCount,
        featuredCount,
        coins,
        zeniSpent: total,
        credits,
        ambassadorSince: user.ambassadorSince,
        incenseActive: incense !== null,
      };
    },
    TX,
  );
}

export type OpenSealedInput = {
  userId: string;
  dropId: string;
  kind: SealedKind;
  /** Type du sachet (ligne BoosterType de kind DROP). */
  type: Pick<OpenType, "id" | "slug">;
  rules: { draw: DrawRules; ruin: RuinRules };
  tables: RarityTables;
  pool: CardPool;
  incense?: IncenseDraw;
  rng: Rng;
};

export type OpenSealedOutcome = { booster: OpenedBoosterRow; karma: number; incenseActive: boolean };

/**
 * Ouvre un sachet scellé du joueur : le sachet est réclamé par un UPDATE conditionnel (deux clics ou
 * un cadeau simultané ne peuvent pas l'utiliser deux fois), l'issue d'un Apocalyptique est tirée ici,
 * jamais à la chute. Ni pitié, ni doré, ni vedette ; le karma de l'Apocalypse est celui de l'ouvreur.
 * Un sachet offert renvoie le résultat à celui qui l'a offert.
 */
export async function openSealedWith(db: PrismaClient, input: OpenSealedInput, onNotified?: OnNotified): Promise<OpenSealedOutcome> {
  const { userId, kind, type, rules } = input;
  if (Object.values(input.pool).every((ids) => ids.length === 0)) throw new OpenError("EMPTY_POOL");

  return notifyingTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(740_210_001)`;
    const [user] = await tx.$queryRaw<{ apocalypseKarma: number; bannedAt: Date | null; incenseUntil: Date | null }[]>`
      SELECT "apocalypseKarma", "bannedAt", "incenseUntil" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new OpenError("NO_USER");
    if (user.bannedAt) throw new OpenError("BANNED");

    const now = new Date();
    const claimed = await tx.sealedDrop.updateMany({
      where: { id: input.dropId, ownerId: userId, boosterTypeId: type.id, openedAt: null },
      data: { openedAt: now },
    });
    if (claimed.count !== 1) throw new OpenError("NO_BOOSTER");
    const drop = await tx.sealedDrop.findUniqueOrThrow({ where: { id: input.dropId }, select: { giverId: true } });

    const incense = input.incense && isIncenseActive(user.incenseUntil, now) ? input.incense : null;
    const sealed = drawSealed(input.rng, {
      kind,
      pool: input.pool,
      rules: incense?.draw ?? rules.draw,
      ruin: rules.ruin,
      karma: user.apocalypseKarma,
      tables: incense?.tables ?? input.tables,
    });
    const [booster] = await persistDraw(tx, {
      userId,
      type,
      rules: rules.draw,
      now,
      drawn: [{
        id: randomUUID(),
        golden: false,
        divine: kind === "divin" || sealed.outcome === "SPARED",
        sealed: kind,
        apocalypse: sealed.outcome,
        pityTriggered: false,
        featuredHit: false,
        featuredPityTriggered: false,
        zeniSpent: 0,
        cards: sealed.cards,
      }],
      sealedDropId: input.dropId,
    });
    if (!booster) throw new OpenError("EMPTY_POOL");

    await tx.sealedDrop.update({ where: { id: input.dropId }, data: { openingId: booster.id }, select: { id: true } });
    if (sealed.karma !== user.apocalypseKarma) {
      await tx.user.update({ where: { id: userId }, data: { apocalypseKarma: sealed.karma }, select: { id: true } });
    }

    if (drop.giverId && drop.giverId !== userId) {
      const order = rules.draw.rarities ?? Object.keys(rules.draw.rates);
      const best = booster.cards.reduce((a, c) => (order.indexOf(c.rarity) > order.indexOf(a.rarity) ? c : a), booster.cards[0]);
      await notify(tx, {
        userId: drop.giverId,
        type: "SEALED_OPENED",
        actorId: userId,
        refId: booster.id,
        payload: { slug: kind, outcome: sealed.outcome, cardId: best?.cardId ?? null },
        now,
      });
    }
    return { booster, karma: sealed.karma, incenseActive: incense !== null };
  }, TX, onNotified);
}
