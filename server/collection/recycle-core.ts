// Recyclage atomique des doublons en Zeni. Le client Prisma est injecté (serveur ou test de
// concurrence) : pas de server/db.ts ici. Le serveur choisit les exemplaires et calcule le gain.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { compareRarities } from "@/lib/catalog/definitions";
import { type Rarity } from "@/lib/catalog/rarity";
import { COPY_MARKS, isSpecialCopy } from "@/lib/collection/copies";
import { copyRecycleValue, planRecycle, type RecyclePlan, type RecycleValues } from "@/lib/collection/recycle";
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
  | { kind: "all"; maxRarity: Rarity; expected: number }
  /** Un exemplaire spécial (héritier ou gravé), depuis sa ligne ; `expected` = gain affiché dans la confirmation. */
  | { kind: "copy"; userCardId: string; expected: number };

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
  /** Une gravée recyclée seule vaut ce multiple de sa rareté (prestige.printing.recycleMultiplier). */
  engravedMultiplier = 1,
): Promise<RecycleOutcome> {
  return db.$transaction(
    async (tx) => {
      // Verrou sur la ligne du joueur : recyclages, vitrine et ouvertures passent l'un après l'autre
      const [user] = await tx.$queryRaw<{ bannedAt: Date | null }[]>`
        SELECT "bannedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user) throw new RecycleError("NO_USER");
      if (request.kind === "copy") {
        if (user.bannedAt) throw new RecycleError("BANNED");
        return recycleCopyLocked(tx, userId, request, values, engravedMultiplier);
      }
      if (user.bannedAt) throw new RecycleError("BANNED");

      // Ordre du registre (compareRarities), celui de l'écran qui a calculé `expected` : à rang égal, la rareté de
      // base passe d'abord. Trié par clé, BR (500) passait avant Mythique (500) : « jusqu'à Mythique » prenait aussi
      // les BR, « jusqu'à BR » laissait les Mythiques, et le gain confirmé ne tombait jamais juste (STALE sans fin)
      const RARITIES = (await tx.rarityDefinition.findMany({ select: { key: true, sortOrder: true } })).sort(compareRarities).map((r) => r.key);
      const allowed = request.kind === "all" ? RARITIES.slice(0, RARITIES.indexOf(request.maxRarity) + 1) : RARITIES;
      const [copies, showcase] = await Promise.all([
        tx.userCard.findMany({
          where: {
            ownerId: userId,
            status: "COLLECTION",
            ...(request.kind === "card" ? { cardId: request.cardId } : { card: { rarity: { in: [...allowed] } } }),
          },
          select: { id: true, cardId: true, status: true, obtainedAt: true, ...COPY_MARKS, card: { select: { rarity: true } } },
        }),
        tx.showcaseItem.findMany({ where: { showcase: { userId } }, select: { userCardId: true } }),
      ]);

      // Les pièces spéciales (héritières ou gravées) ne partent jamais ici, et ne comptent pas comme l'exemplaire gardé
      const plan = planRecycle(
        copies.map((c) => ({ id: c.id, cardId: c.cardId, status: c.status, obtainedAt: c.obtainedAt, heritage: c.heritage, printing: c.printing, rarity: c.card.rarity as Rarity })),
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

/**
 * Recycle un exemplaire spécial désigné (héritier ou gravé) : il n'entre jamais dans le recyclage des doublons.
 * Un exemplaire ordinaire est refusé ici (NOTHING) : il passe par le recyclage des doublons, qui en garde un.
 */
async function recycleCopyLocked(
  tx: Prisma.TransactionClient,
  userId: string,
  request: Extract<RecycleRequest, { kind: "copy" }>,
  values: RecycleValues,
  engravedMultiplier: number,
): Promise<RecycleOutcome> {
  const copy = await tx.userCard.findFirst({
    where: { id: request.userCardId, ownerId: userId, status: "COLLECTION" },
    select: { id: true, cardId: true, heritage: true, printing: true, card: { select: { rarity: true } } },
  });
  if (!copy || !isSpecialCopy(copy)) throw new RecycleError("NOTHING");
  const rarity = copy.card.rarity as Rarity;
  const gain = copyRecycleValue({ rarity, printing: copy.printing }, values, engravedMultiplier);
  // L'écran du joueur n'est plus à jour (réglage changé entre-temps) : il doit revoir ce qu'il confirme
  if (gain !== request.expected) throw new RecycleError("STALE");
  const res = await tx.userCard.deleteMany({ where: { id: copy.id, ownerId: userId, status: "COLLECTION" } });
  if (res.count !== 1) throw new RecycleError("STALE");
  const coins =
    gain > 0
      ? await credit(tx, { userId, amount: gain, reason: "DISSOLVE", refId: copy.cardId })
      : (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } })).coins;
  const byRarity = { [rarity]: { copies: 1, zeni: gain } } as RecyclePlan["byRarity"];
  return { recycled: 1, gain, coins, byRarity };
}
