// Toutes les modifications d'un joueur et leur audit partagent une transaction et le verrou User.
// Client injecté pour vérifier ces opérations sans importer la connexion de production.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { adjustedValue, type AdminUserError, type AdminUserMutation } from "@/lib/admin/users";
import { MAX_MOVEMENT } from "@/lib/economy/amount";
import { applyEntries, type LedgerEntry } from "../economy/ledger";
import { readBannerPity } from "../boosters/open-core";
import { lockPlayers } from "../social/lock";

export class AdminUserMutationError extends Error {
  constructor(readonly code: AdminUserError) { super(code); }
}

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

export async function mutateAdminUserWith(db: PrismaClient, adminId: string, input: AdminUserMutation) {
  return db.$transaction(async (tx) => {
    await lockPlayers(tx, [adminId, input.userId]);
    // Le rôle est revérifié sous verrou : une session ouverte ne conserve pas les droits retirés.
    const actor = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, bannedAt: true } });
    if (!actor || actor.role !== "ADMIN" || actor.bannedAt) throw new AdminUserMutationError("FORBIDDEN");
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: {
      id: true, username: true, role: true, bannedAt: true, profileVisibility: true, showCollection: true,
      coins: true, boosterStock: true, boosterAnchor: true, rankPoints: true, pityCount: true, standardCount: true, bannerPity: true, battleTeam: true,
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
        if (!await tx.boosterType.findUnique({ where: { id: input.boosterTypeId }, select: { id: true } })) throw new AdminUserMutationError("NOT_FOUND");
        if (input.kind === "bannerPity") {
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
        }
        break;
      }
      case "card": {
        if (!await tx.card.findUnique({ where: { id: input.cardId }, select: { id: true } })) throw new AdminUserMutationError("NOT_FOUND");
        const copies = await tx.userCard.count({ where: { ownerId: userId, cardId: input.cardId } });
        before = { cardId: input.cardId, copies };
        if (input.mode === "ADD") {
          await tx.userCard.createMany({ data: Array.from({ length: input.amount }, () => ({ ownerId: userId, cardId: input.cardId, obtainedAt: now })) });
          await tx.discovery.createMany({ data: [{ userId, cardId: input.cardId, createdAt: now }], skipDuplicates: true });
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
        const count = await tx.discovery.count({ where: { userId, card: { rank: { not: null } } } });
        const total = await tx.card.count({ where: { rank: { not: null } } });
        if (input.value > total) throw new AdminUserMutationError("LIMIT");
        before = { count };
        let added: { cardId: string }[] = [];
        let removed: { cardId: string }[] = [];
        if (input.value > count) {
          added = await tx.$queryRaw<{ cardId: string }[]>`
            INSERT INTO "Discovery" ("userId", "cardId", "createdAt")
            SELECT ${userId}, c.id, ${now} FROM "Card" c
            WHERE c.rank IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM "Discovery" d WHERE d."userId" = ${userId} AND d."cardId" = c.id
            ) ORDER BY c.rank ASC LIMIT ${input.value - count}
            ON CONFLICT DO NOTHING RETURNING "cardId"`;
        } else if (input.value < count) {
          removed = await tx.$queryRaw<{ cardId: string }[]>`
            DELETE FROM "Discovery" WHERE "userId" = ${userId} AND "cardId" IN (
              SELECT d."cardId" FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
              WHERE d."userId" = ${userId} AND c.rank IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "UserCard" uc WHERE uc."ownerId" = ${userId} AND uc."cardId" = d."cardId"
              ) ORDER BY d."createdAt" DESC, d."cardId" ASC LIMIT ${count - input.value}
            ) RETURNING "cardId"`;
          if (removed.length !== count - input.value) throw new AdminUserMutationError("DISCOVERY_MIN");
        }
        after = { count: count + added.length - removed.length, addedCardIds: added.map((c) => c.cardId), removedCardIds: removed.map((c) => c.cardId) };
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
    await tx.adminLog.create({ data: {
      adminId, action: `USER_${input.kind.toUpperCase()}`, targetType: "User", targetId: userId,
      before: json(before), after: json({ values: after, reason: input.reason }),
    } });
  }, { maxWait: 10_000, timeout: 20_000 });
}
