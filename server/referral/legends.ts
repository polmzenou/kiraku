import "server-only";
import type { NamedPlayer } from "@/lib/collection/display-name";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { prisma } from "../db";
import { installedReferralWhere } from "./installed";

// Mur des légendes du parrainage v2 (maquette « Rouleau d'honneur ») : les joueurs qui ont atteint le palier qui l'inscrit
// (referral.v2.milestones, `legend`), dans l'ordre où ils l'ont atteint. Un palier repris (« Révoquer et bannir ») ou un
// compte banni n'y figure plus. Le pseudo s'affiche selon la visibilité du profil (publicNamesFor, côté page) : un
// profil privé reste anonyme pour les autres, comme au classement.

export type LegendEntry = { player: NamedPlayer; installed: number; at: Date };
export type LegendWall = {
  /** Amis installés qu'il faut pour être inscrit ; null si aucun palier n'inscrit au mur. */
  threshold: number | null;
  entries: LegendEntry[];
};

const MAX_ENTRIES = 200;

export async function legendWall(rules: ReferralV2Rules): Promise<LegendWall> {
  const rung = rules.milestones.find((m) => m.legend);
  if (!rung) return { threshold: null, entries: [] };
  const rewards = await prisma.referralReward.findMany({
    where: { kind: "MILESTONE", milestone: rung.installed, clawedBackAt: null, user: { bannedAt: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_ENTRIES,
    select: { createdAt: true, user: { select: { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true } } },
  });
  // Amis installés de chacun, comptés en une requête (même prédicat que les paliers)
  const ids = [...new Set(rewards.map((r) => r.user.id))];
  const counts = ids.length
    ? await prisma.referral.groupBy({ by: ["referrerId"], where: installedReferralWhere({ in: ids }), _count: { _all: true } })
    : [];
  const installedOf = new Map(counts.map((c) => [c.referrerId, c._count._all]));
  return {
    threshold: rung.installed,
    entries: rewards.map((r) => ({ player: r.user, installed: installedOf.get(r.user.id) ?? 0, at: r.createdAt })),
  };
}
