// Clôture de l'Ennichi (étape 18d), en deux temps depuis l'admin, sur le modèle de la fin de saison :
//   1. « Contrôler » : le score de chaque parrainage de la fête est recalculé, ceux qui dépassent le seuil passent
//      « À vérifier » (l'équipe tranche avant de tirer) ;
//   2. « Arrêter et tirer » : banzuke figé (amis arrivés pendant la fête et installés, hors parrainages bloqués ou
//      révoqués), tickets et cagnotte figés avec leur empreinte, graine révélée, omikuji tiré (lib/ennichi/omikuji.ts),
//      titres créés, prix inscrits ; puis chaque prix est versé une fois, dans sa propre transaction.
// Un cron de secours tire à la date de clôture si l'équipe ne l'a pas fait. Client injecté : serveur ou tests.
// La graine est scellée (server/ennichi/seed.ts) : la base n'en garde qu'un nonce jusqu'au tirage.
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { STAFF_ROLES } from "@/lib/admin/roles";
import type { DetectionScoring } from "@/lib/anticheat/scoring";
import { commitOf, seedHex } from "@/lib/casino/fairness";
import { drawOmikuji, ticketsHash, unfoldPool } from "@/lib/ennichi/omikuji";
import { ennichiPhase, ennichiSchedule, rankBand, rankRecruiters, type EnnichiRules, type EnnichiTitle } from "@/lib/ennichi/rules";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { writeAdminLog } from "../admin/log";
import type { LotDeps } from "../economy/lots";
import { applyHold } from "../referral/holds";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { grantPrizeInTx, readPrize } from "./prize";
import { editionSeed, ennichiSealedSeed } from "./seed";

type Db = PrismaClient | Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 60_000 };

export type EnnichiCloseErrorCode = "NOT_CLOSING" | "ALREADY_DRAWN" | "NO_SEED";
export class EnnichiCloseError extends Error {
  constructor(readonly code: EnnichiCloseErrorCode) {
    super(code);
    this.name = "EnnichiCloseError";
  }
}

/**
 * Graine de l'édition, engagée une fois (seule son empreinte est publiée) : la base ne garde que le nonce, la graine
 * se retrouve avec la clé du serveur (`seedKey`, dérivée d'AUTH_SECRET) et n'est écrite en clair qu'au tirage.
 */
export async function commitSeedWith(db: Db, edition: number, now: Date, seedKey: Uint8Array): Promise<{ seedHash: string; committedAt: Date }> {
  const nonce = seedHex(randomBytes(32));
  const hash = await commitOf(ennichiSealedSeed(seedKey, nonce));
  await db.$executeRaw`
    INSERT INTO "EnnichiDraw" (edition, "seedHash", "seedNonce", "committedAt") VALUES (${edition}, ${hash}, ${nonce}, ${now})
    ON CONFLICT (edition) DO NOTHING`;
  return db.ennichiDraw.findUniqueOrThrow({ where: { edition }, select: { seedHash: true, committedAt: true } });
}

/** Qui compte au banzuke et à l'omikuji : réglage ennichi.excludeStaff (comptes de l'équipe écartés ou non). */
export type FeteCount = { excludeStaff: boolean };

/**
 * Parrainages de la fête qui comptent (alias r, parrain u, filleul e) : ami arrivé pendant l'édition et installé avant
 * `until`, ni révoqué, ni bloqué sans décision ; parrain ni banni, ni gelé, ni anonymisé (ni de l'équipe si le réglage
 * l'écarte) ; filleul pas banni. Le même prédicat pour le banzuke, les tickets et leur compte.
 */
const feteReferralWhere = (edition: number, until: Date, count: FeteCount) => Prisma.sql`
  r."ennichiEdition" = ${edition} AND r."step2At" IS NOT NULL AND r."step2At" <= ${until}
  AND r."revokedAt" IS NULL AND r.status <> 'REVOKED' AND (r."heldAt" IS NULL OR r."reviewDecision" = 'VALIDATED')
  AND u."bannedAt" IS NULL AND u."deletionRequestedAt" IS NULL AND u."anonymizedAt" IS NULL AND e."bannedAt" IS NULL
  ${count.excludeStaff ? Prisma.sql`AND u.role::text NOT IN (${Prisma.join(STAFF_ROLES)})` : Prisma.empty}`;

export type RecruiterRow = { userId: string; name: string; count: number; reachedAt: Date };

/** Recruteurs de la fête : amis arrivés pendant l'édition et installés avant `until`, par parrain. */
export async function recruitersWith(db: Db, edition: number, until: Date, count: FeteCount): Promise<RecruiterRow[]> {
  return db.$queryRaw<RecruiterRow[]>`
    SELECT r."referrerId" AS "userId", u.username AS name, COUNT(*)::int AS count, MAX(r."step2At") AS "reachedAt"
    FROM "Referral" r
    JOIN "User" u ON u.id = r."referrerId"
    JOIN "User" e ON e.id = r."refereeId"
    WHERE ${feteReferralWhere(edition, until, count)}
    GROUP BY r."referrerId", u.username`;
}

/** Tickets de l'omikuji : un par ami arrivé pendant la fête et installé, dans l'ordre des installations. */
export async function ticketsWith(db: Db, edition: number, until: Date, count: FeteCount): Promise<{ userId: string; name: string }[]> {
  return db.$queryRaw<{ userId: string; name: string }[]>`
    SELECT r."referrerId" AS "userId", u.username AS name
    FROM "Referral" r
    JOIN "User" u ON u.id = r."referrerId"
    JOIN "User" e ON e.id = r."refereeId"
    WHERE ${feteReferralWhere(edition, until, count)}
    ORDER BY r."step2At" ASC, r.id ASC`;
}

/** Nombre de tickets en jeu (compté en base, sans lire la liste), d'un joueur seulement si `userId` est donné. */
export async function ticketCountWith(db: Db, edition: number, until: Date, count: FeteCount, userId?: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Referral" r
    JOIN "User" u ON u.id = r."referrerId"
    JOIN "User" e ON e.id = r."refereeId"
    WHERE ${feteReferralWhere(edition, until, count)} ${userId ? Prisma.sql`AND r."referrerId" = ${userId}` : Prisma.empty}`;
  return row?.n ?? 0;
}

/** Libellé public d'un ticket figé (« 12 · Léa »). */
export const ticketLabel = (n: number, name: string) => `${n} · ${name}`;

/** « Contrôler » : score de chaque parrainage de la fête recalculé ; au-dessus du seuil, « À vérifier ». */
export async function checkEnnichiWith(
  db: PrismaClient,
  input: { staffId: string; edition: number; now: Date; rules: Pick<ReferralV2Rules, "holdScore">; sharedCap: number; scoring?: DetectionScoring },
): Promise<{ checked: number; held: number }> {
  const referrals = await db.referral.findMany({
    where: { ennichiEdition: input.edition, revokedAt: null, reviewedAt: null, heldAt: null },
    select: { id: true, referrerId: true, refereeId: true },
  });
  let held = 0;
  for (const r of referrals) {
    const reason = await db.$transaction((tx) => applyHold(tx, r, input.rules, { withScore: true, sharedCap: input.sharedCap, scoring: input.scoring, now: input.now }), TX);
    if (reason) held++;
  }
  await db.$transaction(async (tx) => {
    await tx.ennichiDraw.update({ where: { edition: input.edition }, data: { checkedAt: input.now, checkedById: input.staffId }, select: { edition: true } });
    await writeAdminLog(tx, { adminId: input.staffId, action: "ENNICHI_CHECK", targetType: "Ennichi", targetId: String(input.edition), after: { checked: referrals.length, held } });
  }, TX);
  return { checked: referrals.length, held };
}

/**
 * Libellé et consigne d'un titre sumo créé au tirage, en français et en anglais (messages ennichi.cosmetic), d'après la
 * plage de rangs réglée qui le donne. Construit par le serveur (server/ennichi/deps.ts) ; les tests en passent un.
 */
export type TitleText = (title: EnnichiTitle, band: { from: number; to: number }, edition: number) => { label: { fr: string; en: string }; hint: { fr: string; en: string } };

/** Titres sumo gagnés, en cosmétiques (créés au tirage s'ils manquent), débloqués par le classement final. */
async function ensureTitles(tx: Prisma.TransactionClient, edition: number, ranks: EnnichiRules["ranks"], titles: readonly EnnichiTitle[], text: TitleText) {
  const unique = [...new Set(titles)];
  if (unique.length === 0) return;
  await tx.cosmetic.createMany({
    data: unique.map((title, i) => {
      // Plage de rangs réelle du titre (du premier rang de sa première ligne au dernier de sa dernière)
      const bands = ranks.filter((r) => r.title === title);
      const { label, hint } = text(title, { from: Math.min(...bands.map((b) => b.from)), to: Math.max(...bands.map((b) => b.to)) }, edition);
      return {
        kind: "TITLE" as const,
        slug: `ennichi-${edition}-${title}`,
        label,
        hint,
        condition: { type: "ENNICHI_TITLE", edition, title },
        sortOrder: 9_000 + edition * 10 + i,
      };
    }),
    skipDuplicates: true,
  });
}

export type DrawOutcome = { ranked: number; tickets: number; draws: number; awards: number };

/** Ce que le tirage reçoit du serveur : la clé des graines scellées et les textes des titres sumo. */
export type DrawSecrets = { seedKey: Uint8Array; titleText: TitleText };

/**
 * « Arrêter et tirer » (ou cron de secours, `staffId` null) : tout se fige dans une transaction, la ligne de l'édition
 * verrouillée ; un second appel trouve le tirage fait (ALREADY_DRAWN). Les prix sont ensuite versés par payAwardsWith.
 */
export async function drawEnnichiWith(
  db: PrismaClient,
  input: { staffId: string | null; rules: EnnichiRules; now: Date } & DrawSecrets,
): Promise<DrawOutcome> {
  const { rules, now } = input;
  const edition = rules.edition;
  return db.$transaction(async (tx) => {
    const [draw] = await tx.$queryRaw<{ seed: string | null; seedNonce: string | null; seedHash: string; drawnAt: Date | null }[]>`
      SELECT seed, "seedNonce", "seedHash", "drawnAt" FROM "EnnichiDraw" WHERE edition = ${edition} FOR UPDATE`;
    if (!draw) throw new EnnichiCloseError("NO_SEED");
    if (draw.drawnAt) throw new EnnichiCloseError("ALREADY_DRAWN");
    if (ennichiPhase(rules, now, null) !== "closing") throw new EnnichiCloseError("NOT_CLOSING");
    // Graine retrouvée avec la clé du serveur ; une graine qui ne redonne pas l'empreinte publiée (clé changée, copie
    // de la base avec un autre AUTH_SECRET) ne tire jamais : les joueurs ne pourraient pas vérifier le tirage
    const seed = editionSeed(draw, input.seedKey);
    if (!seed || (await commitOf(seed)) !== draw.seedHash) throw new Error(`Graine de l'Ennichi n° ${edition} illisible avec la clé du serveur`);

    // Comptés jusqu'à la clôture annoncée (« figé le … »), même si le tirage se fait après (cron de secours, retard)
    const schedule = ennichiSchedule(rules);
    const until = schedule && schedule.closesAt < now ? schedule.closesAt : now;
    const count = { excludeStaff: rules.excludeStaff };
    const ranked = rankRecruiters(await recruitersWith(tx, edition, until, count));
    const tickets = await ticketsWith(tx, edition, until, count);
    const labels = tickets.map((t, i) => ticketLabel(i + 1, t.name));
    const prizes = unfoldPool(rules.omikuji);
    const draws = await drawOmikuji(seed, tickets.length, prizes.length);

    await tx.ennichiDraw.update({
      where: { edition },
      data: {
        drawnAt: now,
        drawnById: input.staffId,
        // La graine est révélée avec les résultats (vérification du joueur)
        seed,
        ticketsHash: await ticketsHash(labels),
        tickets: labels,
        prizes: prizes.map(({ lotId, oneOfOne, line }) => ({ lotId, oneOfOne, line })),
        // Rangs figés : les pages de résultats ne suivent plus un réglage changé après le tirage
        ranks: rules.ranks.map((r) => ({ from: r.from, to: r.to, title: r.title, lotId: r.lotId, choiceVouchers: r.choiceVouchers, oneOfOne: r.oneOfOne })),
      },
      select: { edition: true },
    });
    if (ranked.length) {
      await tx.ennichiResult.createMany({
        data: ranked.map((r) => ({ edition, rank: r.rank, userId: r.userId, name: r.name, count: r.count, reachedAt: r.reachedAt, title: rankBand(r.rank, rules.ranks)?.title ?? null })),
      });
    }
    const awards = [
      ...ranked.flatMap((r) => {
        const band = rankBand(r.rank, rules.ranks);
        if (!band) return [];
        return [{ kind: "BANZUKE" as const, ref: r.rank, userId: r.userId, name: r.name, prize: { lotId: band.lotId, choiceVouchers: band.choiceVouchers, oneOfOne: band.oneOfOne, title: band.title } }];
      }),
      ...draws.map((d) => {
        const p = prizes[d.prize];
        const t = tickets[d.ticket];
        return { kind: "OMIKUJI" as const, ref: d.n, userId: t.userId, name: t.name, prize: { lotId: p.lotId, choiceVouchers: 0, oneOfOne: p.oneOfOne, line: p.line, ticket: d.ticket + 1 } };
      }),
    ];
    if (awards.length) await tx.ennichiAward.createMany({ data: awards.map((a) => ({ id: randomUUID(), edition, ...a, createdAt: now })) });
    await ensureTitles(tx, edition, rules.ranks, ranked.flatMap((r) => rankBand(r.rank, rules.ranks)?.title ?? []), input.titleText);
    if (input.staffId) {
      await writeAdminLog(tx, {
        adminId: input.staffId,
        action: "ENNICHI_DRAW",
        targetType: "Ennichi",
        targetId: String(edition),
        after: { ranked: ranked.length, tickets: tickets.length, draws: draws.length },
      });
    }
    return { ranked: ranked.length, tickets: tickets.length, draws: draws.length, awards: awards.length };
  }, TX);
}

/**
 * Verse les prix inscrits au tirage et pas encore versés (relancé sans risque : chaque prix est verrouillé puis marqué
 * versé dans sa transaction). Un compte supprimé ou banni entre-temps ne reçoit rien (marqué « skipped »).
 */
export async function payAwardsWith(
  db: PrismaClient,
  edition: number,
  deps: { lotDeps: LotDeps; now: Date; onNotified?: OnNotified; deadline?: number },
): Promise<{ paid: number; skipped: number; failed: number }> {
  const pending = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "EnnichiAward" WHERE edition = ${edition} AND granted = '{}'::jsonb ORDER BY kind, ref`;
  let paid = 0;
  let skipped = 0;
  let failed = 0;
  for (const { id } of pending) {
    if (deps.deadline && Date.now() > deps.deadline) break;
    // Un prix qui échoue (lot supprimé après le tirage, panne) est journalisé et passé : il ne bloque pas les prix
    // suivants, et reste à verser (granted vide) pour le passage suivant du cron
    try {
      const outcome = await payAward(db, edition, id, deps);
      if (outcome === "PAID") paid++;
      if (outcome === "SKIPPED") skipped++;
    } catch (e) {
      failed++;
      console.error("[ennichi] versement d'un prix impossible", { awardId: id }, e);
    }
  }
  return { paid, skipped, failed };
}

/** Un prix, dans sa transaction : le gagnant verrouillé, le prix versé et noté, la notification envoyée. */
function payAward(
  db: PrismaClient,
  edition: number,
  id: string,
  deps: { lotDeps: LotDeps; now: Date; onNotified?: OnNotified },
): Promise<"DONE" | "SKIPPED" | "PAID"> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const [award] = await tx.$queryRaw<{ kind: "BANZUKE" | "OMIKUJI"; ref: number; userId: string | null; prize: Prisma.JsonValue; granted: Prisma.JsonValue }[]>`
        SELECT kind::text AS kind, ref, "userId", prize, granted FROM "EnnichiAward" WHERE id = ${id} FOR UPDATE`;
      if (!award || (award.granted && typeof award.granted === "object" && Object.keys(award.granted).length > 0)) return "DONE" as const;
      const [user] = award.userId
        ? await tx.$queryRaw<{ bannedAt: Date | null }[]>`SELECT "bannedAt" FROM "User" WHERE id = ${award.userId} FOR UPDATE`
        : [];
      if (!award.userId || !user || user.bannedAt) {
        await tx.ennichiAward.update({ where: { id }, data: { granted: { skipped: award.userId ? "BANNED" : "DELETED", at: deps.now.toISOString() } }, select: { id: true } });
        return "SKIPPED" as const;
      }
      const granted = await grantPrizeInTx(tx, award.userId, readPrize(award.prize), { refId: id }, deps);
      await tx.ennichiAward.update({ where: { id }, data: { granted: granted as unknown as Prisma.InputJsonValue }, select: { id: true } });
      await notify(tx, {
        userId: award.userId,
        type: "ENNICHI_REWARD",
        actorId: award.userId,
        refId: id,
        payload:
          award.kind === "BANZUKE"
            ? { kind: "BANZUKE", edition, tier: null, rank: award.ref, draw: null }
            : { kind: "OMIKUJI", edition, tier: null, rank: null, draw: award.ref },
        now: deps.now,
      });
      return "PAID" as const;
    },
    TX,
    deps.onNotified,
  );
}
