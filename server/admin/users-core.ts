// Toutes les modifications d'un joueur et leur audit partagent une transaction et le verrou User.
// Un ajout de cartes ou de boosters est un cadeau de l'équipe : ligne TeamGift (avec le mot de
// l'admin) et notification TEAM_GIFT dans la même transaction. Client injecté pour vérifier ces
// opérations sans importer la connexion de production.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { adjustedValue, type AdminUserError, type AdminUserMutation } from "@/lib/admin/users";
import { computeStock, stockRulesFor, type StockSettings } from "@/lib/boosters/stock";
import { MAX_MOVEMENT } from "@/lib/economy/amount";
import { parseSetting } from "@/lib/settings/defaults";
import { applyEntries, type LedgerEntry } from "../economy/ledger";
import { readBannerPity } from "../boosters/open-core";
import { lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { writeAdminLog } from "./log";
import { consumeWishlist } from "../collection/wishlist-core";

export class AdminUserMutationError extends Error {
  constructor(readonly code: AdminUserError) { super(code); }
}

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

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

/** Cadeau de l'équipe : le joueur est notifié, l'admin n'est jamais nommé. */
async function giftFromTeam(
  tx: Tx,
  gift: { userId: string; adminId: string; quantity: number; message: string | null; now: Date } & (
    | { kind: "CARD"; cardId: string }
    | { kind: "BOOSTER"; boosterTypeId: string }
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
        : { kind: "BOOSTER", boosterTypeId: gift.boosterTypeId, quantity: gift.quantity },
    now: gift.now,
  });
}

export async function mutateAdminUserWith(db: PrismaClient, adminId: string, input: AdminUserMutation, onNotified?: OnNotified) {
  return notifyingTransaction(db, async (tx) => {
    await lockPlayers(tx, [adminId, input.userId]);
    // Le rôle est revérifié sous verrou : une session ouverte ne conserve pas les droits retirés.
    const actor = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, bannedAt: true } });
    if (!actor || actor.role !== "ADMIN" || actor.bannedAt) throw new AdminUserMutationError("FORBIDDEN");
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: {
      id: true, username: true, role: true, bannedAt: true, profileVisibility: true, showCollection: true,
      coins: true, boosterStock: true, boosterAnchor: true, rankPoints: true, pityCount: true, standardCount: true, bannerPity: true, battleTeam: true,
      ambassadorSince: true, titleId: true, frameId: true, nameColorId: true,
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
        const taken = await tx.user.findFirst({ where: { username: { equals: input.username, mode: "insensitive" }, id: { not: userId } }, select: { id: true } });
        if (taken) throw new AdminUserMutationError("USERNAME_TAKEN");
        before = { username: user.username, role: user.role, banned: !!user.bannedAt, profileVisibility: user.profileVisibility, showCollection: user.showCollection };
        after = { username: input.username, role: input.role, banned: input.banned, profileVisibility: input.profileVisibility, showCollection: input.showCollection };
        await tx.user.update({ where: { id: userId }, data: {
          username: input.username, role: input.role, bannedAt: input.banned ? user.bannedAt ?? now : null,
          profileVisibility: input.profileVisibility, showCollection: input.showCollection,
        } });
        if (input.banned) await tx.session.deleteMany({ where: { userId } });
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
          before = { boosterTypeId: input.boosterTypeId, sealed: unopened.length };
          after = { boosterTypeId: input.boosterTypeId, sealed: count };
          if (count > unopened.length) {
            await tx.sealedDrop.createMany({
              data: Array.from({ length: count - unopened.length }, () => ({ ownerId: userId, boosterTypeId: input.boosterTypeId, source: "ADMIN" as const, giftable: false, createdAt: now })),
            });
          } else if (count < unopened.length) {
            await tx.sealedDrop.deleteMany({ where: { id: { in: unopened.slice(0, unopened.length - count).map((d) => d.id) }, openedAt: null } });
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
      case "card": {
        if (!await tx.card.findUnique({ where: { id: input.cardId, status: { not: "DRAFT" } }, select: { id: true } })) throw new AdminUserMutationError("NOT_FOUND");
        const copies = await tx.userCard.count({ where: { ownerId: userId, cardId: input.cardId } });
        before = { cardId: input.cardId, copies };
        if (input.mode === "ADD") {
          await tx.userCard.createMany({ data: Array.from({ length: input.amount }, () => ({ ownerId: userId, cardId: input.cardId, obtainedAt: now })) });
          await tx.discovery.createMany({ data: [{ userId, cardId: input.cardId, createdAt: now }], skipDuplicates: true });
          await consumeWishlist(tx, userId, [input.cardId]);
          await giftFromTeam(tx, { kind: "CARD", userId, adminId, cardId: input.cardId, quantity: input.amount, message: input.message, now });
        } else {
          // On conserve les exemplaires en vitrine, en combat (status BATTLE), en vente ou liés à l'historique d'une vente.
          const free = await tx.userCard.findMany({ where: {
            ownerId: userId, cardId: input.cardId, status: "COLLECTION", showcase: null, auctions: { none: {} },
          }, orderBy: [{ obtainedAt: "desc" }, { id: "desc" }], take: input.amount, select: { id: true } });
          if (free.length !== input.amount) throw new AdminUserMutationError("CARDS_LOCKED");
          await tx.userCard.deleteMany({ where: { id: { in: free.map((c) => c.id) }, ownerId: userId } });
        }
        after = { cardId: input.cardId, copies: copies + (input.mode === "ADD" ? input.amount : -input.amount) };
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
        after = { count: count + added.length - removed.length, addedCardIds: added.map((c) => c.cardId), removedCardIds: removed.map((c) => c.cardId) };
        break;
      }
      case "ambassador": {
        const was = user.ambassadorSince !== null;
        // Stock arrêté avec le max en vigueur avant le changement : un joueur plein à 10 repart de
        // maintenant vers 15 (pas d'un coup depuis sa vieille ancre), un retrait garde ce qui est acquis.
        const stock = computeStock(user.boosterStock, user.boosterAnchor, now, stockRulesFor(await stockSettings(tx), was));
        const since = input.ambassador ? (user.ambassadorSince ?? now) : null;
        // Un cosmétique porté le reste même s'il se reverrouille : ceux du rôle s'enlèvent avec lui
        const reserved = input.ambassador ? [] : (await tx.cosmetic.findMany({
          where: { id: { in: [user.titleId, user.frameId, user.nameColorId].filter((id): id is string => id !== null) }, condition: { path: ["type"], equals: "AMBASSADOR" } },
          select: { id: true },
        })).map((c) => c.id);
        before = { ambassador: was, boosterStock: user.boosterStock, boosterAnchor: user.boosterAnchor };
        after = { ambassador: input.ambassador, boosterStock: stock.stock, boosterAnchor: stock.anchor, ...(reserved.length ? { removedCosmetics: reserved } : {}) };
        await tx.user.update({ where: { id: userId }, data: {
          ambassadorSince: since,
          boosterStock: stock.stock,
          boosterAnchor: stock.anchor,
          ...(user.titleId && reserved.includes(user.titleId) ? { titleId: null } : {}),
          ...(user.frameId && reserved.includes(user.frameId) ? { frameId: null } : {}),
          ...(user.nameColorId && reserved.includes(user.nameColorId) ? { nameColorId: null } : {}),
        } });
        if (input.ambassador && !was) await notify(tx, { userId, type: "AMBASSADOR_GRANTED", actorId: adminId, now });
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
