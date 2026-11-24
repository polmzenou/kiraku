// Rue des lanternes de l'Ennichi (étape 18d). Chaque ami arrivé pendant la fête pose une lanterne, qui s'allume quand il
// s'installe (étape 2) avant la clôture. Un palier atteint se fige (lot et bons du moment) puis son lot est versé tout
// seul à chaque joueur éligible : compte inscrit et vérifié, pas banni, au moins un booster ouvert pendant la fête, au
// plus `tierGrantsPerIp` comptes par IP. Envoi par lots mené par le cron, rattrapage à l'ouverture d'un booster ; la
// clé (édition, palier, joueur) empêche tout doublon entre les deux. Client injecté : serveur ou tests sur base.
import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { EnnichiRules, EnnichiSchedule } from "@/lib/ennichi/rules";
import type { LotDeps } from "../economy/lots";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { grantPrizeInTx } from "./prize";

type Db = PrismaClient | Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 };

/** Amis arrivés pendant la fête (lanternes posées) et installés avant `until` (allumées), hors parrainages révoqués. */
export async function lanternCountsWith(db: Db, edition: number, until: Date): Promise<{ placed: number; lit: number }> {
  const [row] = await db.$queryRaw<{ placed: number; lit: number }[]>`
    SELECT COUNT(*)::int AS placed,
           COUNT(*) FILTER (
             WHERE r."step2At" IS NOT NULL AND r."step2At" <= ${until} AND (r."heldAt" IS NULL OR r."reviewDecision" = 'VALIDATED')
           )::int AS lit
    FROM "Referral" r JOIN "User" e ON e.id = r."refereeId"
    WHERE r."ennichiEdition" = ${edition} AND r."revokedAt" IS NULL AND r.status <> 'REVOKED' AND e."bannedAt" IS NULL`;
  return row ?? { placed: 0, lit: 0 };
}

/** Fige les paliers que ces lanternes atteignent (une fois chacun) ; renvoie les paliers atteints à l'instant. */
export async function recordReachedTiersWith(db: Db, rules: Pick<EnnichiRules, "edition" | "tiers">, lit: number, now: Date): Promise<number[]> {
  const reached: number[] = [];
  for (const [tier, t] of rules.tiers.entries()) {
    if (lit < t.lanterns) continue;
    const inserted = await db.$executeRaw`
      INSERT INTO "EnnichiTierReached" (edition, tier, lanterns, "lotId", "choiceVouchers", "reachedAt")
      VALUES (${rules.edition}, ${tier}, ${t.lanterns}, ${t.lotId}, ${t.choiceVouchers}, ${now})
      ON CONFLICT (edition, tier) DO NOTHING`;
    if (inserted > 0) reached.push(tier);
  }
  return reached;
}

/** Empreinte de l'IP retenue pour la limite par IP (jamais l'IP elle-même dans la table des versements). */
const ipHashOf = (ip: string) => createHash("sha256").update(`ennichi-ip:${ip}`).digest("hex").slice(0, 32);

export type TierGrantOutcome = "GRANTED" | "ALREADY" | "INELIGIBLE" | "IP_LIMIT";

type GrantDeps = { lotDeps: LotDeps; now: Date; onNotified?: OnNotified };

/**
 * Verse le lot d'un palier atteint à un joueur, s'il est éligible : une transaction, le joueur verrouillé, la ligne
 * EnnichiTierGrant insérée (sa clé unique empêche tout doublon), le lot et les bons, puis la notification. Au-delà de
 * la limite par IP, une ligne « IP_LIMIT » est écrite sans lot : le joueur n'est plus reconsidéré pour ce palier.
 */
export async function grantTierWith(
  db: PrismaClient,
  input: { edition: number; tier: number; userId: string; schedule: EnnichiSchedule; perIp: number },
  deps: GrantDeps,
): Promise<TierGrantOutcome> {
  const { edition, tier, userId, schedule } = input;
  return notifyingTransaction(
    db,
    async (tx) => {
      const [reached] = await tx.$queryRaw<{ lotId: string | null; choiceVouchers: number }[]>`
        SELECT "lotId", "choiceVouchers" FROM "EnnichiTierReached" WHERE edition = ${edition} AND tier = ${tier}`;
      if (!reached) return "INELIGIBLE" as const;
      const [user] = await tx.$queryRaw<{ isGuest: boolean; bannedAt: Date | null; emailVerified: Date | null; discordLinkedAt: Date | null }[]>`
        SELECT "isGuest", "bannedAt", "emailVerified", "discordLinkedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user || user.isGuest || user.bannedAt || (user.emailVerified === null && user.discordLinkedAt === null)) return "INELIGIBLE" as const;
      const opened = await tx.boosterOpening.findFirst({
        where: { userId, createdAt: { gte: schedule.startsAt, lt: schedule.endsAt } },
        select: { id: true },
      });
      if (!opened) return "INELIGIBLE" as const;
      if (await tx.ennichiTierGrant.findUnique({ where: { edition_tier_userId: { edition, tier, userId } }, select: { id: true } })) return "ALREADY" as const;

      // IP la plus récente vue pendant la fête (sinon la dernière connue) : au plus `perIp` comptes servis par IP
      const ip = await tx.userSignal.findFirst({ where: { userId, kind: "IP" }, orderBy: { lastSeenAt: "desc" }, select: { value: true } });
      const ipHash = ip ? ipHashOf(ip.value) : null;
      let overLimit = false;
      if (ipHash) {
        // Deux versements de la même IP passent l'un après l'autre : le compte est juste
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ennichi:${edition}:${tier}:${ipHash}`}))`;
        // Seuls les comptes vraiment servis comptent (pas ceux déjà écartés par la limite)
        const [same] = await tx.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM "EnnichiTierGrant"
          WHERE edition = ${edition} AND tier = ${tier} AND "ipHash" = ${ipHash} AND NOT (granted ? 'skipped')`;
        overLimit = (same?.n ?? 0) >= input.perIp;
      }

      const id = randomUUID();
      const inserted = await tx.$executeRaw`
        INSERT INTO "EnnichiTierGrant" (id, edition, tier, "userId", "ipHash", granted, "createdAt")
        VALUES (${id}, ${edition}, ${tier}, ${userId}, ${ipHash}, ${overLimit ? '{"skipped":"IP_LIMIT"}' : "{}"}::jsonb, ${deps.now})
        ON CONFLICT (edition, tier, "userId") DO NOTHING`;
      if (inserted === 0) return "ALREADY" as const;
      if (overLimit) return "IP_LIMIT" as const;

      const granted = await grantPrizeInTx(tx, userId, { lotId: reached.lotId, choiceVouchers: reached.choiceVouchers, oneOfOne: false }, { refId: id }, deps);
      await tx.ennichiTierGrant.update({ where: { id }, data: { granted: granted as unknown as Prisma.InputJsonValue }, select: { id: true } });
      await tx.$executeRaw`UPDATE "EnnichiTierReached" SET served = served + 1 WHERE edition = ${edition} AND tier = ${tier}`;
      await notify(tx, { userId, type: "ENNICHI_REWARD", actorId: userId, refId: id, payload: { kind: "TIER", edition, tier, rank: null, draw: null }, now: deps.now });
      return "GRANTED" as const;
    },
    TX,
    deps.onNotified,
  );
}

/** Joueurs à servir pour un palier : éligibles d'après la base, pas encore servis, les plus anciens comptes d'abord. */
async function pendingUsers(db: Db, input: { edition: number; tier: number; schedule: EnnichiSchedule; take: number }): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u
    WHERE u."isGuest" = false AND u."bannedAt" IS NULL
      AND (u."emailVerified" IS NOT NULL OR u."discordLinkedAt" IS NOT NULL)
      AND EXISTS (
        SELECT 1 FROM "BoosterOpening" o
        WHERE o."userId" = u.id AND o."createdAt" >= ${input.schedule.startsAt} AND o."createdAt" < ${input.schedule.endsAt}
      )
      AND NOT EXISTS (SELECT 1 FROM "EnnichiTierGrant" g WHERE g.edition = ${input.edition} AND g.tier = ${input.tier} AND g."userId" = u.id)
    ORDER BY u."registeredAt" ASC NULLS LAST, u.id ASC
    LIMIT ${input.take}`;
  return rows.map((r) => r.id);
}

/**
 * Envoi d'un palier atteint, par lots, jusqu'à `deadline` : chaque joueur à servir reçoit son lot. Quand il n'en reste
 * plus, l'envoi est marqué fini (le rattrapage à l'ouverture d'un booster sert ensuite les nouveaux éligibles).
 */
export async function sendTierWith(
  db: PrismaClient,
  input: { edition: number; tier: number; schedule: EnnichiSchedule; perIp: number; deadline: number; batch?: number },
  deps: GrantDeps,
): Promise<{ granted: number; done: boolean }> {
  let granted = 0;
  for (;;) {
    const users = await pendingUsers(db, { edition: input.edition, tier: input.tier, schedule: input.schedule, take: input.batch ?? 100 });
    if (users.length === 0) {
      await db.ennichiTierReached.updateMany({ where: { edition: input.edition, tier: input.tier, finishedAt: null }, data: { finishedAt: deps.now } });
      return { granted, done: true };
    }
    let progressed = false;
    for (const userId of users) {
      if (Date.now() > input.deadline) return { granted, done: false };
      const outcome = await grantTierWith(db, { edition: input.edition, tier: input.tier, userId, schedule: input.schedule, perIp: input.perIp }, deps);
      if (outcome === "GRANTED") granted++;
      if (outcome !== "INELIGIBLE") progressed = true;
    }
    // Tous inéligibles sous verrou (devenus invités, bannis…) : on s'arrête pour ce passage
    if (!progressed) return { granted, done: false };
  }
}

/** Rattrapage d'un joueur (après l'ouverture d'un booster) : chaque palier déjà atteint, s'il ne l'a pas reçu. */
export async function catchUpTiersWith(
  db: PrismaClient,
  input: { edition: number; userId: string; schedule: EnnichiSchedule; perIp: number },
  deps: GrantDeps,
): Promise<number> {
  const reached = await db.ennichiTierReached.findMany({ where: { edition: input.edition }, select: { tier: true }, orderBy: { tier: "asc" } });
  let granted = 0;
  for (const { tier } of reached) {
    if (await db.ennichiTierGrant.findUnique({ where: { edition_tier_userId: { edition: input.edition, tier, userId: input.userId } }, select: { id: true } })) continue;
    if ((await grantTierWith(db, { ...input, tier }, deps)) === "GRANTED") granted++;
  }
  return granted;
}
