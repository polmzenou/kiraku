// Recyclage atomique des doublons en Zeni. Le client Prisma est injecté (serveur ou test de
// concurrence) : pas de server/db.ts ici. Le serveur choisit les exemplaires et calcule le gain.
import type { PrismaClient } from "@/generated/prisma/client";
import { type Rarity } from "@/lib/catalog/rarity";
import { planRecycle, type RecyclePlan, type RecycleValues } from "@/lib/collection/recycle";
import { credit } from "../economy/ledger";

export type RecycleErrorCode = "NO_USER" | "BANNED" | "NOTHING" | "STALE";

export class RecycleError extends Error {
  constructor(readonly code: RecycleErrorCode) {
    super(code);
  }
}

export type RecycleRequest =
  /** Depuis la fiche : `count` doublons d'une carte. */
  | { kind: "card"; cardId: string; count: number }
  /** Tous les doublons jusqu'à `maxRarity` ; `expected` = gain affiché dans le récap. */
  | { kind: "all"; maxRarity: Rarity; expected: number };

export type RecycleOutcome = {
  recycled: number;
  gain: number;
  coins: number;
  byRarity: RecyclePlan["byRarity"];
};

// Au-delà de quelques milliers d'ids, une seule requête dépasserait la limite de paramètres de Postgres
const DELETE_CHUNK = 5_000;

export async function recycleWith(
  db: PrismaClient,
  userId: string,
  request: RecycleRequest,
  values: RecycleValues,
): Promise<RecycleOutcome> {
  return db.$transaction(
    async (tx) => {
      // Verrou sur la ligne du joueur : recyclages, vitrine et ouvertures passent l'un après l'autre
      const [user] = await tx.$queryRaw<{ bannedAt: Date | null }[]>`
        SELECT "bannedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user) throw new RecycleError("NO_USER");
      if (user.bannedAt) throw new RecycleError("BANNED");

      const RARITIES = (await tx.rarityDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }], select: { key: true } })).map((r) => r.key);
      const allowed = request.kind === "all" ? RARITIES.slice(0, RARITIES.indexOf(request.maxRarity) + 1) : RARITIES;
      const [copies, showcase] = await Promise.all([
        tx.userCard.findMany({
          where: {
            ownerId: userId,
            status: "COLLECTION",
            ...(request.kind === "card" ? { cardId: request.cardId } : { card: { rarity: { in: [...allowed] } } }),
          },
          select: { id: true, cardId: true, status: true, obtainedAt: true, card: { select: { rarity: true } } },
        }),
        tx.showcaseSlot.findMany({ where: { userId }, select: { userCardId: true } }),
      ]);

      const plan = planRecycle(
        copies.map((c) => ({ id: c.id, cardId: c.cardId, status: c.status, obtainedAt: c.obtainedAt, rarity: c.card.rarity as Rarity })),
        {
          values,
          rarities: RARITIES,
          protectedIds: new Set(showcase.map((s) => s.userCardId)),
          ...(request.kind === "all" ? { maxRarity: request.maxRarity } : { maxPerCard: request.count }),
        },
      );
      if (plan.ids.length === 0) throw new RecycleError("NOTHING");
      // L'écran du joueur n'est plus à jour : il doit revoir ce qu'il confirme
      if (request.kind === "card" && plan.ids.length !== request.count) throw new RecycleError("STALE");
      if (request.kind === "all" && plan.gain !== request.expected) throw new RecycleError("STALE");

      let deleted = 0;
      for (let i = 0; i < plan.ids.length; i += DELETE_CHUNK) {
        const ids = plan.ids.slice(i, i + DELETE_CHUNK);
        // Condition sur le statut : un exemplaire mis en vente entre-temps n'est jamais recyclé
        const res = await tx.userCard.deleteMany({ where: { id: { in: ids }, ownerId: userId, status: "COLLECTION" } });
        deleted += res.count;
      }
      if (deleted !== plan.ids.length) throw new RecycleError("STALE");

      const coins =
        plan.gain > 0
          ? await credit(tx, {
              userId,
              amount: plan.gain,
              reason: "DISSOLVE",
              refId: request.kind === "card" ? request.cardId : null,
            })
          : (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } })).coins;

      return { recycled: plan.ids.length, gain: plan.gain, coins, byRarity: plan.byRarity };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
