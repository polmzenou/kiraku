// Lectures brutes du Wrapped, en SQL balisé sur un client injecté : testées sur le vrai schéma (PGlite)
// par read.test.ts. Aucune écriture. server/wrapped/queries.ts les assemble en WrappedSummary.
import type { PrismaClient } from "@/generated/prisma/client";
import type { LedgerByReason } from "@/lib/wrapped/summary";

type Db = Pick<PrismaClient, "$queryRaw">;

/** Les sommes Postgres arrivent en bigint (Prisma) ou en texte (pilotes bruts) : toujours un nombre JS. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export type RawCard = { cardId: string; anilistId: number; name: string; rarity: string; imageUrl: string; spoiler: boolean };

export type WrappedRaw = {
  username: string | null;
  boosters: { opened: number; golden: number; divine: number; zeniSpent: number };
  bestPull: (RawCard & { at: Date }) | null;
  pulledByRarity: Record<string, number>;
  discoveries: number;
  ledger: LedgerByReason[];
  battles: { played: number; won: number; rankedPlayed: number; rankedWon: number; bestPc: number | null };
  topBattleCard: { cardId: string; battles: number } | null;
  showcaseCardId: string | null;
};

/** Tout ce que le Wrapped lit pour `userId` sur l'année [start, end). */
export async function readWrappedWith(db: Db, userId: string, start: Date, end: Date): Promise<WrappedRaw> {
  const [users, openings, best, rarities, discoveries, ledger, battles, topCard, showcase] = await Promise.all([
    db.$queryRaw<{ username: string }[]>`SELECT username FROM "User" WHERE id = ${userId}`,
    db.$queryRaw<{ opened: unknown; golden: unknown; divine: unknown; zeni: unknown }[]>`
      SELECT count(*) AS opened, count(*) FILTER (WHERE golden) AS golden, count(*) FILTER (WHERE divine) AS divine,
             COALESCE(sum("zeniSpent"), 0) AS zeni
      FROM "BoosterOpening" WHERE "userId" = ${userId} AND "createdAt" >= ${start} AND "createdAt" < ${end}`,
    // Plus gros tirage : rang de la rareté, une variante passe avant sa base, puis la plus ancienne
    db.$queryRaw<(RawCard & { at: Date })[]>`
      SELECT c.id AS "cardId", c."publicId" AS "anilistId", c.name, c."rarityKey" AS rarity, c."imageUrl", c.spoiler, o."createdAt" AS at
      FROM "BoosterOpening" o
      CROSS JOIN LATERAL unnest(o."catalogCardIds") AS pulled(card_id)
      JOIN "Card" c ON c.id = pulled.card_id
      JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
      WHERE o."userId" = ${userId} AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
      ORDER BY rd."sortOrder" DESC, rd."variantRequired" DESC, o."createdAt" ASC, c.id ASC
      LIMIT 1`,
    db.$queryRaw<{ rarity: string; n: unknown }[]>`
      SELECT c."rarityKey" AS rarity, count(*) AS n
      FROM "BoosterOpening" o
      CROSS JOIN LATERAL unnest(o."catalogCardIds") AS pulled(card_id)
      JOIN "Card" c ON c.id = pulled.card_id
      WHERE o."userId" = ${userId} AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
      GROUP BY c."rarityKey"`,
    db.$queryRaw<{ n: unknown }[]>`
      SELECT count(*) AS n FROM "Discovery" WHERE "userId" = ${userId} AND "createdAt" >= ${start} AND "createdAt" < ${end}`,
    db.$queryRaw<{ reason: string; gained: unknown; spent: unknown }[]>`
      SELECT reason::text AS reason,
             COALESCE(sum(amount) FILTER (WHERE amount > 0), 0) AS gained,
             COALESCE(-sum(amount) FILTER (WHERE amount < 0), 0) AS spent
      FROM "CoinTransaction" WHERE "userId" = ${userId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY reason`,
    // Camp du joueur : p1 ou p2 ; PC après la partie = PC avant + variation de son camp
    db.$queryRaw<{ played: unknown; won: unknown; rankedPlayed: unknown; rankedWon: unknown; bestPc: unknown }[]>`
      SELECT count(*) AS played,
             count(*) FILTER (WHERE (b."p1Id" = ${userId} AND b."winnerSide" = 0) OR (b."p2Id" = ${userId} AND b."winnerSide" = 1)) AS won,
             count(*) FILTER (WHERE b.mode = 'RANKED') AS "rankedPlayed",
             count(*) FILTER (WHERE b.mode = 'RANKED' AND ((b."p1Id" = ${userId} AND b."winnerSide" = 0) OR (b."p2Id" = ${userId} AND b."winnerSide" = 1))) AS "rankedWon",
             max(CASE WHEN b.mode = 'RANKED' THEN
               CASE WHEN b."p1Id" = ${userId} THEN b."pcBeforeP1" + b."pcDeltaP1" ELSE b."pcBeforeP2" + b."pcDeltaP2" END
             END) AS "bestPc"
      FROM "Battle" b
      WHERE b.status = 'FINISHED' AND (b."p1Id" = ${userId} OR b."p2Id" = ${userId})
        AND b."createdAt" >= ${start} AND b."createdAt" < ${end}`,
    // Carte la plus alignée : l'équipe du camp du joueur, exemplaire → carte (même vendu depuis)
    db.$queryRaw<{ cardId: string; battles: unknown }[]>`
      SELECT uc."cardId", count(*) AS battles
      FROM "Battle" b
      CROSS JOIN LATERAL unnest(CASE WHEN b."p1Id" = ${userId} THEN b."p1Team" ELSE b."p2Team" END) AS team(user_card_id)
      JOIN "UserCard" uc ON uc.id = team.user_card_id
      WHERE b.status = 'FINISHED' AND (b."p1Id" = ${userId} OR b."p2Id" = ${userId})
        AND b."createdAt" >= ${start} AND b."createdAt" < ${end}
      GROUP BY uc."cardId"
      ORDER BY battles DESC, uc."cardId" ASC
      LIMIT 1`,
    db.$queryRaw<{ cardId: string }[]>`
      SELECT uc."cardId"
      FROM "ShowcaseItem" si
      JOIN "Showcase" s ON s.id = si."showcaseId"
      JOIN "UserCard" uc ON uc.id = si."userCardId"
      WHERE s."userId" = ${userId}
      ORDER BY s."sortOrder" ASC, si.position ASC
      LIMIT 1`,
  ]);

  const o = openings[0];
  const b = battles[0];
  return {
    username: users[0]?.username ?? null,
    boosters: { opened: num(o?.opened), golden: num(o?.golden), divine: num(o?.divine), zeniSpent: num(o?.zeni) },
    bestPull: best[0] ? { ...best[0], anilistId: num(best[0].anilistId), at: new Date(best[0].at) } : null,
    pulledByRarity: Object.fromEntries(rarities.map((r) => [r.rarity, num(r.n)])),
    discoveries: num(discoveries[0]?.n),
    ledger: ledger.map((r) => ({ reason: r.reason, gained: num(r.gained), spent: num(r.spent) })),
    battles: {
      played: num(b?.played),
      won: num(b?.won),
      rankedPlayed: num(b?.rankedPlayed),
      rankedWon: num(b?.rankedWon),
      bestPc: b?.bestPc === null || b?.bestPc === undefined ? null : num(b.bestPc),
    },
    topBattleCard: topCard[0] ? { cardId: topCard[0].cardId, battles: num(topCard[0].battles) } : null,
    showcaseCardId: showcase[0]?.cardId ?? null,
  };
}

/** Fiche d'affichage d'une carte (carte préférée hors plus gros tirage). */
export async function readCardWith(db: Db, cardId: string): Promise<RawCard | null> {
  const [row] = await db.$queryRaw<RawCard[]>`
    SELECT id AS "cardId", "publicId" AS "anilistId", name, "rarityKey" AS rarity, "imageUrl", spoiler FROM "Card" WHERE id = ${cardId}`;
  return row ? { ...row, anilistId: num(row.anilistId) } : null;
}
