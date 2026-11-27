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
  GuaranteeEmptyError,
} from "@/lib/boosters/draw";
import { discoveriesToRecord } from "@/lib/boosters/discoveries";
import { stillDrawable } from "@/lib/boosters/drawable";
import { isIncenseActive } from "@/lib/boosters/incense";
import type { Rng } from "@/lib/boosters/rng";
import { computeStock, consumeStock, stockRulesFor, type StockSettings, type StockState } from "@/lib/boosters/stock";
import { bonusesFor, creditBonuses, priceFor, type BoosterTypeView } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { isNotablePull } from "@/lib/home/notable-pulls";
import { printingSize, rollEngravings, type Edition, type PrintingRules } from "@/lib/prestige/printing";
import type { OpeningSource } from "@/lib/referral/steps";
import { consumeBoosters, CreditError } from "../economy/credits";
import { applyEntries, LedgerError } from "../economy/ledger";
import { consumeWishlist } from "../collection/wishlist-core";
import type { Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { loadOwnedCopies } from "./duplicate-guard";
import { recordDiscoveries } from "../collection/discovery";
import { takeSerial } from "../prestige/printing-core";
import { awardFrescoPieces, coinsAfter, grantFrescoLots, type AwardedFresco, type FrescoDropInput, type FrescoGrant } from "../fresco/award-core";

export type OpenErrorCode =
  | "NO_USER"
  | "BANNED"
  | "NO_BOOSTER"
  | "EMPTY_POOL"
  | "NEEDS_PAYMENT"
  | "PRICE_CHANGED"
  | "NOT_ENOUGH_ZENI"
  | "NOT_FOR_SALE"
  | "GUARANTEE_EMPTY";

export class OpenError extends Error {
  constructor(readonly code: OpenErrorCode) {
    super(code);
  }
}

/** Ce que l'ouverture doit savoir du type (validé en amont). */
export type OpenType = Pick<
  BoosterTypeView,
  "id" | "slug" | "kind" | "usesFreeStock" | "priceZeni" | "countsForPity" | "resetsPity" | "bonusEligible" | "includeCustom" | "guaranteed"
>;

export type OpenInput = {
  userId: string;
  type: OpenType;
  count: number;
  /** Le joueur accepte de payer en Zeni si le stock gratuit ne couvre pas l'ouverture. */
  pay?: boolean;
  /** Montant en Zeni que le joueur a confirmé : un prix qui a changé depuis n'est jamais débité (PRICE_CHANGED). */
  expectedZeni?: number;
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
  /** Éditions gravées (prestige) : réglages du moment ; absent ou null quand le prestige est coupé. */
  printing?: PrintingRules | null;
  /** Fresques qui peuvent tomber (un jet par booster) ; absent ou null quand rien n'est publié ou que c'est coupé. */
  fresco?: FrescoDropInput | null;
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
  cards: {
    userCardId: string;
    cardId: string;
    rarity: Rarity;
    isNew: boolean;
    /** Prestige : déjà découverte, obtenue pour la première fois dans le cycle en cours (premier exemplaire). */
    regained: boolean;
    featured: boolean;
    /** Était dans la liste de souhaits (premier exemplaire). */
    wished: boolean;
    /** Édition gravée tirée (prestige), ou null pour un exemplaire ordinaire. */
    edition: Edition | null;
  }[];
  /** Fragment de fresque glissé dans ce booster, et ses récompenses inscrites. */
  fresco?: AwardedFresco | null;
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
  /** Lots versés par les fragments de fresque de cette ouverture. */
  frescoGrants: FrescoGrant[];
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
  prestige: number;
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
 * Enregistre des boosters tirés : cartes revérifiées (publiées, rareté et poids inchangés), éditions gravées,
 * exemplaires, découvertes, liste de souhaits, lignes BoosterOpening et gros tirages du carrousel.
 */
async function persistDraw(
  tx: Tx,
  input: {
    userId: string;
    type: Pick<OpenType, "id" | "slug" | "includeCustom"> & { kind?: OpenType["kind"] };
    rules: DrawRules;
    pool: CardPool;
    now: Date;
    /** Prestige du joueur, lu sous son verrou : retrouvailles et gravure. */
    prestige: number;
    drawn: DrawnRow[];
    /** Origine des boosters : réserve gratuite, achat en Zeni, crédit ou sachet (l'étape 2 du parrainage v2 en dépend). */
    source: OpeningSource;
    sealedDropId?: string;
    /** Gravure (prestige) : réglages et générateur de l'ouverture, consommé après le tirage des cartes. */
    engrave?: { rules: PrintingRules; rng: Rng } | null;
    /** Fresques : un jet par booster enregistré, après les cartes. */
    fresco?: FrescoDropInput | null;
  },
): Promise<OpenedBoosterRow[]> {
  const { userId, type, rules, now } = input;
  // « Nouveau » : jamais obtenue avant, et seulement le premier exemplaire de ce tirage
  const drawnIds = [...new Set(input.drawn.flatMap((b) => b.cards.map((c) => c.cardId)))];
  if (drawnIds.length === 0) return [];
  const eligible = await tx.card.findMany({
    where: { id: { in: drawnIds } },
    select: { id: true, status: true, rarity: true, dropWeight: true, origin: true, boosterIds: true, variantOfId: true, boosterExclusive: true },
  });
  const liveCards = new Map(eligible.map((c) => [c.id, c]));
  // Une variante qui suit sa carte de base, ou une création admise d'office par le type, n'est pas cochée :
  // elle passe si elle (ou sa base) est au pool
  const poolIds = new Set(Object.values(input.pool).flat());
  const ctx = { typeId: type.id, includeCustom: type.includeCustom, inPool: (id: string) => poolIds.has(id) };
  if (input.drawn.some((b) => b.cards.some((c) =>
    !stillDrawable(liveCards.get(c.cardId), { rarity: c.rarity, weight: rules.cardWeights?.[c.cardId] ?? 1 }, ctx),
  ))) throw new OpenError("NOT_FOR_SALE");
  const known = await tx.discovery.findMany({ where: { userId, cardId: { in: drawnIds } }, select: { cardId: true, regainedAt: true } });
  const seen = new Set(known.map((k) => k.cardId));
  // Prestige : une carte découverte lors d'un cycle passé, pas encore obtenue dans celui-ci, est « Retrouvée »
  const regainable = new Set(input.prestige > 0 ? known.filter((k) => k.regainedAt === null).map((k) => k.cardId) : []);
  // Seules les cartes nouvelles ou retrouvées ont quelque chose à écrire : liste prise avant la boucle ci-dessous, qui
  // marque les cartes comme vues (calculée après, elle restait vide et plus aucune ouverture n'écrivait de découverte)
  const toRecord = discoveriesToRecord(drawnIds, known, input.prestige);
  // Les cartes obtenues quittent la liste de souhaits ; le premier exemplaire garde la pastille
  const wished = await consumeWishlist(tx, userId, drawnIds);

  const boosters: OpenedBoosterRow[] = input.drawn.map((b) => ({
    ...b,
    cards: b.cards.map((c) => {
      const isNew = !seen.has(c.cardId);
      seen.add(c.cardId);
      const regained = regainable.delete(c.cardId);
      return {
        userCardId: randomUUID(),
        cardId: c.cardId,
        rarity: c.rarity,
        isNew,
        regained,
        featured: c.featured === true,
        wished: wished.delete(c.cardId),
        edition: null as Edition | null,
      };
    }),
  }));

  // Éditions gravées : un tirage au sort par carte gravable (prestige minimal, Mythique et au-dessus), puis un numéro
  // libre au hasard dans le tirage en cours. Compteurs pris dans l'ordre des ids de carte : deux ouvertures qui
  // gravent les mêmes cartes ne s'interbloquent pas. Un tirage épuisé laisse la carte ordinaire.
  const rarityOrder = rules.rarities ?? Object.keys(rules.rates);
  if (input.engrave) {
    const { rules: printing, rng } = input.engrave;
    const flat = boosters.flatMap((b) => b.cards);
    const picked = rollEngravings(rng, flat, { prestige: input.prestige, order: rarityOrder, rules: printing });
    picked.sort((a, b) => (flat[a].cardId < flat[b].cardId ? -1 : flat[a].cardId > flat[b].cardId ? 1 : a - b));
    for (const i of picked) {
      const card = flat[i];
      card.edition = await takeSerial(tx, { cardId: card.cardId, printing: printing.current, size: printingSize(card.rarity, printing), rng });
    }
  }

  await tx.userCard.createMany({
    data: boosters.flatMap((b) =>
      b.cards.map((c) => ({
        id: c.userCardId,
        ownerId: userId,
        cardId: c.cardId,
        obtainedAt: now,
        ...(c.edition && { printing: c.edition.printing, serial: c.edition.serial }),
      })),
    ),
  });
  // Provenance d'une gravée : son premier propriétaire, sorti du booster
  const engraved = boosters.flatMap((b) => b.cards.filter((c) => c.edition !== null));
  if (engraved.length > 0) {
    await tx.userCardOwner.createMany({ data: engraved.map((c) => ({ userCardId: c.userCardId, ownerId: userId, via: "DRAW" as const, at: now })) });
  }
  // Un tirage sans nouveauté n'écrit rien
  await recordDiscoveries(tx, toRecord.map((cardId) => ({ userId, cardId })), now);
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
      source: input.source,
      apocalypse: b.apocalypse,
      // Le lien de partage montre la gravée même après sa vente : édition copiée à sa place dans le booster
      ...(b.cards.some((c) => c.edition) && {
        editions: b.cards.flatMap((c, position) => (c.edition ? [{ position, ...c.edition }] : [])),
      }),
      createdAt: now,
    })),
  });
  // Gros tirages pour le carrousel « En direct » de l'accueil (la rareté affichée se règle à la lecture)
  // Pas pour un booster garanti : le fil montre la chance, pas les cadeaux de l'équipe
  const notable = type.kind === "GUARANTEED" ? [] : boosters.flatMap((b) => b.cards.filter((c) => isNotablePull(c.rarity, rarityOrder)));
  if (notable.length > 0) {
    await tx.notablePull.createMany({
      data: notable.map((c) => ({
        userId,
        cardId: c.cardId,
        rarity: c.rarity,
        boosterSlug: type.slug,
        ...(c.edition && { printing: c.edition.printing, serial: c.edition.serial, printingSize: c.edition.size }),
        createdAt: now,
      })),
    });
  }
  // Fragments de fresque : jamais pour un booster garanti (un cadeau de l'équipe, pas un tirage)
  if (input.fresco && type.kind !== "GUARANTEED") {
    const awarded = await awardFrescoPieces(tx, { userId, boosterTypeId: type.id, count: boosters.length, drop: input.fresco, now });
    awarded.forEach((a, i) => {
      boosters[i].fresco = a;
    });
  }
  return boosters;
}

/** Tirage d'un booster garanti sans carte de sa rareté : l'ouverture s'annule, le booster reste au joueur. */
function drawGuarded<T>(draw: () => T): T {
  try {
    return draw();
  } catch (e) {
    if (e instanceof GuaranteeEmptyError) throw new OpenError("GUARANTEE_EMPTY");
    throw e;
  }
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
        SELECT "boosterStock", "boosterAnchor", "pityCount", "standardCount", "coins", "bannerPity", "bannedAt", "ambassadorSince", "incenseUntil", "prestige"
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
        if (input.expectedZeni !== undefined && input.expectedZeni !== price.amount) throw new OpenError("PRICE_CHANGED");
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
      // Doublons des grandes raretés : exemplaires lus sous le verrou du joueur
      const owned = await loadOwnedCopies(tx, userId, drawRules.duplicateGuard, input.pool);
      const drawn = drawGuarded(() => drawBoosters(input.rng, {
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
        owned,
        guaranteed: type.kind === "GUARANTEED" ? type.guaranteed : null,
      }));

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
        pool: input.pool,
        now,
        prestige: user.prestige,
        source: price.kind === "credit" ? "CREDIT" : price.kind === "free" ? "FREE" : "PAID",
        engrave: input.printing ? { rules: input.printing, rng: input.rng } : null,
        fresco: input.fresco ?? null,
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

      // Lots des fragments de fresque, après le débit : leurs Zeni ne paient pas cette ouverture
      const frescoGrants = input.fresco ? await grantFrescoLots(tx, userId, boosters.map((b) => b.fresco ?? null), input.fresco.lotDeps, now) : [];
      coins = coinsAfter(frescoGrants, coins);

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
        frescoGrants,
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
  type: Pick<OpenType, "id" | "slug" | "includeCustom">;
  rules: { draw: DrawRules; ruin: RuinRules };
  tables: RarityTables;
  pool: CardPool;
  incense?: IncenseDraw;
  /** Éditions gravées (prestige) ; absent ou null quand le prestige est coupé. */
  printing?: PrintingRules | null;
  /** Fresques qui peuvent tomber de ce sachet (un jet) ; absent ou null sinon. */
  fresco?: FrescoDropInput | null;
  rng: Rng;
};

export type OpenSealedOutcome = { booster: OpenedBoosterRow; karma: number; incenseActive: boolean; frescoGrants: FrescoGrant[] };

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
    const [user] = await tx.$queryRaw<{ apocalypseKarma: number; bannedAt: Date | null; incenseUntil: Date | null; prestige: number }[]>`
      SELECT "apocalypseKarma", "bannedAt", "incenseUntil", "prestige" FROM "User" WHERE id = ${userId} FOR UPDATE`;
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
    const sealedRules = incense?.draw ?? rules.draw;
    const sealed = drawSealed(input.rng, {
      kind,
      pool: input.pool,
      rules: sealedRules,
      ruin: rules.ruin,
      karma: user.apocalypseKarma,
      tables: incense?.tables ?? input.tables,
      owned: await loadOwnedCopies(tx, userId, sealedRules.duplicateGuard, input.pool),
    });
    const [booster] = await persistDraw(tx, {
      userId,
      type,
      rules: rules.draw,
      pool: input.pool,
      now,
      prestige: user.prestige,
      source: "SEALED",
      engrave: input.printing ? { rules: input.printing, rng: input.rng } : null,
      fresco: input.fresco ?? null,
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
    const frescoGrants = input.fresco ? await grantFrescoLots(tx, userId, [booster.fresco ?? null], input.fresco.lotDeps, now) : [];
    return { booster, karma: sealed.karma, incenseActive: incense !== null, frescoGrants };
  }, TX, onNotified);
}
