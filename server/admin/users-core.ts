// Toutes les modifications d'un joueur et leur audit partagent une transaction et le verrou User.
// Un ajout de cartes ou de boosters est un cadeau de l'équipe : ligne TeamGift (avec le mot de
// l'admin) et notification TEAM_GIFT dans la même transaction. Client injecté pour vérifier ces
// opérations sans importer la connexion de production.
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { heritageCap } from "@/lib/prestige/heritage";
import { printingSize, type Edition } from "@/lib/prestige/printing";
import { adjustedValue, MAX_ADMIN_QUANTITY, MAX_ADMIN_VALUE, type AdminEngraving, type AdminUserError, type AdminUserMutation } from "@/lib/admin/users";
import { takeChosenSerial, takeSerial } from "../prestige/printing-core";
import { computeStock, stockRulesFor, type StockSettings } from "@/lib/boosters/stock";
import { ORDINARY_COPY } from "@/lib/collection/copies";
import { MAX_MOVEMENT } from "@/lib/economy/amount";
import { parseSetting } from "@/lib/settings/defaults";
import { applyEntries, type LedgerEntry } from "../economy/ledger";
import { incenseAvailable, incenseBonusFor } from "@/lib/boosters/incense";
import { readBannerPity } from "../boosters/open-core";
import { cardsPulled } from "../boosters/incense-core";
import { lockPlayers, lockUsername, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { writeAdminLog } from "./log";
import { consumeWishlist } from "../collection/wishlist-core";
import { recordDiscoveries } from "../collection/discovery";
import { withdrawCasinoFor } from "../casino/coinflip-core";
import { withdrawMarketFor } from "../market/withdraw";
import { requeueLinkedDiscordRoleWith } from "../discord/linked-role-queue";

export class AdminUserMutationError extends Error {
  constructor(readonly code: AdminUserError) { super(code); }
}

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

/**
 * Ids de cartes recopiés au plus dans le journal d'un changement de découvertes : « Tout découvrir » en ajoute des
 * milliers (tout le catalogue publié), que la fiche et le journal relisaient en entier. Les nombres restent exacts.
 */
export const LOGGED_DISCOVERY_IDS = 200;

/** Réglages du stock lus en base dans la transaction (pas dans le cache) : le calcul est exact. */
async function stockSettings(tx: Tx): Promise<StockSettings> {
  const rows = await tx.gameSetting.findMany({ where: { key: { in: ["booster.maxStock", "ambassador.maxStock", "booster.intervalMinutes"] } }, select: { key: true, value: true } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return {
    max: parseSetting("booster.maxStock", stored.get("booster.maxStock")),
    ambassadorMax: parseSetting("ambassador.maxStock", stored.get("ambassador.maxStock")),
    intervalMs: parseSetting("booster.intervalMinutes", stored.get("booster.intervalMinutes")) * 60_000,
  };
}

/** Héritage le plus haut qu'un admin peut poser (prestige.heritageMax, 5 au plus), lu dans la transaction. */
async function heritageCapIn(tx: Tx): Promise<number> {
  const row = await tx.gameSetting.findUnique({ where: { key: "prestige.heritageMax" }, select: { value: true } });
  return heritageCap({ heritageMax: parseSetting("prestige.heritageMax", row?.value) });
}

/**
 * Numéros de gravure de `count` exemplaires d'une carte : le numéro choisi (un seul exemplaire), sinon un numéro libre
 * au hasard. Un tirage encore jamais ouvert pour cette carte est créé avec la taille réglée pour sa rareté.
 */
async function engraveFor(tx: Tx, card: { id: string; rarity: string }, engraving: AdminEngraving, count: number): Promise<Edition[]> {
  const row = await tx.gameSetting.findUnique({ where: { key: "prestige.printing.sizes" }, select: { value: true } });
  const size = printingSize(card.rarity, { sizes: parseSetting("prestige.printing.sizes", row?.value) });
  const editions: Edition[] = [];
  for (let i = 0; i < count; i++) {
    const edition = engraving.serial !== null
      ? await takeChosenSerial(tx, { cardId: card.id, printing: engraving.printing, size, serial: engraving.serial })
      : await takeSerial(tx, { cardId: card.id, printing: engraving.printing, size, rng: (max) => randomInt(0, max) });
    if (!edition) throw new AdminUserMutationError("SERIAL_UNAVAILABLE");
    editions.push(edition);
  }
  return editions;
}

/** Exemplaire ordinaire devenu spécial depuis l'admin : il ouvre sa provenance chez son propriétaire actuel (cadeau de l'équipe). */
async function openProvenance(tx: Tx, userCardId: string, ownerId: string, now: Date) {
  if ((await tx.userCardOwner.count({ where: { userCardId } })) > 0) return;
  await tx.userCardOwner.create({ data: { userCardId, ownerId, via: "GIFT", at: now } });
}

/** Palier de l'Encens lu en base dans la transaction (pas dans le cache), comme le stock. */
async function incenseCardStep(tx: Tx): Promise<number> {
  const row = await tx.gameSetting.findUnique({ where: { key: "incense.cardStep" }, select: { value: true } });
  return parseSetting("incense.cardStep", row?.value);
}

/** Cadeau de l'équipe : le joueur est notifié, l'admin n'est jamais nommé. */
async function giftFromTeam(
  tx: Tx,
  gift: { userId: string; adminId: string; quantity: number; message: string | null; now: Date } & (
    | { kind: "CARD"; cardId: string }
    | { kind: "BOOSTER"; boosterTypeId: string }
    | { kind: "INCENSE" }
  ),
) {
  const row = await tx.teamGift.create({
    data: {
      userId: gift.userId,
      adminId: gift.adminId,
      kind: gift.kind,
      cardId: gift.kind === "CARD" ? gift.cardId : null,
      boosterTypeId: gift.kind === "BOOSTER" ? gift.boosterTypeId : null,
      quantity: gift.quantity,
      message: gift.message,
      createdAt: gift.now,
    },
    select: { id: true },
  });
  await notify(tx, {
    userId: gift.userId,
    type: "TEAM_GIFT",
    actorId: gift.adminId,
    refId: row.id,
    payload:
      gift.kind === "CARD"
        ? { kind: "CARD", cardId: gift.cardId, quantity: gift.quantity }
        : gift.kind === "BOOSTER"
          ? { kind: "BOOSTER", boosterTypeId: gift.boosterTypeId, quantity: gift.quantity }
          : { kind: "INCENSE", quantity: gift.quantity },
    now: gift.now,
  });
}

/**
 * Bannit un compte dans la transaction de l'appelant (joueur déjà verrouillé) : date du ban gardée s'il l'était déjà,
 * sessions fermées. Ses tables de pile ou face se ferment après la transaction (withdrawCasinoFor). Partagé par
 * l'édition du compte et les bans réseau (server/anticheat/network-ban-core.ts). true s'il ne l'était pas encore.
 */
export async function banAccountWith(tx: Tx, userId: string, now: Date): Promise<boolean> {
  const { count } = await tx.user.updateMany({ where: { id: userId, bannedAt: null }, data: { bannedAt: now } });
  await tx.session.deleteMany({ where: { userId } });
  // Rôle Discord « vérifié » retiré dans la minute, pas au contrôle quotidien
  if (count === 1) await requeueLinkedDiscordRoleWith(tx, userId, now);
  return count === 1;
}

/** Ce que setAmbassadorInTx lit du joueur (verrouillé par l'appelant). */
export const AMBASSADOR_USER_SELECT = {
  id: true, ambassadorSince: true, boosterStock: true, boosterAnchor: true, titleId: true, frameId: true, nameColorId: true,
} satisfies Prisma.UserSelect;
export type AmbassadorUser = Prisma.UserGetPayload<{ select: typeof AMBASSADOR_USER_SELECT }>;

/**
 * Pose ou retire le rôle d'Ambassadeur d'un joueur déjà verrouillé par l'appelant (fiche d'un joueur dans l'admin,
 * proposition acceptée du parrainage), dans sa transaction. Renvoie l'avant et l'après pour le journal de l'équipe.
 */
export async function setAmbassadorInTx(tx: Tx, user: AmbassadorUser, ambassador: boolean, ctx: { actorId: string; now: Date }) {
  const { now } = ctx;
  const was = user.ambassadorSince !== null;
  // Stock arrêté avec le max en vigueur avant le changement : un joueur plein à 10 repart de
  // maintenant vers 15 (pas d'un coup depuis sa vieille ancre), un retrait garde ce qui est acquis.
  const stock = computeStock(user.boosterStock, user.boosterAnchor, now, stockRulesFor(await stockSettings(tx), was));
  const since = ambassador ? (user.ambassadorSince ?? now) : null;
  // Un cosmétique porté le reste même s'il se reverrouille : ceux du rôle s'enlèvent avec lui
  const reserved = ambassador ? [] : (await tx.cosmetic.findMany({
    where: { id: { in: [user.titleId, user.frameId, user.nameColorId].filter((id): id is string => id !== null) }, condition: { path: ["type"], equals: "AMBASSADOR" } },
    select: { id: true },
  })).map((c) => c.id);
  const before = { ambassador: was, boosterStock: user.boosterStock, boosterAnchor: user.boosterAnchor };
  const after = { ambassador, boosterStock: stock.stock, boosterAnchor: stock.anchor, ...(reserved.length ? { removedCosmetics: reserved } : {}) };
  await tx.user.update({ where: { id: user.id }, data: {
    ambassadorSince: since,
    boosterStock: stock.stock,
    boosterAnchor: stock.anchor,
    ...(user.titleId && reserved.includes(user.titleId) ? { titleId: null } : {}),
    ...(user.frameId && reserved.includes(user.frameId) ? { frameId: null } : {}),
    ...(user.nameColorId && reserved.includes(user.nameColorId) ? { nameColorId: null } : {}),
  } });
  if (ambassador && !was) await notify(tx, { userId: user.id, type: "AMBASSADOR_GRANTED", actorId: ctx.actorId, now });
  return { before, after };
}

export async function mutateAdminUserWith(db: PrismaClient, adminId: string, input: AdminUserMutation, onNotified?: OnNotified) {
  await mutateUnderLock(db, adminId, input, onNotified);
  // Bannissement : ses tables de pile ou face se ferment après coup (verrou des tables avant celui des joueurs).
  // Entre-temps, un joueur banni ne pose plus et ses tables ne se relèvent plus.
  if (input.kind === "account" && input.banned) {
    const now = new Date();
    await withdrawCasinoFor(db, input.userId, now, onNotified);
    await withdrawMarketFor(db, { userId: input.userId, adminId, now }, onNotified);
  }
}

async function mutateUnderLock(db: PrismaClient, adminId: string, input: AdminUserMutation, onNotified?: OnNotified) {
  return notifyingTransaction(db, async (tx) => {
    await lockPlayers(tx, [adminId, input.userId]);
    // Le rôle est revérifié sous verrou : une session ouverte ne conserve pas les droits retirés.
    const actor = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, bannedAt: true } });
    if (!actor || actor.role !== "ADMIN" || actor.bannedAt) throw new AdminUserMutationError("FORBIDDEN");
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: {
      id: true, username: true, role: true, bannedAt: true, profileVisibility: true, showCollection: true,
      coins: true, boosterStock: true, boosterAnchor: true, rankPoints: true, pityCount: true, standardCount: true, bannerPity: true,
      ambassadorSince: true, titleId: true, frameId: true, nameColorId: true, leaderboardHiddenAt: true, leaderboardMalus: true, leaderboardMythicMalus: true,
      incenseUsed: true, incenseBonus: true,
    } });
    if (!user) throw new AdminUserMutationError("NOT_FOUND");
    const userId = user.id;
    const now = new Date();
    let before: unknown;
    let after: unknown;

    const adjust = (current: number, mode: "SET" | "ADD" | "REMOVE", amount: number) => {
      try { return adjustedValue(current, mode, amount); }
      catch (e) { throw new AdminUserMutationError(e instanceof Error && e.message === "LIMIT" ? "LIMIT" : "INSUFFICIENT"); }
    };

    switch (input.kind) {
      case "account": {
        if (userId === adminId && (input.banned || input.role !== "ADMIN")) throw new AdminUserMutationError("SELF_PROTECTED");
        // Nouveau pseudo vérifié sous son verrou (casse ignorée), comme l'inscription et le changement par le joueur
        if (input.username !== user.username) await lockUsername(tx, input.username);
        const taken = await tx.user.findFirst({ where: { username: { equals: input.username, mode: "insensitive" }, id: { not: userId } }, select: { id: true } });
        if (taken) throw new AdminUserMutationError("USERNAME_TAKEN");
        before = { username: user.username, role: user.role, banned: !!user.bannedAt, profileVisibility: user.profileVisibility, showCollection: user.showCollection };
        after = { username: input.username, role: input.role, banned: input.banned, profileVisibility: input.profileVisibility, showCollection: input.showCollection };
        await tx.user.update({ where: { id: userId }, data: {
          username: input.username, role: input.role, profileVisibility: input.profileVisibility, showCollection: input.showCollection,
          ...(input.banned ? {} : { bannedAt: null }),
        } });
        if (input.banned) await banAccountWith(tx, userId, now);
        // Ban levé : le rôle Discord « vérifié » revient dans la minute
        else if (user.bannedAt) await requeueLinkedDiscordRoleWith(tx, userId, now);
        break;
      }
      case "coins": {
        const coins = adjust(user.coins, input.mode, input.amount);
        before = { coins: user.coins };
        after = { coins };
        let delta = coins - user.coins;
        const entries: LedgerEntry[] = [];
        // Un solde absolu peut dépasser le plafond d'un mouvement ; chaque ligne reste bornée.
        while (delta !== 0) {
          const amount = Math.sign(delta) * Math.min(Math.abs(delta), MAX_MOVEMENT);
          entries.push({ amount, reason: "ADMIN", refId: adminId });
          delta -= amount;
        }
        if (entries.length) await applyEntries(tx, userId, entries, now);
        break;
      }
      case "stat": {
        before = { [input.field]: user[input.field] };
        after = { [input.field]: input.value };
        if (input.field === "boosterStock") {
          before = { boosterStock: user.boosterStock, boosterAnchor: user.boosterAnchor };
          after = { boosterStock: input.value, boosterAnchor: now };
        }
        await tx.user.update({ where: { id: userId }, data: {
          [input.field]: input.value,
          ...(input.field === "boosterStock" ? { boosterAnchor: now } : {}),
        } });
        break;
      }
      case "booster":
      case "bannerPity": {
        const type = await tx.boosterType.findUnique({ where: { id: input.boosterTypeId }, select: { kind: true } });
        if (!type) throw new AdminUserMutationError("NOT_FOUND");
        if (input.kind === "booster" && type.kind === "DROP") {
          // Sachets scellés : une ligne par sachet non ouvert ; ceux de l'équipe ne s'offrent pas
          const unopened = await tx.sealedDrop.findMany({
            where: { ownerId: userId, boosterTypeId: input.boosterTypeId, openedAt: null },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
          });
          const count = adjust(unopened.length, input.mode, input.amount);
          // Une ligne par sachet : au plus MAX_ADMIN_QUANTITY créés d'un coup, comme un ajout. Un « Définir » à
          // plusieurs millions (faute de frappe) remplissait la mémoire du processus sous le verrou des deux comptes.
          if (count - unopened.length > MAX_ADMIN_QUANTITY) throw new AdminUserMutationError("LIMIT");
          before = { boosterTypeId: input.boosterTypeId, sealed: unopened.length };
          after = { boosterTypeId: input.boosterTypeId, sealed: count };
          if (count > unopened.length) {
            await tx.sealedDrop.createMany({
              data: Array.from({ length: count - unopened.length }, () => ({ ownerId: userId, boosterTypeId: input.boosterTypeId, source: "ADMIN" as const, giftable: false, createdAt: now })),
            });
          } else if (count < unopened.length) {
            await tx.sealedDrop.deleteMany({ where: { id: { in: unopened.slice(0, unopened.length - count).map((d) => d.id) }, ownerId: userId, openedAt: null } });
          }
          if (input.mode === "ADD") {
            await giftFromTeam(tx, { kind: "BOOSTER", userId, adminId, boosterTypeId: input.boosterTypeId, quantity: input.amount, message: input.message, now });
          }
        } else if (input.kind === "bannerPity") {
          const pity = readBannerPity(user.bannerPity);
          before = { boosterTypeId: input.boosterTypeId, value: pity[input.boosterTypeId] ?? 0 };
          after = { boosterTypeId: input.boosterTypeId, value: input.value };
          await tx.user.update({ where: { id: userId }, data: { bannerPity: { ...pity, [input.boosterTypeId]: input.value } } });
        } else {
          const where = { userId_boosterTypeId: { userId, boosterTypeId: input.boosterTypeId } };
          const credit = await tx.boosterCredit.findUnique({ where, select: { count: true } });
          const count = adjust(credit?.count ?? 0, input.mode, input.amount);
          before = { boosterTypeId: input.boosterTypeId, count: credit?.count ?? 0 };
          after = { boosterTypeId: input.boosterTypeId, count };
          await tx.boosterCredit.upsert({ where, create: { userId, boosterTypeId: input.boosterTypeId, count }, update: { count } });
          if (input.mode === "ADD") {
            await giftFromTeam(tx, { kind: "BOOSTER", userId, adminId, boosterTypeId: input.boosterTypeId, quantity: input.amount, message: input.message, now });
          }
        }
        break;
      }
      case "incense": {
        // Les disponibles se recalculent sous le verrou du joueur (comme à l'activation) : on ne
        // touche qu'au bonus, les Encens gagnés en tirant restent calculés depuis BoosterOpening.
        const [pulled, step] = await Promise.all([cardsPulled(tx, userId), incenseCardStep(tx)]);
        const available = incenseAvailable(pulled, step, user.incenseUsed, user.incenseBonus);
        const target = adjust(available, input.mode, input.amount);
        const bonus = incenseBonusFor(pulled, step, user.incenseUsed, target);
        if (Math.abs(bonus) > MAX_ADMIN_VALUE) throw new AdminUserMutationError("LIMIT");
        before = { available, bonus: user.incenseBonus };
        after = { available: target, bonus };
        await tx.user.update({ where: { id: userId }, data: { incenseBonus: bonus } });
        if (input.mode === "ADD") {
          await giftFromTeam(tx, { kind: "INCENSE", userId, adminId, quantity: input.amount, message: input.message, now });
        }
        break;
      }
      case "card": {
        const card = await tx.card.findUnique({ where: { id: input.cardId, status: { not: "DRAFT" } }, select: { id: true, rarity: true } });
        if (!card) throw new AdminUserMutationError("NOT_FOUND");
        const heritage = input.mode === "ADD" ? (input.heritage ?? 0) : 0;
        const engraving = input.mode === "ADD" ? (input.engraving ?? null) : null;
        if (heritage > 0 && heritage > await heritageCapIn(tx)) throw new AdminUserMutationError("LIMIT");
        const copies = await tx.userCard.count({ where: { ownerId: userId, cardId: input.cardId } });
        before = { cardId: input.cardId, copies };
        let editions: Edition[] = [];
        if (input.mode === "ADD") {
          // Numéros pris sous le verrou du compteur du tirage, comme à l'ouverture d'un booster
          if (engraving) editions = await engraveFor(tx, { id: card.id, rarity: card.rarity }, engraving, input.amount);
          // Identifiants choisis ici : un exemplaire spécial (héritier ou gravé) ouvre sa provenance dans la même transaction
          const ids = Array.from({ length: input.amount }, () => randomUUID());
          await tx.userCard.createMany({ data: ids.map((id, i) => ({
            id, ownerId: userId, cardId: input.cardId, obtainedAt: now, heritage,
            ...(editions[i] ? { printing: editions[i].printing, serial: editions[i].serial } : {}),
          })) });
          if (heritage > 0 || engraving) {
            await tx.userCardOwner.createMany({ data: ids.map((id) => ({ userCardId: id, ownerId: userId, via: "GIFT" as const, at: now })) });
          }
          await recordDiscoveries(tx, [{ userId, cardId: input.cardId }], now);
          await consumeWishlist(tx, userId, [input.cardId]);
          await giftFromTeam(tx, { kind: "CARD", userId, adminId, cardId: input.cardId, quantity: input.amount, message: input.message, now });
        } else {
          // On conserve les exemplaires en vitrine, en combat (BATTLE), misés au casino (CASINO), en vente ou liés à l'historique d'une vente,
          // et toujours les pièces spéciales (héritières ou gravées) : un retrait en nombre ne les emporte jamais.
          const free = await tx.userCard.findMany({ where: {
            ownerId: userId, cardId: input.cardId, status: "COLLECTION", ...ORDINARY_COPY, showcaseItems: { none: {} }, auctions: { none: {} },
          }, orderBy: [{ obtainedAt: "desc" }, { id: "desc" }], take: input.amount, select: { id: true } });
          if (free.length !== input.amount) throw new AdminUserMutationError("CARDS_LOCKED");
          // Conditionnel sur le statut, comme tout retrait d'exemplaire (transfer-guard.test.ts) : un exemplaire engagé
          // entre la lecture et l'écriture n'est jamais supprimé, et le journal ne compte pas un retrait qui n'a pas eu lieu
          const removed = await tx.userCard.deleteMany({ where: { id: { in: free.map((c) => c.id) }, ownerId: userId, status: "COLLECTION" } });
          if (removed.count !== free.length) throw new AdminUserMutationError("CARDS_LOCKED");
        }
        after = {
          cardId: input.cardId, copies: copies + (input.mode === "ADD" ? input.amount : -input.amount),
          ...(heritage > 0 ? { heritage } : {}),
          ...(editions.length > 0 ? { editions: editions.map((e) => ({ printing: e.printing, serial: e.serial })) } : {}),
        };
        break;
      }
      case "copyHeritage": {
        // L'exemplaire doit être au joueur : sous son verrou, aucun transfert ne peut le déplacer entre-temps
        const copy = await tx.userCard.findFirst({
          where: { id: input.userCardId, ownerId: userId },
          select: { id: true, cardId: true, heritage: true, keptByOwner: true, printing: true },
        });
        if (!copy) throw new AdminUserMutationError("NOT_FOUND");
        if (input.heritage > await heritageCapIn(tx)) throw new AdminUserMutationError("LIMIT");
        // Sans héritage, plus de prestige « gardé par son propriétaire » (CHECK UserCard_heritage_check)
        const keptByOwner = input.heritage === 0 ? 0 : copy.keptByOwner;
        before = { userCardId: copy.id, cardId: copy.cardId, heritage: copy.heritage, keptByOwner: copy.keptByOwner };
        after = { userCardId: copy.id, cardId: copy.cardId, heritage: input.heritage, keptByOwner };
        const { count } = await tx.userCard.updateMany({ where: { id: copy.id, ownerId: userId }, data: { heritage: input.heritage, keptByOwner } });
        if (count !== 1) throw new AdminUserMutationError("NOT_FOUND");
        if (copy.heritage === 0 && copy.printing === null && input.heritage > 0) await openProvenance(tx, copy.id, userId, now);
        break;
      }
      case "copyEngraving": {
        const copy = await tx.userCard.findFirst({
          where: { id: input.userCardId, ownerId: userId },
          select: { id: true, cardId: true, heritage: true, printing: true, serial: true, card: { select: { rarity: true } } },
        });
        if (!copy) throw new AdminUserMutationError("NOT_FOUND");
        const was = copy.printing !== null && copy.serial !== null ? { printing: copy.printing, serial: copy.serial } : null;
        // Même tirage et même numéro : rien à changer. Même tirage sans numéro choisi : un nouveau numéro au hasard.
        const same = input.engraving !== null && was !== null && input.engraving.printing === was.printing && input.engraving.serial === was.serial;
        let next = input.engraving === null ? null : was;
        if (input.engraving && !same) {
          const [edition] = await engraveFor(tx, { id: copy.cardId, rarity: copy.card.rarity }, input.engraving, 1);
          next = { printing: edition.printing, serial: edition.serial };
        }
        before = { userCardId: copy.id, cardId: copy.cardId, engraving: was };
        after = { userCardId: copy.id, cardId: copy.cardId, engraving: next };
        if (next?.printing !== was?.printing || next?.serial !== was?.serial) {
          // L'ancien numéro reste sorti dans son tirage (cardprinting_forward_only) : il ne ressortira jamais
          const { count } = await tx.userCard.updateMany({ where: { id: copy.id, ownerId: userId }, data: { printing: next?.printing ?? null, serial: next?.serial ?? null } });
          if (count !== 1) throw new AdminUserMutationError("NOT_FOUND");
        }
        if (copy.heritage === 0 && was === null && next !== null) await openProvenance(tx, copy.id, userId, now);
        break;
      }
      case "discoveries": {
        const count = await tx.discovery.count({ where: { userId, card: { status: "PUBLISHED" } } });
        const total = await tx.card.count({ where: { status: "PUBLISHED" } });
        if (input.value > total) throw new AdminUserMutationError("LIMIT");
        before = { count };
        let added: { cardId: string }[] = [];
        let removed: { cardId: string }[] = [];
        if (input.value > count) {
          added = await tx.$queryRaw<{ cardId: string }[]>`
            INSERT INTO "Discovery" ("userId", "cardId", "createdAt")
            SELECT ${userId}, c.id, ${now} FROM "Card" c
            WHERE c.status = 'PUBLISHED' AND NOT EXISTS (
              SELECT 1 FROM "Discovery" d WHERE d."userId" = ${userId} AND d."cardId" = c.id
            ) ORDER BY c.rank ASC LIMIT ${input.value - count}
            ON CONFLICT DO NOTHING RETURNING "cardId"`;
        } else if (input.value < count) {
          removed = await tx.$queryRaw<{ cardId: string }[]>`
            DELETE FROM "Discovery" WHERE "userId" = ${userId} AND "cardId" IN (
              SELECT d."cardId" FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
              WHERE d."userId" = ${userId} AND c.status = 'PUBLISHED' AND NOT EXISTS (
                SELECT 1 FROM "UserCard" uc WHERE uc."ownerId" = ${userId} AND uc."cardId" = d."cardId"
              ) ORDER BY d."createdAt" DESC, d."cardId" ASC LIMIT ${count - input.value}
            ) RETURNING "cardId"`;
          if (removed.length !== count - input.value) throw new AdminUserMutationError("DISCOVERY_MIN");
        }
        after = {
          count: count + added.length - removed.length, added: added.length, removed: removed.length,
          addedCardIds: added.slice(0, LOGGED_DISCOVERY_IDS).map((c) => c.cardId),
          removedCardIds: removed.slice(0, LOGGED_DISCOVERY_IDS).map((c) => c.cardId),
        };
        break;
      }
      case "ambassador": {
        ({ before, after } = await setAmbassadorInTx(tx, user, input.ambassador, { actorId: adminId, now }));
        break;
      }
      case "leaderboard": {
        // Seul le classement des collectionneurs l'ignore : profil, collection et vitrine restent visibles
        before = { hidden: user.leaderboardHiddenAt !== null };
        after = { hidden: input.hidden };
        await tx.user.update({ where: { id: userId }, data: { leaderboardHiddenAt: input.hidden ? (user.leaderboardHiddenAt ?? now) : null } });
        break;
      }
      case "leaderboardMalus": {
        // Ne change que le total affiché dans le classement : la collection reste entière
        before = { malus: user.leaderboardMalus, mythicMalus: user.leaderboardMythicMalus };
        after = { malus: input.value, mythicMalus: input.mythics };
        await tx.user.update({ where: { id: userId }, data: { leaderboardMalus: input.value, leaderboardMythicMalus: input.mythics } });
        break;
      }
      case "sessions": {
        if (userId === adminId) throw new AdminUserMutationError("SELF_PROTECTED");
        const deleted = await tx.session.deleteMany({ where: { userId } });
        before = { sessions: deleted.count };
        after = { sessions: 0 };
        break;
      }
    }
    await writeAdminLog(tx, {
      adminId, action: `USER_${input.kind.toUpperCase()}`, targetType: "User", targetId: userId,
      before: json(before),
      after: json({ values: after, reason: input.reason, ...("message" in input && input.message ? { message: input.message } : {}) }),
    });
  }, { maxWait: 10_000, timeout: 20_000 }, onNotified);
}
