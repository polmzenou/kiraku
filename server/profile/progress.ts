import "server-only";
import { cache } from "react";
import type { Role } from "@/generated/prisma/client";
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
import { bestOfCycles, parsePeak } from "@/lib/prestige/peak";
import { isFrameStyle, type FrameStyle } from "@/lib/profile/frames";
import { isNameColorStyle, type NameColorStyle } from "@/lib/profile/name-colors";
import { getCatalogStats } from "../catalog/queries";
import { prisma } from "../db";
import { collectionStatsWith } from "../prestige/prestige-core";
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
  const [collection, series, boostersOpened, tradesDone, user, tiers, apocalypseRuined, discovered, catalog, prestigeCounts] = await Promise.all([
    collectionStatsWith(prisma, userId),
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
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rankPoints: true, seasonPeakPc: true, ambassadorSince: true, prestige: true } }),
    getSetting("ranked.tiers"),
    prisma.boosterOpening.count({ where: { userId, apocalypse: "RUINED" } }),
    // Cartes publiées découvertes (une découverte ne se perd pas, même si la carte est vendue)
    prisma.$queryRaw<{ rarity: string; n: number }[]>`
      SELECT c."rarityKey" AS rarity, COUNT(*)::int AS n
      FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
      WHERE d."userId" = ${userId} AND c.status = 'PUBLISHED'
      GROUP BY c."rarityKey"`,
    getCatalogStats(),
    prestigeCountsOf(userId),
  ]);
  // Un joueur reparti de zéro garde ce qu'il avait gagné lors d'un cycle passé, sans en gagner davantage. Les
  // conditions de découverte n'en ont pas besoin : une renaissance n'efface pas les découvertes du wiki.
  const peak = bestOfCycles({ ...collection, printingsOwned: prestigeCounts.printings }, prestigeCounts.snapshots);
  // Meilleur des deux : un titre de rang ne se reperd pas après une défaite
  const tier = ladderTier(Math.max(user.rankPoints, user.seasonPeakPc), { tiers });
  return {
    uniqueCards: peak.uniqueCards,
    byRarity: peak.byRarity,
    completedSeries: new Set(peak.completedSeries),
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
    prestige: user.prestige,
    consecrated: prestigeCounts.consecrated,
    printingsOwned: peak.printingsOwned,
  };
}

/**
 * Prestige du joueur pour les conditions et les badges : cartes au sanctuaire, éditions gravées (possédées ou
 * consacrées, ou le meilleur d'un cycle passé : celles recyclées à une renaissance restent acquises) et photos des
 * cycles passés.
 */
// Une fois par requête : l'en-tête du profil, la personnalisation et ses badges le demandent chacun
const prestigeCountsOf = cache(async (userId: string) => {
  const [[shrine], engraved, cycles] = await Promise.all([
    prisma.$queryRaw<{ consecrated: number; engraved: number }[]>`
      SELECT COUNT(*)::int AS consecrated, COUNT(printing)::int AS engraved FROM "ConsecratedCard" WHERE "userId" = ${userId}`,
    prisma.userCard.count({ where: { ownerId: userId, printing: { not: null } } }),
    prisma.prestigeCycle.findMany({ where: { userId }, select: { stats: true } }),
  ]);
  const snapshots = cycles.map((c) => c.stats);
  const printings = snapshots.reduce<number>((best, raw) => Math.max(best, parsePeak(raw)?.printingsOwned ?? 0), engraved + shrine.engraved);
  return { consecrated: shrine.consecrated, printings, snapshots };
});

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
export async function getEarnedBadges(user: { id: string; createdAt: Date; discordLinkedAt: Date | null; ambassadorSince: Date | null; role: Role; prestige: number }): Promise<Badge[]> {
  const [pioneerUntil, sponsorReferrals, recruiterReferrals, qualifiedReferrals, counts] = await Promise.all([
    getSetting("profile.pioneerUntil"),
    getSetting("profile.sponsorReferrals"),
    getSetting("profile.recruiterReferrals"),
    prisma.referral.count({ where: { referrerId: user.id, qualifiedAt: { not: null } } }),
    prestigeCountsOf(user.id),
  ]);
  return earnedBadges({
    createdAt: user.createdAt,
    // Fin de la journée indiquée, heure de Paris approchée par UTC+1 : un inscrit du dernier jour reste pionnier
    pioneerUntil: pioneerUntil ? new Date(`${pioneerUntil}T23:59:59+01:00`) : null,
    staff: user.role !== "USER",
    ambassador: user.ambassadorSince !== null,
    qualifiedReferrals,
    sponsorReferrals,
    recruiterReferrals,
    discordLinked: user.discordLinkedAt !== null,
    prestige: user.prestige,
    consecrated: counts.consecrated,
    engraved: counts.printings,
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
      role: true,
      badgeOrder: true,
      title: { select: { label: true, active: true } },
      frame: { select: { frameStyle: true, active: true } },
      nameColor: { select: { nameColor: true, active: true } },
      prestige: true,
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
