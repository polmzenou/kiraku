// Clôture de l'Ennichi (étape 18d), en deux temps depuis l'admin, sur le modèle de la fin de saison :
//   1. « Contrôler » : le score de chaque parrainage de la fête est recalculé, ceux qui dépassent le seuil passent
//      « À vérifier » (l'équipe tranche avant de tirer) ;
//   2. « Arrêter et tirer » : banzuke figé (amis arrivés pendant la fête et installés, hors parrainages bloqués ou
//      révoqués), tickets et cagnotte figés avec leur empreinte, graine révélée, omikuji tiré (lib/ennichi/omikuji.ts),
//      titres créés, prix inscrits ; puis chaque prix est versé une fois, dans sa propre transaction.
// Un cron de secours tire à la date de clôture si l'équipe ne l'a pas fait. Client injecté : serveur ou tests.
import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { commitOf, seedHex } from "@/lib/casino/fairness";
import { drawOmikuji, ticketsHash } from "@/lib/ennichi/omikuji";
import { ennichiPhase, rankBand, rankRecruiters, type EnnichiRules, type EnnichiTitle } from "@/lib/ennichi/rules";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { writeAdminLog } from "../admin/log";
import type { LotDeps } from "../economy/lots";
import { applyHold } from "../referral/holds";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { grantPrizeInTx, readPrize } from "./prize";

type Db = PrismaClient | Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 60_000 };

export type EnnichiCloseErrorCode = "NOT_CLOSING" | "ALREADY_DRAWN" | "NO_SEED";
export class EnnichiCloseError extends Error {
  constructor(readonly code: EnnichiCloseErrorCode) {
    super(code);
    this.name = "EnnichiCloseError";
  }
}

/** Graine de l'édition, tirée et engagée une fois (seule son empreinte est publiée). */
export async function commitSeedWith(db: Db, edition: number, now: Date): Promise<{ seedHash: string; committedAt: Date }> {
  const seed = seedHex(randomBytes(32));
  const hash = await commitOf(seed);
  await db.$executeRaw`
    INSERT INTO "EnnichiDraw" (edition, "seedHash", seed, "committedAt") VALUES (${edition}, ${hash}, ${seed}, ${now})
    ON CONFLICT (edition) DO NOTHING`;
  return db.ennichiDraw.findUniqueOrThrow({ where: { edition }, select: { seedHash: true, committedAt: true } });
}

// Un parrainage de la fête compte s'il n'est ni révoqué, ni bloqué sans décision, et si aucun des deux comptes n'est
// banni (même prédicat dans les deux requêtes ci-dessous).

export type RecruiterRow = { userId: string; name: string; count: number; reachedAt: Date };

/** Recruteurs de la fête : amis arrivés pendant l'édition et installés avant `until`, par parrain (comptes non bannis). */
export async function recruitersWith(db: Db, edition: number, until: Date): Promise<RecruiterRow[]> {
  return db.$queryRaw<RecruiterRow[]>`
    SELECT r."referrerId" AS "userId", u.username AS name, COUNT(*)::int AS count, MAX(r."step2At") AS "reachedAt"
    FROM "Referral" r
    JOIN "User" u ON u.id = r."referrerId"
    JOIN "User" e ON e.id = r."refereeId"
    WHERE r."ennichiEdition" = ${edition} AND r."step2At" IS NOT NULL AND r."step2At" <= ${until}
      AND r."revokedAt" IS NULL AND r.status <> 'REVOKED' AND (r."heldAt" IS NULL OR r."reviewDecision" = 'VALIDATED')
      AND u."bannedAt" IS NULL AND e."bannedAt" IS NULL
    GROUP BY r."referrerId", u.username`;
}

/** Tickets de l'omikuji : un par ami arrivé pendant la fête et installé, dans l'ordre des installations. */
export async function ticketsWith(db: Db, edition: number, until: Date): Promise<{ userId: string; name: string }[]> {
  return db.$queryRaw<{ userId: string; name: string }[]>`
    SELECT r."referrerId" AS "userId", u.username AS name
    FROM "Referral" r
    JOIN "User" u ON u.id = r."referrerId"
    JOIN "User" e ON e.id = r."refereeId"
    WHERE r."ennichiEdition" = ${edition} AND r."step2At" IS NOT NULL AND r."step2At" <= ${until}
      AND r."revokedAt" IS NULL AND r.status <> 'REVOKED' AND (r."heldAt" IS NULL OR r."reviewDecision" = 'VALIDATED')
      AND u."bannedAt" IS NULL AND e."bannedAt" IS NULL
    ORDER BY r."step2At" ASC, r.id ASC`;
}

/** Libellé public d'un ticket figé (« 12 · Léa »). */
export const ticketLabel = (n: number, name: string) => `${n} · ${name}`;

/** Cagnotte dépliée dans l'ordre (le plus rare d'abord) ; une ligne sans lot ni carte 1/1 ne part pas. */
export function unfoldPool(pool: EnnichiRules["omikuji"]): { lotId: string | null; oneOfOne: boolean; line: number }[] {
  return pool.flatMap((p, line) => (p.oneOfOne || p.lotId ? Array.from({ length: Math.max(0, p.count) }, () => ({ lotId: p.lotId, oneOfOne: p.oneOfOne, line })) : []));
}

/** « Contrôler » : score de chaque parrainage de la fête recalculé ; au-dessus du seuil, « À vérifier ». */
export async function checkEnnichiWith(
  db: PrismaClient,
  input: { staffId: string; edition: number; now: Date; rules: Pick<ReferralV2Rules, "holdScore">; sharedCap: number },
): Promise<{ checked: number; held: number }> {
  const referrals = await db.referral.findMany({
    where: { ennichiEdition: input.edition, revokedAt: null, reviewedAt: null, heldAt: null },
    select: { id: true, referrerId: true, refereeId: true },
  });
  let held = 0;
  for (const r of referrals) {
    const reason = await db.$transaction((tx) => applyHold(tx, r, input.rules, { withScore: true, sharedCap: input.sharedCap, now: input.now }), TX);
    if (reason) held++;
  }
  await db.$transaction(async (tx) => {
    await tx.ennichiDraw.update({ where: { edition: input.edition }, data: { checkedAt: input.now, checkedById: input.staffId }, select: { edition: true } });
    await writeAdminLog(tx, { adminId: input.staffId, action: "ENNICHI_CHECK", targetType: "Ennichi", targetId: String(input.edition), after: { checked: referrals.length, held } });
  }, TX);
  return { checked: referrals.length, held };
}

const TITLE_LABEL: Record<EnnichiTitle, { fr: string; en: string; rank: { fr: string; en: string } }> = {
  yokozuna: { fr: "Yokozuna", en: "Yokozuna", rank: { fr: "1er", en: "1st" } },
  ozeki: { fr: "Ōzeki", en: "Ōzeki", rank: { fr: "2e ou 3e", en: "2nd or 3rd" } },
  sekiwake: { fr: "Sekiwake", en: "Sekiwake", rank: { fr: "4e à 10e", en: "4th to 10th" } },
};

/** Titres sumo de l'édition, en cosmétiques (créés au tirage s'ils manquent), débloqués par le classement final. */
async function ensureTitles(tx: Prisma.TransactionClient, edition: number, year: number, titles: readonly EnnichiTitle[]) {
  const unique = [...new Set(titles)];
  if (unique.length === 0) return;
  await tx.cosmetic.createMany({
    data: unique.map((title, i) => ({
      kind: "TITLE" as const,
      slug: `ennichi-${edition}-${title}`,
      label: { fr: `${TITLE_LABEL[title].fr} · Ennichi ${year}`, en: `${TITLE_LABEL[title].en} · Ennichi ${year}` },
      hint: { fr: `Finir ${TITLE_LABEL[title].rank.fr} au banzuke de l'Ennichi ${year}.`, en: `Finish ${TITLE_LABEL[title].rank.en} in the Ennichi ${year} banzuke.` },
      condition: { type: "ENNICHI_TITLE", edition, title },
      sortOrder: 9_000 + edition * 10 + i,
    })),
    skipDuplicates: true,
  });
}

export type DrawOutcome = { ranked: number; tickets: number; draws: number; awards: number };

/**
 * « Arrêter et tirer » (ou cron de secours, `staffId` null) : tout se fige dans une transaction, la ligne de l'édition
 * verrouillée ; un second appel trouve le tirage fait (ALREADY_DRAWN). Les prix sont ensuite versés par payAwardsWith.
 */
export async function drawEnnichiWith(
  db: PrismaClient,
  input: { staffId: string | null; rules: EnnichiRules; now: Date },
): Promise<DrawOutcome> {
  const { rules, now } = input;
  const edition = rules.edition;
  return db.$transaction(async (tx) => {
    const [draw] = await tx.$queryRaw<{ seed: string; drawnAt: Date | null }[]>`
      SELECT seed, "drawnAt" FROM "EnnichiDraw" WHERE edition = ${edition} FOR UPDATE`;
    if (!draw) throw new EnnichiCloseError("NO_SEED");
    if (draw.drawnAt) throw new EnnichiCloseError("ALREADY_DRAWN");
    if (ennichiPhase(rules, now, null) !== "closing") throw new EnnichiCloseError("NOT_CLOSING");

    const ranked = rankRecruiters(await recruitersWith(tx, edition, now));
    const tickets = await ticketsWith(tx, edition, now);
    const labels = tickets.map((t, i) => ticketLabel(i + 1, t.name));
    const prizes = unfoldPool(rules.omikuji);
    const draws = await drawOmikuji(draw.seed, tickets.length, prizes.length);

    await tx.ennichiDraw.update({
      where: { edition },
      data: {
        drawnAt: now,
        drawnById: input.staffId,
        ticketsHash: await ticketsHash(labels),
        tickets: labels,
        prizes: prizes.map(({ lotId, oneOfOne, line }) => ({ lotId, oneOfOne, line })),
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
    const year = new Date(rules.startsAt ?? now).getUTCFullYear();
    await ensureTitles(tx, edition, year, ranked.flatMap((r) => rankBand(r.rank, rules.ranks)?.title ?? []));
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
): Promise<{ paid: number; skipped: number }> {
  const pending = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "EnnichiAward" WHERE edition = ${edition} AND granted = '{}'::jsonb ORDER BY kind, ref`;
  let paid = 0;
  let skipped = 0;
  for (const { id } of pending) {
    if (deps.deadline && Date.now() > deps.deadline) break;
    const outcome = await notifyingTransaction(
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
    if (outcome === "PAID") paid++;
    if (outcome === "SKIPPED") skipped++;
  }
  return { paid, skipped };
}
