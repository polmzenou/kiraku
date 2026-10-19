// Ouverture atomique de boosters. Le client Prisma est injecté (serveur ou test de concurrence) :
// pas de server/db.ts ici. Le serveur décide de tout : stock ou prix, tirage, cartes, pitiés.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  drawBoosters,
  type CardPool,
  type DrawRules,
  type FeaturedDraw,
  type RarityTables,
} from "@/lib/boosters/draw";
import type { Rng } from "@/lib/boosters/rng";
import { computeStock, consumeStock, type StockRules, type StockState } from "@/lib/boosters/stock";
import { bonusesFor, priceFor, type BoosterTypeView } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { consumeBoosters, CreditError } from "../economy/credits";
import { applyEntries, LedgerError } from "../economy/ledger";

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
  "id" | "slug" | "usesFreeStock" | "priceZeni" | "countsForPity" | "bonusEligible"
>;

export type OpenInput = {
  userId: string;
  type: OpenType;
  count: number;
  /** Le joueur accepte de payer en Zeni si le stock gratuit ne couvre pas l'ouverture. */
  pay?: boolean;
  /**
   * Ouvre des boosters crédités (BoosterCredit : cadeaux d'amis, boutique, missions, parrainage)
   * au lieu du stock : ni prix, ni booster doré ou divin (un crédit ne fait pas avancer le doré) ;
   * la pitié Mythique compte.
   */
  credit?: boolean;
  /** Planchers déjà effectifs pour ce type. */
  rules: { draw: DrawRules; stock: StockRules };
  tables: RarityTables;
  pool: CardPool;
  featured?: FeaturedDraw;
  rng: Rng;
};

export type OpenedBoosterRow = {
  id: string;
  golden: boolean;
  divine: boolean;
  pityTriggered: boolean;
  featuredHit: boolean;
  featuredPityTriggered: boolean;
  zeniSpent: number;
  cards: { userCardId: string; cardId: string; rarity: Rarity; isNew: boolean; featured: boolean }[];
};

export type OpenOutcome = {
  boosters: OpenedBoosterRow[];
  stock: StockState;
  pityCount: number;
  standardCount: number;
  /** Boosters de cette bannière sans vedette, après l'ouverture. */
  featuredCount: number;
  coins: number;
  zeniSpent: number;
  /** Boosters crédités de ce type restant à ouvrir (mode crédit seulement, sinon 0). */
  credits: number;
};

type LockedUser = {
  boosterStock: number;
  boosterAnchor: Date;
  pityCount: number;
  standardCount: number;
  coins: number;
  bannerPity: unknown;
  bannedAt: Date | null;
};

/** Compteurs de pitié vedette par bannière ({ boosterTypeId: n }), valeurs invalides ignorées. */
/** Raretés enregistrées comme gros tirages : le réglage home.pullFeed.minRarity choisit parmi elles. */
const NOTABLE_RARITIES = new Set<Rarity>(["EPIC", "LEGENDARY", "MYTHIC"]);

export function readBannerPity(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === "number" && Number.isInteger(e[1]) && e[1] >= 0,
    ),
  );
}

export async function openBoostersWith(db: PrismaClient, input: OpenInput): Promise<OpenOutcome> {
  const { userId, count, rules, type } = input;
  if (Object.values(input.pool).every((ids) => ids.length === 0)) throw new OpenError("EMPTY_POOL");

  return db.$transaction(
    async (tx) => {
      // Verrou sur la ligne du joueur : deux ouvertures simultanées passent l'une après l'autre
      const [user] = await tx.$queryRaw<LockedUser[]>`
        SELECT "boosterStock", "boosterAnchor", "pityCount", "standardCount", "coins", "bannerPity", "bannedAt"
        FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user) throw new OpenError("NO_USER");
      if (user.bannedAt) throw new OpenError("BANNED");

      const now = new Date();
      const current = computeStock(user.boosterStock, user.boosterAnchor, now, rules.stock);
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
        stock = consumeStock(current, count, rules.stock);
      } else if (price.kind === "zeni") {
        if (!input.pay) throw new OpenError("NEEDS_PAYMENT");
        if (user.coins < price.amount) throw new OpenError("NOT_ENOUGH_ZENI");
        total = price.amount;
      } else {
        throw new OpenError(type.usesFreeStock ? "NO_BOOSTER" : "NOT_FOR_SALE");
      }
      const unitPrice = total / count;

      const bannerPity = readBannerPity(user.bannerPity);
      const drawn = drawBoosters(input.rng, {
        pool: input.pool,
        rules: rules.draw,
        tables: input.tables,
        bonuses: input.credit ? { ...bonusesFor(type), golden: false, divine: false } : bonusesFor(type),
        featured: input.featured,
        state: {
          pityCount: user.pityCount,
          standardCount: user.standardCount,
          featuredCount: input.featured ? (bannerPity[type.id] ?? 0) : 0,
        },
        count,
      });

      // « Nouveau » : jamais obtenue avant, et seulement le premier exemplaire de ce tirage
      const drawnIds = [...new Set(drawn.boosters.flatMap((b) => b.cards.map((c) => c.cardId)))];
      const known = await tx.discovery.findMany({
        where: { userId, cardId: { in: drawnIds } },
        select: { cardId: true },
      });
      const seen = new Set(known.map((k) => k.cardId));

      const boosters: OpenedBoosterRow[] = drawn.boosters.map((b) => ({
        id: randomUUID(),
        golden: b.golden,
        divine: b.divine,
        pityTriggered: b.pityTriggered,
        featuredHit: b.featuredHit,
        featuredPityTriggered: b.featuredPityTriggered,
        zeniSpent: unitPrice,
        cards: b.cards.map((c) => {
          const isNew = !seen.has(c.cardId);
          seen.add(c.cardId);
          return { userCardId: randomUUID(), cardId: c.cardId, rarity: c.rarity, isNew, featured: c.featured === true };
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
          createdAt: now,
        })),
      });
      // Gros tirages pour le carrousel « En direct » de l'accueil (la rareté affichée se règle à la lecture)
      const notable = boosters.flatMap((b) => b.cards.filter((c) => NOTABLE_RARITIES.has(c.rarity)));
      if (notable.length > 0) {
        await tx.notablePull.createMany({
          data: notable.map((c) => ({ userId, cardId: c.cardId, rarity: c.rarity, boosterSlug: type.slug, createdAt: now })),
        });
      }
      let coins = user.coins;
      if (total > 0) {
        // Une ligne de journal par booster acheté, un seul débit : le journal de l'économie reste juste
        try {
          coins = await applyEntries(
            tx,
            userId,
            boosters.map((b) => ({ amount: -b.zeniSpent, reason: "BOOSTER" as const, refId: b.id })),
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
        stock,
        pityCount: drawn.state.pityCount,
        standardCount: drawn.state.standardCount,
        featuredCount,
        coins,
        zeniSpent: total,
        credits,
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
