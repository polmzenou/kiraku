import "server-only";
import { ladderTier, LADDER } from "@/lib/ranked/rules";
import {
  earnedBadges,
  evaluateCondition,
  labelFor,
  orderedBadges,
  parseCondition,
  parseLabel,
  referencedSeries,
  type Badge,
  type ConditionProgress,
  type ProfileStats,
  discoveredPercent,
} from "@/lib/profile/conditions";
import { decorFromRelations, type PlayerDecor } from "@/lib/profile/decor";
import { isFrameStyle, type FrameStyle } from "@/lib/profile/frames";
import { isNameColorStyle, type NameColorStyle } from "@/lib/profile/name-colors";
import { getCatalogStats } from "../catalog/queries";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Progression du joueur vers les titres, cadres et couleurs de pseudo, badges dérivés, et ce que son profil affiche.

export type CosmeticOption = {
  id: string;
  kind: "TITLE" | "FRAME" | "NAME_COLOR";
  /** Libellé dans la langue du lecteur, pour chaque accord (l'aperçu suit le choix sans recharger). */
  labels: { MASC: string; FEM: string };
  hint: string;
  frameStyle: FrameStyle | null;
  nameColor: NameColorStyle | null;
  progress: ConditionProgress;
};

type Hint = { fr?: string; en?: string };

/** Statistiques utiles aux conditions, en quelques requêtes. */
export async function getProfileStats(userId: string, seriesIds: readonly string[]): Promise<ProfileStats> {
  const [byRarity, completed, series, boostersOpened, tradesDone, user, tiers, apocalypseRuined, discovered, catalog] = await Promise.all([
    prisma.$queryRaw<{ rarity: string; n: number }[]>`
      SELECT c."rarityKey" AS rarity, COUNT(DISTINCT uc."cardId")::int AS n
      FROM "UserCard" uc JOIN "Card" c ON c.id = uc."cardId"
      WHERE uc."ownerId" = ${userId}
      GROUP BY c."rarityKey"`,
    prisma.$queryRaw<{ id: string }[]>`
      WITH owned AS (SELECT DISTINCT "cardId" FROM "UserCard" WHERE "ownerId" = ${userId})
      SELECT c."seriesId" AS id
      FROM "Card" c LEFT JOIN owned o ON o."cardId" = c.id
      WHERE c.status = 'PUBLISHED'
      GROUP BY c."seriesId"
      HAVING COUNT(o."cardId") = COUNT(*) AND COUNT(*) > 0`,
    seriesIds.length === 0
      ? Promise.resolve([] as { id: string; owned: number; total: number }[])
      : prisma.$queryRaw<{ id: string; owned: number; total: number }[]>`
          WITH owned AS (SELECT DISTINCT "cardId" FROM "UserCard" WHERE "ownerId" = ${userId})
          SELECT c."seriesId" AS id, COUNT(o."cardId")::int AS owned, COUNT(*)::int AS total
          FROM "Card" c LEFT JOIN owned o ON o."cardId" = c.id
          WHERE c.status = 'PUBLISHED' AND c."seriesId" = ANY(${[...seriesIds]})
          GROUP BY c."seriesId"`,
    prisma.boosterOpening.count({ where: { userId } }),
    // Échanges réussis : entre amis et au Marché (annonce conclue ou offre acceptée)
    Promise.all([
      prisma.trade.count({ where: { status: "ACCEPTED", OR: [{ proposerId: userId }, { recipientId: userId }] } }),
      prisma.listingOffer.count({ where: { status: "ACCEPTED", OR: [{ bidderId: userId }, { listing: { ownerId: userId } }] } }),
    ]).then(([friends, market]) => friends + market),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rankPoints: true, seasonPeakPc: true, ambassadorSince: true } }),
    getSetting("ranked.tiers"),
    prisma.boosterOpening.count({ where: { userId, apocalypse: "RUINED" } }),
    // Cartes publiées découvertes (une découverte ne se perd pas, même si la carte est vendue)
    prisma.$queryRaw<{ rarity: string; n: number }[]>`
      SELECT c."rarityKey" AS rarity, COUNT(*)::int AS n
      FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
      WHERE d."userId" = ${userId} AND c.status = 'PUBLISHED'
      GROUP BY c."rarityKey"`,
    getCatalogStats(),
  ]);
  // Cartes distinctes : chaque carte a une seule rareté, la somme du décompte par rareté suffit (le
  // `distinct` de Prisma 7 s'applique en mémoire et chargeait tous les exemplaires du joueur)
  const unique = byRarity.reduce((sum, r) => sum + r.n, 0);
  // Meilleur des deux : un titre de rang ne se reperd pas après une défaite
  const tier = ladderTier(Math.max(user.rankPoints, user.seasonPeakPc), { tiers });
  return {
    uniqueCards: unique,
    byRarity: Object.fromEntries(byRarity.map((r) => [r.rarity, r.n])),
    completedSeries: new Set(completed.map((c) => c.id)),
    seriesProgress: Object.fromEntries(series.map((s) => [s.id, { owned: s.owned, total: s.total }])),
    boostersOpened,
    tradesDone,
    apocalypseRuined,
    tier: LADDER.includes(tier) ? tier : "BRONZE",
    discoveredPercent: discoveredPercent(
      discovered.reduce((sum, r) => sum + r.n, 0),
      catalog.total,
    ),
    discoveredByRarity: Object.fromEntries(discovered.map((r) => [r.rarity, r.n])),
    ambassador: user.ambassadorSince !== null,
  };
}

/** Titres, cadres et couleurs actifs, avec la progression du joueur vers chacun. */
export async function getCosmeticOptions(userId: string, locale: string): Promise<CosmeticOption[]> {
  return (await getCosmeticProgress(userId, locale)).options;
}

/** Les options et les statistiques qui les ont jugées (le sélecteur affiche le % découvert). */
export async function getCosmeticProgress(userId: string, locale: string): Promise<{ options: CosmeticOption[]; stats: ProfileStats }> {
  const rows = await prisma.cosmetic.findMany({
    where: { active: true },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { slug: "asc" }],
    select: { id: true, kind: true, label: true, hint: true, frameStyle: true, nameColor: true, condition: true },
  });
  const conditions = rows.map((r) => parseCondition(r.condition));
  const stats = await getProfileStats(userId, referencedSeries(conditions));
  const options = rows.map((r, i): CosmeticOption => {
    const hint = (r.hint ?? {}) as Hint;
    return {
      id: r.id,
      kind: r.kind,
      labels: { MASC: labelFor(parseLabel(r.label), locale, "MASC"), FEM: labelFor(parseLabel(r.label), locale, "FEM") },
      hint: (locale === "en" ? hint.en || hint.fr : hint.fr) ?? "",
      frameStyle: isFrameStyle(r.frameStyle) ? r.frameStyle : null,
      nameColor: isNameColorStyle(r.nameColor) ? r.nameColor : null,
      progress: evaluateCondition(conditions[i], stats),
    };
  });
  return { options, stats };
}

/** Badges obtenus par le joueur (ordre par défaut). */
export async function getEarnedBadges(user: { id: string; createdAt: Date; discordLinkedAt: Date | null; ambassadorSince: Date | null }): Promise<Badge[]> {
  const [pioneerUntil, sponsorReferrals, qualifiedReferrals] = await Promise.all([
    getSetting("profile.pioneerUntil"),
    getSetting("profile.sponsorReferrals"),
    prisma.referral.count({ where: { referrerId: user.id, qualifiedAt: { not: null } } }),
  ]);
  return earnedBadges({
    createdAt: user.createdAt,
    // Fin de la journée indiquée, heure de Paris approchée par UTC+1 : un inscrit du dernier jour reste pionnier
    pioneerUntil: pioneerUntil ? new Date(`${pioneerUntil}T23:59:59+01:00`) : null,
    ambassador: user.ambassadorSince !== null,
    qualifiedReferrals,
    sponsorReferrals,
    discordLinked: user.discordLinkedAt !== null,
  });
}

export type ProfileDecor = PlayerDecor & {
  bio: string | null;
  title: string | null;
  badges: Badge[];
};

/** Ce que l'en-tête d'un profil affiche : bio, titre accordé, cadre, couleur et badges dans l'ordre choisi. */
export async function getProfileDecor(userId: string, locale: string): Promise<ProfileDecor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      bio: true,
      titleAgreement: true,
      createdAt: true,
      discordLinkedAt: true,
      ambassadorSince: true,
      badgeOrder: true,
      title: { select: { label: true, active: true } },
      frame: { select: { frameStyle: true, active: true } },
      nameColor: { select: { nameColor: true, active: true } },
    },
  });
  const badges = orderedBadges(await getEarnedBadges(user), user.badgeOrder);
  return {
    bio: user.bio,
    title: user.title?.active ? labelFor(parseLabel(user.title.label), locale, user.titleAgreement) : null,
    ...decorFromRelations(user),
    badges,
  };
}
