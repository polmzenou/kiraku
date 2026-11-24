import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { evaluateSteps, INSTALL_OPENING_SOURCES, installCountFrom, stepWindow, type ActiveDay, type RefereeFacts } from "@/lib/referral/steps";
import type { Tx } from "../social/lock";
import { applyHold } from "./holds";
import { payDueRewardsWith, type PayoutDeps } from "./payout-core";

// Avancement d'un parrainage v2 : faits du filleul lus en SQL (ouvertures hors cadeau depuis le rattachement, jours
// actifs dans le fuseau du jeu), étapes posées une seule fois chacune par un updateMany conditionnel, contrôle de
// l'appareil commun, puis versement de tout ce qui est dû. Idempotent : lancé à l'ouverture d'un booster, à la
// vérification de l'e-mail, à la liaison Discord, à la visite de /parrainage et par le cron horaire.

export type ProgressDeps = PayoutDeps & { timeZone: string };

const DAY = 86_400_000;
const STEP_FIELDS = ["step1At", "step2At", "step3At", "step4At"] as const;

/** Faits du filleul pour evaluateSteps ; null si le compte n'existe plus. */
export async function refereeFactsWith(
  db: Tx | PrismaClient,
  referral: { refereeId: string; createdAt: Date },
  rules: Pick<ReferralV2Rules, "installOpenings" | "guestGraceHours" | "fideleWindowDays">,
  timeZone: string,
): Promise<RefereeFacts | null> {
  const user = await db.user.findUnique({
    where: { id: referral.refereeId },
    select: { registeredAt: true, emailVerified: true, discordLinkedAt: true },
  });
  if (!user) return null;
  const from = installCountFrom(referral.createdAt, rules);
  const sources = [...INSTALL_OPENING_SOURCES];
  const fidele = stepWindow(referral.createdAt, rules.fideleWindowDays, timeZone);
  const [[install], activeDays] = await Promise.all([
    db.$queryRaw<{ n: number; nth: Date | null }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "BoosterOpening"
          WHERE "userId" = ${referral.refereeId} AND source::text = ANY(${sources}::text[]) AND "createdAt" >= ${from}) AS n,
        (SELECT "createdAt" FROM "BoosterOpening"
          WHERE "userId" = ${referral.refereeId} AND source::text = ANY(${sources}::text[]) AND "createdAt" >= ${from}
          ORDER BY "createdAt" OFFSET ${rules.installOpenings - 1} LIMIT 1) AS nth`,
    // Un jour de marge avant le rattachement : la fenêtre commence au début du jour local du rattachement
    db.$queryRaw<ActiveDay[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day, MIN("createdAt") AS "firstAt"
      FROM "BoosterOpening"
      WHERE "userId" = ${referral.refereeId} AND "createdAt" >= ${new Date(referral.createdAt.getTime() - DAY)} AND "createdAt" < ${fidele.end}
      GROUP BY 1 ORDER BY 2`,
  ]);
  const verified = [user.emailVerified, user.discordLinkedAt].filter((d): d is Date => d !== null);
  return {
    referredAt: referral.createdAt,
    registeredAt: user.registeredAt,
    verifiedAt: verified.length ? new Date(Math.min(...verified.map((d) => d.getTime()))) : null,
    installOpenings: Number(install?.n ?? 0),
    installOpeningAt: install?.nth ?? null,
    activeDays,
  };
}

export type ProgressOutcome = { reached: number; paid: number };

/** Avance un parrainage v2 puis verse ce qui est dû. */
export async function progressReferralWith(db: PrismaClient, referralId: string, deps: ProgressDeps): Promise<ProgressOutcome> {
  const referral = await db.referral.findUnique({
    where: { id: referralId },
    select: {
      id: true,
      version: true,
      createdAt: true,
      referrerId: true,
      refereeId: true,
      step1At: true,
      step2At: true,
      step3At: true,
      step4At: true,
      heldAt: true,
      reviewedAt: true,
      revokedAt: true,
    },
  });
  if (!referral || referral.version !== 2 || referral.revokedAt) return { reached: 0, paid: 0 };
  const facts = await refereeFactsWith(db, referral, deps.rules, deps.timeZone);
  if (!facts) return { reached: 0, paid: 0 };

  // Dans l'ordre : la base exige l'étape précédente (sauf l'étape 4 après une étape 3 manquée)
  const times = evaluateSteps(facts, deps.rules, deps.timeZone, deps.now);
  let reached = 0;
  for (const [i, field] of STEP_FIELDS.entries()) {
    const at = times[i];
    if (!at || referral[field]) continue;
    const moved = await db.referral.updateMany({
      where: { id: referral.id, revokedAt: null, [field]: null } as Prisma.ReferralWhereInput,
      data: { [field]: at } as Prisma.ReferralUpdateManyMutationInput,
    });
    reached += moved.count;
  }

  // Appareil commun : « À vérifier » avant tout versement (le score, plus coûteux, attend les grosses récompenses)
  if (!referral.heldAt && !referral.reviewedAt) {
    await db.$transaction((tx) => applyHold(tx, referral, deps.rules, { withScore: false, sharedCap: deps.sharedCap, now: deps.now }));
  }
  const paid = await payDueRewardsWith(db, referral.id, deps);
  return { reached, paid };
}

/** Parrainages v2 en cours d'un joueur, parrain ou filleul (les plus récents d'abord). */
export async function openReferralIdsOf(db: PrismaClient, userId: string, take = 50): Promise<string[]> {
  const rows = await db.referral.findMany({
    where: { version: 2, revokedAt: null, OR: [{ refereeId: userId }, { referrerId: userId, step4At: null }] },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
